import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssignUserAccessDto } from "./dto/assign-user-access.dto";
import { AssignUserRolesDto } from "./dto/assign-user-roles.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { ResetUserPasswordDto } from "./dto/reset-user-password.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

// Lower rank = more privileged. Mirrors the declaration order of the
// RoleLevel enum in schema.prisma, which is intentional (SUPER_ADMIN highest).
const ROLE_LEVEL_RANK: Record<string, number> = {
  SUPER_ADMIN: 0,
  CEO: 1,
  MANAGER: 2,
  OFFICER: 3,
  WORKER: 4,
  AUDITOR: 5
};
const LEAST_PRIVILEGED_RANK = Object.keys(ROLE_LEVEL_RANK).length;

function actorHighestRank(actor: AuthenticatedUser): number {
  if (actor.roles.length === 0) return LEAST_PRIVILEGED_RANK;
  return Math.min(...actor.roles.map((level) => ROLE_LEVEL_RANK[level] ?? LEAST_PRIVILEGED_RANK));
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService
  ) {}

  async listUsers(companyId: string, query: ListUsersQueryDto = {}) {
    const where = { companyId, deletedAt: null };
    // M14: take now defaults to 500 (the old hard cap) when the caller
    // doesn't ask for pagination, so the un-paginated admin UI is
    // unaffected; a caller that does pass page/take can now reach users
    // past 500 instead of them silently falling off the end of the list.
    const take = query.take ?? 500;
    const page = query.page ?? 1;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          branch: { select: { id: true, name: true, code: true } },
          farm: { select: { id: true, name: true, code: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          productionSite: { select: { id: true, name: true, code: true } },
          roles: { select: { role: { select: { id: true, name: true } } } },
          branchAccesses: { select: { branch: { select: { id: true, name: true, code: true } } } },
          farmAccesses: { select: { farm: { select: { id: true, name: true, code: true } } } },
          warehouseAccesses: { select: { warehouse: { select: { id: true, name: true, code: true } } } },
          productionSiteAccess: { select: { productionSite: { select: { id: true, name: true, code: true } } } }
        },
        orderBy: { fullName: "asc" },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.user.count({ where })
    ]);
    return { data, meta: { total, page, take, totalPages: Math.max(1, Math.ceil(total / take)) } };
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto, context: RequestContext) {
    const access = {
      branchIds: this.normalizeIds(dto.branchIds, dto.branchId),
      farmIds: this.normalizeIds(dto.farmIds, dto.farmId),
      warehouseIds: this.normalizeIds(dto.warehouseIds, dto.warehouseId),
      productionSiteIds: this.normalizeIds(dto.productionSiteIds, dto.productionSiteId)
    };
    await this.assertActorCanAssignRoles(actor, dto.roleIds);
    await this.assertScopeIdsBelongToCompany(actor.companyId, access);
    this.assertActorHasScopeAccess(actor, access);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: actor.companyId,
          branchId: dto.branchId,
          farmId: dto.farmId,
          warehouseId: dto.warehouseId,
          productionSiteId: dto.productionSiteId,
          email: dto.email.toLowerCase(),
          fullName: dto.fullName,
          phone: dto.phone,
          passwordHash,
          roles: {
            createMany: {
              data: dto.roleIds.map((roleId) => ({ roleId, companyId: actor.companyId }))
            }
          },
          branchAccesses: { createMany: { data: access.branchIds.map((branchId) => ({ branchId, companyId: actor.companyId })) } },
          farmAccesses: { createMany: { data: access.farmIds.map((farmId) => ({ farmId, companyId: actor.companyId })) } },
          warehouseAccesses: { createMany: { data: access.warehouseIds.map((warehouseId) => ({ warehouseId, companyId: actor.companyId })) } },
          productionSiteAccess: {
            createMany: { data: access.productionSiteIds.map((productionSiteId) => ({ productionSiteId, companyId: actor.companyId })) }
          }
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true
        }
      });

      return created;
    });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      summary: `Created user ${user.email}`,
      metadata: { roleIds: dto.roleIds, access },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: user };
  }

  async updateUser(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto, context: RequestContext) {
    const existing = await this.getCompanyUser(actor.companyId, userId);

    if (dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: { companyId: actor.companyId, email: dto.email.toLowerCase(), id: { not: userId }, deletedAt: null }
      });
      if (conflict) throw new BadRequestException("Email is already in use by another user.");
    }

    const data: Record<string, unknown> = { updatedById: actor.id };
    if (dto.fullName) data.fullName = dto.fullName;
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.phone !== undefined) data.phone = dto.phone;
    // M9: unlike changePassword/resetUserPassword, this path previously left
    // passwordChangedAt untouched and never revoked existing sessions — an
    // admin "fixing" a compromised account's password didn't actually log
    // the attacker out; their refresh token kept working for up to 30 days.
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      data.passwordChangedAt = new Date();
    }

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, email: true, fullName: true, status: true }
    });

    if (dto.password) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      summary: `Updated user ${user.email}`,
      metadata: { fields: Object.keys(data).filter((k) => k !== "updatedById") },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    this.authService.clearProfileCache(userId);
    return { data: user };
  }

  async deleteUser(actor: AuthenticatedUser, userId: string, context: RequestContext) {
    if (actor.id === userId) throw new BadRequestException("You cannot delete your own account.");
    const existing = await this.getCompanyUser(actor.companyId, userId);

    // @@unique([companyId, email]) isn't deletedAt-aware — without rewriting
    // the email here, deleting a user and recreating one with the same email
    // (the obvious thing to do when someone leaves and is replaced) fails
    // the create with a unique-constraint error, and the account looks stuck
    // forever. Same pattern as FlockBatch.code on batch soft-delete.
    await this.prisma.user.update({
      where: { id: existing.id },
      data: { email: `${existing.email}__deleted_${existing.id}`, deletedAt: new Date(), updatedById: actor.id }
    });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "DELETE",
      entityType: "User",
      entityId: userId,
      summary: `Deleted user account`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    this.authService.clearProfileCache(userId);
    return { data: { id: userId } };
  }

  async updateUserStatus(actor: AuthenticatedUser, userId: string, dto: UpdateUserStatusDto, context: RequestContext) {
    const existing = await this.getCompanyUser(actor.companyId, userId);
    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: { status: dto.status, updatedById: actor.id },
      select: { id: true, email: true, fullName: true, status: true }
    });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: dto.status === UserStatus.ACTIVE ? "ACTIVATE" : "DEACTIVATE",
      entityType: "User",
      entityId: user.id,
      summary: `Set user ${user.email} status to ${dto.status}`,
      metadata: { previousStatus: existing.status, nextStatus: dto.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    this.authService.clearProfileCache(userId);
    return { data: user };
  }

  async assignUserRoles(actor: AuthenticatedUser, userId: string, dto: AssignUserRolesDto, context: RequestContext) {
    await this.getCompanyUser(actor.companyId, userId);
    await this.assertActorCanAssignRoles(actor, dto.roleIds);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId, companyId: actor.companyId } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId, roleId, companyId: actor.companyId })),
        skipDuplicates: true
      })
    ]);

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "ASSIGN_ROLE",
      entityType: "User",
      entityId: userId,
      summary: "Assigned roles to user",
      metadata: { roleIds: dto.roleIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    this.authService.clearProfileCache(userId);
    return this.getUserDetail(actor.companyId, userId);
  }

  async resetUserPassword(actor: AuthenticatedUser, userId: string, dto: ResetUserPasswordDto, context: RequestContext) {
    if (actor.id === userId) throw new ForbiddenException("Use /auth/change-password to update your own password.");
    await this.getCompanyUser(actor.companyId, userId);

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, passwordChangedAt: new Date(), updatedById: actor.id }
    });

    // Revoke all active sessions so the user must log in with the new password
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    this.authService.clearProfileCache(userId);

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      summary: "Admin reset user password",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: { success: true } };
  }

  async assignUserAccess(actor: AuthenticatedUser, userId: string, dto: AssignUserAccessDto, context: RequestContext) {
    await this.getCompanyUser(actor.companyId, userId);
    const access = {
      branchIds: dto.branchIds ?? [],
      farmIds: dto.farmIds ?? [],
      warehouseIds: dto.warehouseIds ?? [],
      productionSiteIds: dto.productionSiteIds ?? []
    };
    await this.assertScopeIdsBelongToCompany(actor.companyId, access);
    this.assertActorHasScopeAccess(actor, access);

    await this.prisma.$transaction([
      this.prisma.userBranchAccess.deleteMany({ where: { userId, companyId: actor.companyId } }),
      this.prisma.userFarmAccess.deleteMany({ where: { userId, companyId: actor.companyId } }),
      this.prisma.userWarehouseAccess.deleteMany({ where: { userId, companyId: actor.companyId } }),
      this.prisma.userProductionSiteAccess.deleteMany({ where: { userId, companyId: actor.companyId } }),
      this.prisma.userBranchAccess.createMany({
        data: access.branchIds.map((branchId) => ({ userId, branchId, companyId: actor.companyId })),
        skipDuplicates: true
      }),
      this.prisma.userFarmAccess.createMany({
        data: access.farmIds.map((farmId) => ({ userId, farmId, companyId: actor.companyId })),
        skipDuplicates: true
      }),
      this.prisma.userWarehouseAccess.createMany({
        data: access.warehouseIds.map((warehouseId) => ({ userId, warehouseId, companyId: actor.companyId })),
        skipDuplicates: true
      }),
      this.prisma.userProductionSiteAccess.createMany({
        data: access.productionSiteIds.map((productionSiteId) => ({ userId, productionSiteId, companyId: actor.companyId })),
        skipDuplicates: true
      })
    ]);

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "ASSIGN_ACCESS",
      entityType: "User",
      entityId: userId,
      summary: "Assigned organization access scopes to user",
      metadata: access,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    this.authService.clearProfileCache(userId);
    return this.getUserDetail(actor.companyId, userId);
  }

  async listRoles(companyId: string) {
    const data = await this.prisma.role.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        level: true,
        description: true,
        isSystem: true,
        permissions: { select: { id: true, key: true, module: true } }
      },
      orderBy: { name: "asc" }
    });
    return { data };
  }

  async createRole(actor: AuthenticatedUser, dto: CreateRoleDto, context: RequestContext) {
    await this.assertActorCanGrantPermissions(actor, dto.permissionIds);
    const role = await this.prisma.role.create({
      data: {
        companyId: actor.companyId,
        name: dto.name,
        description: dto.description,
        permissions: {
          connect: dto.permissionIds.map((permissionId) => ({ id: permissionId }))
        }
      },
      include: { permissions: true }
    });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "CHANGE_PERMISSION",
      entityType: "Role",
      entityId: role.id,
      summary: `Created role ${role.name}`,
      metadata: { permissionIds: dto.permissionIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: role };
  }

  // isSystem roles (Super Admin, CEO, Manager, ... — seeded once per company
  // by setup.service.ts) are the platform's own baseline RBAC, not a
  // company's custom role. Letting anyone rename/re-permission/delete one
  // could silently strip access from every user holding it, with no way to
  // tell it apart from an intentional custom-role edit in the audit log.
  private assertRoleIsEditable(role: { isSystem: boolean; name: string }) {
    if (role.isSystem) {
      throw new BadRequestException(`"${role.name}" is a built-in system role and cannot be edited or deleted.`);
    }
  }

  async updateRole(actor: AuthenticatedUser, id: string, dto: UpdateRoleDto, context: RequestContext) {
    const existing = await this.prisma.role.findFirst({ where: { id, companyId: actor.companyId, deletedAt: null } });
    if (!existing) throw new NotFoundException("Role was not found.");
    this.assertRoleIsEditable(existing);

    if (dto.permissionIds) await this.assertActorCanGrantPermissions(actor, dto.permissionIds);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        updatedById: actor.id,
        ...(dto.permissionIds ? { permissions: { set: dto.permissionIds.map((permissionId) => ({ id: permissionId })) } } : {})
      },
      include: { permissions: true }
    });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "CHANGE_PERMISSION",
      entityType: "Role",
      entityId: role.id,
      summary: `Updated role ${role.name}`,
      metadata: dto.permissionIds ? { permissionIds: dto.permissionIds } : undefined,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: role };
  }

  async deleteRole(actor: AuthenticatedUser, id: string, context: RequestContext) {
    const existing = await this.prisma.role.findFirst({ where: { id, companyId: actor.companyId, deletedAt: null } });
    if (!existing) throw new NotFoundException("Role was not found.");
    this.assertRoleIsEditable(existing);

    const assignedUsers = await this.prisma.userRole.count({ where: { roleId: id, companyId: actor.companyId } });
    if (assignedUsers > 0) {
      throw new BadRequestException(`Cannot delete role "${existing.name}" — ${assignedUsers} user(s) are still assigned to it. Reassign them first.`);
    }

    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id } });

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "DELETE",
      entityType: "Role",
      entityId: id,
      summary: `Deleted role ${existing.name}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: { ok: true } };
  }

  async listPermissions(companyId: string) {
    const data = await this.prisma.permission.findMany({
      where: { companyId },
      orderBy: [{ module: "asc" }, { key: "asc" }]
    });
    return { data };
  }

  // Verifies the roles exist in this company AND that the actor isn't
  // granting a role more privileged than their own highest role — without
  // this, any identity.manage holder (a normal, non-Super-Admin permission)
  // could look up the Super Admin role's id via GET /identity/roles and
  // assign it to themselves or anyone else.
  private async assertActorCanAssignRoles(actor: AuthenticatedUser, roleIds: string[]) {
    const roles = await this.prisma.role.findMany({
      where: { companyId: actor.companyId, id: { in: roleIds }, deletedAt: null },
      select: { id: true, level: true }
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException("One or more roles are invalid for this Company.");
    }
    if (actor.hasGlobalAccess) return;

    const actorRank = actorHighestRank(actor);
    const tooPrivileged = roles.some((role) => (ROLE_LEVEL_RANK[role.level] ?? LEAST_PRIVILEGED_RANK) < actorRank);
    if (tooPrivileged) {
      throw new ForbiddenException("You cannot assign a role more privileged than your own.");
    }
  }

  // Same idea as assertActorCanAssignRoles: identity.manage alone shouldn't
  // let someone bundle permissions they don't personally hold into a new
  // role (which would otherwise sidestep the role-level check entirely,
  // since a freshly created role always defaults to OFFICER level).
  private async assertActorCanGrantPermissions(actor: AuthenticatedUser, permissionIds: string[]) {
    const permissions = await this.prisma.permission.findMany({
      where: { companyId: actor.companyId, id: { in: permissionIds } },
      select: { id: true, key: true }
    });
    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException("One or more permissions are invalid for this Company.");
    }
    if (actor.hasGlobalAccess) return;

    const actorPermissions = new Set(actor.permissions);
    const ungranted = permissions.filter((permission) => !actorPermissions.has(permission.key));
    if (ungranted.length > 0) {
      throw new ForbiddenException(
        `You cannot grant permissions you don't hold yourself: ${ungranted.map((p) => p.key).join(", ")}`
      );
    }
  }

  // Prevents an identity.manage holder from granting another user access to
  // branches/farms/warehouses/sites beyond their own assigned scope.
  private assertActorHasScopeAccess(
    actor: AuthenticatedUser,
    access: { branchIds: string[]; farmIds: string[]; warehouseIds: string[]; productionSiteIds: string[] }
  ) {
    if (actor.hasGlobalAccess) return;

    // (readiness review 2026-08-20) An empty actor.*Ids array means "not
    // restricted to specific ones" everywhere else this convention is used
    // (platform.service.ts's branchWhere/farmWhere/etc., hr.service.ts's
    // employeeScope) — but this check used to treat the actor's own empty
    // array as "has access to nothing", since `[].includes(id)` is always
    // false. An identity-manager whose own account was never assigned
    // farms/branches (this Access editor's own motivating use case) could
    // then never grant ANY scope — every selection was rejected as "out of
    // scope you don't have yourself." Only compare dimensions where the
    // actor actually has a restriction to enforce.
    const outOfScope = [
      ...(actor.branchIds.length ? access.branchIds.filter((id) => !actor.branchIds.includes(id)) : []),
      ...(actor.farmIds.length ? access.farmIds.filter((id) => !actor.farmIds.includes(id)) : []),
      ...(actor.warehouseIds.length ? access.warehouseIds.filter((id) => !actor.warehouseIds.includes(id)) : []),
      ...(actor.productionSiteIds.length ? access.productionSiteIds.filter((id) => !actor.productionSiteIds.includes(id)) : [])
    ];
    if (outOfScope.length > 0) {
      throw new ForbiddenException("You cannot grant access to a scope you don't have access to yourself.");
    }
  }

  private async getCompanyUser(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: { id: true, status: true, email: true }
    });

    if (!user) {
      throw new NotFoundException("User was not found.");
    }

    return user;
  }

  private async getUserDetail(companyId: string, userId: string) {
    const data = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, companyId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        branchAccesses: { select: { branch: { select: { id: true, name: true, code: true } } } },
        farmAccesses: { select: { farm: { select: { id: true, name: true, code: true } } } },
        warehouseAccesses: { select: { warehouse: { select: { id: true, name: true, code: true } } } },
        productionSiteAccess: { select: { productionSite: { select: { id: true, name: true, code: true } } } }
      }
    });

    return { data };
  }

  private normalizeIds(ids: string[] | undefined, primaryId?: string) {
    return Array.from(new Set([...(ids ?? []), ...(primaryId ? [primaryId] : [])]));
  }

  private async assertScopeIdsBelongToCompany(
    companyId: string,
    access: { branchIds: string[]; farmIds: string[]; warehouseIds: string[]; productionSiteIds: string[] }
  ) {
    const [branches, farms, warehouses, productionSites] = await Promise.all([
      this.prisma.branch.count({ where: { companyId, id: { in: access.branchIds }, deletedAt: null } }),
      this.prisma.farm.count({ where: { companyId, id: { in: access.farmIds }, deletedAt: null } }),
      this.prisma.warehouse.count({ where: { companyId, id: { in: access.warehouseIds }, deletedAt: null } }),
      this.prisma.productionSite.count({ where: { companyId, id: { in: access.productionSiteIds }, deletedAt: null } })
    ]);

    if (
      branches !== access.branchIds.length ||
      farms !== access.farmIds.length ||
      warehouses !== access.warehouseIds.length ||
      productionSites !== access.productionSiteIds.length
    ) {
      throw new BadRequestException("One or more access scopes are invalid for this Company.");
    }
  }
}

