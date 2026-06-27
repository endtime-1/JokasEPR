import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
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
  FeedProductionQueryDto,
  HiproPredictiveQueryDto,
  RecordExternalFeedSaleDto,
  SimulatePredictiveDto,
  UpdateFeedQualityCheckStatusDto
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
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [formulas, orders, batches, qualityChecks, finishedStocks, usage, costs, stalledOrders, weekBatches, formulaStats, orderStats] = await Promise.all([
      this.prisma.feedFormula.count({ where: this.formulaWhere(user, {}) }),
      this.prisma.feedProductionOrder.findMany({ where: this.orderWhere(user, {}), orderBy: { createdAt: "desc" }, take: 8 }),
      this.prisma.feedProductionBatch.findMany({
        where: this.batchWhere(user, {}),
        include: { finishedProduct: { select: { name: true, sku: true } }, productionSite: { select: { name: true, code: true } } },
        orderBy: { productionDate: "desc" },
        take: 8
      }),
      this.prisma.feedQualityCheck.count({ where: { ...this.qualityWhere(user, {}), status: "PENDING" } }),
      this.prisma.finishedFeedStock.findMany({ where: this.finishedStockWhere(user, {}), select: { quantityKg: true, bag50KgCount: true, unitCost: true } }),
      this.prisma.feedRawMaterialUsage.findMany({ where: this.usageWhere(user, {}), select: { quantityKg: true, unitCost: true, wastageKg: true } }),
      this.prisma.feedProductionCost.findMany({ where: this.costWhere(user, {}), select: { rawMaterialCost: true, laborCost: true, packagingCost: true, overheadCost: true, expectedSalesValue: true } }),
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
      this.prisma.feedProductionOrder.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } })
    ]);

    const totalProducedKg = batches.reduce((sum, batch) => sum + Number(batch.producedQuantityKg), 0);
    const totalFinishedKg = finishedStocks.reduce((sum, row) => sum + Number(row.quantityKg), 0);
    const finishedValue = finishedStocks.reduce((sum, row) => sum + Number(row.quantityKg) * Number(row.unitCost), 0);
    const rawMaterialCost = usage.reduce((sum, row) => sum + Number(row.quantityKg) * Number(row.unitCost), 0);
    const wastageKg = usage.reduce((sum, row) => sum + Number(row.wastageKg), 0);
    const productionCost = costs.reduce((sum, row) => sum + Number(row.rawMaterialCost) + Number(row.laborCost) + Number(row.packagingCost) + Number(row.overheadCost), 0);
    const expectedSalesValue = costs.reduce((sum, row) => sum + Number(row.expectedSalesValue), 0);

    return {
      data: {
        formulaCount: formulas,
        openOrders: orders.filter((order) => ["DRAFT", "APPROVED", "IN_PROGRESS"].includes(order.status)).length,
        pendingQualityChecks: qualityChecks,
        totalProducedKg,
        totalFinishedKg,
        bag50KgCount: finishedStocks.reduce((sum, row) => sum + row.bag50KgCount, 0),
        finishedValue: Number(finishedValue.toFixed(2)),
        rawMaterialCost: Number(rawMaterialCost.toFixed(2)),
        wastageKg: Number(wastageKg.toFixed(2)),
        productionProfitMargin: this.margin(expectedSalesValue, productionCost),
        recentOrders: orders,
        recentBatches: batches,
        alerts: {
          stalledOrders: stalledOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, scheduledDate: o.scheduledDate, plannedQuantityKg: Number(o.plannedQuantityKg), formula: o.formula })),
          pendingQC: qualityChecks
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
    const [productionSites, warehouses, farms, poultryHouses, rawMaterials, finishedFeeds, formulas, batches] = await Promise.all([
      this.prisma.productionSite.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          type: { in: ["FEED_PRODUCTION", "MIXED"] },
          ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } })
        },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) },
        select: { id: true, branchId: true, farmId: true, productionSiteId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.farm.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) },
        select: { id: true, branchId: true, code: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.poultryHouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) },
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
      })
    ]);

    return { data: { productionSites, warehouses, farms, poultryHouses, rawMaterials, finishedFeeds, formulas, batches } };
  }

  async listFormulas(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedFormula.findMany({
      where: this.formulaWhere(user, query),
      include: {
        finishedProduct: { select: { id: true, name: true, sku: true } },
        ingredients: { where: { deletedAt: null }, include: { ingredient: { select: { id: true, name: true, sku: true } } }, orderBy: { sortOrder: "asc" } },
        versions: { orderBy: { versionNo: "desc" }, take: 1 }
      },
      orderBy: { createdAt: "desc" }
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
    const branchId = dto.branchId ?? finishedProduct.branchId;
    if (!branchId) {
      throw new BadRequestException("A branch is required for this feed formula.");
    }
    this.assertBranchAccess(user, branchId);

    const formula = await this.prisma.feedFormula.create({
      data: {
        companyId: user.companyId,
        branchId,
        finishedProductId: finishedProduct.id,
        code: dto.code.toUpperCase(),
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

  async createVersion(user: AuthenticatedUser, formulaId: string, dto: CreateFeedFormulaVersionDto, context: RequestContext) {
    const formula = await this.getFormulaForCosting(user, formulaId);
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
      orderBy: { scheduledDate: "desc" }
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

    const latestVersion = await this.prisma.feedFormulaVersion.findFirst({
      where: { companyId: user.companyId, formulaId: formula.id, status: "ACTIVE" },
      orderBy: { versionNo: "desc" }
    });
    const orderNumber = await this.nextDocumentNumber(user.companyId, "FPO", this.prisma.feedProductionOrder);
    const data = await this.prisma.feedProductionOrder.create({
      data: {
        companyId: user.companyId,
        branchId: site.branchId,
        productionSiteId: site.id,
        formulaId: formula.id,
        formulaVersionId: latestVersion?.id,
        finishedProductId: formula.finishedProductId,
        orderNumber,
        plannedQuantityKg: dto.plannedQuantityKg,
        scheduledDate: new Date(dto.scheduledDate),
        status: dto.status ?? "DRAFT",
        notes: dto.notes,
        approvedById: dto.status === "APPROVED" ? user.id : undefined,
        approvedAt: dto.status === "APPROVED" ? new Date() : undefined,
        createdById: user.id
      }
    });

    const availability = dto.rawMaterialWarehouseId ? await this.materialAvailability(user, formula.id, dto.rawMaterialWarehouseId, dto.plannedQuantityKg) : null;
    await this.writeAudit(user, "CREATE", "FeedProductionOrder", data.id, `Created feed production order ${orderNumber}`, context, { branchId: site.branchId, productionSiteId: site.id });
    return { data: { ...data, availability } };
  }

  async approveOrder(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.requireOrder(user, id);
    const data = await this.prisma.feedProductionOrder.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
    });
    await this.writeAudit(user, "APPROVE", "FeedProductionOrder", id, `Approved feed production order ${order.orderNumber}`, context, { branchId: order.branchId, productionSiteId: order.productionSiteId });
    return { data };
  }

  async orderAvailability(user: AuthenticatedUser, id: string, warehouseId: string) {
    const order = await this.requireOrder(user, id);
    return { data: await this.materialAvailability(user, order.formulaId, warehouseId, Number(order.plannedQuantityKg)) };
  }

  async createBatch(user: AuthenticatedUser, dto: CreateFeedProductionBatchDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.rawMaterialWarehouseId);
    this.assertWarehouseAccess(user, dto.finishedWarehouseId);
    const order = await this.getOrderForBatch(user, dto.productionOrderId);
    const formula = order.formula;
    const inputQuantityKg = dto.producedQuantityKg + (dto.wastageKg ?? 0);
    const ingredientPlan = await this.materialAvailability(user, formula.id, dto.rawMaterialWarehouseId, inputQuantityKg);
    if (!ingredientPlan.canProduce) {
      throw new BadRequestException({ message: "Raw material stock is not sufficient for this production batch.", shortages: ingredientPlan.ingredients.filter((item) => item.shortageKg > 0) });
    }

    const batchNumber = dto.batchNumber?.toUpperCase() ?? (await this.nextDocumentNumber(user.companyId, "FB", this.prisma.feedProductionBatch));
    const rawMaterialCost = ingredientPlan.ingredients.reduce((sum, ingredient) => sum + ingredient.quantityKg * ingredient.unitCost, 0);
    const totalCost = rawMaterialCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    const unitCost = totalCost / Math.max(dto.producedQuantityKg, 1);

    const data = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.feedProductionBatch.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          productionSiteId: order.productionSiteId,
          productionOrderId: order.id,
          finishedProductId: order.finishedProductId,
          batchNumber,
          producedQuantityKg: dto.producedQuantityKg,
          wastageKg: dto.wastageKg ?? 0,
          productionDate: dto.productionDate ? new Date(dto.productionDate) : new Date(),
          status: "POSTED",
          createdById: user.id
        }
      });

      for (const ingredient of ingredientPlan.ingredients) {
        const inventory = await this.requireInventory(tx, user.companyId, dto.rawMaterialWarehouseId, ingredient.ingredientId);
        await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantityOnHand: { decrement: ingredient.quantityKg }, updatedById: user.id } });
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
            inventoryItemId: inventory.id,
            fromWarehouseId: dto.rawMaterialWarehouseId,
            productionSiteId: order.productionSiteId,
            uomId: inventory.uomId,
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
          expectedSalesValue: dto.expectedSalesValue ?? 0,
          createdById: user.id
        }
      });
      await tx.feedProductionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", updatedById: user.id } });
      return batch;
    });

    await this.writeAudit(user, "CREATE", "FeedProductionBatch", data.id, `Posted feed production batch ${batchNumber}`, context, { branchId: order.branchId, warehouseId: dto.finishedWarehouseId, productionSiteId: order.productionSiteId });
    return { data: { ...data, costing: { rawMaterialCost, totalCost, unitCost, margin: this.margin(dto.expectedSalesValue ?? 0, totalCost) } } };
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
      orderBy: { productionDate: "desc" }
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
      orderBy: { createdAt: "desc" }
    });
    return { data };
  }

  async listQualityChecks(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.feedQualityCheck.findMany({
      where: this.qualityWhere(user, query),
      include: { productionBatch: { select: { batchNumber: true } }, productionSite: { select: { name: true } } },
      orderBy: { checkedAt: "desc" }
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
        status: dto.status ?? "PENDING",
        checkedById: user.id,
        approvedById: dto.status === "APPROVED" ? user.id : undefined,
        approvedAt: dto.status === "APPROVED" ? new Date() : undefined
      }
    });
    await this.writeAudit(user, "CREATE", "FeedQualityCheck", data.id, `Recorded quality check for ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  async approveQualityCheck(user: AuthenticatedUser, id: string, dto: UpdateFeedQualityCheckStatusDto, context: RequestContext) {
    const check = await this.prisma.feedQualityCheck.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!check) {
      throw new NotFoundException("Quality check was not found.");
    }
    this.assertProductionSiteAccess(user, check.productionSiteId);
    const data = await this.prisma.feedQualityCheck.update({
      where: { id },
      data: { status: dto.status, approvedById: ["APPROVED", "FAILED"].includes(dto.status) ? user.id : undefined, approvedAt: ["APPROVED", "FAILED"].includes(dto.status) ? new Date() : undefined }
    });
    await this.prisma.feedProductionBatch.update({ where: { id: check.productionBatchId }, data: { status: dto.status === "FAILED" ? "REJECTED" : dto.status === "APPROVED" || dto.status === "PASSED" ? "APPROVED" : "QUALITY_HOLD", updatedById: user.id } });
    await this.writeAudit(user, dto.status === "FAILED" ? "REJECT" : "APPROVE", "FeedQualityCheck", id, `Updated feed quality check to ${dto.status}`, context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data };
  }

  async listFinishedFeedStock(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    const data = await this.prisma.finishedFeedStock.findMany({
      where: this.finishedStockWhere(user, query),
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionBatch: { select: { batchNumber: true } } },
      orderBy: { createdAt: "desc" }
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
        labelPrinted: true,
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
      orderBy: { packagedAt: "desc" }
    });
    return { data };
  }

  async createProductionCost(user: AuthenticatedUser, dto: CreateFeedProductionCostDto, context: RequestContext) {
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const rawMaterialCost = await this.prisma.feedRawMaterialUsage.findMany({
      where: { companyId: user.companyId, productionBatchId: batch.id, deletedAt: null },
      select: { quantityKg: true, unitCost: true }
    });
    const data = await this.prisma.feedProductionCost.create({
      data: {
        companyId: user.companyId,
        branchId: batch.branchId,
        productionSiteId: batch.productionSiteId,
        productionBatchId: batch.id,
        rawMaterialCost: rawMaterialCost.reduce((sum, row) => sum + Number(row.quantityKg) * Number(row.unitCost), 0),
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
      orderBy: { transferDate: "desc" }
    });
    return { data };
  }

  async recordExternalSale(user: AuthenticatedUser, dto: RecordExternalFeedSaleDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const data = await this.moveFinishedFeed(user, {
      batch,
      fromWarehouseId: dto.fromWarehouseId,
      quantityKg: dto.quantityKg,
      movementType: "SALE_DISPATCH",
      referenceType: "FeedExternalSale",
      transferData: { customerName: dto.customerName, unitPrice: dto.unitPrice },
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
      where: { companyId: user.companyId, productId: { in: ingredientIds }, deletedAt: null, ...(warehouseId ? { warehouseId } : user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) },
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
    const runningStock = new Map<string, number>();

    const plans = [];
    for (const plan of dto.plans) {
      const formula = await this.getFormulaForCosting(user, plan.formulaId);
      const targetBatchKg = Number(formula.targetBatchKg);
      const scale = (plan.plannedTons * 1000) / Math.max(targetBatchKg, 1);

      const ingredients = [];
      let canProduce = true;
      for (const ing of formula.ingredients) {
        const inventoryRow = await this.prisma.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: ing.ingredientId, deletedAt: null }, select: { quantityOnHand: true } });
        const totalAvailable = Number(inventoryRow?.quantityOnHand ?? 0);
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

  private async materialAvailability(user: AuthenticatedUser, formulaId: string, warehouseId: string, totalQuantityKg: number) {
    this.assertWarehouseAccess(user, warehouseId);
    const formula = await this.getFormulaForCosting(user, formulaId);
    const scale = totalQuantityKg / Math.max(Number(formula.targetBatchKg), 1);
    const ingredients: IngredientPlan[] = [];

    for (const ingredient of formula.ingredients) {
      const inventory = await this.prisma.inventoryItem.findFirst({
        where: { companyId: user.companyId, warehouseId, productId: ingredient.ingredientId, deletedAt: null },
        select: { quantityOnHand: true }
      });
      const quantityKg = Number((Number(ingredient.quantityKg) * scale).toFixed(4));
      const availableKg = Number(inventory?.quantityOnHand ?? 0);
      ingredients.push({
        ingredientId: ingredient.ingredientId,
        productName: ingredient.ingredient.name,
        sku: ingredient.ingredient.sku,
        quantityKg,
        unitCost: Number(ingredient.unitCost),
        availableKg,
        shortageKg: Number(Math.max(0, quantityKg - availableKg).toFixed(4))
      });
    }

    return {
      canProduce: ingredients.every((ingredient) => ingredient.shortageKg <= 0),
      targetQuantityKg: totalQuantityKg,
      warehouseId,
      ingredients,
      estimatedRawMaterialCost: Number(ingredients.reduce((sum, ingredient) => sum + ingredient.quantityKg * ingredient.unitCost, 0).toFixed(2))
    };
  }

  private async moveFinishedFeed(
    user: AuthenticatedUser,
    input: {
      batch: { id: string; companyId: string; branchId: string; productionSiteId: string; finishedProductId: string; batchNumber: string };
      fromWarehouseId: string;
      quantityKg: number;
      movementType: "TRANSFER" | "SALE_DISPATCH";
      referenceType: "FeedInternalTransfer" | "FeedExternalSale";
      transferData: Record<string, unknown>;
      context: RequestContext;
    }
  ) {
    const stock = await this.prisma.finishedFeedStock.findFirst({
      where: { companyId: user.companyId, productionBatchId: input.batch.id, warehouseId: input.fromWarehouseId, deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    if (!stock || Number(stock.quantityKg) < input.quantityKg) {
      throw new BadRequestException("Finished feed stock is not sufficient for this movement.");
    }
    const inventory = await this.getInventory(user.companyId, input.fromWarehouseId, input.batch.finishedProductId);
    if (!inventory || Number(inventory.quantityOnHand) < input.quantityKg) {
      throw new BadRequestException("Warehouse inventory is not sufficient for this movement.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.finishedFeedStock.update({
        where: { id: stock.id },
        data: { quantityKg: { decrement: input.quantityKg }, bag50KgCount: Math.max(0, Math.floor((Number(stock.quantityKg) - input.quantityKg) / 50)) }
      });
      await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantityOnHand: { decrement: input.quantityKg }, updatedById: user.id } });

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

      const saleReference = `SALE-${Date.now()}`;
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
          unitCost: input.transferData.unitPrice as number,
          referenceType: input.referenceType,
          referenceId: saleReference,
          notes: `External feed sale to ${input.transferData.customerName ?? "customer"}`,
          createdById: user.id
        }
      });
      return { id: saleReference, ...input.transferData, quantityKg: input.quantityKg };
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

  private async nextDocumentNumber(companyId: string, prefix: string, model: { count: (args: { where: { companyId: string } }) => Promise<number> }) {
    const count = await model.count({ where: { companyId } });
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
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

  private async requireInventory(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, productId: string) {
    const inventory = await tx.inventoryItem.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null } });
    if (!inventory) {
      throw new BadRequestException("Required raw material inventory item was not found.");
    }
    return inventory;
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
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private orderWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      branchId: query.branchId,
      productionSiteId: query.productionSiteId,
      formulaId: query.formulaId,
      ...(this.dateRange(query, "scheduledDate")),
      ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } })
    };
  }

  private batchWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      branchId: query.branchId,
      productionSiteId: query.productionSiteId,
      id: query.productionBatchId,
      ...(this.dateRange(query, "productionDate")),
      ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } })
    };
  }

  private usageWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private qualityWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private finishedStockWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, warehouseId: query.warehouseId, productionBatchId: query.productionBatchId, ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) };
  }

  private packagingWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, ...(this.dateRange(query, "packagedAt")), ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private costWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private transferWhere(user: AuthenticatedUser, query: FeedProductionQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionBatchId: query.productionBatchId, fromWarehouseId: query.warehouseId, ...(this.dateRange(query, "transferDate")), ...(user.hasGlobalAccess ? {} : { fromWarehouseId: { in: user.warehouseIds } }) };
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

  private assertFarmAccess(user: AuthenticatedUser, farmId: string) {
    if (!user.hasGlobalAccess && !user.farmIds.includes(farmId)) {
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
