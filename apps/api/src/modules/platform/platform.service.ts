import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
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
    await this.prisma.branch.update({ where: { id: branchId }, data: { deletedAt: new Date() } });
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
    const farm = await this.prisma.farm.update({
      where: { id: farmId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.type !== undefined && { type: dto.type })
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Farm", entityId: farm.id, summary: `Updated farm ${farm.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: farm };
  }

  async deleteFarm(user: AuthenticatedUser, farmId: string, context: RequestContext) {
    const existing = await this.prisma.farm.findFirst({
      where: { id: farmId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Farm not found.");
    await this.prisma.farm.update({ where: { id: farmId }, data: { deletedAt: new Date() } });
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
    const site = await this.prisma.productionSite.update({
      where: { id: siteId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId })
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ProductionSite", entityId: site.id, summary: `Updated production site ${site.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: site };
  }

  async deleteProductionSite(user: AuthenticatedUser, siteId: string, context: RequestContext) {
    const existing = await this.prisma.productionSite.findFirst({
      where: { id: siteId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Production site not found.");
    await this.prisma.productionSite.update({ where: { id: siteId }, data: { deletedAt: new Date() } });
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

  async createWarehouse(user: AuthenticatedUser, dto: CreateWarehouseDto, context: RequestContext) {
    const branchId = dto.branchId ?? (await this.getDefaultBranchId(user));
    this.assertAssigned(user, branchId, user.branchIds, "branch");
    this.assertAssigned(user, dto.farmId, user.farmIds, "farm");
    this.assertAssigned(user, dto.productionSiteId, user.productionSiteIds, "production site");
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
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Warehouse", entityId: warehouse.id, summary: `Updated warehouse ${warehouse.code}`, ipAddress: context.ipAddress, userAgent: context.userAgent });
    return { data: warehouse };
  }

  async deleteWarehouse(user: AuthenticatedUser, warehouseId: string, context: RequestContext) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId: user.companyId, deletedAt: null }
    });
    if (!existing) throw new NotFoundException("Warehouse not found.");
    await this.prisma.warehouse.update({ where: { id: warehouseId }, data: { deletedAt: new Date() } });
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
      ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } })
    };
  }

  private farmWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } })
    };
  }

  private warehouseWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } })
    };
  }

  private productionSiteWhere(user: AuthenticatedUser) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } })
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

