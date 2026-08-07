import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { IdentityService } from "./identity.service";

const mockPrisma = {
  role: { findMany: jest.fn(), count: jest.fn() },
  permission: { findMany: jest.fn(), count: jest.fn() },
  branch: { count: jest.fn().mockResolvedValue(0) },
  farm: { count: jest.fn().mockResolvedValue(0) },
  warehouse: { count: jest.fn().mockResolvedValue(0) },
  productionSite: { count: jest.fn().mockResolvedValue(0) },
  user: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
  userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
  userBranchAccess: { deleteMany: jest.fn(), createMany: jest.fn() },
  userFarmAccess: { deleteMany: jest.fn(), createMany: jest.fn() },
  userWarehouseAccess: { deleteMany: jest.fn(), createMany: jest.fn() },
  userProductionSiteAccess: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn().mockImplementation((ops: unknown) => Promise.all(ops as Promise<unknown>[]))
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
const mockAuthService = { clearProfileCache: jest.fn() };

function makeService() {
  return new IdentityService(mockPrisma as never, mockAudit as never, mockAuthService as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "actor-1",
    companyId: "company-1",
    email: "actor@jokas.local",
    fullName: "Actor",
    roles: ["OFFICER"],
    permissions: ["identity.manage"],
    branchIds: ["branch-1"],
    farmIds: [],
    warehouseIds: [],
    productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("IdentityService — privilege escalation guards", () => {
  let service: IdentityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  describe("assignUserRoles", () => {
    it("blocks an OFFICER-level actor from assigning a SUPER_ADMIN role", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.role.findMany.mockResolvedValue([{ id: "role-super", level: "SUPER_ADMIN" }]);

      const actor = makeUser({ roles: ["OFFICER"] });

      await expect(
        service.assignUserRoles(actor, "target-1", { roleIds: ["role-super"] }, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it("blocks assigning a role more privileged than the actor's own even without hasGlobalAccess flag set", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.role.findMany.mockResolvedValue([{ id: "role-manager", level: "MANAGER" }]);

      const actor = makeUser({ roles: ["OFFICER"] });

      await expect(
        service.assignUserRoles(actor, "target-1", { roleIds: ["role-manager"] }, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows a global-access actor to assign a SUPER_ADMIN role", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.role.findMany.mockResolvedValue([{ id: "role-super", level: "SUPER_ADMIN" }]);
      mockPrisma.user.findFirstOrThrow.mockResolvedValue({
        id: "target-1", email: "t@x.com", fullName: "T", phone: null, status: "ACTIVE",
        roles: [], branchAccesses: [], farmAccesses: [], warehouseAccesses: [], productionSiteAccess: []
      });

      const actor = makeUser({ roles: ["SUPER_ADMIN"], hasGlobalAccess: true });

      await expect(
        service.assignUserRoles(actor, "target-1", { roleIds: ["role-super"] }, {})
      ).resolves.toBeDefined();
    });

    it("allows assigning a role at or below the actor's own level", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.role.findMany.mockResolvedValue([{ id: "role-worker", level: "WORKER" }]);
      mockPrisma.user.findFirstOrThrow.mockResolvedValue({
        id: "target-1", email: "t@x.com", fullName: "T", phone: null, status: "ACTIVE",
        roles: [], branchAccesses: [], farmAccesses: [], warehouseAccesses: [], productionSiteAccess: []
      });

      const actor = makeUser({ roles: ["MANAGER"] });

      await expect(
        service.assignUserRoles(actor, "target-1", { roleIds: ["role-worker"] }, {})
      ).resolves.toBeDefined();
    });
  });

  describe("assignUserAccess", () => {
    it("blocks granting access to a branch the actor doesn't have themselves", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.branch.count.mockResolvedValue(1); // branch exists in company

      const actor = makeUser({ branchIds: ["branch-1"] });

      await expect(
        service.assignUserAccess(actor, "target-1", { branchIds: ["branch-OTHER"] }, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows a global-access actor to grant access to any in-company branch", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.branch.count.mockResolvedValue(1);
      mockPrisma.user.findFirstOrThrow.mockResolvedValue({
        id: "target-1", email: "t@x.com", fullName: "T", phone: null, status: "ACTIVE",
        roles: [], branchAccesses: [], farmAccesses: [], warehouseAccesses: [], productionSiteAccess: []
      });

      const actor = makeUser({ branchIds: [], hasGlobalAccess: true });

      await expect(
        service.assignUserAccess(actor, "target-1", { branchIds: ["branch-any"] }, {})
      ).resolves.toBeDefined();
    });
  });

  describe("createRole", () => {
    it("blocks bundling a permission the actor doesn't hold into a new role", async () => {
      mockPrisma.permission.findMany.mockResolvedValue([{ id: "perm-1", key: "platform.manage" }]);

      const actor = makeUser({ permissions: ["identity.manage"] });

      await expect(
        service.createRole(actor, { name: "Sneaky Role", permissionIds: ["perm-1"] }, {})
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
