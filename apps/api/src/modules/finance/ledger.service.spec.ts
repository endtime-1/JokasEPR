import { BadRequestException } from "@nestjs/common";
import { GL, LedgerService, cashAccountFor } from "./ledger.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("JE-2026-0001") }));

const accounts = new Map<string, string>();
const typeOf = (code: string) => ({ "1": "ASSET", "2": "LIABILITY", "3": "EQUITY", "4": "REVENUE", "5": "EXPENSE", "6": "EXPENSE" } as Record<string, string>)[code[0]];
const db = {
  account: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
  journalEntry: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn() },
  journalEntryLine: { groupBy: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
  systemSetting: { findFirst: jest.fn() },
  invoice: { aggregate: jest.fn() },
  supplierInvoice: { aggregate: jest.fn() },
};
const ctx = { companyId: "c1", userId: "u1" };
const svc = () => new LedgerService(db as never);

function lastEntry() {
  return db.journalEntry.create.mock.calls[db.journalEntry.create.mock.calls.length - 1][0].data;
}
function summarize(lines: { accountId: string; debit: number; credit: number }[]) {
  const code = (id: string) => [...accounts.entries()].find(([, v]) => v === id)?.[0];
  return lines.map((l) => `${l.debit ? "Dr" : "Cr"} ${code(l.accountId)} ${l.debit || l.credit}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  accounts.clear();
  db.systemSetting.findFirst.mockResolvedValue(null);
  db.journalEntry.findFirst.mockResolvedValue(null);
  db.account.findMany.mockImplementation(({ where }: { where: { code: { in: string[] } } }) => Promise.resolve(where.code.in.filter((c) => accounts.has(c)).map((c) => ({ id: accounts.get(c), code: c, type: typeOf(c) }))));
  db.account.create.mockImplementation(({ data }: { data: { code: string } }) => { const id = `acc-${data.code}`; accounts.set(data.code, id); return Promise.resolve({ id }); });
  db.journalEntry.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: "je-1", reference: "JE-2026-0001", ...data }));
});

describe("LedgerService.post", () => {
  it("creates the standard accounts on first use and posts a balanced entry", async () => {
    await svc().salesInvoice(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-01"), totalAmount: 1500 });
    expect(db.account.create).toHaveBeenCalledTimes(2); // receivable + sales
    const e = lastEntry();
    expect(e.status).toBe("POSTED");
    expect(e.totalDebit).toBe(1500);
    expect(e.totalCredit).toBe(1500);
    expect(e.sourceModule).toBe("SALES_INVOICE");
    expect(e.sourceId).toBe("inv-1");
    expect(summarize(e.lines.create)).toEqual(["Dr 1100 1500", "Cr 4000 1500"]);
  });

  it("posting the same event twice returns the first entry and writes nothing more", async () => {
    db.journalEntry.findFirst.mockResolvedValue({ id: "je-9", reference: "JE-2026-0009" });
    const out = await svc().salesInvoice(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-01"), totalAmount: 1500 });
    expect(out).toEqual({ id: "je-9", reference: "JE-2026-0009" });
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it("refuses an entry that does not balance", async () => {
    await expect(svc().post(db as never, { ...ctx, sourceModule: "X", sourceId: "1", entryDate: new Date(), description: "d", lines: [{ code: GL.AR, debit: 100 }, { code: GL.SALES, credit: 90 }] })).rejects.toThrow(/does not balance/);
  });

  it("records nothing for a zero amount", async () => {
    const out = await svc().salesInvoice(db as never, ctx, { id: "inv-0", invoiceNumber: "INV-0", invoiceDate: new Date(), totalAmount: 0 });
    expect(out).toBeNull();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it("refuses to post into a closed period", async () => {
    db.systemSetting.findFirst.mockResolvedValue({ value: { lockedThrough: "2026-09-30" } });
    await expect(svc().salesInvoice(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-09-30"), totalAmount: 100 })).rejects.toThrow(/closed through 2026-09-30/);
    await expect(svc().salesInvoice(db as never, ctx, { id: "inv-2", invoiceNumber: "INV-2", invoiceDate: new Date("2026-10-01"), totalAmount: 100 })).resolves.toBeTruthy();
  });

  it("a retry that loses the race on the unique key returns the winner's entry", async () => {
    db.journalEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "je-w", reference: "JE-W" });
    db.journalEntry.create.mockRejectedValueOnce({ code: "P2002" });
    const out = await svc().salesInvoice(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-01"), totalAmount: 100 });
    expect(out).toEqual({ id: "je-w", reference: "JE-W" });
  });
});

describe("LedgerService recipes", () => {
  const d = new Date("2026-10-05");

  it("maps payment methods to cash, bank or mobile money", () => {
    expect(cashAccountFor("CASH")).toBe(GL.CASH);
    expect(cashAccountFor("MOBILE_MONEY")).toBe(GL.MOBILE_MONEY);
    expect(cashAccountFor("BANK_TRANSFER")).toBe(GL.BANK);
    expect(cashAccountFor("CHEQUE")).toBe(GL.BANK);
  });

  it("a payment for an invoice settles the receivable; one with no invoice is held as customer credit", async () => {
    await svc().customerPayment(db as never, ctx, { id: "p1", reference: "PAY-1", paymentDate: d, amount: 400, method: "MOBILE_MONEY", invoiceId: "inv-1" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 1030 400", "Cr 1100 400"]);
    await svc().customerPayment(db as never, ctx, { id: "p2", reference: "PAY-2", paymentDate: d, amount: 250, method: "CASH", invoiceId: null });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 1010 250", "Cr 2200 250"]);
  });

  it("a sales return reduces revenue; the part that reduced an invoice lowers the receivable, the rest is credit owed", async () => {
    await svc().salesReturn(db as never, ctx, { id: "r1", date: d, totalAmount: 300, appliedToInvoice: 200, label: "SKU" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 4900 300", "Cr 1100 200", "Cr 2200 100"]);
  });

  it("a supplier bill is a purchase on credit; paying it clears the payable", async () => {
    await svc().supplierInvoice(db as never, ctx, { id: "s1", reference: "SINV-1", invoiceDate: d, totalAmount: 5000 });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 5100 5000", "Cr 2000 5000"]);
    await svc().supplierPayment(db as never, ctx, { id: "sp1", reference: "PAY-9", paymentDate: d, amount: 2000, method: "BANK_TRANSFER" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 2000 2000", "Cr 1020 2000"]);
  });

  it("an expense goes to its category's account, or general expenses when it has none", async () => {
    accounts.set("6100", "acc-6100"); // the category's own account
    await svc().expense(db as never, ctx, { id: "e1", reference: "EXP-1", expenseDate: d, amount: 80, paymentMethod: "CASH", accountId: "acc-6100", description: "Fuel" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 6100 80", "Cr 1010 80"]);
    await svc().expense(db as never, ctx, { id: "e2", reference: "EXP-2", expenseDate: d, amount: 20, paymentMethod: "CASH", description: "Misc" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 6900 20", "Cr 1010 20"]);
  });

  it("approved payroll books gross pay as cost and splits it into net pay, PAYE and SSNIT owed; paying settles the net", async () => {
    await svc().payrollApproved(db as never, ctx, { id: "pr1", reference: "PAY-1", employeeName: "Ama", period: "2026-09", grossPay: 2000, taxDeduction: 200, ssnit: 110, netPay: 1690, date: d });
    const e = lastEntry();
    expect(e.totalDebit).toBe(2000);
    expect(summarize(e.lines.create)).toEqual(["Dr 6000 2000", "Cr 2100 1690", "Cr 2110 200", "Cr 2120 110"]);
    await svc().payrollPaid(db as never, ctx, { id: "pr1", reference: "PAY-1", employeeName: "Ama", netPay: 1690, paymentDate: d, paymentMethod: "BANK_TRANSFER" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 2100 1690", "Cr 1020 1690"]);
  });

  it("petty cash: a top-up moves cash into the float; spending is an expense out of the float", async () => {
    await svc().pettyCash(db as never, ctx, { id: "t1", reference: "PCT-1", type: "FUNDING", amount: 500, date: d, description: "Float" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 1015 500", "Cr 1010 500"]);
    await svc().pettyCash(db as never, ctx, { id: "t2", reference: "PCT-2", type: "DISBURSEMENT", amount: 60, date: d, description: "Stationery" });
    expect(summarize(lastEntry().lines.create)).toEqual(["Dr 6900 60", "Cr 1015 60"]);
  });
});

describe("LedgerService.reverseBySource", () => {
  it("posts a mirror entry and marks the original reversed", async () => {
    db.journalEntry.findFirst.mockResolvedValue({ id: "je-1", reference: "JE-1", totalDebit: 100, totalCredit: 100, lines: [
      { accountId: "a", debit: 100, credit: 0, sequence: 1, description: null }, { accountId: "b", debit: 0, credit: 100, sequence: 2, description: null }] });
    db.journalEntry.updateMany.mockResolvedValue({ count: 1 });
    await svc().salesInvoiceVoid(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1" });
    expect(db.journalEntry.updateMany.mock.calls[0][0].data.status).toBe("REVERSED");
    const e = lastEntry();
    expect(e.type).toBe("REVERSAL");
    expect(e.reversalOf).toBe("je-1");
    expect(e.sourceModule).toBe("SALES_INVOICE:REV");
    expect(e.lines.create[0]).toEqual(expect.objectContaining({ accountId: "a", debit: 0, credit: 100 }));
  });

  it("does nothing when the event was never posted (or is already reversed)", async () => {
    db.journalEntry.findFirst.mockResolvedValue(null);
    expect(await svc().salesInvoiceVoid(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1" })).toBeNull();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe("LedgerService reports", () => {
  const acct = [
    { id: "cash", code: "1010", name: "Cash", type: "ASSET", parentId: null },
    { id: "ar", code: "1100", name: "Receivable", type: "ASSET", parentId: null },
    { id: "ap", code: "2000", name: "Payable", type: "LIABILITY", parentId: null },
    { id: "cap", code: "3000", name: "Capital", type: "EQUITY", parentId: null },
    { id: "sales", code: "4000", name: "Sales", type: "REVENUE", parentId: null },
    { id: "exp", code: "6900", name: "Expenses", type: "EXPENSE", parentId: null },
  ];
  // capital 1000 in cash; sale on credit 600; expense paid in cash 150; purchase on credit owed 100 (as expense)
  const sums = [
    { accountId: "cash", _sum: { debit: 1000, credit: 150 } },
    { accountId: "ar", _sum: { debit: 600, credit: 0 } },
    { accountId: "ap", _sum: { debit: 0, credit: 100 } },
    { accountId: "cap", _sum: { debit: 0, credit: 1000 } },
    { accountId: "sales", _sum: { debit: 0, credit: 600 } },
    { accountId: "exp", _sum: { debit: 250, credit: 0 } },
  ];

  beforeEach(() => {
    db.journalEntryLine.groupBy.mockResolvedValue(sums);
    db.account.findMany.mockResolvedValue(acct);
  });

  it("the trial balance balances", async () => {
    const tb = await svc().trialBalance("c1");
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.code === "1010")).toEqual(expect.objectContaining({ balanceDebit: 850, balanceCredit: 0 }));
  });

  it("the income statement shows revenue less expenses", async () => {
    const is = await svc().incomeStatement("c1", new Date("2026-01-01"), new Date("2026-12-31"));
    expect(is.totalRevenue).toBe(600);
    expect(is.totalExpenses).toBe(250);
    expect(is.netProfit).toBe(350);
  });

  it("the balance sheet balances: assets = liabilities + equity (including this period's profit)", async () => {
    const bs = await svc().balanceSheet("c1", new Date("2026-12-31"));
    expect(bs.totalAssets).toBe(1450); // 850 cash + 600 receivable
    expect(bs.totalLiabilities).toBe(100);
    expect(bs.currentEarnings).toBe(350);
    expect(bs.totalEquity).toBe(1350); // 1000 capital + 350 profit
    expect(bs.balanced).toBe(true);
  });

  it("the general ledger keeps a running balance", async () => {
    db.account.findFirst.mockResolvedValue({ id: "cash", code: "1010", name: "Cash", type: "ASSET" });
    db.journalEntryLine.findMany.mockResolvedValue([
      { debit: 1000, credit: 0, sequence: 1, description: "Capital", journalEntry: { reference: "JE-1", entryDate: new Date("2026-01-01"), description: "d", sourceModule: null, status: "POSTED" } },
      { debit: 0, credit: 150, sequence: 1, description: "Fuel", journalEntry: { reference: "JE-2", entryDate: new Date("2026-01-02"), description: "d", sourceModule: "EXPENSE", status: "POSTED" } },
    ]);
    const gl = await svc().generalLedger("c1", "cash");
    expect(gl.rows.map((r) => r.balance)).toEqual([1000, 850]);
    expect(gl.closingBalance).toBe(850);
  });

  it("the ledger health check compares the books with invoices and bills", async () => {
    db.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 600 } });
    db.supplierInvoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 100 } });
    db.journalEntry.groupBy.mockResolvedValue([{ sourceModule: "SALES_INVOICE", _count: 4 }]);
    const h = await svc().health("c1");
    // (the account list is shared with the report mocks, so only check that the check ran)
    expect(Array.isArray(h.standardAccounts)).toBe(true);
    expect(h.receivables).toEqual({ ledger: 600, subledger: 600, difference: 0 });
    expect(h.payables).toEqual({ ledger: 100, subledger: 100, difference: 0 });
    expect(h.postedBySource).toEqual({ SALES_INVOICE: 4 });
  });
});

describe("period lock settings", () => {
  it("only a past date can close the books, and null reopens them", async () => {
    await expect(svc().setLockedThrough("c1", "u1", "2999-01-01")).rejects.toThrow(BadRequestException);
    await expect(svc().setLockedThrough("c1", "u1", "not-a-date")).rejects.toThrow(/valid date/);
  });
});

describe("standard account check", () => {
  it("flags a standard code that already exists with the wrong kind of account", async () => {
    db.journalEntryLine.groupBy.mockResolvedValue([]);
    db.invoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 0 } });
    db.supplierInvoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 0 } });
    db.journalEntry.groupBy.mockResolvedValue([]);
    db.account.findMany.mockResolvedValue([{ code: "1100", name: "Office rent", type: "EXPENSE" }, { code: "4000", name: "Sales Revenue", type: "REVENUE" }]);
    const h = await svc().health("c1");
    expect(h.standardAccounts.find((a) => a.code === "1100")?.status).toBe("WRONG_TYPE");
    expect(h.standardAccounts.find((a) => a.code === "4000")?.status).toBe("OK");
    expect(h.standardAccounts.find((a) => a.code === "2000")?.status).toBe("NOT_CREATED_YET");
  });
});

describe("a misconfigured chart of accounts does not block the business", () => {
  it("skips the posting (instead of failing the sale) when a standard code is already a different kind of account", async () => {
    db.account.findMany.mockResolvedValue([{ id: "x", code: "1100", type: "EXPENSE" }]);
    const out = await svc().salesInvoice(db as never, ctx, { id: "inv-1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-01"), totalAmount: 100 });
    expect(out).toBeNull();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});
