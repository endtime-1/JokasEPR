"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";
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

const emptyOptions: ReportOptions = { companies: [], branches: [], farms: [], warehouses: [], productionSites: [], products: [], customers: [], suppliers: [] };
const inputClass = "min-h-10 rounded-md border border-line px-3 text-sm";

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<ReportDefinition[]>([]);
  const [options, setOptions] = useState<ReportOptions>(emptyOptions);
  const [activeId, setActiveId] = useState("");
  const [filters, setFilters] = useState({ startDate: "", endDate: "", companyId: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "", productId: "", customerId: "", supplierId: "" });
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<ReportDefinition[]>>("/reports").then((response) => {
      setCatalog(response.data);
      setActiveId(response.data[0]?.id ?? "");
    }).catch(() => undefined);
    apiFetch<ApiEnvelope<ReportOptions>>("/reports/options").then((response) => setOptions(response.data)).catch(() => undefined);
  }, []);

  const categories = useMemo(() => [...new Set(catalog.map((report) => report.category))], [catalog]);
  const activeReport = catalog.find((report) => report.id === activeId);

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeId) return;
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<ReportResult>>(`/reports/${activeId}${queryString(filters)}`);
      setResult(response.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeId) void run();
  }, [activeId]);

  function exportReport(format: "csv" | "xls" | "pdf") {
    if (!activeId) return;
    const extension = format === "xls" ? "xls" : format;
    void downloadReport(`/reports/${activeId}/export.${extension}${queryString(filters)}`, `${activeId}.${extension}`);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Reporting and Analytics</h2>
          <p className="text-sm text-ink/65">Permission-aware operational and financial reports with filters, charts, PDF, Excel, and print output.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" onClick={() => window.print()}><Printer aria-hidden className="h-4 w-4" /> Print</button>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" onClick={() => exportReport("pdf")}><Download aria-hidden className="h-4 w-4" /> PDF</button>
          <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white" onClick={() => exportReport("xls")}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Excel</button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-md border border-line bg-white p-3 shadow-panel">
          <h3 className="mb-3 text-sm font-semibold uppercase text-ink/60">Report Catalog</h3>
          <div className="space-y-4">
            {categories.map((category) => (
              <section key={category}>
                <h4 className="mb-2 text-sm font-semibold">{category}</h4>
                <div className="space-y-1">
                  {catalog.filter((report) => report.category === category).map((report) => (
                    <button key={report.id} className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeId === report.id ? "bg-brand text-white" : "hover:bg-field"}`} onClick={() => setActiveId(report.id)}>
                      {report.title}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          <form onSubmit={run} className="mb-6 grid gap-3 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
            <FormField label="Date from"><input className={inputClass} type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></FormField>
            <FormField label="Date to"><input className={inputClass} type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></FormField>
            <SelectField label="Company" value={filters.companyId} options={options.companies} onChange={(value) => setFilters({ ...filters, companyId: value })} />
            <SelectField label="Branch" value={filters.branchId} options={options.branches} onChange={(value) => setFilters({ ...filters, branchId: value })} />
            <SelectField label="Farm" value={filters.farmId} options={options.farms} onChange={(value) => setFilters({ ...filters, farmId: value })} />
            <SelectField label="Warehouse" value={filters.warehouseId} options={options.warehouses} onChange={(value) => setFilters({ ...filters, warehouseId: value })} />
            <SelectField label="Production site" value={filters.productionSiteId} options={options.productionSites} onChange={(value) => setFilters({ ...filters, productionSiteId: value })} />
            <SelectField label="Product" value={filters.productId} options={options.products} onChange={(value) => setFilters({ ...filters, productId: value })} />
            <SelectField label="Customer" value={filters.customerId} options={options.customers} onChange={(value) => setFilters({ ...filters, customerId: value })} />
            <SelectField label="Supplier" value={filters.supplierId} options={options.suppliers} onChange={(value) => setFilters({ ...filters, supplierId: value })} />
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-2"><Search aria-hidden className="h-4 w-4" /> {loading ? "Running..." : "Run report"}</button>
          </form>

          <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-panel print:shadow-none">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{result?.definition.title ?? activeReport?.title ?? "Select a report"}</h3>
                <p className="text-sm text-ink/65">{result?.definition.description ?? activeReport?.description ?? "Choose a report from the catalog."}</p>
              </div>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field print:hidden" onClick={() => exportReport("csv")}>
                <Download aria-hidden className="h-4 w-4" /> CSV
              </button>
            </div>

            {result?.chart ? <BarChart chart={result.chart} /> : null}

            {result ? (
              <>
                <DataTable
                  rows={result.rows}
                  empty="No report rows found"
                  columns={result.definition.columns.map((column) => ({
                    key: column.key,
                    label: column.label,
                    render: (row) => formatValue(row[column.key], column.type)
                  }))}
                />
                <Totals totals={result.totals} columns={result.definition.columns} />
              </>
            ) : (
              <div className="rounded-md border border-dashed border-line p-8 text-center text-sm text-ink/60">Run a report to view analytics.</div>
            )}
          </section>
        </main>
      </div>
    </AppShell>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? ""} {option.name}</option>)}
      </select>
    </FormField>
  );
}

function BarChart({ chart }: { chart: NonNullable<ReportResult["chart"]> }) {
  const max = Math.max(...chart.values, 1);
  return (
    <div className="mb-6 rounded-md border border-line bg-field/40 p-4">
      <h4 className="mb-4 text-sm font-semibold">{chart.title}</h4>
      <div className="space-y-2">
        {chart.labels.map((label, index) => (
          <div key={`${label}-${index}`} className="grid grid-cols-[140px_minmax(0,1fr)_90px] items-center gap-3 text-xs">
            <span className="truncate text-ink/70">{label}</span>
            <div className="h-3 rounded-sm bg-line"><div className="h-3 rounded-sm bg-brand" style={{ width: `${Math.max(4, (chart.values[index] / max) * 100)}%` }} /></div>
            <strong className="text-right">{number(chart.values[index])}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Totals({ totals, columns }: { totals: Record<string, number>; columns: ReportDefinition["columns"] }) {
  const entries = columns.filter((column) => totals[column.key] !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {entries.map((column) => (
        <div key={column.key} className="rounded-md border border-line bg-field/50 p-3">
          <p className="text-xs text-ink/60">{column.label}</p>
          <strong className="mt-1 block text-sm">{formatValue(totals[column.key], column.type)}</strong>
        </div>
      ))}
    </div>
  );
}

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatValue(value: unknown, type?: string) {
  if (type === "money") return `GHS ${number(value)}`;
  if (type === "number" || type === "percent") return number(value);
  return String(value ?? "-");
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
