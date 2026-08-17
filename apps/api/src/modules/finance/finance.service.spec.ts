import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { FinanceService } from "./finance.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-001") }));

const mockPrisma = {
  expense: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }) },
  revenue: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }) },
  supplierPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }), count: jest.fn().mockResolvedValue(0), create: jest.fn(), findFirst: jest.fn() },
  supplierInvoice: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { balanceDue: 0 }, _count: 0 }),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn()
  },
  customerPayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }), count: jest.fn().mockResolvedValue(0), create: jest.fn(), findFirst: jest.fn() },
  bankAccount: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn() },
  payrollRecord: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { netPay: 0 }, _count: 0 }) },
  pettyCashTransaction: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(0), create: jest.fn() },
  invoice: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn()
  },
  salesOrder: { update: jest.fn() },
  poultryCostRecord: { groupBy: jest.fn() },
  productProfitability: { create: jest.fn() },
  account: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  expenseCategory: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  journalEntryLine: { count: jest.fn().mockResolvedValue(0) },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma))
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new FinanceService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("FinanceService", () => {
  it("is defined with injected dependencies", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("FinanceService — branch scoping (H5)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("listExpenses applies an OR-null-or-allowed branch filter for a restricted user", async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);

    const service = makeService();
    await service.listExpenses(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ branchId: null }, { branchId: { in: ["branch-1"] } }]);
  });

  it("listExpenses applies no branch filter for a global-access user", async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);

    const service = makeService();
    await service.listExpenses(makeUser({ hasGlobalAccess: true }), {} as never);

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("getExpense returns not-found (via scoped where, not a thrown Forbidden) for an out-of-scope branch's expense", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue(null); // scoped query wouldn't match it
    const service = makeService();
    await expect(service.getExpense(makeUser({ branchIds: ["branch-1"] }), "exp-1")).rejects.toThrow("Expense not found");
    const where = mockPrisma.expense.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ branchId: null }, { branchId: { in: ["branch-1"] } }]);
  });

  it("createExpense rejects a branchId outside the actor's own scope", async () => {
    const service = makeService();
    await expect(
      service.createExpense(makeUser({ branchIds: ["branch-1"] }), { branchId: "branch-OTHER", amount: 100 } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });

  it("createRevenue rejects a branchId outside the actor's own scope", async () => {
    const service = makeService();
    await expect(
      service.createRevenue(makeUser({ branchIds: ["branch-1"] }), { branchId: "branch-OTHER", amount: 100 } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.revenue.create).not.toHaveBeenCalled();
  });

  it("createPayrollRecord rejects a branchId outside the actor's own scope", async () => {
    const service = makeService();
    await expect(
      service.createPayrollRecord(makeUser({ branchIds: ["branch-1"] }), { branchId: "branch-OTHER" } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.payrollRecord.create).not.toHaveBeenCalled();
  });
});

describe("FinanceService — self-approval guard (H11, finance half)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("blocks approveExpense when the actor submitted the expense themselves", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING_APPROVAL", submittedById: "user-1" });
    const service = makeService();
    await expect(service.approveExpense(makeUser({ id: "user-1" }), "exp-1", {} as never, {})).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.expense.update).not.toHaveBeenCalled();
  });

  it("blocks approvePayroll when the actor created the record themselves", async () => {
    mockPrisma.payrollRecord.findFirst.mockResolvedValue({ id: "pay-1", status: "DRAFT", createdById: "user-1" });
    const service = makeService();
    await expect(service.approvePayroll(makeUser({ id: "user-1" }), "pay-1", {} as never, {})).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.payrollRecord.update).not.toHaveBeenCalled();
  });

  it("allows approveExpense when a different user approves", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING_APPROVAL", submittedById: "creator-1", notes: null });
    mockPrisma.expense.update.mockResolvedValue({ id: "exp-1", status: "APPROVED" });
    const service = makeService();
    await expect(service.approveExpense(makeUser({ id: "approver-1" }), "exp-1", {} as never, {})).resolves.toBeDefined();
  });
});

describe("FinanceService.createPettyCashTransaction — serializable balance guard (H10)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs the balance read + insert inside a Serializable transaction", async () => {
    mockPrisma.pettyCashTransaction.findFirst.mockResolvedValue({ balance: 500 });
    mockPrisma.pettyCashTransaction.create.mockResolvedValue({ id: "pct-1", balance: 100 });

    const service = makeService();
    await service.createPettyCashTransaction(makeUser(), { type: "DISBURSEMENT", amount: 400, transactionDate: "2026-01-01" } as never, {});

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("still rejects when the computed balance would go negative", async () => {
    mockPrisma.pettyCashTransaction.findFirst.mockResolvedValue({ balance: 100 });

    const service = makeService();
    await expect(
      service.createPettyCashTransaction(makeUser(), { type: "DISBURSEMENT", amount: 400, transactionDate: "2026-01-01" } as never, {})
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.pettyCashTransaction.create).not.toHaveBeenCalled();
  });
});

describe("FinanceService.generateProductProfitability — revenue-weighted cost allocation (L8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.productProfitability.create.mockImplementation((args: { data: unknown }) => Promise.resolve(args.data));
  });

  const dto = { startDate: "2026-01-01", endDate: "2026-01-31" } as never;

  it("allocates cost proportionally to each product's revenue share instead of splitting evenly", async () => {
    // Product A: 900 revenue (90% of total); Product B: 100 revenue (10%). Total cost: 500.
    mockPrisma.invoice.findMany.mockResolvedValue([
      { items: [{ product: { sku: "A", name: "Broiler" }, lineTotal: 900, quantity: 90 }] },
      { items: [{ product: { sku: "B", name: "Layer" }, lineTotal: 100, quantity: 10 }] },
    ]);
    mockPrisma.poultryCostRecord.groupBy.mockResolvedValue([{ _sum: { totalCost: 500 } }]);

    const service = makeService();
    const result = await service.generateProductProfitability(makeUser(), dto, {});

    const bySku = Object.fromEntries((result.data as unknown as Array<{ productCode: string; totalCost: number }>).map((r) => [r.productCode, r.totalCost]));
    // Previously both would get 500/2=250 regardless of revenue share.
    expect(bySku.A).toBeCloseTo(450); // 90% of 500
    expect(bySku.B).toBeCloseTo(50);  // 10% of 500
  });

  it("falls back to an even split only when there is no revenue at all to weight by", async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { items: [{ product: { sku: "A", name: "Broiler" }, lineTotal: 0, quantity: 0 }] },
      { items: [{ product: { sku: "B", name: "Layer" }, lineTotal: 0, quantity: 0 }] },
    ]);
    mockPrisma.poultryCostRecord.groupBy.mockResolvedValue([{ _sum: { totalCost: 200 } }]);

    const service = makeService();
    const result = await service.generateProductProfitability(makeUser(), dto, {});

    const bySku = Object.fromEntries((result.data as unknown as Array<{ productCode: string; totalCost: number }>).map((r) => [r.productCode, r.totalCost]));
    expect(bySku.A).toBe(100);
    expect(bySku.B).toBe(100);
  });
});

describe("FinanceService — Account edit/delete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updateAccount patches only the provided fields", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acc-1", companyId: "company-1" });
    mockPrisma.account.update.mockResolvedValue({ id: "acc-1", name: "Cash" });

    const service = makeService();
    await service.updateAccount(makeUser(), "acc-1", { name: "Cash" } as never, {});

    expect(mockPrisma.account.update).toHaveBeenCalledWith({ where: { id: "acc-1" }, data: { name: "Cash", updatedById: "user-1" } });
  });

  it("deleteAccount soft-deletes an account with no dependents", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acc-1", companyId: "company-1" });
    mockPrisma.journalEntryLine.count.mockResolvedValue(0);
    mockPrisma.account.count.mockResolvedValue(0);
    mockPrisma.expenseCategory.count.mockResolvedValue(0);

    const service = makeService();
    await service.deleteAccount(makeUser(), "acc-1", {});

    expect(mockPrisma.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false })
    });
  });

  it("deleteAccount is blocked when journal entry lines still reference it", async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: "acc-1", companyId: "company-1" });
    mockPrisma.journalEntryLine.count.mockResolvedValue(3);
    mockPrisma.account.count.mockResolvedValue(0);
    mockPrisma.expenseCategory.count.mockResolvedValue(0);

    const service = makeService();
    await expect(service.deleteAccount(makeUser(), "acc-1", {})).rejects.toThrow(/journal entries/);
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
  });
});

describe("FinanceService — ExpenseCategory edit/delete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deleteExpenseCategory soft-deletes a category with no referencing expenses", async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat-1", companyId: "company-1" });
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.pettyCashTransaction.count.mockResolvedValue(0);

    const service = makeService();
    await service.deleteExpenseCategory(makeUser(), "cat-1", {});

    expect(mockPrisma.expenseCategory.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false })
    });
  });

  it("deleteExpenseCategory is blocked when referenced by existing expenses", async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue({ id: "cat-1", companyId: "company-1" });
    mockPrisma.expense.count.mockResolvedValue(2);
    mockPrisma.pettyCashTransaction.count.mockResolvedValue(0);

    const service = makeService();
    await expect(service.deleteExpenseCategory(makeUser(), "cat-1", {})).rejects.toThrow(/expenses or petty cash/);
    expect(mockPrisma.expenseCategory.update).not.toHaveBeenCalled();
  });
});

describe("FinanceService — BankAccount edit/delete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updateBankAccount patches only the provided fields", async () => {
    mockPrisma.bankAccount.findFirst.mockResolvedValue({ id: "bank-1", companyId: "company-1" });
    mockPrisma.bankAccount.update.mockResolvedValue({ id: "bank-1", isActive: false });

    const service = makeService();
    await service.updateBankAccount(makeUser(), "bank-1", { isActive: false } as never, {});

    expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({ where: { id: "bank-1" }, data: { isActive: false, updatedById: "user-1" } });
  });

  it("deleteBankAccount soft-deletes an account with no referencing transactions", async () => {
    mockPrisma.bankAccount.findFirst.mockResolvedValue({ id: "bank-1", companyId: "company-1" });
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.revenue.count.mockResolvedValue(0);
    mockPrisma.supplierPayment.count.mockResolvedValue(0);
    mockPrisma.customerPayment.count.mockResolvedValue(0);
    mockPrisma.payrollRecord.count.mockResolvedValue(0);

    const service = makeService();
    await service.deleteBankAccount(makeUser(), "bank-1", {});

    expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
      where: { id: "bank-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false })
    });
  });

  it("deleteBankAccount is blocked when referenced by existing payments", async () => {
    mockPrisma.bankAccount.findFirst.mockResolvedValue({ id: "bank-1", companyId: "company-1" });
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.revenue.count.mockResolvedValue(0);
    mockPrisma.supplierPayment.count.mockResolvedValue(1);
    mockPrisma.customerPayment.count.mockResolvedValue(0);
    mockPrisma.payrollRecord.count.mockResolvedValue(0);

    const service = makeService();
    await expect(service.deleteBankAccount(makeUser(), "bank-1", {})).rejects.toThrow(/existing transactions/);
    expect(mockPrisma.bankAccount.update).not.toHaveBeenCalled();
  });
});

describe("FinanceService.dashboard — net profit excludes rejected/cancelled expenses (M8)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filters the expense aggregate by the same notIn(REJECTED, CANCELLED) status used by the official P&L report", async () => {
    mockPrisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: 1000 }, _count: 1 });
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 300 }, _count: 1 });

    const service = makeService();
    await service.dashboard(makeUser(), {} as never);

    const expenseWhere = mockPrisma.expense.aggregate.mock.calls[0][0].where;
    expect(expenseWhere.status).toEqual({ notIn: ["REJECTED", "CANCELLED"] });
  });

  it("computes netProfit only from the filtered expense total, not raw spend including rejected entries", async () => {
    // Previously totalExpenses had no status filter at all, so a REJECTED expense
    // that never became real spend would still drag netProfit down.
    mockPrisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: 1000 }, _count: 1 });
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 300 }, _count: 1 });

    const service = makeService();
    const result = await service.dashboard(makeUser(), {} as never);

    expect(result.data.totalExpenses).toBe(300);
    expect(result.data.netProfit).toBe(700);
  });

  it("C-BACK (2026-08-15): folds PAID PayrollRecord.netPay into totalExpenses/netProfit, regardless of which module marked it paid", async () => {
    // PayrollRecord is the single source of truth for payroll cost — no
    // longer mirrored into Expense by either HR's or Finance's own
    // markPayrollPaid, so it must be summed directly here or payroll paid
    // through Finance's screen would silently vanish from net profit.
    mockPrisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: 1000 }, _count: 1 });
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 300 }, _count: 1 });
    mockPrisma.payrollRecord.aggregate.mockResolvedValue({ _sum: { netPay: 150 }, _count: 1 });

    const service = makeService();
    const result = await service.dashboard(makeUser(), {} as never);

    expect(mockPrisma.payrollRecord.aggregate).toHaveBeenCalledWith({
      where: { companyId: "company-1", deletedAt: null, status: "PAID" },
      _sum: { netPay: true },
      _count: true
    });
    expect(result.data.totalPayroll).toBe(150);
    expect(result.data.totalExpenses).toBe(450);
    expect(result.data.netProfit).toBe(550);
  });

  it("M-BUG: surfaces the real, live accounts-payable figure from Procurement's SupplierInvoice, not just realized expenses", async () => {
    mockPrisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: 1000 }, _count: 1 });
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 300 }, _count: 1 });
    mockPrisma.supplierInvoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 4500 }, _count: 3 });

    const service = makeService();
    const result = await service.dashboard(makeUser(), {} as never);

    expect(mockPrisma.supplierInvoice.aggregate).toHaveBeenCalledWith({
      where: { companyId: "company-1", deletedAt: null, status: { in: ["PENDING", "MATCHED", "APPROVED", "OVERDUE"] } },
      _sum: { balanceDue: true },
      _count: true
    });
    expect(result.data.accountsPayable).toBe(4500);
    expect(result.data.accountsPayableCount).toBe(3);
  });
});

describe("FinanceService.createSupplierPayment — a linked invoice actually gets reduced, not just recorded as a free-text note (M-BUG)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a free-text payment with no invoice touch when no invoice is linked (legacy behavior, unchanged)", async () => {
    mockPrisma.supplierPayment.create.mockResolvedValue({ id: "sp-1" });
    const service = makeService();

    await service.createSupplierPayment(makeUser(), { supplierName: "Acme Feeds", amount: 500, paymentDate: "2026-08-13", paymentMethod: "CASH", description: "Cash payment" } as never, {});

    expect(mockPrisma.supplierInvoice.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.supplierInvoice.updateMany).not.toHaveBeenCalled();
  });

  it("floor-guards the decrement and marks the invoice PAID when a linked invoice's balance reaches zero", async () => {
    mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 500 });
    mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });
    mockPrisma.supplierPayment.create.mockResolvedValue({ id: "sp-1" });
    const service = makeService();

    await service.createSupplierPayment(
      makeUser(),
      { supplierName: "Acme Feeds", supplierId: "sup-1", invoiceId: "inv-1", amount: 500, paymentDate: "2026-08-13", paymentMethod: "BANK_TRANSFER", description: "Full settlement" } as never,
      {}
    );

    expect(mockPrisma.supplierInvoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", balanceDue: { gte: 500 } },
      data: { paidAmount: { increment: 500 }, balanceDue: { decrement: 500 }, updatedById: "user-1" }
    });
    expect(mockPrisma.supplierInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
  });

  it("marks the invoice MATCHED (not PAID) when balance remains after a partial payment", async () => {
    mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 500 });
    mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 200 });
    mockPrisma.supplierPayment.create.mockResolvedValue({ id: "sp-1" });
    const service = makeService();

    await service.createSupplierPayment(
      makeUser(),
      { supplierName: "Acme Feeds", supplierId: "sup-1", invoiceId: "inv-1", amount: 300, paymentDate: "2026-08-13", paymentMethod: "BANK_TRANSFER", description: "Partial" } as never,
      {}
    );

    expect(mockPrisma.supplierInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "MATCHED" } });
  });

  it("rejects a payment larger than the invoice's outstanding balance instead of driving it negative", async () => {
    mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 200 });
    mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService();

    await expect(
      service.createSupplierPayment(
        makeUser(),
        { supplierName: "Acme Feeds", supplierId: "sup-1", invoiceId: "inv-1", amount: 500, paymentDate: "2026-08-13", paymentMethod: "BANK_TRANSFER", description: "Overpay" } as never,
        {}
      )
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.supplierInvoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", balanceDue: { gte: 500 } },
      data: expect.objectContaining({ paidAmount: { increment: 500 }, balanceDue: { decrement: 500 } })
    });
  });

  it("rejects up front when the linked invoice already has no outstanding balance", async () => {
    mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 0 });
    const service = makeService();

    await expect(
      service.createSupplierPayment(
        makeUser(),
        { supplierName: "Acme Feeds", supplierId: "sup-1", invoiceId: "inv-1", amount: 100, paymentDate: "2026-08-13", paymentMethod: "BANK_TRANSFER", description: "Already paid" } as never,
        {}
      )
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.supplierPayment.create).not.toHaveBeenCalled();
  });

  it("L-BUG: replays the original payment instead of recording a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.supplierPayment.findFirst.mockResolvedValue({ id: "sp-existing", reference: "SP-1" });
    const service = makeService();

    const result = await service.createSupplierPayment(
      makeUser(),
      { supplierName: "Acme Feeds", amount: 500, paymentDate: "2026-08-13", paymentMethod: "CASH", description: "Retry", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "sp-existing", reference: "SP-1" });
    expect(mockPrisma.supplierPayment.create).not.toHaveBeenCalled();
  });

  it("L-BUG: passes the idempotencyKey through to the payment row on a genuinely new payment", async () => {
    mockPrisma.supplierPayment.findFirst.mockResolvedValue(null);
    mockPrisma.supplierPayment.create.mockResolvedValue({ id: "sp-1" });
    const service = makeService();

    await service.createSupplierPayment(
      makeUser(),
      { supplierName: "Acme Feeds", amount: 500, paymentDate: "2026-08-13", paymentMethod: "CASH", description: "First try", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(mockPrisma.supplierPayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-1" }) }));
  });

  it("L-BUG: replays the original payment when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.supplierPayment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "sp-existing" });
    mockPrisma.supplierPayment.create.mockRejectedValue({ code: "P2002" });
    const service = makeService();

    const result = await service.createSupplierPayment(
      makeUser(),
      { supplierName: "Acme Feeds", amount: 500, paymentDate: "2026-08-13", paymentMethod: "CASH", description: "Race", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "sp-existing" });
  });
});

describe("FinanceService.createCustomerPayment — a linked invoice actually gets reduced, not just recorded as a free-text note (DB stability audit, 2026-08-16)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a free-text payment with no invoice touch when no invoice is linked (legacy behavior, unchanged)", async () => {
    mockPrisma.customerPayment.create.mockResolvedValue({ id: "cp-1" });
    const service = makeService();

    await service.createCustomerPayment(makeUser(), { customerName: "Jane Farms", amount: 500, paymentDate: "2026-08-16", paymentMethod: "CASH", description: "Cash payment" } as never, {});

    expect(mockPrisma.invoice.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("floor-guards the decrement and marks the invoice PAID when a linked invoice's balance reaches zero, and syncs the linked SalesOrder", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 500, salesOrderId: "so-1" });
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });
    mockPrisma.customerPayment.create.mockResolvedValue({ id: "cp-1" });
    const service = makeService();

    await service.createCustomerPayment(
      makeUser(),
      { customerName: "Jane Farms", invoiceId: "inv-1", amount: 500, paymentDate: "2026-08-16", paymentMethod: "BANK_TRANSFER", description: "Full settlement" } as never,
      {}
    );

    expect(mockPrisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", balanceDue: { gte: 500 } },
      data: { paidAmount: { increment: 500 }, balanceDue: { decrement: 500 }, updatedById: "user-1" }
    });
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
    expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: "so-1" },
      data: { paidAmount: { increment: 500 }, balanceDue: { decrement: 500 }, updatedById: "user-1" }
    });
  });

  it("marks the invoice PARTIALLY_PAID (not PAID) when balance remains after a partial payment", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 500, salesOrderId: null });
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 200 });
    mockPrisma.customerPayment.create.mockResolvedValue({ id: "cp-1" });
    const service = makeService();

    await service.createCustomerPayment(
      makeUser(),
      { customerName: "Jane Farms", invoiceId: "inv-1", amount: 300, paymentDate: "2026-08-16", paymentMethod: "BANK_TRANSFER", description: "Partial" } as never,
      {}
    );

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PARTIALLY_PAID" } });
    expect(mockPrisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it("rejects a payment larger than the invoice's outstanding balance instead of driving it negative", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 200 });
    const service = makeService();

    await expect(
      service.createCustomerPayment(
        makeUser(),
        { customerName: "Jane Farms", invoiceId: "inv-1", amount: 500, paymentDate: "2026-08-16", paymentMethod: "BANK_TRANSFER", description: "Overpay" } as never,
        {}
      )
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.customerPayment.create).not.toHaveBeenCalled();
  });

  it("rejects up front when the linked invoice already has no outstanding balance", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 0 });
    const service = makeService();

    await expect(
      service.createCustomerPayment(
        makeUser(),
        { customerName: "Jane Farms", invoiceId: "inv-1", amount: 100, paymentDate: "2026-08-16", paymentMethod: "BANK_TRANSFER", description: "Already paid" } as never,
        {}
      )
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.customerPayment.create).not.toHaveBeenCalled();
  });

  it("replays the original payment instead of recording a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValue({ id: "cp-existing", reference: "CP-1" });
    const service = makeService();

    const result = await service.createCustomerPayment(
      makeUser(),
      { customerName: "Jane Farms", amount: 500, paymentDate: "2026-08-16", paymentMethod: "CASH", description: "Retry", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "cp-existing", reference: "CP-1" });
    expect(mockPrisma.customerPayment.create).not.toHaveBeenCalled();
  });

  it("replays the original payment when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.customerPayment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "cp-existing" });
    mockPrisma.customerPayment.create.mockRejectedValue({ code: "P2002" });
    const service = makeService();

    const result = await service.createCustomerPayment(
      makeUser(),
      { customerName: "Jane Farms", amount: 500, paymentDate: "2026-08-16", paymentMethod: "CASH", description: "Race", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "cp-existing" });
  });
});

describe("FinanceService.createExpense — idempotencyKey dedup (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("replays the original expense instead of creating a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({ id: "exp-existing", reference: "EXP-1" });
    const service = makeService();

    const result = await service.createExpense(
      makeUser({ branchIds: [] }),
      { categoryId: "cat-1", description: "Fuel", amount: 100, expenseDate: "2026-08-17", paymentMethod: "CASH", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "exp-existing", reference: "EXP-1" });
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the expense row on a genuinely new expense", async () => {
    mockPrisma.expense.findFirst.mockResolvedValue(null);
    mockPrisma.expense.create.mockResolvedValue({ id: "exp-1" });
    const service = makeService();

    await service.createExpense(
      makeUser({ branchIds: [] }),
      { categoryId: "cat-1", description: "Fuel", amount: 100, expenseDate: "2026-08-17", paymentMethod: "CASH", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(mockPrisma.expense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-1" }) }));
  });

  it("replays the original expense when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.expense.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "exp-existing" });
    mockPrisma.expense.create.mockRejectedValue({ code: "P2002" });
    const service = makeService();

    const result = await service.createExpense(
      makeUser({ branchIds: [] }),
      { categoryId: "cat-1", description: "Fuel", amount: 100, expenseDate: "2026-08-17", paymentMethod: "CASH", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "exp-existing" });
  });
});
