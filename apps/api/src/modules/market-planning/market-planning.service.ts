import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import {
  Prisma,
  MarketPlanningStatus,
  ProductionPlanStatus,
  MaterialRequirementPlanStatus,
  ProcurementRecommendationStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { validateEnumFilter } from "../../common/utils/validate-enum-filter";
import {
  AdjustTargetItemDto,
  ApproveMarketTargetDto,
  CalculateMrpDto,
  ConvertRecommendationDto,
  CreateMarketTargetDto,
  CreateProductionExecutionDto,
  GenerateProcurementRecommendationsDto,
  MarketPlanningQueryDto,
  UpdateMarketTargetDto
} from "./dto/market-planning.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };
type Tx = Prisma.TransactionClient;

type IngredientNeed = {
  productionPlanItemId: string;
  finishedProductId: string;
  rawMaterialId: string;
  formulaId: string;
  formulaVersionId?: string | null;
  requiredQuantityKg: number;
  unitCost: number;
};

function num(value: unknown) {
  return Number(value ?? 0);
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

@Injectable()
export class MarketPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const targetWhere = this.targetWhere(user, query);
    const [targets, plans, mrps, recommendations, batches, finishedInventory, sales, openShortages, targetStats, planStats] = await Promise.all([
      this.prisma.marketTarget.findMany({ where: targetWhere, orderBy: { periodStart: "desc" }, take: 8 }),
      this.prisma.productionPlan.findMany({ where: this.productionPlanWhere(user, query), orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.materialRequirementPlan.findMany({ where: this.mrpWhere(user, query), orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.procurementRecommendation.findMany({ where: this.recommendationWhere(user, query), orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.feedProductionBatch.findMany({
        where: { companyId: user.companyId, deletedAt: null, marketTargetId: { not: null }, ...(query.productionSiteId ? { productionSiteId: query.productionSiteId } : {}) },
        select: { producedQuantityKg: true, status: true, marketTargetId: true }
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          product: { type: "FINISHED_GOOD" },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
          ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { warehouseId: { in: user.warehouseIds } })
        },
        select: { quantityOnHand: true }
      }),
      this.prisma.salesOrder.findMany({
        where: { companyId: user.companyId, deletedAt: null, marketTargetId: { not: null } },
        include: { items: true }
      }),
      this.prisma.materialRequirementPlan.findMany({
        where: { ...this.mrpWhere(user, query), totalShortageKg: { gt: 0 } },
        select: { id: true, mrpNumber: true, totalShortageKg: true, status: true, createdAt: true },
        orderBy: { totalShortageKg: "desc" },
        take: 5
      }),
      this.prisma.marketTarget.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } }),
      this.prisma.productionPlan.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } })
    ]);

    const currentTarget = targets[0];
    const targetIds = targets.map((target) => target.id);
    const targetItems = targetIds.length
      ? await this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, deletedAt: null, marketTargetId: { in: targetIds } } })
      : [];
    const targetKg = targetItems.reduce((sum, item) => sum + num(item.targetQuantityKg), 0);
    const adjustedBags = targetItems.reduce((sum, item) => sum + num(item.finalTargetQuantity), 0);
    const requiredRawMaterials = mrps.reduce((sum, mrp) => sum + num(mrp.totalRequiredKg), 0);
    const availableRawMaterials = mrps.reduce((sum, mrp) => sum + num(mrp.totalAvailableKg), 0);
    const shortageMaterials = mrps.reduce((sum, mrp) => sum + num(mrp.totalShortageKg), 0);
    const producedKg = batches.reduce((sum, batch) => sum + num(batch.producedQuantityKg), 0);
    const salesKg = sales.flatMap((order) => order.items).reduce((sum, item) => sum + num(item.quantity), 0);
    const finishedGoodsKg = finishedInventory.reduce((sum, row) => sum + num(row.quantityOnHand), 0);

    return {
      data: {
        currentWeekTarget: currentTarget ?? null,
        adjustedTarget: adjustedBags,
        targetKg,
        requiredRawMaterials,
        availableRawMaterials,
        shortageMaterials,
        procurementPending: recommendations.filter((row) => row.status === "OPEN").length,
        productionPending: plans.filter((row) => ["DRAFT", "READY_FOR_APPROVAL", "APPROVED", "BLOCKED", "IN_PROGRESS"].includes(row.status)).length,
        productionCompleted: plans.filter((row) => row.status === "COMPLETED").length,
        finishedGoodsInventory: finishedGoodsKg,
        salesAchieved: salesKg,
        targetAchievementPercentage: pct(producedKg, targetKg),
        recentTargets: targets,
        recentPlans: plans,
        recentMrps: mrps,
        recentRecommendations: recommendations,
        alerts: {
          openShortages: openShortages.map((m) => ({ id: m.id, mrpNumber: m.mrpNumber, totalShortageKg: Number(m.totalShortageKg), status: m.status })),
          procurementPendingCount: recommendations.filter((row) => row.status === "OPEN").length
        },
        targetStats: targetStats.map((row) => ({ status: row.status, count: row._count.status })),
        planStats: planStats.map((row) => ({ status: row.status, count: row._count.status }))
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const [branches, productionSites, warehouses, finishedFeeds, formulas, rawMaterials] = await Promise.all([
      this.prisma.branch.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.branchIds.length === 0 ? {} : { id: { in: user.branchIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.productionSite.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["FEED_PRODUCTION", "MIXED"] }, ...(user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { id: { in: user.productionSiteIds } }) },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) },
        select: { id: true, branchId: true, productionSiteId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: "FINISHED_GOOD" },
        select: { id: true, branchId: true, sku: true, name: true, uomId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.feedFormula.findMany({
        where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" },
        select: { id: true, branchId: true, finishedProductId: true, code: true, name: true, targetBatchKg: true, currentVersionNo: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["RAW_MATERIAL", "SEMI_FINISHED", "CONSUMABLE"] } },
        select: { id: true, sku: true, name: true, uomId: true },
        orderBy: { name: "asc" }
      })
    ]);
    return { data: { branches, productionSites, warehouses, finishedFeeds, formulas, rawMaterials } };
  }

  async listTargets(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const rows = await this.prisma.marketTarget.findMany({
      where: this.targetWhere(user, query),
      orderBy: { periodStart: "desc" }
    });
    const items = rows.length
      ? await this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, deletedAt: null, marketTargetId: { in: rows.map((row) => row.id) } } })
      : [];
    return {
      data: rows.map((row) => ({
        ...row,
        itemCount: items.filter((item) => item.marketTargetId === row.id).length,
        targetKg: items.filter((item) => item.marketTargetId === row.id).reduce((sum, item) => sum + num(item.targetQuantityKg), 0)
      }))
    };
  }

  async getTarget(user: AuthenticatedUser, id: string) {
    const target = await this.prisma.marketTarget.findFirst({ where: { ...this.targetWhere(user, {}), id } });
    if (!target) throw new NotFoundException("Market target was not found.");
    const [items, productionPlans, mrps, recommendations] = await Promise.all([
      this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
      this.prisma.productionPlan.findMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.materialRequirementPlan.findMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.procurementRecommendation.findMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })
    ]);
    const productMap = await this.productMap(user.companyId, items.map((item) => item.productId));
    return { data: { ...target, items: items.map((item) => ({ ...item, product: productMap.get(item.productId) })), productionPlans, mrps, recommendations } };
  }

  async createTarget(user: AuthenticatedUser, dto: CreateMarketTargetDto, context: RequestContext) {
    if (!dto.items.length) throw new BadRequestException("At least one target item is required.");
    if (new Date(dto.periodEnd) < new Date(dto.periodStart)) throw new BadRequestException("Target end date must be after start date.");
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    if (dto.productionSiteId) this.assertProductionSiteAccess(user, dto.productionSiteId);

    const targetNumber = await nextRef(this.prisma, user.companyId, "MT");
    const warnings: string[] = [];
    const items = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.getProduct(user.companyId, item.productId);
        const formula = await this.resolveFormula(user.companyId, item.productId, item.formulaId);
        const version = item.formulaVersionId
          ? await this.getFormulaVersion(user.companyId, item.formulaVersionId, formula.id)
          : await this.activeFormulaVersion(user.companyId, formula.id);
        const finalTargetQuantity = item.baseQuantity * (1 + (item.adjustmentPercent ?? 0) / 100);
        const bagSizeKg = item.bagSizeKg ?? 50;
        const targetQuantityKg = finalTargetQuantity * bagSizeKg;
        // M-BUG (2026-08-13): baseQuantity is silently treated as a BAG
        // count and multiplied by bagSizeKg — nothing stops someone from
        // typing a kg figure directly into it, which inflates the computed
        // target by up to 50x with no warning. Can't reliably tell intent
        // from the number alone, so this doesn't block the request (a
        // genuinely large operation may mean it) — it just surfaces a
        // clear, checkable warning back to the caller instead of staying
        // silent.
        if (targetQuantityKg > 100000) {
          warnings.push(`"${product.name}": ${item.baseQuantity} bags × ${bagSizeKg}kg computes to ${targetQuantityKg.toLocaleString()}kg — please confirm this quantity is really in BAGS, not kg.`);
        }
        return {
          companyId: user.companyId,
          productId: product.id,
          formulaId: formula.id,
          formulaVersionId: version?.id,
          baseQuantity: item.baseQuantity,
          adjustmentPercent: item.adjustmentPercent ?? 0,
          finalTargetQuantity,
          bagSizeKg,
          targetQuantityKg,
          adjustmentReason: item.adjustmentReason,
          demandEstimateNotes: item.demandEstimateNotes,
          createdById: user.id
        };
      })
    );

    const target = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketTarget.create({
        data: {
          companyId: user.companyId,
          branchId: dto.branchId,
          productionSiteId: dto.productionSiteId,
          targetNumber,
          title: dto.title,
          period: dto.period,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          notes: dto.notes,
          createdById: user.id
        }
      });
      await tx.marketTargetItem.createMany({
        data: items.map((item) => ({ ...item, marketTargetId: created.id }))
      });
      const createdItems = await tx.marketTargetItem.findMany({ where: { companyId: user.companyId, marketTargetId: created.id, deletedAt: null } });
      return { ...created, items: createdItems };
    });
    await this.writeAudit(user, "CREATE", "MarketTarget", target.id, `Created market target ${targetNumber}`, context, { branchId: dto.branchId, productionSiteId: dto.productionSiteId });
    return { data: target, warnings: warnings.length ? warnings : undefined };
  }

  async submitTarget(user: AuthenticatedUser, id: string, context: RequestContext) {
    const target = await this.requireTarget(user, id);
    // C3: submitTarget previously had no status guard at all.
    if (target.status !== "DRAFT") {
      throw new BadRequestException(`Market target is already ${target.status.toLowerCase()} and cannot be submitted again.`);
    }
    const updated = await this.prisma.marketTarget.update({ where: { id }, data: { status: "SUBMITTED", updatedById: user.id } });
    await this.prisma.marketTargetItem.updateMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, data: { approvalStatus: "SUBMITTED", updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "MarketTarget", id, `Submitted market target ${target.targetNumber}`, context, { branchId: target.branchId ?? undefined, productionSiteId: target.productionSiteId ?? undefined });
    return { data: updated };
  }

  // H-CRUD-1: targets could be created, submitted, and approved, but never
  // edited or deleted — a typo'd title or a mistakenly-created draft had no
  // fix path short of direct database access. Restricted to DRAFT only:
  // once SUBMITTED, item-level corrections go through adjustTargetItem's
  // own audit trail instead, and once APPROVED, downstream production
  // plans/MRP/recommendations already depend on this target's values.
  async updateTarget(user: AuthenticatedUser, id: string, dto: UpdateMarketTargetDto, context: RequestContext) {
    const target = await this.requireTarget(user, id);
    if (target.status !== "DRAFT") {
      throw new BadRequestException(`Only DRAFT targets can be edited directly — this target is ${target.status.toLowerCase()}.`);
    }
    if (dto.periodStart || dto.periodEnd) {
      const newStart = new Date(dto.periodStart ?? target.periodStart);
      const newEnd = new Date(dto.periodEnd ?? target.periodEnd);
      if (newEnd < newStart) throw new BadRequestException("Target end date must be after start date.");
    }
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    if (dto.productionSiteId) this.assertProductionSiteAccess(user, dto.productionSiteId);

    const updated = await this.prisma.marketTarget.update({
      where: { id },
      data: {
        title: dto.title,
        period: dto.period,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        branchId: dto.branchId,
        productionSiteId: dto.productionSiteId,
        notes: dto.notes,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "MarketTarget", id, `Edited market target ${target.targetNumber}`, context, { branchId: updated.branchId ?? undefined, productionSiteId: updated.productionSiteId ?? undefined });
    return { data: updated };
  }

  // H-CRUD-1: allowed for DRAFT and SUBMITTED — neither state has any
  // downstream production plan/MRP/procurement recommendation yet (those
  // are only ever created inside approveTarget's own transaction), so
  // there's nothing to orphan. Soft-delete, matching the deletedAt
  // convention used everywhere else in this codebase.
  async deleteTarget(user: AuthenticatedUser, id: string, context: RequestContext) {
    const target = await this.requireTarget(user, id);
    if (!["DRAFT", "SUBMITTED"].includes(target.status)) {
      throw new BadRequestException(`Cannot delete a target that has already been ${target.status.toLowerCase()} — it may have production plans or purchase recommendations depending on it.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.marketTarget.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
      await tx.marketTargetItem.updateMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, data: { deletedAt: new Date(), updatedById: user.id } });
    });
    await this.writeAudit(user, "DELETE", "MarketTarget", id, `Deleted market target ${target.targetNumber}`, context, { branchId: target.branchId ?? undefined, productionSiteId: target.productionSiteId ?? undefined });
    return { success: true };
  }

  async adjustTargetItem(user: AuthenticatedUser, targetId: string, itemId: string, dto: AdjustTargetItemDto, context: RequestContext) {
    const target = await this.requireTarget(user, targetId);
    const item = await this.prisma.marketTargetItem.findFirst({ where: { id: itemId, companyId: user.companyId, marketTargetId: targetId, deletedAt: null } });
    if (!item) throw new NotFoundException("Market target item was not found.");
    const previousBaseQuantity = num(item.baseQuantity);
    const adjustedQuantity = previousBaseQuantity * (1 + dto.adjustmentPercent / 100);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.targetAdjustment.create({
        data: {
          companyId: user.companyId,
          marketTargetId: targetId,
          marketTargetItemId: itemId,
          previousBaseQuantity,
          adjustmentPercent: dto.adjustmentPercent,
          adjustedQuantity,
          reason: dto.reason,
          status: "APPROVED",
          requestedById: user.id,
          approvedById: user.id,
          approvedAt: new Date()
        }
      });
      return tx.marketTargetItem.update({
        where: { id: itemId },
        data: {
          adjustmentPercent: dto.adjustmentPercent,
          finalTargetQuantity: adjustedQuantity,
          targetQuantityKg: adjustedQuantity * num(item.bagSizeKg),
          adjustmentReason: dto.reason,
          approvalStatus: "APPROVED",
          approvedById: user.id,
          approvedAt: new Date(),
          updatedById: user.id
        }
      });
    });
    await this.writeAudit(user, "UPDATE", "MarketTargetItem", itemId, `Adjusted market target ${target.targetNumber}`, context, { branchId: target.branchId ?? undefined, productionSiteId: target.productionSiteId ?? undefined });
    return { data: updated };
  }

  async approveTarget(user: AuthenticatedUser, id: string, dto: ApproveMarketTargetDto, context: RequestContext) {
    const target = await this.requireTarget(user, id);
    const site = await this.requireProductionSite(user, dto.productionSiteId);
    const warehouse = await this.requireWarehouse(user, dto.centralWarehouseId);
    const branchId = target.branchId ?? site.branchId ?? warehouse.branchId;
    if (!branchId) throw new BadRequestException("A branch is required before a production plan can be approved.");
    this.assertBranchAccess(user, branchId);

    const items = await this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null } });
    if (!items.length) throw new BadRequestException("Cannot approve a target without target items.");
    const planNumber = await nextRef(this.prisma, user.companyId, "PP");
    const totalPlannedKg = items.reduce((sum, item) => sum + num(item.targetQuantityKg), 0);

    const plan = await this.prisma.$transaction(async (tx) => {
      // C3: previously an unguarded update with no status check at all — a
      // double-click or retry on approveTarget re-approved an already-
      // approved target and ran every downstream step (MRP, procurement
      // recommendations, production execution) a second time, physically
      // double-consuming raw materials and creating a second batch of
      // finished goods. The guarded updateMany makes only the first request
      // to see status: SUBMITTED able to advance it — a concurrent second
      // request now sees count: 0 and is rejected instead of proceeding.
      const advanced = await tx.marketTarget.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "APPROVED", branchId, productionSiteId: site.id, approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
      });
      if (advanced.count === 0) {
        throw new BadRequestException(`Market target is not in SUBMITTED status and cannot be approved.`);
      }
      await tx.marketTargetItem.updateMany({
        where: { companyId: user.companyId, marketTargetId: id, deletedAt: null },
        data: { approvalStatus: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
      });
      const created = await tx.productionPlan.create({
        data: {
          companyId: user.companyId,
          branchId,
          marketTargetId: id,
          productionSiteId: site.id,
          centralWarehouseId: warehouse.id,
          planNumber,
          plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
          plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : undefined,
          totalPlannedKg,
          status: "APPROVED",
          approvedById: user.id,
          approvedAt: new Date(),
          notes: dto.notes,
          createdById: user.id
        }
      });
      await tx.productionPlanItem.createMany({
        data: items.map((item) => ({
          companyId: user.companyId,
          productionPlanId: created.id,
          marketTargetItemId: item.id,
          productId: item.productId,
          formulaId: item.formulaId,
          formulaVersionId: item.formulaVersionId,
          plannedQuantityKg: item.targetQuantityKg,
          status: "APPROVED",
          createdById: user.id
        }))
      });
      return created;
    });
    await this.writeAudit(user, "APPROVE", "MarketTarget", id, `Approved market target ${target.targetNumber} into production plan ${planNumber}`, context, { branchId, productionSiteId: site.id, warehouseId: warehouse.id });
    return { data: plan };
  }

  async listProductionPlans(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const rows = await this.prisma.productionPlan.findMany({ where: this.productionPlanWhere(user, query), orderBy: { createdAt: "desc" } });
    const items = rows.length ? await this.prisma.productionPlanItem.findMany({ where: { companyId: user.companyId, productionPlanId: { in: rows.map((row) => row.id) }, deletedAt: null } }) : [];
    return {
      data: rows.map((row) => ({
        ...row,
        items: items.filter((item) => item.productionPlanId === row.id),
        producedQuantityKg: items.filter((item) => item.productionPlanId === row.id).reduce((sum, item) => sum + num(item.producedQuantityKg), 0)
      }))
    };
  }

  async getProductionPlan(user: AuthenticatedUser, id: string) {
    const plan = await this.requireProductionPlan(user, id);
    const [items, mrps, executions] = await Promise.all([
      this.prisma.productionPlanItem.findMany({ where: { companyId: user.companyId, productionPlanId: id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
      this.prisma.materialRequirementPlan.findMany({ where: { companyId: user.companyId, productionPlanId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }),
      this.prisma.productionExecution.findMany({ where: { companyId: user.companyId, productionPlanId: id, deletedAt: null }, orderBy: { createdAt: "desc" } })
    ]);
    const products = await this.productMap(user.companyId, items.map((item) => item.productId));
    return { data: { ...plan, items: items.map((item) => ({ ...item, product: products.get(item.productId) })), mrps, executions } };
  }

  // H-CRUD-1: production plans, MRP runs, and procurement recommendations
  // are computed artifacts (generated from an approved target), so a
  // free-form edit screen would let displayed numbers drift from the
  // calculation that produced them — the correct "fix" for a wrong number
  // is recalculating, which calculateMrp/generateProcurementRecommendations
  // already support. What was genuinely missing was a way to discard a
  // mistaken or duplicate run; delete-only, restricted to states with
  // nothing real yet built on top of it.
  async deleteProductionPlan(user: AuthenticatedUser, id: string, context: RequestContext) {
    const plan = await this.requireProductionPlan(user, id);
    if (!["DRAFT", "READY_FOR_APPROVAL"].includes(plan.status)) {
      throw new BadRequestException(`Cannot delete a production plan that is ${plan.status.toLowerCase()} — MRP runs or executions may already depend on it.`);
    }
    await this.prisma.productionPlan.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "ProductionPlan", id, `Deleted production plan ${plan.planNumber}`, context, { branchId: plan.branchId, productionSiteId: plan.productionSiteId });
    return { success: true };
  }

  async calculateMrp(user: AuthenticatedUser, productionPlanId: string, dto: CalculateMrpDto, context: RequestContext) {
    const plan = await this.requireProductionPlan(user, productionPlanId);
    const warehouseId = dto.centralWarehouseId ?? plan.centralWarehouseId;
    await this.requireWarehouse(user, warehouseId);
    const planItems = await this.prisma.productionPlanItem.findMany({ where: { companyId: user.companyId, productionPlanId, deletedAt: null } });
    if (!planItems.length) throw new BadRequestException("Production plan has no items to calculate.");
    const needs = await this.calculateIngredientNeeds(user.companyId, planItems);
    const availability = await this.inventoryAvailability(user.companyId, warehouseId, needs.map((need) => need.rawMaterialId));
    const mrpNumber = await nextRef(this.prisma, user.companyId, "MRP");

    const itemRows = needs.map((need) => {
      const availableQuantityKg = availability.get(need.rawMaterialId)?.quantityOnHand ?? 0;
      const shortageQuantityKg = Math.max(need.requiredQuantityKg - availableQuantityKg, 0);
      return { ...need, availableQuantityKg, shortageQuantityKg, estimatedShortageCost: shortageQuantityKg * need.unitCost };
    });
    const totalRequiredKg = itemRows.reduce((sum, item) => sum + item.requiredQuantityKg, 0);
    const totalAvailableKg = itemRows.reduce((sum, item) => sum + Math.min(item.availableQuantityKg, item.requiredQuantityKg), 0);
    const totalShortageKg = itemRows.reduce((sum, item) => sum + item.shortageQuantityKg, 0);

    const mrp = await this.prisma.$transaction(async (tx) => {
      const created = await tx.materialRequirementPlan.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          marketTargetId: plan.marketTargetId,
          productionPlanId: plan.id,
          centralWarehouseId: warehouseId,
          mrpNumber,
          totalRequiredKg,
          totalAvailableKg,
          totalShortageKg,
          status: totalShortageKg > 0 ? "SHORTAGE" : "READY_FOR_PRODUCTION",
          calculatedAt: new Date(),
          createdById: user.id
        }
      });
      const createdItems: Array<{ id: string; rawMaterialId: string; productionPlanItemId: string | null }> = [];
      for (const item of itemRows) {
        createdItems.push(
          await tx.materialRequirementItem.create({
            data: {
              companyId: user.companyId,
              materialRequirementPlanId: created.id,
              productionPlanItemId: item.productionPlanItemId,
              finishedProductId: item.finishedProductId,
              rawMaterialId: item.rawMaterialId,
              formulaId: item.formulaId,
              formulaVersionId: item.formulaVersionId,
              requiredQuantityKg: item.requiredQuantityKg,
              availableQuantityKg: item.availableQuantityKg,
              shortageQuantityKg: item.shortageQuantityKg,
              unitCost: item.unitCost,
              estimatedShortageCost: item.estimatedShortageCost
            }
          })
        );
      }
      await tx.inventoryAvailabilityCheck.createMany({
        data: itemRows.map((item) => ({
          companyId: user.companyId,
          materialRequirementPlanId: created.id,
          materialRequirementItemId: createdItems.find((row) => row.rawMaterialId === item.rawMaterialId && row.productionPlanItemId === item.productionPlanItemId)?.id,
          warehouseId,
          rawMaterialId: item.rawMaterialId,
          requiredQuantityKg: item.requiredQuantityKg,
          availableQuantityKg: item.availableQuantityKg,
          shortageQuantityKg: item.shortageQuantityKg,
          status: item.shortageQuantityKg <= 0 ? "AVAILABLE" : item.availableQuantityKg > 0 ? "PARTIAL" : "SHORTAGE",
          createdById: user.id
        }))
      });
      return { ...created, items: createdItems };
    });
    await this.writeAudit(user, "CREATE", "MaterialRequirementPlan", mrp.id, `Calculated MRP ${mrpNumber}`, context, { branchId: plan.branchId, productionSiteId: plan.productionSiteId, warehouseId });
    return { data: mrp };
  }

  async listMrpRuns(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const data = await this.prisma.materialRequirementPlan.findMany({
      where: this.mrpWhere(user, query),
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return { data };
  }

  async getMrp(user: AuthenticatedUser, id: string) {
    const mrp = await this.prisma.materialRequirementPlan.findFirst({ where: { ...this.mrpWhere(user, {}), id } });
    if (!mrp) throw new NotFoundException("Material requirement plan was not found.");
    const [items, checks, recommendations] = await Promise.all([
      this.prisma.materialRequirementItem.findMany({ where: { companyId: user.companyId, materialRequirementPlanId: id, deletedAt: null } }),
      this.prisma.inventoryAvailabilityCheck.findMany({ where: { companyId: user.companyId, materialRequirementPlanId: id, deletedAt: null } }),
      this.prisma.procurementRecommendation.findMany({ where: { companyId: user.companyId, materialRequirementPlanId: id, deletedAt: null } })
    ]);
    const products = await this.productMap(user.companyId, [...items.map((item) => item.rawMaterialId), ...items.map((item) => item.finishedProductId)]);
    return { data: { ...mrp, items: items.map((item) => ({ ...item, rawMaterial: products.get(item.rawMaterialId), finishedProduct: products.get(item.finishedProductId) })), checks, recommendations } };
  }

  // H-CRUD-1: same reasoning as deleteProductionPlan above — delete-only,
  // blocked once procurement recommendations have actually been generated
  // from this run (PROCUREMENT_RECOMMENDED+).
  async deleteMrp(user: AuthenticatedUser, id: string, context: RequestContext) {
    const mrp = await this.requireMrp(user, id);
    if (!["DRAFT", "CALCULATED", "SHORTAGE"].includes(mrp.status)) {
      throw new BadRequestException(`Cannot delete an MRP run that is ${mrp.status.toLowerCase()} — procurement recommendations may already depend on it.`);
    }
    await this.prisma.materialRequirementPlan.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "MaterialRequirementPlan", id, `Deleted MRP run ${mrp.mrpNumber}`, context, { branchId: mrp.branchId });
    return { success: true };
  }

  async generateProcurementRecommendations(user: AuthenticatedUser, mrpId: string, dto: GenerateProcurementRecommendationsDto, context: RequestContext) {
    const mrp = await this.requireMrp(user, mrpId);
    const shortageItems = await this.prisma.materialRequirementItem.findMany({
      where: { companyId: user.companyId, materialRequirementPlanId: mrpId, deletedAt: null, shortageQuantityKg: { gt: 0 } }
    });
    if (!shortageItems.length) throw new BadRequestException("No material shortage exists for this MRP.");
    const recommendations = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of shortageItems) {
        // M-BUG (2026-08-13): calculateMrp always creates a brand-new
        // MaterialRequirementPlan row on every "recalculate" — this dedup
        // check used to be scoped to materialRequirementPlanId: mrp.id, so
        // it only ever looked within the CURRENT run, which is always fresh
        // and therefore never has any recommendations of its own yet.
        // Recalculating then generating recommendations twice for the same
        // target created two separate OPEN recommendations for the same
        // shortage. marketTargetId is the one thing that stays stable
        // across recalculations, so dedupe against it instead.
        const exists = await tx.procurementRecommendation.findFirst({
          where: { companyId: user.companyId, marketTargetId: mrp.marketTargetId, rawMaterialId: item.rawMaterialId, status: "OPEN", deletedAt: null }
        });
        if (exists) {
          created.push(exists);
          continue;
        }
        created.push(
          await tx.procurementRecommendation.create({
            data: {
              companyId: user.companyId,
              branchId: mrp.branchId,
              marketTargetId: mrp.marketTargetId,
              materialRequirementPlanId: mrp.id,
              materialRequirementItemId: item.id,
              rawMaterialId: item.rawMaterialId,
              recommendedQuantityKg: item.shortageQuantityKg,
              estimatedUnitCost: item.unitCost,
              estimatedTotalCost: item.estimatedShortageCost,
              notes: dto.notes,
              createdById: user.id
            }
          })
        );
      }
      await tx.materialRequirementPlan.update({ where: { id: mrp.id }, data: { status: "PROCUREMENT_RECOMMENDED", updatedById: user.id } });
      return created;
    });
    await this.writeAudit(user, "CREATE", "ProcurementRecommendation", mrp.id, `Generated procurement recommendations for ${mrp.mrpNumber}`, context, { branchId: mrp.branchId, warehouseId: mrp.centralWarehouseId });
    return { data: recommendations };
  }

  async listRecommendations(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const rows = await this.prisma.procurementRecommendation.findMany({ where: this.recommendationWhere(user, query), orderBy: { createdAt: "desc" } });
    const products = await this.productMap(user.companyId, rows.map((row) => row.rawMaterialId));
    return { data: rows.map((row) => ({ ...row, rawMaterial: products.get(row.rawMaterialId) })) };
  }

  // H-CRUD-1: same reasoning as deleteProductionPlan/deleteMrp above, but
  // using status: CANCELLED rather than deletedAt — this table already
  // distinguishes "actionable" (OPEN) from "no longer relevant"
  // (CONVERTED_TO_PR / CANCELLED), and keeping a cancelled recommendation
  // visible in list/history (rather than hiding it via soft-delete) matches
  // how rejected purchase orders/requests behave elsewhere in this codebase.
  async cancelRecommendation(user: AuthenticatedUser, id: string, context: RequestContext) {
    const recommendation = await this.prisma.procurementRecommendation.findFirst({ where: { ...this.recommendationWhere(user, {}), id } });
    if (!recommendation) throw new NotFoundException("Procurement recommendation was not found.");
    if (recommendation.status !== "OPEN") {
      throw new BadRequestException(`Cannot cancel a recommendation that is already ${recommendation.status.toLowerCase().replace(/_/g, " ")}.`);
    }
    const updated = await this.prisma.procurementRecommendation.update({ where: { id }, data: { status: "CANCELLED", updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "ProcurementRecommendation", id, "Cancelled procurement recommendation", context, { branchId: recommendation.branchId });
    return { data: updated };
  }

  async convertRecommendationToPurchaseRequest(user: AuthenticatedUser, id: string, dto: ConvertRecommendationDto, context: RequestContext) {
    const recommendation = await this.prisma.procurementRecommendation.findFirst({ where: { ...this.recommendationWhere(user, {}), id } });
    if (!recommendation) throw new NotFoundException("Procurement recommendation was not found.");
    if (recommendation.status !== "OPEN") throw new BadRequestException("Only open recommendations can be converted.");
    const product = await this.getProduct(user.companyId, recommendation.rawMaterialId);
    const reference = await nextRef(this.prisma, user.companyId, "PR");
    const totalEstimate = num(recommendation.recommendedQuantityKg) * num(recommendation.estimatedUnitCost);

    const purchaseRequest = await this.prisma.$transaction(async (tx) => {
      const row = await tx.purchaseRequest.create({
        data: {
          companyId: user.companyId,
          reference,
          title: `MRP shortage: ${product.name}`,
          marketTargetId: recommendation.marketTargetId,
          materialRequirementPlanId: recommendation.materialRequirementPlanId,
          procurementRecommendationId: recommendation.id,
          requestedById: user.id,
          branchId: recommendation.branchId,
          requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
          totalEstimate,
          notes: dto.notes ?? recommendation.notes,
          createdById: user.id,
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              quantity: recommendation.recommendedQuantityKg,
              uomCode: "KG",
              estimatedUnitCost: recommendation.estimatedUnitCost,
              description: `Material shortage from ${recommendation.materialRequirementPlanId}`,
              sequence: 1
            }
          }
        } as Prisma.PurchaseRequestUncheckedCreateInput,
        include: { items: true }
      });
      await tx.procurementRecommendation.update({
        where: { id: recommendation.id },
        data: { status: "CONVERTED_TO_PR", purchaseRequestId: row.id, convertedAt: new Date(), updatedById: user.id }
      });
      return row;
    });
    await this.writeAudit(user, "CREATE", "PurchaseRequest", purchaseRequest.id, `Converted MRP recommendation to purchase request ${reference}`, context, { branchId: recommendation.branchId });
    return { data: purchaseRequest };
  }

  async createProductionExecution(user: AuthenticatedUser, dto: CreateProductionExecutionDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.rawMaterialWarehouseId);
    this.assertWarehouseAccess(user, dto.finishedGoodsWarehouseId);
    const planItem = await this.prisma.productionPlanItem.findFirst({ where: { id: dto.productionPlanItemId, companyId: user.companyId, deletedAt: null } });
    if (!planItem) throw new NotFoundException("Production plan item was not found.");
    const plan = await this.requireProductionPlan(user, planItem.productionPlanId);
    const formula = await this.getFormulaForExecution(user.companyId, planItem.formulaId ?? undefined);
    const inputQuantityKg = dto.producedQuantityKg + (dto.wastageKg ?? 0);
    const ingredientPlan = await this.executionMaterialAvailability(user.companyId, formula.id, planItem.formulaVersionId, dto.rawMaterialWarehouseId, inputQuantityKg);
    const shortages = ingredientPlan.filter((item) => item.shortageKg > 0);
    if (shortages.length) throw new BadRequestException({ message: "Raw material stock is not sufficient for this production execution.", shortages });

    const [orderNumber, batchNumber, executionRef] = await Promise.all([
      nextRef(this.prisma, user.companyId, "FPO"),
      nextRef(this.prisma, user.companyId, "FB"),
      nextRef(this.prisma, user.companyId, "PE"),
    ]);
    const rawMaterialCost = ingredientPlan.reduce((sum, item) => sum + item.quantityKg * item.unitCost, 0);
    const totalCost = rawMaterialCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    const unitCost = totalCost / Math.max(dto.producedQuantityKg, 1);
    const product = await this.getProduct(user.companyId, planItem.productId);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.feedProductionOrder.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          productionSiteId: plan.productionSiteId,
          formulaId: formula.id,
          finishedProductId: planItem.productId,
          orderNumber,
          plannedQuantityKg: planItem.plannedQuantityKg,
          scheduledDate: new Date(),
          status: "APPROVED",
          rawMaterialWarehouseId: dto.rawMaterialWarehouseId,
          marketTargetId: plan.marketTargetId,
          productionPlanId: plan.id,
          productionPlanItemId: planItem.id,
          notes: `Generated from market-led production execution ${executionRef}`,
          createdById: user.id
        } as Prisma.FeedProductionOrderUncheckedCreateInput
      });
      const execution = await tx.productionExecution.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          marketTargetId: plan.marketTargetId,
          productionPlanId: plan.id,
          productionPlanItemId: planItem.id,
          feedProductionOrderId: order.id,
          productId: planItem.productId,
          plannedQuantityKg: planItem.plannedQuantityKg,
          producedQuantityKg: dto.producedQuantityKg,
          rawMaterialWarehouseId: dto.rawMaterialWarehouseId,
          finishedGoodsWarehouseId: dto.finishedGoodsWarehouseId,
          status: "STARTED",
          startedAt: new Date(),
          notes: dto.notes,
          createdById: user.id
        }
      });
      const batch = await tx.feedProductionBatch.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          productionSiteId: plan.productionSiteId,
          productionOrderId: order.id,
          finishedProductId: planItem.productId,
          batchNumber,
          producedQuantityKg: dto.producedQuantityKg,
          wastageKg: dto.wastageKg ?? 0,
          productionDate: new Date(),
          status: "POSTED",
          marketTargetId: plan.marketTargetId,
          productionPlanId: plan.id,
          productionExecutionId: execution.id,
          createdById: user.id
        } as Prisma.FeedProductionBatchUncheckedCreateInput
      });

      for (const ingredient of ingredientPlan) {
        const inventory = await this.consumeInventoryTx(tx, user.companyId, dto.rawMaterialWarehouseId, ingredient.ingredientId, ingredient.quantityKg, user.id, ingredient.productName);
        await tx.feedRawMaterialUsage.create({
          data: {
            companyId: user.companyId,
            branchId: plan.branchId,
            productionSiteId: plan.productionSiteId,
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
            branchId: plan.branchId,
            productId: ingredient.ingredientId,
            inventoryItemId: inventory.id,
            fromWarehouseId: dto.rawMaterialWarehouseId,
            productionSiteId: plan.productionSiteId,
            uomId: inventory.uomId,
            movementType: "PRODUCTION_INPUT",
            quantity: ingredient.quantityKg,
            unitCost: ingredient.unitCost,
            referenceType: "ProductionExecution",
            referenceId: execution.id,
            notes: `Raw material issued for ${batch.batchNumber}`,
            createdById: user.id
          }
        });
      }

      const finishedInventory = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.finishedGoodsWarehouseId, productId: planItem.productId } },
        update: { quantityOnHand: { increment: dto.producedQuantityKg }, updatedById: user.id },
        create: {
          companyId: user.companyId,
          branchId: plan.branchId,
          warehouseId: dto.finishedGoodsWarehouseId,
          productionSiteId: plan.productionSiteId,
          productId: planItem.productId,
          uomId: product.uomId,
          quantityOnHand: dto.producedQuantityKg,
          createdById: user.id
        }
      });
      const stockBatch = await tx.stockBatch.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          warehouseId: dto.finishedGoodsWarehouseId,
          productionSiteId: plan.productionSiteId,
          productId: planItem.productId,
          inventoryItemId: finishedInventory.id,
          uomId: product.uomId,
          batchNumber,
          quantityReceived: dto.producedQuantityKg,
          quantityRemaining: dto.producedQuantityKg,
          unitCost,
          manufactureDate: new Date(),
          createdById: user.id
        }
      });
      await tx.finishedFeedStock.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          productionSiteId: plan.productionSiteId,
          warehouseId: dto.finishedGoodsWarehouseId,
          productionBatchId: batch.id,
          productId: planItem.productId,
          quantityKg: dto.producedQuantityKg,
          bag50KgCount: Math.floor(dto.producedQuantityKg / 50),
          unitCost
        }
      });
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          productId: planItem.productId,
          inventoryItemId: finishedInventory.id,
          stockBatchId: stockBatch.id,
          toWarehouseId: dto.finishedGoodsWarehouseId,
          warehouseId: dto.finishedGoodsWarehouseId,
          productionSiteId: plan.productionSiteId,
          uomId: product.uomId,
          movementType: "PRODUCTION_OUTPUT",
          quantity: dto.producedQuantityKg,
          unitCost,
          referenceType: "ProductionExecution",
          referenceId: execution.id,
          notes: `Finished feed received from ${batch.batchNumber}`,
          createdById: user.id
        }
      });
      await tx.feedProductionCost.create({
        data: {
          companyId: user.companyId,
          branchId: plan.branchId,
          productionSiteId: plan.productionSiteId,
          productionBatchId: batch.id,
          rawMaterialCost,
          laborCost: dto.laborCost ?? 0,
          packagingCost: dto.packagingCost ?? 0,
          overheadCost: dto.overheadCost ?? 0,
          expectedSalesValue: 0,
          createdById: user.id
        }
      });
      await tx.feedProductionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", updatedById: user.id } });
      await tx.productionExecution.update({ where: { id: execution.id }, data: { status: "COMPLETED", feedProductionBatchId: batch.id, completedAt: new Date(), updatedById: user.id } });
      const producedQuantityKg = num(planItem.producedQuantityKg) + dto.producedQuantityKg;
      await tx.productionPlanItem.update({
        where: { id: planItem.id },
        data: {
          producedQuantityKg,
          status: producedQuantityKg >= num(planItem.plannedQuantityKg) ? "COMPLETED" : "IN_PROGRESS",
          updatedById: user.id
        }
      });
      const remaining = await tx.productionPlanItem.count({ where: { companyId: user.companyId, productionPlanId: plan.id, deletedAt: null, status: { not: "COMPLETED" } } });
      await tx.productionPlan.update({ where: { id: plan.id }, data: { status: remaining <= 1 ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id } });
      return { execution, order, batch, costing: { rawMaterialCost, totalCost, unitCost } };
    });
    await this.writeAudit(user, "CREATE", "ProductionExecution", result.execution.id, `Completed market-led feed production batch ${batchNumber}`, context, { branchId: plan.branchId, productionSiteId: plan.productionSiteId, warehouseId: dto.finishedGoodsWarehouseId });
    return { data: result };
  }

  async targetVsActualReport(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    // M16: was unbounded — each target below also fans out into several more
    // queries in buildTargetVsActual, so an uncapped target list here was the
    // most expensive place for this endpoint to go unbounded.
    const targets = await this.prisma.marketTarget.findMany({ where: this.targetWhere(user, query), orderBy: { periodStart: "desc" }, take: 200 });
    const rows = [];
    for (const target of targets) {
      rows.push(await this.buildTargetVsActual(user, target.id));
    }
    return { data: rows };
  }

  async demandVsSalesReport(user: AuthenticatedUser, query: MarketPlanningQueryDto) {
    const report = await this.targetVsActualReport(user, query);
    return {
      data: report.data.map((row) => ({
        marketTargetId: row.marketTargetId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        demandKg: row.targetKg,
        salesKg: row.actualSalesKg,
        demandGapKg: row.targetKg - row.actualSalesKg,
        salesAchievementPct: row.salesAchievementPct
      }))
    };
  }

  private async buildTargetVsActual(user: AuthenticatedUser, marketTargetId: string) {
    const target = await this.requireTarget(user, marketTargetId);
    const [targetItems, plans, mrps, recommendations, batches, sales] = await Promise.all([
      this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.productionPlan.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.materialRequirementPlan.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.procurementRecommendation.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.feedProductionBatch.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null }, select: { producedQuantityKg: true } }),
      this.prisma.salesOrder.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null }, include: { items: true } })
    ]);
    const productIds = targetItems.map((item) => item.productId);
    const finishedInventory = productIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { companyId: user.companyId, deletedAt: null, productId: { in: productIds } }, select: { quantityOnHand: true } })
      : [];
    const targetKg = targetItems.reduce((sum, item) => sum + num(item.targetQuantityKg), 0);
    const productionTargetKg = plans.reduce((sum, item) => sum + num(item.totalPlannedKg), 0);
    const requiredRawMaterialKg = mrps.reduce((sum, item) => sum + num(item.totalRequiredKg), 0);
    const procuredRawMaterialKg = recommendations.filter((row) => row.status === "CONVERTED_TO_PR").reduce((sum, item) => sum + num(item.recommendedQuantityKg), 0);
    const actualProducedKg = batches.reduce((sum, item) => sum + num(item.producedQuantityKg), 0);
    const finishedGoodsKg = finishedInventory.reduce((sum, item) => sum + num(item.quantityOnHand), 0);
    const actualSalesKg = sales.flatMap((order) => order.items).reduce((sum, item) => sum + num(item.quantity), 0);
    return {
      marketTargetId,
      productionPlanId: plans[0]?.id,
      branchId: target.branchId,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      targetKg,
      productionTargetKg,
      requiredRawMaterialKg,
      procuredRawMaterialKg,
      actualProducedKg,
      finishedGoodsKg,
      actualSalesKg,
      targetAchievementPct: pct(actualProducedKg, targetKg),
      salesAchievementPct: pct(actualSalesKg, targetKg)
    };
  }

  // H-BUG-2 (2026-08-13): FeedFormulaVersion.ingredientSnapshot exists
  // specifically to lock a formula's exact ratios at a point in time, but
  // nothing ever read it — both MRP and production execution always
  // re-read today's LIVE feedFormulaIngredient rows regardless of which
  // version a plan item says it's locked to. Editing a formula would
  // silently change the ratios for every plan already approved against an
  // older version. The snapshot only stores {sku, name, quantityKg,
  // unitCost} (no ingredientId — see feed-production.service.ts's
  // createVersion), so each entry is resolved back to a live Product by
  // SKU; a SKU that can no longer be matched (renamed/deleted since the
  // lock) fails loudly rather than silently dropping that raw material.
  // Returns null when no version is locked, meaning "use the live formula"
  // (the pre-existing, still-valid behavior for un-versioned targets).
  private async lockedFormulaIngredients(companyId: string, formulaId: string, formulaVersionId: string | null | undefined) {
    if (!formulaVersionId) return null;
    const version = await this.prisma.feedFormulaVersion.findFirst({ where: { id: formulaVersionId, companyId, formulaId } });
    if (!version) throw new NotFoundException("The locked feed formula version was not found.");
    const snapshot = version.ingredientSnapshot as unknown as Array<{ sku: string; name: string; quantityKg: number; unitCost: number }>;
    if (!snapshot.length) throw new BadRequestException(`Formula version ${version.versionNo} has no ingredients in its locked snapshot.`);
    const products = await this.prisma.product.findMany({ where: { companyId, sku: { in: snapshot.map((s) => s.sku) }, deletedAt: null } });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    return snapshot.map((entry) => {
      const product = bySku.get(entry.sku);
      if (!product) throw new BadRequestException(`Formula version ${version.versionNo}'s ingredient "${entry.name}" (SKU ${entry.sku}) could not be matched to a current product — it may have been renamed or deleted since this version was locked.`);
      return { ingredientId: product.id, name: entry.name, sku: entry.sku, quantityKg: num(entry.quantityKg), unitCost: num(entry.unitCost) };
    });
  }

  // H-BUG-2 (2026-08-13): mirrors inventory.service.ts's assertAvailable —
  // stock actively reserved for something else (StockReservation,
  // status ACTIVE and not expired) was previously ignored entirely here,
  // so a material check could report "ready to produce" and an actual
  // production run could consume stock that was supposed to be held back
  // for a different purpose.
  private async availableQuantity(inventoryItemId: string, quantityOnHand: number) {
    const reservations = await this.prisma.stockReservation.findMany({
      where: { inventoryItemId, status: "ACTIVE", deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { quantity: true }
    });
    const reserved = reservations.reduce((sum, r) => sum + num(r.quantity), 0);
    return Math.max(quantityOnHand - reserved, 0);
  }

  private async calculateIngredientNeeds(companyId: string, planItems: Array<{ id: string; productId: string; formulaId: string | null; formulaVersionId: string | null; plannedQuantityKg: Prisma.Decimal }>) {
    const needs: IngredientNeed[] = [];
    for (const item of planItems) {
      const formula = await this.resolveFormula(companyId, item.productId, item.formulaId ?? undefined);
      const ratio = num(item.plannedQuantityKg) / Math.max(num(formula.targetBatchKg), 1);
      const locked = await this.lockedFormulaIngredients(companyId, formula.id, item.formulaVersionId);
      const ingredients =
        locked ??
        (await this.prisma.feedFormulaIngredient.findMany({ where: { companyId, formulaId: formula.id, deletedAt: null } })).map((i) => ({
          ingredientId: i.ingredientId,
          quantityKg: num(i.quantityKg),
          unitCost: num(i.unitCost)
        }));
      if (!ingredients.length) throw new BadRequestException(`Formula ${formula.code} has no ingredients.`);
      for (const ingredient of ingredients) {
        needs.push({
          productionPlanItemId: item.id,
          finishedProductId: item.productId,
          rawMaterialId: ingredient.ingredientId,
          formulaId: formula.id,
          formulaVersionId: item.formulaVersionId,
          requiredQuantityKg: ingredient.quantityKg * ratio,
          unitCost: ingredient.unitCost
        });
      }
    }
    return needs;
  }

  private async executionMaterialAvailability(companyId: string, formulaId: string, formulaVersionId: string | null | undefined, warehouseId: string, inputQuantityKg: number) {
    const formula = await this.prisma.feedFormula.findFirst({ where: { id: formulaId, companyId, deletedAt: null } });
    if (!formula) throw new NotFoundException("Feed formula was not found.");
    const ratio = inputQuantityKg / Math.max(num(formula.targetBatchKg), 1);
    const locked = await this.lockedFormulaIngredients(companyId, formula.id, formulaVersionId);
    const ingredients =
      locked ??
      (
        await this.prisma.feedFormulaIngredient.findMany({
          where: { companyId, formulaId, deletedAt: null },
          include: { ingredient: { select: { name: true, sku: true } } },
          orderBy: { sortOrder: "asc" }
        })
      ).map((i) => ({ ingredientId: i.ingredientId, name: i.ingredient.name, sku: i.ingredient.sku, quantityKg: num(i.quantityKg), unitCost: num(i.unitCost) }));
    const result = [];
    for (const ingredient of ingredients) {
      const quantityKg = ingredient.quantityKg * ratio;
      const inventory = await this.prisma.inventoryItem.findUnique({
        where: { companyId_warehouseId_productId: { companyId, warehouseId, productId: ingredient.ingredientId } }
      });
      const availableKg = inventory ? await this.availableQuantity(inventory.id, num(inventory.quantityOnHand)) : 0;
      result.push({
        ingredientId: ingredient.ingredientId,
        productName: ingredient.name,
        sku: ingredient.sku,
        quantityKg,
        unitCost: ingredient.unitCost,
        availableKg,
        shortageKg: Math.max(quantityKg - availableKg, 0)
      });
    }
    return result;
  }

  private async inventoryAvailability(companyId: string, warehouseId: string, productIds: string[]) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { companyId, warehouseId, productId: { in: [...new Set(productIds)] }, deletedAt: null },
      select: { id: true, productId: true, quantityOnHand: true }
    });
    const map = new Map<string, { quantityOnHand: number }>();
    for (const row of rows) {
      // Field is still named quantityOnHand for the caller's sake, but the
      // value is now net of active reservations — see availableQuantity.
      map.set(row.productId, { quantityOnHand: await this.availableQuantity(row.id, num(row.quantityOnHand)) });
    }
    return map;
  }

  // Previously this only checked quantityOnHand > 0 (present at all), not
  // sufficient for the amount actually needed — and the caller's separate,
  // unguarded `update` decrement ran outside any floor check. Two concurrent
  // executions against the same warehouse/ingredient could each pass the
  // pre-flight shortage check individually and both decrement, driving stock
  // negative. Now does a single atomic guarded decrement (matching
  // consumeFifoTx's pattern elsewhere) so insufficient-or-since-consumed
  // stock is caught at the exact moment of the write, not before it.
  //
  // H-BUG-2 (2026-08-12): the aggregate decrement above only protects
  // against overselling — it says nothing about WHICH physical lot the
  // stock came from. This is a second, independent production-execution
  // path from feed-production.service.ts's own createBatch (that one
  // already does per-lot FIFO consumption correctly); this one didn't, so
  // a raw-material lot Quality had quarantined could still be consumed
  // here as if it were clean, and the lot's own quantityRemaining was
  // never touched — permanently drifting from quantityOnHand. Mirrors
  // feed-production.service.ts's createBatch FIFO loop exactly.
  private async consumeInventoryTx(tx: Tx, companyId: string, warehouseId: string, productId: string, quantity: number, updatedById: string, productName?: string) {
    const label = productName ?? productId;
    const result = await tx.inventoryItem.updateMany({
      where: { companyId, warehouseId, productId, quantityOnHand: { gte: quantity } },
      data: { quantityOnHand: { decrement: quantity }, updatedById }
    });
    if (result.count === 0) {
      throw new BadRequestException("Inventory item is missing or does not have enough stock for this production execution.");
    }

    let remaining = quantity;
    const stockBatches = await tx.stockBatch.findMany({
      where: { companyId, warehouseId, productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
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
        throw new BadRequestException(`Stock batch for "${label}" was consumed concurrently. Please retry.`);
      }
      remaining -= consumed;
    }
    if (remaining > 0) {
      throw new BadRequestException(`Stock batches on hand for "${label}" cover only ${(quantity - remaining).toFixed(2)}kg of the required ${quantity}kg — inventory and lot records are out of sync, or the remaining stock is quarantined. Please investigate before retrying.`);
    }

    // Safe to read separately now — the guarded decrement above already
    // succeeded atomically; this just fetches identifying fields (id/uomId
    // don't change) for the stock-movement record.
    return tx.inventoryItem.findFirstOrThrow({
      where: { companyId, warehouseId, productId },
      select: { id: true, uomId: true }
    });
  }

  private async requireTarget(user: AuthenticatedUser, id: string) {
    const target = await this.prisma.marketTarget.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!target) throw new NotFoundException("Market target was not found.");
    if (target.branchId) this.assertBranchAccess(user, target.branchId);
    if (target.productionSiteId) this.assertProductionSiteAccess(user, target.productionSiteId);
    return target;
  }

  private async requireProductionPlan(user: AuthenticatedUser, id: string) {
    const plan = await this.prisma.productionPlan.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!plan) throw new NotFoundException("Production plan was not found.");
    this.assertBranchAccess(user, plan.branchId);
    this.assertProductionSiteAccess(user, plan.productionSiteId);
    this.assertWarehouseAccess(user, plan.centralWarehouseId);
    return plan;
  }

  private async requireMrp(user: AuthenticatedUser, id: string) {
    const mrp = await this.prisma.materialRequirementPlan.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!mrp) throw new NotFoundException("Material requirement plan was not found.");
    this.assertBranchAccess(user, mrp.branchId);
    this.assertWarehouseAccess(user, mrp.centralWarehouseId);
    return mrp;
  }

  private async requireProductionSite(user: AuthenticatedUser, id: string) {
    const site = await this.prisma.productionSite.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!site) throw new NotFoundException("Production site was not found.");
    this.assertProductionSiteAccess(user, id);
    return site;
  }

  private async requireWarehouse(user: AuthenticatedUser, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    this.assertWarehouseAccess(user, id);
    return warehouse;
  }

  private async getProduct(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId, deletedAt: null }, select: { id: true, sku: true, name: true, uomId: true, branchId: true } });
    if (!product) throw new NotFoundException("Product was not found.");
    return product;
  }

  private async productMap(companyId: string, productIds: string[]) {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const products = await this.prisma.product.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, sku: true, name: true } });
    return new Map(products.map((product) => [product.id, product]));
  }

  // M-BUG (2026-08-13): the ACTIVE-only status check only ever applied when
  // the system auto-picked a formula (the finishedProductId branch below) —
  // when a specific formulaId was already attached to a plan item (the
  // normal case, once a target has been created), its status was never
  // re-checked, so a discontinued or still-draft formula could still be
  // used for real production just by referencing its id directly.
  private async resolveFormula(companyId: string, productId: string, formulaId?: string) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { companyId, deletedAt: null, status: "ACTIVE", ...(formulaId ? { id: formulaId } : { finishedProductId: productId }) },
      orderBy: { updatedAt: "desc" }
    });
    if (!formula) throw new BadRequestException("An active feed formula is required for each market target product.");
    return formula;
  }

  private async getFormulaForExecution(companyId: string, formulaId?: string) {
    if (!formulaId) throw new BadRequestException("Production plan item is missing a feed formula.");
    const formula = await this.prisma.feedFormula.findFirst({ where: { id: formulaId, companyId, deletedAt: null, status: "ACTIVE" } });
    if (!formula) throw new NotFoundException("Feed formula was not found, or is no longer active.");
    return formula;
  }

  private async activeFormulaVersion(companyId: string, formulaId: string) {
    return this.prisma.feedFormulaVersion.findFirst({ where: { companyId, formulaId, status: "ACTIVE" }, orderBy: { versionNo: "desc" } });
  }

  private async getFormulaVersion(companyId: string, formulaVersionId: string, formulaId: string) {
    const version = await this.prisma.feedFormulaVersion.findFirst({ where: { id: formulaVersionId, companyId, formulaId } });
    if (!version) throw new NotFoundException("Feed formula version was not found.");
    return version;
  }

  private targetWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.MarketTargetWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.period ? { period: query.period } : {}),
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(MarketPlanningStatus)) as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.productionSiteId ? { productionSiteId: query.productionSiteId } : {}),
      ...(query.startDate || query.endDate ? { periodStart: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } } : {}),
      ...(user.hasGlobalAccess || (user.branchIds.length === 0 && user.productionSiteIds.length === 0) ? {} : { OR: [{ branchId: null }, ...(user.branchIds.length ? [{ branchId: { in: user.branchIds } }] : []), ...(user.productionSiteIds.length ? [{ productionSiteId: { in: user.productionSiteIds } }] : [])] })
    };
  }

  private productionPlanWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.ProductionPlanWhereInput {
    const accessFilter: Prisma.ProductionPlanWhereInput = user.hasGlobalAccess
      ? {}
      : {
          OR: [
            ...(user.branchIds.length ? [{ branchId: { in: user.branchIds } }] : []),
            ...(user.productionSiteIds.length ? [{ productionSiteId: { in: user.productionSiteIds } }] : []),
            ...(user.warehouseIds.length ? [{ centralWarehouseId: { in: user.warehouseIds } }] : []),
            // If the user has no access entries at all, OR [] would be vacuously true.
            // Force a never-match so they see no plans rather than all plans.
            ...(!user.branchIds.length && !user.productionSiteIds.length && !user.warehouseIds.length ? [{ id: "__no_access__" }] : []),
          ],
        };
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(ProductionPlanStatus)) as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.productionSiteId ? { productionSiteId: query.productionSiteId } : {}),
      ...(query.warehouseId ? { centralWarehouseId: query.warehouseId } : {}),
      ...accessFilter,
    };
  }

  private mrpWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.MaterialRequirementPlanWhereInput {
    const accessFilter: Prisma.MaterialRequirementPlanWhereInput = user.hasGlobalAccess
      ? {}
      : {
          OR: [
            ...(user.branchIds.length ? [{ branchId: { in: user.branchIds } }] : []),
            ...(user.warehouseIds.length ? [{ centralWarehouseId: { in: user.warehouseIds } }] : []),
            ...(!user.branchIds.length && !user.warehouseIds.length ? [{ id: "__no_access__" }] : []),
          ],
        };
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(MaterialRequirementPlanStatus)) as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.warehouseId ? { centralWarehouseId: query.warehouseId } : {}),
      ...accessFilter,
    };
  }

  private recommendationWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.ProcurementRecommendationWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(ProcurementRecommendationStatus)) as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(user.hasGlobalAccess ? {} : user.branchIds.length ? { branchId: { in: user.branchIds } } : { id: "__no_access__" }),
    };
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (!user.hasGlobalAccess && !user.branchIds.includes(branchId)) {
      throw new ForbiddenException("You do not have access to this branch.");
    }
  }

  private assertProductionSiteAccess(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && !user.productionSiteIds.includes(productionSiteId)) {
      throw new ForbiddenException("You do not have access to this production site.");
    }
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException("You do not have access to this warehouse.");
    }
  }

  private async writeAudit(user: AuthenticatedUser, action: any, entityType: string, entityId: string, message: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string; productionSiteId?: string }) {
    await this.audit.write({
      companyId: user.companyId,
      branchId: scope.branchId,
      warehouseId: scope.warehouseId,
      productionSiteId: scope.productionSiteId,
      actorUserId: user.id,
      action,
      entityType,
      entityId,
      summary: message,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
  }
}
