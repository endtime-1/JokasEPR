import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../prisma/prisma.service";

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: {
    stockBatch: { findMany: jest.Mock };
    productProfitability: { findMany: jest.Mock };
    salesOrder: { aggregate: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    flockBatch: { aggregate: jest.Mock; count: jest.Mock };
    stockExpiryAlert: { count: jest.Mock };
    employee: { findFirst: jest.Mock };
    farm: { count: jest.Mock; findMany: jest.Mock };
    branch: { findMany: jest.Mock };
    productionSite: { count: jest.Mock };
    eggProductionRecord: { count: jest.Mock; findMany: jest.Mock; aggregate: jest.Mock };
    feedConsumptionRecord: { count: jest.Mock; findMany: jest.Mock; aggregate: jest.Mock };
    mortalityRecord: { count: jest.Mock; findMany: jest.Mock; aggregate: jest.Mock };
    dailyPoultryRecord: { count: jest.Mock; findMany: jest.Mock };
    stockMovement: { count: jest.Mock };
    soyaBeanIntake: { count: jest.Mock; aggregate: jest.Mock; findMany: jest.Mock };
    soyaOilOutput: { aggregate: jest.Mock; findMany: jest.Mock };
    soyaCakeOutput: { aggregate: jest.Mock; findMany: jest.Mock };
    attendanceRecord: { count: jest.Mock };
    prospectVisit: { count: jest.Mock };
    feedProductionBatch: { count: jest.Mock; findMany: jest.Mock; aggregate: jest.Mock };
    feedProductionOrder: { count: jest.Mock };
    purchaseOrder: { count: jest.Mock };
    maintenanceRecord: { count: jest.Mock };
    aiAlert: { count: jest.Mock; findMany: jest.Mock };
    supplierInvoice: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      stockBatch: { findMany: jest.fn() },
      productProfitability: { findMany: jest.fn() },
      salesOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0, balanceDue: 0 } }), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      flockBatch: { aggregate: jest.fn().mockResolvedValue({ _sum: { openingBirdCount: 0 } }), count: jest.fn().mockResolvedValue(0) },
      stockExpiryAlert: { count: jest.fn().mockResolvedValue(0) },
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      farm: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      productionSite: { count: jest.fn().mockResolvedValue(0) },
      eggProductionRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { goodEggs: 0, crackedEggs: 0, dirtyEggs: 0, brokenEggs: 0, rejectedEggs: 0 } }) },
      feedConsumptionRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 0 } }) },
      mortalityRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { birdCount: 0 } }) },
      dailyPoultryRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { count: jest.fn().mockResolvedValue(0) },
      soyaBeanIntake: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
      soyaOilOutput: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityLitres: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
      soyaCakeOutput: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityKg: 0 } }), findMany: jest.fn().mockResolvedValue([]) },
      attendanceRecord: { count: jest.fn().mockResolvedValue(0) },
      prospectVisit: { count: jest.fn().mockResolvedValue(0) },
      feedProductionBatch: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { producedQuantityKg: 0 } }) },
      feedProductionOrder: { count: jest.fn().mockResolvedValue(0) },
      purchaseOrder: { count: jest.fn().mockResolvedValue(0) },
      maintenanceRecord: { count: jest.fn().mockResolvedValue(0) },
      aiAlert: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      supplierInvoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { balanceDue: 0 } }) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe("liveInventoryValueByCategory", () => {
    it("groups batches by category and sorts descending", async () => {
      prisma.stockBatch.findMany.mockResolvedValue([
        { quantityRemaining: 10, unitCost: 5, product: { category: { name: "Poultry" } } },
        { quantityRemaining: 20, unitCost: 3, product: { category: { name: "Feed" } } },
        { quantityRemaining: 5, unitCost: 10, product: { category: { name: "Poultry" } } },
      ]);

      const result = await (service as any).liveInventoryValueByCategory(makeUser(), {});

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("inventory_value");
      // Poultry: 10*5 + 5*10 = 100; Feed: 20*3 = 60 → Poultry first
      expect(result[0].data[0].label).toBe("Poultry");
      expect(result[0].data[0].value).toBe(100);
      expect(result[0].data[1].label).toBe("Feed");
      expect(result[0].data[1].value).toBe(60);
    });

    it("falls back to Uncategorised when product has no category", async () => {
      prisma.stockBatch.findMany.mockResolvedValue([
        { quantityRemaining: 4, unitCost: 2.5, product: { category: null } },
      ]);

      const result = await (service as any).liveInventoryValueByCategory(makeUser(), {});

      expect(result[0].data[0].label).toBe("Uncategorised");
      expect(result[0].data[0].value).toBe(10);
    });

    it("propagates a prisma error instead of silently returning empty data (H23)", async () => {
      // A silent empty-data fallback here is indistinguishable from
      // "genuinely no inventory this period" — it must fail loudly instead
      // (executive() converts this into a proper 500 for the caller).
      prisma.stockBatch.findMany.mockRejectedValue(new Error("db error"));

      await expect((service as any).liveInventoryValueByCategory(makeUser(), {})).rejects.toThrow("db error");
    });
  });

  describe("liveProfitabilityByProduct", () => {
    const range = { start: new Date("2024-01-01"), end: new Date("2024-12-31") };

    it("groups rows by product name, aggregates profit, and sorts descending", async () => {
      prisma.productProfitability.findMany.mockResolvedValue([
        { productName: "Broiler", grossProfit: 300 },
        { productName: "Soya Oil", grossProfit: 500 },
        { productName: "Broiler", grossProfit: 200 },
      ]);

      const result = await (service as any).liveProfitabilityByProduct("company-1", range);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("gross_profit");
      // Both are 500; stable sort keeps insertion order → Broiler first (seen first)
      expect(result[0].data[0].label).toBe("Broiler");
      expect(result[0].data[0].value).toBe(500);
      expect(result[0].data[1].label).toBe("Soya Oil");
      expect(result[0].data[1].value).toBe(500);
    });

    it("rounds values to 2 decimal places", async () => {
      prisma.productProfitability.findMany.mockResolvedValue([
        { productName: "Feed", grossProfit: 100.3333 },
        { productName: "Feed", grossProfit: 200.6667 },
      ]);

      const result = await (service as any).liveProfitabilityByProduct("company-1", range);

      expect(result[0].data[0].value).toBe(301);
    });

    it("propagates a prisma error instead of silently returning empty data (H23)", async () => {
      prisma.productProfitability.findMany.mockRejectedValue(new Error("db error"));

      await expect((service as any).liveProfitabilityByProduct("company-1", range)).rejects.toThrow("db error");
    });
  });

  describe("summary — scope filtering (H13)", () => {
    it("scopes queries to the actor's own branch/warehouse/farm when they have assignments", async () => {
      await service.summary(makeUser({ branchIds: ["branch-1"], warehouseIds: ["wh-1"], farmIds: ["farm-1"] }));

      const salesWhere = prisma.salesOrder.aggregate.mock.calls[0][0].where;
      expect(salesWhere.branchId).toEqual({ in: ["branch-1"] });
      expect(salesWhere.warehouseId).toEqual({ in: ["wh-1"] });

      const flockWhere = prisma.flockBatch.aggregate.mock.calls[0][0].where;
      expect(flockWhere.farmId).toEqual({ in: ["farm-1"] });
    });

    it("applies no scope filter for a global-access user", async () => {
      await service.summary(makeUser({ hasGlobalAccess: true }));

      const salesWhere = prisma.salesOrder.aggregate.mock.calls[0][0].where;
      expect(salesWhere.branchId).toBeUndefined();
      expect(salesWhere.warehouseId).toBeUndefined();
    });

    it("applies no scope filter for a user with zero assignments (unrestricted by convention)", async () => {
      await service.summary(makeUser());

      const salesWhere = prisma.salesOrder.aggregate.mock.calls[0][0].where;
      expect(salesWhere.branchId).toBeUndefined();
      expect(salesWhere.warehouseId).toBeUndefined();
    });

    it("H-BUG (DB stability audit, 2026-08-16): filters deletedAt on both SalesOrder queries — a deleted order no longer inflates monthly revenue or the open-orders count", async () => {
      await service.summary(makeUser());

      expect(prisma.salesOrder.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.salesOrder.count.mock.calls[0][0].where.deletedAt).toBeNull();
    });
  });

  describe("myDuties / farmOperationsToday — empty-array convention consistency (H13)", () => {
    it("myDuties treats an empty farmIds array as unrestricted, not 'show nothing'", async () => {
      await service.myDuties(makeUser({ farmIds: [], productionSiteIds: [] }));

      // Previously hasFarms would be false here and every farm-scoped count
      // would be skipped entirely (-1/"N/A"). Now the query always runs,
      // unrestricted since the array is empty.
      const eggWhere = prisma.eggProductionRecord.count.mock.calls[0][0].where;
      expect(eggWhere.farmId).toBeUndefined();
    });

    it("myDuties scopes to the actor's own farms when they do have assignments", async () => {
      await service.myDuties(makeUser({ farmIds: ["farm-1"] }));

      const eggWhere = prisma.eggProductionRecord.count.mock.calls[0][0].where;
      expect(eggWhere.farmId).toEqual({ in: ["farm-1"] });
    });

    it("farmOperationsToday treats an empty farmIds array as unrestricted, not the '__' sentinel", async () => {
      await service.farmOperationsToday(makeUser({ farmIds: [] }));

      const eggWhere = prisma.eggProductionRecord.findMany.mock.calls[0][0].where;
      expect(eggWhere.farmId).toBeUndefined();
    });
  });

  describe("summary — sensitive fields are gated by domain permission, not just PLATFORM_READ (C4)", () => {
    beforeEach(() => {
      prisma.salesOrder.aggregate.mockResolvedValue({ _sum: { totalAmount: 5000, balanceDue: 0 } });
      prisma.salesOrder.count.mockResolvedValue(7);
      prisma.flockBatch.aggregate.mockResolvedValue({ _sum: { openingBirdCount: 1200 } });
    });

    it("omits revenue/orders and birds (undefined, not a fake zero) when the caller holds only the base permission", async () => {
      const result = await service.summary(makeUser({ permissions: [] }));

      expect(result.data.totalRevenue).toBeUndefined();
      expect(result.data.openOrders).toBeUndefined();
      expect(result.data.totalBirds).toBeUndefined();
    });

    it("returns real revenue/orders when the caller holds SALES_READ, but still hides bird count", async () => {
      const result = await service.summary(makeUser({ permissions: ["sales.read"] }));

      expect(result.data.totalRevenue).toBe(5000);
      expect(result.data.openOrders).toBe(7);
      expect(result.data.totalBirds).toBeUndefined();
    });

    it("returns real revenue via FINANCE_READ too, not only SALES_READ", async () => {
      const result = await service.summary(makeUser({ permissions: ["finance.read"] }));
      expect(result.data.totalRevenue).toBe(5000);
    });

    it("returns real bird count when the caller holds POULTRY_READ, but still hides revenue", async () => {
      const result = await service.summary(makeUser({ permissions: ["poultry.read"] }));

      expect(result.data.totalBirds).toBe(1200);
      expect(result.data.totalRevenue).toBeUndefined();
    });

    it("returns everything for a global-access user regardless of their permissions list", async () => {
      const result = await service.summary(makeUser({ permissions: [], hasGlobalAccess: true }));

      expect(result.data.totalRevenue).toBe(5000);
      expect(result.data.totalBirds).toBe(1200);
    });
  });

  describe("liveInventoryValueByCategory — now scoped by location, not just companyId (C4)", () => {
    it("applies the actor's branch/farm/warehouse/site scope to the underlying query", async () => {
      prisma.stockBatch.findMany.mockResolvedValue([]);
      await (service as any).liveInventoryValueByCategory(makeUser({ warehouseIds: ["wh-1"] }), {});

      const where = prisma.stockBatch.findMany.mock.calls[0][0].where;
      expect(where.warehouseId).toEqual({ in: ["wh-1"] });
    });

    it("applies no restriction for a global-access user", async () => {
      prisma.stockBatch.findMany.mockResolvedValue([]);
      await (service as any).liveInventoryValueByCategory(makeUser({ hasGlobalAccess: true }), {});

      const where = prisma.stockBatch.findMany.mock.calls[0][0].where;
      expect(where.warehouseId).toBeUndefined();
    });
  });

  describe("computeMetricValues — the four previously-unscoped queries are now location-scoped (C4)", () => {
    beforeEach(() => {
      prisma.stockBatch.findMany.mockResolvedValue([]);
    });

    function callComputeMetricValues(user: AuthenticatedUser) {
      const range = { start: new Date("2026-01-01"), end: new Date("2026-01-31") };
      return (service as any).computeMetricValues(user, {}, range);
    }

    it("scopes stockExpiryAlert (lowStockAlerts) to the actor's branch/warehouse/site", async () => {
      await callComputeMetricValues(makeUser({ warehouseIds: ["wh-1"] }));
      const where = prisma.stockExpiryAlert.count.mock.calls[0][0].where;
      expect(where.warehouseId).toEqual({ in: ["wh-1"] });
    });

    it("scopes feedProductionOrder (pendingProductionOrders) to the actor's branch/site", async () => {
      await callComputeMetricValues(makeUser({ productionSiteIds: ["site-1"] }));
      const where = prisma.feedProductionOrder.count.mock.calls[0][0].where;
      expect(where.productionSiteId).toEqual({ in: ["site-1"] });
    });

    it("scopes maintenanceRecord (machineMaintenanceAlerts) to the actor's full location scope", async () => {
      await callComputeMetricValues(makeUser({ farmIds: ["farm-1"] }));
      const where = prisma.maintenanceRecord.count.mock.calls[0][0].where;
      expect(where.farmId).toEqual({ in: ["farm-1"] });
    });

    it("scopes stockBatch (currentInventoryValue) to the actor's full location scope", async () => {
      await callComputeMetricValues(makeUser({ branchIds: ["branch-1"] }));
      const where = prisma.stockBatch.findMany.mock.calls[0][0].where;
      expect(where.branchId).toEqual({ in: ["branch-1"] });
    });

    it("applies no restriction on any of the four for a global-access user", async () => {
      await callComputeMetricValues(makeUser({ hasGlobalAccess: true }));
      expect(prisma.stockExpiryAlert.count.mock.calls[0][0].where.warehouseId).toBeUndefined();
      expect(prisma.feedProductionOrder.count.mock.calls[0][0].where.productionSiteId).toBeUndefined();
      expect(prisma.maintenanceRecord.count.mock.calls[0][0].where.farmId).toBeUndefined();
      expect(prisma.stockBatch.findMany.mock.calls[0][0].where.branchId).toBeUndefined();
    });

    it("leaves purchaseOrder (pendingPurchaseApprovals) unscoped — the model has no location columns", async () => {
      await callComputeMetricValues(makeUser({ branchIds: ["branch-1"] }));
      const where = prisma.purchaseOrder.count.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });

    it("propagates a single sub-query's failure instead of silently substituting a fake 0 (H23)", async () => {
      // Previously every sub-query here ended in .catch(() => 0) — a single
      // transient failure silently became a fake 0 instead of failing the
      // whole computeMetricValues() call.
      prisma.aiAlert.count.mockRejectedValue(new Error("db blip"));
      await expect(callComputeMetricValues(makeUser())).rejects.toThrow("db blip");
    });
  });

  describe("computeMetricValues / liveCharts — soft-deleted records no longer count toward the KPIs (L-BUG, 2026-08-13)", () => {
    beforeEach(() => {
      prisma.stockBatch.findMany.mockResolvedValue([]);
      prisma.productProfitability.findMany.mockResolvedValue([]);
    });

    function callComputeMetricValues(user: AuthenticatedUser) {
      const range = { start: new Date("2026-01-01"), end: new Date("2026-01-31") };
      return (service as any).computeMetricValues(user, {}, range);
    }

    function callLiveCharts(user: AuthenticatedUser) {
      const range = { start: new Date("2026-01-01"), end: new Date("2026-01-31") };
      return (service as any).liveCharts(user, {}, range);
    }

    it("filters deletedAt on every aggregate that feeds the executive KPI tiles", async () => {
      await callComputeMetricValues(makeUser());
      expect(prisma.eggProductionRecord.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.mortalityRecord.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedConsumptionRecord.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedProductionBatch.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.soyaBeanIntake.aggregate.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedProductionOrder.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.maintenanceRecord.count.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it("filters deletedAt on every query feeding the trend charts", async () => {
      await callLiveCharts(makeUser());
      expect(prisma.eggProductionRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.mortalityRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedProductionBatch.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.soyaBeanIntake.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it("a deleted mortality/feed record no longer contributes to the KPI total (end-to-end through the mock)", async () => {
      // Simulates what the deletedAt filter actually protects against: a
      // mock that behaves like Prisma actually filtering deletedAt: null
      // returns 0 once the underlying record is "deleted", instead of the
      // stale value a query with no deletedAt filter would keep returning.
      prisma.mortalityRecord.aggregate.mockImplementation((args: any) =>
        Promise.resolve(args.where.deletedAt === null ? { _sum: { birdCount: 0 } } : { _sum: { birdCount: 25 } })
      );
      const result = await callComputeMetricValues(makeUser());
      expect(result.mortalityToday).toBe(0);
    });
  });

  describe("myDuties / farmOperationsToday — soft-deleted records no longer count as 'done today' (L-BUG, 2026-08-13)", () => {
    it("myDuties filters deletedAt on every duty-completion count", async () => {
      // hasGlobalAccess so every permission-gated query (canSales/canStock/
      // canSoya) actually runs instead of short-circuiting to Promise.resolve(-1).
      await service.myDuties(makeUser({ hasGlobalAccess: true }));
      expect(prisma.eggProductionRecord.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedConsumptionRecord.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.mortalityRecord.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.dailyPoultryRecord.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedProductionBatch.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.salesOrder.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.stockMovement.count.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.soyaBeanIntake.count.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it("farmOperationsToday filters deletedAt on every farm/site completion lookup", async () => {
      await service.farmOperationsToday(makeUser());
      expect(prisma.eggProductionRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedConsumptionRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.mortalityRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.dailyPoultryRecord.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.feedProductionBatch.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    });
  });

  describe("executive — a failure anywhere surfaces as a real error, not a corrupted period-over-period comparison (H23)", () => {
    beforeEach(() => {
      prisma.stockBatch.findMany.mockResolvedValue([]);
      prisma.productProfitability.findMany.mockResolvedValue([]);
    });

    it("resolves normally on the happy path", async () => {
      await expect(service.executive(makeUser({ hasGlobalAccess: true }), {} as never)).resolves.toBeDefined();
    });

    it("converts a failure in the current-period metrics into a real 500, not a fake 'down 100%' delta", async () => {
      // Would previously have rendered as a fake 0 for just the current
      // period, diffed against a real prior-period value, showing
      // management a fabricated "down 100%" swing instead of an error.
      prisma.aiAlert.count.mockRejectedValueOnce(new Error("db blip"));

      await expect(service.executive(makeUser({ hasGlobalAccess: true }), {} as never)).rejects.toThrow(
        "Executive dashboard failed to load"
      );
    });
  });
});
