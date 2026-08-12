import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { nextRef } from "../../common/next-ref";
import {
  CreateSoyaBeanIntakeDto,
  CreateSoyaInternalTransferDto,
  CreateSoyaProcessingBatchDto,
  CreateSoyaQualityCheckDto,
  CreateSoyaSaleDto,
  SoyaQueryDto,
  UpdateSoyaBeanIntakeDto,
  UpdateSoyaInternalTransferDto,
  UpdateSoyaProcessingBatchDto,
  UpdateSoyaQualityCheckDto,
  UpdateSoyaQualityStatusDto,
  UpdateSoyaSaleDto
} from "./dto/soya-processing.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class SoyaProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [intakes, batches, oilOutputs, cakeOutputs, wastes, costs, pendingQc, sales, weekBatches, batchStats, recentIntakes, intakeStats] = await Promise.all([
      this.prisma.soyaBeanIntake.findMany({ where: this.intakeWhere(user, {}), select: { quantityKg: true, totalCost: true } }),
      this.prisma.soyaProcessingBatch.findMany({ where: this.batchWhere(user, {}), include: { oilOutputs: true, cakeOutputs: true, wasteRecords: true, costs: true }, orderBy: { processingDate: "desc" }, take: 8 }),
      this.prisma.soyaOilOutput.findMany({ where: this.outputWhere(user, {}), select: { quantityLitres: true, unitCost: true } }),
      this.prisma.soyaCakeOutput.findMany({ where: this.outputWhere(user, {}), select: { quantityKg: true, unitCost: true } }),
      this.prisma.soyaWasteRecord.findMany({ where: this.outputWhere(user, {}), select: { quantityKg: true } }),
      this.prisma.soyaProductionCost.findMany({ where: this.outputWhere(user, {}), select: { rawBeanCost: true, laborCost: true, packagingCost: true, overheadCost: true, expectedOilSalesValue: true, expectedCakeSalesValue: true } }),
      this.prisma.soyaQualityCheck.count({ where: { ...this.outputWhere(user, {}), status: "PENDING" } }),
      this.prisma.soyaSalesLink.findMany({ where: this.salesWhere(user, {}), select: { totalAmount: true } }),
      this.prisma.soyaProcessingBatch.findMany({
        where: { ...this.batchWhere(user, {}), processingDate: { gte: sevenDaysAgo } },
        include: { oilOutputs: { select: { quantityLitres: true } }, cakeOutputs: { select: { quantityKg: true } }, wasteRecords: { select: { quantityKg: true } } },
        orderBy: { processingDate: "asc" }
      }),
      this.prisma.soyaProcessingBatch.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } }),
      this.prisma.soyaBeanIntake.findMany({ where: this.intakeWhere(user, {}), include: { warehouse: { select: { name: true, code: true } }, productionSite: { select: { name: true } } }, orderBy: { receivedAt: "desc" }, take: 5 }),
      this.prisma.soyaBeanIntake.groupBy({ by: ["qualityStatus"], where: { companyId: user.companyId, deletedAt: null }, _count: { qualityStatus: true } })
    ]);
    const totalCost = costs.reduce((sum, cost) => sum + this.totalCost(cost), 0);
    const expectedSalesValue = costs.reduce((sum, cost) => sum + Number(cost.expectedOilSalesValue) + Number(cost.expectedCakeSalesValue), 0);
    const beansKg = this.sum(intakes, "quantityKg");
    const oilLitres = this.sum(oilOutputs, "quantityLitres");
    const cakeKg = this.sum(cakeOutputs, "quantityKg");
    return {
      data: {
        beansReceivedKg: beansKg,
        beansReceivedCost: this.sum(intakes, "totalCost"),
        activeBatches: batches.length,
        oilProducedLitres: oilLitres,
        cakeProducedKg: cakeKg,
        wasteKg: this.sum(wastes, "quantityKg"),
        oilStockValue: oilOutputs.reduce((sum, row) => sum + Number(row.quantityLitres) * Number(row.unitCost), 0),
        cakeStockValue: cakeOutputs.reduce((sum, row) => sum + Number(row.quantityKg) * Number(row.unitCost), 0),
        pendingQualityChecks: pendingQc,
        externalSalesValue: this.sum(sales, "totalAmount"),
        profitabilityMargin: this.margin(expectedSalesValue, totalCost),
        oilYieldPct: beansKg > 0 ? Math.round((oilLitres / beansKg) * 1000) / 10 : 0,
        cakeYieldPct: beansKg > 0 ? Math.round((cakeKg / beansKg) * 1000) / 10 : 0,
        recentBatches: batches.map((batch) => ({ ...batch, metrics: this.batchMetrics(batch) })),
        recentIntakes,
        trends: {
          processing: weekBatches.map((b) => ({
            date: b.processingDate,
            oilLitres: b.oilOutputs.reduce((s, o) => s + Number(o.quantityLitres), 0),
            cakeKg: b.cakeOutputs.reduce((s, c) => s + Number(c.quantityKg), 0),
            wasteKg: b.wasteRecords.reduce((s, w) => s + Number(w.quantityKg), 0)
          }))
        },
        batchStats: batchStats.map((row) => ({ status: row.status, count: row._count.status })),
        intakeStats: intakeStats.map((r) => ({ status: r.qualityStatus, count: r._count.qualityStatus }))
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const cacheKey = `soya:opts:${user.companyId}:${user.hasGlobalAccess ? "g" : user.id}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;

    const [productionSites, warehouses, products, intakes, batches] = await Promise.all([
      this.prisma.productionSite.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["SOYA_PROCESSING", "MIXED"] }, ...(user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { id: { in: user.productionSiteIds } }) },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) },
        select: { id: true, branchId: true, productionSiteId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, branchId: true, sku: true, name: true, type: true, uomId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.soyaBeanIntake.findMany({ where: this.intakeWhere(user, {}), select: { id: true, receiptNumber: true, supplierName: true, quantityKg: true }, orderBy: { receivedAt: "desc" }, take: 50 }),
      this.prisma.soyaProcessingBatch.findMany({ where: this.batchWhere(user, {}), select: { id: true, batchNumber: true, status: true }, orderBy: { processingDate: "desc" }, take: 50 })
    ]);
    const result = { data: { productionSites, warehouses, products, intakes, batches } };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  async getIntake(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.soyaBeanIntake.findFirst({
      where: { ...this.intakeWhere(user, {}), id },
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionSite: { select: { name: true, code: true } } }
    });
    if (!data) throw new NotFoundException("Soya bean intake was not found.");
    return { data };
  }

  async listIntakes(user: AuthenticatedUser, query: SoyaQueryDto) {
    const data = await this.prisma.soyaBeanIntake.findMany({
      where: this.intakeWhere(user, query),
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionSite: { select: { name: true, code: true } } },
      orderBy: { receivedAt: "desc" }
    });
    return { data };
  }

  async createIntake(user: AuthenticatedUser, dto: CreateSoyaBeanIntakeDto, context: RequestContext) {
    this.assertProductionSiteAccess(user, dto.productionSiteId);
    this.assertWarehouseAccess(user, dto.warehouseId);
    const site = await this.getProductionSite(user.companyId, dto.productionSiteId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const totalCost = dto.quantityKg * dto.unitCost;
    const data = await this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: dto.productId } },
        update: { quantityOnHand: { increment: dto.quantityKg }, updatedById: user.id },
        create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantityKg, createdById: user.id }
      });
      const intake = await tx.soyaBeanIntake.create({
        data: {
          companyId: user.companyId,
          branchId: site.branchId,
          productionSiteId: dto.productionSiteId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          receiptNumber: dto.receiptNumber.toUpperCase(),
          supplierName: dto.supplierName,
          quantityKg: dto.quantityKg,
          unitCost: dto.unitCost,
          totalCost,
          moisturePercent: dto.moisturePercent,
          qualityStatus: dto.qualityStatus ?? "PENDING",
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          notes: dto.notes,
          createdById: user.id
        }
      });
      // H3: soya never wrote StockBatch rows at all — valuation and
      // expiry-alert logic both derive entirely from summing StockBatch, so
      // every soya SKU reported $0 valuation and could never trigger an
      // expiry alert regardless of real stock level or age. Recording one
      // here (and on the oil/cake outputs in createBatch below) closes that.
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, farmId: null, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, productId: dto.productId, inventoryItemId: inventory.id, uomId: product.uomId, batchNumber: dto.receiptNumber.toUpperCase(), quantityReceived: dto.quantityKg, quantityRemaining: dto.quantityKg, unitCost: dto.unitCost, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.productId, inventoryItemId: inventory.id, toWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, uomId: product.uomId, movementType: "PURCHASE_RECEIPT", quantity: dto.quantityKg, unitCost: dto.unitCost, referenceType: "SoyaBeanIntake", referenceId: intake.id, notes: `Soya beans received from ${dto.supplierName}`, createdById: user.id } });
      return intake;
    });
    await this.writeAudit(user, "CREATE", "SoyaBeanIntake", data.id, `Recorded soya bean intake ${data.receiptNumber}`, context, { branchId: site.branchId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId });
    return { data };
  }

  // Metadata-only — see UpdateSoyaBeanIntakeDto for why quantityKg/unitCost/
  // totalCost are excluded.
  async updateIntake(user: AuthenticatedUser, id: string, dto: UpdateSoyaBeanIntakeDto, context: RequestContext) {
    const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { ...this.intakeWhere(user, {}), id } });
    if (!intake) throw new NotFoundException("Soya bean intake was not found.");
    this.assertProductionSiteAccess(user, intake.productionSiteId);
    this.assertWarehouseAccess(user, intake.warehouseId);
    const data = await this.prisma.soyaBeanIntake.update({
      where: { id },
      data: {
        receiptNumber: dto.receiptNumber ? dto.receiptNumber.toUpperCase() : undefined,
        supplierName: dto.supplierName,
        moisturePercent: dto.moisturePercent,
        qualityStatus: dto.qualityStatus,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        notes: dto.notes,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "SoyaBeanIntake", id, `Updated soya bean intake ${data.receiptNumber}`, context, { branchId: intake.branchId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId });
    return { data };
  }

  async deleteIntake(user: AuthenticatedUser, id: string, context: RequestContext) {
    const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { ...this.intakeWhere(user, {}), id } });
    if (!intake) throw new NotFoundException("Soya bean intake was not found.");
    this.assertProductionSiteAccess(user, intake.productionSiteId);
    this.assertWarehouseAccess(user, intake.warehouseId);
    const quantityKg = Number(intake.quantityKg);
    await this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: intake.warehouseId, productId: intake.productId, deletedAt: null } });
      if (inventory) {
        // Guarded like every decrement in this file: if the beans this intake
        // added have already moved on (processed into a batch, transferred,
        // sold) there may not be enough left to give back — block the delete
        // rather than drive quantityOnHand negative.
        const guarded = await tx.inventoryItem.updateMany({ where: { id: inventory.id, quantityOnHand: { gte: quantityKg } }, data: { quantityOnHand: { decrement: quantityKg }, updatedById: user.id } });
        if (guarded.count === 0) {
          throw new BadRequestException("Cannot delete this intake — its stock has already been used downstream (processed, transferred, or sold), so reversing it would drive inventory negative.");
        }
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: intake.branchId, productId: intake.productId, inventoryItemId: inventory.id, fromWarehouseId: intake.warehouseId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId, uomId: inventory.uomId, movementType: "ADJUSTMENT_OUT", quantity: quantityKg, unitCost: Number(intake.unitCost), referenceType: "SoyaBeanIntake", referenceId: intake.id, notes: `Reversal — soya bean intake ${intake.receiptNumber} deleted`, createdById: user.id } });
        // Best-effort retirement of the StockBatch lot this intake created
        // (H3) — floor-guarded on quantityRemaining but not a hard blocker on
        // the delete itself; StockBatch tracking is deliberately best-effort
        // in this file (see consumeStockBatchesFifo), so if the lot was
        // already partially consumed we just leave it as-is.
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: intake.warehouseId, productId: intake.productId, batchNumber: intake.receiptNumber.toUpperCase(), quantityRemaining: { gte: quantityKg } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: quantityKg } } });
      }
      await tx.soyaBeanIntake.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    });
    await this.writeAudit(user, "DELETE", "SoyaBeanIntake", id, `Deleted soya bean intake ${intake.receiptNumber}`, context, { branchId: intake.branchId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId });
    return { data: { id } };
  }

  async getBatch(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.soyaProcessingBatch.findFirst({
      where: { ...this.batchWhere(user, {}), id },
      include: { productionSite: { select: { name: true, code: true } }, intake: { select: { receiptNumber: true, supplierName: true } }, oilOutputs: true, cakeOutputs: true, wasteRecords: true, qualityChecks: true, costs: true }
    });
    if (!data) throw new NotFoundException("Soya processing batch was not found.");
    return { data: { ...data, metrics: this.batchMetrics(data) } };
  }

  async listBatches(user: AuthenticatedUser, query: SoyaQueryDto) {
    const data = await this.prisma.soyaProcessingBatch.findMany({
      where: this.batchWhere(user, query),
      include: { productionSite: { select: { name: true, code: true } }, intake: { select: { receiptNumber: true, supplierName: true } }, oilOutputs: true, cakeOutputs: true, wasteRecords: true, qualityChecks: { orderBy: { checkedAt: "desc" }, take: 1 }, costs: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { processingDate: "desc" }
    });
    return { data: data.map((batch) => ({ ...batch, metrics: this.batchMetrics(batch) })) };
  }

  async createBatch(user: AuthenticatedUser, dto: CreateSoyaProcessingBatchDto, context: RequestContext) {
    this.assertProductionSiteAccess(user, dto.productionSiteId);
    this.assertWarehouseAccess(user, dto.rawWarehouseId);
    this.assertWarehouseAccess(user, dto.oilWarehouseId);
    this.assertWarehouseAccess(user, dto.cakeWarehouseId);
    const site = await this.getProductionSite(user.companyId, dto.productionSiteId);
    const [beanProduct, oilProduct, cakeProduct] = await Promise.all([this.getProduct(user.companyId, dto.beanProductId), this.getProduct(user.companyId, dto.oilProductId), this.getProduct(user.companyId, dto.cakeProductId)]);
    const beanInventory = await this.getInventory(user.companyId, dto.rawWarehouseId, dto.beanProductId);
    if (!beanInventory || Number(beanInventory.quantityOnHand) < dto.beansUsedKg) {
      throw new BadRequestException("Soya bean stock is not sufficient for this processing batch.");
    }
    // M10: intakeId previously had no ownership check at all — a cross-tenant
    // or nonexistent id would be stored on the batch with no error.
    if (dto.intakeId) {
      const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { id: dto.intakeId, companyId: user.companyId, deletedAt: null } });
      if (!intake) throw new NotFoundException("Soya bean intake was not found.");
    }
    const batchNumber = dto.batchNumber?.toUpperCase() ?? (await nextRef(this.prisma, user.companyId, "SPB"));
    // M10: previously always costed from the most-recently-received intake
    // regardless of dto.intakeId, so a batch linked to an older/cheaper (or
    // pricier) intake got the wrong COGS whenever multiple intakes existed
    // at different prices.
    const rawBeanCost = await this.rawBeanCost(user.companyId, dto.rawWarehouseId, dto.beanProductId, dto.beansUsedKg, dto.intakeId);
    const totalCost = rawBeanCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    const oilCost = totalCost * 0.42;
    const cakeCost = totalCost * 0.58;

    const data = await this.prisma.$transaction(async (tx) => {
      // M10: floor-guarded updateMany prevents concurrent overdraw at the DB
      // level — the pre-check above is a plain read, so a race between two
      // concurrent requests could otherwise both pass it and both decrement.
      const invUpdate = await tx.inventoryItem.updateMany({
        where: { id: beanInventory.id, quantityOnHand: { gte: dto.beansUsedKg } },
        data: { quantityOnHand: { decrement: dto.beansUsedKg }, updatedById: user.id }
      });
      if (invUpdate.count === 0) {
        throw new BadRequestException("Soya bean stock was modified concurrently — please retry.");
      }
      // H3: best-effort FIFO consumption of bean StockBatch lots — see
      // consumeStockBatchesFifo for why this doesn't hard-block on shortfall.
      await this.consumeStockBatchesFifo(tx, user.companyId, dto.rawWarehouseId, dto.beanProductId, dto.beansUsedKg);
      const batch = await tx.soyaProcessingBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, intakeId: dto.intakeId, beanProductId: dto.beanProductId, batchNumber, beansUsedKg: dto.beansUsedKg, processingDate: dto.processingDate ? new Date(dto.processingDate) : new Date(), status: dto.status ?? "POSTED", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.beanProductId, inventoryItemId: beanInventory.id, fromWarehouseId: dto.rawWarehouseId, productionSiteId: site.id, uomId: beanProduct.uomId, movementType: "PRODUCTION_INPUT", quantity: dto.beansUsedKg, unitCost: rawBeanCost / dto.beansUsedKg, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya beans issued for ${batch.batchNumber}`, createdById: user.id } });

      const oilInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId } }, update: { quantityOnHand: { increment: dto.oilProducedLitres }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, productId: dto.oilProductId, uomId: oilProduct.uomId, quantityOnHand: dto.oilProducedLitres, createdById: user.id } });
      const cakeInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId } }, update: { quantityOnHand: { increment: dto.cakeProducedKg }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, productId: dto.cakeProductId, uomId: cakeProduct.uomId, quantityOnHand: dto.cakeProducedKg, createdById: user.id } });
      await tx.soyaOilOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId, quantityLitres: dto.oilProducedLitres, unitCost: oilCost / Math.max(dto.oilProducedLitres, 1), createdById: user.id } });
      await tx.soyaCakeOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId, quantityKg: dto.cakeProducedKg, unitCost: cakeCost / Math.max(dto.cakeProducedKg, 1), createdById: user.id } });
      // H3: soya never wrote StockBatch rows for its outputs — valuation and
      // expiry-alert logic both derive entirely from summing StockBatch, so
      // every soya oil/cake SKU reported $0 valuation and could never
      // trigger an expiry alert regardless of real stock level or age.
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, productId: dto.oilProductId, inventoryItemId: oilInventory.id, uomId: oilProduct.uomId, batchNumber: `${batchNumber}-OIL`, quantityReceived: dto.oilProducedLitres, quantityRemaining: dto.oilProducedLitres, unitCost: oilCost / Math.max(dto.oilProducedLitres, 1), createdById: user.id } });
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, productId: dto.cakeProductId, inventoryItemId: cakeInventory.id, uomId: cakeProduct.uomId, batchNumber: `${batchNumber}-CAKE`, quantityReceived: dto.cakeProducedKg, quantityRemaining: dto.cakeProducedKg, unitCost: cakeCost / Math.max(dto.cakeProducedKg, 1), createdById: user.id } });
      await tx.soyaWasteRecord.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, quantityKg: dto.wasteKg ?? Math.max(0, dto.beansUsedKg - dto.cakeProducedKg), reason: "Processing loss", createdById: user.id } });
      await tx.soyaProductionCost.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, rawBeanCost, laborCost: dto.laborCost ?? 0, packagingCost: dto.packagingCost ?? 0, overheadCost: dto.overheadCost ?? 0, expectedOilSalesValue: dto.expectedOilSalesValue ?? 0, expectedCakeSalesValue: dto.expectedCakeSalesValue ?? 0, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.oilProductId, inventoryItemId: oilInventory.id, toWarehouseId: dto.oilWarehouseId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, uomId: oilProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.oilProducedLitres, unitCost: oilCost / Math.max(dto.oilProducedLitres, 1), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya oil output from ${batch.batchNumber}`, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.cakeProductId, inventoryItemId: cakeInventory.id, toWarehouseId: dto.cakeWarehouseId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, uomId: cakeProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.cakeProducedKg, unitCost: cakeCost / Math.max(dto.cakeProducedKg, 1), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya cake output from ${batch.batchNumber}`, createdById: user.id } });
      return batch;
    });
    await this.writeAudit(user, "CREATE", "SoyaProcessingBatch", data.id, `Posted soya processing batch ${batchNumber}`, context, { branchId: site.branchId, productionSiteId: site.id });
    return { data };
  }

  // Metadata-only — see UpdateSoyaProcessingBatchDto for why beansUsedKg /
  // oilProducedLitres / cakeProducedKg / wasteKg / costs / status are excluded.
  async updateBatch(user: AuthenticatedUser, id: string, dto: UpdateSoyaProcessingBatchDto, context: RequestContext) {
    const batch = await this.requireBatch(user, id);
    this.assertProductionSiteAccess(user, batch.productionSiteId);
    const data = await this.prisma.soyaProcessingBatch.update({
      where: { id },
      data: {
        batchNumber: dto.batchNumber ? dto.batchNumber.toUpperCase() : undefined,
        processingDate: dto.processingDate ? new Date(dto.processingDate) : undefined,
        notes: dto.notes,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "SoyaProcessingBatch", id, `Updated soya processing batch ${data.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  // Reverses every inventory effect createBatch posted: gives the consumed
  // beans back (always a safe increment) and takes back each oil/cake output
  // (floor-guarded — an output may already have moved on via transfer/sale by
  // the time the batch is deleted, in which case the delete is blocked rather
  // than driving inventory negative). SoyaProcessingBatch itself doesn't
  // persist the raw-bean warehouse, so it's recovered from the PRODUCTION_INPUT
  // StockMovement this same batch posted at create time. Quantity-editing this
  // batch was deliberately not implemented (see UpdateSoyaProcessingBatchDto) —
  // deletion is tractable here specifically because it reverses the exact
  // posted effect rather than needing to recompute a new one.
  async deleteBatch(user: AuthenticatedUser, id: string, context: RequestContext) {
    const batch = await this.prisma.soyaProcessingBatch.findFirst({
      where: { ...this.batchWhere(user, {}), id },
      include: { oilOutputs: { where: { deletedAt: null } }, cakeOutputs: { where: { deletedAt: null } }, wasteRecords: { where: { deletedAt: null } }, costs: { where: { deletedAt: null } } }
    });
    if (!batch) throw new NotFoundException("Soya processing batch was not found.");
    this.assertProductionSiteAccess(user, batch.productionSiteId);
    const beanMovement = await this.prisma.stockMovement.findFirst({ where: { companyId: user.companyId, referenceType: "SoyaProcessingBatch", referenceId: batch.id, movementType: "PRODUCTION_INPUT" } });
    const beansUsedKg = Number(batch.beansUsedKg);

    await this.prisma.$transaction(async (tx) => {
      if (beanMovement?.fromWarehouseId) {
        const beanInventory = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: beanMovement.fromWarehouseId, productId: batch.beanProductId, deletedAt: null } });
        if (beanInventory) {
          await tx.inventoryItem.update({ where: { id: beanInventory.id }, data: { quantityOnHand: { increment: beansUsedKg }, updatedById: user.id } });
          await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: batch.beanProductId, inventoryItemId: beanInventory.id, toWarehouseId: beanMovement.fromWarehouseId, warehouseId: beanMovement.fromWarehouseId, productionSiteId: batch.productionSiteId, uomId: beanInventory.uomId, movementType: "ADJUSTMENT_IN", quantity: beansUsedKg, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Reversal — soya processing batch ${batch.batchNumber} deleted`, createdById: user.id } });
        }
      }

      for (const output of batch.oilOutputs) {
        const qty = Number(output.quantityLitres);
        const inv = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, deletedAt: null } });
        const guarded = inv ? await tx.inventoryItem.updateMany({ where: { id: inv.id, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty }, updatedById: user.id } }) : { count: 0 };
        if (guarded.count === 0) throw new BadRequestException("Cannot delete this batch — its oil output has already moved on (transferred or sold), so reversing it would drive inventory negative.");
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: output.productId, inventoryItemId: inv!.id, fromWarehouseId: output.warehouseId, warehouseId: output.warehouseId, productionSiteId: batch.productionSiteId, uomId: inv!.uomId, movementType: "ADJUSTMENT_OUT", quantity: qty, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Reversal — soya processing batch ${batch.batchNumber} deleted`, createdById: user.id } });
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, batchNumber: `${batch.batchNumber}-OIL`, quantityRemaining: { gte: qty } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: qty } } });
        await tx.soyaOilOutput.update({ where: { id: output.id }, data: { deletedAt: new Date() } });
      }

      for (const output of batch.cakeOutputs) {
        const qty = Number(output.quantityKg);
        const inv = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, deletedAt: null } });
        const guarded = inv ? await tx.inventoryItem.updateMany({ where: { id: inv.id, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty }, updatedById: user.id } }) : { count: 0 };
        if (guarded.count === 0) throw new BadRequestException("Cannot delete this batch — its cake output has already moved on (transferred or sold), so reversing it would drive inventory negative.");
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: output.productId, inventoryItemId: inv!.id, fromWarehouseId: output.warehouseId, warehouseId: output.warehouseId, productionSiteId: batch.productionSiteId, uomId: inv!.uomId, movementType: "ADJUSTMENT_OUT", quantity: qty, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Reversal — soya processing batch ${batch.batchNumber} deleted`, createdById: user.id } });
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, batchNumber: `${batch.batchNumber}-CAKE`, quantityRemaining: { gte: qty } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: qty } } });
        await tx.soyaCakeOutput.update({ where: { id: output.id }, data: { deletedAt: new Date() } });
      }

      // Waste records and cost estimates carry no inventory effect of their
      // own — soft-delete them alongside the batch so they stop appearing as
      // active records for a batch that no longer exists.
      for (const waste of batch.wasteRecords) await tx.soyaWasteRecord.update({ where: { id: waste.id }, data: { deletedAt: new Date() } });
      for (const cost of batch.costs) await tx.soyaProductionCost.update({ where: { id: cost.id }, data: { deletedAt: new Date() } });

      await tx.soyaProcessingBatch.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    });
    await this.writeAudit(user, "DELETE", "SoyaProcessingBatch", id, `Deleted soya processing batch ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data: { id } };
  }

  async listOilStock(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { data: await this.prisma.soyaOilOutput.findMany({ where: this.outputWhere(user, query), include: { product: true, warehouse: true, productionBatch: { select: { batchNumber: true } } }, orderBy: { createdAt: "desc" } }) };
  }

  async listCakeStock(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { data: await this.prisma.soyaCakeOutput.findMany({ where: this.outputWhere(user, query), include: { product: true, warehouse: true, productionBatch: { select: { batchNumber: true } } }, orderBy: { createdAt: "desc" } }) };
  }

  async listQualityChecks(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { data: await this.prisma.soyaQualityCheck.findMany({ where: this.outputWhere(user, query), include: { productionBatch: { select: { batchNumber: true } }, productionSite: { select: { name: true } } }, orderBy: { checkedAt: "desc" } }) };
  }

  async createQualityCheck(user: AuthenticatedUser, dto: CreateSoyaQualityCheckDto, context: RequestContext) {
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const data = await this.prisma.soyaQualityCheck.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, moisturePercent: dto.moisturePercent, oilPurityPercent: dto.oilPurityPercent, cakeProteinPercent: dto.cakeProteinPercent, status: dto.status ?? "PENDING", notes: dto.notes, checkedById: user.id, approvedById: dto.status === "APPROVED" ? user.id : undefined, approvedAt: dto.status === "APPROVED" ? new Date() : undefined } });
    await this.writeAudit(user, "CREATE", "SoyaQualityCheck", data.id, `Recorded soya quality check for ${batch.batchNumber}`, context, { branchId: batch.branchId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  async updateQualityStatus(user: AuthenticatedUser, id: string, dto: UpdateSoyaQualityStatusDto, context: RequestContext) {
    const check = await this.prisma.soyaQualityCheck.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!check) throw new NotFoundException("Soya quality check was not found.");
    this.assertProductionSiteAccess(user, check.productionSiteId);
    // H-BACK-2: same fix as feed-production.service.ts's approveQualityCheck
    // — the check-status update and the batch-status update were two
    // separate, unguarded calls; wrapped in one transaction so a failure
    // between them can't leave the check finalized while the batch it
    // belongs to never moves off its pre-check status.
    const data = await this.prisma.$transaction(async (tx) => {
      const updatedCheck = await tx.soyaQualityCheck.update({ where: { id }, data: { status: dto.status, approvedById: ["APPROVED", "REJECTED"].includes(dto.status) ? user.id : undefined, approvedAt: ["APPROVED", "REJECTED"].includes(dto.status) ? new Date() : undefined } });
      await tx.soyaProcessingBatch.update({ where: { id: check.productionBatchId }, data: { status: dto.status === "REJECTED" ? "REJECTED" : dto.status === "APPROVED" || dto.status === "ACCEPTED" ? "APPROVED" : "QUALITY_HOLD", updatedById: user.id } });
      return updatedCheck;
    });
    await this.writeAudit(user, dto.status === "REJECTED" ? "REJECT" : "APPROVE", "SoyaQualityCheck", id, `Updated soya quality check to ${dto.status}`, context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data };
  }

  // Metadata-only, and only while the check is still open. No inventory
  // effect to protect (quality checks never touch stock) — the thing worth
  // protecting here is the finalized decision itself.
  async updateQualityCheck(user: AuthenticatedUser, id: string, dto: UpdateSoyaQualityCheckDto, context: RequestContext) {
    const check = await this.prisma.soyaQualityCheck.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!check) throw new NotFoundException("Soya quality check was not found.");
    this.assertProductionSiteAccess(user, check.productionSiteId);
    // approvedAt is only ever set by updateQualityStatus's APPROVED/REJECTED
    // branch — treat it as the "finalized" signal so an audited decision
    // can't be silently rewritten through the metadata-edit route.
    if (check.approvedAt) throw new BadRequestException("This quality check has already been finalized and cannot be edited.");
    const data = await this.prisma.soyaQualityCheck.update({ where: { id }, data: { moisturePercent: dto.moisturePercent, oilPurityPercent: dto.oilPurityPercent, cakeProteinPercent: dto.cakeProteinPercent, notes: dto.notes } });
    await this.writeAudit(user, "UPDATE", "SoyaQualityCheck", id, "Updated soya quality check", context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data };
  }

  async deleteQualityCheck(user: AuthenticatedUser, id: string, context: RequestContext) {
    const check = await this.prisma.soyaQualityCheck.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!check) throw new NotFoundException("Soya quality check was not found.");
    this.assertProductionSiteAccess(user, check.productionSiteId);
    if (check.approvedAt) throw new BadRequestException("This quality check has already been finalized (approved/rejected) and cannot be deleted.");
    await this.prisma.soyaQualityCheck.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.writeAudit(user, "DELETE", "SoyaQualityCheck", id, "Deleted soya quality check", context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data: { id } };
  }

  async createTransfer(user: AuthenticatedUser, dto: CreateSoyaInternalTransferDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.assertWarehouseAccess(user, dto.toWarehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const source = await this.requireStock(user.companyId, dto.fromWarehouseId, dto.productId, dto.quantity);
    const data = await this.prisma.$transaction(async (tx) => {
      // C1: floor-guarded updateMany prevents concurrent overdraw at the DB
      // level — requireStock above is a plain read, so a race between two
      // concurrent transfers could otherwise both pass it and both decrement.
      const invUpdate = await tx.inventoryItem.updateMany({
        where: { id: source.id, quantityOnHand: { gte: dto.quantity } },
        data: { quantityOnHand: { decrement: dto.quantity }, updatedById: user.id }
      });
      if (invUpdate.count === 0) {
        throw new BadRequestException("Soya stock was modified concurrently — please retry.");
      }
      // H3: best-effort FIFO consumption at the source, and a fresh
      // StockBatch at the destination carrying the consumed lots' weighted
      // cost forward — see consumeStockBatchesFifo for why source
      // consumption doesn't hard-block on shortfall.
      const consumedSource = await this.consumeStockBatchesFifo(tx, user.companyId, dto.fromWarehouseId, dto.productId, dto.quantity);
      const destination = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.toWarehouseId, productId: dto.productId } }, update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }, create: { companyId: user.companyId, branchId: batch.branchId, warehouseId: dto.toWarehouseId, productionSiteId: dto.toProductionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id } });
      const transfer = await tx.soyaInternalTransfer.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, outputType: dto.outputType, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, quantity: dto.quantity, status: "COMPLETED", notes: dto.notes, createdById: user.id } });
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: batch.branchId, warehouseId: dto.toWarehouseId, productionSiteId: dto.toProductionSiteId, productId: dto.productId, inventoryItemId: destination.id, uomId: product.uomId, batchNumber: `${transfer.id}-TRF`, quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: consumedSource.unitCost, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer dispatched", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: destination.id, toWarehouseId: dto.toWarehouseId, warehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer received", createdById: user.id } });
      return transfer;
    });
    await this.writeAudit(user, "TRANSFER", "SoyaInternalTransfer", data.id, "Transferred soya output internally", context, { branchId: batch.branchId, warehouseId: dto.fromWarehouseId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  // Metadata-only — see UpdateSoyaInternalTransferDto for why quantity/
  // warehouse fields are excluded.
  async updateTransfer(user: AuthenticatedUser, id: string, dto: UpdateSoyaInternalTransferDto, context: RequestContext) {
    const transfer = await this.prisma.soyaInternalTransfer.findFirst({ where: { ...this.transferWhere(user, {}), id } });
    if (!transfer) throw new NotFoundException("Soya internal transfer was not found.");
    this.assertWarehouseAccess(user, transfer.fromWarehouseId);
    const data = await this.prisma.soyaInternalTransfer.update({ where: { id }, data: { notes: dto.notes, updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SoyaInternalTransfer", id, "Updated soya internal transfer", context, { branchId: transfer.branchId, warehouseId: transfer.fromWarehouseId, productionSiteId: transfer.productionSiteId });
    return { data };
  }

  // Reverses both legs createTransfer posted: gives the source warehouse its
  // stock back (always a safe increment) and takes the stock back out of the
  // destination warehouse (floor-guarded — it may already have moved on via a
  // further transfer/sale, in which case the delete is blocked rather than
  // driving inventory negative).
  async deleteTransfer(user: AuthenticatedUser, id: string, context: RequestContext) {
    const transfer = await this.prisma.soyaInternalTransfer.findFirst({ where: { ...this.transferWhere(user, {}), id } });
    if (!transfer) throw new NotFoundException("Soya internal transfer was not found.");
    this.assertWarehouseAccess(user, transfer.fromWarehouseId);
    this.assertWarehouseAccess(user, transfer.toWarehouseId);
    const quantity = Number(transfer.quantity);
    await this.prisma.$transaction(async (tx) => {
      const destination = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: transfer.toWarehouseId, productId: transfer.productId, deletedAt: null } });
      const guarded = destination ? await tx.inventoryItem.updateMany({ where: { id: destination.id, quantityOnHand: { gte: quantity } }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } }) : { count: 0 };
      if (guarded.count === 0) {
        throw new BadRequestException("Cannot delete this transfer — the destination stock has already moved on, so reversing it would drive inventory negative.");
      }
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: transfer.branchId, productId: transfer.productId, inventoryItemId: destination!.id, fromWarehouseId: transfer.toWarehouseId, warehouseId: transfer.toWarehouseId, productionSiteId: transfer.toProductionSiteId ?? transfer.productionSiteId, uomId: destination!.uomId, movementType: "ADJUSTMENT_OUT", quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Reversal — soya internal transfer deleted", createdById: user.id } });

      const source = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: transfer.fromWarehouseId, productId: transfer.productId, deletedAt: null } });
      if (source) {
        await tx.inventoryItem.update({ where: { id: source.id }, data: { quantityOnHand: { increment: quantity }, updatedById: user.id } });
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: transfer.branchId, productId: transfer.productId, inventoryItemId: source.id, toWarehouseId: transfer.fromWarehouseId, warehouseId: transfer.fromWarehouseId, productionSiteId: transfer.productionSiteId, uomId: source.uomId, movementType: "ADJUSTMENT_IN", quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Reversal — soya internal transfer deleted", createdById: user.id } });
      }

      // Best-effort retirement of the destination StockBatch lot this
      // transfer created (H3) — see the equivalent note in deleteIntake.
      await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: transfer.toWarehouseId, productId: transfer.productId, batchNumber: `${transfer.id}-TRF`, quantityRemaining: { gte: quantity } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: quantity } } });
      await tx.soyaInternalTransfer.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id, status: "CANCELLED" } });
    });
    await this.writeAudit(user, "DELETE", "SoyaInternalTransfer", id, "Deleted soya internal transfer", context, { branchId: transfer.branchId, warehouseId: transfer.fromWarehouseId, productionSiteId: transfer.productionSiteId });
    return { data: { id } };
  }

  async listTransfers(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { data: await this.prisma.soyaInternalTransfer.findMany({ where: this.transferWhere(user, query), include: { product: true, fromWarehouse: true, toWarehouse: true, productionBatch: { select: { batchNumber: true } } }, orderBy: { transferDate: "desc" } }) };
  }

  async listSales(user: AuthenticatedUser, query: SoyaQueryDto) {
    const data = await this.prisma.soyaSalesLink.findMany({
      where: this.salesWhere(user, query),
      include: { product: { select: { name: true, sku: true } }, productionBatch: { select: { batchNumber: true } } },
      orderBy: { createdAt: "desc" }
    });
    return { data };
  }

  async findSale(user: AuthenticatedUser, id: string) {
    const sale = await this.prisma.soyaSalesLink.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { product: { select: { name: true, sku: true } }, productionBatch: { select: { batchNumber: true } } }
    });
    if (!sale) throw new NotFoundException("Soya sale was not found.");
    return { data: sale };
  }

  async createSale(user: AuthenticatedUser, dto: CreateSoyaSaleDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const source = await this.requireStock(user.companyId, dto.warehouseId, dto.productId, dto.quantity);
    const totalAmount = dto.quantity * dto.unitPrice;
    const data = await this.prisma.$transaction(async (tx) => {
      // C1: floor-guarded updateMany prevents concurrent overdraw at the DB
      // level — requireStock above is a plain read, so a race between two
      // concurrent sales could otherwise both pass it and both decrement,
      // overselling the last of a physical lot.
      const invUpdate = await tx.inventoryItem.updateMany({
        where: { id: source.id, quantityOnHand: { gte: dto.quantity } },
        data: { quantityOnHand: { decrement: dto.quantity }, updatedById: user.id }
      });
      if (invUpdate.count === 0) {
        throw new BadRequestException("Soya stock was modified concurrently — please retry.");
      }
      // H3: best-effort FIFO consumption of the sold lots — see
      // consumeStockBatchesFifo for why this doesn't hard-block on shortfall.
      await this.consumeStockBatchesFifo(tx, user.companyId, dto.warehouseId, dto.productId, dto.quantity);
      const sale = await tx.soyaSalesLink.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, warehouseId: dto.warehouseId, outputType: dto.outputType, customerName: dto.customerName, quantity: dto.quantity, unitPrice: dto.unitPrice, totalAmount, status: "POSTED", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: batch.productionSiteId, uomId: product.uomId, movementType: "SALE_DISPATCH", quantity: dto.quantity, unitCost: dto.unitPrice, referenceType: "SoyaSalesLink", referenceId: sale.id, notes: `Soya ${dto.outputType.toLowerCase()} sale to ${dto.customerName}`, createdById: user.id } });
      return sale;
    });
    await this.writeAudit(user, "CREATE", "SoyaSalesLink", data.id, "Recorded external soya sale", context, { branchId: batch.branchId, warehouseId: dto.warehouseId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  // Metadata-only — see UpdateSoyaSaleDto for why quantity/unitPrice/
  // totalAmount are excluded.
  async updateSale(user: AuthenticatedUser, id: string, dto: UpdateSoyaSaleDto, context: RequestContext) {
    const sale = await this.prisma.soyaSalesLink.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!sale) throw new NotFoundException("Soya sale was not found.");
    this.assertWarehouseAccess(user, sale.warehouseId);
    const data = await this.prisma.soyaSalesLink.update({ where: { id }, data: { customerName: dto.customerName, saleDate: dto.saleDate ? new Date(dto.saleDate) : undefined, updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SoyaSalesLink", id, "Updated soya sale", context, { branchId: sale.branchId, warehouseId: sale.warehouseId, productionSiteId: sale.productionSiteId });
    return { data };
  }

  // A sale only ever decremented one inventory item — reversing it is always
  // a safe increment (no floor guard needed; there's no "downstream" a sale's
  // stock could have moved on to — it left on the sale itself).
  async deleteSale(user: AuthenticatedUser, id: string, context: RequestContext) {
    const sale = await this.prisma.soyaSalesLink.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!sale) throw new NotFoundException("Soya sale was not found.");
    this.assertWarehouseAccess(user, sale.warehouseId);
    const quantity = Number(sale.quantity);
    await this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: sale.warehouseId, productId: sale.productId, deletedAt: null } });
      if (inventory) {
        await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantityOnHand: { increment: quantity }, updatedById: user.id } });
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: sale.branchId, productId: sale.productId, inventoryItemId: inventory.id, toWarehouseId: sale.warehouseId, warehouseId: sale.warehouseId, productionSiteId: sale.productionSiteId, uomId: inventory.uomId, movementType: "ADJUSTMENT_IN", quantity, referenceType: "SoyaSalesLink", referenceId: sale.id, notes: `Reversal — soya sale to ${sale.customerName} deleted`, createdById: user.id } });
      }
      await tx.soyaSalesLink.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id, status: "CANCELLED" } });
    });
    await this.writeAudit(user, "DELETE", "SoyaSalesLink", id, `Deleted soya sale to ${sale.customerName}`, context, { branchId: sale.branchId, warehouseId: sale.warehouseId, productionSiteId: sale.productionSiteId });
    return { data: { id } };
  }

  async reportCsv(user: AuthenticatedUser, query: SoyaQueryDto, context: RequestContext) {
    const batches = await this.listBatches(user, query);
    const rows = [
      ["batch", "site", "beans_used_kg", "oil_litres", "cake_kg", "waste_kg", "oil_yield_percent", "cake_yield_percent", "production_loss_percent", "cost_per_litre_oil", "cost_per_kg_cake", "profit_margin"],
      ...batches.data.map((batch) => [batch.batchNumber, batch.productionSite.name, String(Number(batch.beansUsedKg)), String(batch.metrics.oilProducedLitres), String(batch.metrics.cakeProducedKg), String(batch.metrics.wasteKg), String(batch.metrics.oilYieldPercent), String(batch.metrics.cakeYieldPercent), String(batch.metrics.productionLossPercent), String(batch.metrics.costPerLitreOil), String(batch.metrics.costPerKgCake), String(batch.metrics.profitMargin)])
    ];
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "soya-processing.summary", summary: "Exported soya profitability report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  private batchMetrics(batch: { beansUsedKg: Prisma.Decimal | number; oilOutputs?: Array<{ quantityLitres: Prisma.Decimal | number }>; cakeOutputs?: Array<{ quantityKg: Prisma.Decimal | number }>; wasteRecords?: Array<{ quantityKg: Prisma.Decimal | number }>; costs?: Array<{ rawBeanCost: Prisma.Decimal | number; laborCost: Prisma.Decimal | number; packagingCost: Prisma.Decimal | number; overheadCost: Prisma.Decimal | number; expectedOilSalesValue: Prisma.Decimal | number; expectedCakeSalesValue: Prisma.Decimal | number }> }) {
    const beansUsedKg = Number(batch.beansUsedKg);
    const oilProducedLitres = this.sum(batch.oilOutputs ?? [], "quantityLitres");
    const cakeProducedKg = this.sum(batch.cakeOutputs ?? [], "quantityKg");
    const wasteKg = this.sum(batch.wasteRecords ?? [], "quantityKg");
    const totalCost = (batch.costs ?? []).reduce((sum, cost) => sum + this.totalCost(cost), 0);
    const expectedSalesValue = (batch.costs ?? []).reduce((sum, cost) => sum + Number(cost.expectedOilSalesValue) + Number(cost.expectedCakeSalesValue), 0);
    return {
      oilProducedLitres,
      cakeProducedKg,
      wasteKg,
      oilYieldPercent: Number(((oilProducedLitres / Math.max(beansUsedKg, 1)) * 100).toFixed(2)),
      cakeYieldPercent: Number(((cakeProducedKg / Math.max(beansUsedKg, 1)) * 100).toFixed(2)),
      productionLossPercent: Number(((wasteKg / Math.max(beansUsedKg, 1)) * 100).toFixed(2)),
      costPerLitreOil: Number(((totalCost * 0.42) / Math.max(oilProducedLitres, 1)).toFixed(2)),
      costPerKgCake: Number(((totalCost * 0.58) / Math.max(cakeProducedKg, 1)).toFixed(2)),
      profitMargin: this.margin(expectedSalesValue, totalCost)
    };
  }

  private totalCost(cost: { rawBeanCost: Prisma.Decimal | number; laborCost: Prisma.Decimal | number; packagingCost: Prisma.Decimal | number; overheadCost: Prisma.Decimal | number }) {
    return Number(cost.rawBeanCost) + Number(cost.laborCost) + Number(cost.packagingCost) + Number(cost.overheadCost);
  }

  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return Number(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0).toFixed(2));
  }

  private margin(expectedSalesValue: number, totalCost: number) {
    if (expectedSalesValue <= 0) return 0;
    return Number((((expectedSalesValue - totalCost) / expectedSalesValue) * 100).toFixed(2));
  }

  private async rawBeanCost(companyId: string, warehouseId: string, productId: string, quantityKg: number, intakeId?: string) {
    // M10: cost from the specific intake the batch is actually linked to
    // when one is given; only fall back to "most recent intake" when the
    // caller didn't specify one.
    const intake = intakeId
      ? await this.prisma.soyaBeanIntake.findFirst({ where: { id: intakeId, companyId, deletedAt: null } })
      : await this.prisma.soyaBeanIntake.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null }, orderBy: { receivedAt: "desc" } });
    return quantityKg * Number(intake?.unitCost ?? 0);
  }

  private intakeWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    const siteScope = !user.hasGlobalAccess && user.productionSiteIds.length > 0 ? { productionSiteId: { in: user.productionSiteIds } } : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, warehouseId: query.warehouseId || undefined, ...(this.dateRange(query, "receivedAt")), ...siteScope };
  }

  private batchWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    const siteScope = !user.hasGlobalAccess && user.productionSiteIds.length > 0 ? { productionSiteId: { in: user.productionSiteIds } } : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, id: query.productionBatchId || undefined, ...(this.dateRange(query, "processingDate")), ...siteScope };
  }

  private outputWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    const siteScope = !user.hasGlobalAccess && user.productionSiteIds.length > 0 ? { productionSiteId: { in: user.productionSiteIds } } : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, productionBatchId: query.productionBatchId || undefined, warehouseId: query.warehouseId || undefined, ...siteScope };
  }

  private salesWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    const siteScope = !user.hasGlobalAccess && user.productionSiteIds.length > 0 ? { productionSiteId: { in: user.productionSiteIds } } : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, productionBatchId: query.productionBatchId || undefined, warehouseId: query.warehouseId || undefined, ...siteScope };
  }

  private transferWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    const warehouseScope = !user.hasGlobalAccess && user.warehouseIds.length > 0 ? { fromWarehouseId: { in: user.warehouseIds } } : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, productionBatchId: query.productionBatchId || undefined, fromWarehouseId: query.warehouseId || undefined, ...(this.dateRange(query, "transferDate")), ...warehouseScope };
  }

  private dateRange(query: SoyaQueryDto, field: string) {
    return query.startDate || query.endDate ? { [field]: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } } : {};
  }

  private async getProductionSite(companyId: string, id: string) {
    const site = await this.prisma.productionSite.findFirst({ where: { companyId, id, deletedAt: null } });
    if (!site) throw new NotFoundException("Production site was not found.");
    return site;
  }

  private async getProduct(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { companyId, id, deletedAt: null } });
    if (!product) throw new NotFoundException("Product was not found.");
    return product;
  }

  private async getInventory(companyId: string, warehouseId: string, productId: string) {
    return this.prisma.inventoryItem.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null } });
  }

  private async requireStock(companyId: string, warehouseId: string, productId: string, quantity: number) {
    const inventory = await this.getInventory(companyId, warehouseId, productId);
    if (!inventory || Number(inventory.quantityOnHand) < quantity) throw new BadRequestException("Stock is not sufficient for this operation.");
    return inventory;
  }

  // H3: soya only started writing StockBatch rows in this fix (intake,
  // createBatch's oil/cake outputs) — every SKU's stock predating it has no
  // lot data, so unlike inventory/feed-production's FIFO consumption this is
  // deliberately best-effort: it consumes whatever batch data actually
  // exists and does not block a transfer/sale if it falls short. The
  // authoritative "is there enough to sell" check remains the floor-guarded
  // inventoryItem.quantityOnHand decrement each caller already performs in
  // the same transaction; this only keeps batch-level valuation/expiry data
  // as accurate as the lot history it has, which improves automatically as
  // older un-batched stock sells through and is replaced by batched stock.
  private async consumeStockBatchesFifo(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, productId: string, quantity: number) {
    let remaining = quantity;
    let costTotal = 0;
    let costedQty = 0;
    // H-BUG-2: status: "AVAILABLE" excludes lots Quality has rejected or
    // quarantined — see quality.service.ts's approve/reject/quarantineBatch.
    const batches = await tx.stockBatch.findMany({
      where: { companyId, warehouseId, productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    for (const sb of batches) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, Number(sb.quantityRemaining));
      const batchUpdate = await tx.stockBatch.updateMany({
        where: { id: sb.id, quantityRemaining: { gte: consumed } },
        data: { quantityRemaining: { decrement: consumed } }
      });
      if (batchUpdate.count === 0) continue; // raced with another consumer of this lot — move on, best-effort
      costTotal += consumed * Number(sb.unitCost);
      costedQty += consumed;
      remaining -= consumed;
    }
    return { unitCost: costedQty > 0 ? costTotal / costedQty : 0 };
  }

  private async requireBatch(user: AuthenticatedUser, id: string) {
    const batch = await this.prisma.soyaProcessingBatch.findFirst({ where: { ...this.batchWhere(user, {}), id } });
    if (!batch) throw new NotFoundException("Soya processing batch was not found.");
    return batch;
  }

  private assertProductionSiteAccess(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && !user.productionSiteIds.includes(productionSiteId)) throw new ForbiddenException("You do not have access to this production site.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string; productionSiteId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, productionSiteId: scope.productionSiteId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
