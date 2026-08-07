import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PoultryService } from "./poultry.service";

const mockPrisma = {
  poultryHouse: { findFirst: jest.fn() },
  pen: { findFirst: jest.fn(), findMany: jest.fn() },
  flockBatch: { findFirst: jest.fn() },
  poultryTransferRecord: { findFirst: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new PoultryService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
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
