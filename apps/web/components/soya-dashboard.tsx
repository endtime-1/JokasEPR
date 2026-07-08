"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChartBar,
  CircleCheckBig,
  Droplets,
  Factory,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Zap
} from "lucide-react";
import { SoyaProcessingShell } from "./soya-processing-shell";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type IntakeRow = {
  id: string;
  receiptNumber: string;
  supplierName: string;
  quantityKg: string | number;
  unitCost: string | number;
  qualityStatus: string;
  receivedAt: string;
  warehouse?: { name: string; code: string } | null;
  productionSite?: { name: string } | null;
};

type BatchRow = {
  id: string;
  batchNumber: string;
  status: string;
  processingDate: string;
  metrics?: { totalCost: number; expectedSalesValue: number; profitMargin: number };
  oilOutputs?: Array<{ quantityLitres: string | number }>;
  cakeOutputs?: Array<{ quantityKg: string | number }>;
  wasteRecords?: Array<{ quantityKg: string | number }>;
};

type TrendPoint = { date: string; oilLitres: number; cakeKg: number; wasteKg: number };
type StatRow = { status: string; count: number };

type DashboardData = {
  beansReceivedKg: number;
  beansReceivedCost: number;
  activeBatches: number;
  oilProducedLitres: number;
  cakeProducedKg: number;
  wasteKg: number;
  oilStockValue: number;
  cakeStockValue: number;
  pendingQualityChecks: number;
  externalSalesValue: number;
  profitabilityMargin: number;
  oilYieldPct: number;
  cakeYieldPct: number;
  recentBatches: BatchRow[];
  recentIntakes: IntakeRow[];
  trends: { processing: TrendPoint[] };
  batchStats: StatRow[];
  intakeStats: StatRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, decimals = 0) {
  return (n ?? 0).toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtGhs(n: number) {
  return `GHS ${fmt(n, 2)}`;
}

function buildTrend(raw: TrendPoint[], valueKey: "oilLitres" | "cakeKg" | "wasteKg", days = 7) {
  const result: Array<{ label: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayBatches = raw.filter((r) => String(r.date).slice(0, 10) === dateStr);
    result.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }), value: dayBatches.reduce((s, r) => s + r[valueKey], 0) });
  }
  return result;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT:       "bg-gray-100 text-gray-700",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    COMPLETED:   "bg-emerald-100 text-emerald-800",
    CANCELLED:   "bg-red-100 text-red-700",
    PENDING:     "bg-amber-100 text-amber-800",
    APPROVED:    "bg-emerald-100 text-emerald-800",
    REJECTED:    "bg-red-100 text-red-700",
    PASSED:      "bg-emerald-100 text-emerald-800",
    FAILED:      "bg-red-100 text-red-700"
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type KpiColor = "default" | "green" | "red" | "amber" | "blue" | "purple" | "teal";

function KpiCard({
  label, value, sub, icon: Icon, color = "default", href
}: {
  label: string; value: string; sub?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any; color?: KpiColor; href?: string;
}) {
  const styles: Record<KpiColor, { wrap: string; icon: string; dot: string; val: string }> = {
    default: { wrap: "from-white border-line",           icon: "bg-brand/10 text-brand",         dot: "bg-brand",       val: "text-ink" },
    green:   { wrap: "from-emerald-50 border-emerald-200", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-400", val: "text-emerald-700" },
    red:     { wrap: "from-red-50 border-red-200",       icon: "bg-red-100 text-red-600",        dot: "bg-red-400",     val: "text-red-700" },
    amber:   { wrap: "from-amber-50 border-amber-200",   icon: "bg-amber-100 text-amber-600",    dot: "bg-amber-400",   val: "text-caution" },
    blue:    { wrap: "from-blue-50 border-blue-200",     icon: "bg-blue-100 text-blue-600",      dot: "bg-blue-400",    val: "text-blue-700" },
    purple:  { wrap: "from-purple-50 border-purple-200", icon: "bg-purple-100 text-purple-600",  dot: "bg-purple-400",  val: "text-purple-700" },
    teal:    { wrap: "from-teal-50 border-teal-200",     icon: "bg-teal-100 text-teal-600",      dot: "bg-teal-400",    val: "text-teal-700" }
  };
  const s = styles[color];
  const inner = (
    <article className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft`}>
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm ${s.icon}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <span className={`h-2 w-2 rounded-full ${s.dot} mt-0.5 opacity-70`} />
      </div>
      <strong className={`mt-4 block text-[26px] font-extrabold leading-none tracking-tight ${s.val}`}>
        {value}
      </strong>
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink/50 leading-snug">{label}</p>
      {sub && <p className="mt-1 truncate text-xs text-ink/40">{sub}</p>}
    </article>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function AlertBanner({ pendingQC }: { pendingQC: number }) {
  if (pendingQC === 0) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <span className="text-sm font-bold text-amber-800">
          {pendingQC} quality check{pendingQC > 1 ? "s" : ""} pending review
        </span>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-sm text-ink/70">
            <span className="font-bold text-ink">{pendingQC}</span> soya processing QC check{pendingQC > 1 ? "s" : ""} awaiting sign-off
          </span>
        </div>
        <Link href="/soya-processing/quality-control"
          className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
          Review now <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

function TrendChart({ points, color, label, unit = "" }: {
  points: Array<{ label: string; value: number }>;
  color: string;
  label: string;
  unit?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const total = points.reduce((s, p) => s + p.value, 0);
  const W = 500, PL = 10, PB = 72, PT = 8;
  const chartW = W - PL - 10;
  const chartH = PB - PT;
  const pts = points.map((p, i) => ({
    x: PL + (i / Math.max(points.length - 1, 1)) * chartW,
    y: PB - (p.value / max) * chartH
  }));
  const ptStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const gradId = `soya-tg-${label.replace(/\W/g, "")}`;

  return (
    <div className="app-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h4 className="text-sm font-bold text-ink">{label}</h4>
        <span className="text-xs font-semibold text-ink/40">7-day: {fmt(total)}{unit}</span>
      </div>
      <div className="px-4 pb-3 pt-4">
        <svg viewBox={`0 0 ${W} ${PB + 18}`} className="h-28 w-full" aria-label={label}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0.5, 1].map((t) => (
            <line key={t} x1={PL} y1={PB - t * chartH} x2={W - 10} y2={PB - t * chartH}
              stroke="#eadfd2" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          <line x1={PL} y1={PB} x2={W - 10} y2={PB} stroke="#eadfd2" strokeWidth="1.5" />
          {pts.length > 1 && (
            <>
              <polygon points={`${pts[0].x},${PB} ${ptStr} ${pts[pts.length - 1].x},${PB}`} fill={`url(#${gradId})`} />
              <polyline points={ptStr} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke={color} strokeWidth="2" />)}
            </>
          )}
        </svg>
        <div className="mt-1 flex justify-between">
          {points.map((p, i) => <span key={i} className="text-[10px] text-ink/35">{p.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function StatusBreakdown({ title, stats, total, href }: {
  title: string; stats: StatRow[]; total: number; href: string;
}) {
  const sorted = [...stats].sort((a, b) => b.count - a.count);
  return (
    <div className="app-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink">{title}</h4>
        <Link href={href} className="text-xs font-semibold text-brand hover:underline">View all →</Link>
      </div>
      <div className="space-y-3">
        {sorted.map((row) => (
          <div key={row.status} className="flex items-center gap-2">
            <span className={`min-w-[90px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${statusColor(row.status)}`}>
              {row.status}
            </span>
            <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 6 }}>
              <div className="h-full rounded-full bg-brand/50 transition-all duration-700"
                style={{ width: total > 0 ? `${(row.count / total) * 100}%` : "0%" }} />
            </div>
            <span className="w-6 text-right text-xs font-extrabold text-ink">{row.count}</span>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-xs text-ink/40">No data yet</p>}
      </div>
    </div>
  );
}

function YieldPanel({ oilYieldPct, cakeYieldPct, beansKg }: {
  oilYieldPct: number; cakeYieldPct: number; beansKg: number;
}) {
  const lossPercent = Math.max(0, Math.round((100 - oilYieldPct - cakeYieldPct) * 10) / 10);
  return (
    <div className="app-card p-4">
      <h4 className="mb-4 text-sm font-bold text-ink">Processing Efficiency</h4>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-ink/60">Oil Yield</span>
            <span className="font-bold text-teal-700">{oilYieldPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-teal-400 transition-all duration-700" style={{ width: `${Math.min(oilYieldPct, 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-ink/60">Cake Yield</span>
            <span className="font-bold text-amber-700">{cakeYieldPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${Math.min(cakeYieldPct, 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-ink/60">Waste / Loss</span>
            <span className={`font-bold ${lossPercent > 10 ? "text-red-600" : "text-ink/55"}`}>{lossPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full transition-all duration-700 ${lossPercent > 10 ? "bg-red-400" : "bg-line"}`}
              style={{ width: `${Math.min(lossPercent, 100)}%` }} />
          </div>
        </div>
        <p className="text-[11px] text-ink/40">Based on {fmt(beansKg)} kg beans processed</p>
      </div>
    </div>
  );
}

function RecentBatchCard({ batch }: { batch: BatchRow }) {
  const oilLitres = (batch.oilOutputs ?? []).reduce((s, o) => s + Number(o.quantityLitres), 0);
  const cakeKg = (batch.cakeOutputs ?? []).reduce((s, c) => s + Number(c.quantityKg), 0);
  const wasteKg = (batch.wasteRecords ?? []).reduce((s, w) => s + Number(w.quantityKg), 0);
  return (
    <Link
      href={`/soya-processing/batches/${batch.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="border-b border-line bg-gradient-to-r from-white to-field/60 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-ink">{batch.batchNumber}</h4>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(batch.status)}`}>{batch.status}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink/55">
              {new Date(batch.processingDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50">
            <Factory className="h-4 w-4 text-teal-600" aria-hidden />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Oil</p>
          <p className="mt-0.5 font-bold text-teal-700">{fmt(oilLitres)} L</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Cake</p>
          <p className="mt-0.5 font-bold text-amber-700">{fmt(cakeKg)} kg</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Waste</p>
          <p className={`mt-0.5 font-bold ${wasteKg > 50 ? "text-red-700" : "text-ink/55"}`}>{fmt(wasteKg)} kg</p>
        </div>
      </div>
      {batch.metrics && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs">
          <span className="text-ink/45">Cost: {fmtGhs(batch.metrics.totalCost)}</span>
          <span className={`font-bold ${batch.metrics.profitMargin > 0 ? "text-emerald-700" : "text-red-700"}`}>
            {batch.metrics.profitMargin}% margin
          </span>
        </div>
      )}
    </Link>
  );
}

function QuickActions() {
  const actions = [
    { href: "/soya-processing/intakes/create",   label: "Record Intake", icon: Package,      color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/soya-processing/batches/create",   label: "New Batch",     icon: Factory,      color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/soya-processing/quality-control",  label: "QC Check",      icon: CircleCheckBig, color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/soya-processing/oil-stock",        label: "Oil Stock",     icon: Droplets,     color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" },
    { href: "/soya-processing/cake-stock",       label: "Cake Stock",    icon: Package,      color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/soya-processing/internal-transfer", label: "Transfer",     icon: Truck,        color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/soya-processing/batches",          label: "All Batches",   icon: TrendingUp,   color: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
    { href: "/soya-processing/reports",          label: "Reports",       icon: ChartBar,    color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" }
  ];
  return (
    <section className="mb-8">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-ink">Quick Entry</h3>
        <p className="text-xs text-ink/40">Jump to any data entry screen</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow ${a.color}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {a.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RecentIntakesTable({ intakes }: { intakes: IntakeRow[] }) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Recent Bean Intakes</h3>
          <p className="text-xs text-ink/40">Latest soyabean receipts from suppliers</p>
        </div>
        <Link href="/soya-processing/intakes" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left">
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Receipt #</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Supplier</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Qty (kg)</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Unit Cost</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Status</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {intakes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink/40">No intakes recorded yet.</td>
              </tr>
            )}
            {intakes.map((row) => (
              <tr key={row.id} className="transition hover:bg-field/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold">{row.receiptNumber}</td>
                <td className="px-4 py-3 font-medium">{row.supplierName}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(Number(row.quantityKg))}</td>
                <td className="px-4 py-3 text-right text-ink/60">{fmtGhs(Number(row.unitCost))}</td>
                <td className="px-4 py-3 text-xs text-ink/60">{row.warehouse?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(row.qualityStatus)}`}>
                    {row.qualityStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink/50">
                  {new Date(row.receivedAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function SoyaDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/soya-processing/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load soya processing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const oilTrend = buildTrend(data?.trends.processing ?? [], "oilLitres");
  const cakeTrend = buildTrend(data?.trends.processing ?? [], "cakeKg");
  const wasteTrend = buildTrend(data?.trends.processing ?? [], "wasteKg");
  const batchTotal = (data?.batchStats ?? []).reduce((s, r) => s + r.count, 0);
  const intakeTotal = (data?.intakeStats ?? []).reduce((s, r) => s + r.count, 0);
  const totalStockValue = (data?.oilStockValue ?? 0) + (data?.cakeStockValue ?? 0);

  return (
    <SoyaProcessingShell>
      {/* Premium hero header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Soya Processing
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Soya Processing Operations
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Bean intake, processing batches, oil and cake yields, quality, stock, and profitability
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="app-button-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {data && <AlertBanner pendingQC={data.pendingQualityChecks} />}

      {/* KPI Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Beans Received" value={`${fmt(data?.beansReceivedKg ?? 0)} kg`} sub={`Cost: ${fmtGhs(data?.beansReceivedCost ?? 0)}`} icon={Package} color="blue" href="/soya-processing/intakes" />
        <KpiCard label="Oil Produced" value={`${fmt(data?.oilProducedLitres ?? 0)} L`} sub={`Yield: ${data?.oilYieldPct ?? 0}% of beans`} icon={Droplets} color="teal" href="/soya-processing/oil-stock" />
        <KpiCard label="Cake Produced" value={`${fmt(data?.cakeProducedKg ?? 0)} kg`} sub={`Yield: ${data?.cakeYieldPct ?? 0}% of beans`} icon={Package} color="amber" href="/soya-processing/cake-stock" />
        <KpiCard label="Active Batches" value={String(data?.activeBatches ?? 0)} sub="Recent processing runs" icon={Factory} color={(data?.activeBatches ?? 0) > 0 ? "green" : "default"} href="/soya-processing/batches" />
      </section>

      {/* KPI Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Stock Value" value={fmtGhs(totalStockValue)} sub="Oil + cake combined" icon={TrendingUp} color="purple" />
        <KpiCard label="External Sales" value={fmtGhs(data?.externalSalesValue ?? 0)} sub="All-time sales revenue" icon={ShoppingCart} color="green" />
        <KpiCard label="Wastage" value={`${fmt(data?.wasteKg ?? 0)} kg`} sub="Total processing waste" icon={Zap} color={(data?.wasteKg ?? 0) > 500 ? "red" : "default"} />
        <KpiCard label="Profit Margin" value={`${data?.profitabilityMargin ?? 0}%`} sub="Expected vs. cost" icon={TrendingUp} color={(data?.profitabilityMargin ?? 0) > 10 ? "green" : (data?.profitabilityMargin ?? 0) > 0 ? "amber" : "red"} />
      </section>

      {/* SVG Trend Charts */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <TrendChart points={oilTrend} color="#14b8a6" label="7-Day Oil Output" unit=" L" />
        <TrendChart points={cakeTrend} color="#f59e0b" label="7-Day Cake Output" unit=" kg" />
        <TrendChart points={wasteTrend} color="#ef4444" label="7-Day Waste" unit=" kg" />
      </section>

      {/* Analytics Row: Status Breakdowns + Yield Efficiency */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <StatusBreakdown title="Batch Status" stats={data?.batchStats ?? []} total={batchTotal} href="/soya-processing/batches" />
        <StatusBreakdown title="Intake Quality" stats={data?.intakeStats ?? []} total={intakeTotal} href="/soya-processing/intakes" />
        <YieldPanel oilYieldPct={data?.oilYieldPct ?? 0} cakeYieldPct={data?.cakeYieldPct ?? 0} beansKg={data?.beansReceivedKg ?? 0} />
      </section>

      <RecentIntakesTable intakes={data?.recentIntakes ?? []} />

      {/* Recent Processing Batches */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Recent Processing Batches</h3>
            <p className="text-xs text-ink/40">Latest batch runs with yield and margin data</p>
          </div>
          <Link href="/soya-processing/batches" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.recentBatches ?? []).slice(0, 4).map((b) => <RecentBatchCard key={b.id} batch={b} />)}
          {(data?.recentBatches ?? []).length === 0 && (
            <p className="col-span-4 text-sm text-ink/40">No batches recorded yet.</p>
          )}
        </div>
      </section>

      <QuickActions />
    </SoyaProcessingShell>
  );
}
