import { AuthenticatedUser } from "@jokas/shared";
import { AiDataService } from "./ai-data.service";

const mockPrisma = {
  flockBatch: { findMany: jest.fn().mockResolvedValue([]) },
  eggProductionRecord: { groupBy: jest.fn().mockResolvedValue([]) },
  mortalityRecord: { groupBy: jest.fn().mockResolvedValue([]) },
  feedConsumptionRecord: { groupBy: jest.fn().mockResolvedValue([]) },
  poultryHealthObservation: { findMany: jest.fn().mockResolvedValue([]) },
  feedProductionBatch: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
  feedFormula: { findMany: jest.fn().mockResolvedValue([]) },
  soyaProcessingBatch: { findMany: jest.fn().mockResolvedValue([]) },
  inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
  inventoryValuation: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalValue: 0 } }) },
  salesOrder: { aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: { id: 0 } }) },
  customer: { findMany: jest.fn().mockResolvedValue([]) },
  revenue: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  purchaseOrder: { aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 }, _sum: {} }) },
  breakdownRecord: { findMany: jest.fn().mockResolvedValue([]) },
  maintenanceSchedule: { findMany: jest.fn().mockResolvedValue([]) }
};

function makeService() {
  return new AiDataService(mockPrisma as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [],
    permissions: ["poultry.read", "feed.read", "soya.read", "inventory.read", "sales.read", "finance.read", "procurement.read", "maintenance.read"],
    branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("AiDataService.buildContext — location scoping (H14)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes the poultry flock query to the actor's own farm/branch", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ branchIds: ["branch-1"], farmIds: ["farm-1"] }));

    const where = mockPrisma.flockBatch.findMany.mock.calls[0][0].where;
    expect(where.branchId).toEqual({ in: ["branch-1"] });
    expect(where.farmId).toEqual({ in: ["farm-1"] });
  });

  it("scopes the independent health-observation query too, not just the flock list", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ farmIds: ["farm-1"] }));

    const where = mockPrisma.poultryHealthObservation.findMany.mock.calls[0][0].where;
    expect(where.farmId).toEqual({ in: ["farm-1"] });
  });

  it("scopes the inventory low-stock and valuation queries to the actor's own warehouse", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ warehouseIds: ["wh-1"] }));

    expect(mockPrisma.inventoryItem.findMany.mock.calls[0][0].where.warehouseId).toEqual({ in: ["wh-1"] });
    expect(mockPrisma.inventoryValuation.aggregate.mock.calls[0][0].where.warehouseId).toEqual({ in: ["wh-1"] });
  });

  it("scopes sales/customer queries to the actor's own branch", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ branchIds: ["branch-1"] }));

    expect(mockPrisma.salesOrder.aggregate.mock.calls[0][0].where.branchId).toEqual({ in: ["branch-1"] });
    expect(mockPrisma.customer.findMany.mock.calls[0][0].where.branchId).toEqual({ in: ["branch-1"] });
  });

  it("scopes finance revenue/expense aggregates to the actor's own branch", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ branchIds: ["branch-1"] }));

    expect(mockPrisma.revenue.aggregate.mock.calls[0][0].where.branchId).toEqual({ in: ["branch-1"] });
    expect(mockPrisma.expense.aggregate.mock.calls[0][0].where.branchId).toEqual({ in: ["branch-1"] });
  });

  it("includes a scoped day-by-day poultry breakdown so single-day questions are answerable", async () => {
    mockPrisma.eggProductionRecord.groupBy.mockResolvedValueOnce([]); // by flockBatchId
    mockPrisma.eggProductionRecord.groupBy.mockResolvedValueOnce([
      { recordDate: new Date("2026-09-02"), _sum: { goodEggs: 900, crackedEggs: 10, brokenEggs: 0, dirtyEggs: 5, rejectedEggs: 0 } },
    ]);
    const service = makeService();
    const ctx = await service.buildContext(makeUser({ farmIds: ["farm-1"] }));

    // the daily groupBy is scoped like every other query
    const dailyCall = mockPrisma.eggProductionRecord.groupBy.mock.calls.find((c) => c[0].by?.includes("recordDate"));
    expect(dailyCall[0].where.farmId).toEqual({ in: ["farm-1"] });
    expect(ctx).toContain("POULTRY DAILY TOTALS");
    expect(ctx).toContain("2026-09-02: eggs=915 (900 good)");
  });

  it("applies no location filter at all for a global-access user", async () => {
    const service = makeService();
    await service.buildContext(makeUser({ hasGlobalAccess: true }));

    expect(mockPrisma.flockBatch.findMany.mock.calls[0][0].where.branchId).toBeUndefined();
    expect(mockPrisma.flockBatch.findMany.mock.calls[0][0].where.farmId).toBeUndefined();
  });

  it("applies no location filter for a user with zero assignments (unrestricted by convention)", async () => {
    const service = makeService();
    await service.buildContext(makeUser());

    expect(mockPrisma.flockBatch.findMany.mock.calls[0][0].where.branchId).toBeUndefined();
    expect(mockPrisma.flockBatch.findMany.mock.calls[0][0].where.farmId).toBeUndefined();
  });
});
