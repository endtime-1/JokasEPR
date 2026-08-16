import { AuthenticatedUser } from "@jokas/shared";
import { FeedProductionService } from "./feed-production.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("FB-2026-0001") }));

const mockTx = {
  feedProductionBatch: { create: jest.fn(), update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { producedQuantityKg: 0 } }) },
  inventoryItem: { updateMany: jest.fn(), upsert: jest.fn() },
  stockBatch: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  feedRawMaterialUsage: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  finishedFeedStock: { create: jest.fn() },
  feedProductionCost: { create: jest.fn() },
  feedProductionOrder: { update: jest.fn() },
  feedQualityCheck: { update: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([])
};

const mockPrisma = {
  feedProductionOrder: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
  feedProductionBatch: { aggregate: jest.fn(), findFirst: jest.fn() },
  feedProductionCost: { findFirst: jest.fn() },
  feedFormula: { findFirst: jest.fn() },
  inventoryItem: { findMany: jest.fn() },
  feedQualityCheck: { findFirst: jest.fn() },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
const mockLookupCache = { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() };

function makeService() {
  return new FeedProductionService(mockPrisma as never, mockAudit as never, mockLookupCache as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("FeedProductionService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("FeedProductionService.listOrders — orderWhere empty-array convention (H12)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not filter to an empty productionSiteId IN() for a user with zero site assignments", async () => {
    // This is the exact bug: a non-hasGlobalAccess user with no explicit
    // productionSiteIds assigned is supposed to be unrestricted (matching
    // the app-wide convention), not filtered to `{ in: [] }` (which matches
    // nothing and silently blanks the page).
    const service = makeService();
    await service.listOrders(makeUser({ productionSiteIds: [] }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toBeUndefined();
  });

  it("restricts to the user's own productionSiteIds when they do have assignments", async () => {
    const service = makeService();
    await service.listOrders(makeUser({ productionSiteIds: ["site-1"] }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toEqual({ in: ["site-1"] });
  });

  it("applies no restriction at all for a global-access user", async () => {
    const service = makeService();
    await service.listOrders(makeUser({ hasGlobalAccess: true }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toBeUndefined();
  });
});

describe("FeedProductionService.createBatch — per-lot floor guard + full-consumption check (H2)", () => {
  function mockHappyPath() {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 1000, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }] }
    });
    mockPrisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: 0 } });
    mockPrisma.feedFormula.findFirst.mockResolvedValue({
      id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }]
    });
    mockPrisma.inventoryItem.findMany
      .mockResolvedValueOnce([{ productId: "ing-1", quantityOnHand: 500 }]) // materialAvailability's stock snapshot
      .mockResolvedValueOnce([{ id: "inv-1", productId: "ing-1", uomId: "uom-1" }]); // pre-loaded inventoryMap

    mockTx.feedProductionBatch.create.mockResolvedValue({ id: "batch-1", batchNumber: "FB-TEST-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "finished-inv-1" });
    mockTx.stockBatch.create.mockResolvedValue({ id: "sb-finished-1" });
    mockTx.finishedFeedStock.create.mockResolvedValue({});
    mockTx.stockMovement.create.mockResolvedValue({});
    mockTx.feedProductionCost.create.mockResolvedValue({});
    mockTx.feedProductionOrder.update.mockResolvedValue({});
    mockTx.feedRawMaterialUsage.create.mockResolvedValue({});
  }

  const dto = {
    productionOrderId: "order-1",
    rawMaterialWarehouseId: "wh-raw",
    finishedWarehouseId: "wh-fin",
    producedQuantityKg: 100,
    batchNumber: "FB-TEST-1"
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHappyPath();
  });

  it("floor-guards each StockBatch lot decrement and succeeds when the lot has enough remaining stock", async () => {
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {});

    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "lot-a", quantityRemaining: { gte: 50 } },
      data: { quantityRemaining: { decrement: 50 } }
    });
  });

  it("rolls back the whole batch when a lot was consumed concurrently (floor guard fails)", async () => {
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {})
    ).rejects.toThrow(/consumed concurrently/);
    expect(mockTx.feedProductionOrder.update).not.toHaveBeenCalled();
  });

  it("rolls back instead of silently drifting out of sync when lots on hand sum to less than required", async () => {
    // Only 30kg available across all lots even though 50kg is required for
    // this batch — previously this just left `remaining = 20` with no error,
    // letting inventoryItem.quantityOnHand and the batch-level lot records
    // silently drift apart.
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 30 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await expect(
      service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {})
    ).rejects.toThrow(/out of sync/);
  });

  it("High (DB stability audit, 2026-08-16): re-checks the planned-quantity cap under a row lock, catching a concurrent batch the pre-check's plain read couldn't see", async () => {
    // The fast-fail pre-check (mockPrisma.feedProductionBatch.aggregate) sees
    // 0 already produced and passes — but by the time this call reaches the
    // transaction, a concurrent batch has landed and pushed the real total to
    // 950/1000kg. The locked re-check (mockTx.feedProductionBatch.aggregate)
    // must catch what the pre-check missed.
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.feedProductionBatch.aggregate.mockResolvedValueOnce({ _sum: { producedQuantityKg: 950 } });

    const service = makeService();
    await expect(
      service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {})
    ).rejects.toThrow(/exceed the planned quantity/);

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.feedProductionBatch.create).not.toHaveBeenCalled();
  });

  it("idempotency (DB stability audit, 2026-08-16): replays the original batch instead of double-processing when the idempotencyKey was already used", async () => {
    mockPrisma.feedProductionBatch.findFirst.mockResolvedValue({ id: "batch-existing", producedQuantityKg: 100 });
    mockPrisma.feedProductionCost.findFirst.mockResolvedValue({ rawMaterialCost: 100, laborCost: 0, packagingCost: 0, overheadCost: 0, expectedSalesValue: 0 });

    const service = makeService();
    const result = await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), { ...dto, idempotencyKey: "key-1" } as never, {});

    expect(result.data.id).toBe("batch-existing");
    expect(mockPrisma.feedProductionOrder.findFirst).not.toHaveBeenCalled();
    expect(mockTx.feedProductionBatch.create).not.toHaveBeenCalled();
  });

  it("idempotency (DB stability audit, 2026-08-16): replays the original batch when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.feedProductionBatch.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-existing", producedQuantityKg: 100 });
    mockPrisma.feedProductionCost.findFirst.mockResolvedValue(null);
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.feedProductionBatch.create.mockRejectedValue({ code: "P2002" });

    const service = makeService();
    const result = await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), { ...dto, idempotencyKey: "key-1" } as never, {});

    expect(result.data.id).toBe("batch-existing");
  });
});

describe("FeedProductionService.approveQualityCheck — check + batch status updated atomically (H-BACK-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCheck(overrides: Record<string, unknown> = {}) {
    return {
      id: "check-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      productionBatchId: "batch-1", checkedById: "user-checker", deletedAt: null,
      productionBatch: { batchNumber: "FB-2026-0001", finishedProductId: "product-1" },
      ...overrides
    };
  }

  it("updates the quality check and the production batch inside the same transaction", async () => {
    mockPrisma.feedQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.feedQualityCheck.update.mockResolvedValue({ id: "check-1", status: "APPROVED" });

    const service = makeService();
    await service.approveQualityCheck(
      makeUser({ id: "user-approver", hasGlobalAccess: true }),
      "check-1",
      { status: "APPROVED" } as never,
      {}
    );

    // Both updates must go through the SAME tx handle passed into the
    // $transaction callback, not this.prisma directly — otherwise a
    // failure between them wouldn't roll back the other.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.feedQualityCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "check-1" } })
    );
    expect(mockTx.feedProductionBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "APPROVED", updatedById: "user-approver" }
    });
  });

  it("rolls back the check update if the batch update fails (atomicity)", async () => {
    mockPrisma.feedQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.feedQualityCheck.update.mockResolvedValue({ id: "check-1", status: "FAILED" });
    mockTx.feedProductionBatch.update.mockRejectedValueOnce(new Error("db blip"));

    const service = makeService();
    await expect(
      service.approveQualityCheck(makeUser({ hasGlobalAccess: true }), "check-1", { status: "FAILED" } as never, {})
    ).rejects.toThrow("db blip");

    // The real safety property: because both calls run through the mocked
    // $transaction's single callback invocation, a thrown batch-update
    // rejects the whole $transaction() call — there is no code path here
    // where the check update could be committed on its own.
    expect(mockTx.feedQualityCheck.update).toHaveBeenCalled();
  });

  it("maps a FAILED check to a REJECTED batch status, not left on its pre-check status", async () => {
    mockPrisma.feedQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.feedQualityCheck.update.mockResolvedValue({ id: "check-1", status: "FAILED" });

    const service = makeService();
    await service.approveQualityCheck(makeUser({ hasGlobalAccess: true }), "check-1", { status: "FAILED" } as never, {});

    expect(mockTx.feedProductionBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "REJECTED", updatedById: expect.any(String) }
    });
  });

  it("H-BUG-2: a FAILED check quarantines the finished-goods StockBatch, not just the production batch record", async () => {
    mockPrisma.feedQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.feedQualityCheck.update.mockResolvedValue({ id: "check-1", status: "FAILED" });

    const service = makeService();
    await service.approveQualityCheck(makeUser({ id: "user-approver", hasGlobalAccess: true }), "check-1", { status: "FAILED" } as never, {});

    // The finished StockBatch has no FK back to FeedProductionBatch, so it's
    // matched by companyId + product + the shared batchNumber both records
    // are stamped with at creation time.
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", productId: "product-1", batchNumber: "FB-2026-0001", deletedAt: null },
      data: { status: "QUARANTINED", updatedById: "user-approver" }
    });
  });

  it("H-BUG-2: an APPROVED check clears the StockBatch back to AVAILABLE", async () => {
    mockPrisma.feedQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.feedQualityCheck.update.mockResolvedValue({ id: "check-1", status: "APPROVED" });

    const service = makeService();
    await service.approveQualityCheck(makeUser({ id: "user-approver", hasGlobalAccess: true }), "check-1", { status: "APPROVED" } as never, {});

    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", productId: "product-1", batchNumber: "FB-2026-0001", deletedAt: null },
      data: { status: "AVAILABLE", updatedById: "user-approver" }
    });
  });
});
