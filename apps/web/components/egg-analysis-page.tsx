"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { PageHeader } from "./ui";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

type Finding = { level: "OK" | "WATCH" | "INFO"; title: string; detail: string };
type Analysis = {
  generatedAt: string;
  period: { from: string | null; to: string };
  perCrate: number;
  headline: { producedPerRecords: number; sold: number; heldAtFarm: number; heldAtSalesStores: number; notAccountedFor: number; notAccountedForPercent: number; estimatedValue: number | null; averagePricePerCrate: number | null };
  bridge: { label: string; crates: number; note?: string }[];
  shrinkage: { label: string; crates: number }[];
  months: { month: string; recorded: number; credited: number; systemCorrections: number; writeOffs: number; sentOut: number; received: number; sold: number; soldAmount: number }[];
  stores: { id: string; name: string; role: "FARM" | "SALES" | "OTHER"; retired: boolean; opening: number; closing: number; systemOnHand: number; agrees: boolean | null }[];
  transfers: { summary: { sent: number; received: number; shortBy: number; onTheWay: number; waitingApproval: number; shortCount: number } };
  sales: { total: { sales: number; crates: number; amount: number } };
  adjustments: { date: string; number: string; store: string; type: string; crates: number; status: string; reason: string; requestedBy: string; approvedBy: string; sameApprover: boolean }[];
  findings: Finding[];
};

const crates = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eggsOf = (c: number, per: number) => Math.round(c * per).toLocaleString("en-GH");
const money = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LEVEL: Record<Finding["level"], string> = { OK: "bg-emerald-100 text-emerald-800", WATCH: "bg-amber-100 text-amber-800", INFO: "bg-gray-100 text-gray-700" };

/** The egg analysis for the owner: what was produced, where it went, what is missing and why. Download the full workbook as Excel. */
export function EggAnalysisPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const query = useCallback(() => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch<ApiEnvelope<Analysis>>(`/egg-analysis${query()}`)
      .then((r) => setData(r.data))
      .catch((e: unknown) => { setData(null); setError(e instanceof Error ? e.message : "Could not build the egg analysis."); })
      .finally(() => setLoading(false));
  }, [query]);

  async function download() {
    setDownloading(true);
    setError("");
    try {
      await downloadReport(`/egg-analysis/export.xlsx${query()}`, `egg-analysis-${(to || new Date().toISOString().slice(0, 10))}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the Excel file.");
    } finally {
      setDownloading(false);
    }
  }
  const preset = (days: number | "all") => {
    const end = new Date();
    setTo("");
    setFrom(days === "all" ? "" : new Date(end.getTime() - days * 86_400_000).toISOString().slice(0, 10));
  };

  const h = data?.headline;
  const per = data?.perCrate ?? 30;
  return (
    <div>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> All reports</Link>
      <PageHeader
        title="Egg analysis"
        description="From the farm's production records, to the head-office egg store, to sales and adjustments: where every crate went, and what is missing and why. Download it as Excel to send to the owner."
        actions={<button type="button" className="app-button-primary" onClick={download} disabled={downloading || !data}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} Download Excel</button>}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-semibold text-ink/60">From<input type="date" className="app-control" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grid gap-1 text-xs font-semibold text-ink/60">To<input type="date" className="app-control" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="flex gap-1.5 text-sm">
          <button type="button" className="rounded-lg border border-line px-3 py-2 hover:bg-field" onClick={() => preset("all")}>All time</button>
          <button type="button" className="rounded-lg border border-line px-3 py-2 hover:bg-field" onClick={() => preset(30)}>Last 30 days</button>
          <button type="button" className="rounded-lg border border-line px-3 py-2 hover:bg-field" onClick={() => preset(7)}>Last 7 days</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && !data && <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-ink/40" aria-hidden /></div>}

      {data && h && (
        <div className={loading ? "opacity-60" : ""}>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ["Produced (per records)", h.producedPerRecords, "text-ink"],
              ["Sold", h.sold, "text-ink"],
              ["In the egg stores now", h.heldAtFarm + h.heldAtSalesStores, "text-ink"]
            ] as const).map(([label, v, tone]) => (
              <div key={label} className="app-card p-4"><p className="text-xs font-semibold text-ink/55">{label}</p><p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{crates(v)} <span className="text-sm font-semibold text-ink/50">crates</span></p><p className="text-xs tabular-nums text-ink/50">{eggsOf(v, per)} eggs</p></div>
            ))}
            <div className={`app-card p-4 ${h.notAccountedFor > 0.05 ? "border-amber-300 bg-amber-50" : ""}`}>
              <p className="text-xs font-semibold text-ink/55">Not accounted for</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{crates(h.notAccountedFor)} <span className="text-sm font-semibold text-ink/50">crates</span></p>
              <p className="text-xs tabular-nums text-ink/60">{eggsOf(h.notAccountedFor, per)} eggs · {h.notAccountedForPercent}% of production{h.estimatedValue !== null ? ` · about GHS ${money(h.estimatedValue)}` : ""}</p>
            </div>
          </div>

          <section className="app-card mb-6 overflow-hidden">
            <p className="border-b border-line px-5 py-3 font-bold">What to look at</p>
            <ul className="divide-y divide-line">
              {data.findings.map((f, i) => (
                <li key={i} className="flex gap-3 px-5 py-3 text-sm">
                  <span className={`mt-0.5 h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${LEVEL[f.level]}`}>{f.level}</span>
                  <div><p className="font-semibold">{f.title}</p><p className="text-ink/70">{f.detail}</p></div>
                </li>
              ))}
            </ul>
          </section>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <section className="app-card overflow-hidden">
              <p className="border-b border-line px-5 py-3 font-bold">Where the eggs went</p>
              <table className="w-full text-sm"><tbody className="divide-y divide-line">
                {data.bridge.map((b, i) => <tr key={i} className={i === data.bridge.length - 1 ? "bg-field font-bold" : ""}><td className="px-5 py-2">{b.label}</td><td className="px-5 py-2 text-right tabular-nums">{crates(b.crates)}</td></tr>)}
              </tbody></table>
              <p className="border-y border-line bg-field/50 px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink/55">Why they are not accounted for</p>
              <table className="w-full text-sm"><tbody className="divide-y divide-line">
                {data.shrinkage.map((b, i) => <tr key={i}><td className="px-5 py-2">{b.label}</td><td className="px-5 py-2 text-right tabular-nums">{crates(b.crates)}</td></tr>)}
              </tbody></table>
            </section>

            <section className="app-card overflow-hidden">
              <p className="border-b border-line px-5 py-3 font-bold">Egg stores</p>
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-5 py-2">Store</th><th className="px-3 py-2 text-right">Should hold</th><th className="px-3 py-2 text-right">System shows</th><th className="px-3 py-2" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.stores.map((s) => (
                    <tr key={s.id} className={s.role === "OTHER" ? "text-ink/50" : ""}>
                      <td className="px-5 py-2">{s.name}{s.retired && <span className="ml-1 text-xs">(retired)</span>}<span className="block text-xs text-ink/45">{s.role === "FARM" ? "farm store" : s.role === "SALES" ? "head-office store" : "not in the chain"}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{crates(s.closing)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{crates(s.systemOnHand)}</td>
                      <td className="px-3 py-2 text-xs font-semibold">{s.agrees === null ? "" : s.agrees ? <span className="text-emerald-700">agrees</span> : <span className="text-red-600">differs</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-px border-t border-line bg-line text-sm">
                <div className="bg-white px-5 py-3"><p className="text-xs text-ink/55">Sent to head office</p><p className="font-bold tabular-nums">{crates(data.transfers.summary.sent)}</p></div>
                <div className="bg-white px-5 py-3"><p className="text-xs text-ink/55">Received</p><p className="font-bold tabular-nums">{crates(data.transfers.summary.received)}{data.transfers.summary.shortBy > 0 && <span className="ml-1 text-xs font-semibold text-amber-700">({crates(data.transfers.summary.shortBy)} short)</span>}</p></div>
                <div className="bg-white px-5 py-3"><p className="text-xs text-ink/55">Egg sales</p><p className="font-bold tabular-nums">{data.sales.total.sales} sales · {crates(data.sales.total.crates)} crates</p></div>
                <div className="bg-white px-5 py-3"><p className="text-xs text-ink/55">Sales value</p><p className="font-bold tabular-nums">GHS {money(data.sales.total.amount)}</p></div>
              </div>
            </section>
          </div>

          <section className="app-card mb-6 overflow-x-auto">
            <p className="border-b border-line px-5 py-3 font-bold">Month by month (crates)</p>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-5 py-2">Month</th><th className="px-3 py-2 text-right">Produced</th><th className="px-3 py-2 text-right">Credited</th><th className="px-3 py-2 text-right">Written off</th><th className="px-3 py-2 text-right">Sent</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Sold</th><th className="px-5 py-2 text-right">Sales (GHS)</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.months.map((m) => <tr key={m.month}><td className="px-5 py-2 font-semibold">{m.month}</td><td className="px-3 py-2 text-right tabular-nums">{crates(m.recorded)}</td><td className="px-3 py-2 text-right tabular-nums">{crates(m.credited)}</td><td className="px-3 py-2 text-right tabular-nums">{m.writeOffs ? crates(m.writeOffs) : ""}</td><td className="px-3 py-2 text-right tabular-nums">{crates(m.sentOut)}</td><td className="px-3 py-2 text-right tabular-nums">{crates(m.received)}</td><td className="px-3 py-2 text-right tabular-nums">{crates(m.sold)}</td><td className="px-5 py-2 text-right tabular-nums">{money(m.soldAmount)}</td></tr>)}
              </tbody>
            </table>
          </section>

          {data.adjustments.length > 0 && (
            <section className="app-card mb-6 overflow-x-auto">
              <p className="border-b border-line px-5 py-3 font-bold">Stock adjustments</p>
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-5 py-2">Date</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Crates</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Entered by</th><th className="px-5 py-2">Approved by</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.adjustments.map((a) => <tr key={a.number}><td className="whitespace-nowrap px-5 py-2">{a.date}</td><td className="px-3 py-2 font-mono text-xs">{a.number}</td><td className="px-3 py-2">{a.type.replace(/_/g, " ").toLowerCase()}</td><td className="px-3 py-2 text-right tabular-nums">{crates(a.crates)}</td><td className="max-w-xs px-3 py-2 text-ink/70">{a.reason}</td><td className="px-3 py-2">{a.requestedBy}</td><td className="px-5 py-2">{a.approvedBy}{a.sameApprover && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">same person</span>}</td></tr>)}
                </tbody>
              </table>
            </section>
          )}
          <p className="text-xs text-ink/50">Built from the system's own records on {new Date(data.generatedAt).toLocaleString("en-GH")}. The Excel download has more detail: every transfer, the production-record gap, and notes on how to read it.</p>
        </div>
      )}
    </div>
  );
}
