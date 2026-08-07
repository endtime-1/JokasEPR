import { AuthenticatedUser } from "@jokas/shared";
import { InventoryService } from "./inventory.service";

const mockTx = {
  stockBatch: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  stockMovement: { create: jest.fn() },
  inventoryItem: { update: jest.fn() }
};

const mockPrisma = {
  inventoryItem: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
  stockAdjustment: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  stockApproval: { updateMany: jest.fn().mockResolvedValue({}) },
  stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new InventoryService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: ["inventory.manage"], branchIds: [], farmIds: [], warehouseIds: ["wh-1"], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("InventoryService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("InventoryService.createStockMovement — StockBatch tracking (H9)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a StockBatch for an 'in' movement instead of just incrementing quantityOnHand", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1",
      product: { id: "prod-1", sku: "SKU-1", uomId: "uom-1" }
    });
    mockTx.stockBatch.create.mockResolvedValue({ id: "batch-1" });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mov-1" });
    mockTx.inventoryItem.update.mockResolvedValue({});

    const service = makeService();
    await service.createStockMovement(
      makeUser(),
      { inventoryItemId: "item-1", movementType: "PURCHASE_RECEIPT", quantity: 20, unitCost: 5 } as never,
      {}
    );

    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantityReceived: 20, quantityRemaining: 20, unitCost: 5 }) })
    );
    expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stockBatchId: "batch-1" }) })
    );
  });

  it("consumes via FIFO batches for an 'out' movement instead of a plain unguarded decrement", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1", quantityOnHand: 50,
      product: { id: "prod-1", sku: "SKU-1", uomId: "uom-1" }
    });
    mockTx.stockBatch.findMany.mockResolvedValue([
      { id: "batch-1", quantityRemaining: 30, unitCost: 5, expiryDate: null, createdAt: new Date() }
    ]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mov-1" });
    mockTx.inventoryItem.update.mockResolvedValue({});

    const service = makeService();
    const res = await service.createStockMovement(
      makeUser(),
      { inventoryItemId: "item-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never,
      {}
    );

    // Consumed from the FIFO batch, not a direct plain decrement on the item.
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantityRemaining: { gte: 10 } },
      data: { quantityRemaining: { decrement: 10 } }
    });
    expect((res.data as { itemId: string; issued: unknown }).issued).toBeDefined();
  });
});

describe("InventoryService.approveAdjustment → applyAdjustment — StockBatch on positive adjustments (H9)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a StockBatch when approving a positive stock adjustment", async () => {
    mockPrisma.stockAdjustment.findFirst.mockResolvedValue({
      id: "adj-1", companyId: "company-1", warehouseId: "wh-1", status: "PENDING_APPROVAL",
      inventoryItemId: "item-1", quantity: 15, unitCost: 8, adjustmentType: "RECOUNT", reason: "recount", branchId: "branch-1"
    });
    mockPrisma.inventoryItem.findUniqueOrThrow.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1", quantityOnHand: 100
    });
    mockTx.stockBatch.create.mockResolvedValue({ id: "batch-1" });
    mockTx.inventoryItem.update.mockResolvedValue({});
    mockTx.stockMovement.create.mockResolvedValue({});

    const service = makeService();
    await service.approveAdjustment(makeUser(), "adj-1", { status: "APPROVED" } as never, {});

    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantityReceived: 15, quantityRemaining: 15, unitCost: 8 }) })
    );
  });
});
