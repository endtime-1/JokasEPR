"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Plus, Printer } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { apiFetchResponse } from "../../lib/api";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { VoidModal } from "./fin-sales-invoice-pages";
import { ContactLite, Invoice, Totals, useSalesLookups } from "./fin-sales-api";
import { PaymentAccountSelect, usePayAccounts } from "./fin-banking-parts";
import { ContactSelect, SalesTabs, control, money } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const METHODS = [["CASH", "Cash"], ["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["CARD", "Card"]] as const;
const methodLabel = (m: string | null) => METHODS.find(([v]) => v === m)?.[1] ?? "";

function usePagedList<T>(path: string, deps: unknown[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [totals, setTotals] = useState<Totals>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const take = 50;
  useEffect(() => {
    setLoading(true);
    const sep = path.includes("?") ? "&" : "?";
    finGet<T[]>(`${path}${sep}page=${page}&take=${take}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta?.total ?? 0);
        setTotals((r.meta as { totals?: Totals } | undefined)?.totals ?? {});
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the list.")))
      .finally(() => setLoading(false));
  }, [path, page, reload, ...deps]);
  return { rows, totals, total, page, setPage, error, loading, refresh: () => setReload((n) => n + 1), pages: Math.max(1, Math.ceil(total / take)) };
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (fn: (p: number) => number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <button className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span className="text-ink/60">Page {page} of {pages}</span>
      <button className="app-button-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  );
}

type OpenInvoice = Pick<Invoice, "id" | "number" | "issueDate" | "dueDate" | "total" | "balanceDue">;

// ─── receipts ────────────────────────────────────────────────────────────────

type Receipt = { id: string; number: string; contact: ContactLite; receiptDate: string; amount: string; method: string; reference: string | null; status: "POSTED" | "VOID"; voidReason: string | null; allocations: { id: string; invoiceNumber: string | null; amount: string }[] };

export function FinReceiptsPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canPost = useFinPermission("fin.sales.post");
  const canVoid = useFinPermission("fin.sales.void");
  const list = usePagedList<Receipt>("/sales/receipts", []);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Receipt | null>(null);
  const [sharing, setSharing] = useState<Receipt | null>(null);

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <ShareReceiptModal receipt={sharing} canPost={canPost} onClose={() => setSharing(null)} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink/55">Received (excluding void): <b className="tabular-nums text-ink">{money(list.totals.received ?? "0")}</b></span>
          <div className="flex-1" />
          {canPost && <button className="app-button-primary" onClick={() => setRecording(true)}><Plus className="h-4 w-4" aria-hidden /> Record receipt</button>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Paid by</th><th className="px-4 py-3">Invoices</th><th className="px-4 py-3 text-right">Amount</th><th className="w-20" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((r) => (
                <tr key={r.id} className={r.status === "VOID" ? "opacity-55" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{r.number}{r.status === "VOID" && <Badge variant="neutral" className="ml-2">Void</Badge>}</td>
                  <td className="px-4 py-2.5">{r.contact.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.receiptDate}</td>
                  <td className="px-4 py-2.5">{methodLabel(r.method)}{r.reference ? ` · ${r.reference}` : ""}</td>
                  <td className="px-4 py-2.5">{r.allocations.map((a) => a.invoiceNumber).join(", ")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(r.amount)}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    <button className="mr-3 text-xs font-semibold text-brand hover:underline" onClick={() => setSharing(r)}>Share</button>
                    {r.status === "POSTED" && canVoid && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setVoiding(r)}>Void</button>}
                  </td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No receipts yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <ReceiptModal open={recording} onClose={() => setRecording(false)} onDone={() => { setRecording(false); list.refresh(); }} />
        <VoidModal open={voiding !== null} title={`Void receipt ${voiding?.number ?? ""}`} text="The payment is reversed in the books and the invoices owe that money again." path={`/sales/receipts/${voiding?.id}/void`} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

type ReceiptShare = { link: string; whatsappUrl: string | null; email: string | null; phone: string | null };

/** The receipt as a PDF, a WhatsApp message with its link, or an email. */
function ShareReceiptModal({ receipt, canPost, onClose }: { receipt: Receipt | null; canPost: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<ReceiptShare | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setInfo(null); setError(""); setNote("");
    if (receipt) finGet<ReceiptShare>(`/sales/receipts/${receipt.id}/share`).then((r) => { setInfo(r.data); setTo(r.data.email ?? ""); }).catch((e) => setError(errMsg(e)));
  }, [receipt]);

  async function openPdf() {
    if (!receipt) return;
    setBusy("pdf"); setError("");
    try {
      const res = await apiFetchResponse(`/fin/sales/receipts/${receipt.id}/pdf`);
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      setError(errMsg(e, "Could not make the PDF."));
    } finally {
      setBusy("");
    }
  }
  async function sendEmail() {
    if (!receipt) return;
    setBusy("mail"); setError(""); setNote("");
    try {
      const r = await finSend<{ sentTo: string }>("POST", `/sales/receipts/${receipt.id}/email`, { to: to.trim() || undefined });
      setNote(`Sent to ${r.data.sentTo}.`);
    } catch (e) {
      setError(errMsg(e, "Could not send the email."));
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal open={receipt !== null} onClose={onClose} title={`Share receipt ${receipt?.number ?? ""}`} size="md">
      <div className="grid gap-4">
        <ErrorNote message={error} />
        {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}
        {!info && !error && <div className="py-6 text-center"><Spinner /></div>}
        {info && (
          <>
            <div className="flex flex-wrap gap-2">
              {info.whatsappUrl && <a className="app-button-primary" href={info.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden /> Share on WhatsApp</a>}
              <button className="app-button-secondary" onClick={openPdf} disabled={busy === "pdf"}><Printer className="h-4 w-4" aria-hidden /> PDF</button>
              <button className="app-button-secondary" onClick={() => void navigator.clipboard?.writeText(info.link).then(() => setNote("Link copied."))}>Copy link</button>
            </div>
            {!info.whatsappUrl && <p className="text-xs text-ink/55">This customer has no phone number, so WhatsApp cannot be opened. Copy the link instead.</p>}
            {canPost && (
              <div className="grid gap-2 border-t border-line pt-3">
                <p className="text-sm font-semibold">Email the receipt (PDF attached)</p>
                <div className="flex gap-2">
                  <input type="email" className="app-control w-full" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" aria-label="Email address" />
                  <button className="app-button-secondary" onClick={sendEmail} disabled={busy === "mail"}>{busy === "mail" ? <Spinner size="xs" /> : null} Send</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ReceiptModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { accounts } = usePayAccounts();
  const [total, setTotal] = useState("");
  const [contactId, setContactId] = useState("");
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setContactId("");
      setInvoices([]);
      setAmounts({});
      setDate(today());
      setReference("");
      setTotal("");
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (open && !account && accounts.find((a) => a.isActive)) setAccount(accounts.find((a) => a.isActive)!.id);
  }, [open, accounts, account]);
  useEffect(() => {
    if (!contactId) return setInvoices([]);
    finGet<OpenInvoice[]>(`/sales/invoices?contactId=${contactId}&status=open&take=100`).then((r) => setInvoices(r.data)).catch((e) => setError(errMsg(e)));
  }, [contactId]);

  const entries = useMemo(() => invoices.filter((i) => Number(amounts[i.id] ?? 0) > 0), [invoices, amounts]);
  const totalPesewas = entries.reduce((s, i) => s + Math.round(Number(amounts[i.id]) * 100), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/sales/receipts", { contactId, receiptDate: date, method, paymentAccountId: account, ...(total.trim() ? { amount: total.trim() } : {}), reference: reference.trim() || undefined, allocations: entries.map((i) => ({ invoiceId: i.id, amount: amounts[i.id].trim() })) });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the receipt."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Record a receipt" size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <FormField label="Customer" required><ContactSelect value={contactId} onChange={(id) => setContactId(id)} /></FormField>
        {contactId && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Balance</th><th className="w-36 px-3 py-2 text-right">Pay now</th></tr></thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-mono text-xs">{i.number}</td>
                    <td className="px-3 py-2">{i.dueDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.balanceDue)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={amounts[i.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))} placeholder="0" aria-label={`Amount for ${i.number}`} />
                        <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setAmounts((a) => ({ ...a, [i.id]: i.balanceDue }))}>Full</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-ink/50">This customer has no unpaid invoices.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Date" required><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} required /></FormField>
          <FormField label="Paid by"><select className={control} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <div className="sm:col-span-2"><FormField label="Money went into" required><PaymentAccountSelect value={account} onChange={setAccount} accounts={accounts} label="Money went into" /></FormField></div>
        </div>
        <FormField label="Reference"><input className={control} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="MoMo ID, cheque number…" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Total received (optional)" hint="Leave blank if it equals the invoices above. A larger amount keeps the extra as customer credit."><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={money(totalPesewas / 100)} /></FormField>
          <p className="self-end text-sm text-ink/60">Paying invoices: <b className="tabular-nums text-ink">{money(totalPesewas / 100)}</b>{total.trim() && Math.round(Number(total) * 100) > totalPesewas ? <> · kept as credit: <b className="tabular-nums text-ink">{money((Math.round(Number(total) * 100) - totalPesewas) / 100)}</b></> : null}</p>
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !account || (entries.length === 0 && !(Number(total) > 0))}>{busy ? <Spinner size="xs" /> : null} Record receipt</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── deposits ────────────────────────────────────────────────────────────────

type Deposit = { id: string; number: string; contact: ContactLite; depositDate: string; amount: string; appliedAmount: string; remaining: string; method: string | null; reference: string | null; sourceCreditNoteId: string | null; status: "POSTED" | "VOID" };

export function FinDepositsPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canPost = useFinPermission("fin.sales.post");
  const canVoid = useFinPermission("fin.sales.void");
  const [openOnly, setOpenOnly] = useState(false);
  const list = usePagedList<Deposit>(`/sales/deposits?openOnly=${openOnly}`, []);
  const [recording, setRecording] = useState(false);
  const [applying, setApplying] = useState<Deposit | null>(null);
  const [voiding, setVoiding] = useState<Deposit | null>(null);

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={openOnly} onChange={(e) => { list.setPage(() => 1); setOpenOnly(e.target.checked); }} /> Only deposits with money left</label>
          <span className="text-sm text-ink/55">Held for customers: <b className="tabular-nums text-ink">{money(list.totals.unapplied ?? "0")}</b></span>
          <div className="flex-1" />
          {canPost && <button className="app-button-primary" onClick={() => setRecording(true)}><Plus className="h-4 w-4" aria-hidden /> Record deposit</button>}
        </div>
        <p className="text-xs text-ink/50">A deposit is money a customer paid in advance. It is owed back to them (a liability) until you apply it to one of their invoices.</p>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Left</th><th className="w-36" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((d) => (
                <tr key={d.id} className={d.status === "VOID" ? "opacity-55" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{d.number}{d.status === "VOID" && <Badge variant="neutral" className="ml-2">Void</Badge>}{d.sourceCreditNoteId && <Badge variant="info" className="ml-2">Credit note</Badge>}</td>
                  <td className="px-4 py-2.5">{d.contact.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{d.depositDate}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(d.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.status === "POSTED" ? money(d.remaining) : ""}</td>
                  <td className="space-x-3 px-2 text-right">
                    {d.status === "POSTED" && Number(d.remaining) > 0 && canPost && <button className="text-xs font-semibold text-brand hover:underline" onClick={() => setApplying(d)}>Apply</button>}
                    {d.status === "POSTED" && Number(d.appliedAmount) === 0 && !d.sourceCreditNoteId && canVoid && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setVoiding(d)}>Void</button>}
                  </td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/50">No deposits.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <DepositModal open={recording} onClose={() => setRecording(false)} onDone={() => { setRecording(false); list.refresh(); }} />
        <ApplyModal deposit={applying} onClose={() => setApplying(null)} onDone={() => { setApplying(null); list.refresh(); }} />
        <VoidModal open={voiding !== null} title={`Void deposit ${voiding?.number ?? ""}`} text="Only a deposit that has not been applied to any invoice can be voided." path={`/sales/deposits/${voiding?.id}/void`} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function DepositModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { money: accounts } = useSalesLookups();
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setContactId("");
      setAmount("");
      setDate(today());
      setReference("");
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (open && !account && accounts[0]) setAccount(accounts[0].id);
  }, [open, accounts, account]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/sales/deposits", { contactId, depositDate: date, amount: amount.trim(), method, paidToAccountId: account, reference: reference.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the deposit."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Record a customer deposit" size="md">
      <form onSubmit={submit} className="grid gap-4">
        <FormField label="Customer" required><ContactSelect value={contactId} onChange={(id) => setContactId(id)} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Amount" required><input className={control} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></FormField>
          <FormField label="Date" required><input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} required /></FormField>
          <FormField label="Paid by"><select className={control} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="Money went into" required><select className={control} value={account} onChange={(e) => setAccount(e.target.value)} required><option value="">Choose an account…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></FormField>
        </div>
        <FormField label="Reference"><input className={control} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !contactId || !amount.trim() || !account}>{busy ? <Spinner size="xs" /> : null} Record deposit</button>
        </div>
      </form>
    </Modal>
  );
}

function ApplyModal({ deposit, onClose, onDone }: { deposit: Deposit | null; onClose: () => void; onDone: () => void }) {
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!deposit) return;
    setInvoiceId("");
    setAmount("");
    setError("");
    finGet<OpenInvoice[]>(`/sales/invoices?contactId=${deposit.contact.id}&status=open&take=100`).then((r) => setInvoices(r.data)).catch((e) => setError(errMsg(e)));
  }, [deposit]);
  const chosen = invoices.find((i) => i.id === invoiceId);
  useEffect(() => {
    if (chosen && deposit) setAmount(String(Math.min(Number(chosen.balanceDue), Number(deposit.remaining))));
  }, [chosen, deposit]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!deposit) return;
    setBusy(true);
    setError("");
    try {
      await finSend("POST", `/sales/deposits/${deposit.id}/apply`, { invoiceId, amount: amount.trim() });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not apply the deposit."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={deposit !== null} onClose={onClose} title={`Apply ${deposit?.number ?? "deposit"}`} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/65">{deposit && `${money(deposit.remaining)} left for ${deposit.contact.name}.`}</p>
        <FormField label="Invoice" required>
          <select className={control} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} required>
            <option value="">Choose an invoice…</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · due {i.dueDate} · {money(i.balanceDue)} owing</option>)}
          </select>
        </FormField>
        <FormField label="Amount" required><input className={control} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !invoiceId || !amount.trim()}>{busy ? <Spinner size="xs" /> : null} Apply</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── credit notes ────────────────────────────────────────────────────────────

type CreditNote = { id: string; number: string; invoiceId: string; invoiceNumber: string | null; contact: ContactLite | null; creditDate: string; reason: string; total: string; appliedToInvoice: string; excessToDeposit: string; status: "POSTED" | "VOID" };

export function FinCreditNotesPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canVoid = useFinPermission("fin.sales.void");
  const list = usePagedList<CreditNote>("/sales/credit-notes", []);
  const [voiding, setVoiding] = useState<CreditNote | null>(null);
  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <p className="text-sm text-ink/60">Credit notes are raised from the invoice they correct (open the invoice and choose <b>Credit note</b>). Total credited: <b className="tabular-nums text-ink">{money(list.totals.credited ?? "0")}</b></p>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Kept as credit</th><th className="w-16" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((c) => (
                <tr key={c.id} className={c.status === "VOID" ? "opacity-55" : ""}>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{c.number}{c.status === "VOID" && <Badge variant="neutral" className="ml-2">Void</Badge>}</td>
                  <td className="px-4 py-2.5"><Link className="text-brand hover:underline" href={`/fin/sales/invoices/${c.invoiceId}`}>{c.invoiceNumber}</Link></td>
                  <td className="px-4 py-2.5">{c.contact?.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{c.creditDate}</td>
                  <td className="px-4 py-2.5">{c.reason}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(c.total)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(c.excessToDeposit) ? money(c.excessToDeposit) : ""}</td>
                  <td className="px-2">{c.status === "POSTED" && canVoid && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setVoiding(c)}>Void</button>}</td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink/50">No credit notes.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <VoidModal open={voiding !== null} title={`Void credit note ${voiding?.number ?? ""}`} text="The credit is reversed in the books and the invoice owes that money again. It is refused if the customer credit it created has already been used." path={`/sales/credit-notes/${voiding?.id}/void`} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

