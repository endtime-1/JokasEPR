"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Factory,
  FlaskConical,
  Package,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Truck,
  TrendingUp,
  Warehouse,
  Zap
} from "lucide-react";
import { FeedMillShell } from "./feed-mill-shell";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  orderNumber: string;
  plannedQuantityKg: string | number;
  scheduledDate: string;
  status: string;
  formula?: { name: string; code: string };
};

type BatchRow = {
  id: string;
  batchNumber: string;
  status: string;
  producedQuantityKg: string | number;
  wastageKg: string | number;
  productionDate: string;
  productionSite?: { name: string; code: string };
  finishedProduct?: { name: string; sku: string };
  metrics?: { totalCost: number; expectedSalesValue: number; profitMargin: number };
};

type TrendPoint = { date: string; producedKg: number; wastageKg: number };
type StatRow = { status: string; count: number };

type DashboardData = {
  formulaCount: number;
  openOrders: number;
  pendingQualityChecks: number;
  totalProducedKg: number;
  totalFinishedKg: number;
  bag50KgCount: number;
  finishedValue: number;
  rawMaterialCost: number;
  wastageKg: number;
  productionProfitMargin: number;
  recentOrders: OrderRow[];
  recentBatches: BatchRow[];
  alerts: {
    stalledOrders: Array<{ id: string; orderNumber: string; status: string; scheduledDate: string; plannedQuantityKg: number; formula: { name: string; code: string } | null }>;
    pendingQC: number;
  };
  trends: { production: TrendPoint[] };
  formulaStats: StatRow[];
  orderStats: StatRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtGhs(n: number) {
  return `GHS ${fmt(n, 2)}`;
}

function buildTrend(raw: TrendPoint[], valueKey: "producedKg" | "wastageKg", days = 7) {
  const result: Array<{ label: string; value: number; date: string }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayBatches = raw.filter((r) => String(r.date).slice(0, 10) === dateStr);
    const value = dayBatches.reduce((s, r) => s + r[valueKey], 0);
    result.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }), date: dateStr, value });
  }
  return result;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT:       "bg-gray-100 text-gray-700",
    APPROVED:    "bg-blue-100 text-blue-800",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    COMPLETED:   "bg-emerald-100 text-emerald-800",
    CANCELLED:   "bg-red-100 text-red-700",
    POSTED:      "bg-emerald-100 text-emerald-800",
    ACTIVE:      "bg-emerald-100 text-emerald-800",
    ARCHIVED:    "bg-gray-100 text-gray-500",
    PENDING:     "bg-amber-100 text-amber-800",
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

function AlertBanner({ alerts }: { alerts: DashboardData["alerts"] }) {
  const total = alerts.stalledOrders.length + (alerts.pendingQC > 0 ? 1 : 0);
  if (total === 0) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <span className="text-sm font-bold text-amber-800">
          {total} attention item{total > 1 ? "s" : ""} require action
        </span>
      </div>
      <div className="divide-y divide-amber-50/80">
        {alerts.pendingQC > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{alerts.pendingQC}</span> quality check{alerts.pendingQC > 1 ? "s" : ""} pending review
              </span>
            </div>
            <Link href="/feed-production/quality-control"
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        {alerts.stalledOrders.map((o) => (
          <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{o.orderNumber}</span> — overdue {o.status.toLowerCase()} order
                {o.formula ? ` (${o.formula.name}, ${fmt(o.plannedQuantityKg)} kg)` : ""}
              </span>
            </div>
            <Link href="/feed-production/orders"
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              View order <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
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
  const gradId = `fm-tg-${label.replace(/\W/g, "")}`;

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

function RecentBatchCard({ batch }: { batch: BatchRow }) {
  const producedKg = Number(batch.producedQuantityKg);
  const wastageKg = Number(batch.wastageKg);
  const wastagePct = producedKg > 0 ? ((wastageKg / (producedKg + wastageKg)) * 100).toFixed(1) : "0.0";
  return (
    <Link
      href={`/feed-production/batches/${batch.id}`}
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
              {batch.finishedProduct?.name ?? "—"} · {batch.productionSite?.name ?? "—"}
            </p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10">
            <Factory className="h-4 w-4 text-brand" aria-hidden />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Produced</p>
          <p className="mt-0.5 text-xl font-extrabold text-ink">{fmt(producedKg)} kg</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Wastage</p>
          <p className={`mt-0.5 font-semibold ${Number(wastagePct) > 5 ? "text-red-700" : "text-ink"}`}>
            {fmt(wastageKg)} kg ({wastagePct}%)
          </p>
        </div>
        {batch.metrics && (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Total cost</p>
              <p className="mt-0.5 font-semibold text-ink">{fmtGhs(batch.metrics.totalCost)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Margin</p>
              <p className={`mt-0.5 font-semibold ${batch.metrics.profitMargin > 0 ? "text-emerald-700" : "text-red-700"}`}>
                {batch.metrics.profitMargin}%
              </p>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-line px-4 py-2.5 text-xs text-ink/40">
        {new Date(batch.productionDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
      </div>
    </Link>
  );
}

function QuickActions() {
  const actions = [
    { href: "/feed-production/formulas",              label: "New Formula",    icon: FlaskConical, color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/feed-production/orders/create",         label: "New Order",      icon: ClipboardList, color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/feed-production/quality-control",       label: "QC Check",       icon: CheckCircle2, color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/feed-production/finished-feed-inventory", label: "Finished Stock", icon: Warehouse,   color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/feed-production/raw-material-usage",    label: "Raw Materials",  icon: Package,      color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/feed-production/internal-transfer",     label: "Transfer Feed",  icon: Truck,        color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" },
    { href: "/feed-production/orders",                label: "View Orders",    icon: ShoppingCart, color: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
    { href: "/feed-production/reports",               label: "Reports",        icon: BarChart3,    color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" }
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function FeedMillDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/feed-production/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed mill data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totalAlertCount = (data?.alerts.stalledOrders.length ?? 0) + ((data?.alerts.pendingQC ?? 0) > 0 ? 1 : 0);
  const productionTrend = buildTrend(data?.trends.production ?? [], "producedKg");
  const wastageTrend = buildTrend(data?.trends.production ?? [], "wastageKg");
  const formulaTotal = (data?.formulaStats ?? []).reduce((s, r) => s + r.count, 0);
  const orderTotal = (data?.orderStats ?? []).reduce((s, r) => s + r.count, 0);

  return (
    <FeedMillShell>
      {/* Premium hero header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Feed Mill
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Feed Mill Operations
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Formula management, production scheduling, quality control, and stock performance
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="app-button-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {data && <AlertBanner alerts={data.alerts} />}

      {/* KPI Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Produced (all time)" value={`${fmt(data?.totalProducedKg ?? 0)} kg`} sub={`${fmt(data?.bag50KgCount ?? 0)} × 50 kg bags`} icon={Factory} color="blue" href="/feed-production/reports" />
        <KpiCard label="Finished Stock" value={`${fmt(data?.totalFinishedKg ?? 0)} kg`} sub={`Value: ${fmtGhs(data?.finishedValue ?? 0)}`} icon={Warehouse} color={(data?.totalFinishedKg ?? 0) > 0 ? "green" : "default"} href="/feed-production/finished-feed-inventory" />
        <KpiCard label="Open Orders" value={String(data?.openOrders ?? 0)} sub="Draft, Approved, In Progress" icon={ClipboardList} color={(data?.openOrders ?? 0) > 0 ? "amber" : "default"} href="/feed-production/orders" />
        <KpiCard label="Attention Items" value={String(totalAlertCount)} sub={totalAlertCount > 0 ? "Requires action" : "All clear"} icon={AlertTriangle} color={totalAlertCount > 0 ? "red" : "green"} />
      </section>

      {/* KPI Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Feed Formulas" value={String(data?.formulaCount ?? 0)} sub="All registered formulas" icon={FlaskConical} color="purple" href="/feed-production/formulas" />
        <KpiCard label="Raw Material Cost" value={fmtGhs(data?.rawMaterialCost ?? 0)} sub="All-time ingredient spend" icon={Package} />
        <KpiCard label="Wastage" value={`${fmt(data?.wastageKg ?? 0)} kg`} sub="Total production wastage" icon={PackageCheck} color={(data?.wastageKg ?? 0) > 1000 ? "red" : "default"} />
        <KpiCard label="Profit Margin" value={`${data?.productionProfitMargin ?? 0}%`} sub="Expected vs. actual cost" icon={TrendingUp} color={(data?.productionProfitMargin ?? 0) > 10 ? "green" : (data?.productionProfitMargin ?? 0) > 0 ? "amber" : "red"} />
      </section>

      {/* SVG Trend Charts */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <TrendChart points={productionTrend} color="#3b82f6" label="7-Day Production Output" unit=" kg" />
        <TrendChart points={wastageTrend} color="#ef4444" label="7-Day Wastage" unit=" kg" />
      </section>

      <QuickActions />

      {/* Status Breakdowns */}
      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <StatusBreakdown title="Formula Status" stats={data?.formulaStats ?? []} total={formulaTotal} href="/feed-production/formulas" />
        <StatusBreakdown title="Order Status" stats={data?.orderStats ?? []} total={orderTotal} href="/feed-production/orders" />
      </section>

      {/* Recent Batches */}
      {(data?.recentBatches ?? []).length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">Recent Production Batches</h3>
              <p className="text-xs text-ink/40">{data?.recentBatches.length} most recent</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.recentBatches ?? []).map((batch) => (
              <RecentBatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Orders Table */}
      {(data?.recentOrders ?? []).length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">Recent Production Orders</h3>
              <p className="text-xs text-ink/40">Latest scheduled and in-progress orders</p>
            </div>
            <Link href="/feed-production/orders" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Order #</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Formula</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Qty (kg)</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Scheduled</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(data?.recentOrders ?? []).map((order) => (
                  <tr key={order.id} className="transition hover:bg-field/50">
                    <td className="px-4 py-2.5 font-bold">{order.orderNumber}</td>
                    <td className="px-4 py-2.5 text-ink/70">{order.formula?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmt(Number(order.plannedQuantityKg))}</td>
                    <td className="px-4 py-2.5 text-ink/60">
                      {new Date(order.scheduledDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pending QC — shown only in AlertBanner above, so this duplicate section is removed */}
      {(data?.alerts.pendingQC ?? 0) > 0 && (
        <div className="mb-8 flex items-center justify-between overflow-hidden rounded-2xl border border-blue-200 border-l-[3px] border-l-blue-500 bg-blue-50/60 px-5 py-3.5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100">
              <Zap className="h-4 w-4 text-blue-600" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-blue-800">
              {data?.alerts.pendingQC} quality check{(data?.alerts.pendingQC ?? 0) > 1 ? "s" : ""} awaiting sign-off
            </span>
          </div>
          <Link href="/feed-production/quality-control"
            className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100">
            Go to QC <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </FeedMillShell>
  );
}
