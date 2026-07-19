"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChartBar,
  Bird,
  Boxes,
  CalendarDays,
  CircleCheckBig,
  Clock,
  Factory,
  ChartLine as LineIcon,
  PackageCheck,
  Scale,
  ShoppingCart,
  SlidersHorizontal,
  Wheat
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { useAuth } from "../../components/auth-context";
import { Skeleton, SkeletonCard } from "../../components/ui";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type Option = {
  id: string;
  code?: string;
  name: string;
};

type DashboardOptions = {
  companies: Option[];
  branches: Option[];
  farms: (Option & { branchId: string })[];
  warehouses: (Option & { branchId: string; farmId?: string; productionSiteId?: string })[];
  productionSites: (Option & { branchId: string; type: string })[];
  businessUnits: string[];
};

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

type Alert = {
  id: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  businessUnit: string;
};

type DashboardResponse = {
  summary: Card[];
  charts: Record<string, Series[]>;
  alerts: Alert[];
};

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

type FarmOperationsResponse = {
  data: {
    date: string;
    duties: OperationRow[];
    summary: { total: number; complete: number; partial: number; notStarted: number };
  };
};

type Filters = {
  companyId: string;
  branchId: string;
  farmId: string;
  warehouseId: string;
  productionSiteId: string;
  businessUnit: string;
  startDate: string;
  endDate: string;
};

const chartTitles: Record<string, string> = {
  eggProductionTrend: "Egg production trend",
  mortalityTrend: "Mortality trend",
  feedProductionTrend: "Feed production trend",
  soyaProductionTrend: "Soya production trend",
  salesTrend: "Sales trend",
  inventoryValueByCategory: "Inventory value by category",
  profitabilityByProduct: "Profitability by product",
  farmPerformanceComparison: "Farm performance comparison",
  branchPerformanceComparison: "Branch performance comparison"
};

const cardIcons = [
  Bird,
  PackageCheck,
  CalendarDays,
  AlertTriangle,
  Wheat,
  Factory,
  Scale,
  Scale,
  Scale,
  Boxes,
  ShoppingCart,
  ShoppingCart,
  ShoppingCart,
  AlertTriangle,
  Factory,
  PackageCheck,
  AlertTriangle,
  Activity
];

const cardHrefs: Record<string, string> = {
  totalBirds:                  "/poultry/batches",
  activeFlockBatches:          "/poultry/batches/create",
  eggProductionToday:          "/poultry/egg-production",
  mortalityToday:              "/poultry/mortality",
  feedConsumedToday:           "/poultry/feed-consumption",
  feedProducedThisWeek:        "/feed-production/batches",
  soyaBeansProcessedThisWeek: "/soya-processing/batches",
  soyaOilProduced:             "/soya-processing/oil-stock",
  soyaCakeProduced:            "/soya-processing/cake-stock",
  currentInventoryValue:       "/inventory/items",
  salesThisMonth:              "/sales/orders",
  outstandingCustomerDebt:     "/sales/debtors",
  supplierDebt:                "/procurement/invoices",
  lowStockAlerts:              "/inventory/low-stock",
  pendingProductionOrders:     "/feed-production/orders",
  pendingPurchaseApprovals:    "/procurement/purchase-requests",
  machineMaintenanceAlerts:    "/alerts",
  aiAlerts:                    "/alerts",
};

function defaultFilters(): Filters {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return {
    companyId: "",
    branchId: "",
    farmId: "",
    warehouseId: "",
    productionSiteId: "",
    businessUnit: "",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

function formatValue(value: number, unit?: string) {
  const formatted = new Intl.NumberFormat("en-GH", {
    maximumFractionDigits: unit === "%" ? 1 : 0
  }).format(value);
  return unit === "GHS" ? `GHS ${formatted}` : `${formatted}${unit === "%" ? "%" : ""}`;
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink/45">{label}</span>
      <select
        className="app-control font-medium text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.code ? `${opt.code} – ${opt.name}` : opt.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ card, index }: { card: Card; index: number }) {
  const Icon = cardIcons[index] ?? ChartBar;
  const href = cardHrefs[card.key];

  const styles = {
    critical: {
      wrap: "from-red-50 border-red-200",
      icon: "bg-red-100 text-red-600",
      val: "text-red-700",
      dot: "bg-red-400"
    },
    warning: {
      wrap: "from-amber-50 border-amber-200",
      icon: "bg-amber-100 text-amber-600",
      val: "text-caution",
      dot: "bg-amber-400"
    },
    good: {
      wrap: "from-emerald-50 border-emerald-200",
      icon: "bg-emerald-100 text-emerald-600",
      val: "text-emerald-700",
      dot: "bg-emerald-400"
    },
    neutral: {
      wrap: "from-white border-line",
      icon: "bg-brand/10 text-brand",
      val: "text-ink",
      dot: "bg-brand"
    }
  }[card.tone];

  const inner = (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b ${styles.wrap} to-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft`}
    >
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm ${styles.icon}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`h-2 w-2 rounded-full ${styles.dot} opacity-70`} />
          {href && (
            <ArrowRight aria-hidden className="h-3.5 w-3.5 text-ink/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          )}
        </div>
      </div>
      <strong className={`mt-4 block text-[26px] font-extrabold leading-none tracking-tight ${styles.val}`}>
        {formatValue(card.value, card.unit)}
      </strong>
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink/50 leading-snug">
        {card.label}
      </p>
    </article>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl">
      {inner}
    </Link>
  ) : inner;
}

function LinePanel({ title, series }: { title: string; series: Series[] }) {
  const values = series.flatMap((s) => s.data.map((p) => p.value));
  const max = Math.max(...values, 1);
  const W = 620, PL = 40, PB = 196, PT = 20;
  const chartW = W - PL - 10;
  const chartH = PB - PT;
  const colors = ["#f58220", "#b45309", "#1f2933"];

  const toXY = (data: { label: string; value: number }[], i: number) => ({
    x: PL + (i / Math.max(data.length - 1, 1)) * chartW,
    y: PB - (data[i].value / max) * chartH
  });

  return (
    <section className="app-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
          <LineIcon aria-hidden className="h-3.5 w-3.5 text-brand" />
        </span>
      </div>
      <div className="px-5 pb-4 pt-5">
        <svg
          viewBox={`0 0 ${W} ${PB + 4}`}
          className="h-52 w-full overflow-visible"
          role="img"
          aria-label={title}
        >
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={PL}
              y1={PB - t * chartH}
              x2={W - 10}
              y2={PB - t * chartH}
              stroke="#eadfd2"
              strokeWidth="1"
              strokeDasharray="4 5"
            />
          ))}
          <line x1={PL} y1={PB} x2={W - 10} y2={PB} stroke="#eadfd2" strokeWidth="1.5" />

          {series.map((s, si) => {
            const pts = s.data.map((_, i) => toXY(s.data, i));
            if (!pts.length) return null;
            const ptStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            const color = colors[si % colors.length];
            const gradId = `lg-${si}`;
            return (
              <g key={s.name}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`${pts[0].x.toFixed(1)},${PB} ${ptStr} ${pts[pts.length - 1].x.toFixed(1)},${PB}`}
                  fill={`url(#${gradId})`}
                />
                <polyline
                  points={ptStr}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {pts.map((p, pi) => (
                  <circle
                    key={pi}
                    cx={p.x}
                    cy={p.y}
                    r="3.5"
                    fill="white"
                    stroke={color}
                    strokeWidth="2"
                  />
                ))}
              </g>
            );
          })}
        </svg>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-ink/55">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-2">
              <span
                className="h-2 w-6 rounded-full"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              {s.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function BarPanel({ title, series }: { title: string; series: Series[] }) {
  const data = series[0]?.data ?? [];
  const max = Math.max(...data.map((p) => p.value), 1);

  return (
    <section className="app-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
          <ChartBar aria-hidden className="h-3.5 w-3.5 text-brand" />
        </span>
      </div>
      <div className="space-y-3 px-5 pb-5 pt-4">
        {data.map((p) => {
          const pct = Math.max((p.value / max) * 100, 3);
          return (
            <div key={p.label}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-ink/70 max-w-[180px]">{p.label}</span>
                <span className="shrink-0 font-bold text-ink">{formatValue(p.value)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-field">
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #f58220 0%, #dd741b 100%)"
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const SLOT_STYLE: Record<string, { label: string; cls: string }> = {
  MORNING: { label: "Morning",  cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  EVENING: { label: "Evening",  cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  ANYTIME: { label: "Anytime",  cls: "bg-sky-50 text-sky-700 ring-sky-200" },
};

function FarmOperationsToday({ data, loading }: { data: FarmOperationsResponse["data"] | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="app-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <Skeleton className="mb-1.5 h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.duties.length === 0) return null;

  const { duties, summary } = data;
  const allComplete = summary.complete === summary.total && summary.total > 0;

  return (
    <section className="app-card overflow-hidden">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-white to-field px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-ink">Farm Operations Today</h2>
          <p className="mt-0.5 text-xs text-ink/50">
            {new Date(data.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allComplete ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
              <CircleCheckBig aria-hidden className="h-3.5 w-3.5" />
              All duties complete
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-caution ring-1 ring-amber-200">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {summary.complete}/{summary.total} complete
            </span>
          )}
        </div>
      </div>

      {/* progress pills */}
      <div className="flex gap-3 border-b border-line px-5 py-3">
        {[
          { label: "Complete",    value: summary.complete,   cls: "bg-emerald-100 text-emerald-700" },
          { label: "Partial",     value: summary.partial,    cls: "bg-amber-100 text-caution" },
          { label: "Not started", value: summary.notStarted, cls: "bg-red-100 text-red-700" },
        ].map(({ label, value, cls }) => (
          <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
            {value} {label}
          </span>
        ))}
      </div>

      {/* duty rows */}
      <div className="divide-y divide-line">
        {duties.map((d) => {
          const slot = SLOT_STYLE[d.slot] ?? SLOT_STYLE.ANYTIME;
          const pct = d.percentage;
          const statusCls = d.complete ? "text-emerald-600" : d.submitted > 0 ? "text-caution" : "text-red-500";
          const barCls = d.complete
            ? "from-emerald-400 to-emerald-500"
            : d.submitted > 0
            ? "from-amber-400 to-amber-500"
            : "from-red-400 to-red-400";

          return (
            <div key={d.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-field/40">
              {/* icon */}
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/8 text-xl">
                {d.icon}
              </span>

              {/* body */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{d.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${slot.cls}`}>{slot.label}</span>
                  <span className="rounded-full bg-field px-2 py-0.5 text-[10px] font-medium text-ink/50">
                    {d.kind === "farm" ? "per farm" : "per site"}
                  </span>
                </div>
                {/* progress bar */}
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-field">
                    <div
                      className={`h-2 rounded-full bg-gradient-to-r transition-all duration-700 ${barCls}`}
                      style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                  <span className={`w-28 shrink-0 text-right text-xs font-bold tabular-nums ${statusCls}`}>
                    {d.submitted}/{d.total} {d.kind === "farm" ? "farms" : "sites"}
                  </span>
                </div>
              </div>

              {/* badge */}
              <span className={`shrink-0 text-xs font-extrabold tabular-nums ${statusCls}`}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card overflow-hidden" aria-hidden>
            <div className="border-b border-line px-5 py-4">
              <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="p-5">
              <Skeleton className="h-52 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const PRIMARY_ROUTE: [string, string][] = [
  ["poultry.read", "/poultry"],
  ["feed.read", "/feed-production"],
  ["soya.read", "/soya-processing"],
  ["finance.read", "/finance"],
  ["sales.read", "/sales"],
  ["hr.read", "/hr"],
  ["procurement.read", "/procurement"],
  ["market-planning.read", "/market-planning"],
  ["inventory.read", "/inventory"],
  ["maintenance.read", "/maintenance"],
  ["quality.read", "/quality"],
  ["audit.read", "/audit"],
];

export default function DashboardPage() {
  const { profile, ready } = useAuth();
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [options, setOptions] = useState<DashboardOptions | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [farmOps, setFarmOps] = useState<FarmOperationsResponse["data"] | null>(null);
  const [farmOpsLoading, setFarmOpsLoading] = useState(true);

  // Redirect non-executive users to their primary module
  useEffect(() => {
    if (!ready || !profile) return;
    const hasExecutiveAccess =
      profile.hasGlobalAccess || profile.permissions.includes("executive.read");
    if (!hasExecutiveAccess) {
      const perms = profile.permissions ?? [];
      const route = PRIMARY_ROUTE.find(([p]) => perms.includes(p))?.[1] ?? "/profile";
      router.replace(route);
    }
  }, [ready, profile, router]);

  const filteredFarms = useMemo(
    () =>
      (filters.branchId
        ? options?.farms.filter((f) => f.branchId === filters.branchId)
        : options?.farms) ?? [],
    [filters.branchId, options]
  );
  const filteredWarehouses = useMemo(
    () =>
      (filters.branchId
        ? options?.warehouses.filter((w) => w.branchId === filters.branchId)
        : options?.warehouses) ?? [],
    [filters.branchId, options]
  );
  const filteredSites = useMemo(
    () =>
      (filters.branchId
        ? options?.productionSites.filter((s) => s.branchId === filters.branchId)
        : options?.productionSites) ?? [],
    [filters.branchId, options]
  );

  useEffect(() => {
    apiFetch<ApiEnvelope<DashboardOptions>>("/dashboard/options")
      .then((res) => {
        const opts = res.data ?? { companies: [], branches: [], farms: [], warehouses: [], productionSites: [], businessUnits: [] };
        setOptions(opts);
        setFilters((f) => ({ ...f, companyId: opts.companies[0]?.id ?? "" }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setDashboardLoading(true);
    apiFetch<ApiEnvelope<DashboardResponse>>(`/dashboard/executive?${buildQuery(filters)}`)
      .then((res) => setDashboard(res.data))
      .catch(() => setDashboard(null))
      .finally(() => setDashboardLoading(false));
  }, [filters]);

  useEffect(() => {
    setFarmOpsLoading(true);
    apiFetch<FarmOperationsResponse>("/dashboard/farm-operations-today")
      .then((res) => setFarmOps(res.data))
      .catch(() => setFarmOps(null))
      .finally(() => setFarmOpsLoading(false));
  }, []);

  return (
    <AppShell>
      {/* Page hero */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-2xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Executive command
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Live Agribusiness Performance
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/55">
              Company, branch, farm, warehouse, production, sales, finance, procurement,
              maintenance, and AI alerts consolidated for scoped decision-making.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Date window", value: `${filters.startDate.slice(5)} — ${filters.endDate.slice(5)}` },
              { label: "Scope", value: filters.branchId ? "Branch filtered" : "All branches" },
              {
                label: "Active alerts",
                value: dashboardLoading ? "—" : String(dashboard?.alerts.length ?? 0)
              }
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-line bg-white/80 px-4 py-2.5 backdrop-blur-sm"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">{label}</p>
                <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="app-card mb-6 overflow-hidden">
        <button
          className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-sm font-semibold text-ink transition hover:bg-field"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4 text-brand" />
          Filters & date range
          <span className="ml-auto text-xs font-normal text-ink/40">
            {filtersOpen ? "Collapse" : "Expand"}
          </span>
        </button>
        {filtersOpen && (
          <div className="grid gap-3 border-t border-line p-5 md:grid-cols-2 xl:grid-cols-7">
            <SelectField
              label="Company"
              value={filters.companyId}
              options={options?.companies ?? []}
              onChange={(companyId) => setFilters({ ...filters, companyId })}
            />
            <SelectField
              label="Branch"
              value={filters.branchId}
              options={options?.branches ?? []}
              onChange={(branchId) =>
                setFilters({ ...filters, branchId, farmId: "", warehouseId: "", productionSiteId: "" })
              }
            />
            <SelectField
              label="Farm"
              value={filters.farmId}
              options={filteredFarms}
              onChange={(farmId) => setFilters({ ...filters, farmId })}
            />
            <SelectField
              label="Warehouse"
              value={filters.warehouseId}
              options={filteredWarehouses}
              onChange={(warehouseId) => setFilters({ ...filters, warehouseId })}
            />
            <SelectField
              label="Production site"
              value={filters.productionSiteId}
              options={filteredSites}
              onChange={(productionSiteId) => setFilters({ ...filters, productionSiteId })}
            />
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink/45">
                Business unit
              </span>
              <select
                className="app-control text-sm font-medium"
                value={filters.businessUnit}
                onChange={(e) => setFilters({ ...filters, businessUnit: e.target.value })}
              >
                <option value="">All</option>
                {(options?.businessUnits ?? []).map((unit) => (
                  <option key={unit} value={unit}>
                    {unit.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink/45">From</span>
                <input
                  className="app-control text-sm"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink/45">To</span>
                <input
                  className="app-control text-sm"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Summary + charts */}
      {dashboardLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            aria-label="Summary metrics"
          >
            {(dashboard?.summary ?? []).map((card, i) => (
              <SummaryCard key={card.key} card={card} index={i} />
            ))}
          </section>

          <div className="mt-6">
            <FarmOperationsToday data={farmOps} loading={farmOpsLoading} />
          </div>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            {Object.entries(dashboard?.charts ?? {}).map(([key, series]) =>
              key.includes("Comparison") || key.includes("Category") || key.includes("Product") ? (
                <BarPanel key={key} title={chartTitles[key] ?? key} series={series} />
              ) : (
                <LinePanel key={key} title={chartTitles[key] ?? key} series={series} />
              )
            )}
          </section>
        </>
      )}

      {/* Alerts */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">AI & Operational Alerts</h2>
          {!dashboardLoading && (dashboard?.alerts.length ?? 0) > 0 && (
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
              {dashboard?.alerts.length}
            </span>
          )}
        </div>

        {dashboardLoading ? (
          <div className="grid gap-3 xl:grid-cols-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-line bg-white p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (dashboard?.alerts ?? []).length === 0 ? (
          <div className="app-card flex flex-col items-center justify-center py-12 text-center">
            <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-emerald-100">
              <AlertTriangle aria-hidden className="h-5 w-5 text-emerald-600" />
            </span>
            <p className="text-sm font-semibold text-ink/60">No alerts in the selected period</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {(dashboard?.alerts ?? []).map((alert) => (
              <article
                key={alert.id}
                className={`overflow-hidden rounded-xl border-l-[3px] bg-white shadow-card ${
                  alert.severity === "CRITICAL"
                    ? "border-l-red-500"
                    : alert.severity === "WARNING"
                      ? "border-l-amber-500"
                      : "border-l-emerald-500"
                } border border-line border-l-[3px]`}
              >
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-sm font-bold text-ink leading-snug">{alert.title}</strong>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        alert.severity === "CRITICAL"
                          ? "bg-red-100 text-red-700"
                          : alert.severity === "WARNING"
                            ? "bg-amber-100 text-caution"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-5 text-ink/65">{alert.message}</p>
                  <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-ink/35">
                    {alert.businessUnit.replace(/_/g, " ")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
