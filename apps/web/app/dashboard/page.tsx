"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bird,
  Boxes,
  CalendarDays,
  Factory,
  LineChart,
  PackageCheck,
  Scale,
  ShoppingCart,
  Wheat
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
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
  LineChart
];

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
    <label className="grid gap-1 text-xs font-semibold uppercase text-ink/65">
      {label}
      <select
        className="app-control font-medium normal-case"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.code ? `${opt.code} - ${opt.name}` : opt.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ card, index }: { card: Card; index: number }) {
  const Icon = cardIcons[index] ?? BarChart3;
  const toneClass =
    card.tone === "critical"
      ? "border-red-200 bg-red-50 text-red-700"
      : card.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-caution"
        : card.tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-line bg-white text-ink";

  return (
    <article
      className={`min-h-32 rounded-xl border p-4 shadow-panel transition hover:-translate-y-0.5 hover:shadow-soft ${toneClass}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-sm font-semibold text-ink/70">{card.label}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/80 shadow-sm ring-1 ring-line/50">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
      </div>
      <strong className="block text-2xl font-bold leading-tight tracking-tight">
        {formatValue(card.value, card.unit)}
      </strong>
      {card.unit && card.unit !== "GHS" && card.unit !== "%" ? (
        <span className="mt-1 block text-xs uppercase text-ink/50">{card.unit}</span>
      ) : null}
    </article>
  );
}

function LinePanel({ title, series }: { title: string; series: Series[] }) {
  const values = series.flatMap((s) => s.data.map((p) => p.value));
  const max = Math.max(...values, 1);
  const width = 620;
  const height = 220;
  const colors = ["#f58220", "#b45309", "#1f2933"];

  return (
    <section className="app-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{title}</h3>
        <LineChart aria-hidden className="h-4 w-4 text-brand" />
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full overflow-visible"
        role="img"
        aria-label={title}
      >
        <line x1="34" y1="184" x2="600" y2="184" stroke="#eadfd2" />
        <line x1="34" y1="20" x2="34" y2="184" stroke="#eadfd2" />
        {series.map((s, si) => {
          const points = s.data.map((p, i) => {
            const x = 34 + (i / Math.max(s.data.length - 1, 1)) * 566;
            const y = 184 - (p.value / max) * 154;
            return `${x},${y}`;
          });
          return (
            <polyline
              key={s.name}
              points={points.join(" ")}
              fill="none"
              stroke={colors[si % colors.length]}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink/60">
        {series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-2">
            <span className="h-2 w-5 rounded" style={{ backgroundColor: colors[i % colors.length] }} />
            {s.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function BarPanel({ title, series }: { title: string; series: Series[] }) {
  const data = series[0]?.data ?? [];
  const max = Math.max(...data.map((p) => p.value), 1);

  return (
    <section className="app-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{title}</h3>
        <BarChart3 aria-hidden className="h-4 w-4 text-brand" />
      </div>
      <div className="grid gap-3">
        {data.map((p) => (
          <div key={p.label} className="grid grid-cols-[150px_1fr_92px] items-center gap-3 text-sm">
            <span className="truncate text-ink/70">{p.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-field">
              <div
                className="h-2.5 rounded-full bg-brand transition-all duration-700"
                style={{ width: `${Math.max((p.value / max) * 100, 3)}%` }}
              />
            </div>
            <span className="text-right font-semibold">{formatValue(p.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card p-4" aria-hidden>
            <Skeleton className="mb-4 h-5 w-1/3" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [options, setOptions] = useState<DashboardOptions | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

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
        setOptions(res.data);
        setFilters((f) => ({ ...f, companyId: res.data.companies[0]?.id ?? "" }));
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

  return (
    <AppShell>
      {/* Page header */}
      <div className="mb-6 rounded-xl border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-kicker">Executive command</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Live Agribusiness Performance
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/62">
              Company, branch, farm, warehouse, production, sales, finance, procurement,
              maintenance, and AI alerts consolidated for scoped decision making.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border border-line bg-field/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-ink/45">Window</p>
              <p className="mt-1 font-bold">
                {filters.startDate} — {filters.endDate}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-field/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-ink/45">Scope</p>
              <p className="mt-1 font-bold">
                {filters.branchId ? "Filtered" : "All branches"}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-field/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-ink/45">Alerts</p>
              <p className="mt-1 font-bold">{dashboard?.alerts.length ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <section className="app-card mb-6 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
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
        <label className="grid gap-1 text-xs font-semibold uppercase text-ink/65">
          Business unit
          <select
            className="app-control font-medium normal-case"
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
          <label className="grid gap-1 text-xs font-semibold uppercase text-ink/65">
            From
            <input
              className="app-control normal-case"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-ink/65">
            To
            <input
              className="app-control normal-case"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Summary cards + charts — skeleton while loading */}
      {dashboardLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {(dashboard?.summary ?? []).map((card, i) => (
              <SummaryCard key={card.key} card={card} index={i} />
            ))}
          </section>

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

      {/* AI Alerts */}
      <section className="app-card mt-6 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">AI and Operational Alerts</h3>
          <AlertTriangle aria-hidden className="h-4 w-4 text-brand" />
        </div>
        {dashboardLoading ? (
          <div className="grid gap-3 xl:grid-cols-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (dashboard?.alerts ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-ink/50">No alerts in the selected period.</p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {(dashboard?.alerts ?? []).map((alert) => (
              <article key={alert.id} className="rounded-xl border border-line bg-field/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <strong className="text-sm">{alert.title}</strong>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
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
                <p className="text-sm text-ink/70">{alert.message}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-ink/45">
                  {alert.businessUnit.replace(/_/g, " ")}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
