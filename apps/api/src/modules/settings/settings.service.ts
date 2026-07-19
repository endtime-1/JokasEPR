import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AiSettingsDto,
  BackupSettingsDto,
  CreateBranchSettingDto,
  CreateDepartmentSettingDto,
  CreateExpenseCategorySettingDto,
  CreateFarmSettingDto,
  CreateProductCategorySettingDto,
  CreateProductionSiteSettingDto,
  CreateProductDto,
  CreateUnitOfMeasureSettingDto,
  CreateWarehouseSettingDto,
  DomainListSettingsDto,
  NumberingSettingsDto,
  PoultryPricingSettingsDto,
  ProductListQueryDto,
  TaxSettingsDto,
  UpdateCompanyProfileDto,
  UpdateProductDto,
  UserAccessSettingsDto
} from "./dto/settings.dto";
import { ProductStatus, ProductType } from "@prisma/client";
import { UpdateNotificationConfigDto } from "../notifications/dto/notifications.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

const DEFAULT_SETTINGS: Record<string, unknown> = {
  "company.logo": { logoUrl: "" },
  "poultry.types": { values: ["LAYERS", "BROILERS", "COCKERELS", "BREEDERS", "CHICKS"] },
  "poultry.pricing": { eggPricePerUnit: 1.2, broilerPricePerKg: 35 },
  "feed.types": { values: ["CHICK_MASH", "GROWER_MASH", "LAYER_MASH", "BROILER_STARTER", "BROILER_FINISHER", "BREEDER_FEED", "CONCENTRATE", "CUSTOM_FEED", "BROILER_STARTER_MASH", "BROILER_STARTER_CONCENTRATE", "BROILER_FINISHER_MASH", "BROILER_FINISHER_CONCENTRATE", "SUPER_CHICKS_CONCENTRATE", "SUPER_CHICKS_MASH", "CHICKS_STARTER_MASH", "CHICKS_STARTER_CONCENTRATE", "DEVELOPER_MASH", "DEVELOPER_CONCENTRATE", "PRE_LAY_MASH", "PRE_LAY_CONCENTRATE", "LAYER_1_MASH", "LAYER_1_CONCENTRATE", "LAYER_2_MASH", "LAYER_2_CONCENTRATE"] },
  "tax.settings": { enabled: false, taxName: "VAT", ratePercent: 0, taxIdLabel: "Tax ID" },
  "numbering.settings": {
    invoice: { prefix: "INV", includeYear: true, padding: 4, nextNumber: 1 },
    productionBatch: { prefix: "BATCH", includeYear: true, padding: 4, nextNumber: 1 },
    stockMovement: { prefix: "STK", includeYear: true, padding: 5, nextNumber: 1 }
  },
  "ai.settings": { enabled: true, defaultModel: "claude-sonnet-4-5", allowedModels: ["claude-sonnet-4-5"], monthlyBudgetLimit: 0, allowOperationalRecommendations: true },
  "backup.settings": { enabled: true, frequency: "daily", retentionDays: "30", storageTarget: "local" },
  "user-access.settings": {
    enforceBranchScope: true,
    enforceFarmScope: true,
    enforceWarehouseScope: true,
    enforceProductionSiteScope: true,
    requireMfaForAdmins: false
  }
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private requireSettings(user: AuthenticatedUser) {
    if (!user.permissions.includes("settings.manage") && !user.hasGlobalAccess) {
      throw new ForbiddenException("Settings management permission is required.");
    }
  }

  async overview(user: AuthenticatedUser) {
    this.requireSettings(user);
    const [company, branches, farms, warehouses, productionSites, departments, uoms, productCategories, expenseCategories, notificationConfig, settings] = await Promise.all([
      this.company(user),
      this.prisma.branch.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.farm.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.warehouse.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.productionSite.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.department.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.unitOfMeasure.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.productCategory.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.prisma.expenseCategory.count({ where: { companyId: user.companyId, deletedAt: null } }),
      this.notificationConfig(user),
      this.settingsMap(user)
    ]);
    return {
      data: {
        company: company.data,
        counts: { branches, farms, warehouses, productionSites, departments, unitsOfMeasure: uoms, productCategories, expenseCategories },
        settings,
        notificationConfig: notificationConfig.data
      }
    };
  }

  async company(user: AuthenticatedUser) {
    this.requireSettings(user);
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    const logo = await this.getSetting(user.companyId, "company.logo");
    return { data: { ...company, logoUrl: (logo as any)?.logoUrl ?? "" } };
  }

  async updateCompany(user: AuthenticatedUser, dto: UpdateCompanyProfileDto, ctx: RequestContext) {
    this.requireSettings(user);
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        timezone: dto.timezone ?? "Africa/Accra",
        updatedById: user.id
      }
    });
    await this.setSetting(user, "company.logo", { logoUrl: dto.logoUrl ?? "" }, ctx, "Updated company logo setting");
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Company", entityId: company.id, summary: `Updated company profile ${company.name}`, ...ctx });
    return this.company(user);
  }

  async masterData(user: AuthenticatedUser) {
    this.requireSettings(user);
    const [branches, farms, warehouses, productionSites, departments, unitsOfMeasure, productCategories, expenseCategories] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { branch: { select: { name: true, code: true } } }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { branch: { select: { name: true, code: true } } }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { branch: { select: { name: true, code: true } } }, orderBy: { name: "asc" } }),
      this.prisma.department.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { branch: { select: { name: true, code: true } } }, orderBy: { name: "asc" } }),
      this.prisma.unitOfMeasure.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } }),
      this.prisma.productCategory.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } }),
      this.prisma.expenseCategory.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } })
    ]);
    return { data: { branches, farms, warehouses, productionSites, departments, unitsOfMeasure, productCategories, expenseCategories } };
  }

  async options(user: AuthenticatedUser) {
    this.requireSettings(user);
    const [branches, farms, productionSites, warehouses, productCategories, accounts] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.productCategory.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.account.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } })
    ]);
    return { data: { branches, farms, productionSites, warehouses, productCategories, accounts } };
  }

  async createBranch(user: AuthenticatedUser, dto: CreateBranchSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.branch.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.branch.update({ where: { id: softDeleted.id }, data: { name: dto.name, code, city: dto.city ?? null, country: dto.country ?? "Ghana", isHeadOffice: dto.isHeadOffice ?? false, deletedAt: null, updatedById: user.id } })
      : await this.prisma.branch.create({ data: { companyId: user.companyId, name: dto.name, code, city: dto.city, country: dto.country ?? "Ghana", isHeadOffice: dto.isHeadOffice ?? false, createdById: user.id } });
    await this.auditCreate(user, "Branch", row.id, `Created branch ${row.code}`, ctx);
    return { data: row };
  }

  async createFarm(user: AuthenticatedUser, dto: CreateFarmSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    await this.requireBranch(user.companyId, dto.branchId);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.farm.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.farm.update({ where: { id: softDeleted.id }, data: { branchId: dto.branchId, name: dto.name, code, location: dto.location ?? null, type: dto.type ?? "POULTRY", deletedAt: null, updatedById: user.id } })
      : await this.prisma.farm.create({ data: { companyId: user.companyId, branchId: dto.branchId, name: dto.name, code, location: dto.location, type: dto.type ?? "POULTRY", createdById: user.id } });
    await this.auditCreate(user, "Farm", row.id, `Created farm ${row.code}`, ctx, { branchId: row.branchId });
    return { data: row };
  }

  async createWarehouse(user: AuthenticatedUser, dto: CreateWarehouseSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    await this.requireBranch(user.companyId, dto.branchId);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.warehouse.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.warehouse.update({ where: { id: softDeleted.id }, data: { branchId: dto.branchId, farmId: dto.farmId ?? null, productionSiteId: dto.productionSiteId ?? null, name: dto.name, code, location: dto.location ?? null, type: dto.type ?? "GENERAL", deletedAt: null, updatedById: user.id } })
      : await this.prisma.warehouse.create({ data: { companyId: user.companyId, branchId: dto.branchId, farmId: dto.farmId, productionSiteId: dto.productionSiteId, name: dto.name, code, location: dto.location, type: dto.type ?? "GENERAL", createdById: user.id } });
    await this.auditCreate(user, "Warehouse", row.id, `Created warehouse ${row.code}`, ctx, { branchId: row.branchId, warehouseId: row.id });
    return { data: row };
  }

  async createProductionSite(user: AuthenticatedUser, dto: CreateProductionSiteSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    await this.requireBranch(user.companyId, dto.branchId);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.productionSite.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.productionSite.update({ where: { id: softDeleted.id }, data: { branchId: dto.branchId, name: dto.name, code, type: dto.type, location: dto.location ?? null, deletedAt: null, updatedById: user.id } })
      : await this.prisma.productionSite.create({ data: { companyId: user.companyId, branchId: dto.branchId, name: dto.name, code, type: dto.type, location: dto.location, createdById: user.id } });
    await this.auditCreate(user, "ProductionSite", row.id, `Created production site ${row.code}`, ctx, { branchId: row.branchId, productionSiteId: row.id });
    return { data: row };
  }

  async createDepartment(user: AuthenticatedUser, dto: CreateDepartmentSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.department.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.department.update({ where: { id: softDeleted.id }, data: { branchId: dto.branchId, name: dto.name, code, deletedAt: null, updatedById: user.id } })
      : await this.prisma.department.create({ data: { companyId: user.companyId, branchId: dto.branchId, name: dto.name, code, createdById: user.id } });
    await this.auditCreate(user, "Department", row.id, `Created department ${row.code}`, ctx, { branchId: row.branchId ?? undefined });
    return { data: row };
  }

  async createUnitOfMeasure(user: AuthenticatedUser, dto: CreateUnitOfMeasureSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.unitOfMeasure.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.unitOfMeasure.update({ where: { id: softDeleted.id }, data: { name: dto.name, code, symbol: dto.symbol, deletedAt: null, updatedById: user.id } })
      : await this.prisma.unitOfMeasure.create({ data: { companyId: user.companyId, name: dto.name, code, symbol: dto.symbol, createdById: user.id } });
    await this.auditCreate(user, "UnitOfMeasure", row.id, `Created unit of measure ${row.code}`, ctx);
    return { data: row };
  }

  async createProductCategory(user: AuthenticatedUser, dto: CreateProductCategorySettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.productCategory.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.productCategory.update({ where: { id: softDeleted.id }, data: { name: dto.name, code, parentId: dto.parentId ?? null, description: dto.description ?? null, deletedAt: null, updatedById: user.id } })
      : await this.prisma.productCategory.create({ data: { companyId: user.companyId, name: dto.name, code, parentId: dto.parentId, description: dto.description, createdById: user.id } });
    await this.auditCreate(user, "ProductCategory", row.id, `Created product category ${row.code}`, ctx);
    return { data: row };
  }

  async createExpenseCategory(user: AuthenticatedUser, dto: CreateExpenseCategorySettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const code = dto.code.toUpperCase();
    const softDeleted = await this.prisma.expenseCategory.findFirst({ where: { companyId: user.companyId, code, deletedAt: { not: null } } });
    const row = softDeleted
      ? await this.prisma.expenseCategory.update({ where: { id: softDeleted.id }, data: { name: dto.name, code, description: dto.description ?? null, accountId: dto.accountId ?? null, deletedAt: null, updatedById: user.id } })
      : await this.prisma.expenseCategory.create({ data: { companyId: user.companyId, name: dto.name, code, description: dto.description, accountId: dto.accountId, createdById: user.id } });
    await this.auditCreate(user, "ExpenseCategory", row.id, `Created expense category ${row.code}`, ctx);
    return { data: row };
  }

  async updateBranch(user: AuthenticatedUser, id: string, dto: CreateBranchSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.branch.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Branch not found.");
    const row = await this.prisma.branch.update({ where: { id }, data: { name: dto.name, code: dto.code.toUpperCase(), city: dto.city ?? null, country: dto.country ?? "Ghana", isHeadOffice: dto.isHeadOffice ?? false, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Branch", entityId: row.id, summary: `Updated branch ${row.code}`, ...ctx });
    return { data: row };
  }

  async deleteBranch(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.branch.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Branch not found.");
    await this.prisma.branch.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Branch", entityId: id, summary: `Deleted branch ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateFarm(user: AuthenticatedUser, id: string, dto: CreateFarmSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.farm.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Farm not found.");
    await this.requireBranch(user.companyId, dto.branchId);
    const row = await this.prisma.farm.update({ where: { id }, data: { branchId: dto.branchId, name: dto.name, code: dto.code.toUpperCase(), location: dto.location ?? null, type: dto.type ?? "POULTRY", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Farm", entityId: row.id, summary: `Updated farm ${row.code}`, branchId: row.branchId, ...ctx });
    return { data: row };
  }

  async deleteFarm(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.farm.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Farm not found.");
    await this.prisma.farm.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Farm", entityId: id, summary: `Deleted farm ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateWarehouse(user: AuthenticatedUser, id: string, dto: CreateWarehouseSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.warehouse.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Warehouse not found.");
    await this.requireBranch(user.companyId, dto.branchId);
    const row = await this.prisma.warehouse.update({ where: { id }, data: { branchId: dto.branchId, farmId: dto.farmId ?? null, productionSiteId: dto.productionSiteId ?? null, name: dto.name, code: dto.code.toUpperCase(), location: dto.location ?? null, type: dto.type ?? "GENERAL", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Warehouse", entityId: row.id, summary: `Updated warehouse ${row.code}`, branchId: row.branchId, warehouseId: row.id, ...ctx });
    return { data: row };
  }

  async deleteWarehouse(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.warehouse.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Warehouse not found.");
    await this.prisma.warehouse.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Warehouse", entityId: id, summary: `Deleted warehouse ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateProductionSite(user: AuthenticatedUser, id: string, dto: CreateProductionSiteSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.productionSite.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Production site not found.");
    await this.requireBranch(user.companyId, dto.branchId);
    const row = await this.prisma.productionSite.update({ where: { id }, data: { branchId: dto.branchId, name: dto.name, code: dto.code.toUpperCase(), type: dto.type, location: dto.location ?? null, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ProductionSite", entityId: row.id, summary: `Updated production site ${row.code}`, branchId: row.branchId, productionSiteId: row.id, ...ctx });
    return { data: row };
  }

  async deleteProductionSite(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.productionSite.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Production site not found.");
    await this.prisma.productionSite.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "ProductionSite", entityId: id, summary: `Deleted production site ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateDepartment(user: AuthenticatedUser, id: string, dto: CreateDepartmentSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.department.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Department not found.");
    const row = await this.prisma.department.update({ where: { id }, data: { branchId: dto.branchId, name: dto.name, code: dto.code.toUpperCase(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Department", entityId: row.id, summary: `Updated department ${row.code}`, branchId: row.branchId ?? undefined, ...ctx });
    return { data: row };
  }

  async deleteDepartment(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.department.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Department not found.");
    await this.prisma.department.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Department", entityId: id, summary: `Deleted department ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateUnitOfMeasure(user: AuthenticatedUser, id: string, dto: CreateUnitOfMeasureSettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.unitOfMeasure.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Unit of measure not found.");
    const row = await this.prisma.unitOfMeasure.update({ where: { id }, data: { name: dto.name, code: dto.code.toUpperCase(), symbol: dto.symbol, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "UnitOfMeasure", entityId: row.id, summary: `Updated unit of measure ${row.code}`, ...ctx });
    return { data: row };
  }

  async deleteUnitOfMeasure(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.unitOfMeasure.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Unit of measure not found.");
    await this.prisma.unitOfMeasure.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "UnitOfMeasure", entityId: id, summary: `Deleted unit of measure ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateProductCategory(user: AuthenticatedUser, id: string, dto: CreateProductCategorySettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.productCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Product category not found.");
    const row = await this.prisma.productCategory.update({ where: { id }, data: { name: dto.name, code: dto.code.toUpperCase(), parentId: dto.parentId ?? null, description: dto.description ?? null, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ProductCategory", entityId: row.id, summary: `Updated product category ${row.code}`, ...ctx });
    return { data: row };
  }

  async deleteProductCategory(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.productCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Product category not found.");
    await this.prisma.productCategory.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "ProductCategory", entityId: id, summary: `Deleted product category ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async updateExpenseCategory(user: AuthenticatedUser, id: string, dto: CreateExpenseCategorySettingDto, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.expenseCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Expense category not found.");
    const row = await this.prisma.expenseCategory.update({ where: { id }, data: { name: dto.name, code: dto.code.toUpperCase(), description: dto.description ?? null, accountId: dto.accountId ?? null, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ExpenseCategory", entityId: row.id, summary: `Updated expense category ${row.code}`, ...ctx });
    return { data: row };
  }

  async deleteExpenseCategory(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const existing = await this.prisma.expenseCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!existing) throw new BadRequestException("Expense category not found.");
    await this.prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "ExpenseCategory", entityId: id, summary: `Deleted expense category ${existing.code}`, ...ctx });
    return { data: { success: true } };
  }

  async settingsMap(user: AuthenticatedUser) {
    this.requireSettings(user);
    const rows = await this.prisma.systemSetting.findMany({ where: { companyId: user.companyId, deletedAt: null } });
    const map: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      const def = DEFAULT_SETTINGS[row.key];
      if (def && typeof def === "object" && !Array.isArray(def) && row.value && typeof row.value === "object" && !Array.isArray(row.value)) {
        map[row.key] = { ...(def as object), ...(row.value as object) };
      } else {
        map[row.key] = row.value;
      }
    }
    return map;
  }

  async updateTax(user: AuthenticatedUser, dto: TaxSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "tax.settings", dto, ctx, "Updated tax settings");
  }

  async updateNumbering(user: AuthenticatedUser, dto: NumberingSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "numbering.settings", dto, ctx, "Updated document numbering settings");
  }

  async updateAi(user: AuthenticatedUser, dto: AiSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "ai.settings", dto, ctx, "Updated AI settings");
  }

  async updateBackup(user: AuthenticatedUser, dto: BackupSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "backup.settings", dto, ctx, "Updated backup settings");
  }

  async updateUserAccess(user: AuthenticatedUser, dto: UserAccessSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "user-access.settings", dto, ctx, "Updated user access settings");
  }

  async updatePoultryTypes(user: AuthenticatedUser, dto: DomainListSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "poultry.types", dto, ctx, "Updated poultry type settings");
  }

  async updateFeedTypes(user: AuthenticatedUser, dto: DomainListSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "feed.types", dto, ctx, "Updated feed type settings");
  }

  async updatePoultryPricing(user: AuthenticatedUser, dto: PoultryPricingSettingsDto, ctx: RequestContext) {
    return this.setSetting(user, "poultry.pricing", dto, ctx, "Updated poultry pricing settings");
  }

  async notificationConfig(user: AuthenticatedUser) {
    this.requireSettings(user);
    const config = await this.prisma.notificationConfig.findUnique({ where: { companyId: user.companyId } });
    return { data: config ?? { companyId: user.companyId, emailEnabled: false, smsEnabled: false, whatsappEnabled: false, emailFromAddress: null, emailFromName: null } };
  }

  async updateNotificationConfig(user: AuthenticatedUser, dto: UpdateNotificationConfigDto, ctx: RequestContext) {
    this.requireSettings(user);
    const config = await this.prisma.notificationConfig.upsert({
      where: { companyId: user.companyId },
      create: { companyId: user.companyId, ...dto },
      update: { ...dto }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "NotificationConfig", entityId: user.companyId, summary: "Updated notification settings", ...ctx });
    return { data: config };
  }

  private async getSetting(companyId: string, key: string) {
    const row = await this.prisma.systemSetting.findFirst({ where: { companyId, key, deletedAt: null } });
    return row?.value ?? DEFAULT_SETTINGS[key] ?? {};
  }

  private async setSetting(user: AuthenticatedUser, key: string, value: unknown, ctx: RequestContext, summary: string) {
    this.requireSettings(user);
    const existing = await this.prisma.systemSetting.findFirst({ where: { companyId: user.companyId, key, deletedAt: null } });
    const data = existing
      ? await this.prisma.systemSetting.update({ where: { id: existing.id }, data: { value: value as any, updatedById: user.id } })
      : await this.prisma.systemSetting.create({ data: { companyId: user.companyId, key, value: value as any, description: summary, createdById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "SystemSetting", entityId: data.id, summary, metadata: { key } as any, ...ctx });
    return { data };
  }

  private async requireBranch(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null } });
    if (!branch) throw new BadRequestException("Branch was not found.");
  }

  private async auditCreate(user: AuthenticatedUser, entityType: string, entityId: string, summary: string, ctx: RequestContext, scope: { branchId?: string; farmId?: string; warehouseId?: string; productionSiteId?: string } = {}) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType, entityId, summary, ...scope, ...ctx });
  }

  async listProducts(user: AuthenticatedUser, query: ProductListQueryDto) {
    this.requireSettings(user);
    const { type, status, categoryId, search, page = 1, limit = 50 } = query;
    const where: any = { companyId: user.companyId, deletedAt: null };
    if (type) where.type = type;
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.OR = [{ name: { contains: search } }, { sku: { contains: search } }, { description: { contains: search } }];
    const skip = (page - 1) * limit;
    const [items, total, counts] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true } },
          uom: { select: { id: true, name: true, symbol: true } }
        },
        orderBy: { name: "asc" },
        skip,
        take: limit
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.groupBy({
        by: ["type"],
        where: { companyId: user.companyId, deletedAt: null, status: ProductStatus.ACTIVE },
        _count: { id: true }
      })
    ]);
    const typeCounts: Record<string, number> = {};
    for (const c of counts) typeCounts[c.type] = c._count.id;
    return { data: { items, total, page, limit, pages: Math.ceil(total / limit), typeCounts } };
  }

  async createProduct(user: AuthenticatedUser, dto: CreateProductDto, ctx: RequestContext) {
    this.requireSettings(user);
    const row = await this.prisma.product.create({
      data: {
        companyId: user.companyId,
        branchId: dto.branchId,
        categoryId: dto.categoryId,
        uomId: dto.uomId,
        name: dto.name,
        sku: dto.sku.toUpperCase(),
        description: dto.description,
        type: dto.type,
        status: ProductStatus.ACTIVE,
        createdById: user.id
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
        uom: { select: { id: true, name: true, symbol: true } }
      }
    });
    await this.auditCreate(user, "Product", row.id, `Created product ${row.sku} — ${row.name}`, ctx);
    return { data: row };
  }

  async updateProduct(user: AuthenticatedUser, id: string, dto: UpdateProductDto, ctx: RequestContext) {
    this.requireSettings(user);
    const data: any = { updatedById: user.id };
    if (dto.name) data.name = dto.name;
    if (dto.sku) data.sku = dto.sku.toUpperCase();
    if (dto.type) data.type = dto.type;
    if (dto.uomId) data.uomId = dto.uomId;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId || null;
    if (dto.branchId !== undefined) data.branchId = dto.branchId || null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status) data.status = dto.status;
    const row = await this.prisma.product.update({
      where: { id, companyId: user.companyId },
      data,
      include: {
        category: { select: { id: true, name: true, code: true } },
        uom: { select: { id: true, name: true, symbol: true } }
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Product", entityId: row.id, summary: `Updated product ${row.sku}`, ...ctx });
    return { data: row };
  }

  async deleteProduct(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    this.requireSettings(user);
    const row = await this.prisma.product.update({
      where: { id, companyId: user.companyId },
      data: { deletedAt: new Date(), updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Product", entityId: row.id, summary: `Deleted product ${row.sku} — ${row.name}`, ...ctx });
    return { data: { success: true } };
  }
}
