import { ForbiddenException, Injectable } from "@nestjs/common";
import { BusinessUnit, DashboardMetricKey, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

type Card = {
  key: string;
  label: string;
  value: number;
  unit?: string;
  tone: "neutral" | "good" | "warning" | "critical";
};

type Series = {
  name: string;
  data: { label: string; value: number }[];
};

const CARD_CONFIG: Array<{ key: string; label: string; metricKey: DashboardMetricKey; unit?: string; tone: Card["tone"] }> = [
  { key: "totalBirds", label: "Total birds", metricKey: "TOTAL_BIRDS", unit: "birds", tone: "neutral" },
  { key: "activeFlockBatches", label: "Active flock batches", metricKey: "ACTIVE_FLOCK_BATCHES", unit: "batches", tone: "neutral" },
  { key: "eggProductionToday", label: "Egg production today", metricKey: "EGG_PRODUCTION", unit: "eggs", tone: "good" },
  { key: "mortalityToday", label: "Mortality today", metricKey: "MORTALITY", unit: "birds", tone: "critical" },
  { key: "feedConsumedToday", label: "Feed consumed today", metricKey: "FEED_CONSUMED", unit: "kg", tone: "neutral" },
  { key: "feedProducedThisWeek", label: "Feed produced this week", metricKey: "FEED_PRODUCED", unit: "kg", tone: "good" },
  { key: "soyaBeansProcessedThisWeek", label: "Soya beans processed this week", metricKey: "SOYA_BEANS_PROCESSED", unit: "kg", tone: "good" },
  { key: "soyaOilProduced", label: "Soya oil produced", metricKey: "SOYA_OIL_PRODUCED", unit: "L", tone: "good" },
  { key: "soyaCakeProduced", label: "Soya cake produced", metricKey: "SOYA_CAKE_PRODUCED", unit: "kg", tone: "good" },
  { key: "currentInventoryValue", label: "Current inventory value", metricKey: "CURRENT_INVENTORY_VALUE", unit: "GHS", tone: "neutral" },
  { key: "salesThisMonth", label: "Sales this month", metricKey: "SALES", unit: "GHS", tone: "good" },
  { key: "outstandingCustomerDebt", label: "Outstanding customer debt", metricKey: "OUTSTANDING_CUSTOMER_DEBT", unit: "GHS", tone: "warning" },
  { key: "supplierDebt", label: "Supplier debt", metricKey: "SUPPLIER_DEBT", unit: "GHS", tone: "warning" },
  { key: "lowStockAlerts", label: "Low stock alerts", metricKey: "LOW_STOCK_ALERTS", unit: "alerts", tone: "critical" },
  { key: "pendingProductionOrders", label: "Pending production orders", metricKey: "PENDING_PRODUCTION_ORDERS", unit: "orders", tone: "warning" },
  { key: "pendingPurchaseApprovals", label: "Pending purchase approvals", metricKey: "PENDING_PURCHASE_APPROVALS", unit: "approvals", tone: "warning" },
  { key: "machineMaintenanceAlerts", label: "Machine maintenance alerts", metricKey: "MACHINE_MAINTENANCE_ALERTS", unit: "alerts", tone: "warning" },
  { key: "aiAlerts", label: "AI alerts", metricKey: "AI_ALERTS", unit: "alerts", tone: "warning" }
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async options(user: AuthenticatedUser) {
    const [company, branches, farms, warehouses, productionSites] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: user.companyId }, select: { id: true, name: true } }),
      this.prisma.branch.findMany({ where: this.branchWhere(user), select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: this.farmWhere(user), select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: this.warehouseWhere(user), select: { id: true, code: true, name: true, branchId: true, farmId: true, productionSiteId: true }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: this.productionSiteWhere(user), select: { id: true, code: true, name: true, branchId: true, type: true }, orderBy: { name: "asc" } })
    ]);

    return {
      data: {
        companies: company ? [company] : [],
        branches,
        farms,
        warehouses,
        productionSites,
        businessUnits: Object.values(BusinessUnit)
      }
    };
  }

  async executive(user: AuthenticatedUser, query: DashboardQueryDto) {
    this.assertCompany(user, query.companyId);
    this.assertScope(user, query.branchId, user.branchIds, "branch");
    this.assertScope(user, query.farmId, user.farmIds, "farm");
    this.assertScope(user, query.warehouseId, user.warehouseIds, "warehouse");
    this.assertScope(user, query.productionSiteId, user.productionSiteIds, "production site");

    const range = this.resolveRange(query);
    const baseWhere = this.metricWhere(user, query, range);

    const [summary, charts, alerts] = await Promise.all([
      this.summaryCards(baseWhere),
      this.charts(baseWhere),
      this.alerts(user, query, range)
    ]);

    return { data: { filters: { ...query, startDate: range.start.toISOString(), endDate: range.end.toISOString() }, summary, charts, alerts } };
  }

  private async summaryCards(baseWhere: Prisma.DashboardMetricSnapshotWhereInput): Promise<Card[]> {
    return Promise.all(
      CARD_CONFIG.map(async (card) => ({
        key: card.key,
        label: card.label,
        value: await this.sumMetric(baseWhere, card.metricKey),
        unit: card.unit,
        tone: card.tone
      }))
    );
  }

  private async charts(baseWhere: Prisma.DashboardMetricSnapshotWhereInput) {
    const [eggProductionTrend, mortalityTrend, feedProductionTrend, soyaProductionTrend, salesTrend] = await Promise.all([
      this.trend(baseWhere, "EGG_PRODUCTION", "Eggs"),
      this.trend(baseWhere, "MORTALITY", "Mortality"),
      this.trend(baseWhere, "FEED_PRODUCED", "Feed produced"),
      this.multiTrend(baseWhere, [
        ["SOYA_BEANS_PROCESSED", "Beans processed"],
        ["SOYA_OIL_PRODUCED", "Oil produced"],
        ["SOYA_CAKE_PRODUCED", "Cake produced"]
      ]),
      this.trend(baseWhere, "SALES", "Sales")
    ]);

    const [inventoryValueByCategory, profitabilityByProduct, farmPerformanceComparison, branchPerformanceComparison] = await Promise.all([
      this.dimensionChart(baseWhere, "CURRENT_INVENTORY_VALUE", "productCategory"),
      this.dimensionChart(baseWhere, "GROSS_PROFIT", "product"),
      this.dimensionChart(baseWhere, "FARM_PERFORMANCE_INDEX", "farm"),
      this.dimensionChart(baseWhere, "BRANCH_PERFORMANCE_INDEX", "branch")
    ]);

    return {
      eggProductionTrend,
      mortalityTrend,
      feedProductionTrend,
      soyaProductionTrend,
      salesTrend,
      inventoryValueByCategory,
      profitabilityByProduct,
      farmPerformanceComparison,
      branchPerformanceComparison
    };
  }

  private async sumMetric(baseWhere: Prisma.DashboardMetricSnapshotWhereInput, metricKey: DashboardMetricKey) {
    const result = await this.prisma.dashboardMetricSnapshot.aggregate({
      where: { ...baseWhere, metricKey },
      _sum: { value: true }
    });
    return Number(result._sum.value ?? 0);
  }

  private async trend(baseWhere: Prisma.DashboardMetricSnapshotWhereInput, metricKey: DashboardMetricKey, name: string): Promise<Series[]> {
    const rows = await this.prisma.dashboardMetricSnapshot.findMany({
      where: { ...baseWhere, metricKey },
      select: { metricDate: true, value: true },
      orderBy: { metricDate: "asc" }
    });

    const grouped = new Map<string, number>();
    for (const row of rows) {
      const key = this.formatDate(row.metricDate);
      grouped.set(key, (grouped.get(key) ?? 0) + Number(row.value));
    }

    return [{ name, data: Array.from(grouped, ([label, value]) => ({ label, value })) }];
  }

  private async multiTrend(baseWhere: Prisma.DashboardMetricSnapshotWhereInput, metrics: Array<[DashboardMetricKey, string]>): Promise<Series[]> {
    return Promise.all(metrics.map(([metricKey, name]) => this.trend(baseWhere, metricKey, name).then((series) => series[0])));
  }

  private async dimensionChart(
    baseWhere: Prisma.DashboardMetricSnapshotWhereInput,
    metricKey: DashboardMetricKey,
    dimension: "productCategory" | "product" | "farm" | "branch"
  ) {
    const rows = await this.prisma.dashboardMetricSnapshot.findMany({
      where: { ...baseWhere, metricKey },
      include: {
        productCategory: { select: { name: true } },
        product: { select: { name: true } },
        farm: { select: { name: true } },
        branch: { select: { name: true } }
      }
    });

    const grouped = new Map<string, number>();
    for (const row of rows) {
      const label = row[dimension]?.name ?? row.label ?? "Unassigned";
      grouped.set(label, (grouped.get(label) ?? 0) + Number(row.value));
    }

    return [{ name: metricKey.toLowerCase(), data: Array.from(grouped, ([label, value]) => ({ label, value })) }];
  }

  private async alerts(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }) {
    return this.prisma.dashboardAlert.findMany({
      where: this.alertWhere(user, query, range),
      select: { id: true, title: true, message: true, severity: true, status: true, businessUnit: true, occurredAt: true },
      orderBy: [{ severity: "desc" }, { occurredAt: "desc" }],
      take: 8
    });
  }

  private metricWhere(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }): Prisma.DashboardMetricSnapshotWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      metricDate: { gte: range.start, lte: range.end },
      branchId: query.branchId,
      farmId: query.farmId,
      warehouseId: query.warehouseId,
      productionSiteId: query.productionSiteId,
      businessUnit: query.businessUnit,
      AND: this.scopeClauses(user)
    };
  }

  private alertWhere(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }): Prisma.DashboardAlertWhereInput {
    return {
      companyId: user.companyId,
      deletedAt: null,
      status: "OPEN",
      occurredAt: { gte: range.start, lte: range.end },
      branchId: query.branchId,
      farmId: query.farmId,
      warehouseId: query.warehouseId,
      productionSiteId: query.productionSiteId,
      businessUnit: query.businessUnit,
      AND: this.scopeClauses(user)
    };
  }

  private scopeClauses(user: AuthenticatedUser) {
    if (user.hasGlobalAccess) {
      return [];
    }

    return [
      { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] },
      { OR: [{ farmId: null }, { farmId: { in: user.farmIds } }] },
      { OR: [{ warehouseId: null }, { warehouseId: { in: user.warehouseIds } }] },
      { OR: [{ productionSiteId: null }, { productionSiteId: { in: user.productionSiteIds } }] }
    ];
  }

  private branchWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } }) };
  }

  private farmWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) };
  }

  private warehouseWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) };
  }

  private productionSiteWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) };
  }

  private assertCompany(user: AuthenticatedUser, companyId?: string) {
    if (companyId && companyId !== user.companyId) {
      throw new ForbiddenException("You do not have access to this company.");
    }
  }

  private assertScope(user: AuthenticatedUser, id: string | undefined, allowedIds: string[], label: string) {
    if (!id || user.hasGlobalAccess) {
      return;
    }
    if (!allowedIds.includes(id)) {
      throw new ForbiddenException(`You do not have access to this ${label}.`);
    }
  }

  private resolveRange(query: DashboardQueryDto) {
    const end = query.endDate ? new Date(query.endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = query.startDate ? new Date(query.startDate) : new Date(end);
    if (!query.startDate) {
      start.setDate(start.getDate() - 29);
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
