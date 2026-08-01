import { Test, TestingModule } from "@nestjs/testing";
import { DashboardService } from "./dashboard.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let prisma: { stockBatch: { findMany: jest.Mock }; productProfitability: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      stockBatch: { findMany: jest.fn() },
      productProfitability: { findMany: jest.fn() },
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
});
