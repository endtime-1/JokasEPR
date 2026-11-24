"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, CreditCard, Minus, Plus, Search, Smartphone, Trash2, UserRound } from "lucide-react";
import { FormField } from "../form-field";
import { Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { FinItem, Method, PosSession, Quote, Register, Sale, cedi, newKey, qty } from "./fin-pos-api";
import { CloseTillModal, PosTabs } from "./fin-pos-pages";
import { ReceiptModal } from "./fin-pos-receipt-view";
import { ContactSelect, control } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

type CartLine = { key: string; itemId?: string; description: string; quantity: string; unitPrice: string; shelf?: string; discountPercent: string; isCharge: boolean; unit?: string; onHand?: string; track?: boolean };

let lineSeq = 0;
const nextKey = () => `l${++lineSeq}`;

/**
 * The till. Built to be used with a keyboard and a barcode scanner (a scanner just types into the search box and presses Enter)
 * and on a tablet (large touch targets). F2 = search, F9 = pay, Esc = clear the search.
 */
export function FinPosTillPage() {
  useFinHeader("POS", "Walk-in sales, tills, refunds and reports");
  const canSell = useFinPermission("fin.pos.post");
  const supervisor = useFinPermission("fin.pos.approve");
  const [session, setSession] = useState<PosSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSession = useCallback(() => {
    finGet<PosSession | null>("/pos/sessions/current").then((r) => { setSession(r.data); setError(""); }).catch((e) => setError(errMsg(e, "Could not check your till."))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadSession(); }, [loadSession]);

  return (
    <FinGuard permission="fin.pos.view">
      <PosTabs />
      <ErrorNote message={error} />
      {loading ? <div className="py-16 text-center"><Spinner /></div> : !canSell ? (
        <div className="app-card px-6 py-10 text-center text-ink/60">You can look at POS sales and reports, but you do not have permission to sell.</div>
      ) : session ? (
        <Selling session={session} supervisor={supervisor} onChanged={loadSession} />
      ) : (
        <OpenTill onOpened={(s) => setSession(s)} />
      )}
    </FinGuard>
  );
}

// ─── open a till ─────────────────────────────────────────────────────────────

function OpenTill({ onOpened }: { onOpened: (s: PosSession) => void }) {
  const canOpen = useFinPermission("fin.pos.create");
  const [registers, setRegisters] = useState<Register[]>([]);
  const [registerId, setRegisterId] = useState("");
  const [float, setFloat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { finGet<Register[]>("/pos/registers").then((r) => { setRegisters(r.data); const free = r.data.find((x) => x.isActive && !x.openSession); if (free) setRegisterId(free.id); }).catch((e) => setError(errMsg(e))); }, []);
  async function open(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { onOpened((await finSend<PosSession>("POST", "/pos/sessions/open", { registerId, openingFloat: float.trim() || "0" })).data); } catch (err) { setError(errMsg(err, "Could not open the till.")); } finally { setBusy(false); }
  }
  const free = registers.filter((r) => r.isActive && !r.openSession);
  return (
    <form onSubmit={open} className="app-card mx-auto grid max-w-md gap-4 p-6">
      <p className="text-lg font-bold">Open your till</p>
      <p className="text-sm text-ink/60">Count the cash in the drawer and enter it as the opening float. You cannot sell until a till is open.</p>
      <ErrorNote message={error} />
      {registers.length === 0 && <p className="text-sm text-amber-700">There are no tills yet. A supervisor can add one under POS &gt; Settings.</p>}
      {registers.length > 0 && free.length === 0 && <p className="text-sm text-amber-700">Every till is already open: {registers.filter((r) => r.openSession).map((r) => `${r.name} (${r.openSession!.cashierName})`).join(", ")}.</p>}
      <FormField label="Till" required><select className={`${control} h-12`} value={registerId} onChange={(e) => setRegisterId(e.target.value)} required><option value="">Choose a till…</option>{free.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></FormField>
      <FormField label="Opening float (cash in the drawer)"><input className={`${control} h-12 text-right text-lg tabular-nums`} inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0.00" /></FormField>
      <button type="submit" className="app-button-primary h-12 justify-center text-base" disabled={busy || !registerId || !canOpen}>{busy ? <Spinner size="xs" /> : null} Open till</button>
      {!canOpen && <p className="text-xs text-ink/55">You do not have permission to open a till.</p>}
    </form>
  );
}

// ─── selling ─────────────────────────────────────────────────────────────────

function Selling({ session, supervisor, onChanged }: { session: PosSession; supervisor: boolean; onChanged: () => void }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [overall, setOverall] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<FinItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState(false);
  const [picking, setPicking] = useState(false);
  const [charging, setCharging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState(newKey);
  const searchRef = useRef<HTMLInputElement>(null);

  // the product grid / search results
  useEffect(() => {
    const t = setTimeout(() => {
      setSearching(true);
      finGet<FinItem[]>(`/pos/items?search=${encodeURIComponent(typed.trim())}`).then((r) => setResults(r.data)).catch(() => setResults([])).finally(() => setSearching(false));
    }, typed ? 180 : 0);
    return () => clearTimeout(t);
  }, [typed]);

  const addItem = useCallback((i: FinItem) => {
    setMessage("");
    setLines((ls) => {
      const same = ls.find((l) => l.itemId === i.id && l.unitPrice === i.sellPrice && !l.discountPercent);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: String(Number(l.quantity) + 1) } : l));
      return [...ls, { key: nextKey(), itemId: i.id, description: i.name, quantity: "1", unitPrice: i.sellPrice, shelf: i.sellPrice, discountPercent: "", isCharge: false, unit: i.unit, onHand: i.qtyOnHand, track: i.trackStock }];
    });
  }, []);

  /** Enter in the search box: a scan (exact barcode or SKU) adds that item; otherwise the first match. */
  async function onEnter() {
    const code = typed.trim();
    if (!code) return;
    try {
      const r = await finGet<{ exact: FinItem | null; matches: FinItem[] }>(`/pos/items/lookup?code=${encodeURIComponent(code)}`);
      const hit = r.data.exact ?? r.data.matches[0];
      if (hit) { addItem(hit); setTyped(""); } else setMessage(`Nothing found for “${code}”.`);
    } catch (e) {
      setMessage(errMsg(e, "Could not look that up."));
    }
  }

  // exact totals from the server (tax, discounts, rounding), whenever the cart changes
  const cartBody = useMemo(() => ({
    lines: lines.map((l) => ({ ...(l.itemId ? { itemId: l.itemId } : { description: l.description }), quantity: l.quantity || "0", ...(l.itemId && l.unitPrice === l.shelf ? {} : { unitPrice: l.unitPrice }), ...(l.discountPercent ? { discountPercent: l.discountPercent } : {}), ...(l.isCharge ? { isCharge: true } : {}) })),
    ...(overall.trim() ? { discountPercent: overall.trim() } : {})
  }), [lines, overall]);
  useEffect(() => {
    if (lines.length === 0) { setQuote(null); setQuoteError(""); return; }
    const t = setTimeout(() => {
      finSend<Quote>("POST", "/pos/quote", cartBody).then((r) => { setQuote(r.data); setQuoteError(""); }).catch((e) => { setQuote(null); setQuoteError(errMsg(e, "Could not price the cart.")); });
    }, 250);
    return () => clearTimeout(t);
  }, [cartBody, lines.length]);

  // keyboard: F2 search, F9 pay, Esc clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "F9") { e.preventDefault(); if (quote && !paying) setPaying(true); }
      else if (e.key === "Escape" && !paying && !picking && !charging && !closing && !receiptFor) { setTyped(""); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quote, paying, picking, charging, closing, receiptFor]);

  const setLine = (key: string, patch: Partial<CartLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const bump = (key: string, by: number) => setLines((ls) => ls.flatMap((l) => (l.key !== key ? [l] : Number(l.quantity) + by <= 0 ? [] : [{ ...l, quantity: String(Math.round((Number(l.quantity) + by) * 1000) / 1000) }])));

  function newSale() {
    setLines([]); setOverall(""); setCustomer(null); setQuote(null); setClientKey(newKey()); setTyped(""); setReceiptFor(null); setPaying(false);
    onChanged();
    setTimeout(() => searchRef.current?.focus(), 50);
  }
  const quoteLine = (i: number) => quote?.lines[i];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
      {/* left: search and items */}
      <div className="space-y-3">
        <div className="app-card flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
          <span className="font-bold">{session.registerName}</span>
          <span className="text-ink/55">{session.cashierName} · {session.number}</span>
          <span className="text-ink/55">Sales today: <b className="tabular-nums text-ink">{session.totals.sales}</b> · Cash expected <b className="tabular-nums text-ink">{cedi(session.expectedCash)}</b></span>
          <div className="flex-1" />
          <Link href="/fin/pos/sales" className="font-semibold text-brand hover:underline">Receipts</Link>
          <button className="font-semibold text-red-600 hover:underline" onClick={() => setClosing(true)}>Close till</button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" aria-hidden />
          <input ref={searchRef} autoFocus className="app-control h-14 w-full pl-11 text-lg" placeholder="Scan a barcode, or type a name or SKU, then Enter  (F2)" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onEnter(); } }} aria-label="Find an item" />
        </div>
        {message && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((i) => (
            <button key={i.id} onClick={() => addItem(i)} className="app-card flex min-h-[84px] flex-col items-start justify-between gap-1 p-3 text-left transition hover:border-brand/50 active:scale-[0.98]">
              <span className="line-clamp-2 text-sm font-semibold leading-snug">{i.name}</span>
              <span className="flex w-full items-end justify-between text-xs"><span className="text-base font-bold tabular-nums">{cedi(i.sellPrice)}</span>{i.trackStock && <span className={i.lowStock || Number(i.qtyOnHand) <= 0 ? "font-semibold text-red-600" : "text-ink/45"}>{qty(i.qtyOnHand)} {i.unit}</span>}</span>
            </button>
          ))}
          {searching && results.length === 0 && <div className="col-span-full py-6 text-center"><Spinner /></div>}
          {!searching && results.length === 0 && <p className="col-span-full py-6 text-center text-sm text-ink/50">No items match.</p>}
        </div>
      </div>

      {/* right: the cart */}
      <div className="app-card flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <p className="flex-1 font-bold">Sale</p>
          <button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:bg-field" onClick={() => setPicking(true)}><UserRound className="h-4 w-4" aria-hidden />{customer ? customer.name : "Walk-in"}</button>
          <button className="inline-flex h-10 items-center gap-1 rounded-lg border border-line px-3 text-sm hover:bg-field" onClick={() => setCharging(true)}><Plus className="h-4 w-4" aria-hidden /> Charge</button>
        </div>
        <div className="min-h-[160px] flex-1 divide-y divide-line overflow-y-auto">
          {lines.length === 0 && <p className="px-4 py-12 text-center text-sm text-ink/50">Scan or tap an item to start.</p>}
          {lines.map((l, idx) => {
            const q = quoteLine(idx);
            return (
              <div key={l.key} className="space-y-1.5 px-4 py-2.5">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{l.description}{l.isCharge && <span className="ml-1 text-xs font-normal text-ink/45">(charge)</span>}</p>
                  <p className="whitespace-nowrap text-sm font-bold tabular-nums">{q ? cedi(q.total) : ""}</p>
                  <button className="rounded-md p-2 text-ink/40 hover:bg-field hover:text-red-600" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.description}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="flex items-center rounded-lg border border-line">
                    <button className="grid h-10 w-10 place-items-center hover:bg-field" onClick={() => bump(l.key, -1)} aria-label="One less"><Minus className="h-4 w-4" aria-hidden /></button>
                    <input className="h-10 w-16 border-x border-line bg-transparent text-center tabular-nums outline-none" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} aria-label={`Quantity of ${l.description}`} />
                    <button className="grid h-10 w-10 place-items-center hover:bg-field" onClick={() => bump(l.key, 1)} aria-label="One more"><Plus className="h-4 w-4" aria-hidden /></button>
                  </div>
                  <span className="text-ink/45">x</span>
                  {supervisor || l.isCharge ? <input className="app-control h-10 w-24 text-right tabular-nums" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} aria-label="Price" /> : <span className="tabular-nums">{cedi(l.unitPrice)}</span>}
                  <input className="app-control h-10 w-20 text-right tabular-nums" inputMode="decimal" value={l.discountPercent} onChange={(e) => setLine(l.key, { discountPercent: e.target.value })} placeholder="disc %" aria-label="Discount percent" />
                </div>
                {l.track && l.onHand !== undefined && Number(l.quantity) > Number(l.onHand) && <p className="text-xs font-medium text-amber-700">Only {qty(l.onHand)} {l.unit} in stock.</p>}
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
          {quoteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{quoteError}</p>}
          {quote?.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
          <div className="flex items-center justify-between gap-3"><span className="text-ink/60">Discount on the whole sale</span><span className="flex items-center gap-1"><input className="app-control h-9 w-16 text-right tabular-nums" inputMode="decimal" value={overall} onChange={(e) => setOverall(e.target.value)} aria-label="Overall discount percent" placeholder="0" /> %</span></div>
          {quote && Number(quote.discountTotal) > 0 && <div className="flex justify-between"><span className="text-ink/60">Discounts</span><span className="tabular-nums">-{cedi(quote.discountTotal)}</span></div>}
          {quote && Number(quote.taxTotal) > 0 && <div className="flex justify-between"><span className="text-ink/60">Tax included</span><span className="tabular-nums">{cedi(quote.taxTotal)}</span></div>}
          <div className="flex items-baseline justify-between"><span className="text-base font-bold">Total</span><span className="text-3xl font-extrabold tabular-nums">{quote ? cedi(quote.total) : "0.00"}</span></div>
          <button className="app-button-primary h-14 w-full justify-center text-lg" disabled={!quote || lines.length === 0} onClick={() => setPaying(true)}>Pay (F9)</button>
          {lines.length > 0 && <button className="w-full py-1 text-xs font-semibold text-ink/50 hover:text-red-600" onClick={() => { setLines([]); setOverall(""); setCustomer(null); setClientKey(newKey()); }}>Clear the sale</button>}
        </div>
      </div>

      <PayModal open={paying} quote={quote} cartBody={cartBody} customerId={customer?.id} clientKey={clientKey} onClose={() => setPaying(false)} onPaid={(sale) => { setPaying(false); setReceiptFor(sale.id); }} />
      <ReceiptModal saleId={receiptFor} onClose={newSale} onNewSale={newSale} />
      <CustomerModal open={picking} current={customer} onClose={() => setPicking(false)} onPick={(c) => { setCustomer(c); setPicking(false); }} />
      <ChargeModal open={charging} onClose={() => setCharging(false)} onAdd={(d, p) => { setLines((ls) => [...ls, { key: nextKey(), description: d, quantity: "1", unitPrice: p, discountPercent: "", isCharge: true }]); setCharging(false); }} />
      <CloseTillModal session={closing ? session : null} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); onChanged(); }} />
    </div>
  );
}

// ─── payment ─────────────────────────────────────────────────────────────────

type PayRow = { key: string; method: Method; amount: string; tendered: string; reference: string };

function PayModal({ open, quote, cartBody, customerId, clientKey, onClose, onPaid }: { open: boolean; quote: Quote | null; cartBody: object; customerId?: string; clientKey: string; onClose: () => void; onPaid: (s: Sale) => void }) {
  const total = Math.round(Number(quote?.total ?? 0) * 100);
  const [rows, setRows] = useState<PayRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setRows([{ key: nextKey(), method: "CASH", amount: quote?.total ?? "", tendered: "", reference: "" }]); setError(""); setTimeout(() => first.current?.focus(), 60); } }, [open]);

  const pesewas = (s: string) => Math.round(Number(s || 0) * 100);
  const paid = rows.reduce((s, r) => s + pesewas(r.amount), 0);
  const remaining = total - paid;
  const cashTendered = rows.filter((r) => r.method === "CASH").reduce((s, r) => s + (r.tendered.trim() ? pesewas(r.tendered) : pesewas(r.amount)), 0);
  const cashApplied = rows.filter((r) => r.method === "CASH").reduce((s, r) => s + pesewas(r.amount), 0);
  const change = Math.max(0, cashTendered - cashApplied);
  const set = (key: string, patch: Partial<PayRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (method: Method) => setRows((rs) => [...rs, { key: nextKey(), method, amount: remaining > 0 ? (remaining / 100).toFixed(2) : "", tendered: "", reference: "" }]);
  const okToPay = remaining === 0 && rows.every((r) => pesewas(r.amount) > 0 && (r.method !== "CASH" || !r.tendered.trim() || pesewas(r.tendered) >= pesewas(r.amount)));

  async function pay(e?: FormEvent) {
    e?.preventDefault();
    if (!okToPay || busy) return;
    setBusy(true); setError("");
    try {
      const r = await finSend<Sale>("POST", "/pos/sales", {
        clientKey, ...cartBody, ...(customerId ? { contactId: customerId } : {}),
        payments: rows.map((p) => ({ method: p.method, amount: p.amount, ...(p.method === "CASH" && p.tendered.trim() ? { tendered: p.tendered } : {}), ...(p.reference.trim() ? { reference: p.reference.trim() } : {}) }))
      });
      onPaid(r.data);
    } catch (err) {
      setError(errMsg(err, "The sale could not be completed. Nothing was charged: you can try again."));
    } finally {
      setBusy(false);
    }
  }
  const icon = { CASH: Banknote, MOMO: Smartphone, CARD: CreditCard } as const;
  return (
    <Modal open={open} onClose={onClose} title="Take payment" size="md">
      <form onSubmit={pay} className="grid gap-4">
        <div className="flex items-baseline justify-between rounded-xl bg-field px-4 py-3"><span className="font-semibold">Total to pay</span><span className="text-3xl font-extrabold tabular-nums">{cedi(quote?.total)}</span></div>
        <div className="grid gap-3">
          {rows.map((r, i) => {
            const Icon = icon[r.method];
            return (
              <div key={r.key} className="grid gap-2 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-brand" aria-hidden />
                  <select className="app-control h-11 flex-1" value={r.method} onChange={(e) => set(r.key, { method: e.target.value as Method, tendered: "" })} aria-label="Payment method"><option value="CASH">Cash</option><option value="MOMO">MoMo</option><option value="CARD">Card</option></select>
                  <input ref={i === 0 ? first : undefined} className="app-control h-11 w-32 text-right text-lg tabular-nums" inputMode="decimal" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} aria-label="Amount" />
                  {rows.length > 1 && <button type="button" className="rounded-md p-2 text-ink/40 hover:text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove payment"><Trash2 className="h-4 w-4" aria-hidden /></button>}
                </div>
                {r.method === "CASH" ? (
                  <div className="flex items-center gap-2 text-sm"><span className="text-ink/60">Customer gives</span><input className="app-control h-11 w-32 text-right tabular-nums" inputMode="decimal" value={r.tendered} onChange={(e) => set(r.key, { tendered: e.target.value })} placeholder={r.amount} aria-label="Cash handed over" />
                    <button type="button" className="rounded-lg border border-line px-2.5 py-2 text-xs font-semibold hover:bg-field" onClick={() => set(r.key, { tendered: r.amount })}>Exact</button>
                    {[10, 20, 50, 100, 200].map((n) => <button type="button" key={n} className="hidden rounded-lg border border-line px-2 py-2 text-xs hover:bg-field sm:block" onClick={() => set(r.key, { tendered: String(Math.max(n, Math.ceil(Number(r.amount || 0) / n) * n)) })}>{n}</button>)}</div>
                ) : (
                  <input className="app-control h-10" placeholder={r.method === "MOMO" ? "MoMo transaction ID (optional)" : "Card slip / approval no. (optional)"} value={r.reference} onChange={(e) => set(r.key, { reference: e.target.value })} aria-label="Reference" />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" className="app-button-secondary" onClick={() => add("MOMO")}>+ MoMo</button><button type="button" className="app-button-secondary" onClick={() => add("CARD")}>+ Card</button><button type="button" className="app-button-secondary" onClick={() => add("CASH")}>+ Cash</button></div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className={`rounded-xl px-3 py-2 ${remaining === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><p className="text-xs">{remaining >= 0 ? "Still to pay" : "Over by"}</p><p className="text-xl font-bold tabular-nums">{cedi(Math.abs(remaining) / 100)}</p></div>
          <div className="rounded-xl bg-field px-3 py-2"><p className="text-xs text-ink/60">Change to give back</p><p className="text-xl font-bold tabular-nums">{cedi(change / 100)}</p></div>
        </div>
        <ErrorNote message={error} />
        <button type="submit" className="app-button-primary h-14 justify-center text-lg" disabled={!okToPay || busy}>{busy ? <Spinner size="xs" /> : null} Complete sale</button>
      </form>
    </Modal>
  );
}

function CustomerModal({ open, current, onClose, onPick }: { open: boolean; current: { id: string; name: string } | null; onClose: () => void; onPick: (c: { id: string; name: string } | null) => void }) {
  const [id, setId] = useState("");
  useEffect(() => { if (open) setId(current?.id ?? ""); }, [open, current]);
  return (
    <Modal open={open} onClose={onClose} title="Customer" size="sm">
      <div className="grid gap-4">
        <p className="text-sm text-ink/60">Optional. Leave it as a walk-in for an anonymous sale.</p>
        <ContactSelect value={id} onChange={(cid, c) => { setId(cid); if (c) onPick({ id: c.id, name: c.name }); }} />
        <div className="flex justify-between"><button className="text-sm font-semibold text-ink/60 hover:underline" onClick={() => onPick(null)}>Walk-in (no customer)</button><button className="app-button-secondary" onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  );
}

function ChargeModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (description: string, price: string) => void }) {
  const [d, setD] = useState("");
  const [p, setP] = useState("");
  useEffect(() => { if (open) { setD(""); setP(""); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add an extra charge" size="sm">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onAdd(d.trim(), p.trim()); }}>
        <FormField label="What for" required><input className={`${control} h-11`} value={d} onChange={(e) => setD(e.target.value)} placeholder="Delivery, bag, service…" maxLength={300} required autoFocus /></FormField>
        <FormField label="Amount" required><input className={`${control} h-11 text-right tabular-nums`} inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} required /></FormField>
        <div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="app-button-primary" disabled={!d.trim() || !p.trim()}>Add</button></div>
      </form>
    </Modal>
  );
}
