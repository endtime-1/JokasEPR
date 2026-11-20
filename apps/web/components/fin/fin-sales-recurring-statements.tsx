"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Mail, MessageCircle, Plus, Printer } from "lucide-react";
import { apiFetchResponse } from "../../lib/api";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { ContactLite, SalesLine, useSalesLookups } from "./fin-sales-api";
import { ContactSelect, LineEditor, SalesTabs, control, emptyLine, money, toApiLines } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

// ─── recurring invoices ──────────────────────────────────────────────────────

type Recurring = { id: string; name: string; contact: ContactLite; frequency: "WEEKLY" | "MONTHLY"; startDate: string; nextRunDate: string; endDate: string | null; termsDays: number; autoSend: boolean; active: boolean; runCount: number; lastRunAt: string | null };

export function FinRecurringPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canCreate = useFinPermission("fin.sales.create");
  const [rows, setRows] = useState<Recurring[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => {
    finGet<Recurring[]>("/sales/recurring").then((r) => { setRows(r.data); setError(""); }).catch((e) => setError(errMsg(e, "Could not load the recurring invoices.")));
  }, []);
  useEffect(load, [load]);

  async function toggle(r: Recurring) {
    try {
      await finSend("POST", `/sales/recurring/${r.id}/state`, { active: !r.active });
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-ink/60">A recurring invoice repeats on a schedule. Each morning at 6:00 (Ghana time) the system creates the invoices that are due, as drafts or, if you choose, issued straight away.</p>
          {canCreate && <button className="app-button-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> New recurring invoice</button>}
        </div>
        {!rows && !error && <div className="flex justify-center py-12"><Spinner /></div>}
        {rows && (
          <div className="app-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Repeats</th><th className="px-4 py-3">Next invoice</th><th className="px-4 py-3">Made so far</th><th className="px-4 py-3">Mode</th><th className="w-24" /></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className={r.active ? "" : "opacity-55"}>
                    <td className="px-4 py-2.5 font-medium">{r.name}{!r.active && <Badge variant="neutral" className="ml-2">Off</Badge>}</td>
                    <td className="px-4 py-2.5">{r.contact.name}</td>
                    <td className="px-4 py-2.5">{r.frequency === "WEEKLY" ? "Every week" : "Every month"}{r.endDate ? ` until ${r.endDate}` : ""}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{r.active ? r.nextRunDate : "—"}</td>
                    <td className="px-4 py-2.5">{r.runCount}</td>
                    <td className="px-4 py-2.5">{r.autoSend ? <Badge variant="info">Issued automatically</Badge> : <Badge variant="neutral">Draft for review</Badge>}</td>
                    <td className="px-2 text-right">{canCreate && <button className="text-xs font-semibold text-brand hover:underline" onClick={() => toggle(r)}>{r.active ? "Pause" : "Resume"}</button>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No recurring invoices yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <RecurringModal open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      </div>
    </FinGuard>
  );
}

function RecurringModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { income, taxCodes } = useSalesLookups();
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [frequency, setFrequency] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [termsDays, setTermsDays] = useState("30");
  const [autoSend, setAutoSend] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setContactId("");
      setStartDate(today());
      setEndDate("");
      setAutoSend(false);
      setNotes("");
      setLines([emptyLine()]);
      setError("");
    }
  }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/sales/recurring", { name: name.trim(), contactId, frequency, startDate, endDate: endDate || null, termsDays: Math.max(0, Math.min(365, Math.floor(Number(termsDays) || 0))), autoSend, notes: notes.trim() || null, lines: toApiLines(lines) });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not set up the recurring invoice."));
    } finally {
      setBusy(false);
    }
  }
  const validLines = lines.every((l) => l.description.trim() && l.quantity.trim() && l.unitPrice.trim());
  return (
    <Modal open={open} onClose={onClose} title="New recurring invoice" size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required><input className={control} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="e.g. Monthly feed supply" /></FormField>
          <FormField label="Customer" required><ContactSelect value={contactId} onChange={(id) => setContactId(id)} /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Repeats"><select className={control} value={frequency} onChange={(e) => setFrequency(e.target.value as "WEEKLY" | "MONTHLY")}><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option></select></FormField>
          <FormField label="First invoice" required><input type="date" className={control} value={startDate} min={today()} onChange={(e) => setStartDate(e.target.value)} required /></FormField>
          <FormField label="Stop after"><input type="date" className={control} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></FormField>
          <FormField label="Due after (days)"><input type="number" min={0} max={365} className={control} value={termsDays} onChange={(e) => setTermsDays(e.target.value)} /></FormField>
        </div>
        <LineEditor lines={lines} onChange={setLines} income={income} taxCodes={taxCodes} />
        <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-1" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} /><span>Issue each invoice automatically (it is posted to the books straight away). Otherwise it is left as a draft for someone to check and issue.</span></label>
        <FormField label="Notes on every invoice"><input className={control} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !name.trim() || !contactId || !validLines}>{busy ? <Spinner size="xs" /> : null} Start schedule</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── statements ──────────────────────────────────────────────────────────────

type Statement = {
  contact: { id: string; code: string; name: string; email: string | null; phone: string | null };
  from: string;
  to: string;
  openingBalance: string;
  closingBalance: string;
  totalDebits: string;
  totalCredits: string;
  unappliedDeposits: string;
  rows: { date: string; type: string; reference: string; description: string; debit: string; credit: string; balance: string }[];
};
type ShareInfo = { link: string; whatsappUrl: string; email: string | null; phone: string | null };

const TYPE_LABEL: Record<string, string> = { INVOICE: "Invoice", RECEIPT: "Payment", CREDIT_NOTE: "Credit note", DEPOSIT_APPLIED: "Deposit applied" };

export function FinStatementsPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canPost = useFinPermission("fin.sales.post");
  const [contactId, setContactId] = useState("");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Statement | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const q = `from=${from}&to=${to}`;
  const show = useCallback(async () => {
    if (!contactId) return;
    setBusy("show");
    setError("");
    setShare(null);
    setNote("");
    try {
      const [s, sh] = await Promise.all([finGet<Statement>(`/sales/statements/${contactId}?${q}`), finGet<ShareInfo>(`/sales/statements/${contactId}/share?${q}`)]);
      setData(s.data);
      setShare(sh.data);
      setEmailTo(sh.data.email ?? "");
    } catch (e) {
      setError(errMsg(e, "Could not build the statement."));
      setData(null);
    } finally {
      setBusy("");
    }
  }, [contactId, q]);

  async function openPdf() {
    setBusy("pdf");
    try {
      const res = await apiFetchResponse(`/fin/sales/statements/${contactId}/pdf?${q}`);
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      setError(errMsg(e, "Could not make the PDF."));
    } finally {
      setBusy("");
    }
  }
  async function email() {
    setBusy("email");
    setError("");
    setNote("");
    try {
      const r = await finSend<{ sentTo: string }>("POST", `/sales/statements/${contactId}/email?${q}`, { to: emailTo.trim() || undefined });
      setNote(`Sent to ${r.data.sentTo}.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="app-card grid items-end gap-4 p-5 sm:grid-cols-5 print:hidden">
          <div className="sm:col-span-2"><FormField label="Customer" required><ContactSelect value={contactId} onChange={(id) => setContactId(id)} /></FormField></div>
          <FormField label="From"><input type="date" className={control} value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="To"><input type="date" className={control} value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
          <button className="app-button-primary" disabled={!contactId || busy === "show"} onClick={show}>{busy === "show" ? <Spinner size="xs" /> : null} Show statement</button>
        </div>

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button className="app-button-secondary" onClick={openPdf} disabled={busy === "pdf"}><Printer className="h-4 w-4" aria-hidden /> PDF</button>
              {share && <a className="app-button-secondary" href={share.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a>}
              {share && <button className="app-button-secondary" onClick={async () => { await navigator.clipboard.writeText(share.link); setNote("Link copied."); }}><Copy className="h-4 w-4" aria-hidden /> Copy link</button>}
              {canPost && (
                <span className="ml-auto inline-flex flex-wrap items-center gap-2">
                  <input className="app-control w-56" type="email" placeholder="customer@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} aria-label="Email address" />
                  <button className="app-button-primary" onClick={email} disabled={busy === "email" || !emailTo.trim()}>{busy === "email" ? <Spinner size="xs" /> : <Mail className="h-4 w-4" aria-hidden />} Email</button>
                </span>
              )}
            </div>
            {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{note}</p>}

            <div className="app-card overflow-x-auto">
              <div className="border-b border-line px-5 py-3">
                <p className="font-bold text-ink">{data.contact.name} <span className="font-mono text-xs font-normal text-ink/50">{data.contact.code}</span></p>
                <p className="text-sm text-ink/55">{data.from} to {data.to}</p>
              </div>
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Details</th><th className="px-4 py-3 text-right">Charges</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-line/60">
                  <tr className="bg-field/40"><td className="px-4 py-2" colSpan={6}>Opening balance</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{money(data.openingBalance)}</td></tr>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
                      <td className="px-4 py-2">{TYPE_LABEL[r.type] ?? r.type}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.reference}</td>
                      <td className="px-4 py-2">{r.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.debit ? money(r.debit) : ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.credit ? money(r.credit) : ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(r.balance)}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink/50">No activity in this period.</td></tr>}
                </tbody>
                <tfoot className="border-t-2 border-line bg-field/50 font-bold">
                  <tr><td className="px-4 py-3" colSpan={6}>Balance due</td><td className="px-4 py-3 text-right tabular-nums">{money(data.closingBalance)}</td></tr>
                </tfoot>
              </table>
            </div>
            {Number(data.unappliedDeposits) > 0 && <p className="text-sm text-ink/60">Deposits held for this customer and not yet applied: <b className="tabular-nums">{money(data.unappliedDeposits)}</b></p>}
          </>
        )}
      </div>
    </FinGuard>
  );
}
