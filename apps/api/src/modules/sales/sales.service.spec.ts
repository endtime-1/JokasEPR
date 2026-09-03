import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { SalesService } from "./sales.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-001") }));

const mockTx = {
  payment: { create: jest.fn() },
  invoice: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
  revenue: { create: jest.fn() },
  salesOrder: { update: jest.fn(), create: jest.fn() },
  salesOrderItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  deliveryNote: { create: jest.fn() },
  customer: { findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  customerCreditLimit: { upsert: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 0 }) },
  customerStatement: { create: jest.fn() },
  receipt: { create: jest.fn() },
  inventoryItem: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  stockBatch: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  stockMovement: { create: jest.fn() },
  salesReturn: { update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  $executeRaw: jest.fn().mockResolvedValue(undefined)
};

const mockPrisma = {
  customer: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn(), update: jest.fn() },
  customerGroup: { findFirst: jest.fn(), update: jest.fn() },
  customerCreditLimit: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  priceList: { findFirst: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
  invoice: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
  payment: { findFirst: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
  receipt: { findFirst: jest.fn() },
  revenue: { create: jest.fn().mockResolvedValue({}) },
  warehouse: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  branch: { findMany: jest.fn().mockResolvedValue([]) },
  product: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  salesOrderItem: { findFirst: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn() },
  salesOrder: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), count: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _count: 0, _sum: {} }) },
  inventoryItem: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  salesReturn: { aggregate: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  prospectVisit: { create: jest.fn(), findFirst: jest.fn() },
  purchaseRequest: { create: jest.fn() },
  salesQuote: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
  salesQuoteItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  company: { findUnique: jest.fn().mockResolvedValue({ name: "Acme Farms" }) },
  systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
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

  it("mirrors the payment into Finance's Revenue ledger, inside the payment transaction, so P&L/Cash Flow reports see real sales activity (H21 + audit M2)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", name: "Acme Ltd" });
    mockTx.payment.create.mockResolvedValue({ id: "pay-1", paymentNumber: "PAY-0001", amount: 100, paymentDate: new Date("2026-08-09"), method: "CASH", invoiceId: null });

    const service = makeService();
    await service.createPayment(makeUser(), { customerId: "cust-1", amount: 100, method: "CASH" } as never, {});

    expect(mockTx.revenue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "PRODUCT_SALES", amount: 100, customerName: "Acme Ltd" })
      })
    );
  });

  it("rolls the whole payment back when the Revenue mirror fails — money recorded and revenue recognised are atomic (audit M2)", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", name: "Acme Ltd" });
    mockTx.payment.create.mockResolvedValue({ id: "pay-1", paymentNumber: "PAY-0001", amount: 100, paymentDate: new Date(), method: "CASH", invoiceId: null });
    mockTx.revenue.create.mockRejectedValueOnce(new Error("DB unavailable"));

    const service = makeService();
    await expect(
      service.createPayment(makeUser(), { customerId: "cust-1", amount: 100, method: "CASH" } as never, {})
    ).rejects.toThrow("DB unavailable");
  });
});

describe("SalesService.createOrder — idempotencyKey dedup (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", status: "ACTIVE" });
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1" });
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1" }]);
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
    mockPrisma.customerCreditLimit.findFirst.mockResolvedValue(null);
    mockPrisma.salesOrder.findFirst.mockResolvedValue(null);
    mockPrisma.salesOrder.create.mockResolvedValue({ id: "so-1", orderNumber: "SO-REF-001" });
  });

  const order = { customerId: "cust-1", warehouseId: "wh-1", items: [{ productId: "prod-1", quantity: 1, unitPrice: 10 }] };

  it("replays the original order instead of creating a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.salesOrder.findFirst.mockResolvedValue({ id: "so-existing", orderNumber: "SO-0001" });

    const service = makeService();
    const result = await service.createOrder(makeUser(), { ...order, idempotencyKey: "idem-1" } as never, {});

    expect(result.data.id).toBe("so-existing");
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the order row on a genuinely new order", async () => {
    const service = makeService();
    await service.createOrder(makeUser(), { ...order, idempotencyKey: "idem-2" } as never, {});

    expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-2" }) })
    );
  });

  it("replays the original order when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.salesOrder.create.mockImplementationOnce(() => {
      const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      return Promise.reject(err);
    });
    mockPrisma.salesOrder.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "so-winner", orderNumber: "SO-0002" });

    const service = makeService();
    const result = await service.createOrder(makeUser(), { ...order, idempotencyKey: "idem-3" } as never, {});

    expect(result.data.id).toBe("so-winner");
  });
});

describe("SalesService.logProspectVisit — idempotencyKey dedup (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.prospectVisit.findFirst.mockResolvedValue(null);
    mockPrisma.prospectVisit.create.mockResolvedValue({ id: "visit-1" });
  });

  const visit = { prospectName: "Acme Farms" };

  it("replays the original visit instead of creating a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.prospectVisit.findFirst.mockResolvedValue({ id: "visit-existing" });

    const service = makeService();
    const result = await service.logProspectVisit(makeUser(), { ...visit, idempotencyKey: "idem-1" } as never, {});

    expect(result.data.id).toBe("visit-existing");
    expect(mockPrisma.prospectVisit.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the visit row on a genuinely new visit", async () => {
    const service = makeService();
    await service.logProspectVisit(makeUser(), { ...visit, idempotencyKey: "idem-2" } as never, {});

    expect(mockPrisma.prospectVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-2" }) })
    );
  });

  it("replays the original visit when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.prospectVisit.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "visit-winner" });
    mockPrisma.prospectVisit.create.mockImplementationOnce(() => {
      const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      return Promise.reject(err);
    });

    const service = makeService();
    const result = await service.logProspectVisit(makeUser(), { ...visit, idempotencyKey: "idem-3" } as never, {});

    expect(result.data.id).toBe("visit-winner");
  });
});

describe("SalesService — sales returns require a second approver (C5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1" });
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", sku: "SKU-1", uomId: "uom-1" });
    mockPrisma.salesOrderItem.aggregate.mockResolvedValue({ _max: { unitPrice: 10 } });
    mockPrisma.priceList.aggregate.mockResolvedValue({ _max: { unitPrice: 0 } });
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

    it("rejects a standalone return (no salesOrderId) whose client-supplied price exceeds the highest recorded price for the product", async () => {
      mockPrisma.salesOrderItem.aggregate.mockResolvedValue({ _max: { unitPrice: 10 } });
      mockPrisma.priceList.aggregate.mockResolvedValue({ _max: { unitPrice: 0 } });

      const service = makeService();
      await expect(
        service.createReturn(
          makeUser(),
          { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", quantity: 5, unitPrice: 999, reason: "damaged" } as never,
          {}
        )
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.salesReturn.create).not.toHaveBeenCalled();
    });

    it("rejects a standalone return for a product with no recorded sale or price-list entry", async () => {
      mockPrisma.salesOrderItem.aggregate.mockResolvedValue({ _max: { unitPrice: null } });
      mockPrisma.priceList.aggregate.mockResolvedValue({ _max: { unitPrice: null } });

      const service = makeService();
      await expect(
        service.createReturn(
          makeUser(),
          { customerId: "cust-1", productId: "prod-1", warehouseId: "wh-1", quantity: 5, unitPrice: 10, reason: "damaged" } as never,
          {}
        )
      ).rejects.toThrow(BadRequestException);
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
        customer: { name: "Acme Ltd" },
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
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.inventoryItem.upsert).toHaveBeenCalled();
      expect(mockTx.salesReturn.updateMany).toHaveBeenCalledWith({
        where: { id: "ret-1", status: "REQUESTED" },
        data: expect.objectContaining({ status: "POSTED", approvedById: "approver-1" })
      });
    });

    it("H-HIGH: approving a return tied to a sales order reduces that order's invoice balance too, not just the customer's overall credit", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", salesOrderId: "so-1" }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerCreditLimit.update.mockResolvedValue({});
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });
      mockTx.invoice.findFirst.mockResolvedValue({ id: "inv-1", salesOrderId: "so-1", balanceDue: 80 });
      mockTx.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockTx.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 30 }); // 80 - 50 (the return's totalAmount)

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.invoice.findFirst).toHaveBeenCalledWith({ where: { salesOrderId: "so-1", companyId: "company-1", deletedAt: null } });
      expect(mockTx.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-1", balanceDue: { gte: 50 } },
        data: { balanceDue: { decrement: 50 }, updatedById: "approver-1" }
      });
      // Balance is still > 0 after the reduction — status shouldn't be forced to PAID.
      expect(mockTx.invoice.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: "PAID" } }));
    });

    it("H-HIGH: marks the invoice PAID when the return brings its balance to zero", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", salesOrderId: "so-1", totalAmount: 50, quantity: 5, unitPrice: 10 }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerCreditLimit.update.mockResolvedValue({});
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });
      mockTx.invoice.findFirst.mockResolvedValue({ id: "inv-1", salesOrderId: "so-1", balanceDue: 50 });
      mockTx.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockTx.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.invoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
    });

    it("H-HIGH: a return larger than the invoice's own balance only reduces it to zero, the rest still lands on the customer's overall credit", async () => {
      // Return totalAmount (50) exceeds the invoice's remaining balance (20) —
      // e.g. it was already partially paid down. The invoice can't go negative;
      // addCustomerCreditTx (unchanged, already tested elsewhere) still receives
      // the full 50 for the customer's overall running balance.
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", salesOrderId: "so-1" }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerCreditLimit.update.mockResolvedValue({});
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });
      mockTx.invoice.findFirst.mockResolvedValue({ id: "inv-1", salesOrderId: "so-1", balanceDue: 20 });
      mockTx.invoice.updateMany.mockResolvedValue({ count: 1 });
      mockTx.invoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-1", balanceDue: { gte: 20 } },
        data: { balanceDue: { decrement: 20 }, updatedById: "approver-1" }
      });
    });

    it("H-HIGH: skips the invoice lookup entirely for a return with no linked sales order", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", salesOrderId: null }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerCreditLimit.update.mockResolvedValue({});
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockTx.invoice.findFirst).not.toHaveBeenCalled();
    });

    it("rejectReturn sets status REJECTED without touching stock or credit", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      mockPrisma.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "REJECTED" });

      const service = makeService();
      await service.rejectReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockPrisma.salesReturn.updateMany).toHaveBeenCalledWith({
        where: { id: "ret-1", status: "REQUESTED" },
        data: expect.objectContaining({ status: "REJECTED", approvedById: "approver-1" })
      });
      expect(mockTx.inventoryItem.upsert).not.toHaveBeenCalled();
    });

    it("C1 (DB stability audit): a second concurrent approveReturn call is rejected once the first has claimed the row", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      // Simulates the guarded updateMany matching zero rows because another
      // concurrent request already flipped status away from REQUESTED.
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 0 });

      const service = makeService();
      await expect(service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {})).rejects.toThrow(BadRequestException);
      expect(mockTx.inventoryItem.upsert).not.toHaveBeenCalled();
    });

    it("C1 (DB stability audit): a second concurrent rejectReturn call is rejected once the first has claimed the row", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      mockPrisma.salesReturn.updateMany.mockResolvedValue({ count: 0 });

      const service = makeService();
      await expect(service.rejectReturn(makeUser({ id: "approver-1" }), "ret-1", {})).rejects.toThrow(BadRequestException);
    });

    it("M-BUG: a return larger than what the customer owes drives the balance negative (credit owed to them) instead of flooring at zero", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", totalAmount: 80 }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 30 });
      // The customer only owed 30; the return is worth 80 — the excess 50
      // is now owed BACK to them, represented as a negative balance.
      mockTx.customerCreditLimit.findUniqueOrThrow.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: -50 });
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      const sql = mockTx.$executeRaw.mock.calls[0][0].join("");
      expect(sql).not.toMatch(/GREATEST/);
      expect(mockTx.customerStatement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ balance: -50, entryType: "RETURN", credit: 80 })
      });
    });

    it("M-BUG: creates a negative-amount Finance revenue entry to reverse the sale, so P&L doesn't overstate real revenue", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1", totalAmount: 50 }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });

      const service = makeService();
      await service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {});

      expect(mockPrisma.revenue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: -50, paymentMethod: "CREDIT_NOTE", customerName: "Acme Ltd", source: "PRODUCT_SALES" })
      });
    });

    it("M-BUG: does not fail the return approval itself when the Finance revenue reversal fails", async () => {
      mockPrisma.salesReturn.findFirst.mockResolvedValue(pendingReturn({ createdById: "creator-1" }));
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-item-1" });
      mockTx.stockBatch.create.mockResolvedValue({});
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", currentBalance: 0 });
      mockTx.customerStatement.create.mockResolvedValue({});
      mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
      mockTx.salesReturn.updateMany.mockResolvedValue({ count: 1 });
      mockTx.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: "ret-1", status: "POSTED" });
      mockPrisma.revenue.create.mockRejectedValueOnce(new Error("DB unavailable"));

      const service = makeService();
      await expect(service.approveReturn(makeUser({ id: "approver-1" }), "ret-1", {})).resolves.toBeDefined();
    });
  });
});

describe("SalesService — two-step confirm then release (make-to-order)", () => {
  const pendingOrder = (o: Record<string, unknown> = {}) => ({
    id: "so-1", companyId: "company-1", branchId: "branch-1", customerId: "cust-1", warehouseId: "wh-1",
    orderNumber: "SO-001", status: "PENDING_STOCK_APPROVAL",
    subtotal: 500, discountAmount: 0, taxAmount: 0, totalAmount: 500,
    items: [{ productId: "prod-1", quantity: 10 }], invoices: [], ...o,
  });
  const user = () => makeUser({ warehouseIds: ["wh-1"] });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.customerCreditLimit.findFirst.mockResolvedValue(null);
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null);
    mockTx.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-001", totalAmount: 500, balanceDue: 500 });
    mockTx.salesOrder.update.mockResolvedValue({ id: "so-1", status: "APPROVED" });
    mockTx.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust-1", companyId: "company-1" });
    mockTx.customerCreditLimit.upsert.mockResolvedValue({ id: "cl-1", companyId: "company-1", creditLimit: 0, currentBalance: 0 });
    mockTx.customerCreditLimit.update.mockResolvedValue({ id: "cl-1", currentBalance: 500 });
    mockTx.customerStatement.create.mockResolvedValue({});
  });

  describe("confirmOrder", () => {
    it("issues the invoice and moves the order to APPROVED without any stock check", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue(pendingOrder());

      const service = makeService();
      const result = await service.confirmOrder(user(), "so-1", {});

      expect(mockTx.invoice.create).toHaveBeenCalled();
      expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
      expect(mockTx.salesOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }));
      expect((result.data as { invoice: { invoiceNumber: string } }).invoice.invoiceNumber).toBe("INV-001");
    });

    it("rejects confirming an order that is already confirmed", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue(pendingOrder({ status: "APPROVED" }));
      const service = makeService();
      await expect(service.confirmOrder(user(), "so-1", {})).rejects.toThrow(BadRequestException);
    });

    it("re-checks the customer credit limit at confirmation", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue(pendingOrder());
      mockPrisma.customerCreditLimit.findFirst.mockResolvedValue({ creditLimit: 400, currentBalance: 100 });
      const service = makeService();
      await expect(service.confirmOrder(user(), "so-1", {})).rejects.toThrow(/credit limit/);
    });
  });

  describe("approveStockRelease flow guards", () => {
    it("tells the user to confirm first when the order is still pending", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({ ...pendingOrder(), warehouse: { id: "wh-1", name: "WH" }, customer: {} });
      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).rejects.toThrow(/Confirm this order first/);
    });

    it("blocks release on an unpaid invoice when the company requires payment first", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        ...pendingOrder({ status: "APPROVED" }),
        warehouse: { id: "wh-1", name: "WH" }, customer: {},
        invoices: [{ id: "inv-1", invoiceNumber: "INV-001", totalAmount: 500, balanceDue: 500 }],
      });
      mockPrisma.systemSetting.findFirst.mockResolvedValue({ value: { requirePaymentBeforeRelease: true } });
      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).rejects.toThrow(/hasn't paid/);
    });

    it("allows release on a part-paid invoice under the same setting", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        ...pendingOrder({ status: "APPROVED" }),
        warehouse: { id: "wh-1", name: "Central" }, customer: {},
        invoices: [{ id: "inv-1", invoiceNumber: "INV-001", totalAmount: 500, balanceDue: 200 }],
      });
      mockPrisma.systemSetting.findFirst.mockResolvedValue({ value: { requirePaymentBeforeRelease: true } });
      mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-item-1", branchId: "branch-1", warehouseId: "wh-1", farmId: null, productionSiteId: null, productId: "prod-1", uomId: "uom-1", quantityOnHand: 100 });
      mockTx.stockBatch.findMany.mockResolvedValue([{ id: "b-1", quantityRemaining: 10, unitCost: 5, status: "AVAILABLE" }]);
      mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
      mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      mockTx.stockMovement.create.mockResolvedValue({});
      mockTx.deliveryNote.create.mockResolvedValue({ id: "dn-1" });
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", name: "P", sku: "P1" }]);
      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).resolves.toBeDefined();
    });
  });
});

describe("SalesService.approveStockRelease — atomic credit balance + re-checked limit at fulfillment (H6/H7)", () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    id: "so-1", companyId: "company-1", branchId: "branch-1", customerId: "cust-1", warehouseId: "wh-1",
    orderNumber: "SO-001", status: "APPROVED", totalAmount: 500,
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
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.update.mockResolvedValue({});
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
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

  // H-BUG-1: consumeFifoTx used to take stock via a plain `update`, trusting
  // a pre-loop snapshot for the whole loop — the one place in the codebase
  // that could oversell under concurrency, unlike every sibling module's
  // FIFO consumer. These exercise the floor-guarded updateMany fix.
  describe("consumeFifoTx — floor-guarded against concurrent overdraw (H-BUG-1)", () => {
    it("rejects cleanly when the stock batch was consumed concurrently by another release", async () => {
      mockTx.stockBatch.updateMany.mockResolvedValueOnce({ count: 0 });

      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).rejects.toThrow(/consumed concurrently/);
      expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    });

    it("rejects cleanly when the inventory item itself was consumed concurrently", async () => {
      // Batch-level decrement succeeds, but the aggregate item-level decrement
      // (the final updateMany in consumeFifoTx) loses the race instead.
      mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
      mockTx.inventoryItem.updateMany.mockResolvedValueOnce({ count: 0 });

      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).rejects.toThrow(/Insufficient stock/);
    });

    it("succeeds and logs stock movement when nothing raced it", async () => {
      const service = makeService();
      await expect(service.approveStockRelease(user(), "so-1", {})).resolves.toBeDefined();

      expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
        where: { id: "batch-1", quantityRemaining: { gte: 10 } },
        data: { quantityRemaining: { decrement: 10 } }
      });
      expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-item-1", quantityOnHand: { gte: 10 } },
        data: { quantityOnHand: { decrement: 10 }, updatedById: expect.any(String) }
      });
      expect(mockTx.stockMovement.create).toHaveBeenCalled();
    });
  });
});

describe("SalesService.reports — top-lists aggregate over every matching order, not just the 200 most recent (M7)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not pass a take/limit to the DB-side aggregation, so older orders are never silently dropped", async () => {
    mockPrisma.salesOrderItem.groupBy.mockResolvedValue([]);
    mockPrisma.salesOrder.groupBy.mockResolvedValue([]);

    const service = makeService();
    await service.reports(makeUser(), {} as never);

    for (const call of mockPrisma.salesOrderItem.groupBy.mock.calls) expect(call[0].take).toBeUndefined();
    for (const call of mockPrisma.salesOrder.groupBy.mock.calls) expect(call[0].take).toBeUndefined();
  });

  it("aggregates a product's quantity/value across every order returned by the DB, however many there are", async () => {
    // Previously this scenario (a product spread across 250 orders) would have
    // silently reflected only the 200 most-recent orders' worth of quantity/value.
    mockPrisma.salesOrderItem.groupBy.mockResolvedValue([{ productId: "prod-1", _sum: { quantity: 2500, lineTotal: 125000 } }]);
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", sku: "SKU-1", name: "Layer Feed" }]);

    const service = makeService();
    const result = await service.reports(makeUser(), {} as never);

    expect(result.data.byProduct).toEqual([{ sku: "SKU-1", product: "Layer Feed", quantity: 2500, salesValue: 125000 }]);
  });

  it("aggregates customer orders/value/balance across every matching order via DB-side groupBy", async () => {
    mockPrisma.salesOrder.groupBy.mockImplementation(({ by }: { by: string[] }) => {
      if (by[0] === "customerId") return Promise.resolve([{ customerId: "cust-1", _count: { _all: 250 }, _sum: { totalAmount: 500000, balanceDue: 12000 } }]);
      return Promise.resolve([]);
    });
    mockPrisma.customer.findMany.mockResolvedValue([{ id: "cust-1", code: "C-001", name: "Acme Ltd" }]);

    const service = makeService();
    const result = await service.reports(makeUser(), {} as never);

    expect(result.data.byCustomer).toEqual([{ code: "C-001", customer: "Acme Ltd", orders: 250, salesValue: 500000, balanceDue: 12000 }]);
  });
});

describe("SalesService — Customer / CustomerGroup / PriceList edit & delete", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("updateCustomer", () => {
    it("updates the whitelisted fields and writes an audit entry", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", companyId: "company-1", branchId: "branch-1", code: "C-001" });
      mockPrisma.customer.update.mockResolvedValue({ id: "cust-1", code: "C-001", branchId: "branch-1", phone: "0551234567" });

      const service = makeService();
      const result = await service.updateCustomer(makeUser(), "cust-1", { phone: "0551234567" } as never, {});

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: expect.objectContaining({ phone: "0551234567", updatedById: "user-1" })
      });
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "Customer", entityId: "cust-1" }));
      expect(result.data.phone).toBe("0551234567");
    });

    it("throws NotFoundException when the customer is outside the caller's scope", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      const service = makeService();
      await expect(service.updateCustomer(makeUser(), "missing", { phone: "1" } as never, {})).rejects.toThrow(NotFoundException);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });

    it("rejects reassigning to a branch the caller doesn't have access to", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", companyId: "company-1", branchId: "branch-1", code: "C-001" });

      const service = makeService();
      await expect(service.updateCustomer(makeUser(), "cust-1", { branchId: "branch-2" } as never, {})).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteCustomer", () => {
    beforeEach(() => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", companyId: "company-1", branchId: "branch-1", code: "C-001" });
      mockPrisma.salesOrder.count.mockResolvedValue(0);
      mockPrisma.invoice.count.mockResolvedValue(0);
      mockPrisma.customerCreditLimit.findFirst.mockResolvedValue(null);
    });

    it("soft-deletes via deletedAt when the customer has no active orders, unpaid invoices, or balance", async () => {
      mockPrisma.customer.update.mockResolvedValue({ id: "cust-1", deletedAt: new Date() });

      const service = makeService();
      await service.deleteCustomer(makeUser(), "cust-1", {});

      expect(mockPrisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "Customer" }));
    });

    it("blocks the delete when the customer has active (non-fulfilled, non-cancelled) sales orders", async () => {
      mockPrisma.salesOrder.count.mockResolvedValue(2);

      const service = makeService();
      await expect(service.deleteCustomer(makeUser(), "cust-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });

    it("blocks the delete when the customer has unpaid (non-PAID, non-VOID) invoices", async () => {
      mockPrisma.invoice.count.mockResolvedValue(1);

      const service = makeService();
      await expect(service.deleteCustomer(makeUser(), "cust-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });

    it("blocks the delete when the customer carries a non-zero credit balance", async () => {
      mockPrisma.customerCreditLimit.findFirst.mockResolvedValue({ currentBalance: 450 });

      const service = makeService();
      await expect(service.deleteCustomer(makeUser(), "cust-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for a customer outside the caller's scope", async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      const service = makeService();
      await expect(service.deleteCustomer(makeUser(), "missing", {})).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateCustomerGroup / deleteCustomerGroup", () => {
    it("updates the whitelisted fields", async () => {
      mockPrisma.customerGroup.findFirst.mockResolvedValue({ id: "grp-1", companyId: "company-1", branchId: "branch-1", code: "GRP-1" });
      mockPrisma.customerGroup.update.mockResolvedValue({ id: "grp-1", code: "GRP-1", name: "Wholesale" });

      const service = makeService();
      await service.updateCustomerGroup(makeUser(), "grp-1", { name: "Wholesale" } as never, {});

      expect(mockPrisma.customerGroup.update).toHaveBeenCalledWith({
        where: { id: "grp-1" },
        data: expect.objectContaining({ name: "Wholesale", updatedById: "user-1" })
      });
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "CustomerGroup" }));
    });

    it("soft-deletes a customer group with no customers assigned", async () => {
      mockPrisma.customerGroup.findFirst.mockResolvedValue({ id: "grp-1", companyId: "company-1", branchId: "branch-1", code: "GRP-1" });
      mockPrisma.customer.count.mockResolvedValue(0);
      mockPrisma.customerGroup.update.mockResolvedValue({ id: "grp-1", deletedAt: new Date() });

      const service = makeService();
      await service.deleteCustomerGroup(makeUser(), "grp-1", {});

      expect(mockPrisma.customerGroup.update).toHaveBeenCalledWith({
        where: { id: "grp-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
    });

    it("blocks deleting a customer group that still has customers assigned to it", async () => {
      mockPrisma.customerGroup.findFirst.mockResolvedValue({ id: "grp-1", companyId: "company-1", branchId: "branch-1", code: "GRP-1" });
      mockPrisma.customer.count.mockResolvedValue(3);

      const service = makeService();
      await expect(service.deleteCustomerGroup(makeUser(), "grp-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.customerGroup.update).not.toHaveBeenCalled();
    });
  });

  describe("updatePriceList / deletePriceList", () => {
    it("updates the whitelisted fields, converting date strings", async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue({ id: "pl-1", companyId: "company-1", branchId: "branch-1", name: "Standard" });
      mockPrisma.priceList.update.mockResolvedValue({ id: "pl-1", name: "Standard", unitPrice: 55 });

      const service = makeService();
      await service.updatePriceList(makeUser(), "pl-1", { unitPrice: 55, validTo: "2027-01-01" } as never, {});

      expect(mockPrisma.priceList.update).toHaveBeenCalledWith({
        where: { id: "pl-1" },
        data: expect.objectContaining({ unitPrice: 55, validTo: new Date("2027-01-01"), updatedById: "user-1" })
      });
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "PriceList" }));
    });

    it("soft-deletes a price list via deletedAt", async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue({ id: "pl-1", companyId: "company-1", branchId: "branch-1", name: "Standard" });
      mockPrisma.priceList.update.mockResolvedValue({ id: "pl-1", deletedAt: new Date() });

      const service = makeService();
      await service.deletePriceList(makeUser(), "pl-1", {});

      expect(mockPrisma.priceList.update).toHaveBeenCalledWith({
        where: { id: "pl-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "PriceList" }));
    });

    it("throws NotFoundException for a price list outside the caller's scope", async () => {
      mockPrisma.priceList.findFirst.mockResolvedValue(null);

      const service = makeService();
      await expect(service.deletePriceList(makeUser(), "missing", {})).rejects.toThrow(NotFoundException);
    });
  });
});

describe("SalesService — sales order edit & cancel", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("updateSalesOrder", () => {
    it("recomputes totals from the new line items and rewrites the item rows", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "so-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", customerId: "cust-1",
        orderNumber: "SO-001", status: "PENDING_STOCK_APPROVAL", subtotal: 100, discountAmount: 0, taxAmount: 0, items: [], invoices: []
      });
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1" }]);
      mockTx.salesOrder.update.mockResolvedValue({ id: "so-1", totalAmount: 250 });

      const service = makeService();
      await service.updateSalesOrder(makeUser(), "so-1", { items: [{ productId: "prod-1", quantity: 5, unitPrice: 50 }] } as never, {});

      expect(mockTx.salesOrderItem.deleteMany).toHaveBeenCalledWith({ where: { salesOrderId: "so-1" } });
      expect(mockTx.salesOrder.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "so-1" },
        data: expect.objectContaining({ subtotal: 250, totalAmount: 250, balanceDue: 250 })
      }));
      expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "SalesOrder" }));
    });

    it("rejects editing an order that is past pending stock approval", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "so-1", companyId: "company-1", branchId: "branch-1", status: "FULFILLED", items: [], invoices: []
      });

      const service = makeService();
      await expect(service.updateSalesOrder(makeUser(), "so-1", { notes: "x" } as never, {})).rejects.toThrow(BadRequestException);
      expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
    });

    it("rejects editing once an invoice exists", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "so-1", companyId: "company-1", branchId: "branch-1", status: "PENDING_STOCK_APPROVAL", items: [], invoices: [{ id: "inv-1" }]
      });

      const service = makeService();
      await expect(service.updateSalesOrder(makeUser(), "so-1", { notes: "x" } as never, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("cancelSalesOrder", () => {
    it("soft-cancels a pending order", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({ id: "so-1", companyId: "company-1", branchId: "branch-1", orderNumber: "SO-001", status: "PENDING_STOCK_APPROVAL" });
      mockPrisma.salesOrder.update.mockResolvedValue({ id: "so-1", status: "CANCELLED" });

      const service = makeService();
      const result = await service.cancelSalesOrder(makeUser(), "so-1", {});

      expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({ where: { id: "so-1" }, data: { status: "CANCELLED", updatedById: "user-1" } });
      expect(result.data.status).toBe("CANCELLED");
    });

    it("rejects cancelling an order that is already fulfilled", async () => {
      mockPrisma.salesOrder.findFirst.mockResolvedValue({ id: "so-1", companyId: "company-1", branchId: "branch-1", status: "FULFILLED" });

      const service = makeService();
      await expect(service.cancelSalesOrder(makeUser(), "so-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.salesOrder.update).not.toHaveBeenCalled();
    });
  });
});

describe("SalesService.recordCashSaleForExternalDispatch — books a settled cash sale for an already-dispatched item", () => {
  beforeEach(() => jest.clearAllMocks());

  function stub() {
    mockTx.customer.findFirst.mockResolvedValue(null);
    mockTx.customer.create.mockResolvedValue({ id: "cash-cust-1", branchId: "branch-1" });
    mockTx.salesOrder.create.mockResolvedValue({ id: "so-1", orderNumber: "SO-1" });
    mockTx.invoice.create.mockResolvedValue({ id: "inv-1", invoiceNumber: "INV-1" });
    mockTx.payment.create.mockResolvedValue({ id: "pay-1" });
    mockTx.receipt.create.mockResolvedValue({ id: "rct-1" });
    mockTx.revenue.create.mockResolvedValue({ id: "rev-1" });
  }

  const input = {
    branchId: "branch-1", warehouseId: "wh-1", productId: "prod-1", productName: "Broiler Finisher",
    quantity: 500, unitPrice: 6, customerName: "Kojo Farms", sourceLabel: "feed batch FB-2026-0001"
  };

  it("creates a FULFILLED order, a PAID zero-balance invoice, a settled payment + receipt, and a PRODUCT_SALES revenue entry", async () => {
    stub();
    const service = makeService();
    const result = await (service as unknown as {
      recordCashSaleForExternalDispatch: (tx: typeof mockTx, user: AuthenticatedUser, i: typeof input) => Promise<Record<string, string>>;
    }).recordCashSaleForExternalDispatch(mockTx, makeUser(), input);

    expect(mockTx.salesOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FULFILLED", totalAmount: 3000, paidAmount: 3000, balanceDue: 0 }) })
    );
    expect(mockTx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID", balanceDue: 0 }) })
    );
    expect(mockTx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 3000, method: "CASH" }) })
    );
    expect(mockTx.revenue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "PRODUCT_SALES", amount: 3000, invoiceRef: "INV-1" }) })
    );
    expect(result).toEqual({ salesOrderId: "so-1", invoiceId: "inv-1", paymentId: "pay-1", revenueId: "rev-1" });
  });

  it("reuses an existing walk-in customer instead of creating a duplicate", async () => {
    stub();
    mockTx.customer.findFirst.mockResolvedValue({ id: "cash-cust-existing", branchId: "branch-1" });
    const service = makeService();
    await (service as unknown as {
      recordCashSaleForExternalDispatch: (tx: typeof mockTx, user: AuthenticatedUser, i: typeof input) => Promise<unknown>;
    }).recordCashSaleForExternalDispatch(mockTx, makeUser(), input);

    expect(mockTx.customer.create).not.toHaveBeenCalled();
    expect(mockTx.salesOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: "cash-cust-existing" }) })
    );
  });
});

describe("SalesService.orderShortage / raiseShortagePurchaseRequest — actionable stock-shortage path", () => {
  function orderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "so-1", orderNumber: "SO-001", branchId: "branch-1", warehouseId: "wh-1",
      warehouse: { id: "wh-1", name: "Central Warehouse" },
      items: [{ productId: "prod-1", quantity: 50, unitPrice: 10 }],
      ...overrides
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.salesOrder.findFirst.mockResolvedValue(orderRow());
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", name: "Layer Feed 50kg", sku: "LF-50", uom: { symbol: "BAG" } }]);
  });

  describe("orderShortage", () => {
    it("reports the exact shortfall per item instead of a flat yes/no", async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([{ productId: "prod-1", quantityOnHand: 20 }]);

      const service = makeService();
      const result = await service.orderShortage(makeUser({ warehouseIds: ["wh-1"] }), "so-1");

      expect(result.data.canApprove).toBe(false);
      expect(result.data.shortages).toEqual([
        expect.objectContaining({ productId: "prod-1", ordered: 50, available: 20, shortBy: 30, unitPrice: 10 })
      ]);
    });

    it("treats a product with no InventoryItem row at all as 0 on hand, not a different error class", async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([]); // no row for prod-1 in this warehouse

      const service = makeService();
      const result = await service.orderShortage(makeUser({ warehouseIds: ["wh-1"] }), "so-1");

      expect(result.data.shortages[0]).toEqual(expect.objectContaining({ available: 0, shortBy: 50 }));
    });

    it("reports no shortage when stock fully covers the order", async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([{ productId: "prod-1", quantityOnHand: 100 }]);

      const service = makeService();
      const result = await service.orderShortage(makeUser({ warehouseIds: ["wh-1"] }), "so-1");

      expect(result.data.canApprove).toBe(true);
      expect(result.data.shortages).toEqual([]);
    });
  });

  describe("raiseShortagePurchaseRequest", () => {
    it("creates a purchase request for exactly the shortfall, linked back to the sales order", async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([{ productId: "prod-1", quantityOnHand: 20 }]);
      mockPrisma.purchaseRequest.create.mockResolvedValue({ id: "pr-1", reference: "PR-REF-001" });

      const service = makeService();
      const result = await service.raiseShortagePurchaseRequest(makeUser({ warehouseIds: ["wh-1"] }), "so-1", {}, {});

      expect(mockPrisma.purchaseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            salesOrderId: "so-1",
            title: "Stock shortage — Sales Order SO-001",
            totalEstimate: 300, // 30 short × GHS 10
            items: { create: [expect.objectContaining({ productId: "prod-1", quantity: 30, uomCode: "BAG" })] }
          })
        })
      );
      expect(result.data.id).toBe("pr-1");
    });

    it("refuses when the order has no shortage — nothing to request", async () => {
      mockPrisma.inventoryItem.findMany.mockResolvedValue([{ productId: "prod-1", quantityOnHand: 100 }]);

      const service = makeService();
      await expect(
        service.raiseShortagePurchaseRequest(makeUser({ warehouseIds: ["wh-1"] }), "so-1", {}, {})
      ).rejects.toThrow(/no stock shortage/);
      expect(mockPrisma.purchaseRequest.create).not.toHaveBeenCalled();
    });
  });
});

describe("SalesService.approveStockRelease — named, actionable shortage message", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "so-1", companyId: "company-1", branchId: "branch-1", customerId: "cust-1", warehouseId: "wh-1",
      warehouse: { id: "wh-1", name: "Central Warehouse" },
      orderNumber: "SO-001", status: "APPROVED", totalAmount: 500,
      items: [{ productId: "prod-1", quantity: 50 }],
      invoices: []
    });
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", name: "Layer Feed 50kg", sku: "LF-50" }]);
  });

  it("names the product, warehouse, and exact shortfall when there is no InventoryItem row at all", async () => {
    mockTx.inventoryItem.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(service.approveStockRelease(makeUser({ warehouseIds: ["wh-1"] }), "so-1", {})).rejects.toThrow(
      /Layer Feed 50kg \(LF-50\)" from Central Warehouse — need 50, have 0/
    );
  });

  it("names the same detail when the item exists but doesn't have enough on hand", async () => {
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", productId: "prod-1", quantityOnHand: 12 });

    const service = makeService();
    await expect(service.approveStockRelease(makeUser({ warehouseIds: ["wh-1"] }), "so-1", {})).rejects.toThrow(
      /need 50, have 12/
    );
  });
});

describe("SalesService.dashboard — Today section + debtor counts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns today's order count/value, revenue collected, invoiced value, and debtor counts", async () => {
    mockPrisma.salesOrder.findMany.mockResolvedValue([]);
    mockPrisma.salesOrder.aggregate.mockResolvedValue({ _count: 4, _sum: { totalAmount: 5200 } });
    mockPrisma.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { totalAmount: 90000, balanceDue: 12000 } }) // company-wide
      .mockResolvedValueOnce({ _sum: { totalAmount: 1500 } });                     // invoiced today
    mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 800 } });
    mockPrisma.salesReturn.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });
    mockPrisma.customerCreditLimit.findMany.mockResolvedValue([
      { creditLimit: 1000, currentBalance: 1400 }, // over
      { creditLimit: 500, currentBalance: 100 },   // fine
      { creditLimit: 2000, currentBalance: 2001 }, // over
    ]);
    mockPrisma.invoice.count.mockResolvedValue(3); // overdue

    const service = makeService();
    const res = await service.dashboard(makeUser(), {} as never);

    expect(res.data.today).toEqual({ ordersCount: 4, ordersValue: 5200, revenueCollected: 800, invoicedValue: 1500 });
    expect(res.data.debtors).toEqual({ totalOutstanding: 12000, customersOverLimit: 2, overdueInvoices: 3 });
  });
});

describe("SalesService — proforma quotes", () => {
  beforeEach(() => jest.clearAllMocks());

  const quoteDto = {
    customerId: "cust-1",
    items: [
      { productId: "prod-1", quantity: 10, unitPrice: 20 },
      { productId: "prod-2", quantity: 5, unitPrice: 12, discountAmount: 10 },
    ],
    taxAmount: 15,
  };

  it("createQuote computes totals, reserves no stock and creates no order", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", branchId: "branch-1", status: "ACTIVE" });
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1" }, { id: "prod-2" }]);
    mockPrisma.salesQuote.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "qt-1", ...data }));

    const service = makeService();
    const res = await service.createQuote(makeUser(), quoteDto as never, {});

    // 10×20 = 200; 5×12 − 10 = 50; subtotal 250; + tax 15 = 265
    expect(mockPrisma.salesQuote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subtotal: 250, taxAmount: 15, totalAmount: 265, status: "DRAFT" }) })
    );
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
    expect(mockPrisma.customerCreditLimit.findFirst).not.toHaveBeenCalled();
    expect(res.data.id).toBe("qt-1");
  });

  it("createQuote rejects an empty item list", async () => {
    const service = makeService();
    await expect(service.createQuote(makeUser(), { customerId: "cust-1", items: [] } as never, {})).rejects.toThrow(/at least one item/);
  });

  it("updateQuote refuses a quote that isn't DRAFT", async () => {
    mockPrisma.salesQuote.findFirst.mockResolvedValue({ id: "qt-1", status: "SENT", quoteNumber: "QT-1", branchId: "branch-1", items: [] });
    const service = makeService();
    await expect(service.updateQuote(makeUser(), "qt-1", { notes: "x" } as never, {})).rejects.toThrow(/DRAFT/);
  });

  it("sendQuote moves DRAFT -> SENT", async () => {
    mockPrisma.salesQuote.findFirst.mockResolvedValue({ id: "qt-1", status: "DRAFT", quoteNumber: "QT-1", branchId: "branch-1" });
    mockPrisma.salesQuote.update.mockResolvedValue({ id: "qt-1", status: "SENT" });
    const service = makeService();
    const res = await service.sendQuote(makeUser(), "qt-1", {});
    expect(mockPrisma.salesQuote.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
    expect(res.data.status).toBe("SENT");
  });

  it("convertQuoteToOrder refuses an already-converted or declined quote", async () => {
    mockPrisma.salesQuote.findFirst.mockResolvedValue({ id: "qt-1", status: "CONVERTED", quoteNumber: "QT-1", branchId: "branch-1", items: [] });
    const service = makeService();
    await expect(service.convertQuoteToOrder(makeUser(), "qt-1", { warehouseId: "wh-1" } as never, {})).rejects.toThrow(/already been converted/);

    mockPrisma.salesQuote.findFirst.mockResolvedValue({ id: "qt-1", status: "DECLINED", quoteNumber: "QT-1", branchId: "branch-1", items: [] });
    await expect(service.convertQuoteToOrder(makeUser(), "qt-1", { warehouseId: "wh-1" } as never, {})).rejects.toThrow(/declined quote cannot be converted/);
  });
});
