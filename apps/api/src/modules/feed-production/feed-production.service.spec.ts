import { AuthenticatedUser } from "@jokas/shared";
import { FeedProductionService } from "./feed-production.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("FB-2026-0001") }));

const mockTx = {
  feedProductionBatch: { create: jest.fn(), update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { producedQuantityKg: 0 } }) },
  inventoryItem: { updateMany: jest.fn(), upsert: jest.fn(), findFirst: jest.fn() },
  stockBatch: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  feedRawMaterialUsage: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  finishedFeedStock: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  feedExternalSale: { create: jest.fn() },
  feedProductionCost: { create: jest.fn() },
  feedProductionOrder: { update: jest.fn() },
  feedQualityCheck: { update: jest.fn() },
  productionPlanItem: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
  productionPlan: { update: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([])
};

const mockPrisma = {
  feedProductionOrder: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn() },
  feedProductionBatch: { aggregate: jest.fn(), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  feedProductionCost: { findFirst: jest.fn() },
  feedFormula: { findFirst: jest.fn(), create: jest.fn() },
  feedFormulaVersion: { findFirst: jest.fn().mockResolvedValue(null) },
  warehouse: { findFirst: jest.fn() },
  inventoryItem: { findMany: jest.fn() },
  feedQualityCheck: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  branch: { findMany: jest.fn() },
  marketTarget: { findFirst: jest.fn().mockResolvedValue(null) },
  priceList: { findFirst: jest.fn().mockResolvedValue(null) },
  productionSite: { findFirst: jest.fn() },
  systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
const mockLookupCache = { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() };
const mockSales = {
  recordCashSaleForExternalDispatch: jest.fn().mockResolvedValue({ salesOrderId: "so-1", invoiceId: "inv-1", paymentId: "pay-1", revenueId: "rev-1" })
};
// Purpose enforcement defaults off — assert()/filterForOperation() are no-ops.
const mockWarehousePurpose = {
  isEnforced: jest.fn().mockResolvedValue(false),
  assert: jest.fn().mockResolvedValue(undefined),
  filterForOperation: jest.fn().mockImplementation((_c: string, list: unknown[]) => Promise.resolve(list)),
  invalidate: jest.fn()
};

function makeService() {
  return new FeedProductionService(mockPrisma as never, mockAudit as never, mockLookupCache as never, mockWarehousePurpose as never, mockSales as never);
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

describe("FeedProductionService.createFormula — branch auto-default for single-branch companies (readiness review 2026-08-24)", () => {
  beforeEach(() => jest.clearAllMocks());

  const dto = { finishedProductId: "prod-1", code: "FM-1", name: "Formula 1", feedType: "BROILER_STARTER", targetBatchKg: 1000 } as never;

  it("auto-defaults to the company's only branch when the product/user/dto all have none (the reported bug)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", branchId: null });
    mockPrisma.branch.findMany.mockResolvedValue([{ id: "branch-1" }]);
    mockPrisma.feedFormula.findFirst.mockResolvedValue(null);
    mockPrisma.feedFormula.create.mockResolvedValue({ id: "formula-1", code: "FM-1", ingredients: [] });

    const service = makeService();
    // hasGlobalAccess with empty branchIds is the normal shape for an
    // unrestricted admin — the exact account type that hit this bug.
    const result = await service.createFormula(makeUser({ hasGlobalAccess: true, branchIds: [] }), dto, {});

    expect(mockPrisma.feedFormula.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: "branch-1" }) })
    );
    expect(result.data.id).toBe("formula-1");
  });

  it("still rejects with a clearer message when the company has multiple branches and none can be picked automatically", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", branchId: null });
    mockPrisma.branch.findMany.mockResolvedValue([{ id: "branch-1" }, { id: "branch-2" }]);

    const service = makeService();
    await expect(
      service.createFormula(makeUser({ hasGlobalAccess: true, branchIds: [] }), dto, {})
    ).rejects.toThrow(/branch is required/);
    expect(mockPrisma.feedFormula.create).not.toHaveBeenCalled();
  });

  it("skips the branch lookup entirely when the finished product already has a branch assigned", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", branchId: "branch-9" });
    mockPrisma.feedFormula.findFirst.mockResolvedValue(null);
    mockPrisma.feedFormula.create.mockResolvedValue({ id: "formula-1", code: "FM-1", ingredients: [] });

    const service = makeService();
    await service.createFormula(makeUser({ hasGlobalAccess: true, branchIds: [] }), dto, {});

    expect(mockPrisma.branch.findMany).not.toHaveBeenCalled();
  });
});

describe("FeedProductionService — branch/production-site access treats an empty array as unrestricted (readiness review 2026-08-24)", () => {
  beforeEach(() => jest.clearAllMocks());

  const dto = { finishedProductId: "prod-1", code: "FM-1", name: "Formula 1", feedType: "BROILER_STARTER", targetBatchKg: 1000 } as never;

  it("createFormula does not block a non-global user with an empty branchIds array (was wrongly treated as 'access to nothing')", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", branchId: null });
    mockPrisma.branch.findMany.mockResolvedValue([{ id: "branch-1" }]);
    mockPrisma.feedFormula.findFirst.mockResolvedValue(null);
    mockPrisma.feedFormula.create.mockResolvedValue({ id: "formula-1", code: "FM-1", ingredients: [] });

    const service = makeService();
    await expect(
      service.createFormula(makeUser({ hasGlobalAccess: false, branchIds: [] }), dto, {})
    ).resolves.toBeDefined();
  });

  it("still blocks a non-global user whose real branch assignment doesn't match", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", branchId: "branch-OTHER" });

    const service = makeService();
    await expect(
      service.createFormula(makeUser({ hasGlobalAccess: false, branchIds: ["branch-1"] }), dto, {})
    ).rejects.toThrow(/access to this branch/);
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

  it("surfaces a row's salesOrderId untouched, same as marketTargetId — no select strips it", async () => {
    mockPrisma.feedProductionOrder.findMany.mockResolvedValue([{ id: "order-1", orderNumber: "FPO-1", salesOrderId: "so-1", marketTargetId: null }]);

    const service = makeService();
    const result = await service.listOrders(makeUser({ hasGlobalAccess: true }), {} as never);

    expect(result.data[0].salesOrderId).toBe("so-1");
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
    mockPrisma.warehouse.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, type: "GENERAL", name: where.id, code: where.id, branchId: "branch-1" })
    );
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

describe("FeedProductionService.approveOrder — separate-approver toggle", () => {
  beforeEach(() => jest.clearAllMocks());

  // Linked to a sales order — the separate-approver rule applies.
  const order = {
    id: "order-1", orderNumber: "FPO-1", createdById: "user-1", status: "DRAFT",
    branchId: "branch-1", productionSiteId: "site-1", salesOrderId: "so-1"
  };

  it("lets the Feed Mill manager approve their own mill-originated order even with the setting on", async () => {
    const millOrder = { ...order, salesOrderId: null, marketTargetId: null, productionPlanId: null, productionPlanItemId: null };
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(millOrder);
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null); // default ON
    mockPrisma.feedProductionOrder.update.mockResolvedValue({ ...millOrder, status: "APPROVED" });

    const service = makeService();
    const result = await service.approveOrder(makeUser({ id: "user-1" }), "order-1", {});
    expect(result.data.status).toBe("APPROVED");
  });

  it("still blocks self-approval of a market-led order when the setting is on", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({ ...order, salesOrderId: null, marketTargetId: "mt-1" });
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(service.approveOrder(makeUser({ id: "user-1" }), "order-1", {})).rejects.toThrow(/different manager/i);
    expect(mockPrisma.feedProductionOrder.update).not.toHaveBeenCalled();
  });

  it("blocks the creator from approving their own order when the setting is on (default)", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(order);
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null); // no row → default ON

    const service = makeService();
    await expect(
      service.approveOrder(makeUser({ id: "user-1" }), "order-1", {})
    ).rejects.toThrow(/separate production approver|different manager/i);
    expect(mockPrisma.feedProductionOrder.update).not.toHaveBeenCalled();
  });

  it("lets the creator approve their own order when the setting is turned off", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(order);
    mockPrisma.systemSetting.findFirst.mockResolvedValue({ value: { requireSeparateProductionApprover: false } });
    mockPrisma.feedProductionOrder.update.mockResolvedValue({ ...order, status: "APPROVED" });

    const service = makeService();
    const result = await service.approveOrder(makeUser({ id: "user-1" }), "order-1", {});
    expect(result.data.status).toBe("APPROVED");
  });

  it("always lets a different manager approve", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(order);
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null);
    mockPrisma.feedProductionOrder.update.mockResolvedValue({ ...order, status: "APPROVED" });

    const service = makeService();
    const result = await service.approveOrder(makeUser({ id: "user-2" }), "order-1", {});
    expect(result.data.status).toBe("APPROVED");
  });
});

describe("FeedProductionService.createBatch — expected sales value from price list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("derives expectedSalesValue from the finished feed's active price-list entry when the DTO omits it", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 1000, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }] }
    });
    mockPrisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: 0 } });
    mockPrisma.warehouse.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, type: "GENERAL", name: where.id, code: where.id, branchId: "branch-1" })
    );
    mockPrisma.feedFormula.findFirst.mockResolvedValue({
      id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }]
    });
    mockPrisma.inventoryItem.findMany
      .mockResolvedValueOnce([{ productId: "ing-1", quantityOnHand: 500 }])
      .mockResolvedValueOnce([{ id: "inv-1", productId: "ing-1", uomId: "uom-1" }]);
    mockPrisma.priceList.findFirst.mockResolvedValue({ unitPrice: 5 });

    mockTx.feedProductionBatch.create.mockResolvedValue({ id: "batch-1", batchNumber: "FB-TEST-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "finished-inv-1" });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.create.mockResolvedValue({ id: "sb-finished-1" });
    mockTx.finishedFeedStock.create.mockResolvedValue({});
    mockTx.stockMovement.create.mockResolvedValue({});
    mockTx.feedProductionCost.create.mockResolvedValue({});
    mockTx.feedProductionOrder.update.mockResolvedValue({});
    mockTx.feedRawMaterialUsage.create.mockResolvedValue({});

    const service = makeService();
    await service.createBatch(
      makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }),
      { productionOrderId: "order-1", rawMaterialWarehouseId: "wh-raw", finishedWarehouseId: "wh-fin", producedQuantityKg: 100, batchNumber: "FB-TEST-1" } as never,
      {}
    );

    // 100 kg × GHS 5 = GHS 500
    expect(mockTx.feedProductionCost.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expectedSalesValue: 500 }) })
    );
  });
});

describe("FeedProductionService.createBatch — posting against a market-led order updates its production plan item", () => {
  function mockHappyPathWithPlanItem() {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 1000, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      marketTargetId: "mt-1", productionPlanId: "pp-1", productionPlanItemId: "ppi-1",
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }] }
    });
    mockPrisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: 0 } });
    mockPrisma.warehouse.findFirst.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, type: "GENERAL", name: where.id, code: where.id, branchId: "branch-1" }));
    mockPrisma.feedFormula.findFirst.mockResolvedValue({
      id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }]
    });
    mockPrisma.inventoryItem.findMany
      .mockResolvedValueOnce([{ productId: "ing-1", quantityOnHand: 500 }])
      .mockResolvedValueOnce([{ id: "inv-1", productId: "ing-1", uomId: "uom-1" }]);

    mockTx.feedProductionBatch.create.mockResolvedValue({ id: "batch-1", batchNumber: "FB-TEST-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "finished-inv-1" });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.create.mockResolvedValue({ id: "sb-finished-1" });
    mockTx.finishedFeedStock.create.mockResolvedValue({});
    mockTx.stockMovement.create.mockResolvedValue({});
    mockTx.feedProductionCost.create.mockResolvedValue({});
    mockTx.feedProductionOrder.update.mockResolvedValue({});
    mockTx.feedRawMaterialUsage.create.mockResolvedValue({});
  }

  const dto = { productionOrderId: "order-1", rawMaterialWarehouseId: "wh-raw", finishedWarehouseId: "wh-fin", producedQuantityKg: 100, batchNumber: "FB-TEST-1" };

  beforeEach(() => { jest.clearAllMocks(); mockHappyPathWithPlanItem(); });

  it("advances the linked ProductionPlanItem's producedQuantityKg and flips it IN_PROGRESS when partially produced", async () => {
    mockTx.productionPlanItem.findUnique.mockResolvedValue({ id: "ppi-1", productionPlanId: "pp-1", plannedQuantityKg: 1000, producedQuantityKg: 0 });
    mockTx.productionPlanItem.count.mockResolvedValue(1);

    const service = makeService();
    await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {});

    expect(mockTx.productionPlanItem.update).toHaveBeenCalledWith({
      where: { id: "ppi-1" },
      data: { producedQuantityKg: 100, status: "IN_PROGRESS", updatedById: "user-1" }
    });
    expect(mockTx.productionPlan.update).toHaveBeenCalledWith({
      where: { id: "pp-1" },
      data: { status: "IN_PROGRESS", updatedById: "user-1" }
    });
    // The order itself is IN_PROGRESS, not COMPLETED — only 100 of 1000 kg made.
    expect(mockTx.feedProductionOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "IN_PROGRESS", updatedById: "user-1" }
    });
  });

  it("marks the order, plan item and plan COMPLETED once the full planned quantity has been produced", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 100, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      marketTargetId: "mt-1", productionPlanId: "pp-1", productionPlanItemId: "ppi-1",
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }] }
    });
    mockTx.productionPlanItem.findUnique.mockResolvedValue({ id: "ppi-1", productionPlanId: "pp-1", plannedQuantityKg: 100, producedQuantityKg: 0 });
    mockTx.productionPlanItem.count.mockResolvedValue(0);

    const service = makeService();
    await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {});

    expect(mockTx.feedProductionOrder.update).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { status: "COMPLETED", updatedById: "user-1" }
    });
    expect(mockTx.productionPlanItem.update).toHaveBeenCalledWith({
      where: { id: "ppi-1" },
      data: { producedQuantityKg: 100, status: "COMPLETED", updatedById: "user-1" }
    });
    expect(mockTx.productionPlan.update).toHaveBeenCalledWith({
      where: { id: "pp-1" },
      data: { status: "COMPLETED", updatedById: "user-1" }
    });
  });

  it("does not touch production-plan tables for an order with no productionPlanItemId (the ordinary, non-market-led case)", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 1000, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "ing-1", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ-1" } }] }
    });

    const service = makeService();
    await service.createBatch(makeUser({ warehouseIds: ["wh-raw", "wh-fin"] }), dto as never, {});

    expect(mockTx.productionPlanItem.findUnique).not.toHaveBeenCalled();
    expect(mockTx.productionPlanItem.update).not.toHaveBeenCalled();
    expect(mockTx.productionPlan.update).not.toHaveBeenCalled();
  });
});

describe("FeedProductionService.recordExternalSale — books a cash sale in Sales/Finance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("routes an external feed sale through SalesService.recordCashSaleForExternalDispatch and stamps the FeedExternalSale with the generated order/invoice", async () => {
    mockPrisma.feedProductionBatch.findFirst.mockResolvedValue({
      id: "batch-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      finishedProductId: "finished-1", batchNumber: "FB-2026-0001", status: "APPROVED"
    });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "finished-1", name: "Broiler Finisher", branchId: "branch-1" });
    mockTx.finishedFeedStock.findFirst.mockResolvedValue({ id: "ffs-1", quantityKg: 1000, unitCost: 2 });
    mockTx.finishedFeedStock.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-fin-1", uomId: "uom-1", quantityOnHand: 1000 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.feedExternalSale.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "fes-1", ...data }));
    mockTx.stockMovement.create.mockResolvedValue({});

    const service = makeService();
    const result = await service.recordExternalSale(
      makeUser({ warehouseIds: ["wh-fin"] }),
      { productionBatchId: "batch-1", fromWarehouseId: "wh-fin", quantityKg: 500, unitPrice: 6, customerName: "Kojo Farms" } as never,
      {}
    );

    expect(mockSales.recordCashSaleForExternalDispatch).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ productId: "finished-1", quantity: 500, unitPrice: 6, customerName: "Kojo Farms", branchId: "branch-1" })
    );
    expect(mockTx.feedExternalSale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ salesOrderId: "so-1", invoiceId: "inv-1" }) })
    );
    expect((result.data as { salesOrderId?: string }).salesOrderId).toBe("so-1");
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

describe("FeedProductionService — cancelling / deleting approved orders", () => {
  const approved = { id: "order-1", orderNumber: "FPO-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.feedProductionBatch.count.mockResolvedValue(0);
    mockPrisma.feedProductionOrder.update.mockResolvedValue({});
  });

  it("cancels an APPROVED order with no batches", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(approved);
    await makeService().cancelOrder(makeUser(), "order-1", {});
    expect(mockPrisma.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
  });

  it("soft-deletes an APPROVED order with no batches", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(approved);
    (mockPrisma.feedProductionBatch as any).findMany = jest.fn().mockResolvedValue([]);
    (mockTx.feedProductionBatch as any).findMany = jest.fn().mockResolvedValue([]);
    (mockTx.feedProductionOrder as any).findUniqueOrThrow = jest.fn().mockResolvedValue({});
    mockTx.feedProductionOrder.update.mockResolvedValue({});
    await makeService().deleteOrder(makeUser(), "order-1", {});
    expect(mockTx.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
  });

});

describe("FeedProductionService.completeOrder — closing an under-plan order", () => {
  const inProgress = { id: "order-1", orderNumber: "FPO-1", branchId: "branch-1", productionSiteId: "site-1", status: "IN_PROGRESS", plannedQuantityKg: 1000 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.feedProductionOrder.update.mockResolvedValue({});
  });

  it("marks an IN_PROGRESS order COMPLETED at the quantity produced so far", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(inProgress);
    mockPrisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: 950 } });
    await makeService().completeOrder(makeUser(), "order-1", {});
    expect(mockPrisma.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("refuses an order that is not IN_PROGRESS", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue({ ...inProgress, status: "APPROVED" });
    await expect(makeService().completeOrder(makeUser(), "order-1", {})).rejects.toThrow(/in-progress/);
    expect(mockPrisma.feedProductionOrder.update).not.toHaveBeenCalled();
  });

  it("refuses when every batch has been deleted (nothing produced)", async () => {
    mockPrisma.feedProductionOrder.findFirst.mockResolvedValue(inProgress);
    mockPrisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: null } });
    await expect(makeService().completeOrder(makeUser(), "order-1", {})).rejects.toThrow(/at least one batch/);
  });
});

describe("FeedProductionService — deleting a posted batch reverses its stock", () => {
  const batch = { id: "batch-1", batchNumber: "FB-1", productionOrderId: "order-1", branchId: "branch-1", productionSiteId: "site-1", producedQuantityKg: 900 };
  const input = { id: "mv-in", productId: "maize", branchId: "branch-1", fromWarehouseId: "raw-wh", inventoryItemId: "inv-maize", uomId: "kg", quantity: 500, unitCost: 3, movementType: "PRODUCTION_INPUT" };
  const output = { id: "mv-out", productId: "feed", inventoryItemId: "inv-feed", stockBatchId: "lot-feed", quantity: 900, movementType: "PRODUCTION_OUTPUT" };
  const tx = mockTx as any;
  const prisma = mockPrisma as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.feedProductionBatch.findFirst = jest.fn().mockResolvedValue(batch);
    prisma.feedProductionBatch.findMany = jest.fn().mockResolvedValue([{ id: "batch-1", batchNumber: "FB-1" }]);
    prisma.feedInternalTransfer = { count: jest.fn().mockResolvedValue(0) };
    prisma.feedExternalSale = { count: jest.fn().mockResolvedValue(0) };
    prisma.feedProductionOrder.findFirst.mockResolvedValue({ id: "order-1", orderNumber: "FPO-1", branchId: "branch-1", productionSiteId: "site-1", status: "COMPLETED" });
    prisma.feedProductionOrder.update.mockResolvedValue({});
    tx.feedProductionBatch.findFirst = jest.fn().mockResolvedValue(batch);
    tx.feedProductionBatch.findMany = jest.fn().mockResolvedValue([{ id: "batch-1" }]);
    tx.feedProductionOrder.findUniqueOrThrow = jest.fn().mockResolvedValue({});
    tx.feedProductionBatch.aggregate = jest.fn().mockResolvedValue({ _sum: { producedQuantityKg: 0 } });
    tx.stockMovement.findMany = jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.movementType === "PRODUCTION_INPUT" ? [input] : [output]));
    tx.stockMovement.updateMany = jest.fn().mockResolvedValue({ count: 2 });
    // one raw-material lot with 200 kg of room: 200 refilled, 300 becomes a return lot
    tx.stockBatch.findMany = jest.fn().mockResolvedValue([{ id: "lot-maize", quantityReceived: 1000, quantityRemaining: 800 }]);
    tx.stockBatch.update = jest.fn().mockResolvedValue({});
    tx.stockBatch.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    tx.stockBatch.create = jest.fn().mockResolvedValue({});
    tx.inventoryItem.update = jest.fn().mockResolvedValue({});
    tx.inventoryItem.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    for (const model of ["feedRawMaterialUsage", "finishedFeedStock", "feedProductionCost", "feedQualityCheck"]) tx[model].updateMany = jest.fn().mockResolvedValue({ count: 1 });
    tx.feedProductionOrder.findUnique = jest.fn().mockResolvedValue({ productionPlanItemId: null, status: "COMPLETED", plannedQuantityKg: 1000, deletedAt: null });
    tx.feedProductionOrder.update = jest.fn().mockResolvedValue({});
  });

  it("returns raw materials to their store, removes the finished feed and retires the movements", async () => {
    await makeService().deleteBatch(makeUser(), "batch-1", {});
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv-maize" }, data: expect.objectContaining({ quantityOnHand: { increment: 500 } }) }));
    expect(tx.stockBatch.update).toHaveBeenCalledWith({ where: { id: "lot-maize" }, data: { quantityRemaining: { increment: 200 } } });
    expect(tx.stockBatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ warehouseId: "raw-wh", quantityRemaining: 300 }) }));
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv-feed", quantityOnHand: { gte: 900 } } }));
    expect(tx.stockMovement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { deletedAt: expect.any(Date) } }));
    expect(tx.feedProductionBatch.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "batch-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
    // nothing left produced on the order → back to APPROVED so it can be re-run
    expect(tx.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }));
  });

  it("returns raw material to the exact lot it was drawn from when the movement recorded it", async () => {
    tx.stockMovement.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.movementType === "PRODUCTION_INPUT" ? [{ ...input, stockBatchId: "lot-original" }] : [output]));
    tx.stockBatch.findFirst = jest.fn().mockResolvedValue({ id: "lot-original" });
    await makeService().deleteBatch(makeUser(), "batch-1", {});
    expect(tx.stockBatch.update).toHaveBeenCalledWith({ where: { id: "lot-original" }, data: { quantityRemaining: { increment: 500 } } });
    expect(tx.stockBatch.update).toHaveBeenCalledTimes(1);
    expect(tx.stockBatch.create).not.toHaveBeenCalled();
  });

  it("finds the movements of a batch posted from Market Planning (logged against the execution)", async () => {
    tx.feedProductionBatch.findFirst.mockResolvedValue({ ...batch, productionExecutionId: "exec-1" });
    tx.productionExecution = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    await makeService().deleteBatch(makeUser(), "batch-1", {});
    const where = tx.stockMovement.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ referenceType: "FeedProductionBatch", referenceId: "batch-1" }, { referenceType: "ProductionExecution", referenceId: "exec-1" }]);
    expect(tx.productionExecution.updateMany).toHaveBeenCalledWith({ where: { id: "exec-1", deletedAt: null }, data: { deletedAt: expect.any(Date) } });
  });

  it("blocks the delete when the finished feed has already been sold or moved", async () => {
    tx.stockBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(makeService().deleteBatch(makeUser(), "batch-1", {})).rejects.toThrow(/already been sold/);
  });

  it("blocks the delete when the batch was dispatched to a farm or sold externally", async () => {
    prisma.feedInternalTransfer.count.mockResolvedValue(1);
    await expect(makeService().deleteBatch(makeUser(), "batch-1", {})).rejects.toThrow(/already been dispatched/);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("deleting a completed order reverses its batches and soft-deletes the order", async () => {
    await makeService().deleteOrder(makeUser(), "order-1", {});
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv-maize" } }));
    expect(tx.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
  });
});

describe("FeedProductionService.updateFormula — correcting the finished product", () => {
  const tx = mockTx as any;
  const prisma = mockPrisma as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.feedFormula.findFirst.mockResolvedValue({ id: "formula-1", code: "L1C", branchId: "branch-1", finishedProductId: "layer1-mash" });
    prisma.product.findFirst.mockResolvedValue({ id: "layer1-conc", name: "Layer 1 Concentrate" });
    tx.feedFormula = { update: jest.fn().mockResolvedValue({ id: "formula-1", finishedProductId: "layer1-conc" }) };
    tx.feedProductionOrder.updateMany = jest.fn().mockResolvedValue({ count: 2 });
  });

  it("switches the formula and its not-yet-produced orders to the new product", async () => {
    await makeService().updateFormula(makeUser(), "formula-1", { finishedProductId: "layer1-conc" } as never, {});
    expect(tx.feedFormula.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ finishedProductId: "layer1-conc" }) }));
    expect(tx.feedProductionOrder.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", formulaId: "formula-1", deletedAt: null, status: { in: ["DRAFT", "PENDING_STOCK_APPROVAL", "APPROVED"] }, batches: { none: { deletedAt: null } } },
      data: { finishedProductId: "layer1-conc", updatedById: "user-1" }
    });
  });

  it("moves a formula to another branch so it can be ordered at that branch's production site", async () => {
    prisma.branch = { ...(prisma.branch ?? {}), findFirst: jest.fn().mockResolvedValue({ id: "branch-2" }) };
    await makeService().updateFormula(makeUser(), "formula-1", { branchId: "branch-2" } as never, {});
    expect(tx.feedFormula.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branchId: "branch-2" }) }));
  });

  it("leaves orders alone when the product isn't changing", async () => {
    await makeService().updateFormula(makeUser(), "formula-1", { name: "Layer 1 Concentrate" } as never, {});
    expect(tx.feedProductionOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe("FeedProductionService.changeBatchProduct — re-stock a batch credited to the wrong product", () => {
  const tx = mockTx as any;
  const prisma = mockPrisma as any;
  const batch = { id: "batch-1", batchNumber: "FB-9", branchId: "branch-1", productionSiteId: "site-1", productionOrderId: "order-1", finishedProductId: "mash", producedQuantityKg: 500, productionDate: new Date("2026-09-20"), productionExecutionId: null };
  const output = { id: "mv-out", quantity: 500, toWarehouseId: "fg-wh", warehouseId: "fg-wh", inventoryItemId: "inv-mash", stockBatchId: "lot-mash", unitCost: 4 };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.feedProductionBatch.findFirst = jest.fn().mockResolvedValue(batch);
    prisma.product.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.id === "mash" ? { id: "mash", name: "Layer 1 Mash", uomId: "kg" } : { id: "conc", name: "Layer 1 Concentrate", uomId: "kg" }));
    prisma.feedInternalTransfer = { count: jest.fn().mockResolvedValue(0) };
    prisma.feedExternalSale = { count: jest.fn().mockResolvedValue(0) };
    tx.stockMovement.findMany = jest.fn().mockResolvedValue([output]);
    tx.stockMovement.update = jest.fn().mockResolvedValue({});
    tx.stockBatch.findFirst = jest.fn().mockResolvedValue({ id: "lot-mash", batchNumber: "FB-9", status: "AVAILABLE", unitCost: 4, manufactureDate: batch.productionDate });
    tx.stockBatch.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    tx.stockBatch.create = jest.fn().mockResolvedValue({ id: "lot-conc" });
    tx.inventoryItem.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    tx.inventoryItem.upsert = jest.fn().mockResolvedValue({ id: "inv-conc" });
    tx.finishedFeedStock.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    tx.feedProductionBatch.update = jest.fn().mockResolvedValue({});
    tx.feedProductionBatch.count = jest.fn().mockResolvedValue(0);
    tx.feedProductionOrder.update = jest.fn().mockResolvedValue({});
  });

  it("moves the kg from Mash to Concentrate in the same warehouse and relabels the batch, movement and order", async () => {
    await makeService().changeBatchProduct(makeUser(), "batch-1", { finishedProductId: "conc" }, {});
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv-mash", quantityOnHand: { gte: 500 } } }));
    expect(tx.inventoryItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId_warehouseId_productId: { companyId: "company-1", warehouseId: "fg-wh", productId: "conc" } },
      update: expect.objectContaining({ quantityOnHand: { increment: 500 } })
    }));
    expect(tx.stockBatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: "conc", batchNumber: "FB-9", quantityRemaining: 500 }) }));
    expect(tx.stockMovement.update).toHaveBeenCalledWith({ where: { id: "mv-out" }, data: { productId: "conc", inventoryItemId: "inv-conc", stockBatchId: "lot-conc", uomId: "kg" } });
    expect(tx.feedProductionBatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ finishedProductId: "conc" }) }));
    expect(tx.feedProductionOrder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ finishedProductId: "conc" }) }));
  });

  it("refuses when some of the batch's feed has already left the lot", async () => {
    tx.stockBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(makeService().changeBatchProduct(makeUser(), "batch-1", { finishedProductId: "conc" }, {})).rejects.toThrow(/already been sold/);
    expect(tx.inventoryItem.upsert).not.toHaveBeenCalled();
  });

  it("refuses a no-op move to the same product", async () => {
    await expect(makeService().changeBatchProduct(makeUser(), "batch-1", { finishedProductId: "mash" }, {})).rejects.toThrow(/already stocked/);
  });
});

describe("FeedProductionService.createBatch — shortage message names the ingredient and where the stock is", () => {
  it("says what's short in the chosen warehouse and which other warehouse holds it", async () => {
    jest.clearAllMocks();
    const prisma = mockPrisma as any;
    prisma.feedProductionOrder.findFirst.mockResolvedValue({
      id: "order-1", branchId: "branch-1", productionSiteId: "site-1", status: "APPROVED",
      plannedQuantityKg: 1000, finishedProductId: "finished-1", finishedProduct: { id: "finished-1", uomId: "uom-1" },
      formula: { id: "formula-1", targetBatchKg: 100, ingredients: [] }
    });
    prisma.feedProductionBatch.aggregate.mockResolvedValue({ _sum: { producedQuantityKg: 0 } });
    prisma.warehouse.findFirst.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, type: "GENERAL", name: where.id === "raw-wh" ? "Feed Store" : "Finished Store", code: where.id, branchId: "branch-1" }));
    prisma.feedFormula.findFirst.mockResolvedValue({ id: "formula-1", targetBatchKg: 100, ingredients: [{ ingredientId: "maize", quantityKg: 50, unitCost: 2, ingredient: { name: "Maize", sku: "MZ" } }] });
    prisma.inventoryItem.findMany.mockReset();
    prisma.inventoryItem.findMany
      .mockResolvedValueOnce([{ productId: "maize", quantityOnHand: 100 }])
      .mockResolvedValueOnce([{ productId: "maize", quantityOnHand: 800, warehouse: { name: "Main Store" } }]);

    await expect(makeService().createBatch(makeUser(), { productionOrderId: "order-1", rawMaterialWarehouseId: "raw-wh", finishedWarehouseId: "fg-wh", producedQuantityKg: 500 } as never, {}))
      .rejects.toThrow(/Maize: needs 250 kg, Feed Store has 100 kg \(short 150 kg\) — also 800 kg in Main Store/);
  });
});
