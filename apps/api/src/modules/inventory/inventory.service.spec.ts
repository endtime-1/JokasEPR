import { AuthenticatedUser } from "@jokas/shared";
import { InventoryService } from "./inventory.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("RSV-2026-0001") }));

const mockTx = {
  stockBatch: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  stockMovement: { create: jest.fn() },
  inventoryItem: { update: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
  stockReservation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  stockAdjustment: { create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  stockApproval: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({}) },
  stockTransfer: { create: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([])
};

const mockPrisma = {
  inventoryItem: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  stockAdjustment: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  stockApproval: { updateMany: jest.fn().mockResolvedValue({}) },
  stockReservation: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn() },
  stockBatch: { findFirst: jest.fn() },
  stockTransfer: { findFirst: jest.fn() },
  stockMovement: { findFirst: jest.fn() },
  stockReorderLevel: { upsert: jest.fn().mockResolvedValue({}) },
  warehouse: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  warehouseLocation: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
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
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });

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

  it("floor-guards the final aggregate item decrement against concurrent overdraw (7th-consumer gap)", async () => {
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
    // Simulate a concurrent transaction having already drained quantityOnHand below the requested amount.
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.createStockMovement(
        makeUser(),
        { inventoryItemId: "item-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never,
        {}
      )
    ).rejects.toThrow("Insufficient stock — possibly consumed concurrently. Please retry.");

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "item-1", quantityOnHand: { gte: 10 } },
      data: { quantityOnHand: { decrement: 10 }, updatedById: "user-1" }
    });
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
    mockTx.stockAdjustment.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: "adj-1", status: "APPROVED" });

    const service = makeService();
    await service.approveAdjustment(makeUser(), "adj-1", { status: "APPROVED" } as never, {});

    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantityReceived: 15, quantityRemaining: 15, unitCost: 8 }) })
    );
  });

  it("C2 (DB stability audit): a second concurrent approveAdjustment call is rejected once the first has claimed the row", async () => {
    mockPrisma.stockAdjustment.findFirst.mockResolvedValue({
      id: "adj-1", companyId: "company-1", warehouseId: "wh-1", status: "PENDING_APPROVAL",
      inventoryItemId: "item-1", quantity: 15, unitCost: 8, adjustmentType: "RECOUNT", reason: "recount", branchId: "branch-1"
    });
    mockPrisma.inventoryItem.findUniqueOrThrow.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1", quantityOnHand: 100
    });
    // Simulates the guarded updateMany matching zero rows because another
    // concurrent request already flipped status away from PENDING_APPROVAL.
    mockTx.stockAdjustment.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.approveAdjustment(makeUser(), "adj-1", { status: "APPROVED" } as never, {})).rejects.toThrow(
      "This adjustment has already been processed."
    );
    expect(mockTx.stockBatch.create).not.toHaveBeenCalled();
  });
});

describe("InventoryService.releaseReservation — gives reservations an actual exit path (M3)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("marks an active reservation FULFILLED by default", async () => {
    mockPrisma.stockReservation.findFirst.mockResolvedValue({
      id: "rsv-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", status: "ACTIVE"
    });
    mockPrisma.stockReservation.update.mockResolvedValue({ id: "rsv-1", status: "FULFILLED" });

    const service = makeService();
    await service.releaseReservation(makeUser(), "rsv-1", {} as never, {});

    expect(mockPrisma.stockReservation.update).toHaveBeenCalledWith({
      where: { id: "rsv-1" },
      data: { status: "FULFILLED", updatedById: "user-1" }
    });
  });

  it("marks it CANCELLED when explicitly requested", async () => {
    mockPrisma.stockReservation.findFirst.mockResolvedValue({
      id: "rsv-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", status: "ACTIVE"
    });
    mockPrisma.stockReservation.update.mockResolvedValue({ id: "rsv-1", status: "CANCELLED" });

    const service = makeService();
    await service.releaseReservation(makeUser(), "rsv-1", { status: "CANCELLED" } as never, {});

    expect(mockPrisma.stockReservation.update).toHaveBeenCalledWith({
      where: { id: "rsv-1" },
      data: { status: "CANCELLED", updatedById: "user-1" }
    });
  });

  it("rejects releasing a reservation that is already resolved", async () => {
    mockPrisma.stockReservation.findFirst.mockResolvedValue({
      id: "rsv-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", status: "FULFILLED"
    });

    const service = makeService();
    await expect(service.releaseReservation(makeUser(), "rsv-1", {} as never, {})).rejects.toThrow();
    expect(mockPrisma.stockReservation.update).not.toHaveBeenCalled();
  });

  it("404s for a reservation outside the actor's company", async () => {
    mockPrisma.stockReservation.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(service.releaseReservation(makeUser(), "rsv-other-co", {} as never, {})).rejects.toThrow();
  });

  it("rejects releasing a reservation in a warehouse the actor cannot access", async () => {
    mockPrisma.stockReservation.findFirst.mockResolvedValue({
      id: "rsv-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-OTHER", status: "ACTIVE"
    });

    const service = makeService();
    await expect(
      service.releaseReservation(makeUser({ warehouseIds: ["wh-1"] }), "rsv-1", {} as never, {})
    ).rejects.toThrow();
    expect(mockPrisma.stockReservation.update).not.toHaveBeenCalled();
  });
});

describe("InventoryService.updateItem / deleteItem", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updateItem patches reorderLevel and status without touching quantityOnHand", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", companyId: "company-1", warehouseId: "wh-1" });
    mockPrisma.inventoryItem.update.mockResolvedValue({ id: "item-1", reorderLevel: 25, status: "INACTIVE" });
    mockPrisma.inventoryItem.findUniqueOrThrow.mockResolvedValue({ id: "item-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1" });

    const service = makeService();
    await service.updateItem(makeUser(), "item-1", { reorderLevel: 25, status: "INACTIVE" } as never, {});

    const data = mockPrisma.inventoryItem.update.mock.calls[0][0].data;
    expect(data).toEqual({ reorderLevel: 25, status: "INACTIVE", updatedById: "user-1" });
    expect(data.quantityOnHand).toBeUndefined();
  });

  it("updateItem 404s for an item outside the actor's company", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);
    const service = makeService();
    await expect(service.updateItem(makeUser(), "item-other", {} as never, {})).rejects.toThrow();
    expect(mockPrisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("deleteItem soft-deletes an item with zero quantity and no live batches", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", quantityOnHand: 0 });
    mockPrisma.stockBatch.findFirst.mockResolvedValue(null);
    mockPrisma.inventoryItem.update.mockResolvedValue({});

    const service = makeService();
    await service.deleteItem(makeUser(), "item-1", {});

    expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date), updatedById: "user-1" })
    });
  });

  it("deleteItem is blocked when quantityOnHand is non-zero", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", quantityOnHand: 10 });

    const service = makeService();
    await expect(service.deleteItem(makeUser(), "item-1", {})).rejects.toThrow(/non-zero quantity/);
    expect(mockPrisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("deleteItem is blocked when a live stock batch still exists", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", quantityOnHand: 0 });
    mockPrisma.stockBatch.findFirst.mockResolvedValue({ id: "batch-1" });

    const service = makeService();
    await expect(service.deleteItem(makeUser(), "item-1", {})).rejects.toThrow(/live stock batches/);
    expect(mockPrisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe("InventoryService.listLocations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes to the actor's company and assigned warehouses (no empty-IN() for global-access users)", async () => {
    mockPrisma.warehouseLocation.findMany.mockResolvedValue([{ id: "loc-1", code: "A1" }]);

    const service = makeService();
    await service.listLocations(makeUser({ hasGlobalAccess: true, warehouseIds: [] }), {} as never);

    expect(mockPrisma.warehouseLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1", deletedAt: null } })
    );
  });

  it("filters by the actor's assigned warehouses when not globally scoped", async () => {
    mockPrisma.warehouseLocation.findMany.mockResolvedValue([]);

    const service = makeService();
    await service.listLocations(makeUser({ hasGlobalAccess: false, warehouseIds: ["wh-1"] }), {} as never);

    expect(mockPrisma.warehouseLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "company-1", deletedAt: null, AND: [{ warehouseId: { in: ["wh-1"] } }] } })
    );
  });

  it("applies an explicit warehouseId filter from the query", async () => {
    mockPrisma.warehouseLocation.findMany.mockResolvedValue([]);

    const service = makeService();
    await service.listLocations(makeUser(), { warehouseId: "wh-2" } as never);

    expect(mockPrisma.warehouseLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([{ warehouseId: "wh-2" }]) }) })
    );
  });
});

describe("InventoryService.updateLocation / deleteLocation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updateLocation patches name/barcode/status", async () => {
    mockPrisma.warehouseLocation.findFirst.mockResolvedValue({ id: "loc-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", code: "A1" });
    mockPrisma.warehouseLocation.update.mockResolvedValue({ id: "loc-1", name: "Bay 2" });

    const service = makeService();
    await service.updateLocation(makeUser(), "loc-1", { name: "Bay 2" } as never, {});

    expect(mockPrisma.warehouseLocation.update).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: { name: "Bay 2", updatedById: "user-1" }
    });
  });

  it("deleteLocation soft-deletes a location with no children", async () => {
    mockPrisma.warehouseLocation.findFirst.mockResolvedValue({ id: "loc-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", code: "A1" });
    mockPrisma.warehouseLocation.count.mockResolvedValue(0);
    mockPrisma.warehouseLocation.update.mockResolvedValue({});

    const service = makeService();
    await service.deleteLocation(makeUser(), "loc-1", {});

    expect(mockPrisma.warehouseLocation.update).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date) })
    });
  });

  it("deleteLocation is blocked when child locations still reference it", async () => {
    mockPrisma.warehouseLocation.findFirst.mockResolvedValue({ id: "loc-1", companyId: "company-1", warehouseId: "wh-1", branchId: "branch-1", code: "A1" });
    mockPrisma.warehouseLocation.count.mockResolvedValue(2);

    const service = makeService();
    await expect(service.deleteLocation(makeUser(), "loc-1", {})).rejects.toThrow(/child locations/);
    expect(mockPrisma.warehouseLocation.update).not.toHaveBeenCalled();
  });
});

describe("InventoryService.reserve — locks the item row so concurrent reservations can't jointly over-book (H1)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("locks the item row inside the transaction before checking availability", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1", quantityOnHand: 100 });
    mockTx.stockReservation.findMany.mockResolvedValue([]);
    mockTx.stockReservation.create.mockResolvedValue({ id: "rsv-1", quantity: 60 });

    const service = makeService();
    await service.reserve(makeUser(), { warehouseId: "wh-1", productId: "prod-1", quantity: 60, purpose: "hold" } as never, {});

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.stockReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 60, inventoryItemId: "item-1" }) })
    );
  });

  it("rejects a reservation that would exceed stock net of already-active reservations", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1", quantityOnHand: 100 });
    // Another 60 units are already reserved (read inside the same locked
    // transaction) — 50 more would jointly reserve 110 against 100 on hand.
    mockTx.stockReservation.findMany.mockResolvedValue([{ quantity: 60 }]);

    const service = makeService();
    await expect(
      service.reserve(makeUser(), { warehouseId: "wh-1", productId: "prod-1", quantity: 50, purpose: "hold" } as never, {})
    ).rejects.toThrow(/Insufficient available stock/);
    expect(mockTx.stockReservation.create).not.toHaveBeenCalled();
  });
});

describe("InventoryService.createAdjustment — idempotencyKey dedup (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("replays the original adjustment instead of creating a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1"
    });
    mockPrisma.stockAdjustment.findFirst.mockResolvedValue({ id: "adj-existing", adjustmentNumber: "ADJ-EXIST" });

    const service = makeService();
    const result = await service.createAdjustment(
      makeUser(),
      { warehouseId: "wh-1", productId: "prod-1", adjustmentType: "RECOUNT", quantity: 5, reason: "recount", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "adj-existing", adjustmentNumber: "ADJ-EXIST" });
    expect(mockTx.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the adjustment row on a genuinely new adjustment", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1"
    });
    mockPrisma.stockAdjustment.findFirst.mockResolvedValue(null);
    mockTx.stockAdjustment.create.mockResolvedValue({ id: "adj-1", adjustmentNumber: "ADJ-1" });
    mockTx.stockApproval.create.mockResolvedValue({});

    const service = makeService();
    await service.createAdjustment(
      makeUser(),
      { warehouseId: "wh-1", productId: "prod-1", adjustmentType: "RECOUNT", quantity: 5, reason: "recount", idempotencyKey: "key-1" } as never,
      {}
    );

    expect(mockTx.stockAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-1" }) })
    );
  });
});

describe("InventoryService.transfer — idempotencyKey dedup (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => jest.clearAllMocks());

  function stubTransferPrereqs() {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", warehouseId: "wh-1", productionSiteId: null, productId: "prod-1", quantityOnHand: 100
    });
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-2", companyId: "company-1", branchId: "branch-1", farmId: null, productionSiteId: null });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", companyId: "company-1", sku: "SKU-1", uomId: "uom-1" });
  }

  it("replays the original transfer instead of creating a duplicate when the idempotencyKey was already used", async () => {
    stubTransferPrereqs();
    mockPrisma.stockTransfer.findFirst.mockResolvedValue({ id: "tr-existing", transferNumber: "STR-EXIST" });

    const service = makeService();
    const result = await service.transfer(
      makeUser({ warehouseIds: ["wh-1", "wh-2"] }),
      { fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: "prod-1", quantity: 5, idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "tr-existing", transferNumber: "STR-EXIST" });
    expect(mockTx.stockTransfer.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the transfer row on a genuinely new transfer", async () => {
    stubTransferPrereqs();
    mockPrisma.stockTransfer.findFirst.mockResolvedValue(null);
    mockTx.stockTransfer.create.mockResolvedValue({ id: "tr-1", transferNumber: "STR-1" });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 30, unitCost: 5, expiryDate: null, createdAt: new Date() }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mov-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "item-2" });
    mockTx.stockBatch.create.mockResolvedValue({ id: "batch-2" });

    const service = makeService();
    await service.transfer(
      makeUser({ warehouseIds: ["wh-1", "wh-2"] }),
      { fromWarehouseId: "wh-1", toWarehouseId: "wh-2", productId: "prod-1", quantity: 5, idempotencyKey: "key-1" } as never,
      {}
    );

    expect(mockTx.stockTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-1" }) })
    );
  });
});

describe("InventoryService.createStockMovement — idempotencyKey dedup on the 'in' path (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("replays the original movement instead of creating a duplicate when the idempotencyKey was already used", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1",
      product: { id: "prod-1", sku: "SKU-1", uomId: "uom-1" }
    });
    mockPrisma.stockMovement.findFirst.mockResolvedValue({ id: "mov-existing" });

    const service = makeService();
    const result = await service.createStockMovement(
      makeUser(),
      { inventoryItemId: "item-1", movementType: "PURCHASE_RECEIPT", quantity: 20, unitCost: 5, idempotencyKey: "key-1" } as never,
      {}
    );

    expect(result.data).toEqual({ id: "mov-existing" });
    expect(mockTx.stockBatch.create).not.toHaveBeenCalled();
  });

  it("passes the idempotencyKey through to the movement row on a genuinely new 'in' movement", async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({
      id: "item-1", companyId: "company-1", branchId: "branch-1", farmId: null, warehouseId: "wh-1",
      productionSiteId: null, productId: "prod-1", uomId: "uom-1",
      product: { id: "prod-1", sku: "SKU-1", uomId: "uom-1" }
    });
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockTx.stockBatch.create.mockResolvedValue({ id: "batch-1" });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mov-1" });
    mockTx.inventoryItem.update.mockResolvedValue({});

    const service = makeService();
    await service.createStockMovement(
      makeUser(),
      { inventoryItemId: "item-1", movementType: "PURCHASE_RECEIPT", quantity: 20, unitCost: 5, idempotencyKey: "key-1" } as never,
      {}
    );

    expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "key-1" }) })
    );
  });
});
