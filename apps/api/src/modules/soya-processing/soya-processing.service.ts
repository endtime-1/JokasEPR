import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateSoyaBeanIntakeDto,
  CreateSoyaInternalTransferDto,
  CreateSoyaProcessingBatchDto,
  CreateSoyaQualityCheckDto,
  CreateSoyaSaleDto,
  SoyaQueryDto,
  UpdateSoyaQualityStatusDto
} from "./dto/soya-processing.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class SoyaProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
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
    const [productionSites, warehouses, products, intakes, batches] = await Promise.all([
      this.prisma.productionSite.findMany({
        where: { companyId: user.companyId, deletedAt: null, type: { in: ["SOYA_PROCESSING", "MIXED"] }, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) },
        select: { id: true, branchId: true, code: true, name: true, type: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) },
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
    return { data: { productionSites, warehouses, products, intakes, batches } };
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
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.productId, inventoryItemId: inventory.id, toWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, uomId: product.uomId, movementType: "PURCHASE_RECEIPT", quantity: dto.quantityKg, unitCost: dto.unitCost, referenceType: "SoyaBeanIntake", referenceId: intake.id, notes: `Soya beans received from ${dto.supplierName}`, createdById: user.id } });
      return intake;
    });
    await this.writeAudit(user, "CREATE", "SoyaBeanIntake", data.id, `Recorded soya bean intake ${data.receiptNumber}`, context, { branchId: site.branchId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId });
    return { data };
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
    const batchNumber = dto.batchNumber?.toUpperCase() ?? (await this.nextDocumentNumber(user.companyId, "SPB", this.prisma.soyaProcessingBatch));
    const rawBeanCost = await this.rawBeanCost(user.companyId, dto.rawWarehouseId, dto.beanProductId, dto.beansUsedKg);
    const totalCost = rawBeanCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    const oilCost = totalCost * 0.42;
    const cakeCost = totalCost * 0.58;

    const data = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id: beanInventory.id }, data: { quantityOnHand: { decrement: dto.beansUsedKg }, updatedById: user.id } });
      const batch = await tx.soyaProcessingBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, intakeId: dto.intakeId, beanProductId: dto.beanProductId, batchNumber, beansUsedKg: dto.beansUsedKg, processingDate: dto.processingDate ? new Date(dto.processingDate) : new Date(), status: dto.status ?? "POSTED", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.beanProductId, inventoryItemId: beanInventory.id, fromWarehouseId: dto.rawWarehouseId, productionSiteId: site.id, uomId: beanProduct.uomId, movementType: "PRODUCTION_INPUT", quantity: dto.beansUsedKg, unitCost: rawBeanCost / dto.beansUsedKg, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya beans issued for ${batch.batchNumber}`, createdById: user.id } });

      const oilInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId } }, update: { quantityOnHand: { increment: dto.oilProducedLitres }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, productId: dto.oilProductId, uomId: oilProduct.uomId, quantityOnHand: dto.oilProducedLitres, createdById: user.id } });
      const cakeInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId } }, update: { quantityOnHand: { increment: dto.cakeProducedKg }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, productId: dto.cakeProductId, uomId: cakeProduct.uomId, quantityOnHand: dto.cakeProducedKg, createdById: user.id } });
      await tx.soyaOilOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId, quantityLitres: dto.oilProducedLitres, unitCost: oilCost / Math.max(dto.oilProducedLitres, 1), createdById: user.id } });
      await tx.soyaCakeOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId, quantityKg: dto.cakeProducedKg, unitCost: cakeCost / Math.max(dto.cakeProducedKg, 1), createdById: user.id } });
      await tx.soyaWasteRecord.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, quantityKg: dto.wasteKg ?? Math.max(0, dto.beansUsedKg - dto.cakeProducedKg), reason: "Processing loss", createdById: user.id } });
      await tx.soyaProductionCost.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, rawBeanCost, laborCost: dto.laborCost ?? 0, packagingCost: dto.packagingCost ?? 0, overheadCost: dto.overheadCost ?? 0, expectedOilSalesValue: dto.expectedOilSalesValue ?? 0, expectedCakeSalesValue: dto.expectedCakeSalesValue ?? 0, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.oilProductId, inventoryItemId: oilInventory.id, toWarehouseId: dto.oilWarehouseId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, uomId: oilProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.oilProducedLitres, unitCost: oilCost / Math.max(dto.oilProducedLitres, 1), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya oil output from ${batch.batchNumber}`, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.cakeProductId, inventoryItemId: cakeInventory.id, toWarehouseId: dto.cakeWarehouseId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, uomId: cakeProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.cakeProducedKg, unitCost: cakeCost / Math.max(dto.cakeProducedKg, 1), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya cake output from ${batch.batchNumber}`, createdById: user.id } });
      return batch;
    });
    await this.writeAudit(user, "CREATE", "SoyaProcessingBatch", data.id, `Posted soya processing batch ${batchNumber}`, context, { branchId: site.branchId, productionSiteId: site.id });
    return { data };
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
    const data = await this.prisma.soyaQualityCheck.update({ where: { id }, data: { status: dto.status, approvedById: ["APPROVED", "REJECTED"].includes(dto.status) ? user.id : undefined, approvedAt: ["APPROVED", "REJECTED"].includes(dto.status) ? new Date() : undefined } });
    await this.prisma.soyaProcessingBatch.update({ where: { id: check.productionBatchId }, data: { status: dto.status === "REJECTED" ? "REJECTED" : dto.status === "APPROVED" || dto.status === "ACCEPTED" ? "APPROVED" : "QUALITY_HOLD", updatedById: user.id } });
    await this.writeAudit(user, dto.status === "REJECTED" ? "REJECT" : "APPROVE", "SoyaQualityCheck", id, `Updated soya quality check to ${dto.status}`, context, { branchId: check.branchId, productionSiteId: check.productionSiteId });
    return { data };
  }

  async createTransfer(user: AuthenticatedUser, dto: CreateSoyaInternalTransferDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.assertWarehouseAccess(user, dto.toWarehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const source = await this.requireStock(user.companyId, dto.fromWarehouseId, dto.productId, dto.quantity);
    const data = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id: source.id }, data: { quantityOnHand: { decrement: dto.quantity }, updatedById: user.id } });
      const destination = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.toWarehouseId, productId: dto.productId } }, update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }, create: { companyId: user.companyId, branchId: batch.branchId, warehouseId: dto.toWarehouseId, productionSiteId: dto.toProductionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id } });
      const transfer = await tx.soyaInternalTransfer.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, outputType: dto.outputType, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, quantity: dto.quantity, status: "COMPLETED", notes: dto.notes, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer dispatched", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: destination.id, toWarehouseId: dto.toWarehouseId, warehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer received", createdById: user.id } });
      return transfer;
    });
    await this.writeAudit(user, "TRANSFER", "SoyaInternalTransfer", data.id, "Transferred soya output internally", context, { branchId: batch.branchId, warehouseId: dto.fromWarehouseId, productionSiteId: batch.productionSiteId });
    return { data };
  }

  async listTransfers(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { data: await this.prisma.soyaInternalTransfer.findMany({ where: this.transferWhere(user, query), include: { product: true, fromWarehouse: true, toWarehouse: true, productionBatch: { select: { batchNumber: true } } }, orderBy: { transferDate: "desc" } }) };
  }

  async createSale(user: AuthenticatedUser, dto: CreateSoyaSaleDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const batch = await this.requireBatch(user, dto.productionBatchId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const source = await this.requireStock(user.companyId, dto.warehouseId, dto.productId, dto.quantity);
    const totalAmount = dto.quantity * dto.unitPrice;
    const data = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id: source.id }, data: { quantityOnHand: { decrement: dto.quantity }, updatedById: user.id } });
      const sale = await tx.soyaSalesLink.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, warehouseId: dto.warehouseId, outputType: dto.outputType, customerName: dto.customerName, quantity: dto.quantity, unitPrice: dto.unitPrice, totalAmount, status: "POSTED", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: batch.productionSiteId, uomId: product.uomId, movementType: "SALE_DISPATCH", quantity: dto.quantity, unitCost: dto.unitPrice, referenceType: "SoyaSalesLink", referenceId: sale.id, notes: `Soya ${dto.outputType.toLowerCase()} sale to ${dto.customerName}`, createdById: user.id } });
      return sale;
    });
    await this.writeAudit(user, "CREATE", "SoyaSalesLink", data.id, "Recorded external soya sale", context, { branchId: batch.branchId, warehouseId: dto.warehouseId, productionSiteId: batch.productionSiteId });
    return { data };
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

  private async rawBeanCost(companyId: string, warehouseId: string, productId: string, quantityKg: number) {
    const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null }, orderBy: { receivedAt: "desc" } });
    return quantityKg * Number(intake?.unitCost ?? 0);
  }

  private async nextDocumentNumber(companyId: string, prefix: string, model: { count: (args: { where: { companyId: string } }) => Promise<number> }) {
    const count = await model.count({ where: { companyId } });
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  }

  private intakeWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, warehouseId: query.warehouseId, ...(this.dateRange(query, "receivedAt")), ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private batchWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, id: query.productionBatchId, ...(this.dateRange(query, "processingDate")), ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private outputWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, warehouseId: query.warehouseId, ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private salesWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, warehouseId: query.warehouseId, ...(user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } }) };
  }

  private transferWhere(user: AuthenticatedUser, query: SoyaQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productionSiteId: query.productionSiteId, productionBatchId: query.productionBatchId, fromWarehouseId: query.warehouseId, ...(this.dateRange(query, "transferDate")), ...(user.hasGlobalAccess ? {} : { fromWarehouseId: { in: user.warehouseIds } }) };
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

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string; productionSiteId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, productionSiteId: scope.productionSiteId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
