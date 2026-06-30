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

  async summary(user: AuthenticatedUser) {
    const companyId = user.companyId;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [salesAgg, openOrders, totalBirds, pendingAlerts] = await Promise.all([
      this.prisma.salesOrder.aggregate({ where: { companyId, status: { not: "CANCELLED" }, createdAt: { gte: monthStart } }, _sum: { totalAmount: true } }),
      this.prisma.salesOrder.count({ where: { companyId, status: { in: ["DRAFT", "PENDING_STOCK_APPROVAL", "APPROVED"] } } }),
      this.prisma.flockBatch.aggregate({ where: { companyId, status: "ACTIVE", deletedAt: null }, _sum: { openingBirdCount: true } }),
      this.prisma.stockExpiryAlert.count({ where: { companyId, deletedAt: null, daysToExpiry: { lte: 30 } } }),
    ]);

    return {
      data: {
        totalRevenue: salesAgg._sum.totalAmount ?? 0,
        openOrders,
        totalBirds: totalBirds._sum.openingBirdCount ?? 0,
        pendingAlerts,
      },
    };
  }

  async executive(user: AuthenticatedUser, query: DashboardQueryDto) {
    this.assertCompany(user, query.companyId);
    this.assertScope(user, query.branchId, user.branchIds, "branch");
    this.assertScope(user, query.farmId, user.farmIds, "farm");
    this.assertScope(user, query.warehouseId, user.warehouseIds, "warehouse");
    this.assertScope(user, query.productionSiteId, user.productionSiteIds, "production site");

    const range = this.resolveRange(query);

    const [summary, charts, alerts] = await Promise.all([
      this.liveSummary(user, query, range),
      this.liveCharts(user, query, range),
      this.alerts(user, query, range)
    ]);

    return { data: { filters: { ...query, startDate: range.start.toISOString(), endDate: range.end.toISOString() }, summary, charts, alerts } };
  }

  // ── My Daily Duties ──────────────────────────────────────────────────────

  async myDuties(user: AuthenticatedUser) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };
    const base = { companyId: user.companyId };

    const hasFarms = user.hasGlobalAccess || user.farmIds.length > 0;
    const hasSites = user.hasGlobalAccess || user.productionSiteIds.length > 0;
    const canSales = user.hasGlobalAccess || user.permissions.includes("sales.manage");
    const canStock = user.hasGlobalAccess || user.permissions.includes("inventory.manage");
    const canSoya  = user.hasGlobalAccess || user.permissions.includes("soya.manage");

    const farmFilter = user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } };
    const siteFilter = user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } };

    // Resolve employee record for attendance duty (email-matched, same pattern as myTasks)
    const selfEmployee = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });

    const [eggCount, feedCount, mortalityCount, dailyCount, prodCount, salesCount, stockCount, soyaCount, attendanceCount, visitCount] = await Promise.all([
      hasFarms
        ? this.prisma.eggProductionRecord.count({ where: { ...base, ...farmFilter, recordDate: dateRange } })
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.feedConsumptionRecord.count({ where: { ...base, ...farmFilter, recordDate: dateRange } })
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.mortalityRecord.count({ where: { ...base, ...farmFilter, recordDate: dateRange } })
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.dailyPoultryRecord.count({ where: { ...base, ...farmFilter, recordDate: dateRange } })
        : Promise.resolve(-1),
      hasSites
        ? this.prisma.feedProductionBatch.count({ where: { ...base, ...siteFilter, createdAt: dateRange } })
        : Promise.resolve(-1),
      canSales
        ? this.prisma.salesOrder.count({ where: { ...base, createdAt: dateRange } })
        : Promise.resolve(-1),
      canStock
        ? this.prisma.stockMovement.count({ where: { ...base, createdAt: dateRange } })
        : Promise.resolve(-1),
      canSoya
        ? this.prisma.soyaBeanIntake.count({ where: { ...base, ...siteFilter, receivedAt: dateRange } })
        : Promise.resolve(-1),
      selfEmployee
        ? this.prisma.attendanceRecord.count({ where: { companyId: user.companyId, employeeId: selfEmployee.id, date: dateRange } })
        : Promise.resolve(-1),
      canSales
        ? this.prisma.prospectVisit.count({ where: { companyId: user.companyId, repId: user.id, visitedAt: dateRange } } as never)
        : Promise.resolve(-1),
    ]);

    type DutyItem = {
      id: string;
      title: string;
      description: string;
      icon: string;
      screen: string;
      slot: "MORNING" | "EVENING" | "ANYTIME";
      count: number;
      doneToday: boolean;
    };

    const duties: DutyItem[] = [];

    if (hasFarms) {
      duties.push(
        { id: "egg-collection",  title: "Egg Collection",        description: "Record today's egg counts by grade",               icon: "🥚", screen: "EggCollection",   slot: "MORNING",  count: eggCount,      doneToday: eggCount > 0 },
        { id: "feed-record",     title: "Feed Record",           description: "Record feed distributed to flocks",                icon: "🌾", screen: "FeedConsumption",  slot: "MORNING",  count: feedCount,     doneToday: feedCount > 0 },
        { id: "mortality",       title: "Mortality Record",      description: "Record bird deaths and culling events",            icon: "📉", screen: "Mortality",         slot: "MORNING",  count: mortalityCount, doneToday: mortalityCount > 0 },
        { id: "daily-summary",   title: "Daily Poultry Summary", description: "End-of-day bird count, mortality, feed and eggs",  icon: "📋", screen: "DailyPoultry",     slot: "EVENING",  count: dailyCount,    doneToday: dailyCount > 0 },
      );
    }

    if (hasSites) {
      duties.push(
        { id: "production",      title: "Production Record",     description: "Log today's feed or soya batch output and quality", icon: "🏭", screen: "ProductionRecord", slot: "ANYTIME",  count: prodCount,     doneToday: prodCount > 0 },
      );
    }

    if (canStock) {
      duties.push(
        { id: "stock-movement",  title: "Stock Movement",        description: "Record deliveries, issues and stock transfers",    icon: "📦", screen: "StockMovement",    slot: "ANYTIME",  count: stockCount,    doneToday: stockCount > 0 },
      );
    }

    if (canSales) {
      duties.push(
        { id: "sales-order",     title: "Sales Order",           description: "Record new customer orders and dispatches",        icon: "🧾", screen: "SalesOrder",       slot: "ANYTIME",  count: salesCount,    doneToday: salesCount > 0 },
      );
    }

    if (canSoya) {
      duties.push(
        { id: "soya-intake",     title: "Soya Bean Intake",      description: "Record incoming soya bean deliveries",             icon: "🫘", screen: "SoyaProcessing",   slot: "MORNING",  count: soyaCount,     doneToday: soyaCount > 0 },
      );
    }

    if (attendanceCount !== -1) {
      duties.push(
        { id: "attendance",      title: "Attendance Check-In",   description: "Log your attendance for today",                    icon: "🗓️", screen: "AttendanceCheckIn", slot: "MORNING", count: attendanceCount, doneToday: attendanceCount > 0 },
      );
    }

    if (canSales && visitCount !== -1) {
      duties.push(
        { id: "prospect-visits", title: "Prospect Visits",       description: "Log customer prospecting visits with location",     icon: "📍", screen: "ProspectVisit",     slot: "ANYTIME", count: visitCount,      doneToday: visitCount > 0 },
      );
    }

    const applicable = duties.filter((d) => d.count !== -1);
    const done = applicable.filter((d) => d.doneToday).length;

    return {
      data: {
        date: todayStart.toISOString().slice(0, 10),
        duties: applicable,
        summary: { total: applicable.length, done, pending: applicable.length - done },
      },
    };
  }

  // ── Farm Operations Today (manager overview) ─────────────────────────────

  async farmOperationsToday(user: AuthenticatedUser) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };
    const base = { companyId: user.companyId };
    const farmFilter = user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } };
    const siteFilter = user.hasGlobalAccess ? {} : { productionSiteId: { in: user.productionSiteIds } };

    const [totalFarms, totalSites, eggFarms, feedFarms, mortalityFarms, dailyFarms, prodSites] = await Promise.all([
      user.hasGlobalAccess
        ? this.prisma.farm.count({ where: { companyId: user.companyId, deletedAt: null } })
        : Promise.resolve(user.farmIds.length),
      user.hasGlobalAccess
        ? this.prisma.productionSite.count({ where: { companyId: user.companyId, deletedAt: null } })
        : Promise.resolve(user.productionSiteIds.length),
      this.prisma.eggProductionRecord.findMany({ where: { ...base, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.feedConsumptionRecord.findMany({ where: { ...base, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.mortalityRecord.findMany({ where: { ...base, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.dailyPoultryRecord.findMany({ where: { ...base, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.feedProductionBatch.findMany({ where: { ...base, ...siteFilter, createdAt: dateRange }, distinct: ["productionSiteId"], select: { productionSiteId: true } }),
    ]);

    type OperationRow = {
      id: string;
      title: string;
      icon: string;
      slot: "MORNING" | "EVENING" | "ANYTIME";
      kind: "farm" | "site";
      total: number;
      submitted: number;
      percentage: number;
      complete: boolean;
    };

    function row(id: string, title: string, icon: string, slot: "MORNING" | "EVENING" | "ANYTIME", kind: "farm" | "site", total: number, submitted: number): OperationRow {
      const percentage = total > 0 ? Math.round((submitted / total) * 100) : 0;
      return { id, title, icon, slot, kind, total, submitted, percentage, complete: submitted >= total && total > 0 };
    }

    const duties: OperationRow[] = [
      ...(totalFarms > 0 ? [
        row("egg-collection",  "Egg Collection",        "🥚", "MORNING", "farm", totalFarms, eggFarms.length),
        row("feed-record",     "Feed Record",           "🌾", "MORNING", "farm", totalFarms, feedFarms.length),
        row("mortality",       "Mortality Record",      "📉", "MORNING", "farm", totalFarms, mortalityFarms.length),
        row("daily-summary",   "Daily Poultry Summary", "📋", "EVENING", "farm", totalFarms, dailyFarms.length),
      ] : []),
      ...(totalSites > 0 ? [
        row("production",      "Production Record",     "🏭", "ANYTIME", "site", totalSites, prodSites.length),
      ] : []),
    ];

    const complete = duties.filter((d) => d.complete).length;
    const notStarted = duties.filter((d) => d.submitted === 0).length;
    const partial = duties.length - complete - notStarted;

    return {
      data: {
        date: todayStart.toISOString().slice(0, 10),
        duties,
        summary: { total: duties.length, complete, partial, notStarted },
      },
    };
  }

  // ── Live query helpers (executive dashboard) ────────────────────────────

  private async liveSummary(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }): Promise<Card[]> {
    const cid = user.companyId;
    const farmF = this.liveFarmFilter(user, query);
    const siteF = this.liveSiteFilter(user, query);
    const branchF = this.liveBranchFilter(user, query);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(todayStart);
    monthStart.setDate(1);

    const [
      totalBirds, activeFlockBatches,
      eggAgg, mortalityAgg, feedAgg,
      feedProdAgg, soyaBeanAgg, soyaOilAgg, soyaCakeAgg,
      salesAgg, debtAgg,
      lowStockAlerts, pendingProdOrders, pendingPurchaseApprovals,
      maintenanceAlerts, aiAlerts
    ] = await Promise.all([
      this.prisma.flockBatch.aggregate({ where: { companyId: cid, status: "ACTIVE", deletedAt: null, ...farmF }, _sum: { openingBirdCount: true } })
        .then(r => Number(r._sum.openingBirdCount ?? 0)).catch(() => 0),

      this.prisma.flockBatch.count({ where: { companyId: cid, status: "ACTIVE", deletedAt: null, ...farmF } })
        .catch(() => 0),

      this.prisma.eggProductionRecord.aggregate({
        where: { companyId: cid, ...farmF, recordDate: { gte: todayStart, lt: todayEnd } },
        _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }).then(r => {
        const s = r._sum;
        return [s.goodEggs, s.crackedEggs, s.dirtyEggs, s.brokenEggs, s.rejectedEggs].reduce((acc: number, v) => acc + Number(v ?? 0), 0);
      }).catch(() => 0),

      this.prisma.mortalityRecord.aggregate({
        where: { companyId: cid, ...farmF, recordDate: { gte: todayStart, lt: todayEnd } },
        _sum: { birdCount: true }
      }).then(r => Number(r._sum.birdCount ?? 0)).catch(() => 0),

      this.prisma.feedConsumptionRecord.aggregate({
        where: { companyId: cid, ...farmF, recordDate: { gte: todayStart, lt: todayEnd } },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0)).catch(() => 0),

      this.prisma.feedProductionBatch.aggregate({
        where: { companyId: cid, ...siteF, createdAt: { gte: weekStart } },
        _sum: { producedQuantityKg: true }
      }).then(r => Number(r._sum.producedQuantityKg ?? 0)).catch(() => 0),

      this.prisma.soyaBeanIntake.aggregate({
        where: { companyId: cid, ...siteF, receivedAt: { gte: weekStart } },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0)).catch(() => 0),

      this.prisma.soyaOilOutput.aggregate({
        where: { deletedAt: null, createdAt: { gte: range.start, lte: range.end } },
        _sum: { quantityLitres: true }
      }).then(r => Number(r._sum.quantityLitres ?? 0)).catch(() => 0),

      this.prisma.soyaCakeOutput.aggregate({
        where: { deletedAt: null, createdAt: { gte: range.start, lte: range.end } },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0)).catch(() => 0),

      this.prisma.salesOrder.aggregate({
        where: { companyId: cid, ...branchF, status: { not: "CANCELLED" }, orderDate: { gte: monthStart } },
        _sum: { totalAmount: true }
      }).then(r => Number(r._sum.totalAmount ?? 0)).catch(() => 0),

      this.prisma.salesOrder.aggregate({
        where: { companyId: cid, ...branchF, status: { not: "CANCELLED" } },
        _sum: { balanceDue: true }
      }).then(r => Number(r._sum.balanceDue ?? 0)).catch(() => 0),

      this.prisma.stockExpiryAlert.count({ where: { companyId: cid, deletedAt: null, daysToExpiry: { lte: 30 } } })
        .catch(() => 0),

      this.prisma.feedProductionOrder.count({ where: { companyId: cid, status: { in: ["DRAFT", "APPROVED"] as any[] } } })
        .catch(() => 0),

      this.prisma.purchaseOrder.count({ where: { companyId: cid, status: "PENDING_APPROVAL" as any, deletedAt: null } })
        .catch(() => 0),

      this.prisma.maintenanceRecord.count({ where: { companyId: cid, status: { in: ["OPEN", "OVERDUE", "PENDING"] as any[] } } } as any)
        .catch(() => 0),

      this.prisma.dashboardAlert.count({ where: { companyId: cid, status: "OPEN", deletedAt: null } })
        .catch(() => 0),
    ]);

    const values: Record<string, number> = {
      totalBirds,
      activeFlockBatches,
      eggProductionToday: eggAgg,
      mortalityToday: mortalityAgg,
      feedConsumedToday: feedAgg,
      feedProducedThisWeek: feedProdAgg,
      soyaBeansProcessedThisWeek: soyaBeanAgg,
      soyaOilProduced: soyaOilAgg,
      soyaCakeProduced: soyaCakeAgg,
      currentInventoryValue: 0,
      salesThisMonth: salesAgg,
      outstandingCustomerDebt: debtAgg,
      supplierDebt: 0,
      lowStockAlerts,
      pendingProductionOrders: pendingProdOrders,
      pendingPurchaseApprovals,
      machineMaintenanceAlerts: maintenanceAlerts,
      aiAlerts,
    };

    return CARD_CONFIG.map((card) => ({
      key: card.key,
      label: card.label,
      value: values[card.key] ?? 0,
      unit: card.unit,
      tone: card.tone,
    }));
  }

  private async liveCharts(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }) {
    const cid = user.companyId;
    const farmF = this.liveFarmFilter(user, query);
    const siteF = this.liveSiteFilter(user, query);
    const branchF = this.liveBranchFilter(user, query);
    const dateRange = { gte: range.start, lte: range.end };

    const [eggRows, mortalityRows, feedProdRows, soyaBeanRows, soyaOilRows, soyaCakeRows, salesRows, eggFarmRows, salesBranchRows] = await Promise.all([
      this.prisma.eggProductionRecord.findMany({
        where: { companyId: cid, ...farmF, recordDate: dateRange },
        select: { recordDate: true, farmId: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }).catch(() => [] as any[]),

      this.prisma.mortalityRecord.findMany({
        where: { companyId: cid, ...farmF, recordDate: dateRange },
        select: { recordDate: true, birdCount: true }
      }).catch(() => [] as any[]),

      this.prisma.feedProductionBatch.findMany({
        where: { companyId: cid, ...siteF, createdAt: dateRange },
        select: { createdAt: true, producedQuantityKg: true }
      }).catch(() => [] as any[]),

      this.prisma.soyaBeanIntake.findMany({
        where: { companyId: cid, ...siteF, receivedAt: dateRange },
        select: { receivedAt: true, quantityKg: true }
      }).catch(() => [] as any[]),

      this.prisma.soyaOilOutput.findMany({
        where: { deletedAt: null, createdAt: dateRange },
        select: { createdAt: true, quantityLitres: true }
      }).catch(() => [] as any[]),

      this.prisma.soyaCakeOutput.findMany({
        where: { deletedAt: null, createdAt: dateRange },
        select: { createdAt: true, quantityKg: true }
      }).catch(() => [] as any[]),

      this.prisma.salesOrder.findMany({
        where: { companyId: cid, ...branchF, status: { not: "CANCELLED" }, orderDate: dateRange },
        select: { orderDate: true, branchId: true, totalAmount: true }
      }).catch(() => [] as any[]),

      this.prisma.eggProductionRecord.findMany({
        where: { companyId: cid, ...farmF, recordDate: dateRange },
        select: { farmId: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }).catch(() => [] as any[]),

      this.prisma.salesOrder.findMany({
        where: { companyId: cid, ...branchF, status: { not: "CANCELLED" }, orderDate: dateRange },
        select: { branchId: true, totalAmount: true }
      }).catch(() => [] as any[]),
    ]);

    const sumToMap = (rows: any[], dateKey: string, valueKey: string) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = this.formatDate(new Date(r[dateKey]));
        m.set(k, (m.get(k) ?? 0) + Number(r[valueKey] ?? 0));
      }
      return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
    };

    const eggByDate = new Map<string, number>();
    for (const r of eggRows) {
      const k = this.formatDate(new Date(r.recordDate));
      const total: number = [r.goodEggs, r.crackedEggs, r.dirtyEggs, r.brokenEggs, r.rejectedEggs].reduce((a: number, v: any) => a + Number(v ?? 0), 0);
      eggByDate.set(k, (eggByDate.get(k) ?? 0) + total);
    }

    const soyaBeanByDate = new Map<string, number>();
    for (const r of soyaBeanRows) { const k = this.formatDate(new Date(r.receivedAt)); soyaBeanByDate.set(k, (soyaBeanByDate.get(k) ?? 0) + Number(r.quantityKg ?? 0)); }
    const soyaOilByDate = new Map<string, number>();
    for (const r of soyaOilRows) { const k = this.formatDate(new Date(r.createdAt)); soyaOilByDate.set(k, (soyaOilByDate.get(k) ?? 0) + Number(r.quantityLitres ?? 0)); }
    const soyaCakeByDate = new Map<string, number>();
    for (const r of soyaCakeRows) { const k = this.formatDate(new Date(r.createdAt)); soyaCakeByDate.set(k, (soyaCakeByDate.get(k) ?? 0) + Number(r.quantityKg ?? 0)); }

    const mapToSeries = (m: Map<string, number>, name: string): Series =>
      ({ name, data: Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)) });

    const eggByFarmId = new Map<string, number>();
    for (const r of eggFarmRows) {
      const total: number = [r.goodEggs, r.crackedEggs, r.dirtyEggs, r.brokenEggs, r.rejectedEggs].reduce((a: number, v: any) => a + Number(v ?? 0), 0);
      eggByFarmId.set(r.farmId as string, (eggByFarmId.get(r.farmId as string) ?? 0) + total);
    }
    const farmIds = [...eggByFarmId.keys()];
    const farmNames = farmIds.length > 0
      ? await this.prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true } }).catch(() => [] as any[])
      : [];
    const farmNameMap = new Map(farmNames.map((f: any) => [f.id, f.name]));
    const farmPerfData = [...eggByFarmId.entries()].map(([id, value]) => ({ label: farmNameMap.get(id) ?? id, value }));

    const salesByBranchId = new Map<string, number>();
    for (const r of salesBranchRows) {
      const id = (r.branchId as string) ?? "unknown";
      salesByBranchId.set(id, (salesByBranchId.get(id) ?? 0) + Number(r.totalAmount ?? 0));
    }
    const branchIds = [...salesByBranchId.keys()].filter(id => id !== "unknown");
    const branchNames = branchIds.length > 0
      ? await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }).catch(() => [] as any[])
      : [];
    const branchNameMap = new Map(branchNames.map((b: any) => [b.id, b.name]));
    const branchPerfData = [...salesByBranchId.entries()].map(([id, value]) => ({ label: branchNameMap.get(id) ?? id, value }));

    return {
      eggProductionTrend: [{ name: "Eggs", data: Array.from(eggByDate, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)) }] as Series[],
      mortalityTrend: [{ name: "Mortality", data: sumToMap(mortalityRows, "recordDate", "birdCount") }] as Series[],
      feedProductionTrend: [{ name: "Feed produced", data: sumToMap(feedProdRows, "createdAt", "producedQuantityKg") }] as Series[],
      soyaProductionTrend: [mapToSeries(soyaBeanByDate, "Beans processed"), mapToSeries(soyaOilByDate, "Oil produced"), mapToSeries(soyaCakeByDate, "Cake produced")] as Series[],
      salesTrend: [{ name: "Sales", data: sumToMap(salesRows, "orderDate", "totalAmount") }] as Series[],
      inventoryValueByCategory: [{ name: "current_inventory_value", data: [] }] as Series[],
      profitabilityByProduct: [{ name: "gross_profit", data: [] }] as Series[],
      farmPerformanceComparison: [{ name: "farm_performance_index", data: farmPerfData }] as Series[],
      branchPerformanceComparison: [{ name: "branch_performance_index", data: branchPerfData }] as Series[],
    };
  }

  private liveFarmFilter(user: AuthenticatedUser, query: DashboardQueryDto) {
    if (query.farmId) return { farmId: query.farmId };
    if (!user.hasGlobalAccess && user.farmIds.length > 0) return { farmId: { in: user.farmIds } };
    return {};
  }

  private liveSiteFilter(user: AuthenticatedUser, query: DashboardQueryDto) {
    if (query.productionSiteId) return { productionSiteId: query.productionSiteId };
    if (!user.hasGlobalAccess && user.productionSiteIds.length > 0) return { productionSiteId: { in: user.productionSiteIds } };
    return {};
  }

  private liveBranchFilter(user: AuthenticatedUser, query: DashboardQueryDto) {
    if (query.branchId) return { branchId: query.branchId };
    if (!user.hasGlobalAccess && user.branchIds.length > 0) return { branchId: { in: user.branchIds } };
    return {};
  }

  // ── Private helpers ───────────────────────────────────────────────────────

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
