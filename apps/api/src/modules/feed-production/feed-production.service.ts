import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma, FeedProductionOrderStatus, PaymentMethod } from "@prisma/client";
import { nextRef } from "../../common/next-ref";
import { withDbRetry } from "../../common/db-retry";
import { validateEnumFilter } from "../../common/utils/validate-enum-filter";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { WarehousePurposeService } from "../../common/services/warehouse-purpose.service";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import {
  AddFeedFormulaIngredientDto,
  CreateFeedFormulaDto,
  CreateFeedFormulaVersionDto,
  CreateFeedInternalTransferDto,
  CreateFeedPackagingRecordDto,
  CreateFeedProductionBatchDto,
  CreateFeedProductionCostDto,
  CreateFeedProductionOrderDto,
  CreateFeedQualityCheckDto,
  CreateIngredientDto,
  FeedProductionQueryDto,
  HiproPredictiveQueryDto,
  RecordExternalFeedSaleDto,
  SimulatePredictiveDto,
  UpdateFeedFormulaDto,
  UpdateFeedFormulaIngredientDto,
  UpdateFeedProductionOrderDto,
  UpdateFeedQualityCheckStatusDto,
  UpdateIngredientDto
} from "./dto/feed-production.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type IngredientPlan = {
  ingredientId: string;
  productName: string;
  sku: string;
  quantityKg: number;
  unitCost: number;
  availableKg: number;
  shortageKg: number;
};

@Injectable()
export class FeedProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService,
    private readonly warehousePurpose: WarehousePurposeService,
    private readonly sales: SalesService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [formulas, orders, batches, qualityChecks, finishedStockAgg, usageAgg, costs, stalledOrders, weekBatches, formulaStats, orderStats, systemAlerts] = await Promise.all([
      this.prisma.feedFormula.count({ where: this.formulaWhere(user, {}) }),
      this.prisma.feedProductionOrder.findMany({ where: this.orderWhere(user, {}), orderBy: { createdAt: "desc" }, take: 8 }),
      this.prisma.feedProductionBatch.findMany({
        where: this.batchWhere(user, {}),
        include: { finishedProduct: { select: { name: true, sku: true } }, productionSite: { select: { name: true, code: true } } },
        orderBy: { productionDate: "desc" },
        take: 8
      }),
      this.prisma.feedQualityCheck.count({ where: { ...this.qualityWhere(user, {}), status: "PENDING" } }),
      this.prisma.finishedFeedStock.aggregate({ where: this.finishedStockWhere(user, {}), _sum: { quantityKg: true, bag50KgCount: true } }),
      this.prisma.feedRawMaterialUsage.aggregate({ where: this.usageWhere(user, {}), _sum: { quantityKg: true, wastageKg: true } }),
      this.prisma.feedProductionCost.aggregate({ where: this.costWhere(user, {}), _sum: { rawMaterialCost: true, laborCost: true, packagingCost: true, overheadCost: true, expectedSalesValue: true } }),
      this.prisma.feedProductionOrder.findMany({
        where: { ...this.orderWhere(user, {}), status: { in: ["DRAFT", "APPROVED"] }, scheduledDate: { lt: new Date() } },
        select: { id: true, orderNumber: true, status: true, scheduledDate: true, plannedQuantityKg: true, formula: { select: { name: true, code: true } } },
        orderBy: { scheduledDate: "asc" },
        take: 5
      }),
      this.prisma.feedProductionBatch.findMany({
        where: { ...this.batchWhere(user, {}), productionDate: { gte: sevenDaysAgo } },
        select: { productionDate: true, producedQuantityKg: true, wastageKg: true },
        orderBy: { productionDate: "asc" }
      }),
      this.prisma.feedFormula.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } }),
      this.prisma.feedProductionOrder.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } }),
      this.prisma.dashboardAlert.findMany({
        where: { companyId: user.companyId, businessUnit: "FEED_MILL", status: "OPEN", deletedAt: null },
        select: { id: true, title: true, message: true, severity: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 10
      })
    ]);

    const totalProducedKg = batches.reduce((sum, batch) => sum + Number(batch.producedQuantityKg), 0);
    const totalFinishedKg = Number(finishedStockAgg._sum.quantityKg ?? 0);
    const rawMaterialCost = Number(costs._sum.rawMaterialCost ?? 0);
    const wastageKg = Number(usageAgg._sum.wastageKg ?? 0);
    const productionCost = Number(costs._sum.rawMaterialCost ?? 0) + Number(costs._sum.laborCost ?? 0) + Number(costs._sum.packagingCost ?? 0) + Number(costs._sum.overheadCost ?? 0);
    const expectedSalesValue = Number(costs._sum.expectedSalesValue ?? 0);

    return {
      data: {
        formulaCount: formulas,
        openOrders: orders.filter((order) => ["DRAFT", "APPROVED", "IN_PROGRESS"].includes(order.status)).length,
        pendingQualityChecks: qualityChecks,
        totalProducedKg,
        totalFinishedKg,
        bag50KgCount: finishedStockAgg._sum.bag50KgCount ?? 0,
        finishedValue: Number(productionCost.toFixed(2)),
        rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
        wastageKg: Number(wastageKg.toFixed(2)),
        productionProfitMargin: this.margin(expectedSalesValue, productionCost),
        recentOrders: orders,
        recentBatches: batches,
        alerts: {
          stalledOrders: stalledOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, scheduledDate: o.scheduledDate, plannedQuantityKg: Number(o.plannedQuantityKg), formula: o.formula })),
          pendingQC: qualityChecks,
          systemAlerts
        },
        trends: {
          production: weekBatches.map((b) => ({ date: b.productionDate, producedKg: Number(b.producedQuantityKg), wastageKg: Number(b.wastageKg) }))
        },
        formulaStats: formulaStats.map((row) => ({ status: row.status, count: row._count.status })),
        orderStats: orderStats.map((row) => ({ status: row.status, count: row._count.status }))
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const cacheKey = `feed:opts:${user.companyId}:${user.hasGlobalAccess ? "g" : user.id}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;

    const [branches, productionSites, warehouses, farms, poultryHouses, rawMaterials, finishedFeeds, formulas, batches, marketTargets] = await Promise.all([
      // (readiness review 2026-08-24) Was missing entirely — the Create
      // Formula form had no way to offer a branch picker, so createFormula's
      // auto-default (single-branch companies only) was the only path
      // through, and a multi-branch company had no way to create a formula
      // at all. See createFormula's own comment for the full chain.
      this.prisma.branch.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.branchIds.length === 0 ? {} : { id: { in: user.branchIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.productionSite.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          type: { in: ["FEED_PRODUCTION", "MIXED"] },
          ...(user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { id: { in: user.productionSiteIds } })
        },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) },
        select: { id: true, branchId: true, farmId: true, productionSiteId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.farm.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { id: { in: user.farmIds } }) },
        select: { id: true, branchId: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.poultryHouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { farmId: { in: user.farmIds } }) },
        select: { id: true, farmId: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["RAW_MATERIAL", "SEMI_FINISHED", "CONSUMABLE"] } },
        select: { id: true, branchId: true, sku: true, name: true, uomId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: "FINISHED_GOOD" },
        select: { id: true, branchId: true, sku: true, name: true, uomId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.feedFormula.findMany({
        where: this.formulaWhere(user, {}),
        select: { id: true, code: true, name: true, feedType: true, finishedProductId: true, currentVersionNo: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.feedProductionBatch.findMany({
        where: this.batchWhere(user, {}),
        select: { id: true, batchNumber: true, finishedProductId: true, producedQuantityKg: true, status: true },
        orderBy: { productionDate: "desc" },
        take: 50
      }),
      // For the optional "produce for a market demand target" link on the
      // order form — only targets that are live enough to produce against.
      this.prisma.marketTarget.findMany({
        where: { companyId: user.companyId, deletedAt: null, status: "APPROVED", ...(user.hasGlobalAccess || user.branchIds.length === 0 ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }) },
        select: { id: true, targetNumber: true, title: true },
        orderBy: { periodStart: "desc" },
        take: 100
      })
    ]);

    // Every warehouse picker in this module is feed-related (raw materials,
    // finished feed, feed sales, feed transfers) — when purpose enforcement is
    // on, narrow the list to Feed Store / General so the wrong warehouse can't
    // be picked. Off: unchanged.
    const scopedWarehouses = await this.warehousePurpose.filterForOperation(user.companyId, warehouses, "feed-production.raw-materials");

    const result = {
      data: {
        branches, productionSites, warehouses: scopedWarehouses, farms, poultryHouses, rawMaterials, finishedFeeds, formulas, batches,
        marketTargets: marketTargets.map((t) => ({ id: t.id, name: `${t.targetNumber} · ${t.title}` }))
      }
    };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  async listFormulas(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedFormula.findMany({
      where: this.formulaWhere(user, query),
      include: {
        finishedProduct: { select: { id: true, name: true, sku: true } },
        ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { id: true, name: true, sku: true } } }, orderBy: { sortOrder: "asc" } },
        versions: { orderBy: { versionNo: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 200
    });
    return { data: data.map((formula) => ({ ...formula, costing: this.costFormula(formula) })) };
  }

  async getFormula(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.feedFormula.findFirst({
      where: { ...this.formulaWhere(user, {}), id },
      include: {
        finishedProduct: { select: { id: true, name: true, sku: true } },
        ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { id: true, name: true, sku: true } } }, orderBy: { sortOrder: "asc" } },
        versions: { orderBy: { versionNo: "desc" } },
        productionOrders: { orderBy: { createdAt: "desc" }, take: 20 }
      }
    });
    if (!data) {
      throw new NotFoundException("Feed formula was not found.");
    }
    return { data: { ...data, costing: this.costFormula(data) } };
  }

  async createFormula(user: AuthenticatedUser, dto: CreateFeedFormulaDto, context: RequestContext) {
    const finishedProduct = await this.getProduct(user.companyId, dto.finishedProductId);
    let branchId = dto.branchId ?? finishedProduct.branchId ?? user.branchIds[0];
    if (!branchId) {
      // (readiness review 2026-08-24) The formula-create form has no branch
      // field, and Settings → Products has no branch field either, so
      // finishedProduct.branchId is null for virtually every product in
      // practice — leaving user.branchIds[0] as the only fallback, which is
      // also empty for any global-access admin (empty means unrestricted,
      // not "no access"). That failed the common case of a single-branch
      // company outright with a confusing error instead of just using the
      // company's only branch.
      const branches = await this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true } });
      if (branches.length === 1) branchId = branches[0].id;
    }
    if (!branchId) {
      throw new BadRequestException("A branch is required for this feed formula — this company has multiple branches, so one couldn't be picked automatically.");
    }
    this.assertBranchAccess(user, branchId);

    // M5: check for duplicate formula code before hitting the DB unique constraint
    const codeUpper = dto.code.toUpperCase();
    const existing = await this.prisma.feedFormula.findFirst({ where: { companyId: user.companyId, code: codeUpper, deletedAt: null } });
    if (existing) throw new ConflictException(`Formula code "${codeUpper}" is already in use.`);

    const formula = await this.prisma.feedFormula.create({
      data: {
        companyId: user.companyId,
        branchId,
        finishedProductId: finishedProduct.id,
        code: codeUpper,
        name: dto.name,
        feedType: dto.feedType,
        targetBatchKg: dto.targetBatchKg,
        status: dto.status ?? "DRAFT",
        createdById: user.id,
        ingredients: dto.ingredients?.length
          ? {
              create: dto.ingredients.map((ingredient, index) => ({
                companyId: user.companyId,
                ingredientId: ingredient.ingredientId,
                quantityKg: ingredient.quantityKg,
                unitCost: ingredient.unitCost,
                sortOrder: ingredient.sortOrder ?? index + 1
              }))
            }
          : undefined
      },
      include: { ingredients: true }
    });

    // M8: invalidate options cache so new formula appears in dropdowns immediately
    this.lookupCache.invalidate(`feed:opts:${user.companyId}:`);

    await this.writeAudit(user, "CREATE", "FeedFormula", formula.id, `Created feed formula ${formula.code}`, context, { branchId });
    return { data: formula };
  }

  async addIngredient(user: AuthenticatedUser, formulaId: string, dto: AddFeedFormulaIngredientDto, context: RequestContext) {
    const formula = await this.requireFormula(user, formulaId);
    await this.getProduct(user.companyId, dto.ingredientId);
    const data = await this.prisma.feedFormulaIngredient.create({
      data: {
        companyId: user.companyId,
        formulaId,
        ingredientId: dto.ingredientId,
        quantityKg: dto.quantityKg,
        unitCost: dto.unitCost,
        sortOrder: dto.sortOrder ?? 0
      }
    });
    await this.writeAudit(user, "UPDATE", "FeedFormula", formula.id, `Added ingredient to feed formula ${formula.code}`, context, { branchId: formula.branchId });
    return { data };
  }

  async updateFormula(user: AuthenticatedUser, id: string, dto: UpdateFeedFormulaDto, context: RequestContext) {
    const formula = await this.requireFormula(user, id);
    const updated = await this.prisma.feedFormula.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.targetBatchKg !== undefined && { targetBatchKg: dto.targetBatchKg }),
        ...(dto.status !== undefined && { status: dto.status }),
        updatedById: user.id,
      },
    });
    await this.writeAudit(user, "UPDATE", "FeedFormula", id, `Updated feed formula ${formula.code}`, context, { branchId: formula.branchId });
    return { data: updated };
  }

  async deleteFormula(user: AuthenticatedUser, id: string, context: RequestContext) {
    const formula = await this.requireFormula(user, id);
    const activeOrders = await this.prisma.feedProductionOrder.count({
      where: { companyId: user.companyId, formulaId: id, status: { in: ["DRAFT", "APPROVED", "IN_PROGRESS"] }, deletedAt: null }
    });
    if (activeOrders > 0) throw new BadRequestException("Cannot delete a formula with active production orders. Archive it first.");
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a formula and recreating one with the same
    // code fails the create with a unique-constraint error.
    await this.prisma.feedFormula.update({ where: { id }, data: { code: `${formula.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "FeedFormula", id, `Deleted formula ${formula.code}`, context, { branchId: formula.branchId });
    return { data: { ok: true } };
  }

  async updateFormulaIngredient(user: AuthenticatedUser, formulaId: string, ingredientId: string, dto: UpdateFeedFormulaIngredientDto, context: RequestContext) {
    const formula = await this.requireFormula(user, formulaId);
    const row = await this.prisma.feedFormulaIngredient.findFirst({ where: { id: ingredientId, formulaId, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Ingredient not found");
    const updated = await this.prisma.feedFormulaIngredient.update({
      where: { id: ingredientId },
      data: {
        ...(dto.quantityKg !== undefined && { quantityKg: dto.quantityKg }),
        ...(dto.unitCost !== undefined && { unitCost: dto.unitCost }),
      },
    });
    await this.writeAudit(user, "UPDATE", "FeedFormula", formulaId, `Updated ingredient in formula ${formula.code}`, context, { branchId: formula.branchId });
    return { data: updated };
  }

  async deleteFormulaIngredient(user: AuthenticatedUser, formulaId: string, ingredientId: string, context: RequestContext) {
    const formula = await this.requireFormula(user, formulaId);
    const row = await this.prisma.feedFormulaIngredient.findFirst({ where: { id: ingredientId, formulaId, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Ingredient not found");
    // H4: soft delete to preserve formula history and audit trail
    await this.prisma.feedFormulaIngredient.update({ where: { id: ingredientId }, data: { deletedAt: new Date() } });
    await this.writeAudit(user, "UPDATE", "FeedFormula", formulaId, `Removed ingredient from formula ${formula.code}`, context, { branchId: formula.branchId });
    return { data: { id: ingredientId } };
  }

  async createVersion(user: AuthenticatedUser, formulaId: string, dto: CreateFeedFormulaVersionDto, context: RequestContext) {
    const formula = await this.getFormulaForCosting(user, formulaId);
    // M7: prevent snapshotting a DRAFT formula — it would silently promote it to ACTIVE
    if (formula.status === "DRAFT") {
      throw new BadRequestException("Formula must be set to ACTIVE before a version snapshot can be taken. Update the formula status first.");
    }
    const costing = this.costFormula(formula);
    const latest = await this.prisma.feedFormulaVersion.findFirst({ where: { companyId: user.companyId, formulaId }, orderBy: { versionNo: "desc" } });
    const versionNo = (latest?.versionNo ?? 0) + 1;
    const data = await this.prisma.feedFormulaVersion.create({
      data: {
        companyId: user.companyId,
        formulaId,
        versionNo,
        status: dto.status ?? "ACTIVE",
        ingredientSnapshot: formula.ingredients.map((ingredient) => ({
          sku: ingredient.ingredient.sku,
          name: ingredient.ingredient.name,
          quantityKg: Number(ingredient.quantityKg),
          unitCost: Number(ingredient.unitCost)
        })),
        costPer100Kg: costing.costPer100Kg,
        costPer50KgBag: costing.costPer50KgBag,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.prisma.feedFormula.update({ where: { id: formulaId }, data: { currentVersionNo: versionNo, status: dto.status ?? "ACTIVE", updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "FeedFormulaVersion", data.id, `Created formula version ${versionNo} for ${formula.code}`, context, { branchId: formula.branchId });
    return { data };
  }

  async formulaCosting(user: AuthenticatedUser, formulaId: string) {
    const formula = await this.getFormulaForCosting(user, formulaId);
    return { data: this.costFormula(formula) };
  }

  async listFormulaVersions(user: AuthenticatedUser, formulaId: string) {
    await this.requireFormula(user, formulaId);
    const data = await this.prisma.feedFormulaVersion.findMany({ where: { companyId: user.companyId, formulaId }, orderBy: { versionNo: "desc" } });
    return { data };
  }

  async listOrders(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedProductionOrder.findMany({
      where: this.orderWhere(user, query),
      include: {
        productionSite: { select: { id: true, code: true, name: true } },
        formula: { select: { id: true, code: true, name: true, feedType: true } },
        finishedProduct: { select: { id: true, name: true, sku: true } },
        batches: { select: { id: true, batchNumber: true, status: true, producedQuantityKg: true } }
      },
      orderBy: { scheduledDate: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async createOrder(user: AuthenticatedUser, dto: CreateFeedProductionOrderDto, context: RequestContext) {
    this.assertProductionSiteAccess(user, dto.productionSiteId);
    const [site, formula] = await Promise.all([
      this.getProductionSite(user.companyId, dto.productionSiteId),
      this.getFormulaForCosting(user, dto.formulaId)
    ]);
    if (site.branchId !== formula.branchId) {
      throw new BadRequestException("Production site and formula must belong to the same branch.");
    }
    if (dto.marketTargetId) {
      const target = await this.prisma.marketTarget.findFirst({
        where: { id: dto.marketTargetId, companyId: user.companyId, deletedAt: null },
        select: { id: true }
      });
      if (!target) throw new BadRequestException("The linked market target was not found.");
    }

    const latestVersion = await this.prisma.feedFormulaVersion.findFirst({
      where: { companyId: user.companyId, formulaId: formula.id, status: "ACTIVE" },
      orderBy: { versionNo: "desc" }
    });
    const orderNumber = await nextRef(this.prisma, user.companyId, "FPO");
    const data = await this.prisma.feedProductionOrder.create({
      data: {
        companyId: user.companyId,
        branchId: site.branchId,
        productionSiteId: site.id,
        formulaId: formula.id,
        formulaVersionId: latestVersion?.id,
        finishedProductId: formula.finishedProductId,
        marketTargetId: dto.marketTargetId,
        orderNumber,
        plannedQuantityKg: dto.plannedQuantityKg,
        scheduledDate: new Date(dto.scheduledDate),
        status: "DRAFT",
        notes: dto.notes,
        createdById: user.id
      } as Prisma.FeedProductionOrderUncheckedCreateInput
    });

    // M6: check raw material availability and flag the order if stock is insufficient
    const availability = dto.rawMaterialWarehouseId
      ? await this.materialAvailability(user, formula.id, dto.rawMaterialWarehouseId, dto.plannedQuantityKg)
      : null;

    if (availability && !availability.canProduce) {
      await this.prisma.feedProductionOrder.update({ where: { id: data.id }, data: { status: "PENDING_STOCK_APPROVAL" } });
      await this.writeAudit(user, "CREATE", "FeedProductionOrder", data.id, `Created feed production order ${orderNumber} (awaiting stock)`, context, { branchId: site.branchId, productionSiteId: site.id });
      return { data: { ...data, status: "PENDING_STOCK_APPROVAL", availability } };
    }

    await this.writeAudit(user, "CREATE", "FeedProductionOrder", data.id, `Created feed production order ${orderNumber}`, context, { branchId: site.branchId, productionSiteId: site.id });
    return { data: { ...data, availability } };
  }

  async approveOrder(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.requireOrder(user, id);
    // M1: block self-approval — committing production stock should require
    // segregation of duties. A single-operator operation turns this off under
    // Settings → User Access ("require a separate production approver"), which
    // is the only way one person can run production end to end.
    if (order.createdById === user.id && (await this.requiresSeparateApprover(user.companyId))) {
      throw new ForbiddenException(
        "You cannot approve a production order you created — a different manager must approve it. " +
          "If you run production single-handed, an admin can turn off \"require a separate production approver\" under Settings → User Access."
      );
    }
    if (!["DRAFT", "PENDING_STOCK_APPROVAL"].includes(order.status)) {
      throw new BadRequestException(`Order cannot be approved from status "${order.status}".`);
    }
    const data = await this.prisma.feedProductionOrder.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
    });
    await this.writeAudit(user, "APPROVE", "FeedProductionOrder", id, `Approved feed production order ${order.orderNumber}`, context, { branchId: order.branchId, productionSiteId: order.productionSiteId });
    return { data };
  }

  async updateOrder(user: AuthenticatedUser, id: string, dto: UpdateFeedProductionOrderDto, context: RequestContext) {
    const order = await this.requireOrder(user, id);
    if (!["DRAFT", "PENDING_STOCK_APPROVAL"].includes(order.status)) {
      throw new BadRequestException(`Only DRAFT or PENDING_STOCK_APPROVAL orders can be edited. Current status: "${order.status}".`);
    }
    const data = await this.prisma.feedProductionOrder.update({
      where: { id },
      data: {
        ...(dto.plannedQuantityKg !== undefined && { plannedQuantityKg: dto.plannedQuantityKg }),
        ...(dto.scheduledDate !== undefined && { scheduledDate: new Date(dto.scheduledDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "FeedProductionOrder", id, `Edited feed production order ${order.orderNumber}`, context, { branchId: order.branchId, productionSiteId: order.productionSiteId });
    return { data };
  }

  async cancelOrder(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.requireOrder(user, id);
    if (!["DRAFT", "PENDING_STOCK_APPROVAL"].includes(order.status)) {
      throw new BadRequestException(`Only DRAFT or PENDING_STOCK_APPROVAL orders can be cancelled. Current status: "${order.status}".`);
    }
    const hasBatches = await this.prisma.feedProductionBatch.count({ where: { companyId: user.companyId, productionOrderId: id, deletedAt: null } });
    if (hasBatches > 0) throw new BadRequestException("Cannot cancel an order that already has posted batches.");
    const data = await this.prisma.feedProductionOrder.update({
      where: { id },
      data: { status: "CANCELLED", updatedById: user.id }
    });
    await this.writeAudit(user, "UPDATE", "FeedProductionOrder", id, `Cancelled feed production order ${order.orderNumber}`, context, { branchId: order.branchId, productionSiteId: order.productionSiteId });
    return { data };
  }

  async orderAvailability(user: AuthenticatedUser, id: string, warehouseId: string) {
    const order = await this.requireOrder(user, id);
    return { data: await this.materialAvailability(user, order.formulaId, warehouseId, Number(order.plannedQuantityKg)) };
  }

  async createBatch(user: AuthenticatedUser, dto: CreateFeedProductionBatchDto, context: RequestContext) {
    // Idempotency (DB stability audit, 2026-08-16): mirrors the existing
    // Payment/SalesOrder/CustomerPayment pattern — a client retry after a
    // dropped response used to post the same production run twice, each one
    // consuming raw materials and crediting finished goods a second time.
    if (dto.idempotencyKey) {
      const existing = await this.findBatchByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    this.assertWarehouseAccess(user, dto.rawMaterialWarehouseId);
    this.assertWarehouseAccess(user, dto.finishedWarehouseId);
    const [rawWh, finWh] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: dto.rawMaterialWarehouseId, companyId: user.companyId, deletedAt: null }, select: { id: true, type: true, name: true, code: true, branchId: true } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.finishedWarehouseId, companyId: user.companyId, deletedAt: null }, select: { id: true, type: true, name: true, code: true, branchId: true } }),
    ]);
    if (!rawWh || !finWh) throw new NotFoundException("Warehouse not found.");
    await this.warehousePurpose.assert(user, rawWh, "feed-production.raw-materials", { overrideReason: dto.purposeOverrideReason, context });
    await this.warehousePurpose.assert(user, finWh, "feed-production.finished", { overrideReason: dto.purposeOverrideReason, context });
    const order = await this.getOrderForBatch(user, dto.productionOrderId);
    const formula = order.formula;
    const inputQuantityKg = dto.producedQuantityKg + (dto.wastageKg ?? 0);

    // H7: enforce planned quantity cap — prevent unlimited batches from one
    // order. Fast-fail UX check only, so an obviously-over-cap request
    // doesn't waste the material-availability check below — the real,
    // race-safe guard is the locked re-check inside the transaction further
    // down (DB stability audit, 2026-08-16).
    const produced = await this.prisma.feedProductionBatch.aggregate({
      where: { companyId: user.companyId, productionOrderId: order.id, deletedAt: null },
      _sum: { producedQuantityKg: true }
    });
    const alreadyProducedKg = Number(produced._sum.producedQuantityKg ?? 0);
    if (alreadyProducedKg + dto.producedQuantityKg > Number(order.plannedQuantityKg)) {
      throw new BadRequestException(
        `Batch would exceed the planned quantity of ${Number(order.plannedQuantityKg)} kg. Already produced: ${alreadyProducedKg} kg.`
      );
    }

    // H3: batch-load availability (one query vs N) for the pre-flight check
    const ingredientPlan = await this.materialAvailability(user, formula.id, dto.rawMaterialWarehouseId, inputQuantityKg);
    if (!ingredientPlan.canProduce) {
      throw new BadRequestException({ message: "Raw material stock is not sufficient for this production batch.", shortages: ingredientPlan.ingredients.filter((item) => item.shortageKg > 0) });
    }

    // Pre-load inventory records in one query for use inside the transaction
    const ingredientIds = ingredientPlan.ingredients.map((i) => i.ingredientId);
    const inventoryRecords = await this.prisma.inventoryItem.findMany({
      where: { companyId: user.companyId, warehouseId: dto.rawMaterialWarehouseId, productId: { in: ingredientIds }, deletedAt: null },
      select: { id: true, productId: true, uomId: true }
    });
    const inventoryMap = new Map(inventoryRecords.map((r) => [r.productId, r]));

    const batchNumber = dto.batchNumber?.toUpperCase() ?? (await nextRef(this.prisma, user.companyId, "FB"));
    const rawMaterialCost = ingredientPlan.ingredients.reduce((sum, ingredient) => sum + ingredient.quantityKg * ingredient.unitCost, 0);
    const totalCost = rawMaterialCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    const unitCost = totalCost / Math.max(dto.producedQuantityKg, 1);
    // Expected sales value drives the profitability margin. If the producer
    // didn't type one in, derive it from the finished feed's active price
    // list entry rather than defaulting to zero (which reads as a 0% margin).
    const expectedSalesValue =
      dto.expectedSalesValue ??
      (await this.priceListValue(user.companyId, order.finishedProductId, order.branchId, dto.producedQuantityKg));

    // Lock order (DB stability audit, 2026-08-16): the raw-material
    // consumption loop below now locks StockBatch lots before InventoryItem,
    // matching inventory.service.ts's own consumeFifoTx. The finished-goods
    // side still upserts InventoryItem before creating a brand-new StockBatch
    // row, which doesn't contend with any existing StockBatch lock. Retry
    // remains as a backstop for whatever transient DB errors remain.
    let data;
    try {
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // High (DB stability audit, 2026-08-16): the planned-quantity cap
      // above is a plain read-then-compare outside any lock — two concurrent
      // createBatch calls against the same order could both read the same
      // alreadyProducedKg, both pass the check, and jointly overshoot the
      // plan (raw materials stay protected by their own floor-guarded
      // decrements below; only this soft plan/costing cap was bypassable).
      // Locking the order row for the rest of this transaction and
      // re-checking against a fresh sum closes the race — the same
      // SELECT...FOR UPDATE idiom already used for poultry's live-bird-count
      // and HR's leave-balance races.
      await tx.$queryRaw`SELECT id FROM FeedProductionOrder WHERE id = ${order.id} FOR UPDATE`;
      const lockedProduced = await tx.feedProductionBatch.aggregate({
        where: { companyId: user.companyId, productionOrderId: order.id, deletedAt: null },
        _sum: { producedQuantityKg: true }
      });
      const lockedAlreadyProducedKg = Number(lockedProduced._sum.producedQuantityKg ?? 0);
      if (lockedAlreadyProducedKg + dto.producedQuantityKg > Number(order.plannedQuantityKg)) {
        throw new BadRequestException(
          `Batch would exceed the planned quantity of ${Number(order.plannedQuantityKg)} kg. Already produced: ${lockedAlreadyProducedKg} kg.`
        );
      }
      const batch = await tx.feedProductionBatch.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          productionSiteId: order.productionSiteId,
          productionOrderId: order.id,
          finishedProductId: order.finishedProductId,
          marketTargetId: order.marketTargetId,
          productionPlanId: order.productionPlanId,
          batchNumber,
          producedQuantityKg: dto.producedQuantityKg,
          wastageKg: dto.wastageKg ?? 0,
          productionDate: dto.productionDate ? new Date(dto.productionDate) : new Date(),
          status: "POSTED",
          idempotencyKey: dto.idempotencyKey,
          createdById: user.id
        } as Prisma.FeedProductionBatchUncheckedCreateInput
      });

      for (const ingredient of ingredientPlan.ingredients) {
        const inv = inventoryMap.get(ingredient.ingredientId);
        if (!inv) throw new BadRequestException(`Inventory record not found for ingredient "${ingredient.productName}".`);

        // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
        // then InventoryItem — matches inventory.service.ts's own
        // consumeFifoTx, the canonical FIFO consumer, closing a cross-module
        // deadlock risk from the previous (opposite) order.
        //
        // H6/H2 (High-tier): FIFO — consume from oldest StockBatch records first
        // to maintain lot traceability. Each per-lot decrement is floor-guarded
        // the same way the inventoryItem decrement below it is — a plain update
        // here let a concurrent consumer of the same lot drive quantityRemaining
        // negative even though quantityOnHand was correctly protected. And if
        // the lots on hand sum to less than what's needed (data already out of
        // sync with quantityOnHand, or a lot expired/was voided mid-loop), the
        // loop used to just stop with `remaining > 0` and no error — silently
        // letting inventory and its batch-level lot records drift apart with
        // nothing logged. Both now fail loudly and roll back the whole batch.
        let remaining = ingredient.quantityKg;
        // H-BUG-2: status: "AVAILABLE" excludes lots Quality has rejected or
        // quarantined — see quality.service.ts's approve/reject/quarantineBatch.
        const stockBatches = await tx.stockBatch.findMany({
          where: { companyId: user.companyId, warehouseId: dto.rawMaterialWarehouseId, productId: ingredient.ingredientId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
          orderBy: { createdAt: "asc" }
        });
        for (const sb of stockBatches) {
          if (remaining <= 0) break;
          const consumed = Math.min(remaining, Number(sb.quantityRemaining));
          const batchUpdate = await tx.stockBatch.updateMany({
            where: { id: sb.id, quantityRemaining: { gte: consumed } },
            data: { quantityRemaining: { decrement: consumed } }
          });
          if (batchUpdate.count === 0) {
            throw new BadRequestException(`Stock batch for "${ingredient.productName}" was consumed concurrently. Please retry.`);
          }
          remaining -= consumed;
        }
        if (remaining > 0) {
          throw new BadRequestException(`Stock batches on hand for "${ingredient.productName}" cover only ${(ingredient.quantityKg - remaining).toFixed(2)}kg of the required ${ingredient.quantityKg}kg — inventory and lot records are out of sync. Please investigate before retrying.`);
        }

        // H2: floor-guarded updateMany prevents concurrent overdraw at the DB level
        const invUpdate = await tx.inventoryItem.updateMany({
          where: { id: inv.id, quantityOnHand: { gte: ingredient.quantityKg }, deletedAt: null },
          data: { quantityOnHand: { decrement: ingredient.quantityKg }, updatedById: user.id }
        });
        if (invUpdate.count === 0) {
          throw new BadRequestException(`Insufficient stock for "${ingredient.productName}" — possibly consumed concurrently. Please retry.`);
        }

        await tx.feedRawMaterialUsage.create({
          data: {
            companyId: user.companyId,
            branchId: order.branchId,
            productionSiteId: order.productionSiteId,
            productionBatchId: batch.id,
            rawMaterialId: ingredient.ingredientId,
            quantityKg: ingredient.quantityKg,
            unitCost: ingredient.unitCost,
            wastageKg: ingredient.quantityKg * ((dto.wastageKg ?? 0) / Math.max(inputQuantityKg, 1)),
            createdById: user.id
          }
        });
        await tx.stockMovement.create({
          data: {
            companyId: user.companyId,
            branchId: order.branchId,
            productId: ingredient.ingredientId,
            inventoryItemId: inv.id,
            fromWarehouseId: dto.rawMaterialWarehouseId,
            productionSiteId: order.productionSiteId,
            uomId: inv.uomId,
            movementType: "PRODUCTION_INPUT",
            quantity: ingredient.quantityKg,
            unitCost: ingredient.unitCost,
            referenceType: "FeedProductionBatch",
            referenceId: batch.id,
            notes: `Raw material issued for ${batch.batchNumber}`,
            createdById: user.id
          }
        });
      }

      const finishedInventory = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.finishedWarehouseId, productId: order.finishedProductId } },
        update: { quantityOnHand: { increment: dto.producedQuantityKg }, updatedById: user.id },
        create: {
          companyId: user.companyId,
          branchId: order.branchId,
          warehouseId: dto.finishedWarehouseId,
          productionSiteId: order.productionSiteId,
          productId: order.finishedProductId,
          uomId: order.finishedProduct.uomId,
          quantityOnHand: dto.producedQuantityKg,
          createdById: user.id
        }
      });
      const stockBatch = await tx.stockBatch.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          warehouseId: dto.finishedWarehouseId,
          productionSiteId: order.productionSiteId,
          productId: order.finishedProductId,
          inventoryItemId: finishedInventory.id,
          uomId: order.finishedProduct.uomId,
          batchNumber,
          quantityReceived: dto.producedQuantityKg,
          quantityRemaining: dto.producedQuantityKg,
          unitCost,
          manufactureDate: dto.productionDate ? new Date(dto.productionDate) : new Date(),
          createdById: user.id
        }
      });
      await tx.finishedFeedStock.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          productionSiteId: order.productionSiteId,
          warehouseId: dto.finishedWarehouseId,
          productionBatchId: batch.id,
          productId: order.finishedProductId,
          quantityKg: dto.producedQuantityKg,
          bag50KgCount: Math.floor(dto.producedQuantityKg / 50),
          unitCost
        }
      });
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          productId: order.finishedProductId,
          inventoryItemId: finishedInventory.id,
          stockBatchId: stockBatch.id,
          toWarehouseId: dto.finishedWarehouseId,
          warehouseId: dto.finishedWarehouseId,
          productionSiteId: order.productionSiteId,
          uomId: order.finishedProduct.uomId,
          movementType: "PRODUCTION_OUTPUT",
          quantity: dto.producedQuantityKg,
          unitCost,
          referenceType: "FeedProductionBatch",
          referenceId: batch.id,
          notes: `Finished feed received from ${batch.batchNumber}`,
          createdById: user.id
        }
      });
      await tx.feedProductionCost.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          productionSiteId: order.productionSiteId,
          productionBatchId: batch.id,
          rawMaterialCost,
          laborCost: dto.laborCost ?? 0,
          packagingCost: dto.packagingCost ?? 0,
          overheadCost: dto.overheadCost ?? 0,
          expectedSalesValue,
          createdById: user.id
        }
      });
      // Posting a batch doesn't mean the order is finished — only that
      // production has run against it. It's COMPLETED only once the planned
      // quantity has actually been produced (cumulative), otherwise it stays
      // IN_PROGRESS so the mill knows there's more to make. Same rule the
      // linked production plan item follows below.
      const cumulativeProducedKg = lockedAlreadyProducedKg + dto.producedQuantityKg;
      await tx.feedProductionOrder.update({
        where: { id: order.id },
        data: { status: cumulativeProducedKg >= Number(order.plannedQuantityKg) ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id }
      });

      // Market-led orders (opened by MarketPlanningService.approveTarget) can
      // be posted from here — the normal Feed Mill screen — just as well as
      // from Market Planning's own "Production Execution" shortcut. Either
      // way, the plan item this order was opened for needs to see the
      // progress, or Market Planning would show 0% produced forever for
      // anything the mill posted through its own Orders page.
      if (order.productionPlanItemId) {
        const planItem = await tx.productionPlanItem.findUnique({
          where: { id: order.productionPlanItemId },
          select: { id: true, productionPlanId: true, plannedQuantityKg: true, producedQuantityKg: true }
        });
        if (planItem) {
          const newProducedKg = Number(planItem.producedQuantityKg) + dto.producedQuantityKg;
          await tx.productionPlanItem.update({
            where: { id: planItem.id },
            data: { producedQuantityKg: newProducedKg, status: newProducedKg >= Number(planItem.plannedQuantityKg) ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id }
          });
          const remaining = await tx.productionPlanItem.count({
            where: { companyId: user.companyId, productionPlanId: planItem.productionPlanId, deletedAt: null, status: { not: "COMPLETED" } }
          });
          await tx.productionPlan.update({ where: { id: planItem.productionPlanId }, data: { status: remaining === 0 ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id } });
        }
      }
      return batch;
      }), { label: "FeedProductionService.postProduction" });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findBatchByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }

    // M8: invalidate options cache so new batch appears in form dropdowns immediately
    this.lookupCache.invalidate(`feed:opts:${user.companyId}:`);

    await this.writeAudit(user, "CREATE", "FeedProductionBatch", data.id, `Posted feed production batch ${batchNumber}`, context, { branchId: order.branchId, warehouseId: dto.finishedWarehouseId, productionSiteId: order.productionSiteId });
    return { data: { ...data, costing: { rawMaterialCost, totalCost, unitCost, expectedSalesValue, margin: this.margin(expectedSalesValue, totalCost) } } };
  }

  private async findBatchByIdempotencyKey(companyId: string, idempotencyKey: string) {
    const batch = await this.prisma.feedProductionBatch.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
    if (!batch) return null;
    const cost = await this.prisma.feedProductionCost.findFirst({ where: { companyId, productionBatchId: batch.id }, orderBy: { createdAt: "desc" } });
    const rawMaterialCost = Number(cost?.rawMaterialCost ?? 0);
    const totalCost = rawMaterialCost + Number(cost?.laborCost ?? 0) + Number(cost?.packagingCost ?? 0) + Number(cost?.overheadCost ?? 0);
    const unitCost = totalCost / Math.max(Number(batch.producedQuantityKg), 1);
    return { ...batch, costing: { rawMaterialCost, totalCost, unitCost, margin: this.margin(Number(cost?.expectedSalesValue ?? 0), totalCost) } };
  }

  async listBatches(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedProductionBatch.findMany({
      where: this.batchWhere(user, query),
      include: {
        productionOrder: { select: { orderNumber: true, plannedQuantityKg: true } },
        productionSite: { select: { code: true, name: true } },
        finishedProduct: { select: { sku: true, name: true } },
        qualityChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
        costs: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { productionDate: "desc" },
      take: query.limit ?? 200
    });
    return { data: data.map((batch) => ({ ...batch, metrics: this.batchMetrics(batch) })) };
  }

  async getBatch(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.feedProductionBatch.findFirst({
      where: { ...this.batchWhere(user, {}), id },
      include: {
        productionOrder: true,
        productionSite: true,
        finishedProduct: true,
        rawMaterialUsages: { include: { rawMaterial: true } },
        qualityChecks: { orderBy: { checkedAt: "desc" } },
        finishedFeedStocks: { include: { warehouse: true } },
        packagingRecords: { orderBy: { packagedAt: "desc" } },
        costs: { orderBy: { createdAt: "desc" } },
        internalTransfers: { include: { fromWarehouse: true, toFarm: true, toPoultryHouse: true } }
      }
    });
    if (!data) {
      throw new NotFoundException("Feed production batch was not found.");
    }
    return { data: { ...data, metrics: this.batchMetrics(data) } };
  }

  async listRawMaterialUsage(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedRawMaterialUsage.findMany({
      where: this.usageWhere(user, query),
      include: { rawMaterial: { select: { name: true, sku: true } }, productionBatch: { select: { batchNumber: true } }, productionSite: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async listQualityChecks(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedQualityCheck.findMany({
      where: this.qualityWhere(user, query),
      include: { productionBatch: { select: { batchNumber: true } }, productionSite: { select: { name: true } } },
      orderBy: { checkedAt: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async createQualityCheck(user: AuthenticatedUser, dto: CreateFeedQualityCheckDto, context: RequestContext) {
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const data = await this.prisma.feedQualityCheck.create({
      data: {
        companyId: user.companyId,
        branchId: batch.branchId,
        productionSiteId: batch.productionSiteId,
        productionBatchId: batch.id,
        moisturePercent: dto.moisturePercent,
        proteinPercent: dto.proteinPercent,
        textureNotes: dto.textureNotes,
        status: "PENDING",
        checkedById: user.id,
      }
    });
    await this.writeAudit(user, "CREATE", "FeedQualityCheck", data.id, `Recorded quality check for ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  async approveQualityCheck(user: AuthenticatedUser, id: string, dto: UpdateFeedQualityCheckStatusDto, context: RequestContext) {
    const check = await this.prisma.feedQualityCheck.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { productionBatch: { select: { batchNumber: true, finishedProductId: true } } }
    });
    if (!check) {
      throw new NotFoundException("Quality check was not found.");
    }
    this.assertProductionSiteAccess(user, check.productionSiteId);
    // M2: the same person who performed the check cannot approve their own work
    if (check.checkedById === user.id) {
      throw new ForbiddenException("You cannot approve a quality check you performed. A different user must review and sign off.");
    }
    // H-BACK-2: the quality-check status update and its corresponding
    // production-batch status update used to be two separate, unguarded
    // calls. If anything interrupted the process between them — a DB
    // connection blip, realistic given this exact database's connection
    // pool has needed tuning under load — the check could end up
    // APPROVED/FAILED while the batch itself never moved off its pre-check
    // status, silently blocking or wrongly permitting the batch's release.
    // quality.service.ts's own approveBatch/rejectBatch already fixed this
    // exact pattern with $transaction; applying the same fix here.
    const data = await this.prisma.$transaction(async (tx) => {
      const updatedCheck = await tx.feedQualityCheck.update({
        where: { id },
        data: { status: dto.status, approvedById: ["APPROVED", "FAILED"].includes(dto.status) ? user.id : undefined, approvedAt: ["APPROVED", "FAILED"].includes(dto.status) ? new Date() : undefined }
      });
      await tx.feedProductionBatch.update({ where: { id: check.productionBatchId }, data: { status: dto.status === "FAILED" ? "REJECTED" : dto.status === "APPROVED" || dto.status === "PASSED" ? "APPROVED" : "QUALITY_HOLD", updatedById: user.id } });
      // H-BUG-2 pattern (see quality.service.ts's approve/reject/quarantineBatch):
      // this quality decision must also gate the actual sellable stock lot, or
      // Sales' consumeFifoTx (which filters status: "AVAILABLE") will happily
      // sell a batch this check just failed. The finished-goods StockBatch has
      // no direct FK back to FeedProductionBatch, but createBatch stamps both
      // records with the exact same batchNumber, so that + product is how the
      // right lot(s) are found.
      const stockStatus = dto.status === "APPROVED" || dto.status === "PASSED" ? "AVAILABLE" : "QUARANTINED";
      await tx.stockBatch.updateMany({
        where: { companyId: user.companyId, productId: check.productionBatch.finishedProductId, batchNumber: check.productionBatch.batchNumber, deletedAt: null },
        data: { status: stockStatus, updatedById: user.id }
      });
      return updatedCheck;
    });
    await this.writeAudit(user, dto.status === "FAILED" ? "REJECT" : "APPROVE", "FeedQualityCheck", id, `Updated feed quality check to ${dto.status}`, context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data };
  }

  async listFinishedFeedStock(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.finishedFeedStock.findMany({
      where: this.finishedStockWhere(user, query),
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionBatch: { select: { batchNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async createPackagingRecord(user: AuthenticatedUser, dto: CreateFeedPackagingRecordDto, context: RequestContext) {
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const data = await this.prisma.feedPackagingRecord.create({
      data: {
        companyId: user.companyId,
        branchId: batch.branchId,
        productionSiteId: batch.productionSiteId,
        productionBatchId: batch.id,
        packageSizeKg: dto.packageSizeKg,
        packageCount: dto.packageCount,
        labelPrinted: false, // L3: label has not been printed yet at record creation time
        packagedAt: dto.packagedAt ? new Date(dto.packagedAt) : new Date(),
        createdById: user.id
      }
    });
    await this.writeAudit(user, "CREATE", "FeedPackagingRecord", data.id, `Recorded packaging for ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  async listPackagingRecords(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedPackagingRecord.findMany({
      where: this.packagingWhere(user, query),
      include: { productionBatch: { select: { batchNumber: true } }, productionSite: { select: { name: true } } },
      orderBy: { packagedAt: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async createProductionCost(user: AuthenticatedUser, dto: CreateFeedProductionCostDto, context: RequestContext) {
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const rawMaterialRows = await this.prisma.feedRawMaterialUsage.findMany({
      where: { companyId: user.companyId, productionBatchId: batch.id, deletedAt: null },
      select: { quantityKg: true, unitCost: true }
    });
    const rawMaterialCost = rawMaterialRows.reduce((sum, row) => sum + Number(row.quantityKg) * Number(row.unitCost), 0);

    // H5: update the existing cost record (created automatically at batch time) rather than creating a duplicate
    const existing = await this.prisma.feedProductionCost.findFirst({
      where: { companyId: user.companyId, productionBatchId: batch.id, deletedAt: null }
    });

    const data = existing
      ? await this.prisma.feedProductionCost.update({
          where: { id: existing.id },
          data: { rawMaterialCost, laborCost: dto.laborCost, packagingCost: dto.packagingCost, overheadCost: dto.overheadCost, expectedSalesValue: dto.expectedSalesValue }
        })
      : await this.prisma.feedProductionCost.create({
          data: {
            companyId: user.companyId,
            branchId: batch.branchId,
            productionSiteId: batch.productionSiteId,
            productionBatchId: batch.id,
            rawMaterialCost,
            laborCost: dto.laborCost,
            packagingCost: dto.packagingCost,
            overheadCost: dto.overheadCost,
            expectedSalesValue: dto.expectedSalesValue,
            createdById: user.id
          }
        });

    await this.writeAudit(user, "CREATE", "FeedProductionCost", data.id, `Recorded feed production cost for ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data: { ...data, profitMargin: this.margin(dto.expectedSalesValue, Number(data.rawMaterialCost) + dto.laborCost + dto.packagingCost + dto.overheadCost) } };
  }

  async createInternalTransfer(user: AuthenticatedUser, dto: CreateFeedInternalTransferDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.assertFarmAccess(user, dto.toFarmId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    if (dto.toPoultryHouseId) {
      const house = await this.prisma.poultryHouse.findFirst({ where: { companyId: user.companyId, id: dto.toPoultryHouseId, farmId: dto.toFarmId, deletedAt: null } });
      if (!house) {
        throw new BadRequestException("Destination poultry house does not belong to the selected farm.");
      }
    }

    const data = await this.moveFinishedFeed(user, {
      batch,
      fromWarehouseId: dto.fromWarehouseId,
      quantityKg: dto.quantityKg,
      movementType: "TRANSFER",
      referenceType: "FeedInternalTransfer",
      transferData: { toFarmId: dto.toFarmId, toPoultryHouseId: dto.toPoultryHouseId, notes: dto.notes },
      context
    });
    return { data };
  }

  async listTransfers(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedInternalTransfer.findMany({
      where: this.transferWhere(user, query),
      include: { productionBatch: { select: { batchNumber: true } }, product: { select: { name: true, sku: true } }, fromWarehouse: { select: { name: true, code: true } }, toFarm: { select: { name: true, code: true } }, toPoultryHouse: { select: { name: true, code: true } } },
      orderBy: { transferDate: "desc" },
      take: query.limit ?? 200
    });
    return { data };
  }

  async recordExternalSale(user: AuthenticatedUser, dto: RecordExternalFeedSaleDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const product = await this.getProduct(user.companyId, batch.finishedProductId);
    const data = await this.moveFinishedFeed(user, {
      batch,
      fromWarehouseId: dto.fromWarehouseId,
      quantityKg: dto.quantityKg,
      movementType: "SALE_DISPATCH",
      referenceType: "FeedExternalSale",
      transferData: { customerName: dto.customerName, unitPrice: dto.unitPrice, paymentMethod: dto.paymentMethod, productName: product.name },
      context
    });
    return { data };
  }

  async batchLabel(user: AuthenticatedUser, id: string) {
    const batch = await this.prisma.feedProductionBatch.findFirst({
      where: { ...this.batchWhere(user, {}), id },
      include: { productionSite: true, finishedProduct: true, productionOrder: { include: { formula: true } }, packagingRecords: { orderBy: { packagedAt: "desc" }, take: 1 } }
    });
    if (!batch) {
      throw new NotFoundException("Feed production batch was not found.");
    }
    return {
      data: {
        title: "Finished Feed Batch Label",
        batchNumber: batch.batchNumber,
        product: batch.finishedProduct.name,
        feedType: batch.productionOrder.formula.feedType,
        productionSite: batch.productionSite.name,
        productionDate: batch.productionDate,
        producedQuantityKg: Number(batch.producedQuantityKg),
        packageSizeKg: Number(batch.packagingRecords[0]?.packageSizeKg ?? 50),
        packageCount: batch.packagingRecords[0]?.packageCount ?? Math.floor(Number(batch.producedQuantityKg) / 50),
        status: batch.status
      }
    };
  }

  async reportCsv(user: AuthenticatedUser, query: FeedProductionQueryDto, context: RequestContext) {
    const batches = await this.listBatches(user, query);
    const rows = [
      ["batch", "site", "product", "status", "produced_kg", "wastage_kg", "total_cost", "expected_sales_value", "profit_margin"],
      ...batches.data.map((batch) => [
        batch.batchNumber,
        batch.productionSite.name,
        batch.finishedProduct.name,
        batch.status,
        String(Number(batch.producedQuantityKg)),
        String(Number(batch.wastageKg)),
        String(batch.metrics.totalCost),
        String(batch.metrics.expectedSalesValue),
        String(batch.metrics.profitMargin)
      ])
    ];
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "feed-production.summary", summary: "Exported feed production summary report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  async hiproPredictive(user: AuthenticatedUser, warehouseId?: string) {
    const formulas = await this.prisma.feedFormula.findMany({
      where: this.formulaWhere(user, {}),
      include: {
        finishedProduct: { select: { name: true, sku: true } },
        ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { id: true, name: true, sku: true } } }, orderBy: { sortOrder: "asc" } }
      },
      orderBy: { name: "asc" }
    });

    const ingredientIds = [...new Set(formulas.flatMap((f) => f.ingredients.map((i) => i.ingredientId)))];

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { companyId: user.companyId, productId: { in: ingredientIds }, deletedAt: null, ...(warehouseId ? { warehouseId } : user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { warehouseId: { in: user.warehouseIds } }) },
      select: { productId: true, quantityOnHand: true }
    });

    const stockMap = new Map<string, number>();
    for (const item of inventoryItems) {
      stockMap.set(item.productId, (stockMap.get(item.productId) ?? 0) + Number(item.quantityOnHand));
    }

    const consumedRows = await this.prisma.feedRawMaterialUsage.groupBy({
      by: ["rawMaterialId"],
      where: { companyId: user.companyId, deletedAt: null },
      _sum: { quantityKg: true }
    });
    const consumedMap = new Map(consumedRows.map((r) => [r.rawMaterialId, Number(r._sum.quantityKg ?? 0)]));

    const formulaData = formulas.map((formula) => {
      const targetBatchKg = Number(formula.targetBatchKg);
      const ingredientRows = formula.ingredients.map((ing) => {
        const availableKg = stockMap.get(ing.ingredientId) ?? 0;
        const kgsPerTon = targetBatchKg > 0 ? (Number(ing.quantityKg) / targetBatchKg) * 1000 : 0;
        const maxProducibleKg = kgsPerTon > 0 ? (availableKg / kgsPerTon) * 1000 : null;
        return {
          ingredientId: ing.ingredientId,
          name: ing.ingredient.name,
          sku: ing.ingredient.sku,
          kgsPerTon: Number(kgsPerTon.toFixed(2)),
          unitCost: Number(ing.unitCost ?? 0),
          availableKg: Number(availableKg.toFixed(3)),
          bagsOnHand: Math.floor(availableKg / 50),
          tonsOnHand: Number((availableKg / 1000).toFixed(3)),
          maxProducibleKg: maxProducibleKg !== null ? Number(maxProducibleKg.toFixed(0)) : null,
          maxProducibleTons: maxProducibleKg !== null ? Number((maxProducibleKg / 1000).toFixed(3)) : null,
          feedConsumedKg: Number((consumedMap.get(ing.ingredientId) ?? 0).toFixed(3))
        };
      });

      const finite = ingredientRows.filter((r) => r.maxProducibleKg !== null);
      const limiting = finite.length > 0 ? finite.reduce((min, r) => (r.maxProducibleKg! < min.maxProducibleKg! ? r : min)) : null;

      return {
        formulaId: formula.id,
        formulaCode: formula.code,
        formulaName: formula.name,
        feedType: formula.feedType,
        finishedProduct: formula.finishedProduct,
        targetBatchKg,
        maxProducibleKg: limiting?.maxProducibleKg ?? null,
        maxProducibleTons: limiting?.maxProducibleTons ?? null,
        maxProducibleBags: limiting?.maxProducibleKg != null ? Math.floor(limiting.maxProducibleKg / 50) : null,
        limitingIngredient: limiting ? { name: limiting.name, sku: limiting.sku } : null,
        ingredients: ingredientRows
      };
    });

    const ingredientMap = new Map<string, { ingredientId: string; name: string; sku: string; unitCost: number; availableKg: number; bagsOnHand: number; tonsOnHand: number; feedConsumedKg: number; formulaUsages: { formulaId: string; formulaName: string; feedType: string; kgsPerTon: number; maxProducibleKg: number | null }[] }>();
    for (const formula of formulaData) {
      for (const ing of formula.ingredients) {
        if (!ingredientMap.has(ing.ingredientId)) {
          ingredientMap.set(ing.ingredientId, { ingredientId: ing.ingredientId, name: ing.name, sku: ing.sku, unitCost: ing.unitCost, availableKg: ing.availableKg, bagsOnHand: ing.bagsOnHand, tonsOnHand: ing.tonsOnHand, feedConsumedKg: ing.feedConsumedKg, formulaUsages: [] });
        }
        ingredientMap.get(ing.ingredientId)!.formulaUsages.push({ formulaId: formula.formulaId, formulaName: formula.formulaName, feedType: formula.feedType, kgsPerTon: ing.kgsPerTon, maxProducibleKg: ing.maxProducibleKg });
      }
    }

    return { data: { asOf: new Date(), warehouseId: warehouseId ?? null, formulas: formulaData, ingredientView: Array.from(ingredientMap.values()) } };
  }

  async simulatePredictive(user: AuthenticatedUser, dto: SimulatePredictiveDto) {
    this.assertWarehouseAccess(user, dto.warehouseId);

    // Load all formulas in parallel instead of sequentially
    const formulaResults = await Promise.all(dto.plans.map((plan) => this.getFormulaForCosting(user, plan.formulaId)));
    const formulaMap = new Map(dto.plans.map((plan, i) => [plan.formulaId, formulaResults[i]!]));

    // Batch-load all inventory for this warehouse in one query instead of N×M findFirst calls
    const allIngredientIds = [...new Set(formulaResults.flatMap((f) => f.ingredients.map((i) => i.ingredientId)))];
    const inventoryRows = await this.prisma.inventoryItem.findMany({
      where: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: { in: allIngredientIds }, deletedAt: null },
      select: { productId: true, quantityOnHand: true }
    });
    const stockMap = new Map(inventoryRows.map((r) => [r.productId, Number(r.quantityOnHand)]));

    const runningStock = new Map<string, number>();
    const plans = [];
    for (const plan of dto.plans) {
      const formula = formulaMap.get(plan.formulaId)!;
      const targetBatchKg = Number(formula.targetBatchKg);
      const scale = (plan.plannedTons * 1000) / Math.max(targetBatchKg, 1);

      const ingredients = [];
      let canProduce = true;
      for (const ing of formula.ingredients) {
        const totalAvailable = stockMap.get(ing.ingredientId) ?? 0;
        const alreadyAllocated = runningStock.get(ing.ingredientId) ?? 0;
        const effectiveAvailable = Math.max(0, totalAvailable - alreadyAllocated);
        const required = Number((Number(ing.quantityKg) * scale).toFixed(4));
        const shortageKg = Number(Math.max(0, required - effectiveAvailable).toFixed(4));
        if (shortageKg > 0) canProduce = false;
        ingredients.push({ ingredientId: ing.ingredientId, productName: ing.ingredient.name, sku: ing.ingredient.sku, quantityKg: required, availableKg: effectiveAvailable, shortageKg, unitCost: Number(ing.unitCost), bagsRequired: Math.ceil(required / 50), tonsRequired: Number((required / 1000).toFixed(3)), bagsAvailable: Math.floor(effectiveAvailable / 50), tonsAvailable: Number((effectiveAvailable / 1000).toFixed(3)) });
        runningStock.set(ing.ingredientId, alreadyAllocated + required);
      }
      plans.push({ formulaId: plan.formulaId, formulaName: formula.name, formulaCode: formula.code, feedType: formula.feedType, plannedTons: plan.plannedTons, plannedKg: plan.plannedTons * 1000, canProduce, ingredients });
    }

    const summaryMap = new Map<string, { ingredientId: string; name: string; sku: string; totalRequired: number; totalAvailable: number; shortfall: number }>();
    for (const plan of plans) {
      for (const ing of plan.ingredients) {
        const existing = summaryMap.get(ing.ingredientId);
        if (!existing) {
          summaryMap.set(ing.ingredientId, { ingredientId: ing.ingredientId, name: ing.productName, sku: ing.sku, totalRequired: ing.quantityKg, totalAvailable: ing.availableKg + (runningStock.get(ing.ingredientId) ?? 0), shortfall: ing.shortageKg });
        } else {
          existing.totalRequired += ing.quantityKg;
          existing.shortfall += ing.shortageKg;
        }
      }
    }

    return { data: { plans, ingredientSummary: Array.from(summaryMap.values()), allCanProduce: plans.every((p) => p.canProduce) } };
  }

  // ── Ingredient (Raw Material) Management ─────────────────────────────────────

  async listIngredients(user: AuthenticatedUser) {
    const items = await this.prisma.product.findMany({
      where: { companyId: user.companyId, deletedAt: null, type: "RAW_MATERIAL" },
      select: { id: true, name: true, sku: true, description: true, status: true, uom: { select: { id: true, name: true, symbol: true } } },
      orderBy: { name: "asc" }
    });
    return { data: items };
  }

  async createIngredient(user: AuthenticatedUser, dto: CreateIngredientDto, context: RequestContext) {
    const sku = dto.sku.toUpperCase();
    const conflict = await this.prisma.product.findUnique({ where: { companyId_sku: { companyId: user.companyId, sku } } });
    if (conflict) throw new ConflictException(`SKU "${sku}" is already in use.`);

    const uom = await this.prisma.unitOfMeasure.findFirst({ where: { id: dto.uomId, companyId: user.companyId, deletedAt: null } });
    if (!uom) throw new NotFoundException("Unit of measure not found.");

    const item = await this.prisma.product.create({
      data: { companyId: user.companyId, name: dto.name, sku, type: "RAW_MATERIAL", status: "ACTIVE", uomId: dto.uomId, description: dto.description },
      select: { id: true, name: true, sku: true, description: true, status: true, uom: { select: { id: true, name: true, symbol: true } } }
    });
    // L5: audit ingredient creation
    await this.writeAudit(user, "CREATE", "Ingredient", item.id, `Created raw material ingredient "${item.name}" (${item.sku})`, context, {});
    return { data: item };
  }

  async updateIngredient(user: AuthenticatedUser, id: string, dto: UpdateIngredientDto, context: RequestContext) {
    const item = await this.prisma.product.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, type: "RAW_MATERIAL" } });
    if (!item) throw new NotFoundException("Ingredient not found.");

    if (dto.sku) {
      const sku = dto.sku.toUpperCase();
      if (sku !== item.sku) {
        const conflict = await this.prisma.product.findUnique({ where: { companyId_sku: { companyId: user.companyId, sku } } });
        if (conflict) throw new ConflictException(`SKU "${sku}" is already in use.`);
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.sku && { sku: dto.sku.toUpperCase() }),
        ...(dto.uomId && { uomId: dto.uomId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status && { status: dto.status })
      },
      select: { id: true, name: true, sku: true, description: true, status: true, uom: { select: { id: true, name: true, symbol: true } } }
    });
    // L5: audit ingredient update
    await this.writeAudit(user, "UPDATE", "Ingredient", id, `Updated raw material ingredient "${updated.name}" (${updated.sku})`, context, {});
    return { data: updated };
  }

  async deleteIngredient(user: AuthenticatedUser, id: string, context: RequestContext) {
    const item = await this.prisma.product.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, type: "RAW_MATERIAL" } });
    if (!item) throw new NotFoundException("Ingredient not found.");

    // L4: block deletion if the ingredient is referenced by active formula ingredients
    const formulaUsageCount = await this.prisma.feedFormulaIngredient.count({ where: { ingredientId: id, deletedAt: null } });
    if (formulaUsageCount > 0) {
      throw new BadRequestException(`Cannot delete this ingredient — it is used in ${formulaUsageCount} active formula(s). Remove it from all formulas first.`);
    }

    // @@unique([companyId, sku]) isn't deletedAt-aware — without rewriting
    // the sku here, deleting an ingredient and recreating one with the same
    // sku fails the create with a unique-constraint error.
    await this.prisma.product.update({ where: { id }, data: { sku: `${item.sku}__deleted_${id}`, deletedAt: new Date() } });
    // L5: audit ingredient deletion
    await this.writeAudit(user, "DELETE", "Ingredient", id, `Deleted raw material ingredient "${item.name}" (${item.sku})`, context, {});
    return { data: { ok: true } };
  }

  private async materialAvailability(user: AuthenticatedUser, formulaId: string, warehouseId: string, totalQuantityKg: number) {
    this.assertWarehouseAccess(user, warehouseId);
    const formula = await this.getFormulaForCosting(user, formulaId);
    const scale = totalQuantityKg / Math.max(Number(formula.targetBatchKg), 1);

    // H3: batch-load all ingredient inventory in one query instead of N findFirst calls
    const ingredientIds = formula.ingredients.map((i) => i.ingredientId);
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { companyId: user.companyId, warehouseId, productId: { in: ingredientIds }, deletedAt: null },
      select: { productId: true, quantityOnHand: true }
    });
    const stockMap = new Map(inventoryItems.map((item) => [item.productId, Number(item.quantityOnHand)]));

    const ingredients: IngredientPlan[] = formula.ingredients.map((ingredient) => {
      const quantityKg = Number((Number(ingredient.quantityKg) * scale).toFixed(4));
      const availableKg = stockMap.get(ingredient.ingredientId) ?? 0;
      return {
        ingredientId: ingredient.ingredientId,
        productName: ingredient.ingredient.name,
        sku: ingredient.ingredient.sku,
        quantityKg,
        unitCost: Number(ingredient.unitCost),
        availableKg,
        shortageKg: Number(Math.max(0, quantityKg - availableKg).toFixed(4))
      };
    });

    return {
      canProduce: ingredients.every((i) => i.shortageKg <= 0),
      targetQuantityKg: totalQuantityKg,
      warehouseId,
      ingredients,
      estimatedRawMaterialCost: Number(ingredients.reduce((sum, i) => sum + i.quantityKg * i.unitCost, 0).toFixed(2))
    };
  }

  private async moveFinishedFeed(
    user: AuthenticatedUser,
    input: {
      batch: { id: string; companyId: string; branchId: string; productionSiteId: string; finishedProductId: string; batchNumber: string; status: string };
      fromWarehouseId: string;
      quantityKg: number;
      movementType: "TRANSFER" | "SALE_DISPATCH";
      referenceType: "FeedInternalTransfer" | "FeedExternalSale";
      transferData: Record<string, unknown>;
      context: RequestContext;
    }
  ) {
    // M3: block dispatch for batches that failed QC or are on quality hold
    if (["REJECTED", "QUALITY_HOLD"].includes(input.batch.status)) {
      throw new BadRequestException(`Batch "${input.batch.batchNumber}" cannot be dispatched with status "${input.batch.status}". Resolve the quality check first.`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // H1: read inside transaction for TOCTOU safety — prevents concurrent requests from both passing the sufficiency check
      const stock = await tx.finishedFeedStock.findFirst({
        where: { companyId: user.companyId, productionBatchId: input.batch.id, warehouseId: input.fromWarehouseId, deletedAt: null },
        orderBy: { createdAt: "asc" }
      });

      if (!stock || Number(stock.quantityKg) < input.quantityKg) {
        throw new BadRequestException("Finished feed stock is not sufficient for this movement.");
      }

      // H1: floor-guarded updateMany — only succeeds if stock hasn't been consumed concurrently
      const stockUpdate = await tx.finishedFeedStock.updateMany({
        where: { id: stock.id, quantityKg: { gte: input.quantityKg } },
        data: {
          quantityKg: { decrement: input.quantityKg },
          bag50KgCount: Math.max(0, Math.floor((Number(stock.quantityKg) - input.quantityKg) / 50))
        }
      });
      if (stockUpdate.count === 0) {
        throw new BadRequestException("Finished feed stock was modified concurrently — please retry.");
      }

      const inventory = await tx.inventoryItem.findFirst({
        where: { companyId: user.companyId, warehouseId: input.fromWarehouseId, productId: input.batch.finishedProductId, deletedAt: null },
        select: { id: true, uomId: true, quantityOnHand: true }
      });
      if (!inventory || Number(inventory.quantityOnHand) < input.quantityKg) {
        throw new BadRequestException("Warehouse inventory is not sufficient for this movement.");
      }

      const invUpdate = await tx.inventoryItem.updateMany({
        where: { id: inventory.id, quantityOnHand: { gte: input.quantityKg } },
        data: { quantityOnHand: { decrement: input.quantityKg }, updatedById: user.id }
      });
      if (invUpdate.count === 0) {
        throw new BadRequestException("Warehouse inventory was modified concurrently — please retry.");
      }

      if (input.referenceType === "FeedInternalTransfer") {
        const transfer = await tx.feedInternalTransfer.create({
          data: {
            companyId: user.companyId,
            branchId: input.batch.branchId,
            productionBatchId: input.batch.id,
            productId: input.batch.finishedProductId,
            fromWarehouseId: input.fromWarehouseId,
            toFarmId: input.transferData.toFarmId as string,
            toPoultryHouseId: input.transferData.toPoultryHouseId as string | undefined,
            quantityKg: input.quantityKg,
            status: "COMPLETED",
            notes: input.transferData.notes as string | undefined,
            createdById: user.id
          }
        });
        await tx.stockMovement.create({
          data: {
            companyId: user.companyId,
            branchId: input.batch.branchId,
            productId: input.batch.finishedProductId,
            inventoryItemId: inventory.id,
            fromWarehouseId: input.fromWarehouseId,
            toFarmId: input.transferData.toFarmId as string,
            farmId: input.transferData.toFarmId as string,
            uomId: inventory.uomId,
            movementType: input.movementType,
            quantity: input.quantityKg,
            unitCost: stock.unitCost,
            referenceType: input.referenceType,
            referenceId: transfer.id,
            notes: `Internal feed transfer from ${input.batch.batchNumber}`,
            createdById: user.id
          }
        });
        return transfer;
      }

      // M4: create a persisted FeedExternalSale record (was previously a dangling randomUUID)
      const unitPrice = input.transferData.unitPrice as number;
      // The dispatch is a cash-and-carry sale: book it in the Sales module
      // (FULFILLED order + PAID invoice + settled payment + Finance revenue)
      // so it actually shows up in Sales and the P&L, instead of being a
      // ledger-blind FeedExternalSale row. Stock is already moved above, so
      // this only creates the money records — inside the same transaction.
      const cashSale = await this.sales.recordCashSaleForExternalDispatch(tx, user, {
        branchId: input.batch.branchId,
        warehouseId: input.fromWarehouseId,
        productId: input.batch.finishedProductId,
        productName: (input.transferData.productName as string) ?? "Finished feed",
        quantity: input.quantityKg,
        unitPrice,
        customerName: input.transferData.customerName as string | undefined,
        paymentMethod: input.transferData.paymentMethod as PaymentMethod | undefined,
        saleDate: new Date(),
        sourceLabel: `feed batch ${input.batch.batchNumber}`
      });
      const sale = await tx.feedExternalSale.create({
        data: {
          companyId: user.companyId,
          branchId: input.batch.branchId,
          productionBatchId: input.batch.id,
          productId: input.batch.finishedProductId,
          fromWarehouseId: input.fromWarehouseId,
          quantityKg: input.quantityKg,
          unitPrice,
          totalValue: input.quantityKg * unitPrice,
          customerName: input.transferData.customerName as string | undefined,
          salesOrderId: cashSale.salesOrderId,
          invoiceId: cashSale.invoiceId,
          createdById: user.id
        }
      });
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: input.batch.branchId,
          productId: input.batch.finishedProductId,
          inventoryItemId: inventory.id,
          fromWarehouseId: input.fromWarehouseId,
          warehouseId: input.fromWarehouseId,
          uomId: inventory.uomId,
          movementType: input.movementType,
          quantity: input.quantityKg,
          unitCost: unitPrice,
          referenceType: input.referenceType,
          referenceId: sale.id,
          notes: `External feed sale to ${input.transferData.customerName ?? "customer"}`,
          createdById: user.id
        }
      });
      return sale;
    });

    await this.writeAudit(user, input.referenceType === "FeedInternalTransfer" ? "TRANSFER" : "CREATE", input.referenceType, result.id, `${input.referenceType} posted for ${input.batch.batchNumber}`, input.context, { branchId: input.batch.branchId, warehouseId: input.fromWarehouseId, productionSiteId: input.batch.productionSiteId });
    return result;
  }

  private costFormula(formula: { targetBatchKg: Prisma.Decimal | number; ingredients: Array<{ quantityKg: Prisma.Decimal | number; unitCost: Prisma.Decimal | number; ingredient?: { name: string; sku: string } }> }) {
    const targetBatchKg = Number(formula.targetBatchKg);
    const ingredientCost = formula.ingredients.reduce((sum, ingredient) => sum + Number(ingredient.quantityKg) * Number(ingredient.unitCost), 0);
    const costPer100Kg = (ingredientCost / Math.max(targetBatchKg, 1)) * 100;
    return {
      targetBatchKg,
      ingredientCost: Number(ingredientCost.toFixed(2)),
      costPer100Kg: Number(costPer100Kg.toFixed(2)),
      costPer50KgBag: Number((costPer100Kg / 2).toFixed(2)),
      ingredients: formula.ingredients.map((ingredient) => ({
        name: ingredient.ingredient?.name ?? "",
        sku: ingredient.ingredient?.sku ?? "",
        quantityKg: Number(ingredient.quantityKg),
        unitCost: Number(ingredient.unitCost),
        lineCost: Number((Number(ingredient.quantityKg) * Number(ingredient.unitCost)).toFixed(2))
      }))
    };
  }

  private batchMetrics(batch: { costs?: Array<{ rawMaterialCost: Prisma.Decimal | number; laborCost: Prisma.Decimal | number; packagingCost: Prisma.Decimal | number; overheadCost: Prisma.Decimal | number; expectedSalesValue: Prisma.Decimal | number }> }) {
    const costRows = batch.costs ?? [];
    const totalCost = costRows.reduce((sum, cost) => sum + Number(cost.rawMaterialCost) + Number(cost.laborCost) + Number(cost.packagingCost) + Number(cost.overheadCost), 0);
    const expectedSalesValue = costRows.reduce((sum, cost) => sum + Number(cost.expectedSalesValue), 0);
    return {
      totalCost: Number(totalCost.toFixed(2)),
      expectedSalesValue: Number(expectedSalesValue.toFixed(2)),
      profitMargin: this.margin(expectedSalesValue, totalCost)
    };
  }

  private margin(expectedSalesValue: number, totalCost: number) {
    if (expectedSalesValue <= 0) {
      return 0;
    }
    return Number((((expectedSalesValue - totalCost) / expectedSalesValue) * 100).toFixed(2));
  }

  // Segregation-of-duties toggle. Default ON (a separate manager must approve).
  // A single-operator operation turns it off under Settings → User Access.
  private async requiresSeparateApprover(companyId: string): Promise<boolean> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { companyId, key: "user-access.settings", deletedAt: null },
      select: { value: true }
    });
    const value = (row?.value ?? {}) as { requireSeparateProductionApprover?: boolean };
    return value.requireSeparateProductionApprover !== false;
  }

  // The active price-list value for a finished feed product, in company
  // currency, for the given quantity. Branch-specific entries win over
  // company-wide ones; returns 0 when nothing is priced.
  private async priceListValue(companyId: string, productId: string, branchId: string | null, quantityKg: number): Promise<number> {
    if (quantityKg <= 0) return 0;
    const now = new Date();
    const price = await this.prisma.priceList.findFirst({
      where: {
        companyId,
        productId,
        status: "ACTIVE",
        deletedAt: null,
        validFrom: { lte: now },
        AND: [
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
          ...(branchId ? [{ OR: [{ branchId: null }, { branchId }] }] : [{ branchId: null }])
        ]
      },
      orderBy: [{ branchId: "desc" }, { validFrom: "desc" }],
      select: { unitPrice: true }
    });
    return price ? Number(price.unitPrice) * quantityKg : 0;
  }

  private async getProduct(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { companyId, id: productId, deletedAt: null } });
    if (!product) {
      throw new NotFoundException("Product was not found.");
    }
    return product;
  }

  private async getProductionSite(companyId: string, productionSiteId: string) {
    const site = await this.prisma.productionSite.findFirst({ where: { companyId, id: productionSiteId, deletedAt: null } });
    if (!site) {
      throw new NotFoundException("Production site was not found.");
    }
    return site;
  }

  private async getInventory(companyId: string, warehouseId: string, productId: string) {
    return this.prisma.inventoryItem.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null } });
  }

  private async requireFormula(user: AuthenticatedUser, formulaId: string) {
    const formula = await this.prisma.feedFormula.findFirst({ where: { ...this.formulaWhere(user, {}), id: formulaId } });
    if (!formula) {
      throw new NotFoundException("Feed formula was not found.");
    }
    return formula;
  }

  private async getFormulaForCosting(user: AuthenticatedUser, formulaId: string) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { ...this.formulaWhere(user, {}), id: formulaId },
      include: { ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { name: true, sku: true } } }, orderBy: { sortOrder: "asc" } } }
    });
    if (!formula) {
      throw new NotFoundException("Feed formula was not found.");
    }
    if (!formula.ingredients.length) {
      throw new BadRequestException("Feed formula has no ingredients.");
    }
    return formula;
  }

  private async requireOrder(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.feedProductionOrder.findFirst({ where: { ...this.orderWhere(user, {}), id } });
    if (!order) {
      throw new NotFoundException("Feed production order was not found.");
    }
    return order;
  }

  private async getOrderForBatch(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.feedProductionOrder.findFirst({
      where: { ...this.orderWhere(user, {}), id },
      include: {
        formula: { include: { ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { name: true, sku: true } } } } } },
        finishedProduct: { select: { id: true, uomId: true } }
      }
    });
    if (!order) {
      throw new NotFoundException("Feed production order was not found.");
    }
    if (!["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(order.status)) {
      throw new BadRequestException("Production order must be approved before posting a batch.");
    }
    return order;
  }

  private async requireBatch(user: AuthenticatedUser, id: string) {
    const batch = await this.prisma.feedProductionBatch.findFirst({ where: { ...this.batchWhere(user, {}), id } });
    if (!batch) {
      throw new NotFoundException("Feed production batch was not found.");
    }
    return batch;
  }

  private formulaWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const branchId = user.hasGlobalAccess || user.branchIds.length === 0
      ? query.branchId
      : (query.branchId && user.branchIds.includes(query.branchId) ? query.branchId : { in: user.branchIds });
    return { companyId: user.companyId, deletedAt: null, branchId };
  }

  private orderWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      productionSiteId,
      formulaId: query.formulaId,
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(FeedProductionOrderStatus)) as never } : {}),
      ...(this.dateRange(query, "scheduledDate"))
    };
  }

  private batchWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      productionSiteId,
      id: query.productionBatchId,
      ...(this.dateRange(query, "productionDate"))
    };
  }

  private usageWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionSiteId, productionBatchId: query.productionBatchId };
  }

  private qualityWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionSiteId, productionBatchId: query.productionBatchId };
  }

  private finishedStockWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const warehouseId = user.hasGlobalAccess || user.warehouseIds.length === 0
      ? query.warehouseId
      : (query.warehouseId && user.warehouseIds.includes(query.warehouseId) ? query.warehouseId : { in: user.warehouseIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionSiteId: query.productionSiteId, warehouseId, productionBatchId: query.productionBatchId };
  }

  private packagingWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionSiteId, productionBatchId: query.productionBatchId, ...(this.dateRange(query, "packagedAt")) };
  }

  private costWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const productionSiteId = user.hasGlobalAccess || user.productionSiteIds.length === 0
      ? query.productionSiteId
      : (query.productionSiteId && user.productionSiteIds.includes(query.productionSiteId) ? query.productionSiteId : { in: user.productionSiteIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionSiteId, productionBatchId: query.productionBatchId };
  }

  private transferWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const fromWarehouseId = user.hasGlobalAccess || user.warehouseIds.length === 0
      ? query.warehouseId
      : (query.warehouseId && user.warehouseIds.includes(query.warehouseId) ? query.warehouseId : { in: user.warehouseIds });
    return { companyId: user.companyId, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}), productionBatchId: query.productionBatchId, fromWarehouseId, ...(this.dateRange(query, "transferDate")) };
  }

  private dateRange(query: FeedProductionQueryDto, field: string) {
    return query.startDate || query.endDate
      ? {
          [field]: {
            gte: query.startDate ? new Date(query.startDate) : undefined,
            lte: query.endDate ? new Date(query.endDate) : undefined
          }
        }
      : {};
  }

  // (readiness review 2026-08-24) An empty branchIds/productionSiteIds array
  // means "not restricted to specific ones" everywhere else this convention
  // is used (platform.service.ts's branchWhere/farmWhere, hr.service.ts's
  // employeeScope, identity.service.ts's assertActorHasScopeAccess) — this
  // pair used to treat an empty array as "access to nothing" instead, since
  // `[].includes(id)` is always false. A non-global user whose account was
  // never assigned a specific branch/production site (the common case for
  // e.g. a Feed Mill Manager) was wrongly blocked from every branch/site.
  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (!user.hasGlobalAccess && user.branchIds.length > 0 && !user.branchIds.includes(branchId)) {
      throw new ForbiddenException("You do not have access to this branch.");
    }
  }

  private assertProductionSiteAccess(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && user.productionSiteIds.length > 0 && !user.productionSiteIds.includes(productionSiteId)) {
      throw new ForbiddenException("You do not have access to this production site.");
    }
  }

  // (2026-08-26) Same empty-array-means-unrestricted gap as the sibling
  // assertBranchAccess/assertProductionSiteAccess just above already had
  // fixed — these two were missed in that pass.
  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException("You do not have access to this warehouse.");
    }
  }

  private assertFarmAccess(user: AuthenticatedUser, farmId: string) {
    if (!user.hasGlobalAccess && user.farmIds.length > 0 && !user.farmIds.includes(farmId)) {
      throw new ForbiddenException("You do not have access to this farm.");
    }
  }

  private async writeAudit(
    user: AuthenticatedUser,
    action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE" | "REJECT",
    entityType: string,
    entityId: string,
    summary: string,
    context: RequestContext,
    scope: { branchId?: string; warehouseId?: string; productionSiteId?: string }
  ) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, productionSiteId: scope.productionSiteId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
