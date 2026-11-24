"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, FileX } from "lucide-react";
import { API_URL } from "../../lib/api";
import { ReceiptView } from "./fin-pos-receipt-view";
import type { Receipt as PosReceiptData } from "./fin-pos-api";

/**
 * The pages a CUSTOMER sees when they open the link from an email or WhatsApp message. No login, no staff menu.
 * They read from /fin/public/*, which answers every bad or revoked link with the same "not found".
 */

type Business = { businessName: string; tin: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; country: string; phone: string | null; email: string | null; logoDataUrl: string | null; currency: string };

type PublicInvoice = {
  business: Business;
  invoice: {
    number: string | null;
    displayStatus: string;
    issueDate: string;
    dueDate: string;
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    total: string;
    paidAmount: string;
    creditedAmount: string;
    balanceDue: string;
    notes: string | null;
    terms: string | null;
    contact: { name: string; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; phone: string | null; email: string | null; tin: string | null };
    lines: { description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; lineNet: string; isCharge: boolean }[];
  };
};

type PublicStatement = {
  business: Business;
  statement: { contact: { name: string; code: string; address: string[] }; from: string; to: string; openingBalance: string; closingBalance: string; totalDebits: string; totalCredits: string; unappliedDeposits: string; rows: { date: string; type: string; reference: string; description: string; debit: string; credit: string; balance: string }[] };
};

const nf = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: string | number) => nf.format(Number(v));

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
  VOID: "bg-gray-100 text-gray-600 border-gray-200",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 border-amber-200",
  SENT: "bg-blue-50 text-blue-700 border-blue-200"
};
const STATUS_TEXT: Record<string, string> = { PAID: "Paid", OVERDUE: "Overdue", VOID: "Void", PARTIALLY_PAID: "Partly paid", SENT: "Awaiting payment" };

function usePublic<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  useEffect(() => {
    let live = true;
    fetch(`${API_URL}${path}`, { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404) return setState("missing");
        if (!res.ok) return setState("error");
        const json = (await res.json()) as { data: T };
        setData(json.data);
        setState("ok");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [path]);
  return { data, state };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

function Missing({ error }: { error?: boolean }) {
  return (
    <Shell>
      <div className="app-card px-6 py-14 text-center">
        <FileX className="mx-auto h-10 w-10 text-ink/30" aria-hidden />
        <h1 className="mt-4 text-lg font-bold">{error ? "We could not load this page" : "This link is not valid"}</h1>
        <p className="mt-2 text-sm text-ink/60">{error ? "Please check your connection and try again." : "It may have expired or been replaced. Please ask the sender for a new link."}</p>
      </div>
    </Shell>
  );
}

function Letterhead({ b }: { b: Business }) {
  const addr = [b.addressLine1, b.addressLine2, [b.city, b.region].filter(Boolean).join(", "), b.country].filter(Boolean).join(", ");
  return (
    <div className="flex flex-wrap items-start gap-4">
      {b.logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoDataUrl} alt={b.businessName} className="max-h-14 max-w-[140px] object-contain" />
      )}
      <div className="min-w-0">
        <p className="text-lg font-bold">{b.businessName}</p>
        {addr && <p className="text-xs text-ink/55">{addr}</p>}
        <p className="text-xs text-ink/55">{[b.tin ? `TIN ${b.tin}` : "", b.phone ?? "", b.email ?? ""].filter(Boolean).join("  ·  ")}</p>
      </div>
    </div>
  );
}

/** "Pay now": starts a card / mobile money payment and sends the customer to the provider's page. Hidden when online payments are not set up. */
function PayNow({ token, balance, email, currency, onChecked }: { token: string; balance: string; email: string | null; currency: string; onChecked: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState("");
  const [mail, setMail] = useState(email ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const search = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const returned = search?.get("online") ?? "";

  useEffect(() => {
    fetch(`${API_URL}/fin/public/online/config`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { enabled?: boolean } } | null) => setEnabled(j?.data?.enabled === true))
      .catch(() => setEnabled(false));
  }, []);

  // Back from the provider: ask our server what happened, a few times, because the confirmation can take a moment.
  useEffect(() => {
    if (!returned) return;
    let live = true;
    let tries = 0;
    setNote("Confirming your payment…");
    const check = async () => {
      tries += 1;
      try {
        const res = await fetch(`${API_URL}/fin/public/invoices/${encodeURIComponent(token)}/payments/${encodeURIComponent(returned)}`, { cache: "no-store" });
        const j = (await res.json()) as { data?: { status?: string } };
        const s = j.data?.status;
        if (!live) return;
        if (s === "PAID") { setNote("Thank you. Your payment was received."); onChecked(); return; }
        if (s === "FAILED") { setNote("The payment was not completed. You have not been charged. You can try again."); return; }
        if (s === "REVIEW") { setNote("We received your payment and are confirming it. It will show on this invoice shortly."); return; }
      } catch { /* try again */ }
      if (tries < 6 && live) setTimeout(check, 3000);
      else if (live) setNote("We are still waiting for confirmation. If you were charged, it will show on this invoice shortly.");
    };
    void check();
    return () => { live = false; };
  }, [returned, token]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/fin/public/invoices/${encodeURIComponent(token)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(amount.trim() ? { amount: amount.trim() } : {}), ...(mail.trim() ? { email: mail.trim() } : {}) })
      });
      const j = (await res.json()) as { data?: { url?: string }; message?: string | string[] };
      if (!res.ok || !j.data?.url) throw new Error(Array.isArray(j.message) ? j.message.join(" ") : j.message || "Could not start the payment.");
      window.location.href = j.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  if (!enabled && !note) return null;
  return (
    <div className="mt-4 print:hidden">
      {note && <p className="mb-3 rounded-lg bg-brand/10 px-4 py-3 text-center text-sm font-medium text-ink">{note}</p>}
      {enabled && Number(balance) > 0 && (
        <form onSubmit={pay} className="app-card mx-auto grid max-w-md gap-3 p-5">
          <p className="text-center font-bold">Pay this invoice online</p>
          <p className="text-center text-xs text-ink/55">Mobile money or card. You pay on a secure page.</p>
          <label className="grid gap-1 text-sm font-semibold">Amount ({currency})
            <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={n(balance)} aria-label="Amount to pay" />
            <span className="text-xs font-normal text-ink/50">Leave blank to pay the full balance, {n(balance)}.</span>
          </label>
          {!email && <label className="grid gap-1 text-sm font-semibold">Your email (for the receipt)<input type="email" className="app-control w-full" value={mail} onChange={(e) => setMail(e.target.value)} required /></label>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="app-button-primary justify-center" disabled={busy}>{busy ? "Please wait…" : "Pay now"}</button>
        </form>
      )}
    </div>
  );
}

export function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [refresh, setRefresh] = useState(0);
  const { data, state } = usePublic<PublicInvoice>(`/fin/public/invoices/${encodeURIComponent(token)}?r=${refresh}`);
  if (state === "loading" && !data) return <Shell><div className="py-20 text-center text-sm text-ink/50">Loading…</div></Shell>;
  if (state !== "ok" || !data) return <Missing error={state === "error"} />;
  const { business: b, invoice: inv } = data;
  const c = inv.contact;
  const owing = Number(inv.balanceDue) > 0 && inv.displayStatus !== "VOID";

  return (
    <Shell>
      <article className="app-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Letterhead b={b} />
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tight">INVOICE</p>
            <p className="font-mono text-sm font-semibold">{inv.number}</p>
            <span className={`mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[inv.displayStatus] ?? STATUS_STYLE.SENT}`}>{STATUS_TEXT[inv.displayStatus] ?? inv.displayStatus}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Bill to</p>
            <p className="mt-1 font-semibold">{c.name}</p>
            <p className="text-sm text-ink/60">{[c.addressLine1, c.addressLine2, [c.city, c.region].filter(Boolean).join(", "), c.phone, c.email, c.tin ? `TIN ${c.tin}` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-sm sm:text-right">
            <p><span className="text-ink/55">Date: </span>{inv.issueDate}</p>
            <p><span className="text-ink/55">Due: </span><b>{inv.dueDate}</b></p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Disc %</th><th className="py-2 text-right">Tax %</th><th className="py-2 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-3">{l.description}{l.isCharge && <span className="ml-1.5 text-xs text-ink/45">(charge)</span>}</td>
                  <td className="py-2.5 text-right tabular-nums">{Number(l.quantity)}</td>
                  <td className="py-2.5 text-right tabular-nums">{n(l.unitPrice)}</td>
                  <td className="py-2.5 text-right tabular-nums">{Number(l.discountPercent) ? Number(l.discountPercent) : ""}</td>
                  <td className="py-2.5 text-right tabular-nums">{Number(l.taxRatePercent) ? Number(l.taxRatePercent) : ""}</td>
                  <td className="py-2.5 text-right tabular-nums">{n(l.lineNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-5 w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular-nums">{n(inv.subtotal)}</span></div>
          {Number(inv.discountTotal) > 0 && <div className="flex justify-between"><span className="text-ink/60">Discount</span><span className="tabular-nums">- {n(inv.discountTotal)}</span></div>}
          {Number(inv.taxTotal) > 0 && <div className="flex justify-between"><span className="text-ink/60">Tax</span><span className="tabular-nums">{n(inv.taxTotal)}</span></div>}
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold"><span>Total ({b.currency})</span><span className="tabular-nums">{n(inv.total)}</span></div>
          {Number(inv.paidAmount) > 0 && <div className="flex justify-between"><span className="text-ink/60">Paid</span><span className="tabular-nums">- {n(inv.paidAmount)}</span></div>}
          {Number(inv.creditedAmount) > 0 && <div className="flex justify-between"><span className="text-ink/60">Credits</span><span className="tabular-nums">- {n(inv.creditedAmount)}</span></div>}
          {inv.displayStatus !== "VOID" && <div className={`flex justify-between text-base font-bold ${owing ? "text-brand" : "text-emerald-600"}`}><span>Balance due</span><span className="tabular-nums">{n(inv.balanceDue)}</span></div>}
        </div>

        {(inv.notes || inv.terms) && (
          <div className="mt-6 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
            {inv.notes && <div><p className="text-xs font-bold uppercase tracking-wide text-ink/45">Notes</p><p className="mt-1 whitespace-pre-line text-ink/75">{inv.notes}</p></div>}
            {inv.terms && <div><p className="text-xs font-bold uppercase tracking-wide text-ink/45">Terms</p><p className="mt-1 whitespace-pre-line text-ink/75">{inv.terms}</p></div>}
          </div>
        )}
      </article>
      {inv.displayStatus !== "VOID" && <PayNow token={token} balance={inv.balanceDue} email={c.email} currency={b.currency} onChecked={() => setRefresh((x) => x + 1)} />}
      <div className="mt-4 flex justify-center print:hidden">
        <a className="app-button-primary" href={`${API_URL}/fin/public/invoices/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
      </div>
    </Shell>
  );
}

type PublicReceipt = {
  business: Business;
  receipt: { number: string; receiptDate: string; amount: string; methodLabel: string; reference: string | null; notes: string | null; status: string; creditKept: string; customer: { name: string }; allocations: { invoiceNumber: string | null; amount: string }[] };
};

export function PublicReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const { data, state } = usePublic<PublicReceipt>(`/fin/public/receipts/${encodeURIComponent(token)}`);
  if (state === "loading") return <Shell><div className="py-20 text-center text-sm text-ink/50">Loading…</div></Shell>;
  if (state !== "ok" || !data) return <Missing error={state === "error"} />;
  const { business: b, receipt: r } = data;
  const voided = r.status === "VOID";
  return (
    <Shell>
      <article className="app-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Letterhead b={b} />
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tight">RECEIPT</p>
            <p className="font-mono text-sm font-semibold">{r.number}</p>
            {voided && <span className="mt-1 inline-block rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">Void</span>}
          </div>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-ink/45">Received from</p><p className="mt-1 font-semibold">{r.customer.name}</p></div>
          <div className="text-sm sm:text-right"><p><span className="text-ink/55">Date: </span>{r.receiptDate}</p><p><span className="text-ink/55">Paid by: </span>{r.methodLabel}{r.reference ? ` · ${r.reference}` : ""}</p></div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="py-2">Paid towards</th><th className="py-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-line">
              {r.allocations.map((a, i) => <tr key={i}><td className="py-2.5">Invoice {a.invoiceNumber}</td><td className="py-2.5 text-right tabular-nums">{n(a.amount)}</td></tr>)}
              {Number(r.creditKept) > 0 && <tr><td className="py-2.5">Kept as credit on your account</td><td className="py-2.5 text-right tabular-nums">{n(r.creditKept)}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-5 w-full max-w-xs border-t border-line pt-2 text-base font-bold"><div className="flex justify-between"><span>Total received ({b.currency})</span><span className="tabular-nums">{n(r.amount)}</span></div></div>
        {voided && <p className="mt-4 text-sm text-ink/60">This receipt has been cancelled.</p>}
        {r.notes && <p className="mt-4 whitespace-pre-line text-sm text-ink/70">{r.notes}</p>}
      </article>
      <div className="mt-4 flex justify-center print:hidden">
        <a className="app-button-primary" href={`${API_URL}/fin/public/receipts/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
      </div>
    </Shell>
  );
}

/** A till receipt opened from the WhatsApp link: the same receipt, with a PDF. No login. */
export function PublicPosReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const { data, state } = usePublic<PosReceiptData>(`/fin/public/pos-receipts/${encodeURIComponent(token)}`);
  if (state === "loading") return <Shell><div className="py-20 text-center text-sm text-ink/50">Loading…</div></Shell>;
  if (state !== "ok" || !data) return <Missing error={state === "error"} />;
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 text-ink">
      <div className="mx-auto max-w-sm">
        <div className="app-card p-3"><ReceiptView r={data} /></div>
        <div className="mt-4 flex justify-center gap-2 print:hidden">
          <button className="app-button-secondary" onClick={() => window.print()}>Print</button>
          <a className="app-button-primary" href={`${API_URL}/fin/public/pos-receipts/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
        </div>
      </div>
    </div>
  );
}

export function PublicStatementPage() {
  const { token } = useParams<{ token: string }>();
  const { data, state } = usePublic<PublicStatement>(`/fin/public/statements/${encodeURIComponent(token)}`);
  if (state === "loading") return <Shell><div className="py-20 text-center text-sm text-ink/50">Loading…</div></Shell>;
  if (state !== "ok" || !data) return <Missing error={state === "error"} />;
  const { business: b, statement: s } = data;
  return (
    <Shell>
      <article className="app-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Letterhead b={b} />
          <div className="text-right"><p className="text-2xl font-extrabold tracking-tight">STATEMENT</p><p className="text-sm text-ink/60">{s.from} to {s.to}</p></div>
        </div>
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Customer</p>
          <p className="mt-1 font-semibold">{s.contact.name}</p>
          <p className="text-sm text-ink/60">{s.contact.address.join(" · ")}</p>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="py-2">Date</th><th className="py-2">Reference</th><th className="py-2">Details</th><th className="py-2 text-right">Charges</th><th className="py-2 text-right">Payments</th><th className="py-2 text-right">Balance</th></tr></thead>
            <tbody className="divide-y divide-line">
              <tr className="bg-field/40"><td className="py-2" colSpan={5}>Opening balance</td><td className="py-2 text-right font-semibold tabular-nums">{n(s.openingBalance)}</td></tr>
              {s.rows.map((r, i) => (
                <tr key={i}><td className="whitespace-nowrap py-2">{r.date}</td><td className="py-2 font-mono text-xs">{r.reference}</td><td className="py-2">{r.description}</td><td className="py-2 text-right tabular-nums">{r.debit ? n(r.debit) : ""}</td><td className="py-2 text-right tabular-nums">{r.credit ? n(r.credit) : ""}</td><td className="py-2 text-right tabular-nums">{n(r.balance)}</td></tr>
              ))}
              {s.rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink/50">No activity in this period.</td></tr>}
            </tbody>
            <tfoot className="border-t-2 border-line font-bold"><tr><td className="py-3" colSpan={5}>Balance due ({b.currency})</td><td className="py-3 text-right tabular-nums">{n(s.closingBalance)}</td></tr></tfoot>
          </table>
        </div>
        {Number(s.unappliedDeposits) > 0 && <p className="mt-3 text-sm text-ink/60">Deposits we are holding for you: <b className="tabular-nums">{n(s.unappliedDeposits)}</b></p>}
      </article>
      <div className="mt-4 flex justify-center print:hidden">
        <a className="app-button-primary" href={`${API_URL}/fin/public/statements/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
      </div>
    </Shell>
  );
}
