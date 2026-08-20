import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { IdentityService } from "./identity.service";

const mockPrisma = {
  role: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), count: jest.fn() },
  permission: { findMany: jest.fn(), count: jest.fn() },
  branch: { count: jest.fn().mockResolvedValue(0) },
  farm: { count: jest.fn().mockResolvedValue(0) },
  warehouse: { count: jest.fn().mockResolvedValue(0) },
  productionSite: { count: jest.fn().mockResolvedValue(0) },
  user: { findFirst: jest.fn(), findFirstOrThrow: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  userRole: { deleteMany: jest.fn(), createMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
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

    it("allows a non-global-access actor with no branch restriction of their own (empty branchIds) to grant branch access (readiness review 2026-08-20 — the Access editor's own motivating scenario: an identity-manager whose account was never assigned branches previously could never grant ANY scope, since an empty array was wrongly treated as 'access to nothing')", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "target-1", status: "ACTIVE" });
      mockPrisma.branch.count.mockResolvedValueOnce(1);
      mockPrisma.user.findFirstOrThrow.mockResolvedValueOnce({
        id: "target-1", email: "t@x.com", fullName: "T", phone: null, status: "ACTIVE",
        roles: [], branchAccesses: [], farmAccesses: [], warehouseAccesses: [], productionSiteAccess: []
      });

      const actor = makeUser({ branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [], hasGlobalAccess: false, permissions: ["identity.manage"] });

      await expect(
        service.assignUserAccess(actor, "target-1", { branchIds: ["branch-any"] }, {})
      ).resolves.toBeDefined();
    });

    it("still blocks a partially-scoped actor (restricted on farms, unrestricted on branches) from granting a farm they don't have", async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "target-1", status: "ACTIVE" });
      mockPrisma.branch.count.mockResolvedValueOnce(0); // dto supplies no branchIds — a prior test in this block leaves branch.count's persistent default at 1
      mockPrisma.farm.count.mockResolvedValueOnce(1);

      const actor = makeUser({ branchIds: [], farmIds: ["farm-1"], hasGlobalAccess: false, permissions: ["identity.manage"] });

      await expect(
        service.assignUserAccess(actor, "target-1", { farmIds: ["farm-OTHER"] }, {})
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

  describe("updateRole / deleteRole — system roles are protected, custom roles are fully editable", () => {
    it("404s for a role that doesn't exist (or belongs to a different company)", async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      const actor = makeUser({ hasGlobalAccess: true });
      await expect(service.updateRole(actor, "role-1", { name: "New Name" }, {})).rejects.toThrow(NotFoundException);
    });

    it("blocks editing a system role", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Super Admin", isSystem: true });
      const actor = makeUser({ hasGlobalAccess: true });
      await expect(service.updateRole(actor, "role-1", { name: "Hacked" }, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });

    it("blocks deleting a system role", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Super Admin", isSystem: true });
      const actor = makeUser({ hasGlobalAccess: true });
      await expect(service.deleteRole(actor, "role-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });

    it("blocks an actor from granting a permission they don't hold themselves via update", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Custom Role", isSystem: false });
      mockPrisma.permission.findMany.mockResolvedValue([{ id: "perm-1", key: "platform.manage" }]);
      const actor = makeUser({ permissions: ["identity.manage"] });
      await expect(
        service.updateRole(actor, "role-1", { permissionIds: ["perm-1"] }, {})
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });

    it("updates a custom role's name/description and replaces its permission set", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Custom Role", isSystem: false });
      mockPrisma.permission.findMany.mockResolvedValue([{ id: "perm-1", key: "hr.manage" }]);
      const actor = makeUser({ hasGlobalAccess: true });

      await service.updateRole(actor, "role-1", { name: "Renamed", permissionIds: ["perm-1"] }, {});

      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: "role-1" },
        data: expect.objectContaining({ name: "Renamed", permissions: { set: [{ id: "perm-1" }] } }),
        include: { permissions: true }
      });
    });

    it("blocks deleting a role that still has users assigned to it", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Custom Role", isSystem: false });
      mockPrisma.userRole.count.mockResolvedValue(3);
      const actor = makeUser({ hasGlobalAccess: true });
      await expect(service.deleteRole(actor, "role-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
    });

    it("soft-deletes a custom role with no users assigned", async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: "role-1", companyId: "company-1", name: "Custom Role", isSystem: false });
      mockPrisma.userRole.count.mockResolvedValue(0);
      const actor = makeUser({ hasGlobalAccess: true });
      await service.deleteRole(actor, "role-1", {});
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: "role-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
    });
  });

  describe("updateUser — revokes sessions on an admin-initiated password change (M9)", () => {
    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE" });
      mockPrisma.user.update.mockResolvedValue({ id: "target-1", email: "t@x.com", fullName: "Target", status: "ACTIVE" });
    });

    it("sets passwordChangedAt and revokes active refresh tokens when an admin changes the password", async () => {
      const actor = makeUser();

      await service.updateUser(actor, "target-1", { password: "NewStr0ng!Pass" } as never, {});

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordChangedAt: expect.any(Date) }) })
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "target-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) }
      });
    });

    it("does not touch refresh tokens when the update has nothing to do with the password", async () => {
      const actor = makeUser();

      await service.updateUser(actor, "target-1", { fullName: "New Name" } as never, {});

      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ passwordChangedAt: expect.anything() }) })
      );
    });
  });

  describe("deleteUser — email must not block recreating a user with the same address", () => {
    it("rewrites the email on soft-delete so @@unique([companyId, email]) doesn't permanently block reuse", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: "target-1", status: "ACTIVE", email: "jane@jokas.local" });
      mockPrisma.user.update.mockResolvedValue({});
      const actor = makeUser();

      await service.deleteUser(actor, "target-1", {});

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "target-1" },
        data: expect.objectContaining({
          email: "jane@jokas.local__deleted_target-1",
          deletedAt: expect.any(Date)
        })
      });
    });

    it("refuses to let an actor delete their own account", async () => {
      const actor = makeUser({ id: "actor-1" });

      await expect(service.deleteUser(actor, "actor-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("listUsers — real pagination, not a silent 500-row cap (M14)", () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
    });

    it("defaults to take=500 (today's cap) when the caller sends no pagination params", async () => {
      await service.listUsers("company-1");

      expect(mockPrisma.user.findMany.mock.calls[0][0].take).toBe(500);
      expect(mockPrisma.user.findMany.mock.calls[0][0].skip).toBe(0);
    });

    it("honors an explicit page/take and computes the correct skip", async () => {
      mockPrisma.user.count.mockResolvedValue(150);

      const result = await service.listUsers("company-1", { page: 2, take: 50 });

      expect(mockPrisma.user.findMany.mock.calls[0][0].skip).toBe(50);
      expect(mockPrisma.user.findMany.mock.calls[0][0].take).toBe(50);
      expect(result.meta).toEqual({ total: 150, page: 2, take: 50, totalPages: 3 });
    });
  });
});
