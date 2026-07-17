import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssignUserAccessDto } from "./dto/assign-user-access.dto";
import { AssignUserRolesDto } from "./dto/assign-user-roles.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async listUsers(companyId: string) {
    const data = await this.prisma.user.findMany({
      where: { companyId, deletedAt: null },
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
      orderBy: { fullName: "asc" }
    });
    return { data };
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto, context: RequestContext) {
    await this.assertRoleIdsBelongToCompany(actor.companyId, dto.roleIds);
    await this.assertScopeIdsBelongToCompany(actor.companyId, {
      branchIds: this.normalizeIds(dto.branchIds, dto.branchId),
      farmIds: this.normalizeIds(dto.farmIds, dto.farmId),
      warehouseIds: this.normalizeIds(dto.warehouseIds, dto.warehouseId),
      productionSiteIds: this.normalizeIds(dto.productionSiteIds, dto.productionSiteId)
    });
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const access = {
      branchIds: this.normalizeIds(dto.branchIds, dto.branchId),
      farmIds: this.normalizeIds(dto.farmIds, dto.farmId),
      warehouseIds: this.normalizeIds(dto.warehouseIds, dto.warehouseId),
      productionSiteIds: this.normalizeIds(dto.productionSiteIds, dto.productionSiteId)
    };

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

    return { data: user };
  }

  async assignUserRoles(actor: AuthenticatedUser, userId: string, dto: AssignUserRolesDto, context: RequestContext) {
    await this.getCompanyUser(actor.companyId, userId);
    await this.assertRoleIdsBelongToCompany(actor.companyId, dto.roleIds);

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

    return this.getUserDetail(actor.companyId, userId);
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

    return this.getUserDetail(actor.companyId, userId);
  }

  async listRoles(companyId: string) {
    const data = await this.prisma.role.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, level: true, description: true, isSystem: true },
      orderBy: { name: "asc" }
    });
    return { data };
  }

  async createRole(actor: AuthenticatedUser, dto: CreateRoleDto, context: RequestContext) {
    await this.assertPermissionIdsBelongToCompany(actor.companyId, dto.permissionIds);
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

  async listPermissions(companyId: string) {
    const data = await this.prisma.permission.findMany({
      where: { companyId },
      orderBy: [{ module: "asc" }, { key: "asc" }]
    });
    return { data };
  }

  private async assertRoleIdsBelongToCompany(companyId: string, roleIds: string[]) {
    const count = await this.prisma.role.count({
      where: { companyId, id: { in: roleIds }, deletedAt: null }
    });
    if (count !== roleIds.length) {
      throw new BadRequestException("One or more roles are invalid for this Company.");
    }
  }

  private async assertPermissionIdsBelongToCompany(companyId: string, permissionIds: string[]) {
    const count = await this.prisma.permission.count({
      where: { companyId, id: { in: permissionIds } }
    });
    if (count !== permissionIds.length) {
      throw new BadRequestException("One or more permissions are invalid for this Company.");
    }
  }

  private async getCompanyUser(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: { id: true, status: true }
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

