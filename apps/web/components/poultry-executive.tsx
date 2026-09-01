"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileBarChart, Loader2, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "./ui";
import { ApiEnvelope, apiFetch, getCachedFirst, hasCached } from "../lib/api";

type TrendPoint = { date: string; total?: number; good?: number; count?: number; kg?: number };
type BatchRow = {
  id: string; code: string; name: string; birdType: string; status: string;
  openingBirdCount: number; currentLiveBirds: number; mortalityRate: number;
  totalEggs: number; totalFeedKg: number; startDate: string;
  farm?: { name: string; code: string };
  poultryHouse?: { name: string; code: string } | null;
};
type PoultryDashboard = {
  summary: { currentLiveBirds: number; activeBatches: number; totalEggs: number; totalFeedKg: number };
  batches: BatchRow[];
  alerts: { noTodayRecord: { id: string }[]; highMortality: { id: string }[]; criticalHealth: unknown[] };
  trends: { eggs: TrendPoint[]; mortality: TrendPoint[]; feed: TrendPoint[] };
};
type FeedStock = {
  lines: { farm: string | null; product: string | null; onHandKg: number; consumedKg: number }[];
  totals: { onHandKg: number; consumedKg: number };
};

const BAG_KG = 50;

export function PoultryExecutivePage() {
  const [dash, setDash] = useState<PoultryDashboard | null>(() => getCachedFirst<ApiEnvelope<PoultryDashboard>>("/poultry/dashboard")?.data ?? null);
  const [feed, setFeed] = useState<FeedStock | null>(null);
  const [loading, setLoading] = useState(!hasCached("/poultry/dashboard"));
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<ApiEnvelope<PoultryDashboard>>("/poultry/dashboard"),
      apiFetch<ApiEnvelope<FeedStock>>("/poultry/feed-stock").catch(() => ({ data: { lines: [], totals: { onHandKg: 0, consumedKg: 0 } } })),
    ])
      .then(([d, f]) => { setDash(d.data); setFeed(f.data); })
      .catch((err: any) => setError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const todayMortality = dash?.trends.mortality.at(-1)?.count ?? 0;
  const todayEggs = dash?.trends.eggs.at(-1)?.total ?? 0;
  const todayFeed = dash?.trends.feed.at(-1)?.kg ?? 0;
  const feedOnHandBags = feed ? Math.round(feed.totals.onHandKg / BAG_KG) : 0;
  // rough days of cover from the last week's average daily consumption
  const weekFeed = (dash?.trends.feed ?? []).reduce((s, p) => s + (p.kg ?? 0), 0);
  const avgDailyFeed = weekFeed > 0 ? weekFeed / Math.max(dash!.trends.feed.length, 1) : 0;
  const daysCover = feed && avgDailyFeed > 0 ? feed.totals.onHandKg / avgDailyFeed : null;

  const feedByFarm = useMemo(() => {
    const m = new Map<string, { farm: string; onHandKg: number }>();
    for (const l of feed?.lines ?? []) {
      const farm = l.farm ?? "—";
      m.set(farm, { farm, onHandKg: (m.get(farm)?.onHandKg ?? 0) + l.onHandKg });
    }
    return [...m.values()].sort((a, b) => a.onHandKg - b.onHandKg);
  }, [feed]);

  const openBatches = useMemo(
    () => (dash?.batches ?? []).filter((b) => b.status === "ACTIVE").sort((a, b) => b.mortalityRate - a.mortalityRate),
    [dash],
  );

  const farmComparison = useMemo(() => {
    const m = new Map<string, { farm: string; eggs: number; birds: number; deaths: number }>();
    for (const b of openBatches) {
      const farm = b.farm?.name ?? "—";
      const cur = m.get(farm) ?? { farm, eggs: 0, birds: 0, deaths: 0 };
      cur.eggs += b.totalEggs;
      cur.birds += b.openingBirdCount;
      cur.deaths += Math.round((b.mortalityRate / 100) * b.openingBirdCount);
      m.set(farm, cur);
    }
    return [...m.values()].map((r) => ({ farm: r.farm, eggs: r.eggs, mortalityPct: r.birds > 0 ? Math.round((r.deaths / r.birds) * 1000) / 10 : 0 }));
  }, [openBatches]);

  const eggSeries = (dash?.trends.eggs ?? []).map((p) => ({ date: p.date?.slice(5) ?? "", eggs: p.total ?? 0 }));
  const mortSeries = (dash?.trends.mortality ?? []).map((p) => ({ date: p.date?.slice(5) ?? "", deaths: p.count ?? 0 }));
  const feedSeries = (dash?.trends.feed ?? []).map((p) => ({ date: p.date?.slice(5) ?? "", kg: p.kg ?? 0 }));

  const openAlerts = (dash?.alerts.noTodayRecord.length ?? 0) + (dash?.alerts.highMortality.length ?? 0) + (dash?.alerts.criticalHealth.length ?? 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Poultry Executive" description="The whole flock operation at a glance." />
        <div className="flex gap-2">
          <Link href="/reports" className="app-button-ghost"><FileBarChart className="h-4 w-4" /> Reports</Link>
          <button type="button" className="app-button-ghost" onClick={load}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {loading && !dash && <div className="app-card flex items-center gap-2 p-8 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {dash && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Birds alive" value={dash.summary.currentLiveBirds.toLocaleString()} />
            <Kpi label="Mortality today" value={String(todayMortality)} tone={todayMortality > 0 ? "critical" : "good"} />
            <Kpi label="Eggs today" value={todayEggs.toLocaleString()} />
            <Kpi label="Feed used today" value={`${Math.round(todayFeed).toLocaleString()} kg`} />
            <Kpi
              label="Feed in store"
              value={`${feedOnHandBags.toLocaleString()} bags`}
              sub={daysCover != null ? `~${Math.round(daysCover)} days cover` : undefined}
              tone={daysCover != null && daysCover < 5 ? "critical" : "neutral"}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            {/* open batches */}
            <section className="app-card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Open batches ({openBatches.length})</h3>
              {openBatches.length === 0 ? (
                <p className="text-sm text-ink/40">No active batches.</p>
              ) : (
                <ul className="space-y-3">
                  {openBatches.map((b) => {
                    const survival = b.openingBirdCount > 0 ? b.currentLiveBirds / b.openingBirdCount : 0;
                    const weeks = Math.max(0, Math.round((Date.now() - new Date(b.startDate).getTime()) / (7 * 86400000)));
                    const tone = b.mortalityRate > 5 ? "bg-red-500" : b.mortalityRate > 2 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <li key={b.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-ink">{b.code}</span>
                          <span className="text-ink/50">{b.farm?.name ?? "—"} · {b.poultryHouse?.name ?? "multi-house"} · wk {weeks}</span>
                          <span className="tabular-nums text-ink/70">{b.currentLiveBirds.toLocaleString()}/{b.openingBirdCount.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/70">
                            <div className="h-full rounded-full bg-brand/70" style={{ width: `${Math.round(survival * 100)}%` }} />
                          </div>
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} title={`${b.mortalityRate}% mortality`} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* feed per farm */}
            <section className="app-card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Feed in store, per farm</h3>
              {feedByFarm.length === 0 ? (
                <p className="text-sm text-ink/40">No feed-store stock recorded.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {feedByFarm.map((f) => {
                    const bags = Math.round(f.onHandKg / BAG_KG);
                    return (
                      <li key={f.farm} className="flex items-center justify-between gap-3">
                        <span className="text-ink/75">{f.farm}</span>
                        <span className={`tabular-nums font-semibold ${bags < 5 ? "text-red-600" : "text-ink"}`}>
                          {bags.toLocaleString()} bags
                          <span className="ml-1 text-xs font-normal text-ink/40">({Math.round(f.onHandKg).toLocaleString()} kg)</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {openAlerts > 0 && (
                <Link href="/poultry" className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline">
                  {openAlerts} item{openAlerts !== 1 ? "s" : ""} need attention <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </section>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Chart title="Eggs / day"><LineChart data={eggSeries} margin={M}><Grid /><X /><Y /><Tip /><Line type="monotone" dataKey="eggs" stroke="#3C6E9F" strokeWidth={2} dot={false} /></LineChart></Chart>
            <Chart title="Mortality / day"><LineChart data={mortSeries} margin={M}><Grid /><X /><Y /><Tip /><Line type="monotone" dataKey="deaths" stroke="#9A4526" strokeWidth={2} dot={false} /></LineChart></Chart>
            <Chart title="Feed / day (kg)"><LineChart data={feedSeries} margin={M}><Grid /><X /><Y /><Tip /><Line type="monotone" dataKey="kg" stroke="#2F6F6A" strokeWidth={2} dot={false} /></LineChart></Chart>
          </div>

          {farmComparison.length > 1 && (
            <div className="mt-5">
              <Chart title="Farm comparison — eggs & mortality" height={260}>
                <BarChart data={farmComparison} margin={M}>
                  <Grid /><XAxis dataKey="farm" tick={AX} /><YAxis yAxisId="l" tick={AX} width={48} /><YAxis yAxisId="r" orientation="right" tick={AX} width={40} />
                  <Tip /><Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="l" dataKey="eggs" name="Eggs" fill="#3C6E9F" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="r" dataKey="mortalityPct" name="Mortality %" fill="#9A4526" radius={[3, 3, 0, 0]} />
                </BarChart>
              </Chart>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const M = { top: 4, right: 12, bottom: 0, left: -8 };
const AX = { fontSize: 10, fill: "#9a8e83" };
const Grid = () => <CartesianGrid strokeDasharray="4 5" stroke="#eadfd2" vertical={false} />;
const X = () => <XAxis dataKey="date" tick={AX} minTickGap={20} />;
const Y = () => <YAxis tick={AX} width={44} />;
const Tip = () => <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />;

function Chart({ title, children, height = 200 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <div className="app-card p-4">
      <h4 className="mb-2 text-sm font-bold text-ink">{title}</h4>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "good" | "warning" | "critical" | "neutral" }) {
  const cls = tone === "critical" ? "text-red-600" : tone === "warning" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-ink";
  return (
    <div className="app-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink/40">{sub}</div>}
    </div>
  );
}
