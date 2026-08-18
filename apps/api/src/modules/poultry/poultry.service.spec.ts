import { ForbiddenException, Logger } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PoultryService } from "./poultry.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("EGG-2026-0001") }));

const mockTx = {
  feedConsumptionRecord: { create: jest.fn(), update: jest.fn() },
  eggProductionRecord: { create: jest.fn(), update: jest.fn() },
  medicationRecord: { create: jest.fn(), update: jest.fn() },
  vaccinationRecord: { create: jest.fn(), update: jest.fn() },
  dailyPoultryRecord: { create: jest.fn(), update: jest.fn() },
  inventoryItem: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  product: { findFirst: jest.fn().mockResolvedValue({ id: "prod-feed", uomId: "uom-1" }) },
  warehouse: { findFirst: jest.fn() },
  stockBatch: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  stockMovement: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
  mortalityRecord: { aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
  // Defaults to "no outgoing transfers" so tests that don't care about
  // transfers (the vast majority) don't need to mock this explicitly —
  // tests that DO care override with mockResolvedValueOnce.
  poultryTransferRecord: { aggregate: jest.fn().mockResolvedValue({ _sum: { birdCount: 0 } }), create: jest.fn() },
  batchPenAllocation: { findFirst: jest.fn(), upsert: jest.fn() },
  pen: { update: jest.fn(), findFirst: jest.fn() },
  flockBatch: { findFirstOrThrow: jest.fn(), update: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([])
};

const mockPrisma = {
  poultryHouse: { findFirst: jest.fn() },
  pen: { findFirst: jest.fn(), findMany: jest.fn() },
  flockBatch: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
  batchPenAllocation: { findFirst: jest.fn() },
  poultryTransferRecord: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { birdCount: 0 } }) },
  feedConsumptionRecord: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  eggProductionRecord: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  medicationRecord: { findFirst: jest.fn() },
  vaccinationRecord: { findFirst: jest.fn() },
  dailyPoultryRecord: { findFirst: jest.fn() },
  mortalityRecord: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { birdCount: 0 } }) },
  birdWeightRecord: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  poultryHealthObservation: { findFirst: jest.fn(), create: jest.fn() },
  poultryCostRecord: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new PoultryService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: ["farm-1"], warehouseIds: ["wh-1"], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("PoultryService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("PoultryService — farm/warehouse access checks (H7)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("listPens", () => {
    it("blocks listing pens for a house in a farm the actor doesn't have access to", async () => {
      mockPrisma.poultryHouse.findFirst.mockResolvedValue({ id: "house-1", companyId: "company-1", farmId: "farm-OTHER" });
      const service = makeService();
      await expect(service.listPens(makeUser({ farmIds: ["farm-1"] }), "house-1")).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.pen.findMany).not.toHaveBeenCalled();
    });

    it("allows listing pens for a house in the actor's own farm", async () => {
      mockPrisma.poultryHouse.findFirst.mockResolvedValue({ id: "house-1", companyId: "company-1", farmId: "farm-1" });
      mockPrisma.pen.findMany.mockResolvedValue([]);
      const service = makeService();
      await expect(service.listPens(makeUser({ farmIds: ["farm-1"] }), "house-1")).resolves.toBeDefined();
    });
  });

  describe("allocateTransferPen", () => {
    it("blocks allocating a pen when the transfer's destination farm is outside the actor's scope", async () => {
      mockPrisma.poultryTransferRecord.findFirst.mockResolvedValue({
        id: "trf-1", companyId: "company-1", toPenId: null, toPoultryHouseId: "house-1", flockBatchId: "batch-1", birdCount: 10, branchId: "branch-1"
      });
      mockPrisma.pen.findFirst.mockResolvedValue({ id: "pen-1", companyId: "company-1", poultryHouseId: "house-1" });
      mockPrisma.poultryHouse.findFirst.mockResolvedValue({ id: "house-1", farmId: "farm-OTHER", branchId: "branch-1" });

      const service = makeService();
      await expect(
        service.allocateTransferPen(makeUser({ farmIds: ["farm-1"] }), "trf-1", { penId: "pen-1" } as never, {})
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("createEggs", () => {
    it("blocks crediting egg output to a warehouse outside the actor's scope", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", birdType: "LAYERS", status: "ACTIVE" });

      const service = makeService();
      await expect(
        service.createEggs(
          makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
          { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0, warehouseId: "wh-OTHER", eggProductId: "prod-1" } as never,
          {}
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it("H-BUG-2: crediting egg output creates a real, sellable StockBatch — not just a quantityOnHand bump", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1" });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });
      mockTx.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1", branchId: "branch-1" });
      mockTx.product.findFirst.mockResolvedValue({ id: "prod-1", companyId: "company-1", uomId: "uom-1" });
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-1" });

      const service = makeService();
      await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0, warehouseId: "wh-1", eggProductId: "prod-1" } as never,
        {}
      );

      // Sales' consumeFifoTx (and every other FIFO consumer) checks
      // StockBatch.quantityRemaining to decide what's actually sellable —
      // an inventoryItem bump alone left eggs permanently unreleasable.
      expect(mockTx.stockBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: "company-1",
          warehouseId: "wh-1",
          productId: "prod-1",
          inventoryItemId: "inv-1",
          batchNumber: "EGG-2026-0001",
          quantityReceived: 10,
          quantityRemaining: 10
        })
      });
    });

    it("H-BUG-2: blocks crediting eggs to sellable stock while the batch is inside an active medication withdrawal window", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1" });
      mockPrisma.medicationRecord.findFirst.mockResolvedValue({ medicationName: "Amoxicillin", withdrawalUntil: new Date("2099-01-01") });

      const service = makeService();
      await expect(
        service.createEggs(
          makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
          { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0, warehouseId: "wh-1", eggProductId: "prod-1" } as never,
          {}
        )
      ).rejects.toThrow(/active withdrawal period/);
      expect(mockTx.eggProductionRecord.create).not.toHaveBeenCalled();
    });

    it("still allows logging the raw egg count during an active withdrawal window when no product/warehouse is given (no stock effect)", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1" });
      mockPrisma.medicationRecord.findFirst.mockResolvedValue({ medicationName: "Amoxicillin", withdrawalUntil: new Date("2099-01-01") });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });

      const service = makeService();
      await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0 } as never,
        {}
      );

      expect(mockTx.eggProductionRecord.create).toHaveBeenCalled();
      expect(mockTx.stockBatch.create).not.toHaveBeenCalled();
    });

    it("M-BUG: credits cracked/dirty eggs to a 'seconds' product when one is given", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1", startDate: new Date("2020-01-01") });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });
      mockTx.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1", branchId: "branch-1" });
      mockTx.product.findFirst.mockResolvedValue({ id: "prod-seconds", companyId: "company-1", uomId: "uom-1" });
      mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-seconds" });

      const service = makeService();
      const result = await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 0, crackedEggs: 3, dirtyEggs: 2, brokenEggs: 0, rejectedEggs: 0, warehouseId: "wh-1", secondsProductId: "prod-seconds" } as never,
        {}
      );

      expect(mockTx.stockBatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: "prod-seconds", quantityReceived: 5, quantityRemaining: 5 })
      });
      expect(result.warning).toBeUndefined();
    });

    it("M-BUG: warns instead of silently discarding cracked/dirty eggs when no 'seconds' product is set", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1", startDate: new Date("2020-01-01") });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });

      const service = makeService();
      const result = await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 0, crackedEggs: 3, dirtyEggs: 2, brokenEggs: 0, rejectedEggs: 0 } as never,
        {}
      );

      expect(mockTx.stockBatch.create).not.toHaveBeenCalled();
      expect(result.warning).toMatch(/not credited to sellable stock/);
    });

    it("M-BUG: warns when eggs are logged for a LAYERS flock that's too young to plausibly be laying", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1", startDate: new Date("2026-01-01") });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });

      const service = makeService();
      const result = await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-15", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0 } as never,
        {}
      );

      expect(result.warning).toMatch(/don't typically begin laying/);
    });

    it("M-BUG: no age warning once the flock is well past typical lay age", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1", startDate: new Date("2025-01-01") });
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-rec-1" });

      const service = makeService();
      const result = await service.createEggs(
        makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-15", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0 } as never,
        {}
      );

      expect(result.warning).toBeUndefined();
    });
  });
});

describe("PoultryService.updateBatchStatus — cannot mark SOLD during an active medication withdrawal window (H-BUG-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("blocks the ACTIVE→SOLD transition while a withdrawal period is still in effect", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", status: "ACTIVE" });
    mockPrisma.medicationRecord.findFirst.mockResolvedValue({ medicationName: "Amoxicillin", withdrawalUntil: new Date("2099-01-01") });

    const service = makeService();
    await expect(
      service.updateBatchStatus(makeUser({ farmIds: ["farm-1"] }), "batch-1", { status: "SOLD" } as never, {})
    ).rejects.toThrow(/active withdrawal period/);
  });

  it("allows the ACTIVE→SOLD transition once the withdrawal period has passed", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", status: "ACTIVE" });
    mockPrisma.medicationRecord.findFirst.mockResolvedValue(null);
    mockPrisma.flockBatch.update.mockResolvedValue({ id: "batch-1", status: "SOLD" });

    const service = makeService();
    await expect(
      service.updateBatchStatus(makeUser({ farmIds: ["farm-1"] }), "batch-1", { status: "SOLD" } as never, {})
    ).resolves.toBeDefined();
  });

  it("does not check withdrawal at all for transitions other than SOLD", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", status: "ACTIVE" });
    mockPrisma.flockBatch.update.mockResolvedValue({ id: "batch-1", status: "CLOSED" });

    const service = makeService();
    await service.updateBatchStatus(makeUser({ farmIds: ["farm-1"] }), "batch-1", { status: "CLOSED" } as never, {});

    expect(mockPrisma.medicationRecord.findFirst).not.toHaveBeenCalled();
  });
});

describe("PoultryService.createDailyRecord — mortality/culled/feed/egg deltas actually move real records (H-BUG-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeBatch(overrides: Record<string, unknown> = {}) {
    return { id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", birdType: "LAYERS", status: "ACTIVE", code: "FLK-1", openingBirdCount: 1000, ...overrides };
  }

  it("first-time submission applies the full mortalityCount as a real MortalityRecord", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch());
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue(null); // no existing row for this batch+pen+date
    mockTx.dailyPoultryRecord.create.mockResolvedValue({ id: "daily-1" });
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });

    const service = makeService();
    await service.createDailyRecord(
      makeUser({ farmIds: ["farm-1"] }),
      { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 5, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 } as never,
      {}
    );

    expect(mockTx.mortalityRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ birdCount: 5, isCulling: false }) })
    );
  });

  it("a later submission for the same day only applies the DELTA, not the full new number again", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch());
    // Already recorded 3 dead this morning — resubmitting with 5 should only add 2 more, not 5.
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue({ id: "daily-1", mortalityCount: 3, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 });
    mockTx.dailyPoultryRecord.update.mockResolvedValue({ id: "daily-1" });
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 3 } });

    const service = makeService();
    await service.createDailyRecord(
      makeUser({ farmIds: ["farm-1"] }),
      { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 5, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 } as never,
      {}
    );

    expect(mockTx.mortalityRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ birdCount: 2, isCulling: false }) })
    );
  });

  it("rejects reducing a previously-recorded number instead of silently 'un-recording' it", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch());
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue({ id: "daily-1", mortalityCount: 5, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 });

    const service = makeService();
    await expect(
      service.createDailyRecord(
        makeUser({ farmIds: ["farm-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 3, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 } as never,
        {}
      )
    ).rejects.toThrow(/can't be reduced/);

    expect(mockTx.mortalityRecord.create).not.toHaveBeenCalled();
  });

  it("blocks a mortality delta that would exceed the batch's live-bird count", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch({ openingBirdCount: 10 }));
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue(null);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 8 } }); // only 2 live birds left

    const service = makeService();
    await expect(
      service.createDailyRecord(
        makeUser({ farmIds: ["farm-1"] }),
        { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 5, culledCount: 0, feedConsumedKg: 0, totalEggs: 0 } as never,
        {}
      )
    ).rejects.toThrow(/live bird/);
  });

  it("records a feed quantity with no stock effect when no product/warehouse is given (optional, matches createFeed's own convention)", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch());
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue(null);
    mockTx.dailyPoultryRecord.create.mockResolvedValue({ id: "daily-1" });

    const service = makeService();
    await service.createDailyRecord(
      makeUser({ farmIds: ["farm-1"] }),
      { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 0, culledCount: 0, feedConsumedKg: 250, totalEggs: 0 } as never,
      {}
    );

    expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("deducts real feed stock when a product/warehouse IS given", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(makeBatch());
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue(null);
    mockTx.dailyPoultryRecord.create.mockResolvedValue({ id: "daily-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 250 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createDailyRecord(
      makeUser({ farmIds: ["farm-1"], warehouseIds: ["wh-1"] }),
      { flockBatchId: "batch-1", recordDate: "2026-01-01", mortalityCount: 0, culledCount: 0, feedConsumedKg: 250, totalEggs: 0, feedProductId: "feed-1", feedWarehouseId: "wh-1" } as never,
      {}
    );

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 250 } },
      data: { quantityOnHand: { decrement: 250 }, updatedById: "user-1" }
    });
  });
});

describe("PoultryService — a zero-farm user sees nothing by default, not every farm (L7, reversed per product decision)", () => {
  type WhereHelper = (user: AuthenticatedUser, ...rest: unknown[]) => Record<string, unknown>;

  function helper(service: PoultryService, name: "farmWhere" | "houseWhere" | "batchWhere"): WhereHelper {
    return (service as unknown as Record<string, WhereHelper>)[name].bind(service);
  }

  it("farmWhere restricts a zero-farm, non-global user to an empty IN() — matches nothing", () => {
    const service = makeService();
    const where = helper(service, "farmWhere")(makeUser({ farmIds: [] }));
    expect(where.id).toEqual({ in: [] });
  });

  it("houseWhere and batchWhere restrict a zero-farm, non-global user to an empty IN() too", () => {
    const service = makeService();
    expect(helper(service, "houseWhere")(makeUser({ farmIds: [] })).farmId).toEqual({ in: [] });
    expect(helper(service, "batchWhere")(makeUser({ farmIds: [] })).farmId).toEqual({ in: [] });
  });

  it("still scopes to the actor's own farms when they do have assignments", () => {
    const service = makeService();
    const where = helper(service, "farmWhere")(makeUser({ farmIds: ["farm-1", "farm-2"] }));
    expect(where.id).toEqual({ in: ["farm-1", "farm-2"] });
  });

  it("applies no restriction at all for a genuinely global-access user (Super Admin), even with zero farms assigned", () => {
    const service = makeService();
    const where = helper(service, "farmWhere")(makeUser({ farmIds: [], hasGlobalAccess: true }));
    expect(where.id).toBeUndefined();
  });

  it("recordWhere restricts a zero-farm user to an empty IN() for daily/mortality/egg/etc. records", () => {
    const service = makeService();
    const recordWhere = (service as unknown as { recordWhere: (u: AuthenticatedUser, q: Record<string, unknown>, t?: string) => Record<string, unknown> }).recordWhere.bind(service);
    const where = recordWhere(makeUser({ farmIds: [] }), {}, "daily");
    expect(where.farmId).toEqual({ in: [] });
  });
});

describe("PoultryService.createFeed / consumeInventoryTx — floor-guarded decrement, visible skip (H4)", () => {
  beforeEach(() => jest.clearAllMocks());

  const flockBatch = { id: "batch-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", birdType: "BROILERS" };
  const dto = { flockBatchId: "batch-1", recordDate: "2026-08-09", feedProductId: "prod-feed", warehouseId: "wh-1", quantityKg: 50 };

  it("issues the decrement as a floor-guarded updateMany, not a plain unguarded update", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createFeed(makeUser(), dto as never, {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 50 } },
      data: { quantityOnHand: { decrement: 50 }, updatedById: "user-1" }
    });
  });

  it("rejects when the floor-guarded decrement loses a concurrent race, instead of overdrawing stock", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.createFeed(makeUser(), dto as never, {})).rejects.toThrow();
  });

  it("logs a warning instead of silently no-op'ing when no inventory item is configured for the product/warehouse", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue(null);
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined as never);

    const service = makeService();
    const result = await service.createFeed(makeUser(), dto as never, {});

    expect(result.data.id).toBe("fc-1"); // the record still saves
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no InventoryItem"));
    // M-BUG: previously visible server-side only — the caller (and
    // therefore the UI) had no way to know stock wasn't actually deducted.
    expect(result.warning).toMatch(/no stock was deducted/);
    warnSpy.mockRestore();
  });

  it("M-BUG: does not set a warning when stock is actually deducted", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    const result = await service.createFeed(makeUser(), dto as never, {});

    expect(result.warning).toBeUndefined();
  });

  it("H-BUG-2: also consumes matching StockBatch lots FIFO, not just the aggregate quantityOnHand", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([
      { id: "sb-old", quantityRemaining: 30 },
      { id: "sb-new", quantityRemaining: 40 }
    ]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createFeed(makeUser(), dto as never, {});

    expect(mockTx.stockBatch.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "sb-old", quantityRemaining: { gte: 30 } },
      data: { quantityRemaining: { decrement: 30 } }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "sb-new", quantityRemaining: { gte: 20 } },
      data: { quantityRemaining: { decrement: 20 } }
    });
  });

  it("H-BUG-2: rejects when the aggregate is sufficient but a quarantined/short lot makes lots on hand fall short", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 10 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await expect(service.createFeed(makeUser(), dto as never, {})).rejects.toThrow(/out of sync/);
  });

  it("H-BUG-2: rejects when a lot was consumed concurrently by another request", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "fc-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 50 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.createFeed(makeUser(), dto as never, {})).rejects.toThrow(/concurrently/);
  });
});

describe("PoultryService.createMortality / createTransfer — lock the batch row so concurrent bird-count checks can't both pass (H5)", () => {
  beforeEach(() => jest.clearAllMocks());

  const flockBatch = { id: "batch-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", openingBirdCount: 1000 };

  describe("createMortality", () => {
    it("locks the FlockBatch row inside the transaction before checking live-bird count", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.mortalityRecord.create.mockResolvedValue({ id: "mort-1" });

      const service = makeService();
      await service.createMortality(makeUser(), { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 700 } as never, {});

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.mortalityRecord.create).toHaveBeenCalled();
    });

    it("rejects two concurrent mortality entries that would jointly exceed the batch's live-bird count", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      // Inside the (now locked) transaction, 700 birds are already recorded dead —
      // a second concurrent request for 400 more must see this, not the stale 0.
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 700 } });

      const service = makeService();
      await expect(
        service.createMortality(makeUser(), { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 400 } as never, {})
      ).rejects.toThrow(/Only 300 live bird/);
      expect(mockTx.mortalityRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("createTransfer", () => {
    const toHouse = { id: "house-2", farmId: "farm-2", branchId: "branch-2" };

    it("locks the FlockBatch row before checking available birds for a batch-level transfer", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-1" });

      const service = makeService();
      await service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 500, transferDate: "2026-08-09" } as never,
        {}
      );

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.poultryTransferRecord.create).toHaveBeenCalled();
    });

    it("rejects a transfer that would jointly exceed live birds alongside a concurrent mortality entry", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      // A concurrent mortality entry already committed 800 deaths inside the
      // same locked window — only 200 birds are actually left to transfer.
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 800 } });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });

      const service = makeService();
      await expect(
        service.createTransfer(
          makeUser({ hasGlobalAccess: true }),
          { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 500, transferDate: "2026-08-09" } as never,
          {}
        )
      ).rejects.toThrow(/Only 200 live birds/);
      expect(mockTx.poultryTransferRecord.create).not.toHaveBeenCalled();
    });

    it("checks pen-scoped availability (allocation minus outgoing minus pen mortality) atomically when fromPenId is given", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      mockPrisma.pen.findFirst.mockResolvedValue({ id: "pen-1", poultryHouseId: "house-1" });
      mockTx.batchPenAllocation.findFirst.mockResolvedValue({ birdCount: 100 });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 20 } });
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 10 } });

      const service = makeService();
      // Available = 100 - 20 - 10 = 70; requesting 80 must be rejected.
      await expect(
        service.createTransfer(
          makeUser({ hasGlobalAccess: true }),
          { flockBatchId: "batch-1", fromPenId: "pen-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 80, transferDate: "2026-08-09" } as never,
          {}
        )
      ).rejects.toThrow(/only has 70 birds available/);
      expect(mockTx.poultryTransferRecord.create).not.toHaveBeenCalled();
    });

    it("M-BUG: reassigns the batch's own farm/house when a whole-flock, batch-level transfer moves every remaining bird", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-1" });

      const service = makeService();
      // openingBirdCount is 1000 with zero mortality/prior transfers — moving all 1000 is a full-flock transfer.
      await service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 1000, transferDate: "2026-08-09" } as never,
        {}
      );

      expect(mockTx.flockBatch.update).toHaveBeenCalledWith({
        where: { id: "batch-1" },
        data: { farmId: "farm-2", poultryHouseId: "house-2", updatedById: "user-1" }
      });
    });

    it("does not reassign the batch's farm/house for a partial batch-level transfer", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-1" });

      const service = makeService();
      await service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 500, transferDate: "2026-08-09" } as never,
        {}
      );

      expect(mockTx.flockBatch.update).not.toHaveBeenCalled();
    });
  });
});

describe("PoultryService — pen physical capacity is enforced, not bypassable (M18)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("createBatch", () => {
    const dto = {
      code: "FB-1", name: "Batch 1", birdType: "BROILER", startDate: "2026-08-09",
      openingBirdCount: 800,
      penAllocations: [{ penId: "pen-1", birdCount: 800 }]
    } as never;

    it("rejects an allocation that exceeds the pen's recorded capacity", async () => {
      mockPrisma.pen.findMany.mockResolvedValue([{ id: "pen-1", branchId: "branch-1", farmId: "farm-1", poultryHouseId: "house-1", code: "P1", capacity: 500 }]);
      mockPrisma.flockBatch.findFirst.mockResolvedValue(null);
      mockPrisma.batchPenAllocation.findFirst.mockResolvedValue(null);
      const service = makeService();

      await expect(service.createBatch(makeUser({ farmIds: ["farm-1"] }), dto, {})).rejects.toThrow(/exceeds pen capacity/);
      expect(mockPrisma.flockBatch.create).not.toHaveBeenCalled();
    });

    it("allows an allocation within the pen's capacity", async () => {
      mockPrisma.pen.findMany.mockResolvedValue([{ id: "pen-1", branchId: "branch-1", farmId: "farm-1", poultryHouseId: "house-1", code: "P1", capacity: 1000 }]);
      mockPrisma.flockBatch.findFirst.mockResolvedValue(null);
      mockPrisma.batchPenAllocation.findFirst.mockResolvedValue(null);
      mockPrisma.flockBatch.create.mockResolvedValue({ id: "batch-1", code: "FB-1", farmId: "farm-1" });
      const service = makeService();

      await expect(service.createBatch(makeUser({ farmIds: ["farm-1"] }), dto, {})).resolves.toBeDefined();
      expect(mockPrisma.flockBatch.create).toHaveBeenCalled();
    });

    it("does not enforce a cap when the pen has no capacity recorded (null)", async () => {
      mockPrisma.pen.findMany.mockResolvedValue([{ id: "pen-1", branchId: "branch-1", farmId: "farm-1", poultryHouseId: "house-1", code: "P1", capacity: null }]);
      mockPrisma.flockBatch.findFirst.mockResolvedValue(null);
      mockPrisma.batchPenAllocation.findFirst.mockResolvedValue(null);
      mockPrisma.flockBatch.create.mockResolvedValue({ id: "batch-1", code: "FB-1", farmId: "farm-1" });
      const service = makeService();

      await expect(service.createBatch(makeUser({ farmIds: ["farm-1"] }), dto, {})).resolves.toBeDefined();
    });
  });

  describe("createTransfer — destination pen capacity", () => {
    const flockBatch = { id: "batch-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", openingBirdCount: 1000 };
    const toHouse = { id: "house-2", farmId: "farm-2", branchId: "branch-2" };

    beforeEach(() => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
      mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-1" });
    });

    it("rejects a transfer that would push the destination pen over its recorded capacity", async () => {
      mockTx.pen.findFirst.mockResolvedValue({ id: "pen-2", code: "P2", capacity: 100 });
      mockTx.batchPenAllocation.findFirst.mockResolvedValue({ birdCount: 60 }); // already 60 in destination pen

      const service = makeService();
      await expect(
        service.createTransfer(
          makeUser({ hasGlobalAccess: true }),
          { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", toPenId: "pen-2", birdCount: 50, transferDate: "2026-08-09" } as never,
          {}
        )
      ).rejects.toThrow(/capacity is 100.*bring it to 110/);
      expect(mockTx.batchPenAllocation.upsert).not.toHaveBeenCalled();
    });

    it("allows a transfer that stays within the destination pen's capacity", async () => {
      mockTx.pen.findFirst.mockResolvedValue({ id: "pen-2", code: "P2", capacity: 100 });
      mockTx.batchPenAllocation.findFirst.mockResolvedValue({ birdCount: 60 });
      mockTx.batchPenAllocation.upsert.mockResolvedValue({});

      const service = makeService();
      await service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", toPenId: "pen-2", birdCount: 30, transferDate: "2026-08-09" } as never,
        {}
      );

      expect(mockTx.batchPenAllocation.upsert).toHaveBeenCalled();
    });

    it("does not enforce a cap when the destination pen has no capacity recorded (null)", async () => {
      mockTx.pen.findFirst.mockResolvedValue({ id: "pen-2", code: "P2", capacity: null });
      mockTx.batchPenAllocation.findFirst.mockResolvedValue({ birdCount: 10000 });
      mockTx.batchPenAllocation.upsert.mockResolvedValue({});

      const service = makeService();
      await service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", toPenId: "pen-2", birdCount: 500, transferDate: "2026-08-09" } as never,
        {}
      );

      expect(mockTx.batchPenAllocation.upsert).toHaveBeenCalled();
    });
  });
});

describe("PoultryService.updateRecord — feed correction is transactional and floor-guarded (H-BUG-3)", () => {
  beforeEach(() => jest.clearAllMocks());

  const existingFeedRecord = { id: "fc-1", companyId: "company-1", farmId: "farm-1", feedProductId: "prod-feed", warehouseId: "wh-1", quantityKg: 100 };

  it("floor-guards the inventory decrement when a correction increases the recorded quantity", async () => {
    // delta = 150 - 100 = +50 → more was actually consumed than first
    // logged, so inventory needs to be decremented further.
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", quantityKg: 150 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", branchId: "branch-1", uomId: "uom-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 50, createdAt: new Date() }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { quantityKg: 150 }, {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 50 } },
      data: { quantityOnHand: { decrement: 50 }, updatedById: "user-1" }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "sb-1", quantityRemaining: { gte: 50 } },
      data: { quantityRemaining: { decrement: 50 } }
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalled();
  });

  it("H-BUG-2: rejects the correction when the aggregate has room but StockBatch lots are quarantined/short", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", quantityKg: 150 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", branchId: "branch-1", uomId: "uom-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([]);

    const service = makeService();
    await expect(
      service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { quantityKg: 150 }, {})
    ).rejects.toThrow(/out of sync/);
  });

  it("rejects the whole correction when there isn't enough stock left to cover the increase", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", quantityKg: 150 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", branchId: "branch-1", uomId: "uom-1" });
    // StockBatch lots are locked first (2026-08-16 lock-order reconciliation) —
    // give them enough so this test exercises the InventoryItem-level race instead.
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 50 }]);
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { quantityKg: 150 }, {})
    ).rejects.toThrow(/insufficient stock/i);
    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("gives stock back (no floor guard needed) when a correction decreases the recorded quantity", async () => {
    // delta = 60 - 100 = -40 → less was actually consumed than first
    // logged, so the over-decremented amount is returned to inventory.
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", quantityKg: 60 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", branchId: "branch-1", uomId: "uom-1" });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { quantityKg: 60 }, {});

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantityOnHand: { increment: 40 }, updatedById: "user-1" }
    });
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
    expect(mockTx.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchNumber: "ADJ-FC-1",
        quantityReceived: 40,
        quantityRemaining: 40,
        productId: "prod-feed",
        warehouseId: "wh-1",
        inventoryItemId: "inv-1"
      })
    });
  });

  it("does not touch inventory at all when quantityKg isn't part of the correction", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", notes: "corrected note" });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { notes: "corrected note" }, {});

    expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
  });
});

describe("PoultryService.updateRecord — mortality correction uses the same lock-and-floor-guard as recording it fresh (M-BUG)", () => {
  beforeEach(() => jest.clearAllMocks());

  const existingMortalityRecord = { id: "mort-1", companyId: "company-1", farmId: "farm-1", flockBatchId: "batch-1", birdCount: 20 };

  it("locks the batch row and floor-guards an increase, matching createMortality's own safety check", async () => {
    mockPrisma.mortalityRecord.findFirst.mockResolvedValue(existingMortalityRecord);
    mockTx.flockBatch.findFirstOrThrow.mockResolvedValue({ openingBirdCount: 1000 });
    // 700 total dead recorded across the batch, of which 20 is THIS record (already counted) —
    // excluding it: 680 dead elsewhere, so 320 live birds are available for this correction.
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 680 } });
    mockTx.mortalityRecord.update.mockResolvedValue({ id: "mort-1", birdCount: 300 });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "mortality", "mort-1", { birdCount: 300 }, {});

    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.mortalityRecord.aggregate).toHaveBeenCalledWith({
      where: { flockBatchId: "batch-1", deletedAt: null, id: { not: "mort-1" } },
      _sum: { birdCount: true }
    });
    expect(mockTx.mortalityRecord.update).toHaveBeenCalledWith({ where: { id: "mort-1" }, data: { birdCount: 300, updatedById: "user-1" } });
  });

  it("rejects a correction that would exceed the batch's actual live-bird count instead of silently flooring to zero", async () => {
    mockPrisma.mortalityRecord.findFirst.mockResolvedValue(existingMortalityRecord);
    mockTx.flockBatch.findFirstOrThrow.mockResolvedValue({ openingBirdCount: 1000 });
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 680 } });

    const service = makeService();
    await expect(
      service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "mortality", "mort-1", { birdCount: 500 }, {})
    ).rejects.toThrow(/Only 320 live bird/);
    expect(mockTx.mortalityRecord.update).not.toHaveBeenCalled();
  });

  it("skips the lock/floor-guard entirely when the correction doesn't actually change birdCount", async () => {
    mockPrisma.mortalityRecord.findFirst.mockResolvedValue(existingMortalityRecord);
    mockTx.mortalityRecord.update.mockResolvedValue({ id: "mort-1", birdCount: 20, reason: "Updated note" });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "mortality", "mort-1", { birdCount: 20, reason: "Updated note" }, {});

    expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    expect(mockTx.flockBatch.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("gives birds back without needing a floor guard when the correction decreases birdCount", async () => {
    mockPrisma.mortalityRecord.findFirst.mockResolvedValue(existingMortalityRecord);
    mockTx.flockBatch.findFirstOrThrow.mockResolvedValue({ openingBirdCount: 1000 });
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 680 } });
    mockTx.mortalityRecord.update.mockResolvedValue({ id: "mort-1", birdCount: 5 });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "mortality", "mort-1", { birdCount: 5 }, {});

    expect(mockTx.mortalityRecord.update).toHaveBeenCalledWith({ where: { id: "mort-1" }, data: { birdCount: 5, updatedById: "user-1" } });
  });
});

describe("PoultryService.updateRecord — eggs correction adjusts the inventory it originally credited (H-BUG-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  const existingEggRecord = { id: "egg-1", companyId: "company-1", farmId: "farm-1", goodEggs: 100 };
  const originalMovement = { warehouseId: "wh-1", productId: "prod-egg" };

  it("credits a new adjustment lot when the correction raises goodEggs", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue(existingEggRecord);
    mockTx.eggProductionRecord.update.mockResolvedValue({ id: "egg-1", goodEggs: 150 });
    mockTx.stockMovement.findFirst.mockResolvedValue(originalMovement);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-egg", branchId: "branch-1", farmId: "farm-1", uomId: "uom-1" });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", { goodEggs: 150 }, {});

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-egg" },
      data: { quantityOnHand: { increment: 50 }, updatedById: "user-1" }
    });
    expect(mockTx.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchNumber: "ADJ-EGG-1", quantityReceived: 50, quantityRemaining: 50 })
    });
  });

  it("pulls stock back out, floor-guarded, when the correction lowers goodEggs", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue(existingEggRecord);
    mockTx.eggProductionRecord.update.mockResolvedValue({ id: "egg-1", goodEggs: 60 });
    mockTx.stockMovement.findFirst.mockResolvedValue(originalMovement);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-egg", branchId: "branch-1", farmId: "farm-1", uomId: "uom-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 40 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", { goodEggs: 60 }, {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-egg", quantityOnHand: { gte: 40 } },
      data: { quantityOnHand: { decrement: 40 }, updatedById: "user-1" }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "sb-1", quantityRemaining: { gte: 40 } },
      data: { quantityRemaining: { decrement: 40 } }
    });
  });

  it("blocks lowering goodEggs when the previously credited stock was already consumed elsewhere", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue(existingEggRecord);
    mockTx.eggProductionRecord.update.mockResolvedValue({ id: "egg-1", goodEggs: 60 });
    mockTx.stockMovement.findFirst.mockResolvedValue(originalMovement);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-egg", branchId: "branch-1", farmId: "farm-1", uomId: "uom-1" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", { goodEggs: 60 }, {})
    ).rejects.toThrow(/already been consumed elsewhere/);
  });

  it("skips inventory adjustment entirely when the original record never had a stock movement (no product/warehouse given at creation)", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue(existingEggRecord);
    mockTx.eggProductionRecord.update.mockResolvedValue({ id: "egg-1", goodEggs: 150 });
    mockTx.stockMovement.findFirst.mockResolvedValue(null);

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", { goodEggs: 150 }, {});

    expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
  });
});

describe("PoultryService.softDelete — feed/medication/vaccination/egg deletes reverse their inventory effect (H-BUG-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gives feed stock back when a feed-consumption record with a stock movement is deleted", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue({ id: "fc-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1" });
    mockTx.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "wh-1", quantity: 50, productId: "prod-feed", uomId: "uom-1", movementType: "PRODUCTION_INPUT" }
    ]);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1" });
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", deletedAt: new Date() });

    const service = makeService();
    await service.softDelete(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", {});

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantityOnHand: { increment: 50 }, updatedById: "user-1" }
    });
    expect(mockTx.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ batchNumber: "ADJ-FC-1", quantityReceived: 50, quantityRemaining: 50 })
    });
    expect(mockTx.feedConsumptionRecord.update).toHaveBeenCalledWith({
      where: { id: "fc-1" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1" }
    });
  });

  it("pulls egg stock back out, floor-guarded, when an egg-production record with a stock movement is deleted", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue({ id: "egg-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1" });
    mockTx.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "wh-1", quantity: 100, productId: "prod-egg", uomId: "uom-1", movementType: "PRODUCTION_OUTPUT" }
    ]);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-egg" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "sb-1", quantityRemaining: 100 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.eggProductionRecord.update.mockResolvedValue({ id: "egg-1", deletedAt: new Date() });

    const service = makeService();
    await service.softDelete(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-egg", quantityOnHand: { gte: 100 } },
      data: { quantityOnHand: { decrement: 100 }, updatedById: "user-1" }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "sb-1", quantityRemaining: { gte: 100 } },
      data: { quantityRemaining: { decrement: 100 } }
    });
  });

  it("blocks deleting an egg-production record when the credited eggs were already consumed elsewhere", async () => {
    mockPrisma.eggProductionRecord.findFirst.mockResolvedValue({ id: "egg-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1" });
    mockTx.stockMovement.findMany.mockResolvedValue([
      { warehouseId: "wh-1", quantity: 100, productId: "prod-egg", uomId: "uom-1", movementType: "PRODUCTION_OUTPUT" }
    ]);
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-egg" });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.softDelete(makeUser({ farmIds: ["farm-1"] }), "eggs", "egg-1", {})).rejects.toThrow(/already been partly or fully consumed/);
    expect(mockTx.eggProductionRecord.update).not.toHaveBeenCalled();
  });

  it("skips inventory reversal entirely and just soft-deletes when the record never had a stock movement", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue({ id: "fc-2", companyId: "company-1", farmId: "farm-1", branchId: "branch-1" });
    mockTx.stockMovement.findMany.mockResolvedValue([]);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-2", deletedAt: new Date() });

    const service = makeService();
    await service.softDelete(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-2", {});

    expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(mockTx.feedConsumptionRecord.update).toHaveBeenCalledWith({
      where: { id: "fc-2" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1" }
    });
  });
});

describe("PoultryService — idempotencyKey dedup for the 8 poultry create endpoints (mobile parity audit, 2026-08-17)", () => {
  beforeEach(() => jest.clearAllMocks());

  const broilerBatch = { id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", birdType: "BROILERS", openingBirdCount: 1000 };
  const layerBatch = { id: "batch-1", companyId: "company-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FLK-1", birdType: "LAYERS", openingBirdCount: 1000 };

  describe("createMortality", () => {
    const dto = { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 5, idempotencyKey: "idem-mort-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.mortalityRecord.findFirst.mockResolvedValue({ id: "mort-existing" });

      const service = makeService();
      const result = await service.createMortality(makeUser(), dto as never, {});

      expect(result.data.id).toBe("mort-existing");
      expect(mockTx.mortalityRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.mortalityRecord.findFirst.mockResolvedValue(null);
      mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
      mockTx.mortalityRecord.create.mockResolvedValue({ id: "mort-new" });

      const service = makeService();
      await service.createMortality(makeUser(), dto as never, {});

      expect(mockTx.mortalityRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-mort-1" }) })
      );
    });
  });

  describe("createFeed", () => {
    const dto = { flockBatchId: "batch-1", recordDate: "2026-08-09", quantityKg: 50, idempotencyKey: "idem-feed-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue({ id: "feed-existing" });

      const service = makeService();
      const result = await service.createFeed(makeUser(), dto as never, {});

      expect(result.data.id).toBe("feed-existing");
      expect(mockTx.feedConsumptionRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(null);
      mockTx.feedConsumptionRecord.create.mockResolvedValue({ id: "feed-new" });

      const service = makeService();
      await service.createFeed(makeUser(), dto as never, {});

      expect(mockTx.feedConsumptionRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-feed-1" }) })
      );
    });
  });

  describe("createEggs", () => {
    const dto = { flockBatchId: "batch-1", recordDate: "2026-01-01", goodEggs: 10, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0, idempotencyKey: "idem-eggs-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(layerBatch);
      mockPrisma.eggProductionRecord.findFirst.mockResolvedValue({ id: "egg-existing" });

      const service = makeService();
      const result = await service.createEggs(makeUser(), dto as never, {});

      expect(result.data.id).toBe("egg-existing");
      expect(mockTx.eggProductionRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(layerBatch);
      mockPrisma.eggProductionRecord.findFirst.mockResolvedValue(null);
      mockTx.eggProductionRecord.create.mockResolvedValue({ id: "egg-new" });

      const service = makeService();
      await service.createEggs(makeUser(), dto as never, {});

      expect(mockTx.eggProductionRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-eggs-1" }) })
      );
    });
  });

  describe("createWeight", () => {
    const dto = { flockBatchId: "batch-1", recordDate: "2026-01-01", sampleSize: 10, averageWeightKg: 1.5, idempotencyKey: "idem-weight-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.birdWeightRecord.findFirst.mockResolvedValue({ id: "weight-existing" });

      const service = makeService();
      const result = await service.createWeight(makeUser(), dto as never, {});

      expect(result.data.id).toBe("weight-existing");
      expect(mockPrisma.birdWeightRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.birdWeightRecord.findFirst.mockResolvedValue(null);
      mockPrisma.birdWeightRecord.create.mockResolvedValue({ id: "weight-new" });

      const service = makeService();
      await service.createWeight(makeUser(), dto as never, {});

      expect(mockPrisma.birdWeightRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-weight-1" }) })
      );
    });
  });

  describe("createMedication", () => {
    const dto = { flockBatchId: "batch-1", medicationName: "Amoxicillin", dosage: "5ml", startDate: "2026-01-01", idempotencyKey: "idem-med-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.medicationRecord.findFirst.mockResolvedValue({ id: "med-existing" });

      const service = makeService();
      const result = await service.createMedication(makeUser(), dto as never, {});

      expect(result.data.id).toBe("med-existing");
      expect(mockTx.medicationRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.medicationRecord.findFirst.mockResolvedValue(null);
      mockTx.medicationRecord.create.mockResolvedValue({ id: "med-new" });

      const service = makeService();
      await service.createMedication(makeUser(), dto as never, {});

      expect(mockTx.medicationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-med-1" }) })
      );
    });
  });

  describe("createVaccination", () => {
    const dto = { flockBatchId: "batch-1", vaccineName: "Newcastle", dose: "1ml", vaccinationDate: "2026-01-01", idempotencyKey: "idem-vacc-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.vaccinationRecord.findFirst.mockResolvedValue({ id: "vacc-existing" });

      const service = makeService();
      const result = await service.createVaccination(makeUser(), dto as never, {});

      expect(result.data.id).toBe("vacc-existing");
      expect(mockTx.vaccinationRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.vaccinationRecord.findFirst.mockResolvedValue(null);
      mockTx.vaccinationRecord.create.mockResolvedValue({ id: "vacc-new" });

      const service = makeService();
      await service.createVaccination(makeUser(), dto as never, {});

      expect(mockTx.vaccinationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-vacc-1" }) })
      );
    });
  });

  describe("createHealthObservation", () => {
    const dto = { flockBatchId: "batch-1", observationDate: "2026-01-01", severity: "LOW", observation: "Mild lethargy", idempotencyKey: "idem-health-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.poultryHealthObservation.findFirst.mockResolvedValue({ id: "health-existing" });

      const service = makeService();
      const result = await service.createHealthObservation(makeUser(), dto as never, {});

      expect(result.data.id).toBe("health-existing");
      expect(mockPrisma.poultryHealthObservation.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.poultryHealthObservation.findFirst.mockResolvedValue(null);
      mockPrisma.poultryHealthObservation.create.mockResolvedValue({ id: "health-new" });

      const service = makeService();
      await service.createHealthObservation(makeUser(), dto as never, {});

      expect(mockPrisma.poultryHealthObservation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-health-1" }) })
      );
    });
  });

  describe("createCost", () => {
    const dto = { flockBatchId: "batch-1", costDate: "2026-01-01", costType: "FEED", amount: 100, idempotencyKey: "idem-cost-1" };

    it("replays the original record instead of creating a duplicate when the idempotencyKey was already used", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.poultryCostRecord.findFirst.mockResolvedValue({ id: "cost-existing" });

      const service = makeService();
      const result = await service.createCost(makeUser(), dto as never, {});

      expect(result.data.id).toBe("cost-existing");
      expect(mockPrisma.poultryCostRecord.create).not.toHaveBeenCalled();
    });

    it("passes the idempotencyKey through to the record row on a genuinely new record", async () => {
      mockPrisma.flockBatch.findFirst.mockResolvedValue(broilerBatch);
      mockPrisma.poultryCostRecord.findFirst.mockResolvedValue(null);
      mockPrisma.poultryCostRecord.create.mockResolvedValue({ id: "cost-new" });

      const service = makeService();
      await service.createCost(makeUser(), dto as never, {});

      expect(mockPrisma.poultryCostRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: "idem-cost-1" }) })
      );
    });
  });
});

describe("PoultryService.deleteBatch — frees the batch code for reuse (soft-delete + unique index gap)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", code: "001" });
  });

  it("rewrites the code when soft-deleting, so the (companyId, code) unique index doesn't keep it reserved", async () => {
    const service = makeService();
    await service.deleteBatch(makeUser({ farmIds: ["farm-1"] }), "batch-1", {});

    expect(mockPrisma.flockBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ code: "001__deleted_batch-1", deletedAt: expect.any(Date) })
    });
  });

  it("still reports the original code in the audit message and the block-on-dependents error", async () => {
    mockPrisma.mortalityRecord.count.mockResolvedValueOnce(2);
    const service = makeService();
    await expect(service.deleteBatch(makeUser({ farmIds: ["farm-1"] }), "batch-1", {})).rejects.toThrow(/"001"/);
    expect(mockPrisma.flockBatch.update).not.toHaveBeenCalled();
  });
});

describe("PoultryService.updateBatch — code changes are uppercased and checked for conflicts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", companyId: "company-1", farmId: "farm-1", birdType: "LAYERS", code: "FB-1" });
  });

  it("uppercases a new code the same way createBatch does", async () => {
    mockPrisma.flockBatch.findFirst
      .mockResolvedValueOnce({ id: "batch-1", companyId: "company-1", farmId: "farm-1", birdType: "LAYERS", code: "FB-1" })
      .mockResolvedValueOnce(null);
    mockPrisma.flockBatch.update.mockResolvedValue({});
    const service = makeService();

    await service.updateBatch(makeUser({ farmIds: ["farm-1"] }), "batch-1", { code: "fb-2" } as never, {});

    expect(mockPrisma.flockBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ code: "FB-2" })
    });
  });

  it("rejects renaming to a code already used by another active batch", async () => {
    mockPrisma.flockBatch.findFirst
      .mockResolvedValueOnce({ id: "batch-1", companyId: "company-1", farmId: "farm-1", birdType: "LAYERS", code: "FB-1" })
      .mockResolvedValueOnce({ id: "batch-2", code: "FB-2" });
    const service = makeService();

    await expect(service.updateBatch(makeUser({ farmIds: ["farm-1"] }), "batch-1", { code: "fb-2" } as never, {})).rejects.toThrow(/already exists/);
    expect(mockPrisma.flockBatch.update).not.toHaveBeenCalled();
  });
});

describe("PoultryService — currentLiveBirds accounts for transfers, not just mortality (2026-08-18)", () => {
  beforeEach(() => jest.clearAllMocks());

  const baseBatch = {
    id: "batch-1", companyId: "company-1", farmId: "farm-1", status: "ACTIVE", code: "FB-1",
    birdType: "BROILERS", openingBirdCount: 1000, mortalityRecords: [{ birdCount: 50, isCulling: false }],
    feedConsumptionRecords: [], eggProductionRecords: [], birdWeightRecords: [], costRecords: []
  };

  it("subtracts a partial (non-relocation) transfer from currentLiveBirds", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([
      { ...baseBatch, poultryTransferRecords: [{ birdCount: 200, isFullBatchRelocation: false }] }
    ]);
    const service = makeService();

    const result = await service.listBatches(makeUser({ hasGlobalAccess: true }), {} as never);

    // 1000 opening - 50 mortality - 200 transferred out = 750
    expect(result.data[0].currentLiveBirds).toBe(750);
  });

  it("does NOT subtract a whole-batch relocation transfer — the birds moved with the batch, they didn't leave it", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([
      { ...baseBatch, poultryTransferRecords: [{ birdCount: 950, isFullBatchRelocation: true }] }
    ]);
    const service = makeService();

    const result = await service.listBatches(makeUser({ hasGlobalAccess: true }), {} as never);

    // 1000 opening - 50 mortality, relocation excluded = 950 (not 0)
    expect(result.data[0].currentLiveBirds).toBe(950);
  });

  it("mixes a past relocation with a later partial transfer correctly", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([
      {
        ...baseBatch,
        poultryTransferRecords: [
          { birdCount: 950, isFullBatchRelocation: true },
          { birdCount: 100, isFullBatchRelocation: false }
        ]
      }
    ]);
    const service = makeService();

    const result = await service.listBatches(makeUser({ hasGlobalAccess: true }), {} as never);

    // 1000 - 50 mortality - 100 partial transfer (relocation excluded) = 850
    expect(result.data[0].currentLiveBirds).toBe(850);
  });
});

describe("PoultryService.createMortality — live-bird check accounts for prior outgoing transfers (2026-08-18)", () => {
  beforeEach(() => jest.clearAllMocks());

  const flockBatch = { id: "batch-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", openingBirdCount: 1000 };

  it("rejects mortality that ignores birds already transferred out of the batch", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    // 400 birds already left via a partial transfer — only 600 remain, even
    // though no mortality has been recorded yet.
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 400 } });

    const service = makeService();
    await expect(
      service.createMortality(makeUser(), { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 700 } as never, {})
    ).rejects.toThrow(/Only 600 live bird/);
    expect(mockTx.mortalityRecord.create).not.toHaveBeenCalled();
  });

  it("allows mortality within what's actually left after a prior transfer", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 400 } });
    mockTx.mortalityRecord.create.mockResolvedValue({ id: "mort-1" });

    const service = makeService();
    await expect(
      service.createMortality(makeUser(), { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 600 } as never, {})
    ).resolves.toBeDefined();
    expect(mockTx.mortalityRecord.create).toHaveBeenCalled();
  });

  it("does not let a past whole-batch relocation count against remaining live birds", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    // aggregate is already filtered to isFullBatchRelocation: false at the
    // query level, so a relocation transfer contributes 0 here regardless
    // of its birdCount — this simulates that filtered result.
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.mortalityRecord.create.mockResolvedValue({ id: "mort-1" });

    const service = makeService();
    await expect(
      service.createMortality(makeUser(), { flockBatchId: "batch-1", recordDate: "2026-08-09", birdCount: 999 } as never, {})
    ).resolves.toBeDefined();
  });
});

describe("PoultryService.createTransfer — stamps isFullBatchRelocation only when every remaining bird moves (2026-08-18)", () => {
  beforeEach(() => jest.clearAllMocks());

  const flockBatch = { id: "batch-1", farmId: "farm-1", branchId: "branch-1", poultryHouseId: "house-1", status: "ACTIVE", code: "FB-1", openingBirdCount: 1000 };
  const toHouse = { id: "house-2", farmId: "farm-2", branchId: "branch-2" };

  it("marks a whole-flock batch-level transfer as a relocation and reassigns the batch's farm/house", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-1" });

    const service = makeService();
    await service.createTransfer(
      makeUser({ hasGlobalAccess: true }),
      { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 1000, transferDate: "2026-08-09" } as never,
      {}
    );

    expect(mockTx.poultryTransferRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isFullBatchRelocation: true })
    });
    expect(mockTx.flockBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ farmId: "farm-2", poultryHouseId: "house-2" })
    });
  });

  it("does not mark a partial transfer as a relocation, and leaves the batch's farm/house alone", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-2" });

    const service = makeService();
    await service.createTransfer(
      makeUser({ hasGlobalAccess: true }),
      { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 400, transferDate: "2026-08-09" } as never,
      {}
    );

    expect(mockTx.poultryTransferRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isFullBatchRelocation: false })
    });
    expect(mockTx.flockBatch.update).not.toHaveBeenCalled();
  });

  it("does not double-count a past relocation against availability for a later transfer", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue(flockBatch);
    mockPrisma.poultryHouse.findFirst.mockResolvedValue(toHouse);
    mockTx.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    // The prior relocation is excluded by the aggregate's own
    // isFullBatchRelocation: false filter — simulated here as 0 outgoing.
    mockTx.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 0 } });
    mockTx.poultryTransferRecord.create.mockResolvedValue({ id: "trf-3" });

    const service = makeService();
    await expect(
      service.createTransfer(
        makeUser({ hasGlobalAccess: true }),
        { flockBatchId: "batch-1", toFarmId: "farm-2", toPoultryHouseId: "house-2", birdCount: 1000, transferDate: "2026-08-09" } as never,
        {}
      )
    ).resolves.toBeDefined();
  });
});

describe("PoultryService.getDailyRecordPrefill — batch-total fallback accounts for transfers (2026-08-18)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("subtracts outgoing transfers, not just mortality, when there's no previous day's record", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", farmId: "farm-1", status: "ACTIVE", openingBirdCount: 1000 });
    mockPrisma.dailyPoultryRecord.findFirst.mockResolvedValue(null);
    mockPrisma.mortalityRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 50 } });
    mockPrisma.poultryTransferRecord.aggregate.mockResolvedValue({ _sum: { birdCount: 200 } });

    const service = makeService();
    const result = await service.getDailyRecordPrefill(makeUser({ farmIds: ["farm-1"] }), "batch-1", "2026-08-18");

    expect(result.data).toEqual({ openingBirdCount: 750, source: "batch_total" });
  });
});
