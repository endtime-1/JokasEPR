import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PlatformService } from "./platform.service";

const mockPrisma = {
  branch: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: "branch-1", code: "B1" }) },
  farm: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: "farm-1", code: "F1" }) },
  productionSite: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: "site-1", code: "S1" }) },
  warehouse: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: "wh-1", code: "W1" }) }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new PlatformService(mockPrisma as never, mockAudit as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("PlatformService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("PlatformService — update/delete scope checks (H1)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("branch", () => {
    it("blocks updating a branch outside the actor's own scope", async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-OTHER", code: "B2" });
      const service = makeService();
      await expect(service.updateBranch(makeUser(), "branch-OTHER", {}, {})).rejects.toThrow(ForbiddenException);
    });

    it("allows updating a branch within scope", async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-1", code: "B1" });
      const service = makeService();
      await expect(service.updateBranch(makeUser(), "branch-1", {}, {})).resolves.toBeDefined();
    });

    it("global-access actor can update any branch", async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-OTHER", code: "B2" });
      const service = makeService();
      await expect(
        service.updateBranch(makeUser({ hasGlobalAccess: true, branchIds: [] }), "branch-OTHER", {}, {})
      ).resolves.toBeDefined();
    });

    it("blocks deleting a branch outside the actor's own scope", async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: "branch-OTHER", code: "B2" });
      const service = makeService();
      await expect(service.deleteBranch(makeUser(), "branch-OTHER", {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe("farm", () => {
    it("blocks updating a farm whose parent branch is outside the actor's scope", async () => {
      mockPrisma.farm.findFirst.mockResolvedValue({ id: "farm-1", branchId: "branch-OTHER", code: "F1" });
      const service = makeService();
      await expect(service.updateFarm(makeUser(), "farm-1", {}, {})).rejects.toThrow(ForbiddenException);
    });

    it("allows updating a farm whose parent branch is in the actor's scope", async () => {
      mockPrisma.farm.findFirst.mockResolvedValue({ id: "farm-1", branchId: "branch-1", code: "F1" });
      const service = makeService();
      await expect(service.updateFarm(makeUser(), "farm-1", {}, {})).resolves.toBeDefined();
    });

    it("blocks deleting a farm whose parent branch is outside the actor's scope", async () => {
      mockPrisma.farm.findFirst.mockResolvedValue({ id: "farm-1", branchId: "branch-OTHER", code: "F1" });
      const service = makeService();
      await expect(service.deleteFarm(makeUser(), "farm-1", {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe("warehouse", () => {
    it("blocks updating a warehouse outside the actor's branch scope", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-OTHER", farmId: null, productionSiteId: null, code: "W1" });
      const service = makeService();
      await expect(service.updateWarehouse(makeUser(), "wh-1", {}, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks re-parenting a warehouse into a branch the actor doesn't have access to", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null, code: "W1" });
      const service = makeService();
      await expect(
        service.updateWarehouse(makeUser(), "wh-1", { branchId: "branch-OTHER" } as never, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows updating a warehouse within the actor's own branch scope", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null, code: "W1" });
      const service = makeService();
      await expect(service.updateWarehouse(makeUser(), "wh-1", {}, {})).resolves.toBeDefined();
    });

    it("blocks deleting a warehouse outside the actor's branch scope", async () => {
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-OTHER", farmId: null, productionSiteId: null, code: "W1" });
      const service = makeService();
      await expect(service.deleteWarehouse(makeUser(), "wh-1", {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe("production site", () => {
    it("blocks updating a site whose parent branch is outside the actor's scope", async () => {
      mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-OTHER", code: "S1" });
      const service = makeService();
      await expect(service.updateProductionSite(makeUser(), "site-1", {}, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks re-parenting a site into a branch the actor doesn't have access to", async () => {
      mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-1", code: "S1" });
      const service = makeService();
      await expect(
        service.updateProductionSite(makeUser(), "site-1", { branchId: "branch-OTHER" } as never, {})
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
