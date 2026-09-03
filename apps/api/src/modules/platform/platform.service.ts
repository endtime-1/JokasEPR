import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser, requiredParentForWarehouseType } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { CreateFarmDto } from "./dto/create-farm.dto";
import { CreateProductionSiteDto } from "./dto/create-production-site.dto";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";
import { UpdateFarmDto } from "./dto/update-farm.dto";
import { UpdateProductionSiteDto } from "./dto/update-production-site.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async summary(user: AuthenticatedUser) {
    const [branches, farms, productionSites, warehouses, users] = await Promise.all([
      this.prisma.branch.count({ where: this.branchWhere(user) }),
      this.prisma.farm.count({ where: this.farmWhere(user) }),
      this.prisma.productionSite.count({ where: this.productionSiteWhere(user) }),
      this.prisma.warehouse.count({ where: this.warehouseWhere(user) }),
      this.prisma.user.count({ where: { companyId: user.companyId, deletedAt: null } })
    ]);

    return { data: { branches, farms, productionSites, warehouses, users } };
  }

  async listBranches(user: AuthenticatedUser) {
    const data = await this.prisma.branch.findMany({
      where: this.branchWhere(user),
      orderBy: { name: "asc" }
    });
    return { data };
  }

  async createBranch(user: AuthenticatedUser, dto: CreateBranchDto, context: RequestContext) {
    const branch = await this.prisma.branch.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        city: dto.city,
        country: dto.country ?? "Ghana",
        isHeadOffice: dto.isHeadOffice ?? false
      }
    });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "Branch",
      entityId: branch.id,
      summary: `Created branch ${branch.code}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return { data: branch };
  }

  async updateBranch(user: AuthenticatedUser, branchId: string, dto: UpdateBranchDto, context: RequestContext) {
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Branch not found.");
    // create* endpoints already scope-check via @RequireScopeAccess — update/delete
    // didn't, letting any PLATFORM_MANAGE holder (e.g. a branch-scoped General
    // Manager) modify or remove branches/farms/sites/warehouses outside their
    // own assignment. Mirrors the same assertAssigned() check createFarm etc. use.
    this.assertAssigned(user, existing.id, user.branchIds, "branch");
    const branch = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.isHeadOffice !== undefined && { isHeadOffice: dto.isHeadOffice })
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Branch", entityId: branch.id, summary: `Updated branch ${branch.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: branch };
  }

  async deleteBranch(user: AuthenticatedUser, branchId: string, context: RequestContext) {
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Branch not found.");
    this.assertAssigned(user, existing.id, user.branchIds, "branch");
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a branch and recreating one with the same
    // code fails the create with a unique-constraint error.
    await this.prisma.branch.update({ where: { id: branchId }, data: { code: `${existing.code}__deleted_${branchId}`, deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Branch", entityId: branchId, summary: `Deleted branch ${existing.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: { id: branchId } };
  }

  async listFarms(user: AuthenticatedUser) {
    const data = await this.prisma.farm.findMany({
      where: this.farmWhere(user),
      include: { branch: true },
      orderBy: { name: "asc" }
    });
    return { data };
  }

  async createFarm(user: AuthenticatedUser, dto: CreateFarmDto, context: RequestContext) {
    const branchId = dto.branchId ?? (await this.getDefaultBranchId(user));
    this.assertAssigned(user, branchId, user.branchIds, "branch");
    const farm = await this.prisma.farm.create({
      data: {
        companyId: user.companyId,
        branchId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        location: dto.location,
        type: dto.type ?? "POULTRY"
      }
    });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "Farm",
      entityId: farm.id,
      summary: `Created farm ${farm.code}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return { data: farm };
  }

  async updateFarm(user: AuthenticatedUser, farmId: string, dto: UpdateFarmDto, context: RequestContext) {
    const existing = await this.prisma.farm.findFirst({
      where: { id: farmId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Farm not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    const farm = await this.prisma.farm.update({
      where: { id: farmId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.type !== undefined && { type: dto.type })
      } as any
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Farm", entityId: farm.id, summary: `Updated farm ${farm.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: farm };
  }

  async deleteFarm(user: AuthenticatedUser, farmId: string, context: RequestContext) {
    const existing = await this.prisma.farm.findFirst({
      where: { id: farmId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Farm not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a farm and recreating one with the same code
    // fails the create with a unique-constraint error.
    await this.prisma.farm.update({ where: { id: farmId }, data: { code: `${existing.code}__deleted_${farmId}`, deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Farm", entityId: farmId, summary: `Deleted farm ${existing.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: { id: farmId } };
  }

  async listProductionSites(user: AuthenticatedUser) {
    const data = await this.prisma.productionSite.findMany({
      where: this.productionSiteWhere(user),
      include: { branch: true },
      orderBy: { name: "asc" }
    });
    return { data };
  }

  async createProductionSite(user: AuthenticatedUser, dto: CreateProductionSiteDto, context: RequestContext) {
    const branchId = dto.branchId ?? (await this.getDefaultBranchId(user));
    this.assertAssigned(user, branchId, user.branchIds, "branch");
    const site = await this.prisma.productionSite.create({
      data: {
        companyId: user.companyId,
        branchId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        type: dto.type,
        location: dto.location
      }
    });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "ProductionSite",
      entityId: site.id,
      summary: `Created production site ${site.code}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return { data: site };
  }

  async updateProductionSite(user: AuthenticatedUser, siteId: string, dto: UpdateProductionSiteDto, context: RequestContext) {
    const existing = await this.prisma.productionSite.findFirst({
      where: { id: siteId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Production site not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    // Also check the *new* branch if this update re-parents the site — otherwise
    // a user could move a site they can edit into a branch they can't touch.
    if (dto.branchId !== undefined) this.assertAssigned(user, dto.branchId, user.branchIds, "branch");
    const site = await this.prisma.productionSite.update({
      where: { id: siteId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId })
      } as any
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ProductionSite", entityId: site.id, summary: `Updated production site ${site.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: site };
  }

  async deleteProductionSite(user: AuthenticatedUser, siteId: string, context: RequestContext) {
    const existing = await this.prisma.productionSite.findFirst({
      where: { id: siteId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Production site not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a production site and recreating one with the
    // same code fails the create with a unique-constraint error.
    await this.prisma.productionSite.update({ where: { id: siteId }, data: { code: `${existing.code}__deleted_${siteId}`, deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "ProductionSite", entityId: siteId, summary: `Deleted production site ${existing.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: { id: siteId } };
  }

  async listWarehouses(user: AuthenticatedUser) {
    const data = await this.prisma.warehouse.findMany({
      where: this.warehouseWhere(user),
      include: { branch: true },
      orderBy: { name: "asc" }
    });
    return { data };
  }

  private assertWarehouseParentForType(type: string, farmId?: string | null, productionSiteId?: string | null) {
    const need = requiredParentForWarehouseType(type);
    if (need === "productionSite" && !productionSiteId) {
      throw new BadRequestException("A Soya Store must be linked to a production site.");
    }
    if (need === "farmOrProductionSite" && !farmId && !productionSiteId) {
      throw new BadRequestException("A Feed Store must be linked to a farm or a production site.");
    }
    if (need === "farm" && !farmId) {
      throw new BadRequestException("An Egg Store or Farm Store must be linked to a farm.");
    }
  }

  async createWarehouse(user: AuthenticatedUser, dto: CreateWarehouseDto, context: RequestContext) {
    const branchId = dto.branchId ?? (await this.getDefaultBranchId(user));
    this.assertAssigned(user, branchId, user.branchIds, "branch");
    this.assertAssigned(user, dto.farmId, user.farmIds, "farm");
    this.assertAssigned(user, dto.productionSiteId, user.productionSiteIds, "production site");
    this.assertWarehouseParentForType(dto.type ?? "GENERAL", dto.farmId, dto.productionSiteId);
    const warehouse = await this.prisma.warehouse.create({
      data: {
        companyId: user.companyId,
        branchId,
        farmId: dto.farmId,
        productionSiteId: dto.productionSiteId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        location: dto.location,
        type: dto.type ?? "GENERAL"
      }
    });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "Warehouse",
      entityId: warehouse.id,
      summary: `Created warehouse ${warehouse.code}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
    return { data: warehouse };
  }

  async updateWarehouse(user: AuthenticatedUser, warehouseId: string, dto: UpdateWarehouseDto, context: RequestContext) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Warehouse not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    this.assertAssigned(user, existing.farmId ?? undefined, user.farmIds, "farm");
    this.assertAssigned(user, existing.productionSiteId ?? undefined, user.productionSiteIds, "production site");
    if (dto.branchId !== undefined) this.assertAssigned(user, dto.branchId, user.branchIds, "branch");
    if (dto.farmId !== undefined) this.assertAssigned(user, dto.farmId, user.farmIds, "farm");
    if (dto.productionSiteId !== undefined) this.assertAssigned(user, dto.productionSiteId, user.productionSiteIds, "production site");
    this.assertWarehouseParentForType(
      dto.type ?? existing.type,
      dto.farmId !== undefined ? dto.farmId : existing.farmId,
      dto.productionSiteId !== undefined ? dto.productionSiteId : existing.productionSiteId,
    );
    const warehouse = await this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.farmId !== undefined && { farmId: dto.farmId }),
        ...(dto.productionSiteId !== undefined && { productionSiteId: dto.productionSiteId })
      } as any
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Warehouse", entityId: warehouse.id, summary: `Updated warehouse ${warehouse.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: warehouse };
  }

  async deleteWarehouse(user: AuthenticatedUser, warehouseId: string, context: RequestContext) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Warehouse not found.");
    this.assertAssigned(user, existing.branchId, user.branchIds, "branch");
    this.assertAssigned(user, existing.farmId ?? undefined, user.farmIds, "farm");
    this.assertAssigned(user, existing.productionSiteId ?? undefined, user.productionSiteIds, "production site");
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a warehouse and recreating one with the same
    // code fails the create with a unique-constraint error.
    await this.prisma.warehouse.update({ where: { id: warehouseId }, data: { code: `${existing.code}__deleted_${warehouseId}`, deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Warehouse", entityId: warehouseId, summary: `Deleted warehouse ${existing.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: { id: warehouseId } };
  }

  private async getDefaultBranchId(user: AuthenticatedUser) {
    const branch = await this.prisma.branch.findFirst({
      where: this.branchWhere(user),
      orderBy: [{ isHeadOffice: "desc" }, { createdAt: "asc" }],
      select: { id: true }
    });

    if (!branch) {
      throw new BadRequestException("Create a branch before creating farms, production sites, or warehouses.");
    }

    return branch.id;
  }

  private branchWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess || user.branchIds.length === 0 ? {} : { id: { in: user.branchIds } })
    };
  }

  private farmWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { id: { in: user.farmIds } })
    };
  }

  private warehouseWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } })
    };
  }

  private productionSiteWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { id: { in: user.productionSiteIds } })
    };
  }

  private assertAssigned(user: AuthenticatedUser, id: string | undefined, allowedIds: string[], label: string) {
    if (!id || user.hasGlobalAccess) {
      return;
    }

    if (!allowedIds.includes(id)) {
      throw new ForbiddenException(`You do not have access to this ${label}.`);
    }
  }
}

