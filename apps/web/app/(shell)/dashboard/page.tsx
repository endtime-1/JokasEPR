"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/auth-context";
import { ExecutiveSections, type DashboardSection } from "../../../components/executive-sections";
import { Skeleton } from "../../../components/ui";
import { ApiEnvelope, apiFetch, getCachedFirst, hasCached } from "../../../lib/api";

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
  delta?: number | null;
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
  sections: DashboardSection[];
  charts: Record<string, Series[]>;
  alerts: Alert[];
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
  // The single calendar day the "today"-labeled cards (eggs/mortality/feed
  // consumed) snapshot. Independent of startDate/endDate, which only drive
  // the trend charts and every other rollup KPI below.
  day: string;
};

type DatePreset = "today" | "7d" | "30d" | "mtd" | "qtd" | "ytd";

function applyPreset(preset: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = fmt(today);
  if (preset === "today") return { startDate: end, endDate: end };
  if (preset === "7d") {
    const s = new Date(today); s.setDate(s.getDate() - 6);
    return { startDate: fmt(s), endDate: end };
  }
  if (preset === "30d") {
    const s = new Date(today); s.setDate(s.getDate() - 29);
    return { startDate: fmt(s), endDate: end };
  }
  if (preset === "mtd") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: fmt(s), endDate: end };
  }
  if (preset === "qtd") {
    const q = Math.floor(today.getMonth() / 3);
    const s = new Date(today.getFullYear(), q * 3, 1);
    return { startDate: fmt(s), endDate: end };
  }
  // ytd
  const s = new Date(today.getFullYear(), 0, 1);
  return { startDate: fmt(s), endDate: end };
}

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
    endDate: end.toISOString().slice(0, 10),
    day: todayStr()
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}


function timeAgoLabel(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 5 }).map((_, s) => (
        <div key={s} className="app-card overflow-hidden" aria-hidden>
          <div className="border-b border-line px-5 py-3.5">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
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
  const [activePreset, setActivePreset] = useState<DatePreset | null>("30d");
  // Which figure the Mortality/Eggs/Feed-consumed headline tiles show right
  // now: the single Daily-stepper day, or the Scope & trend window's period
  // total. Whichever control the user last touched wins — so picking "30
  // days" really does swap the big number, not just a small caption.
  const [metricMode, setMetricMode] = useState<"day" | "period">("day");
  const [options, setOptions] = useState<DashboardOptions | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(() => getCachedFirst<ApiEnvelope<DashboardResponse>>("/dashboard/executive")?.data ?? null);
  const [dashboardLoading, setDashboardLoading] = useState(!hasCached("/dashboard/executive"));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceRefreshLabel] = useState(0);
  const retryCountRef = useRef(0);

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
      .catch((err) => console.error("dashboard options:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    retryCountRef.current = 0;
    setDashboardLoading(true);
    function load() {
      apiFetch<ApiEnvelope<DashboardResponse>>(`/dashboard/executive?${buildQuery(filters)}`)
        .then((res) => {
          if (cancelled) return;
          const data = res.data ?? null;
          // Retry on genuinely empty response — may be a cold-start artefact
          const isEmpty = !data || (
            (data.summary?.length ?? 0) === 0 &&
            (data.alerts?.length ?? 0) === 0 &&
            Object.keys(data.charts ?? {}).length === 0
          );
          if (isEmpty && retryCountRef.current < 3) {
            retryCountRef.current++;
            setTimeout(() => { if (!cancelled) load(); }, 4000);
            return;
          }
          setDashboard(data);
          setLastRefreshed(new Date());
          setDashboardLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (retryCountRef.current < 3) {
            retryCountRef.current++;
            setTimeout(() => { if (!cancelled) load(); }, 4000);
            return;
          }
          setDashboard(null);
          setDashboardLoading(false);
        });
    }
    load();
    return () => { cancelled = true; };
  }, [filters, refreshKey]);

  // Tick "X min ago" label every 30s
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => forceRefreshLabel((n) => n + 1), 30_000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, []);

  return (
    <>
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
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Trend window", value: `${filters.startDate.slice(5)} — ${filters.endDate.slice(5)}` },
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

            {/* Daily snapshot — the "today" cards (eggs/mortality/feed
                consumed) always reflect this one day, independent of the
                Date window trend filter below. Always visible so switching
                to yesterday or any earlier day never requires opening the
                filter panel. */}
            <div className="flex items-center gap-1 rounded-xl border border-line bg-white/80 px-2 py-1.5 backdrop-blur-sm">
              <span className="pl-1 pr-1 text-[10px] font-bold uppercase tracking-wider text-ink/40">Daily</span>
              <button
                type="button"
                onClick={() => { setMetricMode("day"); setFilters((f) => ({ ...f, day: addDays(f.day, -1) })); }}
                title="Previous day"
                className="rounded-md p-1 text-ink/50 transition hover:bg-field hover:text-ink"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <input
                type="date"
                value={filters.day}
                max={todayStr()}
                onChange={(e) => { if (e.target.value) { setMetricMode("day"); setFilters((f) => ({ ...f, day: e.target.value })); } }}
                className="w-[124px] rounded-md border border-line bg-white px-1.5 py-1 text-xs font-semibold text-ink"
              />
              <button
                type="button"
                onClick={() => { setMetricMode("day"); setFilters((f) => ({ ...f, day: addDays(f.day, 1) })); }}
                disabled={filters.day >= todayStr()}
                title="Next day"
                className="rounded-md p-1 text-ink/50 transition hover:bg-field hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setMetricMode("day"); setFilters((f) => ({ ...f, day: todayStr() })); }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  metricMode === "day" && filters.day === todayStr() ? "bg-brand text-white" : "bg-field text-ink/60 hover:bg-line hover:text-ink"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => { setMetricMode("day"); setFilters((f) => ({ ...f, day: addDays(todayStr(), -1) })); }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  metricMode === "day" && filters.day === addDays(todayStr(), -1) ? "bg-brand text-white" : "bg-field text-ink/60 hover:bg-line hover:text-ink"
                }`}
              >
                Yesterday
              </button>
            </div>

            <div className="flex items-center gap-2">
              {lastRefreshed && (
                <span className="text-[11px] text-ink/40">
                  Updated {timeAgoLabel(lastRefreshed)}
                </span>
              )}
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={dashboardLoading}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink/70 shadow-card transition hover:bg-white hover:text-ink disabled:opacity-50"
              >
                <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${dashboardLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/poultry"
                className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10"
              >
                Poultry Executive
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/reports"
                className="flex items-center gap-1.5 rounded-lg border border-line bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-white hover:text-ink"
              >
                Reports
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
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
          Scope & trend window
          <span className="ml-auto text-xs font-normal text-ink/40">
            {filtersOpen ? "Collapse" : "Expand"}
          </span>
        </button>
        {filtersOpen && (
          <div className="border-t border-line">
            {/* Date presets */}
            <div className="flex flex-wrap gap-1.5 px-5 pt-4 pb-0">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "7d",    label: "7 days" },
                  { id: "30d",   label: "30 days" },
                  { id: "mtd",   label: "MTD" },
                  { id: "qtd",   label: "QTD" },
                  { id: "ytd",   label: "YTD" },
                ] as { id: DatePreset; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const dates = applyPreset(p.id);
                    setActivePreset(p.id);
                    // "Today" here means the same thing as the Daily
                    // stepper's Today button — show today's day figure. Any
                    // other preset is a real multi-day period, so the
                    // headline switches to that period's total.
                    if (p.id === "today") {
                      setMetricMode("day");
                      setFilters((f) => ({ ...f, ...dates, day: todayStr() }));
                    } else {
                      setMetricMode("period");
                      setFilters((f) => ({ ...f, ...dates }));
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    activePreset === p.id
                      ? "bg-brand text-white shadow-sm"
                      : "bg-field text-ink/60 hover:bg-line hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-7">
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
                  onChange={(e) => { setActivePreset(null); setFilters({ ...filters, startDate: e.target.value }); }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink/45">To</span>
                <input
                  className="app-control text-sm"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => { setActivePreset(null); setFilters({ ...filters, endDate: e.target.value }); }}
                />
              </label>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Module sections */}
      {dashboardLoading ? (
        <DashboardSkeleton />
      ) : (
        <ExecutiveSections sections={dashboard?.sections ?? []} />
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
            <p className="text-sm font-semibold text-ink/60">No active alerts — all clear</p>
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
    </>
  );
}
