"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bird,
  CircleCheckBig,
  Egg,
  FlameKindling,
  Heart,
  Home,
  RefreshCw,
  Scale,
  ShoppingBag,
  Skull,
  TrendingDown,
  TrendingUp,
  Wheat,
  Zap
} from "lucide-react";
import { PoultryShell } from "./poultry-shell";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardSummary = {
  totalOpeningBirds: number;
  currentLiveBirds: number;
  activeBatches: number;
  totalBatches: number;
  totalEggs: number;
  totalFeedKg: number;
  totalCosts: number;
  totalProfitability: number;
};

type BatchRow = {
  id: string;
  code: string;
  name: string;
  birdType: string;
  status: string;
  openingBirdCount: number;
  currentLiveBirds: number;
  mortalityRate: number;
  eggProductionPercent: number;
  feedConversionRatio: number;
  costPerBird: number;
  profitability: number;
  totalEggs: number;
  totalFeedKg: number;
  totalCosts: number;
  hasTodayRecord: boolean;
  penCount: number;
  penCodes: string;
  startDate: string;
  farm?: { name: string; code: string };
  poultryHouse?: { name: string; code: string } | null;
};

type AlertData = {
  noTodayRecord: Array<{ id: string; code: string; name: string }>;
  highMortality: Array<{ id: string; code: string; name: string; mortalityRate: number }>;
  criticalHealth: Array<{ id: string; severity: string; observation: string; observationDate: string; flockBatch: { code: string; name: string } }>;
};

type TrendPoint = { date: string; total?: number; good?: number; count?: number; kg?: number };

type HouseData = {
  id: string;
  code: string;
  name: string;
  totalPens: number;
  occupiedPens: number;
  pens: Array<{ id: string; code: string; penNumber: number; isOccupied: boolean; activeBatch: { code: string; birdCount: number } | null }>;
};

type DashboardData = {
  summary: DashboardSummary;
  batches: BatchRow[];
  alerts: AlertData;
  trends: { eggs: TrendPoint[]; mortality: TrendPoint[]; feed: TrendPoint[] };
  houses: HouseData[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtGhs(n: number) {
  return `GHS ${fmt(n, 2)}`;
}

function buildTrend(raw: TrendPoint[], valueKey: "total" | "count" | "kg", days = 7) {
  const result: Array<{ label: string; value: number; date: string }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const found = raw.find((r) => String(r.date).slice(0, 10) === dateStr);
    result.push({
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: dateStr,
      value: found ? ((found[valueKey] as number) ?? 0) : 0
    });
  }
  return result;
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
    default: { wrap: "from-white border-line",           icon: "bg-brand/10 text-brand",         dot: "bg-brand",         val: "text-ink" },
    green:   { wrap: "from-emerald-50 border-emerald-200", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-400",   val: "text-emerald-700" },
    red:     { wrap: "from-red-50 border-red-200",       icon: "bg-red-100 text-red-600",        dot: "bg-red-400",       val: "text-red-700" },
    amber:   { wrap: "from-amber-50 border-amber-200",   icon: "bg-amber-100 text-amber-600",    dot: "bg-amber-400",     val: "text-caution" },
    blue:    { wrap: "from-blue-50 border-blue-200",     icon: "bg-blue-100 text-blue-600",      dot: "bg-blue-400",      val: "text-blue-700" },
    purple:  { wrap: "from-purple-50 border-purple-200", icon: "bg-purple-100 text-purple-600",  dot: "bg-purple-400",    val: "text-purple-700" },
    teal:    { wrap: "from-teal-50 border-teal-200",     icon: "bg-teal-100 text-teal-600",      dot: "bg-teal-400",      val: "text-teal-700" }
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

function AlertBanner({ alerts }: { alerts: AlertData }) {
  const total = alerts.noTodayRecord.length + alerts.highMortality.length + alerts.criticalHealth.length;
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
        {alerts.noTodayRecord.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{b.code}</span> — no daily record submitted today
              </span>
            </div>
            <Link href="/poultry/daily-records" className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              Record now <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
        {alerts.highMortality.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{b.code}</span> — mortality at{" "}
                <span className="font-bold text-red-700">{b.mortalityRate}%</span> (above 5% threshold)
              </span>
            </div>
            <Link href={`/poultry/batches/${b.id}`} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              View batch <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
        {alerts.criticalHealth.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className={`h-1.5 w-1.5 rounded-full ${h.severity === "CRITICAL" ? "bg-red-600" : "bg-orange-500"}`} />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{h.flockBatch.code}</span>{" "}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${h.severity === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                  {h.severity}
                </span>{" "}
                — {h.observation.slice(0, 80)}{h.observation.length > 80 ? "…" : ""}
              </span>
            </div>
            <Link href="/poultry/health-observations" className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

let _trendChartSeq = 0;
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
  // Use a module-level counter so each TrendChart instance gets a unique gradient
  // ID regardless of label text, preventing SVG defs collisions between charts.
  const [gradId] = useState(() => `tg-${++_trendChartSeq}`);

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

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    PLANNED: "bg-blue-100 text-blue-700",
    CLOSED: "bg-line text-ink/55",
    SOLD: "bg-purple-100 text-purple-700",
    CULLED: "bg-red-100 text-red-700"
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${map[status] ?? "bg-line text-ink/55"}`}>
      {status}
    </span>
  );
}

function MortalityIndicator({ rate }: { rate: number }) {
  if (rate > 10) return <span className="text-sm font-bold text-red-700">{rate}% ▲</span>;
  if (rate > 5) return <span className="text-sm font-bold text-amber-700">{rate}% ▲</span>;
  return <span className="text-sm font-semibold text-emerald-700">{rate}%</span>;
}

function ActiveBatchCard({ batch }: { batch: BatchRow }) {
  const daysSinceStart = Math.floor((Date.now() - new Date(batch.startDate).getTime()) / 86400000);
  return (
    <Link
      href={`/poultry/batches/${batch.id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="border-b border-line bg-gradient-to-r from-white to-field/60 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-extrabold text-ink">{batch.code}</h4>
              <BatchStatusBadge status={batch.status} />
              {!batch.hasTodayRecord && batch.status === "ACTIVE" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">No record today</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-ink/50">{batch.name}</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10">
            <Bird className="h-4 w-4 text-brand" aria-hidden />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Live birds</p>
          <p className="mt-0.5 text-xl font-extrabold text-ink">{fmt(batch.currentLiveBirds)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Mortality</p>
          <div className="mt-0.5"><MortalityIndicator rate={batch.mortalityRate} /></div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Egg production</p>
          <p className="mt-0.5 font-semibold text-ink">{batch.eggProductionPercent}%</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Cost / bird</p>
          <p className="mt-0.5 font-semibold text-ink">{fmtGhs(batch.costPerBird)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink/40">
        <span>{batch.birdType} · {batch.farm?.name ?? "—"}</span>
        <span className="font-semibold text-brand">Day {daysSinceStart} →</span>
      </div>
    </Link>
  );
}

function HouseOccupancyGrid({ houses }: { houses: HouseData[] }) {
  if (houses.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">House & Pen Occupancy</h3>
          <p className="text-xs text-ink/40">Live occupancy across all configured houses</p>
        </div>
        <Link href="/poultry/houses" className="text-xs font-semibold text-brand hover:underline">
          Manage houses →
        </Link>
      </div>
      <div className="space-y-3">
        {houses.map((house) => (
          <div key={house.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-white to-field/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
                  <Home className="h-3.5 w-3.5 text-brand" aria-hidden />
                </span>
                <span className="font-bold text-ink">{house.code} — {house.name}</span>
              </div>
              <span className="text-xs font-semibold text-ink/45">
                {house.occupiedPens}/{house.totalPens} pens occupied
              </span>
            </div>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {house.pens.map((pen) => (
                  <div
                    key={pen.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      pen.isOccupied
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-line bg-field/60 text-ink/35"
                    }`}
                    title={pen.activeBatch ? `${pen.activeBatch.code} — ${fmt(pen.activeBatch.birdCount)} birds` : "Empty"}
                  >
                    <span className="font-bold">{pen.code}</span>
                    {pen.activeBatch && (
                      <span className="ml-1 opacity-60">{pen.activeBatch.code}</span>
                    )}
                  </div>
                ))}
                {house.pens.length === 0 && (
                  <span className="text-xs text-ink/40">No pens configured</span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                  style={{ width: house.totalPens > 0 ? `${(house.occupiedPens / house.totalPens) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { href: "/poultry/daily-records", label: "Daily Record", icon: CircleCheckBig, color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/poultry/egg-production", label: "Egg Production", icon: Egg, color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/poultry/feed-consumption", label: "Feed Intake", icon: Wheat, color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/poultry/mortality", label: "Mortality", icon: Skull, color: "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" },
    { href: "/poultry/health-observations", label: "Health Obs.", icon: Heart, color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" },
    { href: "/poultry/bird-weight", label: "Bird Weight", icon: Scale, color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/poultry/medication", label: "Medication", icon: FlameKindling, color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/poultry/costs", label: "Record Cost", icon: ShoppingBag, color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" }
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
            <Link
              key={a.href}
              href={a.href}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow ${a.color}`}
            >
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

export function PoultryDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/poultry/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const s = data?.summary;
  const activeCount = s?.activeBatches ?? 0;
  const totalAlertCount =
    (data?.alerts.noTodayRecord.length ?? 0) +
    (data?.alerts.highMortality.length ?? 0) +
    (data?.alerts.criticalHealth.length ?? 0);
  const flockMortalityPct =
    s && s.totalOpeningBirds > 0
      ? (((s.totalOpeningBirds - s.currentLiveBirds) / s.totalOpeningBirds) * 100).toFixed(1)
      : "0.0";
  const occupancyPct = data?.houses.length
    ? Math.round(
        (data.houses.reduce((acc, h) => acc + h.occupiedPens, 0) /
          Math.max(data.houses.reduce((acc, h) => acc + h.totalPens, 0), 1)) * 100
      )
    : 0;

  const eggTrend = buildTrend(data?.trends.eggs ?? [], "total");
  const mortalityTrend = buildTrend(data?.trends.mortality ?? [], "count");
  const feedTrend = buildTrend(data?.trends.feed ?? [], "kg");

  const activeBatches = (data?.batches ?? []).filter((b) => b.status === "ACTIVE");
  const otherBatches = (data?.batches ?? []).filter((b) => b.status !== "ACTIVE");

  return (
    <PoultryShell>
      {/* Premium hero header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Poultry
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Poultry Operations
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Live flock intelligence, production metrics, and batch health across all farms
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="app-button-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
      </div>

      {error && (
        <div className="app-alert-warning mb-6">{error}</div>
      )}

      {/* Alert banner */}
      {data && <AlertBanner alerts={data.alerts} />}

      {/* KPI Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Current Live Birds" value={fmt(s?.currentLiveBirds ?? 0)} sub={`of ${fmt(s?.totalOpeningBirds ?? 0)} opening`} icon={Bird} color={s && s.currentLiveBirds < s.totalOpeningBirds * 0.9 ? "amber" : "green"} href="/poultry/batches" />
        <KpiCard label="Active Batches" value={String(activeCount)} sub={`${s?.totalBatches ?? 0} total`} icon={Zap} color={activeCount > 0 ? "blue" : "default"} href="/poultry/batches" />
        <KpiCard label="Pen Occupancy" value={`${occupancyPct}%`} sub={`${data?.houses.reduce((a, h) => a + h.occupiedPens, 0) ?? 0} pens active`} icon={Home} color={occupancyPct >= 70 ? "green" : occupancyPct >= 30 ? "blue" : "default"} href="/poultry/houses" />
        <KpiCard label="Attention Items" value={String(totalAlertCount)} sub={totalAlertCount > 0 ? "Requires action" : "All clear"} icon={AlertTriangle} color={totalAlertCount > 0 ? "red" : "green"} />
      </section>

      {/* KPI Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Eggs (all time)" value={fmt(s?.totalEggs ?? 0)} icon={Egg} color="amber" href="/poultry/egg-production" />
        <KpiCard label="Feed Consumed" value={`${fmt(s?.totalFeedKg ?? 0)} kg`} icon={Wheat} color="blue" href="/poultry/feed-consumption" />
        <KpiCard label="Flock Mortality" value={`${flockMortalityPct}%`} sub="Opening vs current birds" icon={Skull} color={Number(flockMortalityPct) > 10 ? "red" : Number(flockMortalityPct) > 5 ? "amber" : "green"} />
        <KpiCard label="Est. Profitability" value={fmtGhs(s?.totalProfitability ?? 0)} icon={(s?.totalProfitability ?? 0) >= 0 ? TrendingUp : TrendingDown} color={(s?.totalProfitability ?? 0) >= 0 ? "green" : "red"} />
      </section>

      {/* 7-Day Trends */}
      <section className="mb-8">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-ink">7-Day Production Trends</h3>
          <p className="text-xs text-ink/40">Daily totals for the past week</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TrendChart points={eggTrend} color="#f59e0b" label="Egg Production" unit=" eggs" />
          <TrendChart points={mortalityTrend} color="#ef4444" label="Daily Mortality" unit=" birds" />
          <TrendChart points={feedTrend} color="#3b82f6" label="Feed Consumption" unit=" kg" />
        </div>
      </section>

      {/* Active Batches */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink">Active Batches ({activeBatches.length})</h3>
            <p className="text-xs text-ink/40">Currently running flocks requiring daily management</p>
          </div>
          <Link href="/poultry/batches/create" className="app-button-primary text-xs">
            + New batch
          </Link>
        </div>
        {activeBatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white py-14 text-center shadow-card">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-field">
              <Bird className="h-6 w-6 text-ink/20" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-ink/50">No active batches</p>
            <Link href="/poultry/batches/create" className="mt-3 text-sm font-bold text-brand hover:underline">
              Create first batch →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeBatches.map((batch) => <ActiveBatchCard key={batch.id} batch={batch} />)}
          </div>
        )}
      </section>

      {/* House Occupancy */}
      <HouseOccupancyGrid houses={data?.houses ?? []} />

      {/* Quick Actions */}
      <QuickActions />

      {/* Other Batches */}
      {otherBatches.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-ink">Other Batches</h3>
            <p className="text-xs text-ink/40">Closed, sold, and culled batches</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-field/60 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Batch</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Farm</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Type</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Birds</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Mortality</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Eggs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {otherBatches.map((b) => (
                  <tr key={b.id} className="transition hover:bg-field/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/poultry/batches/${b.id}`} className="font-bold text-brand hover:underline">{b.code}</Link>
                      <p className="text-xs text-ink/45">{b.name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-ink/65">{b.farm?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink/65">{b.birdType}</td>
                    <td className="px-4 py-2.5"><BatchStatusBadge status={b.status} /></td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmt(b.currentLiveBirds)}</td>
                    <td className="px-4 py-2.5 text-right"><MortalityIndicator rate={b.mortalityRate} /></td>
                    <td className="px-4 py-2.5 text-right text-ink/65">{fmt(b.totalEggs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PoultryShell>
  );
}
