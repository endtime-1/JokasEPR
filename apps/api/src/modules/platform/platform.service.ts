import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { CreateFarmDto } from "./dto/create-farm.dto";
import { CreateProductionSiteDto } from "./dto/create-production-site.dto";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";

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

