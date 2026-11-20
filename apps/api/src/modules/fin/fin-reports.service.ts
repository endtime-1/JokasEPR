import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FinAccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { decimalToPesewas, pesewasToNumber } from "./fin-money";
import { dayString, parseDay } from "./fin-ledger.service";

// Entries that count in the books: posted ones, and originals that were later reversed
// (their reversal entry offsets them). Drafts never count.
const COUNTED: ("POSTED" | "REVERSED")[] = ["POSTED", "REVERSED"];

type Sums = Map<string, { debit: number; credit: number }>;

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: FinAccountType;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
};

@Injectable()
export class FinReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trial balance. Give `asOf` for balances to a date, or `from`/`to` to also see
   * the opening balance and the movement inside the range.
   */
  async trialBalance(companyId: string, q: { asOf?: string; from?: string; to?: string; includeZero?: boolean }) {
    let from: Date | null = null;
    let to: Date;
    if (q.from || q.to) {
      if (!q.to) throw new BadRequestException("Give an end date.");
      to = parseDay(q.to);
      from = q.from ? parseDay(q.from) : null;
      if (from && from.getTime() > to.getTime()) throw new BadRequestException("The start date is after the end date.");
    } else if (q.asOf) {
      to = parseDay(q.asOf);
    } else {
      to = parseDay(new Date());
    }

    const [opening, movement, accounts] = await Promise.all([
      from ? this.sums(companyId, { lt: from }) : Promise.resolve(new Map() as Sums),
      this.sums(companyId, from ? { gte: from, lte: to } : { lte: to }),
      this.prisma.finAccount.findMany({ where: { companyId }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" } })
    ]);

    const rows: TrialBalanceRow[] = [];
    let totals = { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 };
    for (const a of accounts) {
      const o = opening.get(a.id) ?? { debit: 0, credit: 0 };
      const m = movement.get(a.id) ?? { debit: 0, credit: 0 };
      const openNet = o.debit - o.credit;
      const closeNet = openNet + m.debit - m.credit;
      if (!q.includeZero && o.debit === 0 && o.credit === 0 && m.debit === 0 && m.credit === 0 && closeNet === 0) continue;
      const r = {
        openingDebit: Math.max(openNet, 0),
        openingCredit: Math.max(-openNet, 0),
        debit: m.debit,
        credit: m.credit,
        closingDebit: Math.max(closeNet, 0),
        closingCredit: Math.max(-closeNet, 0)
      };
      totals = {
        openingDebit: totals.openingDebit + r.openingDebit,
        openingCredit: totals.openingCredit + r.openingCredit,
        debit: totals.debit + r.debit,
        credit: totals.credit + r.credit,
        closingDebit: totals.closingDebit + r.closingDebit,
        closingCredit: totals.closingCredit + r.closingCredit
      };
      rows.push({ accountId: a.id, code: a.code, name: a.name, type: a.type, ...r });
    }

    const byType = (["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as FinAccountType[]).map((type) => {
      const sub = rows.filter((r) => r.type === type);
      return {
        type,
        debit: pesewasToNumber(sub.reduce((s, r) => s + r.closingDebit, 0)),
        credit: pesewasToNumber(sub.reduce((s, r) => s + r.closingCredit, 0))
      };
    });

    return {
      from: from ? dayString(from) : null,
      to: dayString(to),
      rows: rows.map(money),
      totals: moneyTotals(totals),
      byType,
      // The books are in balance only when total debits equal total credits.
      balanced: totals.closingDebit === totals.closingCredit && totals.debit === totals.credit
    };
  }

  /** One account's lines in date order with a running balance (debit-positive). */
  async accountLedger(companyId: string, accountId: string, q: { from?: string; to?: string }) {
    const account = await this.prisma.finAccount.findFirst({ where: { id: accountId, companyId }, select: { id: true, code: true, name: true, type: true } });
    if (!account) throw new NotFoundException("Account not found.");
    const from = q.from ? parseDay(q.from) : null;
    const to = q.to ? parseDay(q.to) : null;

    let running = 0;
    if (from) {
      const open = await this.prisma.finJournalLine.aggregate({
        where: { accountId, journalEntry: { companyId, status: { in: COUNTED }, entryDate: { lt: from } } },
        _sum: { debit: true, credit: true }
      });
      running = decimalToPesewas(open._sum.debit) - decimalToPesewas(open._sum.credit);
    }
    const openingBalance = running;

    const lines = await this.prisma.finJournalLine.findMany({
      where: {
        accountId,
        journalEntry: { companyId, status: { in: COUNTED }, entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      },
      include: { journalEntry: { select: { id: true, reference: true, entryDate: true, description: true, status: true } } },
      orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { createdAt: "asc" } }, { lineNo: "asc" }]
    });

    const rows = lines.map((l) => {
      const debit = decimalToPesewas(l.debit);
      const credit = decimalToPesewas(l.credit);
      running += debit - credit;
      return {
        entryId: l.journalEntry.id,
        reference: l.journalEntry.reference,
        date: dayString(l.journalEntry.entryDate),
        description: l.description ?? l.journalEntry.description,
        entryStatus: l.journalEntry.status,
        debit: pesewasToNumber(debit),
        credit: pesewasToNumber(credit),
        balance: pesewasToNumber(running)
      };
    });
    return { account, from: from ? dayString(from) : null, to: to ? dayString(to) : null, openingBalance: pesewasToNumber(openingBalance), closingBalance: pesewasToNumber(running), rows };
  }

  private async sums(companyId: string, date: Prisma.DateTimeFilter): Promise<Sums> {
    const grouped = await this.prisma.finJournalLine.groupBy({
      by: ["accountId"],
      where: { journalEntry: { companyId, status: { in: COUNTED }, entryDate: date } },
      _sum: { debit: true, credit: true }
    });
    return new Map(grouped.map((g) => [g.accountId, { debit: decimalToPesewas(g._sum.debit), credit: decimalToPesewas(g._sum.credit) }]));
  }
}

function money(r: TrialBalanceRow) {
  return {
    ...r,
    openingDebit: pesewasToNumber(r.openingDebit),
    openingCredit: pesewasToNumber(r.openingCredit),
    debit: pesewasToNumber(r.debit),
    credit: pesewasToNumber(r.credit),
    closingDebit: pesewasToNumber(r.closingDebit),
    closingCredit: pesewasToNumber(r.closingCredit)
  };
}

function moneyTotals(t: Record<string, number>) {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, pesewasToNumber(v)]));
}
