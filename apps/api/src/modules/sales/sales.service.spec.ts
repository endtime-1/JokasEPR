import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { SalesService } from "./sales.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-001") }));

const mockTx = {
  payment: { create: jest.fn() },
  invoice: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  salesOrder: { update: jest.fn() },
  customer: { findUniqueOrThrow: jest.fn() },
  customerCreditLimit: { upsert: jest.fn(), update: jest.fn() },
  customerStatement: { create: jest.fn() },
  receipt: { create: jest.fn() },
  inventoryItem: { upsert: jest.fn() },
  stockBatch: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  salesReturn: { update: jest.fn() }
};

const mockPrisma = {
  customer: { findFirst: jest.fn() },
  invoice: { findFirst: jest.fn() },
  warehouse: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  salesOrderItem: { findFirst: jest.fn() },
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
