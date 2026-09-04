import { ForbiddenException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { BusinessUnit, DashboardMetricKey, Prisma } from "@prisma/client";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { endOfDayAccra, startOfDayAccra, startOfMonthAccra, startOfTodayAccra } from "../../common/utils/timezone";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";
import { createLimiter } from "../../common/concurrency-limit";

type Card = {
  key: string;
  label: string;
  value: number;
  unit?: string;
  tone: "neutral" | "good" | "warning" | "critical";
  delta: number | null;
};

type Series = {
  name: string;
  data: { label: string; value: number }[];
};

// Keys representing point-in-time state — no meaningful period delta
const POINT_IN_TIME_KEYS = new Set([
  "totalBirds", "activeFlockBatches", "currentInventoryValue",
  "outstandingCustomerDebt", "supplierDebt",
  "lowStockAlerts", "pendingProductionOrders", "pendingPurchaseApprovals",
  "machineMaintenanceAlerts", "aiAlerts"
]);

// (2026-09-04) These three cards are labeled "today" but were computed over
// whatever trend range the date-window filter happened to be set to — which
// defaults to the last 30 days. So "Mortality today" silently showed 30 days
// of deaths, "day" and "range" got conflated, and there was no way to see a
// single specific day (yesterday, or any earlier day) without also collapsing
// every trend chart on the page to that same day. These keys are now always
// computed against the separate `day` query param (default: today) —
// independent of startDate/endDate, which still drive the trend charts and
// every other rollup KPI on this page.
const DAILY_SNAPSHOT_KEYS = new Set(["eggProductionToday", "mortalityToday", "feedConsumedToday"]);

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
  private readonly logger = new Logger(DashboardService.name);

  // High (DB stability audit, 2026-08-16): computeMetricValues() alone fires
  // 17 concurrent queries, and executive() calls it twice (current + prior
  // period) alongside liveCharts()/alerts() in the same Promise.all — around
  // 46 queries in flight from a single page load, against a 10-connection
  // pool. Two users loading the dashboard together could queue past the
  // pool's timeout and starve unrelated requests too. Shared across all
  // requests (not per-call) so it throttles concurrent *users*, not just
  // one request's internal fan-out.
  private readonly dashboardQueryLimit = createLimiter(6);

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
    const monthStart = startOfMonthAccra(); // (M20) was server-local midnight

    // Previously filtered only by companyId — a user restricted to a single
    // farm/branch saw company-wide revenue, order counts, and bird totals
    // through this endpoint, unlike executive() which correctly scopes.
    // gated only on the base PLATFORM_READ permission, not SALES_READ/
    // FINANCE_READ, this also meant financial totals leaked to anyone with
    // basic dashboard access.
    const branchF = this.liveBranchFilter(user, {} as DashboardQueryDto);
    const warehouseF = this.liveWarehouseFilter(user, {} as DashboardQueryDto);
    const farmF = this.liveFarmFilter(user, {} as DashboardQueryDto);
    const siteF = this.liveSiteFilter(user, {} as DashboardQueryDto);

    const [salesAgg, openOrders, totalBirds, pendingAlerts] = await Promise.all([
      this.prisma.salesOrder.aggregate({ where: { companyId, deletedAt: null, status: { not: "CANCELLED" }, createdAt: { gte: monthStart }, ...branchF, ...warehouseF }, _sum: { totalAmount: true } }),
      this.prisma.salesOrder.count({ where: { companyId, deletedAt: null, status: { in: ["DRAFT", "PENDING_STOCK_APPROVAL", "APPROVED"] }, ...branchF, ...warehouseF } }),
      this.currentLiveBirdsTotal(companyId, { ...branchF, ...farmF }),
      this.prisma.stockExpiryAlert.count({ where: { companyId, deletedAt: null, daysToExpiry: { lte: 30 }, ...branchF, ...warehouseF, ...siteF } }),
    ]);

    // C4: this endpoint is gated only by the base PLATFORM_READ permission
    // that every role holds (it's the app's home-screen dashboard, not a
    // domain-specific one) — location scoping alone wasn't enough, since a
    // user with zero interest in financial figures still had revenue/order
    // totals returned. Fields are now gated by whether the caller actually
    // holds a permission for that domain. Ungated fields are omitted
    // (undefined, not null) so they drop out of the JSON response entirely —
    // the mobile dashboard (features/dashboard/DashboardScreen.tsx) already
    // checks `!== undefined` per field to decide whether to render a card,
    // so this hides the card cleanly with no frontend change needed.
    const canSeeSales = user.hasGlobalAccess || user.permissions.includes(PERMISSIONS.SALES_READ) || user.permissions.includes(PERMISSIONS.FINANCE_READ);
    const canSeePoultry = user.hasGlobalAccess || user.permissions.includes(PERMISSIONS.POULTRY_READ);

    return {
      data: {
        totalRevenue: canSeeSales ? Number(salesAgg._sum.totalAmount ?? 0) : undefined,
        openOrders: canSeeSales ? openOrders : undefined,
        totalBirds: canSeePoultry ? totalBirds : undefined,
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
    const prior = this.priorRange(range);
    const day = query.day ? startOfDayAccra(new Date(query.day)) : startOfTodayAccra();
    const dayBefore = new Date(day);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

    // H23: computeMetricValues()/liveCharts()/alerts() used to swallow
    // every failure into a fake 0 or empty default internally, so a single
    // transient failure (DB blip, deadlock) silently corrupted this
    // period-over-period comparison instead of failing the request — a
    // fake 0 on just the current period rendered as "down 100%" to
    // management, or a fake 0 on just the prior period masked a real drop
    // as flat. All the internal per-query catches were removed; this outer
    // try/catch is now the single place a failure surfaces, as a real
    // error instead of a wrong number, matching HRService.dashboard's
    // identical fix for the same pattern.
    try {
      const [currentValues, priorValues, charts, alerts, daySnap, dayBeforeSnap] = await Promise.all([
        this.computeMetricValues(user, query, range),
        this.computeMetricValues(user, query, prior),
        this.liveCharts(user, query, range),
        this.alerts(user, query, range),
        this.dailySnapshot(user, query, day),
        this.dailySnapshot(user, query, dayBefore)
      ]);

      const summary: Card[] = CARD_CONFIG.map((card) => {
        const daily = DAILY_SNAPSHOT_KEYS.has(card.key);
        const value = daily ? daySnap[card.key] ?? 0 : currentValues[card.key] ?? 0;
        const priorValue = daily ? dayBeforeSnap[card.key] ?? 0 : priorValues[card.key] ?? 0;
        const delta: number | null = POINT_IN_TIME_KEYS.has(card.key)
          ? null
          : priorValue === 0
            ? null
            : Math.round(((value - priorValue) / priorValue) * 1000) / 10;
        return { key: card.key, label: card.label, value, unit: card.unit, tone: card.tone, delta };
      });

      return {
        data: {
          filters: {
            ...query,
            startDate: range.start.toISOString(),
            endDate: range.end.toISOString(),
            day: day.toISOString().slice(0, 10)
          },
          summary,
          charts,
          alerts
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error(`executive dashboard failed to load for company ${user.companyId}: ${message}`);
      throw new InternalServerErrorException("Executive dashboard failed to load");
    }
  }

  // ── My Daily Duties ──────────────────────────────────────────────────────

  async myDuties(user: AuthenticatedUser) {
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };
    const base = { companyId: user.companyId };

    // Previously an empty farmIds/productionSiteIds array (a non-hasGlobalAccess
    // user simply not assigned to any specific farm) meant "show nothing" here
    // — the opposite of liveFarmFilter/liveSiteFilter's convention used
    // elsewhere in this same file, where an empty array means "unrestricted".
    // Standardized on that same convention for consistency: these queries
    // always run now, scoped to the user's farms/sites when they have any,
    // company-wide otherwise.
    const hasFarms = true;
    const hasSites = true;
    const canSales = user.hasGlobalAccess || user.permissions.includes("sales.manage");
    const canStock = user.hasGlobalAccess || user.permissions.includes("inventory.manage");
    const canSoya  = user.hasGlobalAccess || user.permissions.includes("soya.manage");

    const farmFilter = user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { farmId: { in: user.farmIds } };
    const siteFilter = user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { productionSiteId: { in: user.productionSiteIds } };

    // Resolve employee record for attendance duty (email-matched, same pattern as myTasks).
    // Medium (DB stability audit, 2026-08-16): this used to end in
    // .catch(() => null) — the identical silent-zero anti-pattern H23
    // explicitly removed everywhere else in this file, just missed here. A
    // real DB failure rendered indistinguishably from "no employee linked,"
    // silently hiding the attendance duty section instead of surfacing an
    // error. Left uncaught now so a genuine failure reaches Nest's global
    // exception filter as a real 500, same as every other query in this method.
    const selfEmployee = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });

    // L-BUG (2026-08-13): none of these "done today" counts filtered
    // deletedAt — a mortality/feed/egg/etc. entry that was deleted or
    // corrected-away still counted as "today's duty complete", and a
    // deleted stock movement still counted toward stockCount. Discovered
    // live: a company that soft-deleted its test data via the app's own
    // delete flow (or direct SQL matching it) still saw the duty checklist
    // and executive KPIs reporting activity that no longer exists.
    const [eggCount, feedCount, mortalityCount, dailyCount, prodCount, salesCount, stockCount, soyaCount, attendanceCount, visitCount] = await Promise.all([
      hasFarms
        ? this.prisma.eggProductionRecord.count({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.feedConsumptionRecord.count({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.mortalityRecord.count({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      hasFarms
        ? this.prisma.dailyPoultryRecord.count({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      hasSites
        ? this.prisma.feedProductionBatch.count({ where: { ...base, deletedAt: null, ...siteFilter, createdAt: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      canSales
        ? this.prisma.salesOrder.count({ where: { ...base, deletedAt: null, createdAt: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      canStock
        ? this.prisma.stockMovement.count({ where: { ...base, deletedAt: null, createdAt: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      canSoya
        ? this.prisma.soyaBeanIntake.count({ where: { ...base, deletedAt: null, ...siteFilter, receivedAt: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      selfEmployee
        ? this.prisma.attendanceRecord.count({ where: { companyId: user.companyId, employeeId: selfEmployee.id, date: dateRange } }).catch(() => -1)
        : Promise.resolve(-1),
      canSales
        ? (this.prisma.prospectVisit as any).count({ where: { companyId: user.companyId, repId: user.id, visitedAt: dateRange } }).catch(() => -1)
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
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };
    const base = { companyId: user.companyId };
    // Same convention fix as myDuties() above — an empty farmIds/
    // productionSiteIds array means unrestricted, not "match nothing" via
    // the '__' sentinel this used to fall back to.
    const farmFilter = user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { farmId: { in: user.farmIds } };
    const siteFilter = user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { productionSiteId: { in: user.productionSiteIds } };

    const [totalFarms, totalSites, eggFarms, feedFarms, mortalityFarms, dailyFarms, prodSites] = await Promise.all([
      user.hasGlobalAccess || user.farmIds.length === 0
        ? this.prisma.farm.count({ where: { companyId: user.companyId, deletedAt: null } })
        : Promise.resolve(user.farmIds.length),
      user.hasGlobalAccess || user.productionSiteIds.length === 0
        ? this.prisma.productionSite.count({ where: { companyId: user.companyId, deletedAt: null } })
        : Promise.resolve(user.productionSiteIds.length),
      // L-BUG (2026-08-13): same missing-deletedAt gap as myDuties above —
      // a deleted/corrected record still counted this farm/site as having
      // "submitted" today's entry.
      this.prisma.eggProductionRecord.findMany({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.feedConsumptionRecord.findMany({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.mortalityRecord.findMany({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.dailyPoultryRecord.findMany({ where: { ...base, deletedAt: null, ...farmFilter, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.feedProductionBatch.findMany({ where: { ...base, deletedAt: null, ...siteFilter, createdAt: dateRange }, distinct: ["productionSiteId"], select: { productionSiteId: true } }),
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

  private async computeMetricValues(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }): Promise<Record<string, number>> {
    const cid = user.companyId;
    const farmF = this.liveFarmFilter(user, query);
    const siteF = this.liveSiteFilter(user, query);
    const branchF = this.liveBranchFilter(user, query);
    const warehouseF = this.liveWarehouseFilter(user, query);
    const dateRange = { gte: range.start, lte: range.end };

    const [
      totalBirds, activeFlockBatches,
      eggAgg, mortalityAgg, feedAgg,
      feedProdAgg, soyaBeanAgg, soyaOilAgg, soyaCakeAgg,
      salesAgg, debtAgg, supplierDebtAgg,
      lowStockAlerts, pendingProdOrders, pendingPurchaseApprovals,
      maintenanceAlerts, aiAlerts, invValue
    ] = await Promise.all([
      // H23: every query below used to end in .catch(() => 0) — a single
      // transient failure (DB blip, deadlock) on just one query silently
      // became a fake 0 instead of failing the request. Because executive()
      // computes this same method for the current period and the prior
      // period independently and diffs them for a percentage change, a
      // fake 0 on just the current period rendered as "down 100%" to
      // management, or a fake 0 on just the prior period masked a real
      // drop as flat — wrong in either direction, silently. Letting these
      // reject now and propagate up through executive()'s own try/catch
      // (see below) turns a wrong number into a visible 500, which is the
      // correct failure mode for a financial/operational KPI.
      //
      // High (DB stability audit, 2026-08-16): each query below is now
      // gated through dashboardQueryLimit — see the field comment for why.
      this.dashboardQueryLimit.run(() => this.currentLiveBirdsTotal(cid, farmF)),

      this.dashboardQueryLimit.run(() => this.prisma.flockBatch.count({ where: { companyId: cid, status: "ACTIVE", deletedAt: null, ...farmF } })),

      // L-BUG (2026-08-13): none of these five aggregates filtered
      // deletedAt — a soft-deleted egg/mortality/feed/soya/production
      // record still counted toward the executive dashboard's "today"
      // figures indefinitely. Live symptom: deleting a test flock's
      // mortality and feed records left the KPI tiles still showing the
      // old numbers with no live birds behind them.
      this.dashboardQueryLimit.run(() => this.prisma.eggProductionRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }).then(r => {
        const s = r._sum;
        return [s.goodEggs, s.crackedEggs, s.dirtyEggs, s.brokenEggs, s.rejectedEggs].reduce((acc: number, v) => acc + Number(v ?? 0), 0);
      })),

      this.dashboardQueryLimit.run(() => this.prisma.mortalityRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { birdCount: true }
      }).then(r => Number(r._sum.birdCount ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.feedConsumptionRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.feedProductionBatch.aggregate({
        where: { companyId: cid, deletedAt: null, ...siteF, createdAt: dateRange },
        _sum: { producedQuantityKg: true }
      }).then(r => Number(r._sum.producedQuantityKg ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.soyaBeanIntake.aggregate({
        where: { companyId: cid, deletedAt: null, ...siteF, receivedAt: dateRange },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.soyaOilOutput.aggregate({
        where: { companyId: cid, ...siteF, deletedAt: null, createdAt: dateRange },
        _sum: { quantityLitres: true }
      }).then(r => Number(r._sum.quantityLitres ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.soyaCakeOutput.aggregate({
        where: { companyId: cid, ...siteF, deletedAt: null, createdAt: dateRange },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.salesOrder.aggregate({
        where: { companyId: cid, deletedAt: null, ...branchF, status: { not: "CANCELLED" }, orderDate: dateRange },
        _sum: { totalAmount: true }
      }).then(r => Number(r._sum.totalAmount ?? 0))),

      this.dashboardQueryLimit.run(() => this.prisma.salesOrder.aggregate({
        where: { companyId: cid, deletedAt: null, ...branchF, status: { not: "CANCELLED" } },
        _sum: { balanceDue: true }
      }).then(r => Number(r._sum.balanceDue ?? 0))),

      // H22: supplierDebt was hardcoded to 0 while this card's customer-side
      // equivalent (debtAgg, immediately above) was already correctly
      // aggregated — every viewer saw "Supplier debt: GHS 0" regardless of
      // what was actually owed. SupplierInvoice has no branch/farm/
      // warehouse/site columns in the schema (unlike SalesOrder), so
      // there's no location filter to apply here — not a bug, matches the
      // purchaseOrder.count query below for the same reason.
      this.dashboardQueryLimit.run(() => this.prisma.supplierInvoice.aggregate({
        where: { companyId: cid, deletedAt: null },
        _sum: { balanceDue: true }
      }).then(r => Number(r._sum.balanceDue ?? 0))),

      // C4: these four queries previously carried no location filter at all,
      // unlike every sibling query in this same Promise.all — a
      // location-restricted user (branch/farm/warehouse/site) saw
      // company-wide inventory valuation and alert counts through the
      // executive dashboard regardless of their actual assignment.
      this.dashboardQueryLimit.run(() => this.prisma.stockExpiryAlert.count({ where: { companyId: cid, deletedAt: null, daysToExpiry: { lte: 30 }, ...branchF, ...warehouseF, ...siteF } })),

      // L-BUG (2026-08-13): missing deletedAt here too — a deleted feed
      // production order still counted toward "pending production orders".
      this.dashboardQueryLimit.run(() => this.prisma.feedProductionOrder.count({ where: { companyId: cid, deletedAt: null, status: { in: ["DRAFT", "APPROVED"] as any[] }, ...branchF, ...siteF } })),

      // PurchaseOrder has no branch/farm/warehouse/site columns in the
      // schema — nothing to scope by, not a bug (mirrors the equivalent
      // query already verified clean in ai-data.service.ts).
      this.dashboardQueryLimit.run(() => this.prisma.purchaseOrder.count({ where: { companyId: cid, status: "PENDING_APPROVAL" as any, deletedAt: null } })),

      // MaintenanceWorkflowStatus has no OPEN or PENDING value (only
      // SCHEDULED/ASSIGNED/IN_PROGRESS/COMPLETED/CANCELLED/OVERDUE) — the
      // `as any`/`as any[]` casts here suppressed the type error that would
      // otherwise have caught this, and Prisma's own client-side validation
      // rejected the query outright at runtime (500 on every executive
      // dashboard load, live 2026-08-11). notIn the terminal statuses is
      // both correct now and immune to a future new non-terminal status
      // needing this list updated again, matching the notIn/not pattern
      // already used for salesOrder/etc. elsewhere in this same method.
      // L-BUG (2026-08-13): missing deletedAt here too — a deleted
      // maintenance record still counted toward "machine maintenance alerts".
      this.dashboardQueryLimit.run(() => this.prisma.maintenanceRecord.count({ where: { companyId: cid, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, ...branchF, ...farmF, ...warehouseF, ...siteF } })),

      this.dashboardQueryLimit.run(() => this.prisma.aiAlert.count({ where: { companyId: cid, status: "UNREAD" } })),

      this.dashboardQueryLimit.run(() => this.prisma.stockBatch.findMany({
        where: { companyId: cid, deletedAt: null, status: "AVAILABLE" as any, quantityRemaining: { gt: 0 }, unitCost: { not: null }, ...branchF, ...farmF, ...warehouseF, ...siteF },
        select: { quantityRemaining: true, unitCost: true }
      }).then(rows => rows.reduce((sum, b) => sum + Number(b.quantityRemaining) * Number(b.unitCost), 0))),
    ]);

    return {
      totalBirds,
      activeFlockBatches,
      eggProductionToday: eggAgg,
      mortalityToday: mortalityAgg,
      feedConsumedToday: feedAgg,
      feedProducedThisWeek: feedProdAgg,
      soyaBeansProcessedThisWeek: soyaBeanAgg,
      soyaOilProduced: soyaOilAgg,
      soyaCakeProduced: soyaCakeAgg,
      currentInventoryValue: invValue,
      salesThisMonth: salesAgg,
      outstandingCustomerDebt: debtAgg,
      supplierDebt: supplierDebtAgg,
      lowStockAlerts,
      pendingProductionOrders: pendingProdOrders,
      pendingPurchaseApprovals,
      machineMaintenanceAlerts: maintenanceAlerts,
      aiAlerts,
    };
  }

  // Backs the three DAILY_SNAPSHOT_KEYS cards — a real single calendar day,
  // independent of the trend-range filter (see the constant's own comment).
  // Deliberately three targeted queries, not a full computeMetricValues()
  // call: this runs twice per page load (today + the day before) alongside
  // the two range-based computeMetricValues() calls already in executive(),
  // and duplicating all 17 of that method's queries here would double the
  // page's total query count for 3 numbers we actually need.
  private async dailySnapshot(user: AuthenticatedUser, query: DashboardQueryDto, day: Date): Promise<Record<string, number>> {
    const cid = user.companyId;
    const farmF = this.liveFarmFilter(user, query);
    const dateRange = { gte: day, lte: endOfDayAccra(day) };

    const [eggAgg, mortalityAgg, feedAgg] = await Promise.all([
      this.dashboardQueryLimit.run(() => this.prisma.eggProductionRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }).then(r => {
        const s = r._sum;
        return [s.goodEggs, s.crackedEggs, s.dirtyEggs, s.brokenEggs, s.rejectedEggs].reduce((acc: number, v) => acc + Number(v ?? 0), 0);
      })),
      this.dashboardQueryLimit.run(() => this.prisma.mortalityRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { birdCount: true }
      }).then(r => Number(r._sum.birdCount ?? 0))),
      this.dashboardQueryLimit.run(() => this.prisma.feedConsumptionRecord.aggregate({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        _sum: { quantityKg: true }
      }).then(r => Number(r._sum.quantityKg ?? 0))),
    ]);

    return { eggProductionToday: eggAgg, mortalityToday: mortalityAgg, feedConsumedToday: feedAgg };
  }

  private async liveCharts(user: AuthenticatedUser, query: DashboardQueryDto, range: { start: Date; end: Date }) {
    const cid = user.companyId;
    const farmF = this.liveFarmFilter(user, query);
    const siteF = this.liveSiteFilter(user, query);
    const branchF = this.liveBranchFilter(user, query);
    const dateRange = { gte: range.start, lte: range.end };

    // H23: each of these used to end in .catch(() => [] as any[]) — a
    // failed query silently rendered as an empty chart (indistinguishable
    // from "genuinely no data this period") instead of surfacing the
    // failure. Left to reject now; the outer .catch(() => emptyCharts) at
    // this method's only call site (executive(), below) was also removed
    // for the same reason — see executive()'s own try/catch.
    // L-BUG (2026-08-13): the same missing-deletedAt gap as
    // computeMetricValues above — deleted egg/mortality/feed/soya records
    // still plotted into these trend charts.
    const [eggRows, mortalityRows, feedProdRows, soyaBeanRows, soyaOilRows, soyaCakeRows, salesRows, eggFarmRows, salesBranchRows] = await Promise.all([
      this.prisma.eggProductionRecord.findMany({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        select: { recordDate: true, farmId: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }),

      this.prisma.mortalityRecord.findMany({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        select: { recordDate: true, birdCount: true }
      }),

      this.prisma.feedProductionBatch.findMany({
        where: { companyId: cid, deletedAt: null, ...siteF, createdAt: dateRange },
        select: { createdAt: true, producedQuantityKg: true }
      }),

      this.prisma.soyaBeanIntake.findMany({
        where: { companyId: cid, deletedAt: null, ...siteF, receivedAt: dateRange },
        select: { receivedAt: true, quantityKg: true }
      }),

      this.prisma.soyaOilOutput.findMany({
        where: { companyId: cid, ...siteF, deletedAt: null, createdAt: dateRange },
        select: { createdAt: true, quantityLitres: true }
      }),

      this.prisma.soyaCakeOutput.findMany({
        where: { companyId: cid, ...siteF, deletedAt: null, createdAt: dateRange },
        select: { createdAt: true, quantityKg: true }
      }),

      this.prisma.salesOrder.findMany({
        where: { companyId: cid, deletedAt: null, ...branchF, status: { not: "CANCELLED" }, orderDate: dateRange },
        select: { orderDate: true, branchId: true, totalAmount: true }
      }),

      this.prisma.eggProductionRecord.findMany({
        where: { companyId: cid, deletedAt: null, ...farmF, recordDate: dateRange },
        select: { farmId: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
      }),

      this.prisma.salesOrder.findMany({
        where: { companyId: cid, deletedAt: null, ...branchF, status: { not: "CANCELLED" }, orderDate: dateRange },
        select: { branchId: true, totalAmount: true }
      }),
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
      ? await this.prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true } })
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
      ? await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
      : [];
    const branchNameMap = new Map(branchNames.map((b: any) => [b.id, b.name]));
    const branchPerfData = [...salesByBranchId.entries()].map(([id, value]) => ({ label: branchNameMap.get(id) ?? id, value }));

    return {
      eggProductionTrend: [{ name: "Eggs", data: Array.from(eggByDate, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)) }] as Series[],
      mortalityTrend: [{ name: "Mortality", data: sumToMap(mortalityRows, "recordDate", "birdCount") }] as Series[],
      feedProductionTrend: [{ name: "Feed produced", data: sumToMap(feedProdRows, "createdAt", "producedQuantityKg") }] as Series[],
      soyaProductionTrend: [mapToSeries(soyaBeanByDate, "Beans processed"), mapToSeries(soyaOilByDate, "Oil produced"), mapToSeries(soyaCakeByDate, "Cake produced")] as Series[],
      salesTrend: [{ name: "Sales", data: sumToMap(salesRows, "orderDate", "totalAmount") }] as Series[],
      inventoryValueByCategory: await this.liveInventoryValueByCategory(user, query),
      profitabilityByProduct: await this.liveProfitabilityByProduct(cid, range),
      farmPerformanceComparison: [{ name: "farm_performance_index", data: farmPerfData }] as Series[],
      branchPerformanceComparison: [{ name: "branch_performance_index", data: branchPerfData }] as Series[],
    };
  }

  private async liveInventoryValueByCategory(user: AuthenticatedUser, query: DashboardQueryDto): Promise<Series[]> {
    // C4: previously took only companyId — no way to scope by location at
    // all, so a location-restricted user always saw the full company's
    // inventory valuation broken down by category through this chart.
    // H23: the try/catch here used to swallow any failure into an empty
    // series, indistinguishable from "genuinely no inventory this period."
    // Left to propagate now — see executive()'s own try/catch.
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        companyId: user.companyId, deletedAt: null, status: "AVAILABLE" as any, quantityRemaining: { gt: 0 }, unitCost: { not: null },
        ...this.liveBranchFilter(user, query), ...this.liveFarmFilter(user, query), ...this.liveWarehouseFilter(user, query), ...this.liveSiteFilter(user, query)
      },
      select: { quantityRemaining: true, unitCost: true, product: { select: { category: { select: { name: true } } } } }
    });
    const grouped = new Map<string, number>();
    for (const b of batches) {
      const cat = (b.product as any)?.category?.name ?? "Uncategorised";
      grouped.set(cat, (grouped.get(cat) ?? 0) + Number(b.quantityRemaining) * Number(b.unitCost));
    }
    const data = Array.from(grouped, ([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
    return [{ name: "inventory_value", data }];
  }

  private async liveProfitabilityByProduct(companyId: string, range: { start: Date; end: Date }): Promise<Series[]> {
    // H23: see liveInventoryValueByCategory above for why this no longer
    // swallows failures into an empty series.
    const rows = await this.prisma.productProfitability.findMany({
      where: { companyId, deletedAt: null, periodStart: { lte: range.end }, periodEnd: { gte: range.start } },
      select: { productName: true, grossProfit: true }
    });
    const grouped = new Map<string, number>();
    for (const r of rows) {
      grouped.set(r.productName, (grouped.get(r.productName) ?? 0) + Number(r.grossProfit));
    }
    const data = Array.from(grouped, ([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
    return [{ name: "gross_profit", data }];
  }

  // (2026-08-26) "Total birds" summed each active batch's static
  // openingBirdCount — the number typed in once when the batch was created —
  // and never subtracted mortality, culling, or outgoing transfers since
  // then. Two batches created with 5,000 birds each showed "10,000 total
  // birds" forever, no matter how many died. Mirrors
  // PoultryService.currentLiveBirds() exactly (same per-batch floor at 0,
  // same exclusion of cancelled transfers and whole-batch relocations) so
  // this stays consistent with what the Poultry module's own dashboard
  // shows for the same batches.
  private async currentLiveBirdsTotal(companyId: string, where: Record<string, unknown>) {
    const batches = await this.prisma.flockBatch.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null, ...where },
      select: {
        openingBirdCount: true,
        mortalityRecords: { where: { deletedAt: null }, select: { birdCount: true } },
        poultryTransferRecords: { where: { deletedAt: null }, select: { birdCount: true, isFullBatchRelocation: true, fromFarmId: true, toFarmId: true, status: true } }
      }
    });
    return batches.reduce((sum, batch) => {
      const mortalityTotal = batch.mortalityRecords.reduce((s, r) => s + r.birdCount, 0);
      const outgoingTotal = batch.poultryTransferRecords
        .filter((t) => !t.isFullBatchRelocation && t.fromFarmId !== t.toFarmId && t.status !== "CANCELLED")
        .reduce((s, t) => s + t.birdCount, 0);
      return sum + Math.max(0, batch.openingBirdCount - mortalityTotal - outgoingTotal);
    }, 0);
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

  private liveWarehouseFilter(user: AuthenticatedUser, query: DashboardQueryDto) {
    if (query.warehouseId) return { warehouseId: query.warehouseId };
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0) return { warehouseId: { in: user.warehouseIds } };
    return {};
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  // Low (DB stability audit, 2026-08-16): this used to fire one aggregate
  // query per card (18 today, fixed by CARD_CONFIG's length, not
  // data-driven — still a real N+1 shape). A single groupBy on metricKey
  // gets every card's sum in one round trip.
  private async summaryCards(baseWhere: Prisma.DashboardMetricSnapshotWhereInput): Promise<Card[]> {
    const rows = await this.prisma.dashboardMetricSnapshot.groupBy({
      by: ["metricKey"],
      where: baseWhere,
      _sum: { value: true }
    });
    const sums = new Map(rows.map((row) => [row.metricKey, Number(row._sum.value ?? 0)]));
    return CARD_CONFIG.map((card) => ({
      key: card.key,
      label: card.label,
      value: sums.get(card.metricKey) ?? 0,
      unit: card.unit,
      tone: card.tone,
      delta: null,
    }));
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

  private async alerts(user: AuthenticatedUser, query: DashboardQueryDto, _range: { start: Date; end: Date }) {
    // H23: see liveInventoryValueByCategory above for why this no longer
    // swallows a query failure into a fake empty alert list.
    const rows = await this.prisma.aiAlert.findMany({
      where: this.aiAlertWhere(user, query),
      select: { id: true, title: true, message: true, severity: true, status: true, category: true, createdAt: true },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 8
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      severity: a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "HIGH" ? "WARNING" : ("INFO" as string),
      status: "OPEN",
      businessUnit: this.categoryToBusinessUnit(a.category as string),
      occurredAt: a.createdAt
    }));
  }

  private categoryToBusinessUnit(category: string): string {
    const map: Record<string, string> = {
      MORTALITY_ANOMALY: "POULTRY",
      EGG_PRODUCTION_DROP: "POULTRY",
      FEED_CONSUMPTION_ANOMALY: "POULTRY",
      FEED_DEMAND_FORECAST: "FEED_MILL",
      LOW_STOCK_PREDICTION: "INVENTORY",
      SALES_FORECAST: "SALES",
      CUSTOMER_REORDER_PREDICTION: "SALES",
      SMART_PRICING: "SALES",
      CUSTOMER_DEBT_RISK: "SALES",
      SUPPLIER_DELAY_RISK: "INVENTORY",
      SOYA_YIELD_ANOMALY: "SOYA_PROCESSING",
      MACHINE_MAINTENANCE: "FEED_MILL"
    };
    return map[category] ?? "INVENTORY";
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

  private aiAlertWhere(user: AuthenticatedUser, query: DashboardQueryDto): Prisma.AiAlertWhereInput {
    return {
      companyId: user.companyId,
      status: { not: "RESOLVED" },
      branchId: query.branchId ?? undefined,
      farmId: query.farmId ?? undefined,
      warehouseId: query.warehouseId ?? undefined,
      productionSiteId: query.productionSiteId ?? undefined,
      AND: this.scopeClauses(user) as Prisma.AiAlertWhereInput[]
    };
  }

  private scopeClauses(user: AuthenticatedUser) {
    if (user.hasGlobalAccess) {
      return [];
    }

    return [
      user.branchIds.length ? { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] } : { branchId: null },
      user.farmIds.length ? { OR: [{ farmId: null }, { farmId: { in: user.farmIds } }] } : { farmId: null },
      user.warehouseIds.length ? { OR: [{ warehouseId: null }, { warehouseId: { in: user.warehouseIds } }] } : { warehouseId: null },
      user.productionSiteIds.length ? { OR: [{ productionSiteId: null }, { productionSiteId: { in: user.productionSiteIds } }] } : { productionSiteId: null },
    ];
  }

  private branchWhere(user: AuthenticatedUser) {
    if (!user.hasGlobalAccess && !user.branchIds.length) return { companyId: user.companyId, deletedAt: null, id: '__' };
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } }) };
  }

  private farmWhere(user: AuthenticatedUser) {
    if (!user.hasGlobalAccess && !user.farmIds.length) return { companyId: user.companyId, deletedAt: null, id: '__' };
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) };
  }

  private warehouseWhere(user: AuthenticatedUser) {
    if (!user.hasGlobalAccess && !user.warehouseIds.length) return { companyId: user.companyId, deletedAt: null, id: '__' };
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) };
  }

  private productionSiteWhere(user: AuthenticatedUser) {
    if (!user.hasGlobalAccess && !user.productionSiteIds.length) return { companyId: user.companyId, deletedAt: null, id: '__' };
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
    // (M20) Was local-timezone setHours(0/23, ...) — pinned to Accra/UTC so
    // "today"/"the last 30 days" means the same calendar days regardless of
    // the host's local TZ.
    const endBase = query.endDate ? new Date(query.endDate) : new Date();
    const end = endOfDayAccra(endBase);
    const startBase = query.startDate ? new Date(query.startDate) : new Date(endBase);
    if (!query.startDate) {
      startBase.setUTCDate(startBase.getUTCDate() - 29);
    }
    const start = startOfDayAccra(startBase);
    return { start, end };
  }

  private priorRange(range: { start: Date; end: Date }): { start: Date; end: Date } {
    const durationMs = range.end.getTime() - range.start.getTime();
    const priorEnd = new Date(range.start.getTime() - 1);
    const priorStart = new Date(range.start.getTime() - durationMs - 1);
    return { start: priorStart, end: priorEnd };
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
