"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileBarChart, Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "./ui";
import { ApiEnvelope, apiFetch } from "../lib/api";

type Kpi = { label: string; value: string; tone?: "good" | "warning" | "critical" | "neutral" };
type ChartCfg = { title: string; kind: "line" | "bar"; xKey: string; series: { key: string; name: string; color?: string }[]; data: (d: any) => Record<string, string | number>[] };
type ModuleCfg = {
  title: string;
  endpoint: string;
  reportModule: string;
  kpis: (d: any) => Kpi[];
  charts: ChartCfg[];
};

const N = (v: unknown, dp = 0) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: dp }).format(Number(v ?? 0));
const GHS = (v: unknown) => `GHS ${N(v)}`;

const CONFIG: Record<string, ModuleCfg> = {
  feed: {
    title: "Feed Mill Executive",
    endpoint: "/feed-production/dashboard",
    reportModule: "feed",
    kpis: (d) => [
      { label: "Produced (recent)", value: `${N(d.totalProducedKg)} kg` },
      { label: "Finished stock", value: `${N(d.bag50KgCount)} bags` },
      { label: "Open orders", value: N(d.openOrders), tone: d.openOrders > 0 ? "warning" : "neutral" },
      { label: "Pending QC", value: N(d.pendingQualityChecks), tone: d.pendingQualityChecks > 0 ? "warning" : "good" },
      { label: "Wastage", value: `${N(d.wastageKg)} kg` },
      { label: "Margin", value: `${d.productionProfitMargin ?? 0}%`, tone: "neutral" },
    ],
    charts: [
      {
        title: "Production, last 7 days (kg)",
        kind: "bar",
        xKey: "date",
        series: [{ key: "produced", name: "Produced" }, { key: "wastage", name: "Wastage", color: "#9A4526" }],
        data: (d) => (d.trends?.production ?? []).map((p: any) => ({ date: String(p.date).slice(5, 10), produced: Math.round(p.producedKg), wastage: Math.round(p.wastageKg) })),
      },
    ],
  },
  soya: {
    title: "Soya Executive",
    endpoint: "/soya-processing/dashboard",
    reportModule: "soya",
    kpis: (d) => [
      { label: "Beans received", value: `${N(d.beansReceivedKg)} kg` },
      { label: "Oil produced", value: `${N(d.oilProducedLitres)} L` },
      { label: "Cake produced", value: `${N(d.cakeProducedKg)} kg` },
      { label: "Oil yield", value: `${d.oilYieldPct ?? 0}%` },
      { label: "Waste", value: `${N(d.wasteKg)} kg`, tone: "neutral" },
      { label: "Pending QC", value: N(d.pendingQualityChecks), tone: d.pendingQualityChecks > 0 ? "warning" : "good" },
    ],
    charts: [
      {
        title: "Processing, last 7 days",
        kind: "bar",
        xKey: "date",
        series: [{ key: "oil", name: "Oil (L)", color: "#3C6E9F" }, { key: "cake", name: "Cake (kg)", color: "#2F6F6A" }, { key: "waste", name: "Waste (kg)", color: "#9A4526" }],
        data: (d) => (d.trends?.processing ?? []).map((p: any) => ({ date: String(p.date).slice(5, 10), oil: Math.round(p.oilLitres), cake: Math.round(p.cakeKg), waste: Math.round(p.wasteKg) })),
      },
    ],
  },
  inventory: {
    title: "Inventory Executive",
    endpoint: "/inventory/dashboard",
    reportModule: "inventory",
    kpis: (d) => [
      { label: "Stock value", value: GHS(d.inventoryValue) },
      { label: "SKUs", value: N(d.skuCount) },
      { label: "Low stock", value: N(d.lowStockCount), tone: d.lowStockCount > 0 ? "critical" : "good" },
      { label: "Expiring soon", value: N(d.expiryAlertCount), tone: d.expiryAlertCount > 0 ? "warning" : "good" },
      { label: "Transfers in transit", value: N(d.transfersInTransit), tone: d.transfersInTransit > 0 ? "warning" : "neutral" },
      { label: "Discrepancies", value: N(d.transferDiscrepancies), tone: d.transferDiscrepancies > 0 ? "critical" : "good" },
    ],
    charts: [
      {
        title: "Adjustments by status",
        kind: "bar",
        xKey: "status",
        series: [{ key: "count", name: "Count" }],
        data: (d) => (d.adjustmentStats ?? []).map((s: any) => ({ status: String(s.status).replace(/_/g, " "), count: s.count })),
      },
    ],
  },
  finance: {
    title: "Finance Executive",
    endpoint: "/finance/dashboard",
    reportModule: "sales",
    kpis: (d) => [
      { label: "Revenue", value: GHS(d.totalRevenue), tone: "good" },
      { label: "Expenses", value: GHS(d.totalExpenses), tone: "warning" },
      { label: "Net profit", value: GHS(d.netProfit), tone: (d.netProfit ?? 0) >= 0 ? "good" : "critical" },
      { label: "Debtors (payable)", value: GHS(d.accountsPayable), tone: "warning" },
      { label: "Customer payments", value: GHS(d.totalCustomerPayments) },
      { label: "Pending approvals", value: N(d.pendingApprovals), tone: d.pendingApprovals > 0 ? "warning" : "good" },
    ],
    charts: [],
  },
};

export function ModuleExecutivePage({ module }: { module: keyof typeof CONFIG }) {
  const cfg = CONFIG[module];
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    apiFetch<ApiEnvelope<any>>(cfg.endpoint)
      .then((r) => setData(r.data))
      .catch((err: any) => setError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [module]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={cfg.title} description="Key numbers and trends for the business line." />
        <div className="flex gap-2">
          <Link href={`/reports?module=${cfg.reportModule}`} className="app-button-ghost"><FileBarChart className="h-4 w-4" /> Reports</Link>
          <button type="button" className="app-button-ghost" onClick={load}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {loading && !data && <div className="app-card flex items-center gap-2 p-8 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cfg.kpis(data).map((k) => (
              <div key={k.label} className="app-card p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">{k.label}</div>
                <div className={`text-lg font-extrabold leading-tight ${
                  k.tone === "critical" ? "text-red-600" : k.tone === "warning" ? "text-amber-700" : k.tone === "good" ? "text-emerald-700" : "text-ink"
                }`}>{k.value}</div>
              </div>
            ))}
          </div>

          {cfg.charts.map((c) => {
            const rows = c.data(data);
            return (
              <div key={c.title} className="app-card mb-5 p-4">
                <h4 className="mb-3 text-sm font-bold text-ink">{c.title}</h4>
                {rows.length === 0 ? (
                  <p className="text-sm text-ink/40">No data.</p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {c.kind === "line" ? (
                        <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                          <CartesianGrid strokeDasharray="4 5" stroke="#eadfd2" vertical={false} />
                          <XAxis dataKey={c.xKey} tick={{ fontSize: 10, fill: "#9a8e83" }} minTickGap={20} />
                          <YAxis tick={{ fontSize: 10, fill: "#9a8e83" }} width={48} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {c.series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? "#2F6F6A"} strokeWidth={2} dot={false} />)}
                        </LineChart>
                      ) : (
                        <BarChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                          <CartesianGrid strokeDasharray="4 5" stroke="#eadfd2" vertical={false} />
                          <XAxis dataKey={c.xKey} tick={{ fontSize: 10, fill: "#9a8e83" }} minTickGap={12} />
                          <YAxis tick={{ fontSize: 10, fill: "#9a8e83" }} width={48} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {c.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? "#2F6F6A"} radius={[3, 3, 0, 0]} />)}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
