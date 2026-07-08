"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChartBar,
  CircleCheckBig,
  ClipboardList,
  Factory,
  Package,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingUp,
  Truck,
  Zap
} from "lucide-react";
import { MarketPlanningShell } from "./market-planning-shell";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type TargetRow = { id: string; targetNumber: string; title: string; period: string; status: string; periodStart: string; periodEnd: string; targetKg?: number; itemCount?: number };
type PlanRow = { id: string; planNumber: string; status: string; totalPlannedKg: string | number; producedQuantityKg?: number; createdAt: string };
type MrpRow = { id: string; mrpNumber: string; status: string; totalRequiredKg: string | number; totalAvailableKg: string | number; totalShortageKg: string | number };
type StatRow = { status: string; count: number };
type ShortageAlert = { id: string; mrpNumber: string; totalShortageKg: number; status: string };

type DashboardData = {
  currentWeekTarget: TargetRow | null;
  adjustedTarget: number;
  targetKg: number;
  requiredRawMaterials: number;
  availableRawMaterials: number;
  shortageMaterials: number;
  procurementPending: number;
  productionPending: number;
  productionCompleted: number;
  finishedGoodsInventory: number;
  salesAchieved: number;
  targetAchievementPercentage: number;
  recentTargets: TargetRow[];
  recentPlans: PlanRow[];
  recentMrps: MrpRow[];
  alerts: { openShortages: ShortageAlert[]; procurementPendingCount: number };
  targetStats: StatRow[];
  planStats: StatRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtGhs(n: number) {
  return `GHS ${fmt(n, 2)}`;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT:              "bg-gray-100 text-gray-700",
    PENDING_APPROVAL:   "bg-blue-100 text-blue-800",
    READY_FOR_APPROVAL: "bg-blue-100 text-blue-800",
    APPROVED:           "bg-emerald-100 text-emerald-800",
    BLOCKED:            "bg-red-100 text-red-700",
    IN_PROGRESS:        "bg-amber-100 text-amber-800",
    COMPLETED:          "bg-emerald-100 text-emerald-800",
    CANCELLED:          "bg-gray-100 text-gray-500",
    OPEN:               "bg-amber-100 text-amber-800",
    CONVERTED:          "bg-purple-100 text-purple-800"
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

const ACTIVE_TARGET_STATUSES = new Set(["APPROVED", "IN_PROGRESS", "OPEN", "PENDING_APPROVAL", "READY_FOR_APPROVAL", "DRAFT"]);

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

function AlertBanner({ alerts, shortageMaterials }: {
  alerts: DashboardData["alerts"]; shortageMaterials: number;
}) {
  const total = alerts.openShortages.length + (alerts.procurementPendingCount > 0 ? 1 : 0);
  if (total === 0 && shortageMaterials === 0) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <span className="text-sm font-bold text-amber-800">
          {total > 0 ? `${total} attention item${total > 1 ? "s" : ""} require action` : "Raw material shortages detected"}
        </span>
      </div>
      <div className="divide-y divide-amber-50/80">
        {alerts.procurementPendingCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{alerts.procurementPendingCount}</span> open procurement recommendation{alerts.procurementPendingCount > 1 ? "s" : ""} awaiting action
              </span>
            </div>
            <Link href="/market-planning/recommendations"
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        {alerts.openShortages.map((shortage) => (
          <div key={shortage.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{shortage.mrpNumber}</span> — raw material shortage of{" "}
                <span className="font-bold text-red-700">{fmt(shortage.totalShortageKg)} kg</span>
              </span>
            </div>
            <Link href="/market-planning/mrp"
              className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              View MRP <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function TargetAchievementGauge({ pct }: { pct: number }) {
  const capped = Math.min(pct, 100);
  const color = pct >= 90 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-700";
  const barColor = pct >= 90 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="app-card p-4">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">Target Achievement</p>
      <p className={`text-[28px] font-extrabold leading-none tracking-tight ${color}`}>{fmt(pct, 1)}%</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${capped}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-ink/40">Production vs. target volume</p>
    </div>
  );
}

function MaterialCoverage({ required, available }: { required: number; available: number }) {
  const pct = required > 0 ? (available / required) * 100 : 100;
  const shortage = Math.max(0, required - available);
  const color = pct >= 100 ? "bg-emerald-400" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  const textColor = pct >= 100 ? "text-emerald-700" : pct >= 70 ? "text-amber-700" : "text-red-700";
  return (
    <div className="app-card p-4">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/40">Raw Material Coverage</p>
      <p className={`text-[28px] font-extrabold leading-none tracking-tight ${textColor}`}>
        {fmt(Math.min(pct, 100), 1)}%
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {shortage > 0 ? (
        <p className="mt-2 text-[11px] font-semibold text-red-600">Shortage: {fmt(shortage)} kg required</p>
      ) : (
        <p className="mt-2 text-[11px] text-ink/40">Sufficient for planned production</p>
      )}
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
            <span className={`min-w-[110px] rounded-full px-2 py-0.5 text-center text-[10px] font-bold ${statusColor(row.status)}`}>
              {row.status.replace(/_/g, " ")}
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

function RecentTargetCard({ target }: { target: TargetRow }) {
  const start = new Date(target.periodStart).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
  const end = new Date(target.periodEnd).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
  return (
    <Link
      href={`/market-planning/targets/${target.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="border-b border-line bg-gradient-to-r from-white to-field/60 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-ink">{target.targetNumber}</h4>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(target.status)}`}>{target.status}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink/55">{target.title}</p>
          </div>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10">
            <Target className="h-4 w-4 text-brand" aria-hidden />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Period</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{target.period}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Target kg</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{fmt(target.targetKg ?? 0)}</p>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-ink/35">{start} — {end}</div>
    </Link>
  );
}

function QuickActions() {
  const actions = [
    { href: "/market-planning/targets/create-weekly",         label: "Weekly Target",    icon: Target,        color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/market-planning/targets/create-monthly",        label: "Monthly Target",   icon: ClipboardList, color: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
    { href: "/market-planning/mrp",                          label: "Run MRP",           icon: Package,       color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/market-planning/availability",                  label: "Check Availability", icon: CircleCheckBig, color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/market-planning/recommendations",               label: "Recommendations",  icon: ShoppingCart,  color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/market-planning/production-plans",              label: "Production Plans", icon: Factory,       color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/market-planning/execution",                     label: "Execution",        icon: Truck,         color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" },
    { href: "/market-planning/reports/target-vs-actual",      label: "Reports",          icon: ChartBar,     color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" }
  ];
  return (
    <section className="mb-8">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-ink">Quick Actions</h3>
        <p className="text-xs text-ink/40">Jump to any planning or reporting screen</p>
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

export function MarketPlanningDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/market-planning/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market planning data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const targetTotal = (data?.targetStats ?? []).reduce((s, r) => s + r.count, 0);
  const planTotal = (data?.planStats ?? []).reduce((s, r) => s + r.count, 0);
  const totalAlerts = (data?.alerts.openShortages.length ?? 0) + ((data?.alerts.procurementPendingCount ?? 0) > 0 ? 1 : 0);
  const achievePct = data?.targetAchievementPercentage ?? 0;

  const activeWeekTarget = data?.currentWeekTarget && ACTIVE_TARGET_STATUSES.has(data.currentWeekTarget.status)
    ? data.currentWeekTarget
    : null;

  return (
    <MarketPlanningShell>
      {/* Premium hero header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Market Planning
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Market-Led Production Planning
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Plan feed production from approved demand targets — MRP, procurement, production, and fulfilment in one view
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="app-button-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {data && <AlertBanner alerts={data.alerts} shortageMaterials={data.shortageMaterials} />}

      {/* Active week target banner */}
      {activeWeekTarget && (
        <div className="mb-6 flex items-center justify-between overflow-hidden rounded-2xl border border-blue-200 border-l-[3px] border-l-blue-500 bg-blue-50/60 px-5 py-3.5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-100">
              <Zap className="h-4 w-4 text-blue-600" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-blue-800">
                Active: {activeWeekTarget.targetNumber} — {activeWeekTarget.title}
              </p>
              <p className="text-xs text-blue-600">{activeWeekTarget.period} · {activeWeekTarget.status}</p>
            </div>
          </div>
          <Link href={`/market-planning/targets/${activeWeekTarget.id}`}
            className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100">
            View target <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* KPI Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Target Volume" value={`${fmt(data?.targetKg ?? 0)} kg`} sub={`${fmt(data?.adjustedTarget ?? 0)} adjusted bags`} icon={Target} color="blue" href="/market-planning/targets" />
        <KpiCard label="Required Raw Materials" value={`${fmt(data?.requiredRawMaterials ?? 0)} kg`} sub="Across all MRP checks" icon={Package} color={(data?.shortageMaterials ?? 0) > 0 ? "red" : "default"} href="/market-planning/mrp" />
        <KpiCard label="Production Pending" value={String(data?.productionPending ?? 0)} sub={`${data?.productionCompleted ?? 0} completed`} icon={Factory} color={(data?.productionPending ?? 0) > 0 ? "amber" : "green"} href="/market-planning/production-plans" />
        <KpiCard label="Attention Items" value={String(totalAlerts)} sub={totalAlerts > 0 ? "Requires action" : "All clear"} icon={AlertTriangle} color={totalAlerts > 0 ? "red" : "green"} />
      </section>

      {/* KPI Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Finished Goods Stock" value={`${fmt(data?.finishedGoodsInventory ?? 0)} kg`} sub="Ready for dispatch" icon={TrendingUp} color="teal" />
        <KpiCard label="Sales Achieved" value={`${fmt(data?.salesAchieved ?? 0)} kg`} sub="Market-linked orders" icon={ShoppingCart} color="green" href="/market-planning/reports/demand-vs-sales" />
        <KpiCard label="Procurement Pending" value={String(data?.procurementPending ?? 0)} sub="Open recommendations" icon={Truck} color={(data?.procurementPending ?? 0) > 0 ? "amber" : "default"} href="/market-planning/recommendations" />
        <KpiCard label="Shortage Materials" value={`${fmt(data?.shortageMaterials ?? 0)} kg`} sub="Total across MRP checks" icon={Package} color={(data?.shortageMaterials ?? 0) > 0 ? "red" : "green"} href="/market-planning/mrp" />
      </section>

      {/* Achievement + Coverage + Status Breakdowns */}
      <section className="mb-8 grid gap-4 lg:grid-cols-4">
        <TargetAchievementGauge pct={achievePct} />
        <MaterialCoverage required={data?.requiredRawMaterials ?? 0} available={data?.availableRawMaterials ?? 0} />
        <StatusBreakdown title="Target Status" stats={data?.targetStats ?? []} total={targetTotal} href="/market-planning/targets" />
        <StatusBreakdown title="Plan Status" stats={data?.planStats ?? []} total={planTotal} href="/market-planning/production-plans" />
      </section>

      <QuickActions />

      {/* Recent Targets */}
      {(data?.recentTargets ?? []).length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">Recent Market Targets</h3>
              <p className="text-xs text-ink/40">Latest weekly and monthly targets</p>
            </div>
            <Link href="/market-planning/targets" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(data?.recentTargets ?? []).slice(0, 4).map((t) => (
              <RecentTargetCard key={t.id} target={t} />
            ))}
          </div>
        </section>
      )}

      {/* Recent MRP Checks */}
      {(data?.recentMrps ?? []).length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">Recent MRP Checks</h3>
              <p className="text-xs text-ink/40">Material requirements and shortage analysis</p>
            </div>
            <Link href="/market-planning/mrp" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">MRP #</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Required kg</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Available kg</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Shortage kg</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(data?.recentMrps ?? []).slice(0, 6).map((mrp) => (
                  <tr key={mrp.id} className="transition hover:bg-field/50">
                    <td className="px-4 py-2.5 font-bold">{mrp.mrpNumber}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(Number(mrp.totalRequiredKg))}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(Number(mrp.totalAvailableKg))}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${Number(mrp.totalShortageKg) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {fmt(Number(mrp.totalShortageKg))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(mrp.status)}`}>
                        {mrp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </MarketPlanningShell>
  );
}
