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
    salesOrder: { aggregate: jest.Mock; count: jest.Mock };
    flockBatch: { aggregate: jest.Mock };
    stockExpiryAlert: { count: jest.Mock };
    employee: { findFirst: jest.Mock };
    farm: { count: jest.Mock };
    productionSite: { count: jest.Mock };
    eggProductionRecord: { count: jest.Mock; findMany: jest.Mock };
    feedConsumptionRecord: { count: jest.Mock; findMany: jest.Mock };
    mortalityRecord: { count: jest.Mock; findMany: jest.Mock };
    dailyPoultryRecord: { count: jest.Mock; findMany: jest.Mock };
    stockMovement: { count: jest.Mock };
    soyaBeanIntake: { count: jest.Mock };
    attendanceRecord: { count: jest.Mock };
    prospectVisit: { count: jest.Mock };
    feedProductionBatch: { count: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      stockBatch: { findMany: jest.fn() },
      productProfitability: { findMany: jest.fn() },
      salesOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }), count: jest.fn().mockResolvedValue(0) },
      flockBatch: { aggregate: jest.fn().mockResolvedValue({ _sum: { openingBirdCount: 0 } }) },
      stockExpiryAlert: { count: jest.fn().mockResolvedValue(0) },
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      farm: { count: jest.fn().mockResolvedValue(0) },
      productionSite: { count: jest.fn().mockResolvedValue(0) },
      eggProductionRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      feedConsumptionRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      mortalityRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      dailyPoultryRecord: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: { count: jest.fn().mockResolvedValue(0) },
      soyaBeanIntake: { count: jest.fn().mockResolvedValue(0) },
      attendanceRecord: { count: jest.fn().mockResolvedValue(0) },
      prospectVisit: { count: jest.fn().mockResolvedValue(0) },
      feedProductionBatch: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
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

      const result = await (service as any).liveInventoryValueByCategory("company-1");

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

      const result = await (service as any).liveInventoryValueByCategory("company-1");

      expect(result[0].data[0].label).toBe("Uncategorised");
      expect(result[0].data[0].value).toBe(10);
    });

    it("returns empty data on prisma error", async () => {
      prisma.stockBatch.findMany.mockRejectedValue(new Error("db error"));

      const result = await (service as any).liveInventoryValueByCategory("company-1");

      expect(result).toEqual([{ name: "inventory_value", data: [] }]);
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

    it("returns empty data on prisma error", async () => {
      prisma.productProfitability.findMany.mockRejectedValue(new Error("db error"));

      const result = await (service as any).liveProfitabilityByProduct("company-1", range);

      expect(result).toEqual([{ name: "gross_profit", data: [] }]);
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
});
