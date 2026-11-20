"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Plus, Receipt as ReceiptIcon } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { downloadText, errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { Pager, usePayAccounts, usePaged } from "./fin-banking-parts";
import { METHOD_LABEL, Method, PosSession, PosSettings, Register, Sale, cedi, newKey, qty } from "./fin-pos-api";
import { ReceiptModal } from "./fin-pos-receipt-view";
import { control } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const HEADER: [string, string] = ["POS", "Walk-in sales, tills, refunds and reports"];

const TABS = [
  { href: "/fin/pos", label: "Till", exact: true },
  { href: "/fin/pos/sales", label: "Receipts" },
  { href: "/fin/pos/tills", label: "Till sessions" },
  { href: "/fin/pos/reports", label: "Reports" },
  { href: "/fin/pos/settings", label: "Settings" }
];

export function PosTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1 print:hidden" aria-label="POS sections">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return <Link key={t.href} href={t.href} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${active ? "bg-brand text-white" : "text-ink/65 hover:bg-field hover:text-ink"}`}>{t.label}</Link>;
      })}
    </nav>
  );
}

// ─── closing a till ──────────────────────────────────────────────────────────

/** The cashier counts the drawer and enters it. Only then is the expected cash shown, so the count is an honest one. */
export function CloseTillModal({ session, onClose, onClosed }: { session: PosSession | null; onClose: () => void; onClosed: () => void }) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<PosSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCounted(""); setNote(""); setDone(null); setError(""); }, [session?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true); setError("");
    try { setDone((await finSend<PosSession>("POST", `/pos/sessions/${session.id}/close`, { countedCash: counted.trim(), note: note.trim() || undefined })).data); } catch (err) { setError(errMsg(err, "Could not close the till.")); } finally { setBusy(false); }
  }
  const variance = done ? Number(done.variance) : 0;
  return (
    <Modal open={session !== null} onClose={done ? onClosed : onClose} title={done ? "Till closed" : `Close ${session?.registerName ?? "till"}`} size="md">
      {done ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-field p-3"><p className="text-xs text-ink/60">Expected</p><p className="text-xl font-bold tabular-nums">{cedi(done.expectedCash)}</p></div>
            <div className="rounded-xl bg-field p-3"><p className="text-xs text-ink/60">Counted</p><p className="text-xl font-bold tabular-nums">{cedi(done.countedCash)}</p></div>
            <div className={`rounded-xl p-3 ${variance === 0 ? "bg-emerald-50 text-emerald-800" : variance > 0 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}><p className="text-xs">{variance === 0 ? "No difference" : variance > 0 ? "Over" : "Short"}</p><p className="text-xl font-bold tabular-nums">{cedi(done.variance)}</p></div>
          </div>
          {variance !== 0 && <p className="text-sm text-ink/65">The difference was posted to Cash Over / Short in the books.</p>}
          <p className="text-sm text-ink/60">{done.totals.sales} sale(s) · cash {cedi(done.totals.cash)} · MoMo {cedi(done.totals.momo)} · card {cedi(done.totals.card)}</p>
          <div className="flex justify-end"><button className="app-button-primary" onClick={onClosed}>Done</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <p className="text-sm text-ink/65">Count the cash in the drawer, including the float, and enter the total. The system then compares it with what it expects.</p>
          <FormField label="Cash counted" required><input className={`${control} h-14 text-right text-2xl tabular-nums`} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} required autoFocus /></FormField>
          <FormField label="Note (optional)"><input className={control} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></FormField>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="app-button-primary" disabled={busy || !counted.trim()}>{busy ? <Spinner size="xs" /> : null} Close till</button></div>
        </form>
      )}
    </Modal>
  );
}

// ─── receipts and refunds ────────────────────────────────────────────────────

const STATUS: Record<Sale["status"], [string, "success" | "warning" | "neutral"]> = { COMPLETE: ["Complete", "success"], PART_REFUNDED: ["Part refunded", "warning"], REFUNDED: ["Refunded", "neutral"] };

export function FinPosSalesPage() {
  useFinHeader(...HEADER);
  const canRefund = useFinPermission("fin.pos.void");
  const [search, setSearch] = useState("");
  const [typed, setTyped] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = usePaged<Sale>(`/pos/sales?search=${encodeURIComponent(search)}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`);
  const [viewing, setViewing] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);
  useEffect(() => { const t = setTimeout(() => { list.setPage(() => 1); setSearch(typed); }, 250); return () => clearTimeout(t); }, [typed]);

  return (
    <FinGuard permission="fin.pos.view">
      <PosTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex flex-wrap items-end gap-3">
          <input className="app-control w-full sm:w-64" placeholder="Receipt number or customer" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Search receipts" />
          <FormField label="From"><input type="date" className="app-control" value={from} onChange={(e) => { list.setPage(() => 1); setFrom(e.target.value); }} /></FormField>
          <FormField label="To"><input type="date" className="app-control" value={to} onChange={(e) => { list.setPage(() => 1); setTo(e.target.value); }} /></FormField>
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Cashier</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Paid by</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3" /><th className="w-36" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{s.number}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{s.saleDate}<span className="block text-xs text-ink/45">{new Date(s.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="px-4 py-2.5">{s.cashierName}</td>
                  <td className="px-4 py-2.5">{s.customerName ?? <span className="text-ink/40">Walk-in</span>}</td>
                  <td className="px-4 py-2.5">{[...new Set(s.payments.map((p) => METHOD_LABEL[p.method]))].join(" + ")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(s.total)}{Number(s.refundedTotal) > 0 && <span className="block text-xs text-amber-700">-{cedi(s.refundedTotal)} refunded</span>}</td>
                  <td className="px-2"><Badge variant={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge></td>
                  <td className="whitespace-nowrap px-2 text-right text-xs font-semibold">
                    <button className="mr-3 text-brand hover:underline" onClick={() => setViewing(s.id)}><ReceiptIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden />Receipt</button>
                    {canRefund && s.status !== "REFUNDED" && <button className="text-red-600 hover:underline" onClick={() => setRefunding(s)}>Refund</button>}
                  </td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink/50">No sales found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <ReceiptModal saleId={viewing} onClose={() => setViewing(null)} />
        <RefundModal sale={refunding} onClose={() => setRefunding(null)} onDone={() => { setRefunding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function RefundModal({ sale, onClose, onDone }: { sale: Sale | null; onClose: () => void; onDone: () => void }) {
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<Method>("CASH");
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQtys({}); setReason(""); setRestock(true); setError(""); setKey(newKey()); setMethod(sale?.payments[0]?.method ?? "CASH"); }, [sale?.id]);
  const chosen = sale?.lines.filter((l) => Number(qtys[l.id] ?? 0) > 0) ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sale) return;
    setBusy(true); setError("");
    try {
      await finSend("POST", "/pos/refunds", { clientKey: key, saleId: sale.id, reason: reason.trim(), restock, lines: chosen.map((l) => ({ saleLineId: l.id, quantity: qtys[l.id] })), payments: [{ method }] });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the refund."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={sale !== null} onClose={onClose} title={`Refund from ${sale?.number ?? ""}`} size="lg">
      {sale && (
        <form onSubmit={submit} className="grid gap-4">
          <p className="text-sm text-ink/65">Choose what is coming back. The refund reverses the sale, the tax and the cost in proportion, and comes out of your open till. Above the refund limit a supervisor must be signed in.</p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Sold</th><th className="px-3 py-2 text-right">Can return</th><th className="w-32 px-3 py-2 text-right">Return</th></tr></thead>
              <tbody className="divide-y divide-line">
                {sale.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.description}<span className="block text-xs text-ink/45">{cedi(l.lineTotal)}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(l.quantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(l.refundableQuantity)}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1"><input className="app-control h-10 w-full text-right tabular-nums" inputMode="decimal" value={qtys[l.id] ?? ""} onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value }))} disabled={Number(l.refundableQuantity) <= 0} aria-label={`Quantity of ${l.description} to return`} /><button type="button" className="text-xs font-semibold text-brand hover:underline disabled:opacity-30" disabled={Number(l.refundableQuantity) <= 0} onClick={() => setQtys((q) => ({ ...q, [l.id]: l.refundableQuantity }))}>All</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2"><FormField label="Reason" required><input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} required placeholder="Wrong item, damaged, changed mind…" /></FormField></div>
            <FormField label="Pay the customer back by"><select className={control} value={method} onChange={(e) => setMethod(e.target.value as Method)}><option value="CASH">Cash (from the till)</option><option value="MOMO">MoMo</option><option value="CARD">Card</option></select></FormField>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the goods back into stock <span className="text-ink/50">(untick for damaged goods)</span></label>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="app-button-primary" disabled={busy || chosen.length === 0 || reason.trim().length < 3}>{busy ? <Spinner size="xs" /> : null} Refund</button></div>
        </form>
      )}
    </Modal>
  );
}

// ─── till sessions ───────────────────────────────────────────────────────────

export function FinPosTillsPage() {
  useFinHeader(...HEADER);
  const canClose = useFinPermission("fin.pos.create");
  const list = usePaged<PosSession>("/pos/sessions");
  const [closing, setClosing] = useState<PosSession | null>(null);
  return (
    <FinGuard permission="fin.pos.view">
      <PosTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Session</th><th className="px-4 py-3">Till</th><th className="px-4 py-3">Cashier</th><th className="px-4 py-3">Opened</th><th className="px-4 py-3 text-right">Float</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Expected</th><th className="px-4 py-3 text-right">Counted</th><th className="px-4 py-3 text-right">Variance</th><th className="w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{s.number}{s.status === "OPEN" && <Badge variant="info" className="ml-2">Open</Badge>}</td>
                  <td className="px-4 py-2.5">{s.registerName}</td>
                  <td className="px-4 py-2.5">{s.cashierName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{new Date(s.openedAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(s.openingFloat)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(s.totals.salesTotal)}<span className="block text-xs text-ink/45">{s.totals.sales} sale(s)</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(s.expectedCash)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cedi(s.countedCash)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${Number(s.variance) < 0 ? "text-red-600" : Number(s.variance) > 0 ? "text-amber-700" : ""}`}>{s.variance === null ? "" : cedi(s.variance)}</td>
                  <td className="px-2 text-right">{s.status === "OPEN" && canClose && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setClosing(s)}>Close</button>}</td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-ink/50">No till sessions yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <CloseTillModal session={closing} onClose={() => setClosing(null)} onClosed={() => { setClosing(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

// ─── reports ─────────────────────────────────────────────────────────────────

type Report = { from: string; to: string; groupBy: string; rows: { key: string; label: string; count: number; quantity: string | null; sales: string; discounts: string; tax: string; refunds: string; net: string; cost: string; profit: string | null }[]; totals: { count: number; sales: string; discounts: string; tax: string; refunds: string; net: string; cost: string } };

export function FinPosReportsPage() {
  useFinHeader(...HEADER);
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState<"day" | "cashier" | "item" | "method">("day");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    finGet<Report>(`/pos/report?from=${from}&to=${to}&groupBy=${groupBy}`).then((r) => { setData(r.data); setError(""); }).catch((e) => setError(errMsg(e, "Could not load the report."))).finally(() => setLoading(false));
  }, [from, to, groupBy]);
  const titles = { day: "Day", cashier: "Cashier", item: "Item", method: "Paid by" } as const;
  function exportCsv() {
    if (!data) return;
    const head = [titles[groupBy], "Sales", ...(groupBy === "item" ? ["Quantity"] : []), "Discounts", "Tax", "Refunds", "Net", "Cost", "Profit"];
    const rows = data.rows.map((r) => [`"${r.label.replace(/"/g, '""')}"`, r.sales, ...(groupBy === "item" ? [r.quantity ?? ""] : []), r.discounts, r.tax, r.refunds, r.net, r.cost, r.profit ?? ""]);
    downloadText(`pos-by-${groupBy}-${from}-to-${to}.csv`, [head.join(","), ...rows.map((r) => r.join(","))].join("\r\n"));
  }
  return (
    <FinGuard permission="fin.pos.view">
      <PosTabs />
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="From"><input type="date" className="app-control" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="To"><input type="date" className="app-control" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
          <div className="flex gap-1">{(["day", "cashier", "item", "method"] as const).map((g) => <button key={g} onClick={() => setGroupBy(g)} className={`rounded-lg px-3.5 py-2 text-sm font-medium ${groupBy === g ? "bg-brand text-white" : "bg-field text-ink/70 hover:text-ink"}`}>By {g === "method" ? "payment method" : g}</button>)}</div>
          <div className="flex-1" />
          <button className="app-button-secondary" onClick={exportCsv} disabled={!data}><Download className="h-4 w-4" aria-hidden /> Export</button>
        </div>
        {loading && !data && <div className="py-10 text-center"><Spinner /></div>}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {([["Sales", data.totals.sales], ["Refunds", data.totals.refunds], ["Net (after refunds)", data.totals.net], ["Tax included", data.totals.tax]] as const).map(([l, v]) => <div key={l} className="app-card p-4"><p className="text-xs text-ink/55">{l}</p><p className="text-xl font-bold tabular-nums">{cedi(v)}</p></div>)}
            </div>
            <div className="app-card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">{titles[groupBy]}</th>{groupBy !== "item" && <th className="px-4 py-3 text-right">{groupBy === "method" ? "Payments" : "Sales #"}</th>}{groupBy === "item" && <th className="px-4 py-3 text-right">Qty</th>}<th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Discounts</th><th className="px-4 py-3 text-right">Refunds</th><th className="px-4 py-3 text-right">Net</th>{groupBy !== "method" && <th className="px-4 py-3 text-right">Profit</th>}</tr></thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((r) => <tr key={r.key}><td className="px-4 py-2.5">{r.label}</td>{groupBy !== "item" && <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>}{groupBy === "item" && <td className="px-4 py-2.5 text-right tabular-nums">{qty(r.quantity ?? "0")}</td>}<td className="px-4 py-2.5 text-right tabular-nums">{cedi(r.sales)}</td><td className="px-4 py-2.5 text-right tabular-nums">{Number(r.discounts) ? cedi(r.discounts) : ""}</td><td className="px-4 py-2.5 text-right tabular-nums">{Number(r.refunds) ? cedi(r.refunds) : ""}</td><td className="px-4 py-2.5 text-right font-semibold tabular-nums">{cedi(r.net)}</td>{groupBy !== "method" && <td className="px-4 py-2.5 text-right tabular-nums">{cedi(r.profit)}</td>}</tr>)}
                  {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No sales in this period.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink/50">Profit is sales excluding tax, less refunds and the cost of what was sold (at the stock's average cost). These figures come from the same entries as the ledger.</p>
          </>
        )}
      </div>
    </FinGuard>
  );
}

// ─── settings and tills ──────────────────────────────────────────────────────

export function FinPosSettingsPage() {
  useFinHeader(...HEADER);
  const canEdit = useFinPermission("fin.pos.approve");
  const { accounts } = usePayAccounts();
  const [s, setS] = useState<PosSettings | null>(null);
  const [form, setForm] = useState({ momo: "", card: "", source: "", maxDiscount: "10", refundAbove: "", header: "", footer: "" });
  const [registers, setRegisters] = useState<Register[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const load = () => {
    finGet<PosSettings>("/pos/settings").then((r) => { setS(r.data); setForm({ momo: r.data.momoPaymentAccountId ?? "", card: r.data.cardPaymentAccountId ?? "", source: r.data.floatSourceAccountId ?? "", maxDiscount: r.data.maxDiscountPercent, refundAbove: r.data.refundApprovalAbove ?? "", header: r.data.receiptHeader ?? "", footer: r.data.receiptFooter ?? "" }); }).catch((e) => setError(errMsg(e)));
    finGet<Register[]>("/pos/registers").then((r) => setRegisters(r.data)).catch((e) => setError(errMsg(e)));
  };
  useEffect(load, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setNote("");
    try {
      await finSend("PUT", "/pos/settings", { momoPaymentAccountId: form.momo || null, cardPaymentAccountId: form.card || null, floatSourceAccountId: form.source || null, maxDiscountPercent: form.maxDiscount, refundApprovalAbove: form.refundAbove.trim() === "" ? null : form.refundAbove, receiptHeader: form.header.trim() || null, receiptFooter: form.footer.trim() || null });
      setNote("Saved."); load();
    } catch (err) { setError(errMsg(err, "Could not save.")); } finally { setBusy(false); }
  }
  async function toggle(r: Register) {
    setError("");
    try { await finSend("PATCH", `/pos/registers/${r.id}`, { isActive: !r.isActive }); load(); } catch (err) { setError(errMsg(err)); }
  }
  const sel = (label: string, key: "momo" | "card" | "source", hint: string, filter: (t: string) => boolean) => (
    <FormField label={label} hint={hint}><select className={control} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} disabled={!canEdit}><option value="">Not set</option>{accounts.filter((a) => a.isActive && filter(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FormField>
  );
  return (
    <FinGuard permission="fin.pos.view">
      <PosTabs />
      <div className="space-y-5">
        <ErrorNote message={error} />
        <div className="app-card space-y-3 p-5">
          <div className="flex items-center"><p className="flex-1 font-bold">Tills</p>{canEdit && <button className="app-button-secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Add a till</button>}</div>
          <p className="text-sm text-ink/60">Each till has its own cash drawer account, so its cash is always known.</p>
          <ul className="divide-y divide-line text-sm">
            {registers.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 py-2"><span className="font-semibold">{r.name}</span><span className="text-ink/55">drawer: {r.cashAccountName}</span>{r.openSession && <Badge variant="info">Open: {r.openSession.cashierName}</Badge>}{!r.isActive && <Badge variant="neutral">Off</Badge>}<div className="flex-1" />{canEdit && <button className="text-xs font-semibold text-brand hover:underline" onClick={() => toggle(r)}>{r.isActive ? "Switch off" : "Switch on"}</button>}</li>)}
            {registers.length === 0 && <li className="py-4 text-center text-ink/50">No tills yet.</li>}
          </ul>
        </div>
        <form onSubmit={save} className="app-card space-y-4 p-5">
          <p className="font-bold">Payments and limits</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {sel("MoMo goes to", "momo", "A mobile money account", (t) => t === "MOBILE_MONEY" || t === "BANK" || t === "PROVIDER")}
            {sel("Card goes to", "card", "A bank or card-settlement account", (t) => t === "BANK" || t === "PROVIDER" || t === "MOBILE_MONEY")}
            {sel("Opening float comes from", "source", "For example the office safe. Blank = already in the drawer", (t) => t === "CASH" || t === "BANK")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="A discount above this % needs a supervisor"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={form.maxDiscount} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))} disabled={!canEdit} /></FormField>
            <FormField label="A refund above this amount needs a supervisor" hint="Blank = every refund needs one"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={form.refundAbove} onChange={(e) => setForm((f) => ({ ...f, refundAbove: e.target.value }))} disabled={!canEdit} /></FormField>
            <FormField label="Receipt header"><input className={control} value={form.header} onChange={(e) => setForm((f) => ({ ...f, header: e.target.value }))} maxLength={300} disabled={!canEdit} /></FormField>
            <FormField label="Receipt footer"><input className={control} value={form.footer} onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))} maxLength={300} placeholder="Thank you for shopping with us!" disabled={!canEdit} /></FormField>
          </div>
          {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}
          {canEdit && <button type="submit" className="app-button-primary" disabled={busy || !s}>{busy ? <Spinner size="xs" /> : null} Save</button>}
          <p className="text-xs text-ink/50">Who can do what: selling needs POS &gt; post; opening and closing a till needs POS &gt; create; refunds need POS &gt; void; changing a price, a big discount, a big refund, selling below zero stock and these settings need POS &gt; approve (a supervisor).</p>
        </form>
        <AddRegisterModal open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
      </div>
    </FinGuard>
  );
}

function AddRegisterModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { accounts } = usePayAccounts();
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setAccount(""); setError(""); } }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await finSend("POST", "/pos/registers", { name: name.trim(), cashAccountId: account }); onDone(); } catch (err) { setError(errMsg(err, "Could not add the till.")); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add a till" size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <FormField label="Name" required><input className={control} value={name} onChange={(e) => setName(e.target.value)} placeholder="Till 1, Counter 2…" maxLength={80} required /></FormField>
        <FormField label="Cash drawer account" required hint="A cash payment account. Create one under Banking if you need another."><select className={control} value={account} onChange={(e) => setAccount(e.target.value)} required><option value="">Choose…</option>{accounts.filter((a) => a.isActive && a.type === "CASH").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="app-button-primary" disabled={busy || !name.trim() || !account}>{busy ? <Spinner size="xs" /> : null} Add</button></div>
      </form>
    </Modal>
  );
}
