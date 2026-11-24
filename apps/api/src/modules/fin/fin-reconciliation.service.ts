import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CloseReconDto, CreateFromLineDto, ImportStatementDto, PeekStatementDto, ReconQueryDto, ReopenReconDto } from "./dto/fin-banking.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinLedgerService, FinPostLine, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { FinPaymentAccountsService, ledgerBalancePesewas } from "./fin-payment-accounts.service";
import { guessMapping, parseStatement, readGrid } from "./fin-statement-parser";

/** How many days apart a statement line and a ledger entry may be and still match automatically. */
export const MATCH_WINDOW_DAYS = 3;

export type LedgerCandidate = { id: string; entryId: string; date: string; reference: string; description: string; entryDescription: string; amount: number };
export type StatementLike = { date: string; description: string; reference: string | null };

const days = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000));
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !/^(from|payment|receipt|transfer|invoice|deposit|mobile|money|bank)$/.test(w)));

/**
 * How well a ledger entry fits a statement line. null = it cannot be the same transaction (outside the date window).
 * Amount equality is checked by the caller; this ranks the candidates that already have the right amount.
 */
export function scoreMatch(line: StatementLike, ledger: Pick<LedgerCandidate, "date" | "reference" | "description" | "entryDescription">, windowDays = MATCH_WINDOW_DAYS): number | null {
  const gap = days(line.date, ledger.date);
  if (gap > windowDays) return null;
  let score = 100 - gap * 10;
  const text = `${line.description} ${line.reference ?? ""}`.toLowerCase();
  const ours = `${ledger.description} ${ledger.entryDescription} ${ledger.reference}`.toLowerCase();
  // A document number from our books (INV-/RCT-/PAY-/TRF-...) appearing in the statement text is the strongest sign.
  for (const doc of ours.match(/[a-z]{2,5}-\d{4}-\d{3,}/g) ?? []) if (text.includes(doc)) score += 40;
  if (line.reference && line.reference.length >= 4 && ours.includes(line.reference.toLowerCase())) score += 30;
  const shared = [...words(text)].filter((w) => words(ours).has(w)).length;
  score += Math.min(shared, 3) * 5;
  return score;
}

type StmtRow = Awaited<ReturnType<PrismaService["finStatementLine"]["findFirstOrThrow"]>>;

@Injectable()
export class FinReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly ledger: FinLedgerService,
    private readonly accounts: FinPaymentAccountsService
  ) {}

  // ─── importing a statement ──────────────────────────────────────────────────

  /** First rows of the file plus a guess at the columns, so the mapping screen opens already filled in. */
  async peek(dto: PeekStatementDto) {
    const grid = await readGrid(dto);
    return { rows: grid.slice(0, 12), totalRows: grid.length, guess: guessMapping(grid[0] ?? []) };
  }

  async previewImport(companyId: string, dto: ImportStatementDto) {
    const pa = await this.requireAccount(this.prisma, companyId, dto.paymentAccountId);
    const parsed = parseStatement(await readGrid(dto), dto.mapping);
    const existing = await this.prisma.finStatementLine.findMany({ where: { paymentAccountId: pa.id, fingerprint: { in: parsed.lines.map((l) => l.fingerprint) } }, select: { fingerprint: true } });
    const dup = new Set(existing.map((e) => e.fingerprint));
    const fresh = parsed.lines.filter((l) => !dup.has(l.fingerprint));
    const dates = parsed.lines.map((l) => l.date).sort();
    return {
      account: pa.name,
      totalLines: parsed.lines.length,
      newLines: fresh.length,
      alreadyImported: parsed.lines.length - fresh.length,
      errors: parsed.errors,
      skippedBlank: parsed.skipped,
      moneyIn: pesewasToDecimal(fresh.filter((l) => l.amountPesewas > 0).reduce((s, l) => s + l.amountPesewas, 0)),
      moneyOut: pesewasToDecimal(Math.abs(fresh.filter((l) => l.amountPesewas < 0).reduce((s, l) => s + l.amountPesewas, 0))),
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      lastBalance: [...parsed.lines].reverse().find((l) => l.balancePesewas !== null)?.balancePesewas ?? null,
      sample: parsed.lines.slice(0, 15).map((l) => ({ lineNo: l.lineNo, date: l.date, description: l.description, reference: l.reference, amount: pesewasToDecimal(l.amountPesewas), isNew: !dup.has(l.fingerprint) })),
      canImport: fresh.length > 0 && (parsed.errors.length === 0 || dto.skipBadRows === true)
    };
  }

  async commitImport(companyId: string, userId: string, dto: ImportStatementDto, meta: RequestMeta) {
    const pa = await this.requireAccount(this.prisma, companyId, dto.paymentAccountId);
    const parsed = parseStatement(await readGrid(dto), dto.mapping);
    if (parsed.errors.length > 0 && !dto.skipBadRows) {
      throw new BadRequestException(`${parsed.errors.length} line${parsed.errors.length === 1 ? " cannot" : "s cannot"} be read, so nothing was imported. First problem: line ${parsed.errors[0].lineNo}: ${parsed.errors[0].message}`);
    }
    if (parsed.lines.length === 0) throw new BadRequestException("There are no statement lines to import.");
    const closing = dto.closingBalance === undefined || dto.closingBalance === null || dto.closingBalance === "" ? null : toPesewas(dto.closingBalance, "The closing balance");

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.finStatementLine.findMany({ where: { paymentAccountId: pa.id, fingerprint: { in: parsed.lines.map((l) => l.fingerprint) } }, select: { fingerprint: true } });
      const dup = new Set(existing.map((e) => e.fingerprint));
      const fresh = parsed.lines.filter((l) => !dup.has(l.fingerprint));
      const imp = await tx.finStatementImport.create({
        data: { companyId, paymentAccountId: pa.id, fileName: dto.fileName?.slice(0, 200), lineCount: parsed.lines.length, addedCount: fresh.length, skippedCount: parsed.lines.length - fresh.length, closingBalance: closing === null ? null : pesewasToDecimal(closing), createdById: userId }
      });
      if (fresh.length > 0) {
        await tx.finStatementLine.createMany({
          data: fresh.map((l) => ({
            companyId, paymentAccountId: pa.id, importId: imp.id, lineNo: l.lineNo, txnDate: parseDay(l.date), description: l.description, reference: l.reference, amount: pesewasToDecimal(l.amountPesewas),
            balance: l.balancePesewas === null ? null : pesewasToDecimal(l.balancePesewas), fingerprint: l.fingerprint
          })),
          skipDuplicates: true
        });
        // The first statement sets where reconciliation starts: earlier ledger movements are the opening position.
        if (!pa.reconcileFrom) {
          const first = fresh.map((l) => l.date).sort()[0];
          await tx.finPaymentAccount.update({ where: { id: pa.id }, data: { reconcileFrom: parseDay(first) } });
        }
      }
      await this.audit.write({ companyId, userId, area: "banking", action: "IMPORT_STATEMENT", entityType: "FinStatementImport", entityId: imp.id, summary: `Imported ${fresh.length} statement lines into "${pa.name}" (${parsed.lines.length - fresh.length} already there)`, after: { added: fresh.length, skipped: parsed.lines.length - fresh.length, file: dto.fileName ?? null }, ...meta }, tx);
      return { importId: imp.id, added: fresh.length, alreadyImported: parsed.lines.length - fresh.length, badLinesSkipped: parsed.errors.length };
    });
    const matched = await this.autoMatch(companyId, userId, pa.id, meta);
    return { ...result, autoMatched: matched.matched };
  }

  // ─── matching ───────────────────────────────────────────────────────────────

  /**
   * Pairs statement lines with ledger entries on the same account: same amount, close dates. It only commits a match when the
   * best candidate is clearly better than the rest. Anything ambiguous is left for a person.
   */
  async autoMatch(companyId: string, userId: string, paymentAccountId: string, meta: RequestMeta = {}) {
    const pa = await this.requireAccount(this.prisma, companyId, paymentAccountId);
    const lines = await this.prisma.finStatementLine.findMany({ where: { paymentAccountId, status: "UNMATCHED" }, orderBy: [{ txnDate: "asc" }, { lineNo: "asc" }] });
    if (lines.length === 0) return { matched: 0, ambiguous: 0 };
    const pool = await this.unmatchedLedger(this.prisma, companyId, pa);
    const used = new Set<string>();
    let matched = 0;
    let ambiguous = 0;

    for (const line of lines) {
      const amount = decimalToPesewas(line.amount);
      const ranked = pool
        .filter((c) => !used.has(c.id) && c.amount === amount)
        .map((c) => ({ c, score: scoreMatch({ date: dayString(line.txnDate), description: line.description, reference: line.reference }, c) }))
        .filter((x): x is { c: LedgerCandidate; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score);
      if (ranked.length === 0) continue;
      if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
        ambiguous++;
        continue;
      }
      try {
        const res = await this.prisma.finStatementLine.updateMany({ where: { id: line.id, status: "UNMATCHED" }, data: { status: "MATCHED", journalLineId: ranked[0].c.id, matchMethod: "AUTO", matchedAt: new Date(), matchedById: userId } });
        if (res.count === 1) {
          used.add(ranked[0].c.id);
          matched++;
        }
      } catch (err) {
        if ((err as { code?: string })?.code !== "P2002") throw err; // that ledger line was just taken by someone else
      }
    }
    if (matched > 0) await this.audit.write({ companyId, userId, area: "banking", action: "AUTO_MATCH", entityType: "FinPaymentAccount", entityId: paymentAccountId, summary: `Matched ${matched} statement lines automatically on "${pa.name}"`, ...meta });
    return { matched, ambiguous };
  }

  /** Ledger entries a statement line could be matched to by hand: same amount first, then the nearest in date. */
  async suggestions(companyId: string, lineId: string) {
    const line = await this.requireLine(this.prisma, companyId, lineId);
    const pa = await this.requireAccount(this.prisma, companyId, line.paymentAccountId);
    const pool = await this.unmatchedLedger(this.prisma, companyId, pa);
    const amount = decimalToPesewas(line.amount);
    const date = dayString(line.txnDate);
    const scored = pool.map((c) => ({ c, same: c.amount === amount, gap: days(date, c.date), score: scoreMatch({ date, description: line.description, reference: line.reference }, c, 60) ?? -1 }));
    scored.sort((a, b) => Number(b.same) - Number(a.same) || b.score - a.score || a.gap - b.gap);
    return scored.slice(0, 25).map((x) => ({ ...present(x.c), sameAmount: x.same, daysApart: x.gap }));
  }

  async match(companyId: string, userId: string, lineId: string, journalLineId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireLine(tx, companyId, lineId);
      if (line.status !== "UNMATCHED") throw new BadRequestException(line.status === "MATCHED" ? "This line is already matched." : "This line is ignored. Un-ignore it first.");
      const pa = await this.requireAccount(tx, companyId, line.paymentAccountId);
      await this.assertOpen(tx, companyId, pa.id, line.txnDate);
      const jl = await tx.finJournalLine.findFirst({ where: { id: journalLineId, accountId: pa.ledgerAccountId, journalEntry: { companyId } }, include: { journalEntry: true } });
      if (!jl) throw new BadRequestException("That ledger entry is not on this account.");
      if (jl.journalEntry.status !== "POSTED" || jl.journalEntry.type === "REVERSAL") throw new BadRequestException("That entry has been reversed, so it cannot be matched.");
      const signed = decimalToPesewas(jl.debit) - decimalToPesewas(jl.credit);
      if (signed !== decimalToPesewas(line.amount)) throw new BadRequestException(`The amounts differ: the statement says ${pesewasToDecimal(decimalToPesewas(line.amount))}, the ledger entry is ${pesewasToDecimal(signed)}.`);
      try {
        await tx.finStatementLine.update({ where: { id: lineId }, data: { status: "MATCHED", journalLineId, matchMethod: "MANUAL", matchedAt: new Date(), matchedById: userId } });
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002") throw new ConflictException("That ledger entry is already matched to another statement line.");
        throw err;
      }
      await this.audit.write({ companyId, userId, area: "banking", action: "MATCH", entityType: "FinStatementLine", entityId: lineId, summary: `Matched statement line (${pesewasToDecimal(signed)}) to ${jl.journalEntry.reference}`, ...meta }, tx);
      return this.getLine(companyId, lineId, tx);
    });
  }

  async unmatch(companyId: string, userId: string, lineId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireLine(tx, companyId, lineId);
      if (line.status !== "MATCHED") throw new BadRequestException("This line is not matched.");
      await this.assertOpen(tx, companyId, line.paymentAccountId, line.txnDate);
      await tx.finStatementLine.update({ where: { id: lineId }, data: { status: "UNMATCHED", journalLineId: null, matchMethod: null, matchedAt: null, matchedById: null } });
      await this.audit.write({ companyId, userId, area: "banking", action: "UNMATCH", entityType: "FinStatementLine", entityId: lineId, summary: "Unmatched a statement line", ...meta }, tx);
      return this.getLine(companyId, lineId, tx);
    });
  }

  /** Set aside a line that needs no ledger entry (a duplicate, a memo line); or bring it back. */
  async setIgnored(companyId: string, userId: string, lineId: string, ignore: boolean, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireLine(tx, companyId, lineId);
      if (ignore && line.status !== "UNMATCHED") throw new BadRequestException("Only an unmatched line can be ignored.");
      if (!ignore && line.status !== "IGNORED") throw new BadRequestException("This line is not ignored.");
      await this.assertOpen(tx, companyId, line.paymentAccountId, line.txnDate);
      await tx.finStatementLine.update({ where: { id: lineId }, data: { status: ignore ? "IGNORED" : "UNMATCHED" } });
      await this.audit.write({ companyId, userId, area: "banking", action: ignore ? "IGNORE_LINE" : "UNIGNORE_LINE", entityType: "FinStatementLine", entityId: lineId, summary: `${ignore ? "Ignored" : "Restored"} a statement line`, ...meta }, tx);
      return this.getLine(companyId, lineId, tx);
    });
  }

  /**
   * Creates the ledger entry a statement line is missing (a bank charge, interest, a payment nobody recorded) and matches it in one step.
   *   money out:  Dr the account you choose (e.g. Bank charges), Cr the bank/MoMo account
   *   money in:   Dr the bank/MoMo account, Cr the account you choose (e.g. Other income)
   */
  async createFromLine(companyId: string, userId: string, lineId: string, dto: CreateFromLineDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const line = await this.requireLine(tx, companyId, lineId);
      if (line.status !== "UNMATCHED") throw new BadRequestException("Only an unmatched line can be turned into a transaction.");
      const pa = await this.requireAccount(tx, companyId, line.paymentAccountId);
      await this.assertOpen(tx, companyId, pa.id, line.txnDate);
      if (dto.counterAccountId === pa.ledgerAccountId) throw new BadRequestException("Choose a different account for the other side.");
      const counter = await tx.finAccount.findFirst({ where: { id: dto.counterAccountId, companyId } });
      if (!counter) throw new BadRequestException("That account does not exist.");
      if (!counter.isPostable || !counter.isActive) throw new BadRequestException(`${counter.code} ${counter.name} cannot be posted to.`);

      const amount = decimalToPesewas(line.amount);
      const text = (dto.description?.trim() || line.description).slice(0, 200);
      const lines: FinPostLine[] =
        amount > 0
          ? [{ accountId: pa.ledgerAccountId, debit: pesewasToDecimal(amount), description: text }, { accountId: counter.id, credit: pesewasToDecimal(amount), description: text }]
          : [{ accountId: counter.id, debit: pesewasToDecimal(-amount), description: text }, { accountId: pa.ledgerAccountId, credit: pesewasToDecimal(-amount), description: text }];
      const entry = await this.ledger.post({ companyId, userId, entryDate: line.txnDate, description: `${text} (from statement)`, sourceModule: "FIN_STATEMENT_LINE", sourceId: line.id, lines, meta }, tx);
      const jl = await tx.finJournalLine.findFirstOrThrow({ where: { journalEntryId: entry.id, accountId: pa.ledgerAccountId } });
      await tx.finStatementLine.update({ where: { id: lineId }, data: { status: "MATCHED", journalLineId: jl.id, matchMethod: "CREATED", matchedAt: new Date(), matchedById: userId } });
      await this.audit.write({ companyId, userId, area: "banking", action: "CREATE_FROM_LINE", entityType: "FinStatementLine", entityId: lineId, summary: `Created ${entry.reference} from a statement line (${pesewasToDecimal(amount)}) against ${counter.code} ${counter.name}`, ...meta }, tx);
      return this.getLine(companyId, lineId, tx);
    });
  }

  // ─── reading ────────────────────────────────────────────────────────────────

  async listLines(companyId: string, q: ReconQueryDto) {
    await this.requireAccount(this.prisma, companyId, q.paymentAccountId);
    const take = Math.min(Math.max(1, q.take ?? 100), 500);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinStatementLineWhereInput = { companyId, paymentAccountId: q.paymentAccountId, ...(q.status && q.status !== "all" ? { status: q.status } : {}) };
    const [rows, total, counts] = await Promise.all([
      this.prisma.finStatementLine.findMany({ where, orderBy: [{ txnDate: "desc" }, { lineNo: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finStatementLine.count({ where }),
      this.prisma.finStatementLine.groupBy({ by: ["status"], where: { companyId, paymentAccountId: q.paymentAccountId }, _count: { _all: true } })
    ]);
    const jlIds = rows.map((r) => r.journalLineId).filter((x): x is string => !!x);
    const jls = jlIds.length ? await this.prisma.finJournalLine.findMany({ where: { id: { in: jlIds } }, include: { journalEntry: { select: { reference: true, description: true, status: true } } } }) : [];
    const byId = new Map(jls.map((j) => [j.id, j]));
    return {
      rows: rows.map((r) => ({ ...presentLine(r), ledger: r.journalLineId && byId.get(r.journalLineId) ? { reference: byId.get(r.journalLineId)!.journalEntry.reference, description: byId.get(r.journalLineId)!.journalEntry.description, voided: byId.get(r.journalLineId)!.journalEntry.status !== "POSTED" } : null })),
      total, page, take,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all]))
    };
  }

  async ledgerCandidates(companyId: string, paymentAccountId: string) {
    const pa = await this.requireAccount(this.prisma, companyId, paymentAccountId);
    return (await this.unmatchedLedger(this.prisma, companyId, pa)).map(present);
  }

  async getLine(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    return presentLine(await this.requireLine(db, companyId, id));
  }

  // ─── the report ─────────────────────────────────────────────────────────────

  /**
   * Statement balance against the books, as at a date.
   *   adjusted ledger = ledger balance - ledger entries not yet on the statement + statement lines not yet in the ledger
   * The statement balance should equal the adjusted ledger; the difference should be zero.
   */
  async report(companyId: string, paymentAccountId: string, asOfStr: string, statementBalanceInput: string | number) {
    const pa = await this.requireAccount(this.prisma, companyId, paymentAccountId);
    const asOf = parseDay(asOfStr);
    const statementBalance = toPesewas(statementBalanceInput, "The statement balance");
    const ledgerBalance = await ledgerBalancePesewas(this.prisma, companyId, pa.ledgerAccountId, asOf);

    const outstandingLedger = (await this.unmatchedLedger(this.prisma, companyId, pa, asOf)).filter((c) => c.date <= asOfStr.slice(0, 10));
    const lines = await this.prisma.finStatementLine.findMany({ where: { paymentAccountId, txnDate: { lte: asOf }, status: { in: ["UNMATCHED", "MATCHED"] } } });
    const jlIds = lines.map((l) => l.journalLineId).filter((x): x is string => !!x);
    const jls = jlIds.length ? await this.prisma.finJournalLine.findMany({ where: { id: { in: jlIds } }, include: { journalEntry: { select: { status: true, reference: true } } } }) : [];
    const jlById = new Map(jls.map((j) => [j.id, j]));
    // A matched line whose ledger entry was voided afterwards is no longer backed by the books: it counts as not yet in the ledger.
    const stale = lines.filter((l) => l.status === "MATCHED" && l.journalLineId && jlById.get(l.journalLineId)?.journalEntry.status !== "POSTED");
    const notInLedger = [...lines.filter((l) => l.status === "UNMATCHED"), ...stale];

    const outstandingLedgerNet = outstandingLedger.reduce((s, c) => s + c.amount, 0);
    const notInLedgerNet = notInLedger.reduce((s, l) => s + decimalToPesewas(l.amount), 0);
    const adjusted = ledgerBalance - outstandingLedgerNet + notInLedgerNet;
    const difference = statementBalance - adjusted;
    const lock = await this.accounts.currentLock(this.prisma, companyId, paymentAccountId);
    return {
      account: { id: pa.id, name: pa.name, reconcileFrom: pa.reconcileFrom ? dayString(pa.reconcileFrom) : null },
      asOf: dayString(asOf),
      statementBalance: pesewasToDecimal(statementBalance),
      ledgerBalance: pesewasToDecimal(ledgerBalance),
      outstandingLedgerEntries: { net: pesewasToDecimal(outstandingLedgerNet), count: outstandingLedger.length, items: outstandingLedger.map(present) },
      statementLinesNotInLedger: { net: pesewasToDecimal(notInLedgerNet), count: notInLedger.length, items: notInLedger.map((l) => ({ ...presentLine(l), staleMatch: l.status === "MATCHED" })) },
      adjustedLedgerBalance: pesewasToDecimal(adjusted),
      difference: pesewasToDecimal(difference),
      reconciled: difference === 0,
      canClose: difference === 0 && notInLedger.length === 0,
      reconciledThrough: lock ? dayString(lock) : null,
      matchedLines: lines.filter((l) => l.status === "MATCHED").length - stale.length
    };
  }

  async history(companyId: string, paymentAccountId: string) {
    await this.requireAccount(this.prisma, companyId, paymentAccountId);
    const rows = await this.prisma.finReconLock.findMany({ where: { companyId, paymentAccountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    return rows.map((r) => ({ id: r.id, reconciledThrough: r.reconciledThrough ? dayString(r.reconciledThrough) : null, statementBalance: r.statementBalance ? pesewasToDecimal(decimalToPesewas(r.statementBalance)) : null, ledgerBalance: r.ledgerBalance ? pesewasToDecimal(decimalToPesewas(r.ledgerBalance)) : null, note: r.note, createdAt: r.createdAt }));
  }

  /** Records that the account agrees with its statement through a date. Matches up to that date can then no longer be changed. */
  async close(companyId: string, userId: string, dto: CloseReconDto, meta: RequestMeta) {
    const r = await this.report(companyId, dto.paymentAccountId, dto.statementDate, dto.statementBalance);
    if (!r.canClose) throw new BadRequestException(r.reconciled ? "Some statement lines are not in the ledger yet. Match them or create their transactions first." : `The account does not reconcile yet: the difference is ${r.difference}.`);
    const current = await this.accounts.currentLock(this.prisma, companyId, dto.paymentAccountId);
    if (current && parseDay(dto.statementDate).getTime() <= current.getTime()) throw new BadRequestException(`This account is already reconciled through ${dayString(current)}.`);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.finReconLock.create({
        data: { companyId, paymentAccountId: dto.paymentAccountId, reconciledThrough: parseDay(dto.statementDate), statementBalance: r.statementBalance, ledgerBalance: r.ledgerBalance, note: (dto.note?.trim() || "Reconciled").slice(0, 300), setById: userId }
      });
      await this.audit.write({ companyId, userId, area: "banking", action: "RECONCILE", entityType: "FinPaymentAccount", entityId: dto.paymentAccountId, summary: `Reconciled "${r.account.name}" through ${r.asOf} (statement ${r.statementBalance})`, after: { through: r.asOf, statementBalance: r.statementBalance, ledgerBalance: r.ledgerBalance }, ...meta }, tx);
      return { id: row.id, reconciledThrough: r.asOf };
    });
  }

  async reopen(companyId: string, userId: string, dto: ReopenReconDto, meta: RequestMeta) {
    const current = await this.accounts.currentLock(this.prisma, companyId, dto.paymentAccountId);
    if (!current) throw new BadRequestException("Nothing is reconciled on this account.");
    const to = dto.reconciledThrough ? parseDay(dto.reconciledThrough) : null;
    if (to && to.getTime() >= current.getTime()) throw new BadRequestException(`To reopen, give a date earlier than ${dayString(current)} (or none to reopen everything).`);
    return this.prisma.$transaction(async (tx) => {
      await tx.finReconLock.create({ data: { companyId, paymentAccountId: dto.paymentAccountId, reconciledThrough: to, note: `Reopened: ${dto.reason.trim()}`.slice(0, 300), setById: userId } });
      await this.audit.write({ companyId, userId, area: "banking", action: "REOPEN_RECONCILIATION", entityType: "FinPaymentAccount", entityId: dto.paymentAccountId, summary: `Reopened reconciliation (was through ${dayString(current)}): ${dto.reason}`.slice(0, 500), ...meta }, tx);
      return { reconciledThrough: to ? dayString(to) : null };
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Ledger entries on the account that no statement line has claimed, excluding anything reversed (a voided receipt and its reversal cancel out). */
  private async unmatchedLedger(db: FinDb | PrismaService, companyId: string, pa: { id: string; ledgerAccountId: string; reconcileFrom: Date | null }, upTo?: Date): Promise<LedgerCandidate[]> {
    const taken = await db.finStatementLine.findMany({ where: { paymentAccountId: pa.id, journalLineId: { not: null } }, select: { journalLineId: true } });
    const takenIds = new Set(taken.map((t) => t.journalLineId as string));
    const rows = await db.finJournalLine.findMany({
      where: {
        accountId: pa.ledgerAccountId,
        journalEntry: { companyId, status: "POSTED", type: { not: "REVERSAL" }, entryDate: { ...(pa.reconcileFrom ? { gte: pa.reconcileFrom } : {}), ...(upTo ? { lte: upTo } : {}) } }
      },
      include: { journalEntry: { select: { id: true, reference: true, description: true, entryDate: true } } },
      orderBy: { journalEntry: { entryDate: "asc" } }
    });
    return rows
      .filter((r) => !takenIds.has(r.id))
      .map((r) => ({ id: r.id, entryId: r.journalEntry.id, date: dayString(r.journalEntry.entryDate), reference: r.journalEntry.reference, description: r.description ?? "", entryDescription: r.journalEntry.description, amount: decimalToPesewas(r.debit) - decimalToPesewas(r.credit) }))
      .filter((c) => c.amount !== 0);
  }

  private async assertOpen(db: FinDb, companyId: string, paymentAccountId: string, date: Date) {
    const lock = await this.accounts.currentLock(db, companyId, paymentAccountId);
    if (lock && date.getTime() <= lock.getTime()) throw new BadRequestException(`This account is reconciled through ${dayString(lock)}. Reopen the reconciliation to change anything on or before that date.`);
  }

  private async requireAccount(db: FinDb | PrismaService, companyId: string, id: string) {
    const pa = await db.finPaymentAccount.findFirst({ where: { id, companyId } });
    if (!pa) throw new NotFoundException("Payment account not found.");
    return pa;
  }

  private async requireLine(db: FinDb | PrismaService, companyId: string, id: string): Promise<StmtRow> {
    const l = await db.finStatementLine.findFirst({ where: { id, companyId } });
    if (!l) throw new NotFoundException("Statement line not found.");
    return l;
  }
}

function present(c: LedgerCandidate) {
  return { journalLineId: c.id, entryId: c.entryId, date: c.date, reference: c.reference, description: c.description || c.entryDescription, amount: pesewasToDecimal(c.amount) };
}

function presentLine(l: StmtRow) {
  return {
    id: l.id, paymentAccountId: l.paymentAccountId, lineNo: l.lineNo, date: dayString(l.txnDate), description: l.description, reference: l.reference, amount: pesewasToDecimal(decimalToPesewas(l.amount)),
    balance: l.balance === null ? null : pesewasToDecimal(decimalToPesewas(l.balance)), status: l.status, journalLineId: l.journalLineId, matchMethod: l.matchMethod, matchedAt: l.matchedAt
  };
}
