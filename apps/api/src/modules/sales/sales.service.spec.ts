import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { SalesService } from "./sales.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-001") }));

const mockTx = {
  payment: { create: jest.fn() },
  invoice: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn() },
  salesOrder: { update: jest.fn() },
  deliveryNote: { create: jest.fn() },
  customer: { findUniqueOrThrow: jest.fn() },
  customerCreditLimit: { upsert: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 0 }) },
  customerStatement: { create: jest.fn() },
  receipt: { create: jest.fn() },
  inventoryItem: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  stockBatch: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  stockMovement: { create: jest.fn() },
  salesReturn: { update: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(undefined)
};

const mockPrisma = {
  customer: { findFirst: jest.fn() },
  invoice: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
  payment: { findFirst: jest.fn() },
  receipt: { findFirst: jest.fn() },
  revenue: { create: jest.fn().mockResolvedValue({}) },
  warehouse: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  salesOrderItem: { findFirst: jest.fn() },
  salesOrder: { findFirst: jest.fn() },
  salesReturn: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new SalesService(mockPrisma as never, mockAudit as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: ["wh-1"], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("SalesService.createPayment — race-safe balance guard (C4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.payment.create.mockResolvedValue({ id: "pay-1", paymentNumber: "PAY-REF-001" });
    mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
    mockTx.customerCreditLimit.update.mockResolvedValue({});
    mockTx.customerStatement.create.mockResolvedValue({});
    mockTx.receipt.create.mockResolvedValue({ id: "rcpt-1" });
    mockTx.salesOrder.update.mockResolvedValue({});
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1" });
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.receipt.findFirst.mockResolvedValue(null);
  });

  it("rejects the payment if the atomic guarded decrement finds insufficient balance (the race case)", async () => {
    // Simulates the exact race: the invoice looked like it had enough balance
    // when read before the transaction, but a concurrent payment already
    // consumed it by the time this one's guarded update actually runs.
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 100, paidAmount: 0, salesOrderId: null });
    mockTx.invoice.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.createPayment(makeUser(), { customerId: "cust-1", invoiceId: "inv-1", amount: 100, method: "CASH" } as never, {})
    ).rejects.toThrow(BadRequestException);

    expect(mockTx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", balanceDue: { gte: 100 } },
      data: expect.objectContaining({ paidAmount: { increment: 100 }, balanceDue: { decrement: 100 } })
    });
    // No status flip or downstream credit/receipt should happen once the guard rejects.
    expect(mockTx.invoice.update).not.toHaveBeenCalled();
  });

  it("marks the invoice PAID via a fresh post-decrement read when the guarded update succeeds", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 100, paidAmount: 0, salesOrderId: null });
    mockTx.invoice.updateMany.mockResolvedValue({ count: 1 });
    mockTx.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });
    mockTx.invoice.update.mockResolvedValue({});

    const service = makeService();
    await service.createPayment(makeUser(), { customerId: "cust-1", invoiceId: "inv-1", amount: 100, method: "CASH" } as never, {});

    expect(mockTx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "PAID" }
    });
  });

  it("marks the invoice PARTIALLY_PAID when balance remains after the guarded decrement", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 100, paidAmount: 0, salesOrderId: null });
    mockTx.invoice.updateMany.mockResolvedValue({ count: 1 });
    mockTx.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 40 });
    mockTx.invoice.update.mockResolvedValue({});

    const service = makeService();
    await service.createPayment(makeUser(), { customerId: "cust-1", invoiceId: "inv-1", amount: 60, method: "CASH" } as never, {});

    expect(mockTx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "PARTIALLY_PAID" }
    });
  });

  it("replays the original payment instead of recording a duplicate when the idempotencyKey was already used (H9)", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue({ id: "pay-existing", paymentNumber: "PAY-0001" });
    mockPrisma.receipt.findFirst.mockResolvedValue({ id: "rcpt-existing" });

    const service = makeService();
    const result = await service.createPayment(
      makeUser(),
      { customerId: "cust-1", amount: 100, method: "CASH", idempotencyKey: "idem-1" } as never,
      {}
    );

    expect(result.data.payment.id).toBe("pay-existing");
    expect(mockTx.payment.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the payment row on a genuinely new payment", async () => {
    const service = makeService();
    await service.createPayment(
      makeUser(),
      { customerId: "cust-1", amount: 100, method: "CASH", idempotencyKey: "idem-2" } as never,
      {}
    );

    expect(mockTx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-2" }) })
    );
  });

  it("replays the original payment when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    // Simulates two requests carrying the same key both passing the
    // pre-check and both starting a transaction — the DB's unique index is
    // the real arbiter, and the loser must not surface this as an error.
    mockPrisma.$transaction.mockImplementationOnce(() => {
      const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      return Promise.reject(err);
    });
    mockPrisma.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "pay-winner", paymentNumber: "PAY-0002" });
    mockPrisma.receipt.findFirst.mockResolvedValue({ id: "rcpt-winner" });

    const service = makeService();
    const result = await service.createPayment(
      makeUser(),
      { customerId: "cust-1", amount: 100, method: "CASH", idempotencyKey: "idem-3" } as never,
      {}
    );

    expect(result.data.payment.id).toBe("pay-winner");
  });

  it("mirrors the payment into Finance's Revenue ledger so P&L/Cash Flow reports see real sales activity (H21)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", name: "Acme Ltd" });
    mockTx.payment.create.mockResolvedValue({ id: "pay-1", paymentNumber: "PAY-0001", amount: 100, paymentDate: new Date("2026-08-09"), method: "CASH", invoiceId: null });

    const service = makeService();
    await service.createPayment(makeUser(), { customerId: "cust-1", amount: 100, method: "CASH" } as never, {});

    expect(mockPrisma.revenue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "PRODUCT_SALES", amount: 100, customerName: "Acme Ltd" })
      })
    );
  });

  it("does not fail the payment itself when the Revenue mirror fails", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", name: "Acme Ltd" });
    mockPrisma.revenue.create.mockRejectedValueOnce(new Error("DB unavailable"));

    const service = makeService();
    await expect(
      service.createPayment(makeUser(), { customerId: "cust-1", amount: 100, method: "CASH" } as never, {})
    ).resolves.toBeDefined();
  });
});

describe("SalesService — sales returns require a second approver (C5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1" });
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", sku: "SKU-1", uomId: "uom-1" });
  });

  describe("createReturn", () => {
    it("always creates the return as REQUESTED, never self-posted, regardless of client input", async () => {
      mockPrisma.salesReturn.create.mockResolvedValue({ id: "ret-1", status: "REQUESTED" });

      const service = makeService();
      await service.createReturn(
        makeUser(),
        { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", quantity: 5, unitPrice: 10, reason: "damaged" } as never,
        {}
      );

      expect(mockPrisma.salesReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "REQUESTED" }) })
      );
      // No stock/credit side effects at creation time anymore.
      expect(mockTx.inventoryItem.upsert).not.toHaveBeenCalled();
    });

    it("rejects a return for a product that wasn't part of the referenced sales order", async () => {
      mockPrisma.salesOrderItem.findFirst.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.createReturn(
          makeUser(),
          { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", salesOrderId: "so-1", quantity: 5, unitPrice: 10, reason: "damaged" } as never,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("caps quantity to what remains returnable and ignores the client-supplied price in favor of the original sale price", async () => {
      mockPrisma.salesOrderItem.findFirst.mockResolvedValue({ quantity: 10, unitPrice: 25 });
      mockPrisma.salesReturn.aggregate.mockResolvedValue({ _sum: { quantity: 4 } }); // 4 already returned, 6 remain
      mockPrisma.salesReturn.create.mockResolvedValue({ id: "ret-1", status: "REQUESTED" });

      const service = makeService();
      // Client tries to claim a wildly inflated price (999) — should be ignored.
      await service.createReturn(
        makeUser(),
        { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", salesOrderId: "so-1", quantity: 6, unitPrice: 999, reason: "damaged" } as never,
        {}
      );

      expect(mockPrisma.salesReturn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ unitPrice: 25, quantity: 6, totalAmount: 150 }) })
      );
    });

    it("rejects a return claiming more units than remain returnable on the order", async () => {
      mockPrisma.salesOrderItem.findFirst.mockResolvedValue({ quantity: 10, unitPrice: 25 });
      mockPrisma.salesReturn.aggregate.mockResolvedValue({ _sum: { quantity: 8 } }); // only 2 remain

      const service = makeService();
      await expect(
        service.createReturn(
          makeUser(),
          { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", salesOrderId: "so-1", quantity: 5, unitPrice: 25, reason: "damaged" } as never,
          {}
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("approveReturn / rejectReturn", () => {
    function pendingReturn(overrides: Record<string, unknown> = {}) {
      return {
        id: "ret-1", companyId: "company-1", branchId: "branch-1", customerId: "cust-1",
        warehouseId: "wh-1", productId: "prod-1", quantity: 5, unitPrice: 10, totalAmount: 50,
        reason: "damaged", status: "REQUESTED", createdById: "creator-1",
        product: { id: "prod-1", sku: "SKU-1", uomId: "uom-1" },
        warehouse: { id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null },
        ...overrides
      };
    }

    it("blocks the creator of the return from approving their own request", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "user-1" }));

      const service = makeService();
      await expect(service.approveReturn(makeUser({ id: "user-1" }), "ret-1", {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks approving a return that isn't in REQUESTED status", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ status: "POSTED", createdById: "someone-else" }));

      const service = makeService();
      await expect(service.approveReturn(makeUser({ id: "user-1" }), "ret-1", {})).rejects.toThrow(BadRequestException);
    });

    it("posts the return and applies stock/credit effects only on explicit approval by a different user", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerCreditLimit.update.mockResolvedValue({});
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.update.mockResolvedValue({ id: "ret-1", status: "POSTED" });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.inventoryItem.upsert).toHaveBeenCalled();
      expect(mockTx.salesReturn.update).toHaveBeenCalledWith({
        where: { id: "ret-1" },
        data: expect.objectContaining({ status: "POSTED", approvedById: "approver-1" })
      });
    });

    it("rejectReturn sets status REJECTED without touching stock or credit", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      mockPrisma.salesReturn.update.mockResolvedValue({ id: "ret-1", status: "REJECTED" });

      const service = makeService();
      await service.rejectReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockPrisma.salesReturn.update).toHaveBeenCalledWith({
        where: { id: "ret-1" },
        data: expect.objectContaining({ status: "REJECTED", approvedById: "approver-1" })
      });
      expect(mockTx.inventoryItem.upsert).not.toHaveBeenCalled();
    });
  });
});

describe("SalesService.approveStockRelease — atomic credit balance + re-checked limit at fulfillment (H6/H7)", () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    id: "so-1", companyId: "company-1", branchId: "branch-1", customerId: "cust-1", warehouseId: "wh-1",
    orderNumber: "SO-001", status: "PENDING_STOCK_APPROVAL", totalAmount: 500,
    items: [{ productId: "prod-1", quantity: 10 }],
    invoices: [],
    ...overrides
  });

  const inventoryItem = { id: "inv-item-1", branchId: "branch-1", warehouseId: "wh-1", farmId: null, productionSiteId: null, productId: "prod-1", uomId: "uom-1", quantityOnHand: 100 };

  const user = () => makeUser({ warehouseIds: ["wh-1"] });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.salesOrder.findFirst.mockResolvedValue(order());
    mockTx.inventoryItem.findFirst.mockResolvedValue(inventoryItem);
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 10, unitCost: 5, status: "AVAILABLE" }]);
    mockTx.inventoryItem.update.mockResolvedValue({});
    mockTx.stockBatch.update.mockResolvedValue({});
    mockTx.stockMovement.create.mockResolvedValue({});
    mockTx.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-REF-001" });
    mockTx.deliveryNote.create.mockResolvedValue({ id: "dn-1" });
    mockTx.salesOrder.update.mockResolvedValue({});
    mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 0 });
    mockTx.customerStatement.create.mockResolvedValue({});
  });

  it("increments the customer balance atomically instead of a plain read-then-write", async () => {
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 200 });
    mockTx.customerCreditLimit.update.mockResolvedValue({ id: "cl-1", currentBalance: 700 });

    const service = makeService();
    await service.approveStockRelease(user(), "so-1", {});

    expect(mockTx.customerCreditLimit.update).toHaveBeenCalledWith({
      where: { id: "cl-1" },
      data: { currentBalance: { increment: 500 } }
    });
    expect(mockTx.customerStatement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balance: 700, debit: 500 }) })
    );
  });

  it("rolls back the whole release when it would push the customer over their credit limit", async () => {
    // Limit is 1000, balance already at 800 — releasing this 500 order would
    // push it to 1300, over the limit. This is the check that matters:
    // order creation alone can't catch this when several orders were
    // created in parallel against the same still-unspent balance and are
    // now being released one after another.
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 1000, currentBalance: 800 });
    mockTx.customerCreditLimit.update.mockResolvedValue({ id: "cl-1", currentBalance: 1300 });

    const service = makeService();
    await expect(service.approveStockRelease(user(), "so-1", {})).rejects.toThrow(/over their credit limit/);
    // The throw happens before the statement row is ever written.
    expect(mockTx.customerStatement.create).not.toHaveBeenCalled();
  });

  it("allows the release when the resulting balance is within the credit limit", async () => {
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 1000, currentBalance: 300 });
    mockTx.customerCreditLimit.update.mockResolvedValue({ id: "cl-1", currentBalance: 800 });

    const service = makeService();
    await expect(service.approveStockRelease(user(), "so-1", {})).resolves.toBeDefined();
  });

  it("does not enforce a credit limit at all when none is configured (creditLimit 0)", async () => {
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 999999 });
    mockTx.customerCreditLimit.update.mockResolvedValue({ id: "cl-1", currentBalance: 1000499 });

    const service = makeService();
    await expect(service.approveStockRelease(user(), "so-1", {})).resolves.toBeDefined();
  });
});
