"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bird,
  CheckCircle2,
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
  trends: {
    eggs: TrendPoint[];
    mortality: TrendPoint[];
    feed: TrendPoint[];
  };
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
      value: found ? (found[valueKey] as number) ?? 0 : 0
    });
  }
  return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "default",
  href
}: {
  label: string;
  value: string;
  sub?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  color?: "default" | "green" | "red" | "amber" | "blue" | "purple";
  href?: string;
}) {
  const colorMap = {
    default: "bg-white text-ink border-line",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    red: "bg-red-50 text-red-800 border-red-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    purple: "bg-purple-50 text-purple-800 border-purple-200"
  };
  const iconColorMap = {
    default: "text-ink/30",
    green: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    purple: "text-purple-400"
  };
  const inner = (
    <article className={`relative rounded-xl border p-4 shadow-sm ${colorMap[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium opacity-70">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
        </div>
        <Icon className={`h-6 w-6 shrink-0 ${iconColorMap[color]}`} aria-hidden />
      </div>
    </article>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function AlertBanner({ alerts }: { alerts: AlertData }) {
  const total = alerts.noTodayRecord.length + alerts.highMortality.length + alerts.criticalHealth.length;
  if (total === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50">
      <div className="flex items-center gap-3 border-b border-amber-200 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        <h3 className="text-sm font-semibold text-amber-800">{total} attention item{total > 1 ? "s" : ""} require action</h3>
      </div>
      <div className="divide-y divide-amber-100">
        {alerts.noTodayRecord.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-sm text-amber-800">
                <span className="font-semibold">{b.code}</span> — no daily record submitted today
              </span>
            </div>
            <Link href="/poultry/daily-records" className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
              Record now <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
        {alerts.highMortality.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm text-amber-800">
                <span className="font-semibold">{b.code}</span> — mortality at <span className="font-semibold text-red-700">{b.mortalityRate}%</span> (above 5% threshold)
              </span>
            </div>
            <Link href={`/poultry/batches/${b.id}`} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
              View batch <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
        {alerts.criticalHealth.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${h.severity === "CRITICAL" ? "bg-red-600" : "bg-orange-500"}`} />
              <span className="text-sm text-amber-800">
                <span className="font-semibold">{h.flockBatch.code}</span> [{h.severity}] — {h.observation.slice(0, 80)}{h.observation.length > 80 ? "…" : ""}
              </span>
            </div>
            <Link href="/poultry/health-observations" className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendChart({ points, colorClass, label, unit = "" }: { points: Array<{ label: string; value: number }>; colorClass: string; label: string; unit?: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const total = points.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <span className="text-xs text-ink/50">7-day total: {fmt(total)}{unit}</span>
      </div>
      <div className="flex h-20 items-end gap-1">
        {points.map((p, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t transition-all ${colorClass}`}
              style={{ height: `${Math.max((p.value / max) * 76, p.value > 0 ? 4 : 0)}px` }}
              title={`${p.label}: ${p.value}${unit}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex">
        {points.map((p, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-ink/40">{p.label}</div>
        ))}
      </div>
    </div>
  );
}

function BatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-800",
    PLANNED: "bg-blue-100 text-blue-800",
    CLOSED: "bg-gray-100 text-gray-600",
    SOLD: "bg-purple-100 text-purple-800",
    CULLED: "bg-red-100 text-red-800"
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function MortalityIndicator({ rate }: { rate: number }) {
  if (rate > 10) return <span className="text-sm font-bold text-red-700">{rate}% ▲</span>;
  if (rate > 5) return <span className="text-sm font-bold text-amber-700">{rate}% ▲</span>;
  return <span className="text-sm font-semibold text-emerald-700">{rate}%</span>;
}

function ActiveBatchCard({ batch }: { batch: BatchRow }) {
  const daysSinceStart = Math.floor((Date.now() - new Date(batch.startDate).getTime()) / 86400000);
  return (
    <Link href={`/poultry/batches/${batch.id}`} className="block rounded-xl border border-line bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold">{batch.code}</h4>
            <BatchStatusBadge status={batch.status} />
            {!batch.hasTodayRecord && batch.status === "ACTIVE" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">No record today</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink/55">{batch.name}</p>
        </div>
        <Bird className="h-5 w-5 shrink-0 text-ink/20" aria-hidden />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-[11px] text-ink/45">Live birds</p>
          <p className="font-bold text-base">{fmt(batch.currentLiveBirds)}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink/45">Mortality</p>
          <MortalityIndicator rate={batch.mortalityRate} />
        </div>
        <div>
          <p className="text-[11px] text-ink/45">Egg production</p>
          <p className="text-sm font-semibold">{batch.eggProductionPercent}%</p>
        </div>
        <div>
          <p className="text-[11px] text-ink/45">Cost/bird</p>
          <p className="text-sm font-semibold">{fmtGhs(batch.costPerBird)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-2 text-xs text-ink/45">
        <span>{batch.birdType} · {batch.farm?.name ?? "—"}</span>
        <span>Day {daysSinceStart}</span>
      </div>
      {batch.penCodes && (
        <p className="mt-1 text-[11px] text-ink/40">{batch.penCodes}</p>
      )}
    </Link>
  );
}

function HouseOccupancyGrid({ houses }: { houses: HouseData[] }) {
  if (houses.length === 0) return null;
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-sm font-semibold text-ink/60 uppercase tracking-wide">House &amp; Pen Occupancy</h3>
      <div className="space-y-3">
        {houses.map((house) => (
          <div key={house.id} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-ink/30" aria-hidden />
                <span className="font-semibold">{house.code} — {house.name}</span>
              </div>
              <span className="text-xs text-ink/50">{house.occupiedPens}/{house.totalPens} pens occupied</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {house.pens.map((pen) => (
                <div
                  key={pen.id}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    pen.isOccupied
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-line bg-field text-ink/40"
                  }`}
                  title={pen.activeBatch ? `${pen.activeBatch.code} — ${fmt(pen.activeBatch.birdCount)} birds` : "Empty"}
                >
                  <span className="font-medium">{pen.code}</span>
                  {pen.activeBatch && (
                    <span className="ml-1 text-[10px] opacity-70">{pen.activeBatch.code}</span>
                  )}
                </div>
              ))}
              {house.pens.length === 0 && (
                <span className="text-xs text-ink/40">No pens configured</span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: house.totalPens > 0 ? `${(house.occupiedPens / house.totalPens) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { href: "/poultry/daily-records", label: "Daily Record", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/poultry/egg-production", label: "Egg Production", icon: Egg, color: "text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/poultry/feed-consumption", label: "Feed Intake", icon: Wheat, color: "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/poultry/mortality", label: "Mortality", icon: Skull, color: "text-red-600 bg-red-50 border-red-200 hover:bg-red-100" },
    { href: "/poultry/health-observations", label: "Health Obs.", icon: Heart, color: "text-pink-600 bg-pink-50 border-pink-200 hover:bg-pink-100" },
    { href: "/poultry/bird-weight", label: "Bird Weight", icon: Scale, color: "text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/poultry/medication", label: "Medication", icon: FlameKindling, color: "text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/poultry/transfers", label: "Transfer", icon: ArrowRight, color: "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
    { href: "/poultry/costs", label: "Record Cost", icon: ShoppingBag, color: "text-teal-600 bg-teal-50 border-teal-200 hover:bg-teal-100" }
  ];
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-sm font-semibold text-ink/60 uppercase tracking-wide">Quick Entry</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href} className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${a.color}`}>
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
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/poultry/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch {
      // silent — keep showing stale data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const s = data?.summary;
  const activeCount = s?.activeBatches ?? 0;
  const totalAlertCount = (data?.alerts.noTodayRecord.length ?? 0) + (data?.alerts.highMortality.length ?? 0) + (data?.alerts.criticalHealth.length ?? 0);
  const mortalityPct = s && s.totalOpeningBirds > 0 ? (((s.totalOpeningBirds - s.currentLiveBirds) / s.totalOpeningBirds) * 100).toFixed(1) : "0.0";
  const occupancyPct = data?.houses.length
    ? Math.round((data.houses.reduce((s, h) => s + h.occupiedPens, 0) / Math.max(data.houses.reduce((s, h) => s + h.totalPens, 0), 1)) * 100)
    : 0;

  const eggTrend = buildTrend(data?.trends.eggs ?? [], "total");
  const mortalityTrend = buildTrend(data?.trends.mortality ?? [], "count");
  const feedTrend = buildTrend(data?.trends.feed ?? [], "kg");

  const activeBatches = (data?.batches ?? []).filter((b) => b.status === "ACTIVE");
  const otherBatches = (data?.batches ?? []).filter((b) => b.status !== "ACTIVE");

  return (
    <PoultryShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Poultry Operations</h2>
          <p className="text-sm text-ink/55">Live flock intelligence, production metrics, and batch health across all farms</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink/60 shadow-sm transition hover:bg-field disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
        </button>
      </div>

      {/* Alerts */}
      {data && <AlertBanner alerts={data.alerts} />}

      {/* KPI Strip — Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Current Live Birds"
          value={fmt(s?.currentLiveBirds ?? 0)}
          sub={`of ${fmt(s?.totalOpeningBirds ?? 0)} opening`}
          icon={Bird}
          color={s && s.currentLiveBirds < s.totalOpeningBirds * 0.9 ? "amber" : "green"}
          href="/poultry/batches"
        />
        <KpiCard
          label="Active Batches"
          value={String(activeCount)}
          sub={`${s?.totalBatches ?? 0} total (incl. closed)`}
          icon={Zap}
          color={activeCount > 0 ? "blue" : "default"}
          href="/poultry/batches"
        />
        <KpiCard
          label="Pen Occupancy"
          value={`${occupancyPct}%`}
          sub={`${data?.houses.reduce((s, h) => s + h.occupiedPens, 0) ?? 0} pens active`}
          icon={Home}
          color={occupancyPct >= 70 ? "green" : occupancyPct >= 30 ? "blue" : "default"}
          href="/poultry/houses"
        />
        <KpiCard
          label="Attention Items"
          value={String(totalAlertCount)}
          sub={totalAlertCount > 0 ? "Requires action" : "All clear"}
          icon={AlertTriangle}
          color={totalAlertCount > 0 ? "red" : "green"}
        />
      </section>

      {/* KPI Strip — Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Eggs (all time)"
          value={fmt(s?.totalEggs ?? 0)}
          icon={Egg}
          color="amber"
          href="/poultry/egg-production"
        />
        <KpiCard
          label="Feed Consumed (all time)"
          value={`${fmt(s?.totalFeedKg ?? 0)} kg`}
          icon={Wheat}
          color="blue"
          href="/poultry/feed-consumption"
        />
        <KpiCard
          label="Total Costs"
          value={fmtGhs(s?.totalCosts ?? 0)}
          icon={ShoppingBag}
          color={s && s.totalCosts > 0 ? "red" : "default"}
          href="/poultry/costs"
        />
        <KpiCard
          label="Est. Profitability"
          value={fmtGhs(s?.totalProfitability ?? 0)}
          icon={(s?.totalProfitability ?? 0) >= 0 ? TrendingUp : TrendingDown}
          color={(s?.totalProfitability ?? 0) >= 0 ? "green" : "red"}
        />
      </section>

      {/* 7-Day Trends */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-semibold text-ink/60 uppercase tracking-wide">7-Day Production Trends</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <TrendChart points={eggTrend} colorClass="bg-amber-300" label="Egg Production" unit=" eggs" />
          <TrendChart points={mortalityTrend} colorClass="bg-red-400" label="Daily Mortality" unit=" birds" />
          <TrendChart points={feedTrend} colorClass="bg-blue-400" label="Feed Consumption" unit=" kg" />
        </div>
      </section>

      {/* Active Batches */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink/60 uppercase tracking-wide">Active Batches ({activeBatches.length})</h3>
          <Link href="/poultry/batches/create" className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90">
            + New batch
          </Link>
        </div>
        {activeBatches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center">
            <Bird className="mx-auto mb-3 h-10 w-10 text-ink/20" aria-hidden />
            <p className="text-sm font-medium text-ink/50">No active batches</p>
            <Link href="/poultry/batches/create" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Create first batch →</Link>
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
          <h3 className="mb-3 text-sm font-semibold text-ink/60 uppercase tracking-wide">Other Batches</h3>
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-field text-left text-xs text-ink/50">
                  <th className="px-4 py-2.5 font-semibold">Batch</th>
                  <th className="px-4 py-2.5 font-semibold">Farm</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Birds</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Mortality</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Eggs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {otherBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-field/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/poultry/batches/${b.id}`} className="font-semibold text-brand hover:underline">{b.code}</Link>
                      <p className="text-xs text-ink/50">{b.name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-ink/70">{b.farm?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink/70">{b.birdType}</td>
                    <td className="px-4 py-2.5"><BatchStatusBadge status={b.status} /></td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(b.currentLiveBirds)}</td>
                    <td className="px-4 py-2.5 text-right"><MortalityIndicator rate={b.mortalityRate} /></td>
                    <td className="px-4 py-2.5 text-right text-ink/70">{fmt(b.totalEggs)}</td>
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
