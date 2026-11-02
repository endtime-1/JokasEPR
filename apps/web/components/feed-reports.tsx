"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, ChartBar, ChevronLeft, ChevronRight, CircleAlert, CircleCheckBig,
  Download, Factory, FlaskConical, Package, PackageCheck, Printer, RefreshCw, Truck, Wallet, Warehouse
} from "lucide-react";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";
import { PageHeader } from "./ui";

type Material = {
  productId: string; name: string; sku: string; uom: string;
  openingKg: number; receivedKg: number; adjustmentsInKg: number; usedKg: number; adjustmentsOutKg: number; wastageKg: number; closingKg: number;
  reorderLevelKg: number; avgDailyUseKg: number; daysCover: number | null; unitCost: number; usedCost: number; stockValue: number; usageSharePct: number;
  status: "OK" | "LOW" | "OUT";
};

type Report = {
  period: { startDate: string; endDate: string; days: number };
  summary: {
    batches: number; producedKg: number; bags50Kg: number; rawUsedKg: number; rawWastageKg: number; batchWastageKg: number; wastagePct: number; yieldPct: number;
    rawStockKg: number; rawStockValue: number; finishedStockKg: number; lowStockCount: number; transferredKg: number; soldKg: number; soldValue: number; avgDailyProducedKg: number;
  };
  comparison: { producedKgChangePct: number | null; rawUsedKgChangePct: number | null; wastageKgChangePct: number | null; batchesChangePct: number | null; previous: { producedKg: number; rawUsedKg: number; wastageKg: number; batches: number } };
  rawMaterials: Material[];
  production: {
    daily: Array<{ date: string; producedKg: number; rawUsedKg: number; wastageKg: number; batches: number }>;
    byProduct: Array<{ productId: string; name: string; sku: string; batches: number; producedKg: number; wastageKg: number; cost: number; costPerKg: number; salesValue: number }>;
    batches: Array<{ id: string; batchNumber: string; status: string; productionDate: string; product: string; site: string; producedKg: number; wastageKg: number }>;
  };
  finishedFeed: {
    stock: Array<{ productId: string; name: string; sku: string; quantityKg: number; bags: number; value: number }>;
    transferredKg: number; transfersByFarm: Array<{ farm: string; quantityKg: number }>; soldKg: number; soldValue: number;
  };
  quality: { passed: number; failed: number; pending: number; total: number; passRatePct: number | null };
  costs: { rawMaterial: number; labor: number; packaging: number; overhead: number; total: number; expectedSales: number; costPerKg: number; profitMarginPct: number };
  insights: Array<{ level: "critical" | "warning" | "info" | "good"; text: string }>;
};

const fmt = (n: number | null | undefined, d = 0) => Number(n ?? 0).toLocaleString("en-GH", { minimumFractionDigits: d, maximumFractionDigits: d });
const ghs = (n: number) => `GHS ${fmt(n, 2)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000));
const longDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Monday of the week containing the given date.
function weekStart(s: string) {
  const d = new Date(`${s}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(s, -dow);
}

type Tone = "brand" | "green" | "blue" | "amber" | "red" | "purple" | "teal";
const TONES: Record<Tone, { card: string; icon: string; val: string }> = {
  brand: { card: "from-white border-line", icon: "bg-brand/10 text-brand", val: "text-ink" },
  green: { card: "from-emerald-50 border-emerald-200", icon: "bg-emerald-100 text-emerald-600", val: "text-emerald-700" },
  blue: { card: "from-blue-50 border-blue-200", icon: "bg-blue-100 text-blue-600", val: "text-blue-700" },
  amber: { card: "from-amber-50 border-amber-200", icon: "bg-amber-100 text-amber-600", val: "text-amber-700" },
  red: { card: "from-red-50 border-red-200", icon: "bg-red-100 text-red-600", val: "text-red-700" },
  purple: { card: "from-purple-50 border-purple-200", icon: "bg-purple-100 text-purple-600", val: "text-purple-700" },
  teal: { card: "from-teal-50 border-teal-200", icon: "bg-teal-100 text-teal-600", val: "text-teal-700" }
};

function Delta({ pct, goodWhenUp = true }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct === null) return <span className="text-[11px] text-ink/35">no prior data</span>;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${good ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      <Icon className="h-3 w-3" aria-hidden />{Math.abs(pct)}% vs last period
    </span>
  );
}

function Kpi({ label, value, sub, icon: Icon, tone = "brand", delta }: { label: string; value: string; sub?: string; icon: typeof ChartBar; tone?: Tone; delta?: ReactNode }) {
  const t = TONES[tone];
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b ${t.card} to-white p-5 shadow-card`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${t.icon}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <strong className={`mt-4 block font-display text-[26px] font-extrabold leading-none tabular-nums tracking-tight ${t.val}`}>{value}</strong>
      <p className="mt-2.5 text-[11px] font-semibold uppercase leading-snug tracking-wide text-ink/50">{label}</p>
      {sub && <p className="mt-1 text-xs text-ink/45">{sub}</p>}
      {delta && <div className="mt-2">{delta}</div>}
    </article>
  );
}

function Section({ title, subtitle, icon: Icon, children, right }: { title: string; subtitle?: string; icon: typeof ChartBar; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="app-card mb-6 overflow-hidden break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" aria-hidden /></span>
          <div>
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-ink/50">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// Grouped bars: raw material used vs feed produced vs wastage, one group per day.
function DailyChart({ rows }: { rows: Report["production"]["daily"] }) {
  const max = Math.max(...rows.flatMap((r) => [r.producedKg, r.rawUsedKg, r.wastageKg]), 1);
  const H = 150;
  const many = rows.length > 14;
  return (
    <div className="px-5 pb-4 pt-5">
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-ink/60">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Raw materials used</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Feed produced</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-red-400" />Wastage</span>
      </div>
      <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: H + 36 }}>
        {rows.map((r) => (
          <div key={r.date} className="flex min-w-[28px] flex-1 flex-col items-center justify-end" title={`${longDate(r.date)} — used ${fmt(r.rawUsedKg)} kg, produced ${fmt(r.producedKg)} kg, wastage ${fmt(r.wastageKg)} kg`}>
            <div className="flex w-full items-end justify-center gap-[3px]" style={{ height: H }}>
              {[{ v: r.rawUsedKg, c: "bg-amber-400" }, { v: r.producedKg, c: "bg-emerald-500" }, { v: r.wastageKg, c: "bg-red-400" }].map((b, i) => (
                <div key={i} className={`w-full max-w-[18px] rounded-t ${b.c} transition-all duration-700`} style={{ height: `${Math.max((b.v / max) * 100, b.v > 0 ? 2 : 0)}%` }} />
              ))}
            </div>
            <span className="mt-1.5 text-[10px] font-semibold text-ink/45">
              {many ? new Date(`${r.date}T00:00:00Z`).getUTCDate() : new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
            </span>
            {!many && <span className="text-[10px] font-bold tabular-nums text-ink/70">{r.producedKg > 0 ? fmt(r.producedKg) : "–"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS: Record<Material["status"], { label: string; cls: string; bar: string }> = {
  OK: { label: "In stock", cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  LOW: { label: "Low", cls: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  OUT: { label: "Out", cls: "bg-red-100 text-red-700", bar: "bg-red-500" }
};

const INSIGHT: Record<Report["insights"][number]["level"], { cls: string; dot: string }> = {
  critical: { cls: "border-red-200 bg-red-50 text-red-800", dot: "bg-red-500" },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  info: { cls: "border-blue-200 bg-blue-50 text-blue-800", dot: "bg-blue-500" },
  good: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" }
};

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/50 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, bold, cls = "" }: { children: ReactNode; right?: boolean; bold?: boolean; cls?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2.5 text-sm tabular-nums ${right ? "text-right" : "text-left"} ${bold ? "font-bold text-ink" : "text-ink/75"} ${cls}`}>{children}</td>;
}

export function FeedReportsPage() {
  const [start, setStart] = useState(() => weekStart(iso(new Date())));
  const [end, setEnd] = useState(() => addDays(weekStart(iso(new Date())), 6));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [matFilter, setMatFilter] = useState<"ALL" | "ATTENTION">("ALL");

  const load = useCallback(() => {
    setLoading(true);
    setErr("");
    apiFetch<ApiEnvelope<Report>>(`/feed-production/reports/weekly?startDate=${start}&endDate=${end}`)
      .then((r) => setData(r.data))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [start, end]);

  useEffect(load, [load]);

  const shift = (dir: 1 | -1) => {
    const span = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1;
    setStart(addDays(start, dir * span));
    setEnd(addDays(end, dir * span));
  };
  const thisWeek = () => { const s = weekStart(iso(new Date())); setStart(s); setEnd(addDays(s, 6)); };
  const lastWeek = () => { const s = addDays(weekStart(iso(new Date())), -7); setStart(s); setEnd(addDays(s, 6)); };
  const thisMonth = () => { const n = new Date(); setStart(iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1)))); setEnd(iso(n)); };

  async function exportCsv() {
    setDownloading(true);
    try { await downloadReport(`/feed-production/reports/weekly.csv?startDate=${start}&endDate=${end}`, `feed-mill-report-${start}-to-${end}.csv`); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Download failed"); }
    finally { setDownloading(false); }
  }

  const materials = useMemo(() => (data?.rawMaterials ?? []).filter((m) => matFilter === "ALL" || m.status !== "OK"), [data, matFilter]);
  const maxStock = Math.max(...(data?.rawMaterials ?? []).map((m) => Math.max(m.closingKg, m.openingKg, m.reorderLevelKg)), 1);
  const s = data?.summary;
  const c = data?.comparison;
  const totals = useMemo(() => (data?.rawMaterials ?? []).reduce((a, m) => ({
    opening: a.opening + m.openingKg, received: a.received + m.receivedKg, used: a.used + m.usedKg, wastage: a.wastage + m.wastageKg, closing: a.closing + Math.max(m.closingKg, 0), value: a.value + m.stockValue, usedCost: a.usedCost + m.usedCost
  }), { opening: 0, received: 0, used: 0, wastage: 0, closing: 0, value: 0, usedCost: 0 }), [data]);

  return (
    <>
      <PageHeader
        kicker="Feed Mill"
        title="Weekly Production & Stock Report"
        description="Raw materials used, feed produced, what is left in the store, quality, costs and dispatch — for any week or custom period."
        actions={
          <>
            <button onClick={load} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink/70 hover:text-ink print:hidden"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />Refresh</button>
            <button onClick={() => window.print()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink/70 hover:text-ink print:hidden"><Printer className="h-4 w-4" aria-hidden />Print / PDF</button>
            <button onClick={exportCsv} disabled={downloading || !data} className="inline-flex min-h-9 items-center gap-2 app-button-primary disabled:opacity-50 print:hidden"><Download className="h-4 w-4" aria-hidden />{downloading ? "Exporting…" : "Export CSV"}</button>
          </>
        }
      />

      {/* Period picker */}
      <div className="app-card mb-6 flex flex-wrap items-end gap-3 p-4 print:hidden">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous period" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/60 hover:text-ink"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => shift(1)} aria-label="Next period" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/60 hover:text-ink"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink/55">From</label>
          <input type="date" value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} className="min-h-10 app-control" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink/55">To</label>
          <input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} className="min-h-10 app-control" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[["This week", thisWeek], ["Last week", lastWeek], ["This month", thisMonth]].map(([label, fn]) => (
            <button key={label as string} onClick={fn as () => void} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink/65 hover:border-brand hover:text-brand">{label as string}</button>
          ))}
        </div>
        <p className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-ink/60"><CalendarDays className="h-4 w-4" aria-hidden />{longDate(start)} – {longDate(end)}{data ? ` · ${data.period.days} days` : ""}</p>
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" /><span>{err}</span>
          <button onClick={() => setErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading && !data && <div className="app-card p-10 text-center text-sm text-ink/50">Building report…</div>}

      {data && s && c && (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* Headline numbers */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Raw materials used" value={`${fmt(s.rawUsedKg)} kg`} sub={`${fmt(totals.usedCost > 0 ? totals.usedCost : 0, 2)} GHS cost`} icon={FlaskConical} tone="amber" delta={<Delta pct={c.rawUsedKgChangePct} goodWhenUp />} />
            <Kpi label="Feed produced" value={`${fmt(s.producedKg)} kg`} sub={`${fmt(s.bags50Kg)} bags of 50 kg · ${s.batches} batch${s.batches === 1 ? "" : "es"}`} icon={Factory} tone="green" delta={<Delta pct={c.producedKgChangePct} />} />
            <Kpi label="Raw materials left in store" value={`${fmt(s.rawStockKg)} kg`} sub={`Worth ${ghs(s.rawStockValue)}`} icon={Warehouse} tone="blue" />
            <Kpi label="Finished feed in stock" value={`${fmt(s.finishedStockKg)} kg`} sub={`${fmt(s.finishedStockKg / 50)} bags equivalent`} icon={PackageCheck} tone="teal" />
            <Kpi label="Production yield" value={`${fmt(s.yieldPct, 1)}%`} sub="Feed produced ÷ raw materials used" icon={ChartBar} tone="purple" />
            <Kpi label="Wastage" value={`${fmt(s.batchWastageKg)} kg`} sub={`${s.wastagePct}% of output`} icon={AlertTriangle} tone={s.wastagePct > 3 ? "red" : "brand"} delta={<Delta pct={c.wastageKgChangePct} goodWhenUp={false} />} />
            <Kpi label="Dispatched" value={`${fmt(s.transferredKg + s.soldKg)} kg`} sub={`${fmt(s.transferredKg)} kg to farms · ${fmt(s.soldKg)} kg sold`} icon={Truck} tone="blue" />
            <Kpi label="Low / out-of-stock materials" value={String(s.lowStockCount)} sub={s.lowStockCount ? "Needs reordering" : "All materials healthy"} icon={s.lowStockCount ? AlertTriangle : CircleCheckBig} tone={s.lowStockCount ? "red" : "green"} />
          </div>

          {/* What to know */}
          {data.insights.length > 0 && (
            <div className="mb-6 grid gap-2.5 md:grid-cols-2">
              {data.insights.map((i, idx) => (
                <div key={idx} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${INSIGHT[i.level].cls}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${INSIGHT[i.level].dot}`} />{i.text}
                </div>
              ))}
            </div>
          )}

          <Section title="Daily activity" subtitle="Raw materials used against feed produced and wastage, per day" icon={ChartBar}>
            <DailyChart rows={data.production.daily} />
          </Section>

          {/* Raw materials ledger */}
          <Section
            title="Raw materials — used and left in store"
            subtitle="Opening + received − used ± adjustments = closing stock"
            icon={Package}
            right={
              <div className="flex gap-1 rounded-lg bg-field p-1 text-xs font-semibold print:hidden">
                {(["ALL", "ATTENTION"] as const).map((f) => (
                  <button key={f} onClick={() => setMatFilter(f)} className={`rounded-md px-3 py-1 ${matFilter === f ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}>{f === "ALL" ? "All materials" : "Needs attention"}</button>
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="border-b border-line bg-field/60">
                  <tr>
                    <Th>Material</Th><Th right>Opening</Th><Th right>Received</Th><Th right>Used</Th><Th right>Wastage</Th><Th right>Closing (left)</Th>
                    <Th>Stock level</Th><Th right>Days cover</Th><Th right>Stock value</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {materials.map((m) => (
                    <tr key={m.productId} className="hover:bg-field/40">
                      <Td bold><div>{m.name}</div><div className="text-[11px] font-normal text-ink/40">{m.sku} · {m.usageSharePct}% of usage</div></Td>
                      <Td right>{fmt(m.openingKg)}</Td>
                      <Td right cls={m.receivedKg > 0 ? "text-emerald-700" : ""}>{m.receivedKg > 0 ? `+${fmt(m.receivedKg)}` : "–"}</Td>
                      <Td right bold cls="text-amber-700">{m.usedKg > 0 ? fmt(m.usedKg) : "–"}</Td>
                      <Td right cls={m.wastageKg > 0 ? "text-red-600" : ""}>{m.wastageKg > 0 ? fmt(m.wastageKg) : "–"}</Td>
                      <Td right bold>{fmt(m.closingKg)} <span className="text-[11px] font-normal text-ink/40">kg</span></Td>
                      <td className="min-w-[140px] px-3 py-2.5">
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-line">
                          <div className={`h-full rounded-full ${STATUS[m.status].bar} transition-all duration-700`} style={{ width: `${Math.min((Math.max(m.closingKg, 0) / maxStock) * 100, 100)}%` }} />
                          {m.reorderLevelKg > 0 && <i className="absolute top-0 h-full w-0.5 bg-ink/60" style={{ left: `${Math.min((m.reorderLevelKg / maxStock) * 100, 100)}%` }} title={`Reorder level ${fmt(m.reorderLevelKg)} kg`} />}
                        </div>
                      </td>
                      <Td right>{m.daysCover === null ? "–" : `${fmt(m.daysCover, 1)} d`}</Td>
                      <Td right>{ghs(m.stockValue)}</Td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span></td>
                    </tr>
                  ))}
                  {materials.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-ink/45">{matFilter === "ATTENTION" ? "Nothing needs attention — all raw materials are healthy." : "No raw material records for this period."}</td></tr>}
                </tbody>
                {matFilter === "ALL" && data.rawMaterials.length > 0 && (
                  <tfoot className="border-t-2 border-line bg-field/60">
                    <tr>
                      <Td bold>Total</Td><Td right bold>{fmt(totals.opening)}</Td><Td right bold>{fmt(totals.received)}</Td><Td right bold>{fmt(totals.used)}</Td><Td right bold>{fmt(totals.wastage)}</Td>
                      <Td right bold>{fmt(totals.closing)} kg</Td><td /><td /><Td right bold>{ghs(totals.value)}</Td><td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink/45">The dark tick on each bar marks the reorder level. “Days cover” is closing stock ÷ average daily use over this period; under 7 days is flagged Low.</p>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Production by product" subtitle="What came out of the mill" icon={Factory}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px]">
                  <thead className="border-b border-line bg-field/60"><tr><Th>Product</Th><Th right>Batches</Th><Th right>Produced</Th><Th right>Wastage</Th><Th right>Cost / kg</Th></tr></thead>
                  <tbody className="divide-y divide-line/70">
                    {data.production.byProduct.map((p) => (
                      <tr key={p.productId}>
                        <Td bold>{p.name}</Td><Td right>{p.batches}</Td>
                        <Td right bold>
                          {fmt(p.producedKg)} kg
                          <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.producedKg > 0 ? (p.producedKg / s.producedKg) * 100 : 0}%` }} /></div>
                        </Td>
                        <Td right>{fmt(p.wastageKg)}</Td><Td right>{p.costPerKg > 0 ? ghs(p.costPerKg) : "–"}</Td>
                      </tr>
                    ))}
                    {data.production.byProduct.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-ink/45">No production in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Finished feed in stock" subtitle="Ready to sell or send to farms" icon={PackageCheck}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead className="border-b border-line bg-field/60"><tr><Th>Product</Th><Th right>Quantity</Th><Th right>50 kg bags</Th><Th right>Value</Th></tr></thead>
                  <tbody className="divide-y divide-line/70">
                    {data.finishedFeed.stock.map((f) => (<tr key={f.productId}><Td bold>{f.name}</Td><Td right>{fmt(f.quantityKg)} kg</Td><Td right>{fmt(f.bags)}</Td><Td right>{ghs(f.value)}</Td></tr>))}
                    {data.finishedFeed.stock.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-ink/45">No finished feed in stock.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
                <div className="bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Sent to farms</p><p className="mt-1 text-lg font-extrabold text-ink">{fmt(data.finishedFeed.transferredKg)} kg</p>
                  {data.finishedFeed.transfersByFarm.slice(0, 3).map((t) => <p key={t.farm} className="text-xs text-ink/55">{t.farm}: {fmt(t.quantityKg)} kg</p>)}</div>
                <div className="bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Sold externally</p><p className="mt-1 text-lg font-extrabold text-ink">{fmt(data.finishedFeed.soldKg)} kg</p><p className="text-xs text-ink/55">{ghs(data.finishedFeed.soldValue)}</p></div>
              </div>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Production cost" subtitle="Where the money went" icon={Wallet}>
              <div className="p-5">
                {data.costs.total > 0 ? (
                  <>
                    <div className="flex h-4 overflow-hidden rounded-full bg-line">
                      {[["bg-amber-400", data.costs.rawMaterial], ["bg-blue-500", data.costs.labor], ["bg-purple-500", data.costs.packaging], ["bg-teal-500", data.costs.overhead]].map(([cls, v], i) => (
                        <div key={i} className={cls as string} style={{ width: `${((v as number) / data.costs.total) * 100}%` }} />
                      ))}
                    </div>
                    <dl className="mt-4 space-y-2 text-sm">
                      {[["bg-amber-400", "Raw materials", data.costs.rawMaterial], ["bg-blue-500", "Labour", data.costs.labor], ["bg-purple-500", "Packaging", data.costs.packaging], ["bg-teal-500", "Overheads", data.costs.overhead]].map(([cls, label, v]) => (
                        <div key={label as string} className="flex items-center justify-between"><dt className="flex items-center gap-2 text-ink/65"><i className={`h-2.5 w-2.5 rounded-sm ${cls}`} />{label as string}</dt><dd className="font-bold tabular-nums text-ink">{ghs(v as number)} <span className="text-xs font-normal text-ink/40">({fmt(((v as number) / data.costs.total) * 100, 0)}%)</span></dd></div>
                      ))}
                      <div className="flex items-center justify-between border-t border-line pt-2"><dt className="font-bold text-ink">Total cost</dt><dd className="font-extrabold tabular-nums text-ink">{ghs(data.costs.total)}</dd></div>
                    </dl>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl bg-field p-3"><p className="text-[11px] font-bold uppercase text-ink/45">Cost / kg</p><p className="mt-1 font-extrabold text-ink">{ghs(data.costs.costPerKg)}</p></div>
                      <div className="rounded-xl bg-field p-3"><p className="text-[11px] font-bold uppercase text-ink/45">Expected sales</p><p className="mt-1 font-extrabold text-ink">{ghs(data.costs.expectedSales)}</p></div>
                      <div className={`rounded-xl p-3 ${data.costs.profitMarginPct >= 0 ? "bg-emerald-50" : "bg-red-50"}`}><p className="text-[11px] font-bold uppercase text-ink/45">Margin</p><p className={`mt-1 font-extrabold ${data.costs.profitMarginPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>{data.costs.profitMarginPct}%</p></div>
                    </div>
                  </>
                ) : <p className="py-6 text-center text-sm text-ink/45">No costing recorded for this period.</p>}
              </div>
            </Section>

            <Section title="Quality control" subtitle="Batch checks in this period" icon={FlaskConical}>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-extrabold text-emerald-700">{data.quality.passed}</p><p className="text-[11px] font-bold uppercase text-ink/45">Passed</p></div>
                  <div className="rounded-xl bg-amber-50 p-3"><p className="text-2xl font-extrabold text-amber-700">{data.quality.pending}</p><p className="text-[11px] font-bold uppercase text-ink/45">Pending</p></div>
                  <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-extrabold text-red-700">{data.quality.failed}</p><p className="text-[11px] font-bold uppercase text-ink/45">Failed</p></div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs font-semibold text-ink/55"><span>Pass rate</span><span>{data.quality.passRatePct === null ? "No decided checks" : `${data.quality.passRatePct}%`}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${data.quality.passRatePct ?? 0}%` }} /></div>
                </div>
              </div>
            </Section>
          </div>

          <Section title="Batches produced" subtitle={`${data.production.batches.length} batch${data.production.batches.length === 1 ? "" : "es"} in this period`} icon={Factory}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-line bg-field/60"><tr><Th>Batch</Th><Th>Date</Th><Th>Product</Th><Th>Site</Th><Th right>Produced</Th><Th right>Wastage</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line/70">
                  {data.production.batches.map((b) => (
                    <tr key={b.id}><Td bold>{b.batchNumber}</Td><Td>{longDate(b.productionDate.slice(0, 10))}</Td><Td>{b.product}</Td><Td>{b.site}</Td><Td right bold>{fmt(b.producedKg)} kg</Td><Td right>{fmt(b.wastageKg)}</Td>
                      <td className="px-3 py-2.5"><span className="rounded-full bg-field px-2.5 py-0.5 text-[11px] font-bold text-ink/60">{b.status.replace(/_/g, " ")}</span></td></tr>
                  ))}
                  {data.production.batches.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink/45">No batches posted in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
