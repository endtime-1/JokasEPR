import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FinJournalType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { pesewasToDecimal, toPesewas } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";
import { retryOnDeadlock } from "./fin-retry";

/** A line as callers describe it. Name the account by id, or by ROLE (e.g. "receivable"). */
export type FinPostLine = {
  accountId?: string;
  role?: string;
  debit?: number | string;
  credit?: number | string;
  description?: string;
};

export type FinPostInput = {
  companyId: string;
  userId: string;
  entryDate: Date | string;
  description: string;
  lines: FinPostLine[];
  type?: FinJournalType;
  /** With sourceId: makes posting idempotent: the same business event can only ever post once. */
  sourceModule?: string;
  sourceId?: string;
  /** Set only on a reversing entry: the id of the entry it reverses. */
  reversalOf?: string;
  notes?: string;
  meta?: RequestMeta;
};

export type PostedEntry = { id: string; reference: string; created: boolean };

type NormalLine = { accountId: string; debit: number; credit: number; description: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** UTC midnight of a calendar day. Accepts "YYYY-MM-DD", an ISO string, or a Date. */
export function parseDay(input: Date | string): Date {
  if (typeof input === "string") {
    if (!DAY.test(input)) throw new BadRequestException("That is not a valid date.");
    const d = new Date(`${input.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException("That is not a valid date.");
    return d;
  }
  if (Number.isNaN(input.getTime())) throw new BadRequestException("That is not a valid date.");
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The one door into the finance v2 ledger. Every money movement posts through post().
 *
 * Guarantees, all inside one database transaction:
 *   - an entry has 2+ lines, every line is exactly one of debit/credit, debits equal credits to the pesewa;
 *   - every account exists, belongs to the company, is active and is a posting (not header) account;
 *   - the date is in an open period;
 *   - the same (sourceModule, sourceId) can never post twice;
 *   - once posted an entry is never edited or deleted (the database triggers refuse it too);
 *     it can only be reversed by a new, opposite entry.
 */
@Injectable()
export class FinLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: FinNumberingService,
    private readonly audit: FinAuditService
  ) {}

  // ─── Period lock ────────────────────────────────────────────────────────────

  async lockedThrough(companyId: string, db: FinDb | PrismaService = this.prisma): Promise<Date | null> {
    const row = await db.finPeriodLock.findFirst({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return row?.lockedThrough ?? null;
  }

  /** Refuses to write into a closed period, so reported months cannot quietly change. */
  async assertOpenPeriod(companyId: string, entryDate: Date, db: FinDb | PrismaService = this.prisma) {
    const locked = await this.lockedThrough(companyId, db);
    if (locked && parseDay(entryDate).getTime() <= locked.getTime()) {
      throw new BadRequestException(`The books are closed through ${dayString(locked)}. Use a date after that.`);
    }
  }

  async periodStatus(companyId: string) {
    const [locked, history] = await Promise.all([
      this.lockedThrough(companyId),
      this.prisma.finPeriodLock.findMany({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 })
    ]);
    return { lockedThrough: locked ? dayString(locked) : null, history };
  }

  async setLock(companyId: string, userId: string, lockedThrough: string | null, reason: string, meta: RequestMeta = {}) {
    let day: Date | null = null;
    if (lockedThrough) {
      day = parseDay(lockedThrough);
      if (day.getTime() > parseDay(new Date()).getTime()) throw new BadRequestException("You can only close periods that have already ended.");
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedThrough(companyId, tx);
      const row = await tx.finPeriodLock.create({ data: { companyId, lockedThrough: day, reason: reason.trim(), setById: userId } });
      await this.audit.write(
        {
          companyId,
          userId,
          area: "accounting",
          action: day ? "LOCK_PERIOD" : "UNLOCK_PERIOD",
          entityType: "FinPeriodLock",
          entityId: row.id,
          summary: day ? `Closed the books through ${dayString(day)}` : "Reopened all periods",
          before: { lockedThrough: before ? dayString(before) : null },
          after: { lockedThrough: day ? dayString(day) : null, reason: reason.trim() },
          ...meta
        },
        tx
      );
      return { lockedThrough: day ? dayString(day) : null };
    });
  }

  // ─── Posting ────────────────────────────────────────────────────────────────

  /** Writes one balanced, POSTED journal entry for a business event. Safe to call twice for the same event. */
  async post(input: FinPostInput, db?: FinDb): Promise<PostedEntry> {
    // Standalone call: own transaction, retried if MySQL picks it as a deadlock victim (P2034 means nothing was
    // committed, and posting is idempotent per source anyway). A caller passing its own `db` owns the retry.
    if (!db) return retryOnDeadlock(() => this.prisma.$transaction((tx) => this.post(input, tx)));
    const { companyId, userId } = input;

    if (input.sourceModule && input.sourceId) {
      const existing = await db.finJournalEntry.findFirst({
        where: { companyId, sourceModule: input.sourceModule, sourceId: input.sourceId },
        select: { id: true, reference: true }
      });
      if (existing) return { ...existing, created: false };
    } else if (input.sourceModule || input.sourceId) {
      throw new BadRequestException("sourceModule and sourceId must be given together.");
    }

    const entryDate = parseDay(input.entryDate);
    await this.assertOpenPeriod(companyId, entryDate, db);
    const lines = await this.normalizeLines(db, companyId, input.lines, true);
    const totals = sumLines(lines);

    const draft = await db.finJournalEntry.create({
      data: {
        companyId,
        reference: tempReference(),
        entryDate,
        description: input.description.slice(0, 240),
        type: input.type ?? "STANDARD",
        status: "DRAFT",
        totalDebit: pesewasToDecimal(totals.debit),
        totalCredit: pesewasToDecimal(totals.credit),
        sourceModule: input.sourceModule ?? null,
        sourceId: input.sourceId ?? null,
        reversalOf: input.reversalOf ?? null,
        notes: input.notes?.slice(0, 500),
        createdById: userId,
        lines: { create: lines.map((l, i) => ({ lineNo: i + 1, accountId: l.accountId, description: l.description, debit: pesewasToDecimal(l.debit), credit: pesewasToDecimal(l.credit) })) }
      },
      select: { id: true }
    });
    const reference = await this.numbering.next(companyId, "JOURNAL", db, entryDate);
    await this.flipToPosted(db, draft.id, reference, userId);
    await this.audit.write(
      {
        companyId,
        userId,
        area: "accounting",
        action: "POST",
        entityType: "FinJournalEntry",
        entityId: draft.id,
        summary: `Posted ${reference}: ${input.description}`.slice(0, 500),
        after: { reference, entryDate: dayString(entryDate), totalDebit: pesewasToDecimal(totals.debit), source: input.sourceModule ?? null },
        ...input.meta
      },
      db
    );
    return { id: draft.id, reference, created: true };
  }

  /** DRAFT -> POSTED. The database re-checks that the lines balance before it allows this. */
  private async flipToPosted(db: FinDb, id: string, reference: string, userId: string) {
    const res = await db.finJournalEntry.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "POSTED", reference, postedAt: new Date(), postedById: userId }
    });
    if (res.count !== 1) throw new ConflictException("This journal entry has already been posted.");
  }

  // ─── Manual journals: draft -> post ─────────────────────────────────────────

  async createDraft(
    companyId: string,
    userId: string,
    dto: { entryDate: string; description: string; notes?: string; lines: FinPostLine[]; type?: FinJournalType },
    meta: RequestMeta = {}
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entryDate = parseDay(dto.entryDate);
      const lines = await this.normalizeLines(tx, companyId, dto.lines, false);
      const totals = sumLines(lines);
      const entry = await tx.finJournalEntry.create({
        data: {
          companyId,
          reference: tempReference(),
          entryDate,
          description: dto.description.slice(0, 240),
          type: dto.type ?? "STANDARD",
          status: "DRAFT",
          totalDebit: pesewasToDecimal(totals.debit),
          totalCredit: pesewasToDecimal(totals.credit),
          notes: dto.notes?.slice(0, 500),
          createdById: userId,
          lines: { create: lines.map((l, i) => ({ lineNo: i + 1, accountId: l.accountId, description: l.description, debit: pesewasToDecimal(l.debit), credit: pesewasToDecimal(l.credit) })) }
        },
        select: { id: true }
      });
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "CREATE_DRAFT", entityType: "FinJournalEntry", entityId: entry.id, summary: `Created draft journal: ${dto.description}`, ...meta },
        tx
      );
      return this.getEntry(companyId, entry.id, tx);
    });
  }

  async updateDraft(
    companyId: string,
    userId: string,
    id: string,
    dto: { entryDate?: string; description?: string; notes?: string; lines?: FinPostLine[] },
    meta: RequestMeta = {}
  ) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.requireDraft(tx, companyId, id);
      const data: Prisma.FinJournalEntryUpdateInput = {};
      if (dto.entryDate) data.entryDate = parseDay(dto.entryDate);
      if (dto.description) data.description = dto.description.slice(0, 240);
      if (dto.notes !== undefined) data.notes = dto.notes.slice(0, 500);
      if (dto.lines) {
        const lines = await this.normalizeLines(tx, companyId, dto.lines, false);
        const totals = sumLines(lines);
        await tx.finJournalLine.deleteMany({ where: { journalEntryId: id } });
        await tx.finJournalLine.createMany({
          data: lines.map((l, i) => ({ journalEntryId: id, lineNo: i + 1, accountId: l.accountId, description: l.description, debit: pesewasToDecimal(l.debit), credit: pesewasToDecimal(l.credit) }))
        });
        data.totalDebit = pesewasToDecimal(totals.debit);
        data.totalCredit = pesewasToDecimal(totals.credit);
      }
      await tx.finJournalEntry.update({ where: { id: entry.id }, data });
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "UPDATE_DRAFT", entityType: "FinJournalEntry", entityId: id, summary: `Edited draft journal ${entry.description}`, ...meta },
        tx
      );
      return this.getEntry(companyId, id, tx);
    });
  }

  async deleteDraft(companyId: string, userId: string, id: string, meta: RequestMeta = {}) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.requireDraft(tx, companyId, id);
      await tx.finJournalLine.deleteMany({ where: { journalEntryId: id } });
      await tx.finJournalEntry.delete({ where: { id } });
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "DELETE_DRAFT", entityType: "FinJournalEntry", entityId: id, summary: `Deleted draft journal: ${entry.description}`, ...meta },
        tx
      );
      return { deleted: true };
    });
  }

  async postDraft(companyId: string, userId: string, id: string, meta: RequestMeta = {}) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.requireDraft(tx, companyId, id);
      await this.assertOpenPeriod(companyId, entry.entryDate, tx);
      const stored = await tx.finJournalLine.findMany({ where: { journalEntryId: id }, orderBy: { lineNo: "asc" } });
      // Re-validate: an account may have been deactivated since the draft was saved.
      const lines = await this.normalizeLines(
        tx,
        companyId,
        stored.map((l) => ({ accountId: l.accountId, debit: l.debit.toString(), credit: l.credit.toString(), description: l.description ?? undefined })),
        true
      );
      const totals = sumLines(lines);
      await tx.finJournalEntry.update({ where: { id }, data: { totalDebit: pesewasToDecimal(totals.debit), totalCredit: pesewasToDecimal(totals.credit) } });
      const reference = await this.numbering.next(companyId, "JOURNAL", tx, entry.entryDate);
      await this.flipToPosted(tx, id, reference, userId);
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "POST", entityType: "FinJournalEntry", entityId: id, summary: `Posted ${reference}: ${entry.description}`.slice(0, 500), after: { reference, totalDebit: pesewasToDecimal(totals.debit) }, ...meta },
        tx
      );
      return this.getEntry(companyId, id, tx);
    });
  }

  private async requireDraft(db: FinDb, companyId: string, id: string) {
    const entry = await db.finJournalEntry.findFirst({ where: { id, companyId } });
    if (!entry) throw new NotFoundException("Journal entry not found.");
    if (entry.status !== "DRAFT") throw new BadRequestException("Only a draft journal can be changed. Post a reversing entry to correct a posted one.");
    return entry;
  }

  // ─── Reversal ───────────────────────────────────────────────────────────────

  /**
   * Corrects a posted entry by posting an exact opposite one. The original is only marked
   * REVERSED (nothing else about it changes). The reversal takes the original's date when that
   * period is still open, otherwise today's date.
   */
  async reverse(companyId: string, userId: string, entryId: string, reason: string, meta: RequestMeta = {}, db?: FinDb): Promise<PostedEntry> {
    if (!db) return this.prisma.$transaction((tx) => this.reverse(companyId, userId, entryId, reason, meta, tx));
    const original = await db.finJournalEntry.findFirst({ where: { id: entryId, companyId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
    if (!original) throw new NotFoundException("Journal entry not found.");
    if (original.status === "DRAFT") throw new BadRequestException("A draft has not been posted. Delete it instead.");
    if (original.status === "REVERSED") throw new BadRequestException("This entry has already been reversed.");
    if (original.type === "REVERSAL") throw new BadRequestException("A reversing entry cannot itself be reversed. Post a new entry instead.");

    const locked = await this.lockedThrough(companyId, db);
    const today = parseDay(new Date());
    const entryDate = locked && original.entryDate.getTime() <= locked.getTime() ? today : original.entryDate;
    await this.assertOpenPeriod(companyId, entryDate, db);

    const reversal = await this.post(
      {
        companyId,
        userId,
        entryDate,
        description: `Reversal of ${original.reference}: ${reason}`.slice(0, 240),
        type: "REVERSAL",
        sourceModule: "REVERSAL",
        sourceId: original.id,
        reversalOf: original.id,
        notes: reason.slice(0, 500),
        meta,
        lines: original.lines.map((l) => ({ accountId: l.accountId, debit: l.credit.toString(), credit: l.debit.toString(), description: l.description ?? undefined }))
      },
      db
    );
    if (!reversal.created) throw new ConflictException("This entry has already been reversed.");
    const marked = await db.finJournalEntry.updateMany({ where: { id: original.id, status: "POSTED" }, data: { status: "REVERSED", reversedById: reversal.id } });
    if (marked.count !== 1) throw new ConflictException("This entry has already been reversed.");
    await this.audit.write(
      { companyId, userId, area: "accounting", action: "REVERSE", entityType: "FinJournalEntry", entityId: original.id, summary: `Reversed ${original.reference} with ${reversal.reference}: ${reason}`.slice(0, 500), after: { reversal: reversal.reference }, ...meta },
      db
    );
    return reversal;
  }

  // ─── Reading ────────────────────────────────────────────────────────────────

  async getEntry(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const entry = await db.finJournalEntry.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { lineNo: "asc" }, include: { account: { select: { id: true, code: true, name: true, type: true } } } } }
    });
    if (!entry) throw new NotFoundException("Journal entry not found.");
    return entry;
  }

  async listEntries(
    companyId: string,
    q: { status?: "DRAFT" | "POSTED" | "REVERSED"; from?: string; to?: string; search?: string; page?: number; take?: number }
  ) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinJournalEntryWhereInput = {
      companyId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { entryDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {}),
      ...(q.search ? { OR: [{ reference: { contains: q.search } }, { description: { contains: q.search } }] } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finJournalEntry.findMany({ where, orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finJournalEntry.count({ where })
    ]);
    return { rows, total, page, take };
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Turns caller lines into validated pesewa lines: resolves roles to accounts, checks each account is
   * usable, and (when `requireBalanced`) that debits equal credits across 2+ lines.
   */
  private async normalizeLines(db: FinDb, companyId: string, lines: FinPostLine[], requireBalanced: boolean): Promise<NormalLine[]> {
    if (!lines?.length) throw new BadRequestException("A journal entry needs at least one line.");

    const roles = [...new Set(lines.filter((l) => !l.accountId && l.role).map((l) => l.role as string))];
    const byRole = new Map<string, string>();
    if (roles.length) {
      const found = await db.finAccount.findMany({ where: { companyId, systemRole: { in: roles } }, select: { id: true, systemRole: true } });
      for (const a of found) byRole.set(a.systemRole as string, a.id);
      const missing = roles.filter((r) => !byRole.has(r));
      if (missing.length) throw new BadRequestException(`No account is set up for: ${missing.join(", ")}. Set the role on an account in the chart of accounts first.`);
    }

    const normalized = lines.map((l, i) => {
      const accountId = l.accountId ?? (l.role ? byRole.get(l.role) : undefined);
      if (!accountId) throw new BadRequestException(`Line ${i + 1}: choose an account.`);
      const debit = toPesewas(l.debit, `Line ${i + 1} debit`);
      const credit = toPesewas(l.credit, `Line ${i + 1} credit`);
      if (debit < 0 || credit < 0) throw new BadRequestException(`Line ${i + 1}: amounts cannot be negative.`);
      if (debit > 0 && credit > 0) throw new BadRequestException(`Line ${i + 1}: a line is either a debit or a credit, not both.`);
      if (debit === 0 && credit === 0) throw new BadRequestException(`Line ${i + 1}: enter an amount.`);
      return { accountId, debit, credit, description: l.description?.slice(0, 240) ?? null };
    });

    const ids = [...new Set(normalized.map((l) => l.accountId))];
    const accounts = await db.finAccount.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, code: true, name: true, isActive: true, isPostable: true } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    normalized.forEach((l, i) => {
      const a = byId.get(l.accountId);
      if (!a) throw new BadRequestException(`Line ${i + 1}: that account does not exist.`);
      if (!a.isActive) throw new BadRequestException(`Line ${i + 1}: account ${a.code} ${a.name} is inactive.`);
      if (!a.isPostable) throw new BadRequestException(`Line ${i + 1}: ${a.code} ${a.name} is a heading. Post to one of the accounts under it.`);
    });

    if (requireBalanced) {
      if (normalized.length < 2) throw new BadRequestException("A journal entry needs at least two lines.");
      const t = sumLines(normalized);
      if (t.debit !== t.credit) {
        throw new BadRequestException(`The entry does not balance: debits ${pesewasToDecimal(t.debit)} and credits ${pesewasToDecimal(t.credit)} differ by ${pesewasToDecimal(Math.abs(t.debit - t.credit))}.`);
      }
      if (t.debit === 0) throw new BadRequestException("The entry has no amount.");
    }
    return normalized;
  }
}

function sumLines(lines: { debit: number; credit: number }[]) {
  return lines.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0, credit: 0 });
}

function tempReference() {
  return `DRAFT-${randomUUID().slice(0, 8)}`;
}
