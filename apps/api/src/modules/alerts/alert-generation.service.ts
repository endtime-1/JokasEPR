import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/dto/notifications.dto";

type RawAlert = {
  companyId: string;
  branchId?: string | null;
  farmId?: string | null;
  warehouseId?: string | null;
  productionSiteId?: string | null;
  category: string;
  severity: string;
  title: string;
  message: string;
  requiredPermission: string;
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
};

type RawForecast = {
  companyId: string;
  category: string;
  entityType: string;
  entityId: string;
  entityName: string;
  forecastDate: Date;
  forecastValue: number;
  unit?: string | null;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

@Injectable()
export class AlertGenerationService {
  private readonly logger = new Logger(AlertGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async generateAll(companyId: string): Promise<number> {
    const alerts: RawAlert[] = [];
    const forecastCount = await this.generateForecasts(companyId);

    await Promise.all([
      this.mortalityAnomaly(companyId, alerts),
      this.eggProductionDrop(companyId, alerts),
      this.feedConsumptionAnomaly(companyId, alerts),
      this.lowStockPrediction(companyId, alerts),
      this.feedDemandForecast(companyId, alerts),
      this.salesForecast(companyId, alerts),
      this.customerReorderPrediction(companyId, alerts),
      this.smartPricing(companyId, alerts),
      this.soyaYieldAnomaly(companyId, alerts),
      this.machineMaintenancePrediction(companyId, alerts),
      this.customerDebtRisk(companyId, alerts),
      this.supplierDelayRisk(companyId, alerts)
    ]);

    if (!alerts.length) return forecastCount;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.prisma.aiAlert.findMany({
      where: { companyId, status: "UNREAD", createdAt: { gte: today } },
      select: { category: true, entityId: true }
    });
    const existingKeys = new Set(existing.map((e) => `${e.category}:${e.entityId ?? ""}`));
    const fresh = alerts.filter((a) => !existingKeys.has(`${a.category}:${a.entityId ?? ""}`));

    if (!fresh.length) return forecastCount;

    await this.prisma.aiAlert.createMany({
      data: fresh.map((a) => ({
        companyId: a.companyId,
        branchId: a.branchId ?? null,
        farmId: a.farmId ?? null,
        warehouseId: a.warehouseId ?? null,
        productionSiteId: a.productionSiteId ?? null,
        category: a.category as any,
        severity: a.severity as any,
        status: "UNREAD" as any,
        title: a.title,
        message: a.message,
        requiredPermission: a.requiredPermission,
        entityType: a.entityType ?? null,
        entityId: a.entityId ?? null,
        entityName: a.entityName ?? null,
        expiresAt: new Date(Date.now() + 7 * 86400000)
      }))
    });

    await Promise.all(
      fresh.map((alert) =>
        this.notifications
          .broadcast(companyId, alert.requiredPermission, {
            type: NotificationType.AI_RISK_ALERT,
            title: alert.title,
            body: alert.message,
            entityType: alert.entityType ?? "AIAlert",
            entityId: alert.entityId ?? undefined,
            metadata: {
              category: alert.category,
              severity: alert.severity,
              branchId: alert.branchId ?? null,
              farmId: alert.farmId ?? null,
              warehouseId: alert.warehouseId ?? null,
              productionSiteId: alert.productionSiteId ?? null
            }
          })
          .catch((error) => this.logger.warn(`Failed to broadcast AI alert notification: ${(error as Error).message}`))
      )
    );

    this.logger.log(`Generated ${fresh.length} new alert(s) for company ${companyId}`);
    return fresh.length + forecastCount;
  }

  private async generateForecasts(companyId: string): Promise<number> {
    const forecasts: RawForecast[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await Promise.all([
      this.forecastFeedDemand(companyId, forecasts),
      this.forecastSales(companyId, forecasts),
      this.forecastCustomerReorders(companyId, forecasts),
      this.forecastLowStock(companyId, forecasts),
      this.forecastSoyaYield(companyId, forecasts),
      this.forecastMachineMaintenance(companyId, forecasts)
    ]);

    await this.prisma.aiForecast.deleteMany({
      where: { companyId, createdAt: { gte: today } }
    });

    if (!forecasts.length) return 0;

    await this.prisma.aiForecast.createMany({
      data: forecasts.map((f) => ({
        companyId: f.companyId,
        category: f.category as any,
        entityType: f.entityType,
        entityId: f.entityId,
        entityName: f.entityName,
        forecastDate: f.forecastDate,
        forecastValue: f.forecastValue,
        unit: f.unit ?? null,
        confidence: f.confidence ?? 0.7,
        metadata: (f.metadata ?? {}) as Prisma.InputJsonValue
      }))
    });

    return forecasts.length;
  }

  private async forecastFeedDemand(companyId: string, out: RawForecast[]) {
    const since14 = new Date(Date.now() - 14 * 86400000);
    const totals = await this.prisma.feedConsumptionRecord.aggregate({
      where: { companyId, recordDate: { gte: since14 } },
      _sum: { quantityKg: true },
      _count: { id: true }
    });
    const dailyAvg = Number(totals._sum.quantityKg ?? 0) / Math.max(totals._count.id, 1);
    if (dailyAvg <= 0) return;
    out.push({
      companyId,
      category: "FEED_DEMAND_FORECAST",
      entityType: "Company",
      entityId: companyId,
      entityName: "Feed demand next 7 days",
      forecastDate: new Date(Date.now() + 7 * 86400000),
      forecastValue: dailyAvg * 7,
      unit: "kg",
      confidence: totals._count.id >= 10 ? 0.78 : 0.62,
      metadata: { dailyAverageKg: dailyAvg, sourceDays: 14 }
    });
  }

  private async forecastSales(companyId: string, out: RawForecast[]) {
    const since30 = new Date(Date.now() - 30 * 86400000);
    const result = await this.prisma.invoice.aggregate({
      where: { companyId, invoiceDate: { gte: since30 }, status: { notIn: ["VOID", "DRAFT"] } },
      _sum: { totalAmount: true },
      _count: { id: true }
    });
    const last30Sales = Number(result._sum.totalAmount ?? 0);
    if (last30Sales <= 0) return;
    out.push({
      companyId,
      category: "SALES_FORECAST",
      entityType: "Company",
      entityId: companyId,
      entityName: "Sales next 30 days",
      forecastDate: new Date(Date.now() + 30 * 86400000),
      forecastValue: last30Sales,
      unit: "GHS",
      confidence: result._count.id >= 8 ? 0.75 : 0.58,
      metadata: { basis: "rolling_30_day_invoice_value", invoiceCount: result._count.id }
    });
  }

  private async forecastCustomerReorders(companyId: string, out: RawForecast[]) {
    const since90 = new Date(Date.now() - 90 * 86400000);
    const since21 = new Date(Date.now() - 21 * 86400000);
    const regulars = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: { companyId, invoiceDate: { gte: since90 }, status: { notIn: ["VOID", "DRAFT"] } },
      _count: { id: true },
      having: { id: { _count: { gte: 2 } } },
      orderBy: { _count: { id: "desc" } },
      take: 20
    });
    const customerIds = regulars.map((r) => r.customerId).filter(Boolean) as string[];
    if (!customerIds.length) return;

    const recent = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: { companyId, customerId: { in: customerIds }, invoiceDate: { gte: since21 }, status: { notIn: ["VOID", "DRAFT"] } },
      _count: { id: true }
    });
    const recentIds = new Set(recent.map((r) => r.customerId));
    const candidates = customerIds.filter((id) => !recentIds.has(id)).slice(0, 10);
    const customers = await this.prisma.customer.findMany({
      where: { companyId, id: { in: candidates } },
      select: { id: true, name: true }
    });

    for (const customer of customers) {
      out.push({
        companyId,
        category: "CUSTOMER_REORDER_PREDICTION",
        entityType: "Customer",
        entityId: customer.id,
        entityName: customer.name,
        forecastDate: new Date(Date.now() + 7 * 86400000),
        forecastValue: 0.68,
        unit: "probability",
        confidence: 0.64,
        metadata: { signal: "regular_customer_without_recent_invoice" }
      });
    }
  }

  private async forecastLowStock(companyId: string, out: RawForecast[]) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { companyId, deletedAt: null, status: "ACTIVE", quantityOnHand: { gt: 0 } },
      select: { id: true, quantityOnHand: true, product: { select: { name: true } } },
      take: 60
    });
    const since30 = new Date(Date.now() - 30 * 86400000);
    for (const item of items) {
      const usage = await this.prisma.stockMovement.aggregate({
        where: {
          companyId,
          inventoryItemId: item.id,
          createdAt: { gte: since30 },
          movementType: { in: ["SALE_DISPATCH", "PRODUCTION_INPUT", "TRANSFER", "ADJUSTMENT_OUT", "WASTE"] }
        },
        _sum: { quantity: true },
        _count: { id: true }
      });
      const dailyUsage = Number(usage._sum.quantity ?? 0) / 30;
      if (dailyUsage <= 0) continue;
      const daysRemaining = Number(item.quantityOnHand) / dailyUsage;
      if (daysRemaining <= 21) {
        out.push({
          companyId,
          category: "LOW_STOCK_PREDICTION",
          entityType: "InventoryItem",
          entityId: item.id,
          entityName: item.product.name,
          forecastDate: new Date(Date.now() + Math.max(1, Math.ceil(daysRemaining)) * 86400000),
          forecastValue: daysRemaining,
          unit: "days_to_stockout",
          confidence: usage._count.id >= 4 ? 0.76 : 0.6,
          metadata: { dailyUsage, quantityOnHand: Number(item.quantityOnHand) }
        });
      }
    }
  }

  private async forecastSoyaYield(companyId: string, out: RawForecast[]) {
    const batches = await this.prisma.soyaProcessingBatch.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { processingDate: "desc" },
      take: 8,
      select: {
        id: true,
        batchNumber: true,
        beansUsedKg: true,
        oilOutputs: { select: { quantityLitres: true } }
      }
    });
    const yields = batches
      .filter((batch) => Number(batch.beansUsedKg) > 0)
      .map((batch) => batch.oilOutputs.reduce((sum, output) => sum + Number(output.quantityLitres), 0) / Number(batch.beansUsedKg));
    if (!yields.length) return;
    out.push({
      companyId,
      category: "SOYA_YIELD_ANOMALY",
      entityType: "SoyaProcessingBatch",
      entityId: batches[0].id,
      entityName: "Expected soya oil yield",
      forecastDate: new Date(Date.now() + 7 * 86400000),
      forecastValue: avg(yields) * 100,
      unit: "percent",
      confidence: yields.length >= 5 ? 0.74 : 0.58,
      metadata: { sampleBatches: yields.length, latestBatch: batches[0].batchNumber }
    });
  }

  private async forecastMachineMaintenance(companyId: string, out: RawForecast[]) {
    const schedules = await this.prisma.maintenanceSchedule.findMany({
      where: { companyId, deletedAt: null, status: { in: ["SCHEDULED", "OVERDUE"] } },
      orderBy: { nextDueDate: "asc" },
      take: 12,
      select: { id: true, title: true, nextDueDate: true, machine: { select: { id: true, name: true } } }
    });
    for (const schedule of schedules) {
      const daysUntil = Math.ceil((schedule.nextDueDate.getTime() - Date.now()) / 86400000);
      if (daysUntil > 14) continue;
      out.push({
        companyId,
        category: "MACHINE_MAINTENANCE",
        entityType: "Machine",
        entityId: schedule.machine?.id ?? schedule.id,
        entityName: schedule.machine?.name ?? schedule.title,
        forecastDate: schedule.nextDueDate,
        forecastValue: daysUntil,
        unit: "days_until_due",
        confidence: 0.82,
        metadata: { scheduleId: schedule.id, title: schedule.title }
      });
    }
  }

  // ── 1. Mortality Anomaly ──────────────────────────────────────────────────
  private async mortalityAnomaly(companyId: string, out: RawAlert[]) {
    const flocks = await this.prisma.flockBatch.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, openingBirdCount: true, farmId: true, farm: { select: { name: true, branchId: true } } }
    });

    for (const flock of flocks) {
      const records = await this.prisma.mortalityRecord.findMany({
        where: { companyId, flockBatchId: flock.id, isCulling: false },
        orderBy: { recordDate: "desc" },
        take: 14,
        select: { birdCount: true }
      });
      if (records.length < 7) continue;

      const daily = records.map((r) => r.birdCount);
      const recent3 = avg(daily.slice(0, 3));
      const baseline = avg(daily.slice(3));
      const sd = stdDev(daily.slice(3));
      const threshold = Math.max(baseline + 2 * sd, baseline * 2, 3);

      if (recent3 > threshold && recent3 >= 2) {
        const rate = flock.openingBirdCount > 0 ? ((recent3 / flock.openingBirdCount) * 100).toFixed(2) : "N/A";
        out.push({
          companyId,
          category: "MORTALITY_ANOMALY",
          severity: recent3 > threshold * 2 ? "CRITICAL" : "HIGH",
          title: `High Mortality: ${flock.name}`,
          message: `Flock ${flock.name} at ${flock.farm.name} averaged ${recent3.toFixed(1)} deaths/day over the last 3 days (baseline: ${baseline.toFixed(1)}). Mortality rate: ${rate}%. Investigate disease, feed quality, or environment.`,
          requiredPermission: "poultry.read",
          entityType: "FlockBatch",
          entityId: flock.id,
          entityName: flock.name,
          farmId: flock.farmId,
          branchId: flock.farm.branchId
        });
      }
    }
  }

  // ── 2. Egg Production Drop ────────────────────────────────────────────────
  private async eggProductionDrop(companyId: string, out: RawAlert[]) {
    const flocks = await this.prisma.flockBatch.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, farmId: true, farm: { select: { name: true, branchId: true } } }
    });

    for (const flock of flocks) {
      const records = await this.prisma.eggProductionRecord.findMany({
        where: { companyId, flockBatchId: flock.id },
        orderBy: { recordDate: "desc" },
        take: 14,
        select: { goodEggs: true }
      });
      if (records.length < 7) continue;

      const recent3 = avg(records.slice(0, 3).map((r) => r.goodEggs));
      const baseline = avg(records.slice(3).map((r) => r.goodEggs));
      if (baseline < 5) continue;

      const dropPct = ((baseline - recent3) / baseline) * 100;
      if (dropPct >= 20) {
        out.push({
          companyId,
          category: "EGG_PRODUCTION_DROP",
          severity: dropPct >= 40 ? "HIGH" : "MEDIUM",
          title: `Egg Drop: ${flock.name} (${dropPct.toFixed(0)}% decline)`,
          message: `Flock ${flock.name} at ${flock.farm.name} egg production dropped ${dropPct.toFixed(1)}% — from ${baseline.toFixed(0)} to ${recent3.toFixed(0)} eggs/day. Check lighting, nutrition, stress, or disease.`,
          requiredPermission: "poultry.read",
          entityType: "FlockBatch",
          entityId: flock.id,
          entityName: flock.name,
          farmId: flock.farmId,
          branchId: flock.farm.branchId
        });
      }
    }
  }

  // ── 3. Feed Consumption Anomaly ───────────────────────────────────────────
  private async feedConsumptionAnomaly(companyId: string, out: RawAlert[]) {
    const flocks = await this.prisma.flockBatch.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true, farmId: true, farm: { select: { name: true, branchId: true } } }
    });

    for (const flock of flocks) {
      const records = await this.prisma.feedConsumptionRecord.findMany({
        where: { companyId, flockBatchId: flock.id },
        orderBy: { recordDate: "desc" },
        take: 14,
        select: { quantityKg: true }
      });
      if (records.length < 7) continue;

      const daily = records.map((r) => Number(r.quantityKg));
      const recent3 = avg(daily.slice(0, 3));
      const baseline = avg(daily.slice(3));
      const sd = stdDev(daily.slice(3));
      if (baseline < 1) continue;

      const dropPct = ((baseline - recent3) / baseline) * 100;
      const spikePct = ((recent3 - baseline) / baseline) * 100;

      if (dropPct >= 25) {
        out.push({
          companyId,
          category: "FEED_CONSUMPTION_ANOMALY",
          severity: "MEDIUM",
          title: `Feed Drop: ${flock.name} (-${dropPct.toFixed(0)}%)`,
          message: `Feed consumption for ${flock.name} at ${flock.farm.name} dropped ${dropPct.toFixed(1)}% (${baseline.toFixed(1)} → ${recent3.toFixed(1)} kg/day). Low appetite can signal health issues.`,
          requiredPermission: "poultry.read",
          entityType: "FlockBatch",
          entityId: flock.id,
          entityName: flock.name,
          farmId: flock.farmId,
          branchId: flock.farm.branchId
        });
      } else if (spikePct >= 30 && recent3 > baseline + 2 * sd) {
        out.push({
          companyId,
          category: "FEED_CONSUMPTION_ANOMALY",
          severity: "LOW",
          title: `Feed Spike: ${flock.name} (+${spikePct.toFixed(0)}%)`,
          message: `Feed consumption for ${flock.name} spiked ${spikePct.toFixed(1)}% above baseline. Verify feed wastage or recording accuracy.`,
          requiredPermission: "poultry.read",
          entityType: "FlockBatch",
          entityId: flock.id,
          entityName: flock.name,
          farmId: flock.farmId,
          branchId: flock.farm.branchId
        });
      }
    }
  }

  // ── 4. Low Stock Prediction ────────────────────────────────────────────────
  private async lowStockPrediction(companyId: string, out: RawAlert[]) {
    const reorderLevels = await this.prisma.stockReorderLevel.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: {
        inventoryItemId: true,
        minimumQuantity: true,
        warehouseId: true,
        branchId: true,
        product: { select: { id: true, name: true } },
        warehouse: { select: { name: true } }
      }
    });

    for (const rl of reorderLevels) {
      const agg = await this.prisma.stockBatch.aggregate({
        where: { companyId, inventoryItemId: rl.inventoryItemId, warehouseId: rl.warehouseId, deletedAt: null },
        _sum: { quantityRemaining: true }
      });
      const onHand = Number(agg._sum.quantityRemaining ?? 0);
      const minQty = Number(rl.minimumQuantity);
      if (onHand <= minQty) {
        const ratio = minQty > 0 ? onHand / minQty : 0;
        const productName = rl.product.name;
        out.push({
          companyId,
          category: "LOW_STOCK_PREDICTION",
          severity: onHand === 0 ? "CRITICAL" : ratio < 0.5 ? "HIGH" : "MEDIUM",
          title: `Low Stock: ${productName}`,
          message: `${productName} at ${rl.warehouse.name} has ${onHand.toFixed(2)} units — at or below minimum of ${minQty}. Raise a purchase request immediately.`,
          requiredPermission: "inventory.read",
          entityType: "InventoryItem",
          entityId: rl.inventoryItemId,
          entityName: productName,
          warehouseId: rl.warehouseId,
          branchId: rl.branchId
        });
      }
    }
  }

  // ── 5. Feed Demand Forecast ────────────────────────────────────────────────
  private async feedDemandForecast(companyId: string, out: RawAlert[]) {
    const since14 = new Date(Date.now() - 14 * 86400000);
    const totals = await this.prisma.feedConsumptionRecord.aggregate({
      where: { companyId, recordDate: { gte: since14 } },
      _sum: { quantityKg: true },
      _count: { id: true }
    });
    const days = totals._count.id || 1;
    const dailyAvg = Number(totals._sum.quantityKg ?? 0) / days;
    if (dailyAvg < 1) return;

    const forecastWeek = dailyAvg * 7;
    const stockAgg = await this.prisma.finishedFeedStock.aggregate({
      where: { companyId, deletedAt: null },
      _sum: { quantityKg: true }
    });
    const currentStock = Number(stockAgg._sum.quantityKg ?? 0);
    const daysRemaining = dailyAvg > 0 ? currentStock / dailyAvg : 999;

    if (daysRemaining < 14) {
      out.push({
        companyId,
        category: "FEED_DEMAND_FORECAST",
        severity: daysRemaining < 7 ? "HIGH" : "MEDIUM",
        title: `Feed Stock: ${daysRemaining.toFixed(0)} days remaining`,
        message: `At ${dailyAvg.toFixed(0)} kg/day consumption, finished feed stock (${currentStock.toFixed(0)} kg) will last ~${daysRemaining.toFixed(0)} days. Weekly forecast: ${forecastWeek.toFixed(0)} kg needed. Schedule production or procurement.`,
        requiredPermission: "feed.read",
        entityType: "Company",
        entityId: companyId,
        entityName: "Feed Stock"
      });
    }
  }

  // ── 6. Sales Forecast ─────────────────────────────────────────────────────
  private async salesForecast(companyId: string, out: RawAlert[]) {
    const since90 = new Date(Date.now() - 90 * 86400000);
    const since60 = new Date(Date.now() - 60 * 86400000);
    const since30 = new Date(Date.now() - 30 * 86400000);

    const [older, recent] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, invoiceDate: { gte: since90, lt: since60 }, status: { notIn: ["VOID", "DRAFT"] } },
        _sum: { totalAmount: true }
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, invoiceDate: { gte: since30 }, status: { notIn: ["VOID", "DRAFT"] } },
        _sum: { totalAmount: true }
      })
    ]);

    const olderAmt = Number(older._sum.totalAmount ?? 0);
    const recentAmt = Number(recent._sum.totalAmount ?? 0);
    if (olderAmt < 100) return;

    const changePct = ((recentAmt - olderAmt) / olderAmt) * 100;
    if (changePct <= -20) {
      out.push({
        companyId,
        category: "SALES_FORECAST",
        severity: changePct <= -40 ? "HIGH" : "MEDIUM",
        title: `Sales Down ${Math.abs(changePct).toFixed(0)}% vs Prior Period`,
        message: `Sales revenue dropped from ${olderAmt.toFixed(2)} (30–90 days ago) to ${recentAmt.toFixed(2)} in the last 30 days — a ${Math.abs(changePct).toFixed(1)}% decline. Review pricing, demand, and customer retention.`,
        requiredPermission: "sales.read",
        entityType: "Company",
        entityId: companyId,
        entityName: "Sales"
      });
    }
  }

  // ── 7. Customer Reorder Prediction ────────────────────────────────────────
  private async customerReorderPrediction(companyId: string, out: RawAlert[]) {
    const since90 = new Date(Date.now() - 90 * 86400000);
    const since45 = new Date(Date.now() - 45 * 86400000);

    const regulars = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: { companyId, invoiceDate: { gte: since90 }, status: { notIn: ["VOID", "DRAFT"] } },
      _count: { id: true },
      having: { id: { _count: { gte: 2 } } }
    });

    const regularIds = regulars.map((r) => r.customerId).filter(Boolean) as string[];
    if (!regularIds.length) return;

    const recent = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: { companyId, customerId: { in: regularIds }, invoiceDate: { gte: since45 }, status: { notIn: ["VOID", "DRAFT"] } },
      _max: { invoiceDate: true }
    });
    const recentMap = new Map(recent.map((r) => [r.customerId, r._max.invoiceDate]));

    const overdue = regularIds.filter((id) => !recentMap.has(id));
    if (!overdue.length) return;

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: overdue.slice(0, 5) } },
      select: { id: true, name: true, branchId: true }
    });
    for (const c of customers) {
      out.push({
        companyId,
        category: "CUSTOMER_REORDER_PREDICTION",
        severity: "LOW",
        title: `Customer Overdue: ${c.name}`,
        message: `${c.name} ordered regularly in the past 90 days but has not placed an order in 45+ days. Consider a follow-up to re-engage.`,
        requiredPermission: "sales.read",
        entityType: "Customer",
        entityId: c.id,
        entityName: c.name,
        branchId: c.branchId
      });
    }
  }

  // ── 8. Smart Pricing ──────────────────────────────────────────────────────
  private async smartPricing(companyId: string, out: RawAlert[]) {
    const since30 = new Date(Date.now() - 30 * 86400000);
    const since90 = new Date(Date.now() - 90 * 86400000);

    const [recentLines, olderLines] = await Promise.all([
      this.prisma.salesOrderItem.groupBy({
        by: ["productId"],
        where: { salesOrder: { companyId, orderDate: { gte: since30 }, status: { not: "CANCELLED" } } },
        _avg: { unitPrice: true },
        _sum: { quantity: true }
      }),
      this.prisma.salesOrderItem.groupBy({
        by: ["productId"],
        where: { salesOrder: { companyId, orderDate: { gte: since90, lt: since30 }, status: { not: "CANCELLED" } } },
        _avg: { unitPrice: true }
      })
    ]);

    const olderMap = new Map(olderLines.map((l) => [l.productId, Number(l._avg.unitPrice ?? 0)]));

    for (const line of recentLines) {
      const recentPrice = Number(line._avg.unitPrice ?? 0);
      const olderPrice = olderMap.get(line.productId) ?? 0;
      if (olderPrice < 1 || recentPrice < 1) continue;
      const drop = ((olderPrice - recentPrice) / olderPrice) * 100;
      if (drop >= 15) {
        const product = await this.prisma.product.findFirst({
          where: { id: line.productId },
          select: { name: true }
        });
        if (!product) continue;
        out.push({
          companyId,
          category: "SMART_PRICING",
          severity: "LOW",
          title: `Price Drop: ${product.name} (-${drop.toFixed(0)}%)`,
          message: `${product.name} average selling price dropped from ${olderPrice.toFixed(2)} to ${recentPrice.toFixed(2)} over 30 days (${drop.toFixed(1)}% decline). Review pricing strategy to protect margins.`,
          requiredPermission: "sales.read",
          entityType: "Product",
          entityId: line.productId,
          entityName: product.name
        });
      }
    }
  }

  // ── 9. Soya Yield Anomaly ─────────────────────────────────────────────────
  private async soyaYieldAnomaly(companyId: string, out: RawAlert[]) {
    const batches = await this.prisma.soyaProcessingBatch.findMany({
      where: { companyId, status: { in: ["COMPLETED", "PROCESSING"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, batchNumber: true, beansUsedKg: true,
        oilOutputs: { select: { quantityLitres: true } },
        cakeOutputs: { select: { quantityKg: true } },
        productionSite: { select: { name: true, branchId: true } },
        productionSiteId: true
      }
    });

    const withYield = batches
      .filter((b) => Number(b.beansUsedKg) > 0)
      .map((b) => {
        const oil = b.oilOutputs.reduce((s, o) => s + Number(o.quantityLitres), 0);
        const cake = b.cakeOutputs.reduce((s, o) => s + Number(o.quantityKg), 0);
        return {
          id: b.id,
          name: b.batchNumber,
          ratio: (oil + cake) / Number(b.beansUsedKg),
          productionSiteId: b.productionSiteId,
          siteName: b.productionSite?.name ?? "",
          branchId: b.productionSite?.branchId
        };
      });

    if (withYield.length < 5) return;

    const ratios = withYield.map((y) => y.ratio);
    const baselineAvg = avg(ratios.slice(1));
    const sd = stdDev(ratios.slice(1));
    const latest = withYield[0];

    if (latest.ratio < baselineAvg - 2 * sd && latest.ratio < baselineAvg * 0.8) {
      out.push({
        companyId,
        category: "SOYA_YIELD_ANOMALY",
        severity: "MEDIUM",
        title: `Low Soya Yield: Batch ${latest.name}`,
        message: `Soya batch ${latest.name} at ${latest.siteName} achieved ${(latest.ratio * 100).toFixed(1)}% yield ratio vs average of ${(baselineAvg * 100).toFixed(1)}%. Check raw material quality, processing temperature, and equipment.`,
        requiredPermission: "soya.read",
        entityType: "SoyaProcessingBatch",
        entityId: latest.id,
        entityName: latest.name,
        productionSiteId: latest.productionSiteId ?? undefined,
        branchId: latest.branchId ?? undefined
      });
    }
  }

  // ── 10. Machine Maintenance Prediction ────────────────────────────────────
  private async machineMaintenancePrediction(companyId: string, out: RawAlert[]) {
    const upcoming = await this.prisma.maintenanceSchedule.findMany({
      where: {
        companyId,
        status: { in: ["SCHEDULED", "OVERDUE"] },
        nextDueDate: { lte: new Date(Date.now() + 7 * 86400000) }
      },
      select: {
        id: true, title: true, nextDueDate: true,
        machine: { select: { id: true, name: true, branchId: true } }
      },
      take: 10
    });

    for (const s of upcoming) {
      const daysUntil = Math.ceil((s.nextDueDate.getTime() - Date.now()) / 86400000);
      const isOverdue = daysUntil < 0;
      const machineName = s.machine?.name ?? "Unknown Machine";
      const machineId = s.machine?.id ?? s.id;
      const machineBranchId = s.machine?.branchId;
      out.push({
        companyId,
        category: "MACHINE_MAINTENANCE",
        severity: isOverdue ? "HIGH" : "MEDIUM",
        title: `${isOverdue ? "Overdue" : "Due Soon"}: ${s.title} — ${machineName}`,
        message: `Maintenance "${s.title}" for ${machineName} is ${isOverdue ? `${Math.abs(daysUntil)} day(s) overdue` : `due in ${daysUntil} day(s)`}. Schedule immediately to prevent breakdown.`,
        requiredPermission: "maintenance.read",
        entityType: "Machine",
        entityId: machineId,
        entityName: machineName,
        branchId: machineBranchId ?? undefined
      });
    }
  }

  // ── 11. Customer Debt Risk ────────────────────────────────────────────────
  private async customerDebtRisk(companyId: string, out: RawAlert[]) {
    const limits = await this.prisma.customerCreditLimit.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: {
        creditLimit: true,
        currentBalance: true,
        branchId: true,
        customer: { select: { id: true, name: true } }
      }
    });

    for (const l of limits) {
      const creditLimit = Number(l.creditLimit);
      const balance = Number(l.currentBalance);
      if (creditLimit <= 0) continue;
      const usagePct = (balance / creditLimit) * 100;
      if (usagePct >= 85) {
        out.push({
          companyId,
          category: "CUSTOMER_DEBT_RISK",
          severity: usagePct >= 100 ? "CRITICAL" : usagePct >= 95 ? "HIGH" : "MEDIUM",
          title: `Debt Risk: ${l.customer.name} (${usagePct.toFixed(0)}% of limit)`,
          message: `${l.customer.name} has an outstanding balance of ${balance.toFixed(2)} against a credit limit of ${creditLimit.toFixed(2)} (${usagePct.toFixed(1)}% utilized). Consider pausing credit sales until payment is received.`,
          requiredPermission: "sales.read",
          entityType: "Customer",
          entityId: l.customer.id,
          entityName: l.customer.name,
          branchId: l.branchId
        });
      }
    }
  }

  // ── 12. Supplier Delay Risk ────────────────────────────────────────────────
  private async supplierDelayRisk(companyId: string, out: RawAlert[]) {
    const overduePOs = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId,
        status: { in: ["APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"] },
        expectedDelivery: { lt: new Date() }
      },
      select: {
        id: true,
        reference: true,
        expectedDelivery: true,
        supplier: { select: { id: true, name: true } }
      },
      take: 10
    });

    for (const po of overduePOs) {
      if (!po.expectedDelivery) continue;
      const daysOverdue = Math.ceil((Date.now() - po.expectedDelivery.getTime()) / 86400000);
      out.push({
        companyId,
        category: "SUPPLIER_DELAY_RISK",
        severity: daysOverdue > 14 ? "HIGH" : "MEDIUM",
        title: `Late Delivery: ${po.supplier.name} (${po.reference})`,
        message: `Purchase order ${po.reference} from ${po.supplier.name} is ${daysOverdue} day(s) overdue. Contact supplier and consider alternative sourcing to avoid stock-outs.`,
        requiredPermission: "procurement.read",
        entityType: "PurchaseOrder",
        entityId: po.id,
        entityName: po.reference
      });
    }
  }
}
