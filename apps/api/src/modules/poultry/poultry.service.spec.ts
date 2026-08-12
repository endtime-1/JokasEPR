import { ForbiddenException, Logger } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PoultryService } from "./poultry.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("EGG-2026-0001") }));

const mockTx = {
  feedConsumptionRecord: { create: jest.fn(), update: jest.fn() },
  eggProductionRecord: { create: jest.fn() },
  inventoryItem: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  product: { findFirst: jest.fn().mockResolvedValue({ id: "prod-feed", uomId: "uom-1" }) },
  warehouse: { findFirst: jest.fn() },
  stockBatch: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  mortalityRecord: { aggregate: jest.fn(), create: jest.fn() },
  poultryTransferRecord: { aggregate: jest.fn(), create: jest.fn() },
  batchPenAllocation: { findFirst: jest.fn(), upsert: jest.fn() },
  pen: { update: jest.fn(), findFirst: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([])
};

const mockPrisma = {
  poultryHouse: { findFirst: jest.fn() },
  pen: { findFirst: jest.fn(), findMany: jest.fn() },
  flockBatch: { findFirst: jest.fn(), create: jest.fn() },
  batchPenAllocation: { findFirst: jest.fn() },
  poultryTransferRecord: { findFirst: jest.fn() },
  feedConsumptionRecord: { findFirst: jest.fn() },
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
    warnSpy.mockRestore();
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

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { quantityKg: 150 }, {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 50 } },
      data: { quantityOnHand: { decrement: 50 }, updatedById: "user-1" }
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalled();
  });

  it("rejects the whole correction when there isn't enough stock left to cover the increase", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", quantityKg: 150 });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", branchId: "branch-1", uomId: "uom-1" });
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
  });

  it("does not touch inventory at all when quantityKg isn't part of the correction", async () => {
    mockPrisma.feedConsumptionRecord.findFirst.mockResolvedValue(existingFeedRecord);
    mockTx.feedConsumptionRecord.update.mockResolvedValue({ id: "fc-1", notes: "corrected note" });

    const service = makeService();
    await service.updateRecord(makeUser({ farmIds: ["farm-1"] }), "feed", "fc-1", { notes: "corrected note" }, {});

    expect(mockTx.inventoryItem.findFirst).not.toHaveBeenCalled();
  });
});
