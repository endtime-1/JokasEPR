"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  FileSpreadsheet,
  Printer,
  Search,
  TrendingUp
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { FormField } from "../../components/form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../../lib/api";

type ReportDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
  columns: Array<{ key: string; label: string; type?: string }>;
  chart?: { labelKey: string; valueKey: string; title: string };
};

type ReportResult = {
  definition: ReportDefinition;
  rows: Record<string, unknown>[];
  totals: Record<string, number>;
  chart?: { title: string; labels: string[]; values: number[] };
};

type Option = {
  id: string;
  code?: string;
  sku?: string;
  name: string;
};

type ReportOptions = {
  companies: Option[];
  branches: Option[];
  farms: Option[];
  warehouses: Option[];
  productionSites: Option[];
  products: Option[];
  customers: Option[];
  suppliers: Option[];
};

const emptyOptions: ReportOptions = {
  companies: [],
  branches: [],
  farms: [],
  warehouses: [],
  productionSites: [],
  products: [],
  customers: [],
  suppliers: []
};

const controlClass =
  "min-h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<ReportDefinition[]>([]);
  const [options, setOptions] = useState<ReportOptions>(emptyOptions);
  const [activeId, setActiveId] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    companyId: "",
    branchId: "",
    farmId: "",
    warehouseId: "",
    productionSiteId: "",
    productId: "",
    customerId: "",
    supplierId: ""
  });
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<ReportDefinition[]>>("/reports")
      .then((res) => {
        const catalog = res.data ?? [];
        setCatalog(catalog);
        setActiveId(catalog[0]?.id ?? "");
      })
      .catch(() => undefined);
    apiFetch<ApiEnvelope<ReportOptions>>("/reports/options")
      .then((res) => setOptions(res.data ?? emptyOptions))
      .catch(() => undefined);
  }, []);

  const categories = useMemo(
    () => [...new Set(catalog.map((r) => r.category))],
    [catalog]
  );
  const activeReport = catalog.find((r) => r.id === activeId);

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeId) return;
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<ReportResult>>(
        `/reports/${activeId}${queryString(filters)}`
      );
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeId) void run();
  }, [activeId]);

  function exportReport(format: "csv" | "xls" | "pdf") {
    if (!activeId) return;
    const ext = format === "xls" ? "xls" : format;
    void downloadReport(
      `/reports/${activeId}/export.${ext}${queryString(filters)}`,
      `${activeId}.${ext}`
    );
  }

  return (
    <AppShell>
      {/* Page hero */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Analytics
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Reporting & Analytics
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Permission-aware operational and financial reports with filters, charts,
              PDF, Excel, and print output.
            </p>
          </div>
          {/* Export actions */}
          <div className="flex items-center divide-x divide-line overflow-hidden rounded-xl border border-line bg-white shadow-card">
            <button
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-field"
              onClick={() => window.print()}
            >
              <Printer aria-hidden className="h-4 w-4" />
              Print
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-field"
              onClick={() => exportReport("pdf")}
            >
              <Download aria-hidden className="h-4 w-4" />
              PDF
            </button>
            <button
              className="flex items-center gap-2 bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#dd741b]"
              onClick={() => exportReport("xls")}
            >
              <FileSpreadsheet aria-hidden className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">

        {/* ── Report catalog sidebar ──────────────────────────────────────── */}
        <aside className="rounded-2xl border border-line bg-white shadow-panel overflow-hidden">
          <div className="border-b border-line bg-gradient-to-r from-white to-field/60 px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
              Report Catalog
            </p>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {catalog.length} available reports
            </p>
          </div>
          <div className="divide-y divide-line/60 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {categories.map((category) => (
              <div key={category} className="py-3 first:pt-0">
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-ink/40">
                  {category}
                </p>
                <div className="space-y-0.5">
                  {catalog
                    .filter((r) => r.category === category)
                    .map((report) => (
                      <button
                        key={report.id}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                          activeId === report.id
                            ? "bg-brand text-white shadow-sm"
                            : "text-ink/70 hover:bg-field hover:text-ink"
                        }`}
                        onClick={() => setActiveId(report.id)}
                      >
                        <ChevronRight
                          aria-hidden
                          className={`h-3.5 w-3.5 shrink-0 ${
                            activeId === report.id ? "text-white/70" : "text-ink/30"
                          }`}
                        />
                        <span className="leading-snug">{report.title}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main className="min-w-0 space-y-5">

          {/* Filters */}
          <form
            onSubmit={run}
            className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel"
          >
            <div className="border-b border-line bg-gradient-to-r from-white to-field/60 px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                Report Filters
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-4">
              <FormField label="Date from">
                <input
                  className={controlClass}
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </FormField>
              <FormField label="Date to">
                <input
                  className={controlClass}
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </FormField>
              <SelectField
                label="Company"
                value={filters.companyId}
                options={options.companies}
                onChange={(v) => setFilters({ ...filters, companyId: v })}
              />
              <SelectField
                label="Branch"
                value={filters.branchId}
                options={options.branches}
                onChange={(v) => setFilters({ ...filters, branchId: v })}
              />
              <SelectField
                label="Farm"
                value={filters.farmId}
                options={options.farms}
                onChange={(v) => setFilters({ ...filters, farmId: v })}
              />
              <SelectField
                label="Warehouse"
                value={filters.warehouseId}
                options={options.warehouses}
                onChange={(v) => setFilters({ ...filters, warehouseId: v })}
              />
              <SelectField
                label="Production site"
                value={filters.productionSiteId}
                options={options.productionSites}
                onChange={(v) => setFilters({ ...filters, productionSiteId: v })}
              />
              <SelectField
                label="Product"
                value={filters.productId}
                options={options.products}
                onChange={(v) => setFilters({ ...filters, productId: v })}
              />
              <SelectField
                label="Customer"
                value={filters.customerId}
                options={options.customers}
                onChange={(v) => setFilters({ ...filters, customerId: v })}
              />
              <SelectField
                label="Supplier"
                value={filters.supplierId}
                options={options.suppliers}
                onChange={(v) => setFilters({ ...filters, supplierId: v })}
              />
              <button
                type="submit"
                className="app-button-primary md:col-span-2"
                disabled={loading}
              >
                <Search aria-hidden className="h-4 w-4" />
                {loading ? "Running…" : "Run report"}
              </button>
            </div>
          </form>

          {/* Report result */}
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel print:shadow-none">
            <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">
                  {result?.definition.title ?? activeReport?.title ?? "Select a report"}
                </h3>
                <p className="mt-0.5 text-sm text-ink/50">
                  {result?.definition.description ??
                    activeReport?.description ??
                    "Choose a report from the catalog to view analytics."}
                </p>
              </div>
              <button
                className="app-button-secondary shrink-0 print:hidden"
                onClick={() => exportReport("csv")}
              >
                <Download aria-hidden className="h-4 w-4" />
                CSV
              </button>
            </div>

            <div className="p-5">
              {result?.chart ? <ReportBarChart chart={result.chart} /> : null}

              {result ? (
                <>
                  <DataTable
                    rows={result.rows}
                    empty="No report rows found"
                    columns={result.definition.columns.map((col) => ({
                      key: col.key,
                      label: col.label,
                      render: (row) => formatValue(row[col.key], col.type)
                    }))}
                  />
                  <Totals totals={result.totals} columns={result.definition.columns} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-field">
                    <TrendingUp className="h-6 w-6 text-ink/20" />
                  </span>
                  <p className="text-sm font-semibold text-ink/45">
                    Select a report and run it to view analytics
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
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
  const controlClass =
    "min-h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";
  return (
    <FormField label={label}>
      <select
        className={controlClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.code ?? opt.sku ?? ""} {opt.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

function ReportBarChart({ chart }: { chart: NonNullable<ReportResult["chart"]> }) {
  const max = Math.max(...chart.values, 1);
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-line bg-gradient-to-b from-field/40 to-white">
      <div className="border-b border-line px-4 py-3">
        <h4 className="text-sm font-bold text-ink">{chart.title}</h4>
      </div>
      <div className="space-y-3 p-4">
        {chart.labels.map((label, index) => {
          const pct = Math.max(4, (chart.values[index] / max) * 100);
          return (
            <div key={`${label}-${index}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-ink/60 max-w-[160px]">{label}</span>
                <strong className="shrink-0 text-ink">{number(chart.values[index])}</strong>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line/60">
                <div
                  className="h-2.5 rounded-full transition-all duration-700"
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
    </div>
  );
}

function Totals({
  totals,
  columns
}: {
  totals: Record<string, number>;
  columns: ReportDefinition["columns"];
}) {
  const entries = columns.filter((col) => totals[col.key] !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {entries.map((col) => (
        <div
          key={col.key}
          className="rounded-xl border border-line bg-gradient-to-b from-white to-field/60 p-3.5 shadow-card"
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">{col.label}</p>
          <strong className="mt-1.5 block text-base font-extrabold text-ink">
            {formatValue(totals[col.key], col.type)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => Boolean(v))
  );
  const q = params.toString();
  return q ? `?${q}` : "";
}

function formatValue(value: unknown, type?: string) {
  if (type === "money") return `GHS ${number(value)}`;
  if (type === "number" || type === "percent") return number(value);
  return String(value ?? "-");
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}
