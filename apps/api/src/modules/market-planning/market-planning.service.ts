import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AdjustTargetItemDto,
  ApproveMarketTargetDto,
  CalculateMrpDto,
  ConvertRecommendationDto,
  CreateMarketTargetDto,
  CreateProductionExecutionDto,
  GenerateProcurementRecommendationsDto,
  MarketPlanningQueryDto
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
          ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } })
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
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } }) },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.productionSite.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["FEED_PRODUCTION", "MIXED"] }, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) },
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

    const count = await this.prisma.marketTarget.count({ where: { companyId: user.companyId } });
    const targetNumber = await this.nextDocumentNumber(user.companyId, "MT", count);
    const items = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.getProduct(user.companyId, item.productId);
        const formula = await this.resolveFormula(user.companyId, item.productId, item.formulaId);
        const version = item.formulaVersionId
          ? await this.getFormulaVersion(user.companyId, item.formulaVersionId, formula.id)
          : await this.activeFormulaVersion(user.companyId, formula.id);
        const finalTargetQuantity = item.baseQuantity * (1 + (item.adjustmentPercent ?? 0) / 100);
        const bagSizeKg = item.bagSizeKg ?? 50;
        return {
          companyId: user.companyId,
          productId: product.id,
          formulaId: formula.id,
          formulaVersionId: version?.id,
          baseQuantity: item.baseQuantity,
          adjustmentPercent: item.adjustmentPercent ?? 0,
          finalTargetQuantity,
          bagSizeKg,
          targetQuantityKg: finalTargetQuantity * bagSizeKg,
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
    return { data: target };
  }

  async submitTarget(user: AuthenticatedUser, id: string, context: RequestContext) {
    const target = await this.requireTarget(user, id);
    const updated = await this.prisma.marketTarget.update({ where: { id }, data: { status: "SUBMITTED", updatedById: user.id } });
    await this.prisma.marketTargetItem.updateMany({ where: { companyId: user.companyId, marketTargetId: id, deletedAt: null }, data: { approvalStatus: "SUBMITTED", updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "MarketTarget", id, `Submitted market target ${target.targetNumber}`, context, { branchId: target.branchId ?? undefined, productionSiteId: target.productionSiteId ?? undefined });
    return { data: updated };
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
    const count = await this.prisma.productionPlan.count({ where: { companyId: user.companyId } });
    const planNumber = await this.nextDocumentNumber(user.companyId, "PP", count);
    const totalPlannedKg = items.reduce((sum, item) => sum + num(item.targetQuantityKg), 0);

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.marketTarget.update({
        where: { id },
        data: { status: "APPROVED", branchId, productionSiteId: site.id, approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
      });
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

  async calculateMrp(user: AuthenticatedUser, productionPlanId: string, dto: CalculateMrpDto, context: RequestContext) {
    const plan = await this.requireProductionPlan(user, productionPlanId);
    const warehouseId = dto.centralWarehouseId ?? plan.centralWarehouseId;
    await this.requireWarehouse(user, warehouseId);
    const planItems = await this.prisma.productionPlanItem.findMany({ where: { companyId: user.companyId, productionPlanId, deletedAt: null } });
    if (!planItems.length) throw new BadRequestException("Production plan has no items to calculate.");
    const needs = await this.calculateIngredientNeeds(user.companyId, planItems);
    const availability = await this.inventoryAvailability(user.companyId, warehouseId, needs.map((need) => need.rawMaterialId));
    const count = await this.prisma.materialRequirementPlan.count({ where: { companyId: user.companyId } });
    const mrpNumber = await this.nextDocumentNumber(user.companyId, "MRP", count);

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

  async generateProcurementRecommendations(user: AuthenticatedUser, mrpId: string, dto: GenerateProcurementRecommendationsDto, context: RequestContext) {
    const mrp = await this.requireMrp(user, mrpId);
    const shortageItems = await this.prisma.materialRequirementItem.findMany({
      where: { companyId: user.companyId, materialRequirementPlanId: mrpId, deletedAt: null, shortageQuantityKg: { gt: 0 } }
    });
    if (!shortageItems.length) throw new BadRequestException("No material shortage exists for this MRP.");
    const recommendations = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of shortageItems) {
        const exists = await tx.procurementRecommendation.findFirst({
          where: { companyId: user.companyId, materialRequirementPlanId: mrp.id, materialRequirementItemId: item.id, status: "OPEN", deletedAt: null }
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

  async convertRecommendationToPurchaseRequest(user: AuthenticatedUser, id: string, dto: ConvertRecommendationDto, context: RequestContext) {
    const recommendation = await this.prisma.procurementRecommendation.findFirst({ where: { ...this.recommendationWhere(user, {}), id } });
    if (!recommendation) throw new NotFoundException("Procurement recommendation was not found.");
    if (recommendation.status !== "OPEN") throw new BadRequestException("Only open recommendations can be converted.");
    const product = await this.getProduct(user.companyId, recommendation.rawMaterialId);
    const count = await this.prisma.purchaseRequest.count({ where: { companyId: user.companyId } });
    const reference = await this.nextDocumentNumber(user.companyId, "PR", count);
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
    const ingredientPlan = await this.executionMaterialAvailability(user.companyId, formula.id, dto.rawMaterialWarehouseId, inputQuantityKg);
    const shortages = ingredientPlan.filter((item) => item.shortageKg > 0);
    if (shortages.length) throw new BadRequestException({ message: "Raw material stock is not sufficient for this production execution.", shortages });

    const orderCount = await this.prisma.feedProductionOrder.count({ where: { companyId: user.companyId } });
    const batchCount = await this.prisma.feedProductionBatch.count({ where: { companyId: user.companyId } });
    const executionCount = await this.prisma.productionExecution.count({ where: { companyId: user.companyId } });
    const orderNumber = await this.nextDocumentNumber(user.companyId, "FPO", orderCount);
    const batchNumber = await this.nextDocumentNumber(user.companyId, "FB", batchCount);
    const executionRef = await this.nextDocumentNumber(user.companyId, "PE", executionCount);
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
        const inventory = await this.requireInventory(tx, user.companyId, dto.rawMaterialWarehouseId, ingredient.ingredientId);
        await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantityOnHand: { decrement: ingredient.quantityKg }, updatedById: user.id } });
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
    const targets = await this.prisma.marketTarget.findMany({ where: this.targetWhere(user, query), orderBy: { periodStart: "desc" } });
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
    const [targetItems, plans, mrps, recommendations, batches, inventory, sales] = await Promise.all([
      this.prisma.marketTargetItem.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.productionPlan.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.materialRequirementPlan.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.procurementRecommendation.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null } }),
      this.prisma.feedProductionBatch.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null }, select: { producedQuantityKg: true } }),
      this.prisma.inventoryItem.findMany({ where: { companyId: user.companyId, deletedAt: null, productId: { in: [] } }, select: { quantityOnHand: true } }),
      this.prisma.salesOrder.findMany({ where: { companyId: user.companyId, marketTargetId, deletedAt: null }, include: { items: true } })
    ]);
    const productIds = targetItems.map((item) => item.productId);
    const finishedInventory = productIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { companyId: user.companyId, deletedAt: null, productId: { in: productIds } }, select: { quantityOnHand: true } })
      : inventory;
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

  private async calculateIngredientNeeds(companyId: string, planItems: Array<{ id: string; productId: string; formulaId: string | null; formulaVersionId: string | null; plannedQuantityKg: Prisma.Decimal }>) {
    const needs: IngredientNeed[] = [];
    for (const item of planItems) {
      const formula = await this.resolveFormula(companyId, item.productId, item.formulaId ?? undefined);
      const ingredients = await this.prisma.feedFormulaIngredient.findMany({ where: { companyId, formulaId: formula.id, deletedAt: null } });
      if (!ingredients.length) throw new BadRequestException(`Formula ${formula.code} has no ingredients.`);
      const ratio = num(item.plannedQuantityKg) / Math.max(num(formula.targetBatchKg), 1);
      for (const ingredient of ingredients) {
        needs.push({
          productionPlanItemId: item.id,
          finishedProductId: item.productId,
          rawMaterialId: ingredient.ingredientId,
          formulaId: formula.id,
          formulaVersionId: item.formulaVersionId,
          requiredQuantityKg: num(ingredient.quantityKg) * ratio,
          unitCost: num(ingredient.unitCost)
        });
      }
    }
    return needs;
  }

  private async executionMaterialAvailability(companyId: string, formulaId: string, warehouseId: string, inputQuantityKg: number) {
    const formula = await this.prisma.feedFormula.findFirst({ where: { id: formulaId, companyId, deletedAt: null } });
    if (!formula) throw new NotFoundException("Feed formula was not found.");
    const ingredients = await this.prisma.feedFormulaIngredient.findMany({
      where: { companyId, formulaId, deletedAt: null },
      include: { ingredient: { select: { name: true, sku: true } } },
      orderBy: { sortOrder: "asc" }
    });
    const ratio = inputQuantityKg / Math.max(num(formula.targetBatchKg), 1);
    const result = [];
    for (const ingredient of ingredients) {
      const quantityKg = num(ingredient.quantityKg) * ratio;
      const inventory = await this.prisma.inventoryItem.findUnique({
        where: { companyId_warehouseId_productId: { companyId, warehouseId, productId: ingredient.ingredientId } }
      });
      const availableKg = num(inventory?.quantityOnHand);
      result.push({
        ingredientId: ingredient.ingredientId,
        productName: ingredient.ingredient.name,
        sku: ingredient.ingredient.sku,
        quantityKg,
        unitCost: num(ingredient.unitCost),
        availableKg,
        shortageKg: Math.max(quantityKg - availableKg, 0)
      });
    }
    return result;
  }

  private async inventoryAvailability(companyId: string, warehouseId: string, productIds: string[]) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { companyId, warehouseId, productId: { in: [...new Set(productIds)] }, deletedAt: null },
      select: { productId: true, quantityOnHand: true }
    });
    return new Map(rows.map((row) => [row.productId, { quantityOnHand: num(row.quantityOnHand) }]));
  }

  private async requireInventory(tx: Tx, companyId: string, warehouseId: string, productId: string) {
    const inventory = await tx.inventoryItem.findUnique({ where: { companyId_warehouseId_productId: { companyId, warehouseId, productId } } });
    if (!inventory || num(inventory.quantityOnHand) <= 0) throw new BadRequestException("Inventory item is missing or has no stock.");
    return inventory;
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

  private async resolveFormula(companyId: string, productId: string, formulaId?: string) {
    const formula = await this.prisma.feedFormula.findFirst({
      where: { companyId, deletedAt: null, ...(formulaId ? { id: formulaId } : { finishedProductId: productId, status: "ACTIVE" }) },
      orderBy: { updatedAt: "desc" }
    });
    if (!formula) throw new BadRequestException("An active feed formula is required for each market target product.");
    return formula;
  }

  private async getFormulaForExecution(companyId: string, formulaId?: string) {
    if (!formulaId) throw new BadRequestException("Production plan item is missing a feed formula.");
    const formula = await this.prisma.feedFormula.findFirst({ where: { id: formulaId, companyId, deletedAt: null } });
    if (!formula) throw new NotFoundException("Feed formula was not found.");
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
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.productionSiteId ? { productionSiteId: query.productionSiteId } : {}),
      ...(query.startDate || query.endDate ? { periodStart: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } } : {}),
      ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }, { productionSiteId: { in: user.productionSiteIds } }] })
    };
  }

  private productionPlanWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.ProductionPlanWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.productionSiteId ? { productionSiteId: query.productionSiteId } : {}),
      ...(query.warehouseId ? { centralWarehouseId: query.warehouseId } : {}),
      ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds }, productionSiteId: { in: user.productionSiteIds }, centralWarehouseId: { in: user.warehouseIds } })
    };
  }

  private mrpWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.MaterialRequirementPlanWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.warehouseId ? { centralWarehouseId: query.warehouseId } : {}),
      ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds }, centralWarehouseId: { in: user.warehouseIds } })
    };
  }

  private recommendationWhere(user: AuthenticatedUser, query: MarketPlanningQueryDto): Prisma.ProcurementRecommendationWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } })
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

  private async nextDocumentNumber(companyId: string, prefix: string, count: number) {
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
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
