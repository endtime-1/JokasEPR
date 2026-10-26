import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { WarehousePurposeService } from "../../common/services/warehouse-purpose.service";
import { nextRef } from "../../common/next-ref";
import { withDbRetry } from "../../common/db-retry";
import {
  CreateSoyaBeanIntakeDto,
  CreateSoyaInternalTransferDto,
  CreateSoyaProcessingBatchDto,
  CreateSoyaQualityCheckDto,
  CreateSoyaSaleDto,
  RecordSoyaMoistureDto,
  SoyaIntakeDecisionDto,
  SoyaQueryDto,
  UpdateSoyaBeanIntakeDto,
  UpdateSoyaInternalTransferDto,
  UpdateSoyaProcessingBatchDto,
  UpdateSoyaQualityCheckDto,
  UpdateSoyaQualityStatusDto,
  UpdateSoyaSaleDto,
  UpdateSoyaSettingsDto
} from "./dto/soya-processing.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

// Deliveries above this average moisture are held until a manager decides (the owner can change it).
export const DEFAULT_MAX_MOISTURE_PERCENT = 13;

export type MoistureState = "NOT_TESTED" | "WITHIN_LIMIT" | "HELD" | "APPROVED_OVER_LIMIT" | "REJECTED";

export function averageMoisture(readings: number[]): number | null {
  const good = readings.filter((r) => Number.isFinite(r) && r > 0);
  if (good.length === 0) return null;
  return Math.round((good.reduce((a, b) => a + b, 0) / good.length) * 100) / 100;
}

// REJECTED and an over-limit APPROVED are manager decisions; everything else follows the readings.
export function moistureState(avg: number | null, status: string, limit: number): MoistureState {
  if (status === "REJECTED") return "REJECTED";
  if (avg === null) return "NOT_TESTED";
  if (avg <= limit) return "WITHIN_LIMIT";
  return status === "APPROVED" ? "APPROVED_OVER_LIMIT" : "HELD";
}

@Injectable()
export class SoyaProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService,
    private readonly warehousePurpose: WarehousePurposeService
  ) {}

  private async assertSoyaWarehousePurpose(
    user: AuthenticatedUser,
    warehouseId: string,
    op: "soya.bean-intake" | "soya.output",
    overrideReason?: string,
    context?: RequestContext
  ) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId: user.companyId, deletedAt: null },
      select: { id: true, type: true, name: true, code: true, branchId: true },
    });
    if (!wh) return;
    await this.warehousePurpose.assert(user, wh, op, { overrideReason, context });
  }

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [intakes, batches, oilOutputs, cakeOutputs, wastes, costs, pendingQc, sales, weekBatches, batchStats, recentIntakes, intakeStats, transferStats, pendingTransferQty, recentTransfers] = await Promise.all([
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
      this.prisma.soyaBeanIntake.groupBy({ by: ["qualityStatus"], where: { companyId: user.companyId, deletedAt: null }, _count: { qualityStatus: true } }),
      this.prisma.soyaInternalTransfer.groupBy({ by: ["status"], where: this.transferWhere(user, {}), _count: { status: true } }),
      this.prisma.soyaInternalTransfer.groupBy({ by: ["outputType"], where: { ...this.transferWhere(user, {}), status: "PENDING" }, _sum: { quantity: true } }),
      this.prisma.soyaInternalTransfer.findMany({
        where: this.transferWhere(user, {}),
        include: {
          product: { select: { name: true } },
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          toProductionSite: { select: { name: true } }
        },
        orderBy: { transferDate: "desc" },
        take: 5
      })
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
        intakeStats: intakeStats.map((r) => ({ status: r.qualityStatus, count: r._count.qualityStatus })),
        transfers: {
          byStatus: transferStats.map((row) => ({ status: row.status, count: row._count.status })),
          pendingOilQty: Number(pendingTransferQty.find((r) => r.outputType === "OIL")?._sum.quantity ?? 0),
          pendingCakeQty: Number(pendingTransferQty.find((r) => r.outputType === "CAKE")?._sum.quantity ?? 0),
          recent: recentTransfers.map((t) => ({
            id: t.id,
            outputType: t.outputType,
            quantity: Number(t.quantity),
            status: t.status,
            transferDate: t.transferDate,
            productName: t.product.name,
            fromWarehouseName: t.fromWarehouse.name,
            toWarehouseName: t.toWarehouse.name,
            toProductionSiteName: t.toProductionSite?.name ?? null
          }))
        }
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const cacheKey = `soya:opts:${user.companyId}:${user.hasGlobalAccess ? "g" : user.id}`;
    const cached = this.lookupCache.get<{ data: Record<string, unknown> }>(cacheKey);
    // The delivery list changes with every intake and processing run (kg left), so it is never cached.
    if (cached) return { data: { ...cached.data, intakes: await this.intakeOptions(user) } };

    const [productionSites, warehouses, products, batches] = await Promise.all([
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
      // Soya pickers only ever deal in soya products (beans in; oil and the
      // local soya cake out) — offering the whole catalog let a Soya manager
      // pick unrelated items. Collation is case-insensitive, so "soy" also
      // matches "Soya"/"SOYA".
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, OR: [{ name: { contains: "soy" } }, { sku: { contains: "soy" } }] },
        select: { id: true, branchId: true, sku: true, name: true, type: true, uomId: true, piecesPerUnit: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.soyaProcessingBatch.findMany({ where: this.batchWhere(user, {}), select: { id: true, batchNumber: true, status: true }, orderBy: { processingDate: "desc" }, take: 50 })
    ]);
    // Every warehouse picker in this module is soya (beans in, oil/cake out) —
    // narrow to Soya Store / General when purpose enforcement is on.
    const scopedWarehouses = await this.warehousePurpose.filterForOperation(user.companyId, warehouses, "soya.bean-intake");
    const result = { data: { productionSites, warehouses: scopedWarehouses, products, batches } };
    this.lookupCache.set(cacheKey, result);
    return { data: { ...result.data, intakes: await this.intakeOptions(user) } };
  }

  // Bean deliveries for the pickers: how many kg are left in each, and whether it is on hold.
  private async intakeOptions(user: AuthenticatedUser) {
    const intakes = await this.prisma.soyaBeanIntake.findMany({
      where: this.intakeWhere(user, {}),
      select: { id: true, receiptNumber: true, supplierName: true, quantityKg: true, productId: true, warehouseId: true, receivedAt: true, qualityStatus: true, moisturePercent: true },
      orderBy: { receivedAt: "desc" }, take: 50,
    });
    const receipts = intakes.map((i) => i.receiptNumber.toUpperCase());
    const lots = receipts.length
      ? await this.prisma.stockBatch.findMany({ where: { companyId: user.companyId, batchNumber: { in: receipts }, deletedAt: null }, select: { batchNumber: true, quantityRemaining: true, status: true, warehouseId: true, productId: true } })
      : [];
    const limit = await this.maxMoisture(user.companyId);
    return intakes.map((i) => {
      const lot = lots.find((l) => l.batchNumber === i.receiptNumber.toUpperCase() && l.warehouseId === i.warehouseId && l.productId === i.productId);
      const avg = Number(i.moisturePercent) > 0 ? Number(i.moisturePercent) : null;
      return {
        id: i.id, receiptNumber: i.receiptNumber, supplierName: i.supplierName, quantityKg: i.quantityKg, productId: i.productId, receivedAt: i.receivedAt,
        // null = no stock lot on record (older delivery): the form falls back to the oldest stock
        remainingKg: lot ? Number(lot.quantityRemaining) : null,
        onHold: lot ? lot.status === "QUARANTINED" : false,
        analysisState: moistureState(avg, i.qualityStatus, limit),
      };
    });
  }

  private async maxMoisture(companyId: string): Promise<number> {
    const row = await this.prisma.systemSetting.findFirst({ where: { companyId, key: "soya.settings", deletedAt: null }, select: { value: true } });
    const v = Number(((row?.value ?? {}) as { maxMoisturePercent?: number }).maxMoisturePercent);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_MOISTURE_PERCENT;
  }

  async getSettings(user: AuthenticatedUser) {
    return { data: { maxMoisturePercent: await this.maxMoisture(user.companyId) } };
  }

  async updateSettings(user: AuthenticatedUser, dto: UpdateSoyaSettingsDto, context: RequestContext) {
    const existing = await this.prisma.systemSetting.findFirst({ where: { companyId: user.companyId, key: "soya.settings", deletedAt: null } });
    const value = { maxMoisturePercent: dto.maxMoisturePercent };
    if (existing) await this.prisma.systemSetting.update({ where: { id: existing.id }, data: { value: value as never, updatedById: user.id } });
    else await this.prisma.systemSetting.create({ data: { companyId: user.companyId, key: "soya.settings", value: value as never, description: "Soya processing settings", createdById: user.id } });
    await this.writeAudit(user, "UPDATE", "SystemSetting", existing?.id ?? "soya.settings", `Set the soya bean moisture limit to ${dto.maxMoisturePercent}%`, context, {});
    return { data: value };
  }

  private withMoisture<T extends { moisturePercent: unknown; qualityStatus: string; moistureReadings?: { moisturePercent: unknown; readAt: Date }[] }>(row: T, limit: number) {
    const avg = row.moisturePercent !== null && row.moisturePercent !== undefined && Number(row.moisturePercent) > 0 ? Number(row.moisturePercent) : null;
    return { ...row, maxMoisturePercent: limit, analysisState: moistureState(avg, row.qualityStatus, limit) };
  }

  async getIntake(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.soyaBeanIntake.findFirst({
      where: { ...this.intakeWhere(user, {}), id },
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionSite: { select: { name: true, code: true } }, moistureReadings: { where: { deletedAt: null }, orderBy: { readAt: "asc" } } }
    });
    if (!data) throw new NotFoundException("Soya bean intake was not found.");
    return { data: this.withMoisture(data, await this.maxMoisture(user.companyId)) };
  }

  async listIntakes(user: AuthenticatedUser, query: SoyaQueryDto) {
    const [rows, limit] = await Promise.all([
      this.prisma.soyaBeanIntake.findMany({
        where: this.intakeWhere(user, query),
        include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true, code: true } }, productionSite: { select: { name: true, code: true } }, moistureReadings: { where: { deletedAt: null }, orderBy: { readAt: "asc" } } },
        orderBy: { receivedAt: "desc" }
      }),
      this.maxMoisture(user.companyId),
    ]);
    return { data: rows.map((r) => this.withMoisture(r, limit)) };
  }

  // Quarantines (held = true) or releases the stock lot a delivery created. A held lot is
  // skipped by FIFO consumption, so held beans can't be processed until a manager decides.
  private async setLotHeld(db: Prisma.TransactionClient | PrismaService, companyId: string, intake: { warehouseId: string; productId: string; receiptNumber: string }, held: boolean) {
    await db.stockBatch.updateMany({
      where: { companyId, warehouseId: intake.warehouseId, productId: intake.productId, batchNumber: intake.receiptNumber.toUpperCase(), deletedAt: null, status: held ? "AVAILABLE" : "QUARANTINED" },
      data: { status: held ? "QUARANTINED" : "AVAILABLE" },
    });
  }

  // Adds one moisture reading to a delivery, re-averages, and applies the limit
  // (unless a manager already accepted or rejected it).
  async recordMoisture(user: AuthenticatedUser, id: string, dto: RecordSoyaMoistureDto, context: RequestContext) {
    const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { ...this.intakeWhere(user, {}), id } });
    if (!intake) throw new NotFoundException("Soya bean intake was not found.");
    this.assertProductionSiteAccess(user, intake.productionSiteId);
    this.assertWarehouseAccess(user, intake.warehouseId);
    const limit = await this.maxMoisture(user.companyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.soyaMoistureReading.create({ data: { companyId: user.companyId, intakeId: id, moisturePercent: dto.moisturePercent, recordedById: user.id } });
      const readings = await tx.soyaMoistureReading.findMany({ where: { intakeId: id, deletedAt: null }, select: { moisturePercent: true } });
      const avg = averageMoisture(readings.map((r) => Number(r.moisturePercent)));
      const manual = intake.qualityStatus === "REJECTED" || intake.qualityStatus === "APPROVED";
      const status = manual ? intake.qualityStatus : avg !== null && avg <= limit ? "ACCEPTED" : "PENDING";
      await tx.soyaBeanIntake.update({ where: { id }, data: { moisturePercent: avg ?? undefined, qualityStatus: status, updatedById: user.id } });
      if (!manual && avg !== null) await this.setLotHeld(tx, user.companyId, intake, avg > limit);
    });
    await this.writeAudit(user, "UPDATE", "SoyaBeanIntake", id, `Recorded moisture ${dto.moisturePercent}% on ${intake.receiptNumber}`, context, { branchId: intake.branchId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId });
    return this.getIntake(user, id);
  }

  // A manager accepts a held delivery (e.g. after drying) or rejects it. The reason is kept.
  async decideIntake(user: AuthenticatedUser, id: string, dto: SoyaIntakeDecisionDto, context: RequestContext) {
    const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { ...this.intakeWhere(user, {}), id } });
    if (!intake) throw new NotFoundException("Soya bean intake was not found.");
    this.assertProductionSiteAccess(user, intake.productionSiteId);
    this.assertWarehouseAccess(user, intake.warehouseId);
    const approve = dto.decision === "APPROVE";
    await this.prisma.$transaction(async (tx) => {
      await tx.soyaBeanIntake.update({ where: { id }, data: { qualityStatus: approve ? "APPROVED" : "REJECTED", decisionNote: dto.note, decidedById: user.id, decidedAt: new Date(), updatedById: user.id } });
      await this.setLotHeld(tx, user.companyId, intake, !approve);
    });
    await this.writeAudit(user, approve ? "APPROVE" : "REJECT", "SoyaBeanIntake", id, `${approve ? "Accepted" : "Rejected"} bean delivery ${intake.receiptNumber}: ${dto.note}`, context, { branchId: intake.branchId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId });
    return this.getIntake(user, id);
  }

  // Per-delivery analysis: moisture, how much has been processed, and the oil and cake that
  // delivery actually yielded (each run's output shared out by the kg it took from the delivery).
  async intakeAnalysis(user: AuthenticatedUser, query: SoyaQueryDto) {
    const limit = await this.maxMoisture(user.companyId);
    const intakes = await this.prisma.soyaBeanIntake.findMany({
      where: this.intakeWhere(user, query),
      include: { moistureReadings: { where: { deletedAt: null }, orderBy: { readAt: "asc" } } },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });
    const ids = intakes.map((i) => i.id);
    const lots = ids.length ? await this.prisma.soyaBatchLot.findMany({ where: { companyId: user.companyId, deletedAt: null, intakeId: { in: ids } } }) : [];
    const batchIds = [...new Set(lots.map((l) => l.productionBatchId))];
    const batches = batchIds.length
      ? await this.prisma.soyaProcessingBatch.findMany({
          where: { id: { in: batchIds }, deletedAt: null },
          select: { id: true, beansUsedKg: true, oilOutputs: { where: { deletedAt: null }, select: { quantityLitres: true } }, cakeOutputs: { where: { deletedAt: null }, select: { quantityKg: true } } },
        })
      : [];
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const rows = intakes.map((i) => {
      let processedKg = 0, oilLitres = 0, cakeKg = 0;
      for (const lot of lots.filter((l) => l.intakeId === i.id)) {
        const b = batchById.get(lot.productionBatchId);
        if (!b) continue;
        const kg = Number(lot.quantityKg);
        const share = Number(b.beansUsedKg) > 0 ? kg / Number(b.beansUsedKg) : 0;
        processedKg += kg;
        oilLitres += share * b.oilOutputs.reduce((a, o) => a + Number(o.quantityLitres), 0);
        cakeKg += share * b.cakeOutputs.reduce((a, o) => a + Number(o.quantityKg), 0);
      }
      const qty = Number(i.quantityKg);
      const avg = Number(i.moisturePercent) > 0 ? Number(i.moisturePercent) : null;
      return {
        id: i.id, receiptNumber: i.receiptNumber, supplierName: i.supplierName, receivedAt: i.receivedAt, quantityKg: qty, unitCost: Number(i.unitCost),
        moisturePercent: avg, readings: i.moistureReadings.map((r) => Number(r.moisturePercent)), qualityStatus: i.qualityStatus,
        analysisState: moistureState(avg, i.qualityStatus, limit), decisionNote: i.decisionNote,
        processedKg: Math.round(processedKg * 100) / 100, remainingKg: Math.max(0, Math.round((qty - processedKg) * 100) / 100),
        oilLitres: Math.round(oilLitres * 100) / 100, cakeKg: Math.round(cakeKg * 100) / 100,
        oilPer100Kg: processedKg > 0 ? Math.round((oilLitres / processedKg) * 10000) / 100 : null,
        cakeYieldPercent: processedKg > 0 ? Math.round((cakeKg / processedKg) * 10000) / 100 : null,
      };
    });
    const bySupplier = new Map<string, { supplierName: string; deliveries: number; quantityKg: number; moistureSum: number; moistureN: number; held: number; rejected: number; processedKg: number; oilLitres: number; cakeKg: number }>();
    for (const r of rows) {
      const k = r.supplierName.trim().toLowerCase();
      const s = bySupplier.get(k) ?? { supplierName: r.supplierName, deliveries: 0, quantityKg: 0, moistureSum: 0, moistureN: 0, held: 0, rejected: 0, processedKg: 0, oilLitres: 0, cakeKg: 0 };
      s.deliveries += 1; s.quantityKg += r.quantityKg;
      if (r.moisturePercent !== null) { s.moistureSum += r.moisturePercent; s.moistureN += 1; }
      if (r.analysisState === "HELD" || r.analysisState === "APPROVED_OVER_LIMIT") s.held += 1;
      if (r.analysisState === "REJECTED") s.rejected += 1;
      s.processedKg += r.processedKg; s.oilLitres += r.oilLitres; s.cakeKg += r.cakeKg;
      bySupplier.set(k, s);
    }
    const suppliers = [...bySupplier.values()].map((s) => ({
      supplierName: s.supplierName, deliveries: s.deliveries, quantityKg: Math.round(s.quantityKg),
      avgMoisturePercent: s.moistureN ? Math.round((s.moistureSum / s.moistureN) * 100) / 100 : null,
      overLimitOrHeld: s.held, rejected: s.rejected,
      oilPer100Kg: s.processedKg > 0 ? Math.round((s.oilLitres / s.processedKg) * 10000) / 100 : null,
      cakeYieldPercent: s.processedKg > 0 ? Math.round((s.cakeKg / s.processedKg) * 10000) / 100 : null,
    }));
    return { data: { maxMoisturePercent: limit, deliveries: rows, suppliers } };
  }

  async createIntake(user: AuthenticatedUser, dto: CreateSoyaBeanIntakeDto, context: RequestContext) {
    this.assertProductionSiteAccess(user, dto.productionSiteId);
    this.assertWarehouseAccess(user, dto.warehouseId);
    await this.assertSoyaWarehousePurpose(user, dto.warehouseId, "soya.bean-intake", dto.purposeOverrideReason, context);
    // Mobile parity audit (2026-08-17): mirrors createBatch's idempotencyKey
    // handling below — a mobile offline-queue resend (or a client retry
    // after a dropped response) carrying the same idempotencyKey replays the
    // original intake instead of creating a second one.
    if (dto.idempotencyKey) {
      const existing = await this.findIntakeByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const site = await this.getProductionSite(user.companyId, dto.productionSiteId);
    const product = await this.getProduct(user.companyId, dto.productId);
    const totalCost = dto.quantityKg * dto.unitCost;
    // The delivery's moisture is the average of the readings taken on it. A blank or 0
    // reading means "not tested" (it used to be saved as 0%).
    const readings = (dto.moistureReadings ?? (dto.moisturePercent !== undefined ? [dto.moisturePercent] : [])).filter((r) => r > 0);
    const avgMoisture = averageMoisture(readings);
    const moistureLimit = await this.maxMoisture(user.companyId);
    const held = avgMoisture !== null && avgMoisture > moistureLimit;
    const derivedStatus = avgMoisture === null ? "PENDING" : held ? "PENDING" : "ACCEPTED";
    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: dto.productId } },
        update: { deletedAt: null, quantityOnHand: { increment: dto.quantityKg }, updatedById: user.id },
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
          moisturePercent: avgMoisture ?? undefined,
          qualityStatus: derivedStatus,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
          createdById: user.id
        }
      });
      // H3: soya never wrote StockBatch rows at all — valuation and
      // expiry-alert logic both derive entirely from summing StockBatch, so
      // every soya SKU reported $0 valuation and could never trigger an
      // expiry alert regardless of real stock level or age. Recording one
      // here (and on the oil/cake outputs in createBatch below) closes that.
      // A delivery over the moisture limit is created held (QUARANTINED) so it can't be processed
      // until a manager accepts it.
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, farmId: null, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, productId: dto.productId, inventoryItemId: inventory.id, uomId: product.uomId, batchNumber: dto.receiptNumber.toUpperCase(), quantityReceived: dto.quantityKg, quantityRemaining: dto.quantityKg, unitCost: dto.unitCost, status: held ? "QUARANTINED" : undefined, createdById: user.id } });
      if (readings.length) await tx.soyaMoistureReading.createMany({ data: readings.map((r) => ({ companyId: user.companyId, intakeId: intake.id, moisturePercent: r, recordedById: user.id })) });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.productId, inventoryItemId: inventory.id, toWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, uomId: product.uomId, movementType: "PURCHASE_RECEIPT", quantity: dto.quantityKg, unitCost: dto.unitCost, referenceType: "SoyaBeanIntake", referenceId: intake.id, notes: `Soya beans received from ${dto.supplierName}`, createdById: user.id } });
      return intake;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findIntakeByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "SoyaBeanIntake", data.id, `Recorded soya bean intake ${data.receiptNumber}`, context, { branchId: site.branchId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId });
    return { data };
  }

  private async findIntakeByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.soyaBeanIntake.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
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
        // moisture and status are NOT edited here any more: add readings (POST intakes/:id/moisture)
        // and the accept / reject decision (POST intakes/:id/decision) so the history is kept.
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
    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — matches inventory.service.ts's own consumeFifoTx,
    // the canonical FIFO consumer, closing a cross-module deadlock risk from
    // the previous (opposite) order. Retry still covers whatever risk
    // remains from other transient DB errors.
    await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: intake.warehouseId, productId: intake.productId, deletedAt: null } });
      if (inventory) {
        // Best-effort retirement of the StockBatch lot this intake created
        // (H3) — floor-guarded on quantityRemaining but not a hard blocker on
        // the delete itself; StockBatch tracking is deliberately best-effort
        // in this file (see consumeStockBatchesFifo), so if the lot was
        // already partially consumed we just leave it as-is.
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: intake.warehouseId, productId: intake.productId, batchNumber: intake.receiptNumber.toUpperCase(), quantityRemaining: { gte: quantityKg } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: quantityKg } } });
        // Guarded like every decrement in this file: if the beans this intake
        // added have already moved on (processed into a batch, transferred,
        // sold) there may not be enough left to give back — block the delete
        // rather than drive quantityOnHand negative.
        const guarded = await tx.inventoryItem.updateMany({ where: { id: inventory.id, quantityOnHand: { gte: quantityKg } }, data: { quantityOnHand: { decrement: quantityKg }, updatedById: user.id } });
        if (guarded.count === 0) {
          throw new BadRequestException("Cannot delete this intake — its stock has already been used downstream (processed, transferred, or sold), so reversing it would drive inventory negative.");
        }
      }
      // Soft delete keeps the row, so free its unique keys (the receipt number
      // and the lot it named) — otherwise re-entering the same receipt after a
      // delete fails with "already exists". Same `__deleted_<id>` convention
      // as every other soft-deleted coded record.
      await tx.stockBatch.updateMany({ where: { companyId: user.companyId, productId: intake.productId, batchNumber: intake.receiptNumber.toUpperCase() }, data: { batchNumber: `${intake.receiptNumber.toUpperCase()}__DELETED_${id}` } });
      // Retire this record's own stock movements rather than posting
      // "Reversal" movements on top: the warehouse log then shows the
      // deleted record as gone, not as an entry plus its undo. Quantities are
      // corrected above; the delete itself is kept in the audit log.
      await tx.stockMovement.updateMany({ where: { companyId: user.companyId, referenceType: "SoyaBeanIntake", referenceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.soyaBeanIntake.update({ where: { id }, data: { receiptNumber: `${intake.receiptNumber}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    }), { label: "SoyaProcessingService.deleteIntake" });
    await this.writeAudit(user, "DELETE", "SoyaBeanIntake", id, `Deleted soya bean intake ${intake.receiptNumber}`, context, { branchId: intake.branchId, warehouseId: intake.warehouseId, productionSiteId: intake.productionSiteId });
    return { data: { id } };
  }

  async getBatch(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.soyaProcessingBatch.findFirst({
      where: { ...this.batchWhere(user, {}), id },
      include: { productionSite: { select: { name: true, code: true } }, intake: { select: { receiptNumber: true, supplierName: true } }, oilOutputs: { include: { warehouse: { select: { name: true } } } }, cakeOutputs: { include: { warehouse: { select: { name: true } } } }, wasteRecords: true, qualityChecks: true, costs: true }
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
    // Idempotency (DB stability audit, 2026-08-16): mirrors the existing
    // Payment/SalesOrder/CustomerPayment pattern — a client retry after a
    // dropped response used to post the same processing run twice, each one
    // consuming beans and crediting oil/cake output a second time.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.soyaProcessingBatch.findFirst({ where: { companyId: user.companyId, idempotencyKey: dto.idempotencyKey, deletedAt: null } });
      if (existing) return { data: existing };
    }
    this.assertProductionSiteAccess(user, dto.productionSiteId);
    this.assertWarehouseAccess(user, dto.rawWarehouseId);
    this.assertWarehouseAccess(user, dto.oilWarehouseId);
    this.assertWarehouseAccess(user, dto.cakeWarehouseId);
    await this.assertSoyaWarehousePurpose(user, dto.rawWarehouseId, "soya.bean-intake", dto.purposeOverrideReason, context);
    await this.assertSoyaWarehousePurpose(user, dto.oilWarehouseId, "soya.output", dto.purposeOverrideReason, context);
    await this.assertSoyaWarehousePurpose(user, dto.cakeWarehouseId, "soya.output", dto.purposeOverrideReason, context);
    const site = await this.getProductionSite(user.companyId, dto.productionSiteId);
    const [beanProduct, oilProduct, cakeProduct] = await Promise.all([this.getProduct(user.companyId, dto.beanProductId), this.getProduct(user.companyId, dto.oilProductId), this.getProduct(user.companyId, dto.cakeProductId)]);
    // Cake our own plant produces is "Local Soya". Hipro Soya is a PURCHASED soya
    // meal, never an output of this process. The cake picker used to pre-select the
    // first soya product alphabetically (Hipro), so unchanged forms posted tens of
    // thousands of kg of local cake as Hipro (2026-10-19). Refuse it outright.
    if (/hi-?pro/i.test(`${cakeProduct.name ?? ""} ${cakeProduct.sku ?? ""}`)) {
      throw new BadRequestException("Cake from our own soya processing is recorded as Local Soya. Hipro Soya is a purchased product and can't be chosen as the cake product.");
    }
    if (dto.cakeProductId === dto.beanProductId || dto.cakeProductId === dto.oilProductId || dto.oilProductId === dto.beanProductId) {
      throw new BadRequestException("The beans, the oil and the cake must be three different products.");
    }
    const beanInventory = await this.getInventory(user.companyId, dto.rawWarehouseId, dto.beanProductId);
    if (!beanInventory || Number(beanInventory.quantityOnHand) < dto.beansUsedKg) {
      throw new BadRequestException("Soya bean stock is not sufficient for this processing batch.");
    }
    // M10: intakeId previously had no ownership check at all — a cross-tenant
    // or nonexistent id would be stored on the batch with no error.
    let preferredReceipt: string | undefined;
    if (dto.intakeId) {
      const intake = await this.prisma.soyaBeanIntake.findFirst({ where: { id: dto.intakeId, companyId: user.companyId, deletedAt: null } });
      if (!intake) throw new NotFoundException("Soya bean intake was not found.");
      if (intake.qualityStatus === "REJECTED") throw new BadRequestException(`Delivery ${intake.receiptNumber} was rejected and can't be processed.`);
      preferredReceipt = intake.receiptNumber?.toUpperCase();
    }
    const batchNumber = dto.batchNumber?.toUpperCase() ?? (await nextRef(this.prisma, user.companyId, "SPB"));
    // M10: previously always costed from the most-recently-received intake
    // regardless of dto.intakeId, so a batch linked to an older/cheaper (or
    // pricier) intake got the wrong COGS whenever multiple intakes existed
    // at different prices.
    const estimatedBeanCost = await this.rawBeanCost(user.companyId, dto.rawWarehouseId, dto.beanProductId, dto.beansUsedKg, dto.intakeId);
    // These are re-worked inside the transaction from the deliveries actually used.
    let rawBeanCost = estimatedBeanCost;
    let totalCost = rawBeanCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
    let oilCost = totalCost * 0.42;
    let cakeCost = totalCost * 0.58;

    let data;
    try {
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
      // then InventoryItem — matches inventory.service.ts's own
      // consumeFifoTx, the canonical FIFO consumer, closing a cross-module
      // deadlock risk from the previous (opposite) order.
      // H3: best-effort FIFO consumption of bean StockBatch lots — see
      // consumeStockBatchesFifo for why this doesn't hard-block on shortfall.
      const consumed = await this.consumeBeanLots(tx, user.companyId, dto.rawWarehouseId, dto.beanProductId, dto.beansUsedKg, preferredReceipt);
      // Cost the beans from the deliveries really used (when the lots cover the whole quantity).
      if (consumed.costedQty >= dto.beansUsedKg * 0.9999) {
        rawBeanCost = consumed.costTotal;
        totalCost = rawBeanCost + (dto.laborCost ?? 0) + (dto.packagingCost ?? 0) + (dto.overheadCost ?? 0);
        oilCost = totalCost * 0.42;
        cakeCost = totalCost * 0.58;
      }
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
      const batch = await tx.soyaProcessingBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, intakeId: dto.intakeId, beanProductId: dto.beanProductId, batchNumber, beansUsedKg: dto.beansUsedKg, processingDate: dto.processingDate ? new Date(dto.processingDate) : new Date(), status: dto.status ?? "POSTED", idempotencyKey: dto.idempotencyKey, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.beanProductId, inventoryItemId: beanInventory.id, fromWarehouseId: dto.rawWarehouseId, productionSiteId: site.id, uomId: beanProduct.uomId, movementType: "PRODUCTION_INPUT", quantity: dto.beansUsedKg, unitCost: rawBeanCost / dto.beansUsedKg, referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya beans issued for ${batch.batchNumber}`, createdById: user.id } });
      // Remember exactly which deliveries this run used, so yield can be reported per delivery.
      if (consumed.lots.length) {
        const receipts = [...new Set(consumed.lots.map((l) => l.batchNumber).filter((n): n is string => !!n))];
        const intakes = receipts.length ? await tx.soyaBeanIntake.findMany({ where: { companyId: user.companyId, productId: dto.beanProductId, warehouseId: dto.rawWarehouseId, receiptNumber: { in: receipts }, deletedAt: null }, select: { id: true, receiptNumber: true } }) : [];
        const intakeByReceipt = new Map(intakes.map((i) => [i.receiptNumber.toUpperCase(), i.id]));
        await tx.soyaBatchLot.createMany({ data: consumed.lots.map((l) => ({ companyId: user.companyId, productionBatchId: batch.id, intakeId: l.batchNumber ? intakeByReceipt.get(l.batchNumber.toUpperCase()) : undefined, stockBatchId: l.stockBatchId, receiptNumber: l.batchNumber, quantityKg: l.kg, unitCost: l.unitCost })) });
      }

      const oilInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId } }, update: { deletedAt: null, quantityOnHand: { increment: dto.oilProducedLitres }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, productId: dto.oilProductId, uomId: oilProduct.uomId, quantityOnHand: dto.oilProducedLitres, createdById: user.id } });
      const cakeInventory = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId } }, update: { deletedAt: null, quantityOnHand: { increment: dto.cakeProducedKg }, updatedById: user.id }, create: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, productId: dto.cakeProductId, uomId: cakeProduct.uomId, quantityOnHand: dto.cakeProducedKg, createdById: user.id } });
      await tx.soyaOilOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.oilWarehouseId, productId: dto.oilProductId, quantityLitres: dto.oilProducedLitres, unitCost: (dto.oilProducedLitres > 0 ? oilCost / dto.oilProducedLitres : 0), createdById: user.id } });
      await tx.soyaCakeOutput.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, warehouseId: dto.cakeWarehouseId, productId: dto.cakeProductId, quantityKg: dto.cakeProducedKg, unitCost: (dto.cakeProducedKg > 0 ? cakeCost / dto.cakeProducedKg : 0), createdById: user.id } });
      // H3: soya never wrote StockBatch rows for its outputs — valuation and
      // expiry-alert logic both derive entirely from summing StockBatch, so
      // every soya oil/cake SKU reported $0 valuation and could never
      // trigger an expiry alert regardless of real stock level or age.
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, productId: dto.oilProductId, inventoryItemId: oilInventory.id, uomId: oilProduct.uomId, batchNumber: `${batchNumber}-OIL`, quantityReceived: dto.oilProducedLitres, quantityRemaining: dto.oilProducedLitres, unitCost: (dto.oilProducedLitres > 0 ? oilCost / dto.oilProducedLitres : 0), createdById: user.id } });
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: site.branchId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, productId: dto.cakeProductId, inventoryItemId: cakeInventory.id, uomId: cakeProduct.uomId, batchNumber: `${batchNumber}-CAKE`, quantityReceived: dto.cakeProducedKg, quantityRemaining: dto.cakeProducedKg, unitCost: (dto.cakeProducedKg > 0 ? cakeCost / dto.cakeProducedKg : 0), createdById: user.id } });
      await tx.soyaWasteRecord.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, quantityKg: dto.wasteKg ?? Math.max(0, dto.beansUsedKg - dto.cakeProducedKg), reason: "Processing loss", createdById: user.id } });
      await tx.soyaProductionCost.create({ data: { companyId: user.companyId, branchId: site.branchId, productionSiteId: site.id, productionBatchId: batch.id, rawBeanCost, laborCost: dto.laborCost ?? 0, packagingCost: dto.packagingCost ?? 0, overheadCost: dto.overheadCost ?? 0, expectedOilSalesValue: dto.expectedOilSalesValue ?? 0, expectedCakeSalesValue: dto.expectedCakeSalesValue ?? 0, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.oilProductId, inventoryItemId: oilInventory.id, toWarehouseId: dto.oilWarehouseId, warehouseId: dto.oilWarehouseId, productionSiteId: site.id, uomId: oilProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.oilProducedLitres, unitCost: (dto.oilProducedLitres > 0 ? oilCost / dto.oilProducedLitres : 0), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya oil output from ${batch.batchNumber}`, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: site.branchId, productId: dto.cakeProductId, inventoryItemId: cakeInventory.id, toWarehouseId: dto.cakeWarehouseId, warehouseId: dto.cakeWarehouseId, productionSiteId: site.id, uomId: cakeProduct.uomId, movementType: "PRODUCTION_OUTPUT", quantity: dto.cakeProducedKg, unitCost: (dto.cakeProducedKg > 0 ? cakeCost / dto.cakeProducedKg : 0), referenceType: "SoyaProcessingBatch", referenceId: batch.id, notes: `Soya cake output from ${batch.batchNumber}`, createdById: user.id } });
      return batch;
      }), { label: "SoyaProcessingService.createBatch" });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.prisma.soyaProcessingBatch.findFirst({ where: { companyId: user.companyId, idempotencyKey: dto.idempotencyKey, deletedAt: null } });
        if (existing) return { data: existing };
      }
      throw err;
    }
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

    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — see deleteIntake above for why.
    await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      if (beanMovement?.fromWarehouseId) {
        const beanInventory = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: beanMovement.fromWarehouseId, productId: batch.beanProductId, deletedAt: null } });
        if (beanInventory) {
          await tx.inventoryItem.update({ where: { id: beanInventory.id }, data: { quantityOnHand: { increment: beansUsedKg }, updatedById: user.id } });
        }
      }
      // Put the beans back into the exact delivery lots they came from.
      const usedLots = await tx.soyaBatchLot.findMany({ where: { productionBatchId: batch.id, deletedAt: null } });
      for (const lot of usedLots) {
        if (lot.stockBatchId) await tx.stockBatch.updateMany({ where: { id: lot.stockBatchId, companyId: user.companyId }, data: { quantityRemaining: { increment: Number(lot.quantityKg) } } });
        await tx.soyaBatchLot.update({ where: { id: lot.id }, data: { deletedAt: new Date() } });
      }

      for (const output of batch.oilOutputs) {
        const qty = Number(output.quantityLitres);
        const inv = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, deletedAt: null } });
        // Lock order: StockBatch lot first, then the guarded InventoryItem
        // decrement — see createBatch above for why.
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, batchNumber: `${batch.batchNumber}-OIL`, quantityRemaining: { gte: qty } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: qty } } });
        const guarded = inv ? await tx.inventoryItem.updateMany({ where: { id: inv.id, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty }, updatedById: user.id } }) : { count: 0 };
        if (guarded.count === 0) throw new BadRequestException("Cannot delete this batch — its oil output has already moved on (transferred or sold), so reversing it would drive inventory negative.");
        await tx.soyaOilOutput.update({ where: { id: output.id }, data: { deletedAt: new Date() } });
      }

      for (const output of batch.cakeOutputs) {
        const qty = Number(output.quantityKg);
        const inv = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, deletedAt: null } });
        // Lock order: StockBatch lot first, then the guarded InventoryItem
        // decrement — see createBatch above for why.
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: output.warehouseId, productId: output.productId, batchNumber: `${batch.batchNumber}-CAKE`, quantityRemaining: { gte: qty } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: qty } } });
        const guarded = inv ? await tx.inventoryItem.updateMany({ where: { id: inv.id, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty }, updatedById: user.id } }) : { count: 0 };
        if (guarded.count === 0) throw new BadRequestException("Cannot delete this batch — its cake output has already moved on (transferred or sold), so reversing it would drive inventory negative.");
        await tx.soyaCakeOutput.update({ where: { id: output.id }, data: { deletedAt: new Date() } });
      }

      // Waste records and cost estimates carry no inventory effect of their
      // own — soft-delete them alongside the batch so they stop appearing as
      // active records for a batch that no longer exists.
      for (const waste of batch.wasteRecords) await tx.soyaWasteRecord.update({ where: { id: waste.id }, data: { deletedAt: new Date() } });
      for (const cost of batch.costs) await tx.soyaProductionCost.update({ where: { id: cost.id }, data: { deletedAt: new Date() } });

      // Free the batch number and its -OIL/-CAKE lot numbers so the same
      // batch can be re-entered after a delete (see deleteIntake).
      for (const suffix of ["-OIL", "-CAKE"]) {
        await tx.stockBatch.updateMany({ where: { companyId: user.companyId, batchNumber: `${batch.batchNumber}${suffix}` }, data: { batchNumber: `${batch.batchNumber}${suffix}__DELETED_${id}` } });
      }
      // Retire this record's own stock movements rather than posting
      // "Reversal" movements on top: the warehouse log then shows the
      // deleted record as gone, not as an entry plus its undo. Quantities are
      // corrected above; the delete itself is kept in the audit log.
      await tx.stockMovement.updateMany({ where: { companyId: user.companyId, referenceType: "SoyaProcessingBatch", referenceId: batch.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.soyaProcessingBatch.update({ where: { id }, data: { batchNumber: `${batch.batchNumber}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    }), { label: "SoyaProcessingService.deleteBatch" });
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
    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — see createBatch above for why.
    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // H3: best-effort FIFO consumption at the source, and a fresh
      // StockBatch at the destination carrying the consumed lots' weighted
      // cost forward — see consumeStockBatchesFifo for why source
      // consumption doesn't hard-block on shortfall.
      const consumedSource = await this.consumeStockBatchesFifo(tx, user.companyId, dto.fromWarehouseId, dto.productId, dto.quantity);
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
      const destination = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.toWarehouseId, productId: dto.productId } }, update: { deletedAt: null, quantityOnHand: { increment: dto.quantity }, updatedById: user.id }, create: { companyId: user.companyId, branchId: batch.branchId, warehouseId: dto.toWarehouseId, productionSiteId: dto.toProductionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id } });
      const transfer = await tx.soyaInternalTransfer.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, outputType: dto.outputType, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, quantity: dto.quantity, status: "COMPLETED", notes: dto.notes, createdById: user.id } });
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: batch.branchId, warehouseId: dto.toWarehouseId, productionSiteId: dto.toProductionSiteId, productId: dto.productId, inventoryItemId: destination.id, uomId: product.uomId, batchNumber: `${transfer.id}-TRF`, quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: consumedSource.unitCost, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer dispatched", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: destination.id, toWarehouseId: dto.toWarehouseId, warehouseId: dto.toWarehouseId, toProductionSiteId: dto.toProductionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, referenceType: "SoyaInternalTransfer", referenceId: transfer.id, notes: "Soya internal transfer received", createdById: user.id } });
      return transfer;
    }), { label: "SoyaProcessingService.createTransfer" });
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
    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — see deleteIntake above for why.
    await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const destination = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: transfer.toWarehouseId, productId: transfer.productId, deletedAt: null } });
      // Best-effort retirement of the destination StockBatch lot this
      // transfer created (H3) — see the equivalent note in deleteIntake.
      await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: transfer.toWarehouseId, productId: transfer.productId, batchNumber: `${transfer.id}-TRF`, quantityRemaining: { gte: quantity } }, data: { deletedAt: new Date(), quantityRemaining: { decrement: quantity } } });
      const guarded = destination ? await tx.inventoryItem.updateMany({ where: { id: destination.id, quantityOnHand: { gte: quantity } }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } }) : { count: 0 };
      if (guarded.count === 0) {
        throw new BadRequestException("Cannot delete this transfer — the destination stock has already moved on, so reversing it would drive inventory negative.");
      }

      const source = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: transfer.fromWarehouseId, productId: transfer.productId, deletedAt: null } });
      if (source) {
        await tx.inventoryItem.update({ where: { id: source.id }, data: { quantityOnHand: { increment: quantity }, updatedById: user.id } });
      }

      // Retire this record's own movements instead of posting reversals —
      // see deleteIntake.
      await tx.stockMovement.updateMany({ where: { companyId: user.companyId, referenceType: "SoyaInternalTransfer", referenceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.soyaInternalTransfer.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id, status: "CANCELLED" } });
    }), { label: "SoyaProcessingService.deleteTransfer" });
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
    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — see createBatch above for why.
    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // H3: best-effort FIFO consumption of the sold lots — see
      // consumeStockBatchesFifo for why this doesn't hard-block on shortfall.
      await this.consumeStockBatchesFifo(tx, user.companyId, dto.warehouseId, dto.productId, dto.quantity);
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
      const sale = await tx.soyaSalesLink.create({ data: { companyId: user.companyId, branchId: batch.branchId, productionSiteId: batch.productionSiteId, productionBatchId: batch.id, productId: dto.productId, warehouseId: dto.warehouseId, outputType: dto.outputType, customerName: dto.customerName, quantity: dto.quantity, unitPrice: dto.unitPrice, totalAmount, status: "POSTED", createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: batch.branchId, productId: dto.productId, inventoryItemId: source.id, fromWarehouseId: dto.warehouseId, warehouseId: dto.warehouseId, productionSiteId: batch.productionSiteId, uomId: product.uomId, movementType: "SALE_DISPATCH", quantity: dto.quantity, unitCost: dto.unitPrice, referenceType: "SoyaSalesLink", referenceId: sale.id, notes: `Soya ${dto.outputType.toLowerCase()} sale to ${dto.customerName}`, createdById: user.id } });
      return sale;
    }), { label: "SoyaProcessingService.createSale" });
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
      }
      // Retire this record's own movements instead of posting reversals —
      // see deleteIntake.
      await tx.stockMovement.updateMany({ where: { companyId: user.companyId, referenceType: "SoyaSalesLink", referenceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
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
  // Like consumeStockBatchesFifo but returns WHICH lot (bean delivery) was used and how many kg.
  // One run uses ONE delivery, so that delivery's oil and cake are measured, not estimated:
  //  - a delivery chosen on the form is used on its own (an error says how much it has left if short);
  //  - with none chosen, the oldest delivery that can cover the whole run is used;
  //  - only when no single delivery can cover it (or old stock has no lot record) does it fall back
  //    to oldest-first across lots.
  // Lots on hold (moisture above the limit, or rejected) are never used.
  private async consumeBeanLots(tx: Prisma.TransactionClient, companyId: string, warehouseId: string, productId: string, quantity: number, chosenReceipt?: string) {
    let remaining = quantity;
    let costTotal = 0;
    let costedQty = 0;
    const used: { stockBatchId: string; batchNumber?: string; kg: number; unitCost: number }[] = [];
    let batches = await tx.stockBatch.findMany({
      where: { companyId, warehouseId, productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    const round = (n: number) => Math.round(n * 100) / 100;

    if (chosenReceipt) {
      const own = await tx.stockBatch.findMany({ where: { companyId, warehouseId, productId, batchNumber: chosenReceipt, deletedAt: null } });
      if (own.length > 0) {
        const availKg = own.filter((l) => l.status === "AVAILABLE").reduce((a, l) => a + Number(l.quantityRemaining), 0);
        const heldKg = own.filter((l) => l.status === "QUARANTINED").reduce((a, l) => a + Number(l.quantityRemaining), 0);
        if (availKg + 0.0001 < quantity) {
          if (availKg === 0 && heldKg > 0) {
            throw new BadRequestException(`Delivery ${chosenReceipt} is on hold (moisture above the limit, or rejected). Accept or reject it under Soya, Delivery analysis first.`);
          }
          throw new BadRequestException(`Delivery ${chosenReceipt} has only ${round(availKg)} kg left. Record ${round(availKg)} kg as this run, and the rest as a separate run from the next delivery, so each delivery's oil and cake stay separate.`);
        }
        batches = batches.filter((l) => (l.batchNumber ?? "").toUpperCase() === chosenReceipt);
      }
    } else {
      // No delivery chosen: use the oldest single delivery that can cover the whole run.
      const single = batches.find((l) => Number(l.quantityRemaining) + 0.0001 >= quantity);
      if (single) batches = [single];
    }

    for (const sb of batches) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, Number(sb.quantityRemaining));
      const batchUpdate = await tx.stockBatch.updateMany({ where: { id: sb.id, quantityRemaining: { gte: consumed } }, data: { quantityRemaining: { decrement: consumed } } });
      if (batchUpdate.count === 0) continue;
      costTotal += consumed * Number(sb.unitCost);
      costedQty += consumed;
      remaining -= consumed;
      used.push({ stockBatchId: sb.id, batchNumber: sb.batchNumber ?? undefined, kg: consumed, unitCost: Number(sb.unitCost ?? 0) });
    }
    if (remaining > 0.0001) {
      const held = await tx.stockBatch.aggregate({ where: { companyId, warehouseId, productId, status: "QUARANTINED", quantityRemaining: { gt: 0 }, deletedAt: null }, _sum: { quantityRemaining: true } });
      const heldKg = Number(held?._sum?.quantityRemaining ?? 0);
      if (heldKg > 0 && remaining <= heldKg + 0.0001) {
        throw new BadRequestException(`${Math.round(remaining)} kg of the beans you need are on hold (a delivery with moisture above the limit, or rejected). Accept or reject that delivery under Soya, Delivery analysis, or use fewer beans.`);
      }
    }
    return { costTotal, costedQty, lots: used };
  }

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

  // (2026-08-26) Missing the "empty array means unrestricted" check used
  // elsewhere in this codebase — a user with no explicit production
  // site/warehouse restrictions (the normal, common case) was blocked from
  // every scoped write, since an empty array can never .includes() anything.
  private assertProductionSiteAccess(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && user.productionSiteIds.length > 0 && !user.productionSiteIds.includes(productionSiteId)) throw new ForbiddenException("You do not have access to this production site.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string; productionSiteId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, productionSiteId: scope.productionSiteId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
