import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { roundMoney } from "../../common/utils/money";

// Pass either `this.prisma` or an open transaction `tx`: posting inside the business transaction
// means "invoice issued" and "invoice in the books" can never disagree.
type Db = Prisma.TransactionClient;
export type LedgerCtx = { companyId: string; userId: string };

/** Standard accounts. They are created on first use if the company does not have them yet. */
export const GL = {
  CASH: "1010",
  PETTY_CASH: "1015",
  BANK: "1020",
  MOBILE_MONEY: "1030",
  AR: "1100",
  INVENTORY: "1200",
  AP: "2000",
  SALARIES_PAYABLE: "2100",
  PAYE_PAYABLE: "2110",
  SSNIT_PAYABLE: "2120",
  CUSTOMER_CREDIT: "2200",
  CAPITAL: "3000",
  RETAINED_EARNINGS: "3100",
  SALES: "4000",
  OTHER_INCOME: "4100",
  SALES_RETURNS: "4900",
  COGS: "5000",
  PURCHASES: "5100",
  SALARIES: "6000",
  GENERAL_EXPENSE: "6900",
} as const;

const DEFAULT_ACCOUNTS: Record<string, { name: string; type: AccountType; description: string }> = {
  "1010": { name: "Cash on Hand", type: "ASSET", description: "Cash held by the business" },
  "1015": { name: "Petty Cash", type: "ASSET", description: "Petty cash float" },
  "1020": { name: "Bank Accounts", type: "ASSET", description: "Money in the bank (all accounts)" },
  "1030": { name: "Mobile Money", type: "ASSET", description: "Mobile money wallets" },
  "1100": { name: "Accounts Receivable", type: "ASSET", description: "Money customers owe us on invoices" },
  "1200": { name: "Inventory", type: "ASSET", description: "Stock on hand (set by the period-end stock adjustment)" },
  "2000": { name: "Accounts Payable", type: "LIABILITY", description: "Money we owe suppliers" },
  "2100": { name: "Salaries Payable", type: "LIABILITY", description: "Net pay owed to staff" },
  "2110": { name: "PAYE Tax Payable", type: "LIABILITY", description: "Income tax withheld from staff" },
  "2120": { name: "SSNIT Payable", type: "LIABILITY", description: "Pension contributions withheld" },
  "2200": { name: "Customer Deposits & Credits", type: "LIABILITY", description: "Customer money held or credit owed to them" },
  "3000": { name: "Owner's Capital", type: "EQUITY", description: "Capital put into the business" },
  "3100": { name: "Retained Earnings", type: "EQUITY", description: "Profit kept in the business" },
  "4000": { name: "Sales Revenue", type: "REVENUE", description: "Income from sales" },
  "4100": { name: "Other Income", type: "REVENUE", description: "Income that is not sales" },
  "4900": { name: "Sales Returns & Allowances", type: "REVENUE", description: "Sales taken back (reduces revenue)" },
  "5000": { name: "Cost of Goods Sold", type: "EXPENSE", description: "Stock used up (from the period-end stock adjustment)" },
  "5100": { name: "Purchases", type: "EXPENSE", description: "Goods and materials bought from suppliers" },
  "6000": { name: "Salaries & Wages", type: "EXPENSE", description: "Staff pay" },
  "6900": { name: "General Expenses", type: "EXPENSE", description: "Expenses with no specific account" },
};

export type PostLine = { code?: string; accountId?: string; debit?: number; credit?: number; memo?: string };
export type PostInput = LedgerCtx & {
  sourceModule: string;
  sourceId: string;
  entryDate: Date;
  description: string;
  lines: PostLine[];
  type?: "STANDARD" | "ADJUSTMENT" | "OPENING" | "CLOSING";
};

// Entries that are part of the books: posted ones and the originals that were later reversed (the
// reversal entry offsets them). Drafts and cancelled entries are not.
const COUNTED_STATUSES: ("POSTED" | "REVERSED")[] = ["POSTED", "REVERSED"];

export function cashAccountFor(method?: string | null): string {
  if (method === "CASH") return GL.CASH;
  if (method === "MOBILE_MONEY") return GL.MOBILE_MONEY;
  return GL.BANK; // bank transfer, cheque, card: it went through a bank
}

export function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setUTCHours(23, 59, 59, 999);
  return e;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Period lock ────────────────────────────────────────────────────────────

  async lockedThrough(db: Db, companyId: string): Promise<Date | null> {
    const row = await db.systemSetting.findFirst({ where: { companyId, key: "finance.settings", deletedAt: null }, select: { value: true } });
    const v = (row?.value as { lockedThrough?: string } | null)?.lockedThrough;
    return v ? new Date(v) : null;
  }

  /** Refuses to write into a closed period, so reported months cannot quietly change. */
  async assertOpenPeriod(db: Db, companyId: string, entryDate: Date) {
    const locked = await this.lockedThrough(db, companyId);
    if (locked && entryDate.getTime() <= endOfDay(locked).getTime()) {
      throw new BadRequestException(`The books are closed through ${locked.toISOString().slice(0, 10)}. Use a date after that.`);
    }
  }

  async getSettings(companyId: string) {
    const locked = await this.lockedThrough(this.prisma, companyId);
    return { lockedThrough: locked ? locked.toISOString().slice(0, 10) : null };
  }

  async setLockedThrough(companyId: string, userId: string, date: string | null) {
    if (date && Number.isNaN(new Date(date).getTime())) throw new BadRequestException("That is not a valid date.");
    if (date && new Date(date).getTime() > Date.now()) throw new BadRequestException("You can only close periods that have already ended.");
    const existing = await this.prisma.systemSetting.findFirst({ where: { companyId, key: "finance.settings", deletedAt: null } });
    const value = { ...((existing?.value as object | null) ?? {}), lockedThrough: date } as Prisma.InputJsonValue;
    if (existing) await this.prisma.systemSetting.update({ where: { id: existing.id }, data: { value, updatedById: userId } });
    else await this.prisma.systemSetting.create({ data: { companyId, key: "finance.settings", value, description: "Finance settings", createdById: userId } });
    return this.getSettings(companyId);
  }

  // ─── Accounts ───────────────────────────────────────────────────────────────

  async ensureAccounts(db: Db, companyId: string, codes: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    const found = await db.account.findMany({ where: { companyId, code: { in: unique }, deletedAt: null }, select: { id: true, code: true } });
    const map = new Map(found.map((a) => [a.code, a.id]));
    for (const code of unique) {
      if (map.has(code)) continue;
      const def = DEFAULT_ACCOUNTS[code];
      if (!def) throw new BadRequestException(`Account ${code} is not set up.`);
      try {
        const created = await db.account.create({ data: { companyId, code, name: def.name, type: def.type, description: def.description } });
        map.set(code, created.id);
      } catch (err) {
        if ((err as { code?: string })?.code !== "P2002") throw err;
        const again = await db.account.findFirst({ where: { companyId, code, deletedAt: null }, select: { id: true } });
        if (!again) throw err;
        map.set(code, again.id);
      }
    }
    return map;
  }

  // ─── Posting ────────────────────────────────────────────────────────────────

  /**
   * Writes one balanced, POSTED journal entry for a business event. Safe to call twice for the same
   * event: (company, sourceModule, sourceId) is unique, so a retry returns the existing entry.
   */
  async post(db: Db, input: PostInput): Promise<{ id: string; reference: string } | null> {
    const lines = input.lines
      .map((l) => ({ ...l, debit: roundMoney(l.debit ?? 0), credit: roundMoney(l.credit ?? 0) }))
      .filter((l) => l.debit > 0 || l.credit > 0);
    const totalDebit = roundMoney(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundMoney(lines.reduce((s, l) => s + l.credit, 0));
    if (totalDebit === 0 && totalCredit === 0) return null; // nothing to record
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(`Ledger entry for ${input.sourceModule} does not balance (debit ${totalDebit}, credit ${totalCredit}).`);
    }

    const existing = await db.journalEntry.findFirst({ where: { companyId: input.companyId, sourceModule: input.sourceModule, sourceId: input.sourceId }, select: { id: true, reference: true } });
    if (existing) return existing;

    await this.assertOpenPeriod(db, input.companyId, input.entryDate);
    const codes = lines.filter((l) => l.code).map((l) => l.code!) as string[];
    const accounts = await this.ensureAccounts(db, input.companyId, codes);
    const reference = await nextRef(db as never, input.companyId, "JE");

    try {
      const entry = await db.journalEntry.create({
        data: {
          companyId: input.companyId,
          reference,
          entryDate: input.entryDate,
          description: input.description.slice(0, 240),
          type: input.type ?? "STANDARD",
          status: "POSTED",
          totalDebit,
          totalCredit,
          sourceModule: input.sourceModule,
          sourceId: input.sourceId,
          postedById: input.userId,
          createdById: input.userId,
          lines: {
            create: lines.map((l, i) => ({
              accountId: l.accountId ?? accounts.get(l.code!)!,
              description: l.memo?.slice(0, 240),
              debit: l.debit,
              credit: l.credit,
              sequence: i + 1,
            })),
          },
        },
        select: { id: true, reference: true },
      });
      return entry;
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        const again = await db.journalEntry.findFirst({ where: { companyId: input.companyId, sourceModule: input.sourceModule, sourceId: input.sourceId }, select: { id: true, reference: true } });
        if (again) return again;
      }
      throw err;
    }
  }

  /** Offsets an earlier automatic posting (voided invoice, cancelled expense) with a mirror entry. */
  async reverseBySource(db: Db, ctx: LedgerCtx, sourceModule: string, sourceId: string, reason: string, when = new Date()) {
    const original = await db.journalEntry.findFirst({
      where: { companyId: ctx.companyId, sourceModule, sourceId, status: "POSTED" },
      include: { lines: true },
    });
    if (!original) return null; // never posted, or already reversed: nothing to undo
    await this.assertOpenPeriod(db, ctx.companyId, when);
    const reference = await nextRef(db as never, ctx.companyId, "JE");
    const claimed = await db.journalEntry.updateMany({ where: { id: original.id, status: "POSTED" }, data: { status: "REVERSED", updatedById: ctx.userId } });
    if (claimed.count === 0) return null;
    return db.journalEntry.create({
      data: {
        companyId: ctx.companyId,
        reference,
        entryDate: when,
        description: `Reversal of ${original.reference}: ${reason}`.slice(0, 240),
        type: "REVERSAL",
        status: "POSTED",
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        sourceModule: `${sourceModule}:REV`,
        sourceId,
        reversalOf: original.id,
        notes: reason.slice(0, 500),
        postedById: ctx.userId,
        createdById: ctx.userId,
        lines: { create: original.lines.map((l) => ({ accountId: l.accountId, description: l.description, debit: l.credit, credit: l.debit, sequence: l.sequence })) },
      },
      select: { id: true, reference: true },
    });
  }

  // ─── One recipe per business event ──────────────────────────────────────────
  // (No VAT: the business does not charge it. Income is recognised when invoiced.)

  salesInvoice(db: Db, ctx: LedgerCtx, inv: { id: string; invoiceNumber: string; invoiceDate: Date; totalAmount: unknown }) {
    const total = Number(inv.totalAmount);
    return this.post(db, { ...ctx, sourceModule: "SALES_INVOICE", sourceId: inv.id, entryDate: inv.invoiceDate, description: `Sales invoice ${inv.invoiceNumber}`,
      lines: [{ code: GL.AR, debit: total, memo: inv.invoiceNumber }, { code: GL.SALES, credit: total, memo: inv.invoiceNumber }] });
  }

  salesInvoiceVoid(db: Db, ctx: LedgerCtx, inv: { id: string; invoiceNumber: string }) {
    return this.reverseBySource(db, ctx, "SALES_INVOICE", inv.id, `Invoice ${inv.invoiceNumber} voided`);
  }

  // Money in from a customer: it settles the invoice (receivable) when linked to one, otherwise it is held as
  // a customer credit (a liability) until someone applies it.
  customerPayment(db: Db, ctx: LedgerCtx, p: { id: string; reference: string; paymentDate: Date; amount: unknown; method?: string | null; invoiceId?: string | null }, sourceModule = "SALES_PAYMENT") {
    const amount = Number(p.amount);
    return this.post(db, { ...ctx, sourceModule, sourceId: p.id, entryDate: p.paymentDate, description: `Customer payment ${p.reference}`,
      lines: [{ code: cashAccountFor(p.method), debit: amount, memo: p.reference }, { code: p.invoiceId ? GL.AR : GL.CUSTOMER_CREDIT, credit: amount, memo: p.reference }] });
  }

  salesReturn(db: Db, ctx: LedgerCtx, r: { id: string; date: Date; totalAmount: unknown; appliedToInvoice: number; label: string }) {
    const total = Number(r.totalAmount);
    const toInvoice = Math.min(total, Math.max(0, r.appliedToInvoice));
    return this.post(db, { ...ctx, sourceModule: "SALES_RETURN", sourceId: r.id, entryDate: r.date, description: `Sales return ${r.label}`,
      lines: [{ code: GL.SALES_RETURNS, debit: total, memo: r.label }, { code: GL.AR, credit: toInvoice }, { code: GL.CUSTOMER_CREDIT, credit: roundMoney(total - toInvoice) }] });
  }

  // Goods are recorded as Purchases when the supplier's bill is entered; the stock actually on hand is brought
  // into the books by the period-end stock adjustment.
  supplierInvoice(db: Db, ctx: LedgerCtx, i: { id: string; reference: string; invoiceDate: Date; totalAmount: unknown }) {
    const total = Number(i.totalAmount);
    return this.post(db, { ...ctx, sourceModule: "SUPPLIER_INVOICE", sourceId: i.id, entryDate: i.invoiceDate, description: `Supplier invoice ${i.reference}`,
      lines: [{ code: GL.PURCHASES, debit: total, memo: i.reference }, { code: GL.AP, credit: total, memo: i.reference }] });
  }

  supplierPayment(db: Db, ctx: LedgerCtx, p: { id: string; reference: string; paymentDate: Date; amount: unknown; method?: string | null }, sourceModule = "PROCUREMENT_PAYMENT") {
    const amount = Number(p.amount);
    return this.post(db, { ...ctx, sourceModule, sourceId: p.id, entryDate: p.paymentDate, description: `Supplier payment ${p.reference}`,
      lines: [{ code: GL.AP, debit: amount, memo: p.reference }, { code: cashAccountFor(p.method), credit: amount, memo: p.reference }] });
  }

  expense(db: Db, ctx: LedgerCtx, e: { id: string; reference: string; expenseDate: Date; amount: unknown; paymentMethod?: string | null; accountId?: string | null; description: string }) {
    const amount = Number(e.amount);
    return this.post(db, { ...ctx, sourceModule: "EXPENSE", sourceId: e.id, entryDate: e.expenseDate, description: `Expense ${e.reference}: ${e.description}`,
      lines: [e.accountId ? { accountId: e.accountId, debit: amount, memo: e.description } : { code: GL.GENERAL_EXPENSE, debit: amount, memo: e.description }, { code: cashAccountFor(e.paymentMethod), credit: amount, memo: e.reference }] });
  }

  expenseCancel(db: Db, ctx: LedgerCtx, e: { id: string; reference: string }, reason: string) {
    return this.reverseBySource(db, ctx, "EXPENSE", e.id, `Expense ${e.reference} cancelled: ${reason}`);
  }

  // Payroll is recognised when approved (cost and what is owed), and settled when paid.
  payrollApproved(db: Db, ctx: LedgerCtx, r: { id: string; reference: string; employeeName: string; period: string; grossPay: unknown; taxDeduction: unknown; ssnit: unknown; netPay: unknown; date: Date }) {
    const gross = Number(r.grossPay);
    const tax = Number(r.taxDeduction ?? 0);
    const ssnit = Number(r.ssnit ?? 0);
    const net = Number(r.netPay);
    return this.post(db, { ...ctx, sourceModule: "PAYROLL_ACCRUAL", sourceId: r.id, entryDate: r.date, description: `Payroll ${r.period}: ${r.employeeName}`,
      lines: [{ code: GL.SALARIES, debit: roundMoney(net + tax + ssnit), memo: r.reference }, { code: GL.SALARIES_PAYABLE, credit: net }, { code: GL.PAYE_PAYABLE, credit: tax }, { code: GL.SSNIT_PAYABLE, credit: ssnit }] });
  }

  payrollPaid(db: Db, ctx: LedgerCtx, r: { id: string; reference: string; employeeName: string; netPay: unknown; paymentDate: Date; paymentMethod?: string | null }) {
    const net = Number(r.netPay);
    return this.post(db, { ...ctx, sourceModule: "PAYROLL_PAYMENT", sourceId: r.id, entryDate: r.paymentDate, description: `Salary paid: ${r.employeeName}`,
      lines: [{ code: GL.SALARIES_PAYABLE, debit: net, memo: r.reference }, { code: cashAccountFor(r.paymentMethod), credit: net, memo: r.reference }] });
  }

  pettyCash(db: Db, ctx: LedgerCtx, t: { id: string; reference: string; type: string; amount: unknown; date: Date; accountId?: string | null; description: string }) {
    const amount = Number(t.amount);
    const topUp = t.type === "FUNDING" || t.type === "REPLENISHMENT";
    return this.post(db, { ...ctx, sourceModule: "PETTY_CASH", sourceId: t.id, entryDate: t.date, description: `Petty cash ${t.reference}: ${t.description}`,
      lines: topUp
        ? [{ code: GL.PETTY_CASH, debit: amount, memo: t.reference }, { code: GL.CASH, credit: amount, memo: t.reference }]
        : [t.accountId ? { accountId: t.accountId, debit: amount, memo: t.description } : { code: GL.GENERAL_EXPENSE, debit: amount, memo: t.description }, { code: GL.PETTY_CASH, credit: amount, memo: t.reference }] });
  }

  // ─── Reports (all read from the ledger) ─────────────────────────────────────

  private lineWhere(companyId: string, range: { from?: Date; to?: Date }): Prisma.JournalEntryLineWhereInput {
    return {
      journalEntry: {
        companyId,
        deletedAt: null,
        status: { in: COUNTED_STATUSES },
        ...(range.from || range.to ? { entryDate: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: endOfDay(range.to) } : {}) } } : {}),
      },
    };
  }

  private async balances(companyId: string, range: { from?: Date; to?: Date }) {
    const [sums, accounts] = await Promise.all([
      this.prisma.journalEntryLine.groupBy({ by: ["accountId"], where: this.lineWhere(companyId, range), _sum: { debit: true, credit: true } }),
      this.prisma.account.findMany({ where: { companyId, deletedAt: null }, select: { id: true, code: true, name: true, type: true, parentId: true }, orderBy: { code: "asc" } }),
    ]);
    const byId = new Map(sums.map((s) => [s.accountId, { debit: Number(s._sum.debit ?? 0), credit: Number(s._sum.credit ?? 0) }]));
    return accounts
      .map((a) => {
        const s = byId.get(a.id) ?? { debit: 0, credit: 0 };
        return { ...a, debit: roundMoney(s.debit), credit: roundMoney(s.credit) };
      })
      .filter((a) => a.debit !== 0 || a.credit !== 0);
  }

  async trialBalance(companyId: string, asOf?: Date) {
    const rows = (await this.balances(companyId, { to: asOf })).map((a) => {
      const net = roundMoney(a.debit - a.credit);
      return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit: a.debit, credit: a.credit, balanceDebit: net > 0 ? net : 0, balanceCredit: net < 0 ? -net : 0 };
    });
    const totalDebit = roundMoney(rows.reduce((s, r) => s + r.balanceDebit, 0));
    const totalCredit = roundMoney(rows.reduce((s, r) => s + r.balanceCredit, 0));
    return { asOf: asOf ?? null, rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
  }

  async incomeStatement(companyId: string, from: Date, to: Date) {
    const rows = (await this.balances(companyId, { from, to })).filter((a) => a.type === "REVENUE" || a.type === "EXPENSE");
    const revenue = rows.filter((a) => a.type === "REVENUE").map((a) => ({ code: a.code, name: a.name, amount: roundMoney(a.credit - a.debit) }));
    const expenses = rows.filter((a) => a.type === "EXPENSE").map((a) => ({ code: a.code, name: a.name, amount: roundMoney(a.debit - a.credit) }));
    const totalRevenue = roundMoney(revenue.reduce((s, r) => s + r.amount, 0));
    const totalExpenses = roundMoney(expenses.reduce((s, r) => s + r.amount, 0));
    return { from, to, revenue, expenses, totalRevenue, totalExpenses, netProfit: roundMoney(totalRevenue - totalExpenses) };
  }

  async balanceSheet(companyId: string, asOf: Date) {
    const rows = await this.balances(companyId, { to: asOf });
    const side = (type: AccountType, normal: "debit" | "credit") =>
      rows.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: roundMoney(normal === "debit" ? a.debit - a.credit : a.credit - a.debit) })).filter((a) => a.amount !== 0);
    const assets = side("ASSET", "debit");
    const liabilities = side("LIABILITY", "credit");
    const equity = side("EQUITY", "credit");
    const revenue = rows.filter((a) => a.type === "REVENUE").reduce((s, a) => s + (a.credit - a.debit), 0);
    const expense = rows.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + (a.debit - a.credit), 0);
    const currentEarnings = roundMoney(revenue - expense); // profit not yet closed into Retained Earnings
    const totalAssets = roundMoney(assets.reduce((s, a) => s + a.amount, 0));
    const totalLiabilities = roundMoney(liabilities.reduce((s, a) => s + a.amount, 0));
    const totalEquity = roundMoney(equity.reduce((s, a) => s + a.amount, 0) + currentEarnings);
    return { asOf, assets, liabilities, equity, currentEarnings, totalAssets, totalLiabilities, totalEquity, balanced: roundMoney(totalAssets - totalLiabilities - totalEquity) === 0 };
  }

  async generalLedger(companyId: string, accountId: string, from?: Date, to?: Date) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId, deletedAt: null } });
    if (!account) throw new BadRequestException("Account not found.");
    const debitNormal = account.type === "ASSET" || account.type === "EXPENSE";
    const opening = from
      ? await this.prisma.journalEntryLine.aggregate({ where: { accountId, ...this.lineWhere(companyId, { to: new Date(from.getTime() - 1) }) }, _sum: { debit: true, credit: true } })
      : null;
    let running = roundMoney(Number(opening?._sum.debit ?? 0) - Number(opening?._sum.credit ?? 0));
    const openingBalance = running;
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { accountId, ...this.lineWhere(companyId, { from, to }) },
      include: { journalEntry: { select: { reference: true, entryDate: true, description: true, sourceModule: true, status: true } } },
      orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { createdAt: "asc" } }, { sequence: "asc" }],
      take: 2000,
    });
    const rows = lines.map((l) => {
      running = roundMoney(running + Number(l.debit) - Number(l.credit));
      return { date: l.journalEntry.entryDate, reference: l.journalEntry.reference, description: l.description ?? l.journalEntry.description, source: l.journalEntry.sourceModule, debit: Number(l.debit), credit: Number(l.credit), balance: debitNormal ? running : -running };
    });
    return { account: { id: account.id, code: account.code, name: account.name, type: account.type }, openingBalance: debitNormal ? openingBalance : -openingBalance, rows, closingBalance: debitNormal ? running : -running, truncated: lines.length === 2000 };
  }

  /** Does the ledger agree with the sub-ledgers (invoices owed to us, bills we owe)? */
  async health(companyId: string) {
    const [tb, arSub, apSub, postedSources] = await Promise.all([
      this.trialBalance(companyId),
      this.prisma.invoice.aggregate({ where: { companyId, deletedAt: null, status: { notIn: ["DRAFT", "VOID"] } }, _sum: { balanceDue: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { companyId, deletedAt: null }, _sum: { balanceDue: true } }),
      this.prisma.journalEntry.groupBy({ by: ["sourceModule"], where: { companyId, deletedAt: null, sourceModule: { not: null } }, _count: true }),
    ]);
    const bal = (code: string) => {
      const r = tb.rows.find((x) => x.code === code);
      return r ? roundMoney(r.balanceDebit - r.balanceCredit) : 0;
    };
    const arLedger = bal(GL.AR);
    const apLedger = roundMoney(-bal(GL.AP));
    const arSubledger = roundMoney(Number(arSub._sum.balanceDue ?? 0));
    const apSubledger = roundMoney(Number(apSub._sum.balanceDue ?? 0));
    return {
      trialBalanceBalanced: tb.balanced,
      receivables: { ledger: arLedger, subledger: arSubledger, difference: roundMoney(arLedger - arSubledger) },
      payables: { ledger: apLedger, subledger: apSubledger, difference: roundMoney(apLedger - apSubledger) },
      postedBySource: Object.fromEntries(postedSources.map((s) => [s.sourceModule ?? "MANUAL", s._count])),
    };
  }
}
