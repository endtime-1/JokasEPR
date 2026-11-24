"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileText, Mail, MessageCircle, Plus, Printer, Share2 } from "lucide-react";
import { apiFetchResponse } from "../../lib/api";
import { FormField } from "../form-field";
import { ConfirmModal, Modal, Spinner } from "../ui";
import { FinContact, errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { Invoice, SalesLine, Totals, salesGet, useSalesLookups } from "./fin-sales-api";
import { ContactSelect, LineEditor, SalesTabs, StatusPill, control, emptyLine, fromApiLines, money, toApiLines } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const METHODS = [["CASH", "Cash"], ["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["CARD", "Card"]] as const;

// ─── list ────────────────────────────────────────────────────────────────────

export function FinInvoicesPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canCreate = useFinPermission("fin.sales.create");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [totals, setTotals] = useState<Totals>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const take = 50;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ page: String(page), take: String(take), status });
      if (search.trim()) q.set("search", search.trim());
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      finGet<Invoice[]>(`/sales/invoices?${q.toString()}`)
        .then((r) => {
          setRows(r.data);
          setTotal(r.meta?.total ?? 0);
          setTotals((r.meta as { totals?: Totals } | undefined)?.totals ?? {});
          setError("");
        })
        .catch((e) => setError(errMsg(e, "Could not load the invoices.")))
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [page, status, search, from, to]);

  const pages = Math.max(1, Math.ceil(total / take));
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(1);
    set(v);
  };

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Invoiced", totals.invoiced], ["Paid", totals.paid], ["Outstanding", totals.outstanding], ["Overdue", totals.overdue]].map(([label, v]) => (
            <div key={label} className="app-card p-4">
              <p className="text-xs uppercase tracking-wide text-ink/45">{label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${label === "Overdue" && Number(v) > 0 ? "text-red-600" : "text-ink"}`}>{money(v ?? "0")}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <input className="app-control w-56" placeholder="Search number or customer" value={search} onChange={(e) => reset(setSearch)(e.target.value)} aria-label="Search invoices" />
          <select className="app-control" value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open (unpaid)</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </select>
          <label className="grid gap-1 text-xs text-ink/55">From<input type="date" className="app-control" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-ink/55">To<input type="date" className="app-control" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          <div className="flex-1" />
          {canCreate && <Link href="/fin/sales/invoices/new" className="app-button-primary"><Plus className="h-4 w-4" aria-hidden /> New invoice</Link>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-field/60">
                  <td className="px-4 py-2.5"><Link className="font-semibold text-brand hover:underline" href={`/fin/sales/invoices/${r.id}`}>{r.number ?? "Draft"}</Link></td>
                  <td className="px-4 py-2.5">{r.contact?.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.issueDate}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.dueDate}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(r.total)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.status === "SENT" ? money(r.balanceDue) : ""}</td>
                  <td className="px-4 py-2.5"><StatusPill status={r.displayStatus} /></td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink/50">No invoices found.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="text-ink/60">Page {page} of {pages} · {total} invoices</span>
            <button className="app-button-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </FinGuard>
  );
}

// ─── editor / viewer ─────────────────────────────────────────────────────────

export function FinInvoiceDetailPage({ id, fromQuote }: { id?: string; fromQuote?: boolean }) {
  void fromQuote;
  const router = useRouter();
  const canCreate = useFinPermission("fin.sales.create");
  const canPost = useFinPermission("fin.sales.post");
  const canVoid = useFinPermission("fin.sales.void");
  const { income, money: moneyAccounts, taxCodes } = useSalesLookups();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState<"" | "pay" | "deposit" | "credit" | "share" | "void" | "delete">("");

  useFinHeader(inv ? (inv.number ?? "Draft invoice") : "New invoice", inv ? `${inv.contact?.name ?? ""}` : "Create an invoice");

  const hydrate = useCallback((i: Invoice) => {
    setInv(i);
    setContactId(i.contactId);
    setIssueDate(i.issueDate);
    setDueDate(i.dueDate);
    setNotes(i.notes ?? "");
    setTerms(i.terms ?? "");
    setLines(fromApiLines(i.lines));
  }, []);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return salesGet<Invoice>(`/invoices/${id}`).then((r) => hydrate(r.data)).catch((e) => setError(errMsg(e, "Could not load the invoice.")));
  }, [id, hydrate]);
  useEffect(() => {
    setLoading(!!id);
    void load().finally(() => setLoading(false));
  }, [id, load]);

  const editable = !inv || inv.status === "DRAFT";

  function body() {
    return { contactId, issueDate, ...(dueDate ? { dueDate } : {}), notes: notes.trim() || null, terms: terms.trim() || null, lines: toApiLines(lines) };
  }

  async function save(thenIssue: boolean) {
    setBusy(thenIssue ? "issue" : "save");
    setError("");
    try {
      let saved: Invoice;
      if (inv) saved = (await finSend<Invoice>("PATCH", `/sales/invoices/${inv.id}`, body())).data;
      else saved = (await finSend<Invoice>("POST", "/sales/invoices", body())).data;
      if (thenIssue) saved = (await finSend<Invoice>("POST", `/sales/invoices/${saved.id}/send`)).data;
      if (!inv) router.replace(`/fin/sales/invoices/${saved.id}`);
      hydrate(saved);
    } catch (e) {
      setError(errMsg(e, "Could not save the invoice."));
    } finally {
      setBusy("");
    }
  }

  async function openPdf() {
    if (!inv) return;
    setBusy("pdf");
    try {
      const res = await apiFetchResponse(`/fin/sales/invoices/${inv.id}/pdf`);
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e) {
      setError(errMsg(e, "Could not make the PDF."));
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!inv) return;
    setBusy("delete");
    try {
      await finSend("DELETE", `/sales/invoices/${inv.id}`);
      router.replace("/fin/sales/invoices");
    } catch (e) {
      setError(errMsg(e));
      setModal("");
      setBusy("");
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  const open = inv?.status === "SENT" && Number(inv.balanceDue) > 0;
  const validLines = lines.every((l) => l.description.trim() && l.quantity.trim() && l.unitPrice.trim());

  return (
    <FinGuard permission="fin.sales.view">
      <div className="mx-auto max-w-5xl space-y-5">
        <ErrorNote message={error} />
        {inv && (
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={inv.displayStatus} />
            {inv.number && <span className="font-mono text-sm font-semibold text-ink">{inv.number}</span>}
            {inv.quoteId && <Link className="text-sm text-brand hover:underline" href={`/fin/sales/quotes/${inv.quoteId}`}>From a quote</Link>}
            {inv.status === "VOID" && inv.voidReason && <span className="text-sm text-ink/55">Void: {inv.voidReason}</span>}
          </div>
        )}

        <div className="app-card grid gap-4 p-5 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <FormField label="Customer" required>
              <ContactSelect value={contactId} onChange={(cid) => setContactId(cid)} selected={inv?.contact as never} disabled={!editable} />
            </FormField>
          </div>
          <FormField label="Invoice date" required><input type="date" className={control} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!editable} required /></FormField>
          <FormField label="Due date" hint={editable ? "Blank = customer's payment terms" : undefined}><input type="date" className={control} value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!editable} /></FormField>
        </div>

        <LineEditor lines={lines} onChange={setLines} income={income} taxCodes={taxCodes} disabled={!editable} />

        <div className="app-card grid gap-4 p-5 sm:grid-cols-2">
          <FormField label="Notes (shown to the customer)"><textarea className={`${control} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={!editable} /></FormField>
          <FormField label="Terms"><textarea className={`${control} min-h-20 py-2`} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={1000} disabled={!editable} /></FormField>
        </div>

        {inv && inv.status !== "DRAFT" && (
          <div className="app-card p-5">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><p className="text-xs uppercase tracking-wide text-ink/45">Total</p><p className="text-lg font-bold tabular-nums">{money(inv.total)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-ink/45">Paid</p><p className="text-lg font-bold tabular-nums">{money(inv.paidAmount)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-ink/45">Credited</p><p className="text-lg font-bold tabular-nums">{money(inv.creditedAmount)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-ink/45">Balance due</p><p className="text-lg font-bold tabular-nums text-brand">{money(inv.balanceDue)}</p></div>
            </div>
            {(inv.allocations?.length || inv.applications?.length || inv.creditNotes?.length) ? (
              <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
                {inv.allocations?.map((a) => <li key={a.id} className="flex justify-between py-2"><span>Receipt {a.receipt.number} · {a.receipt.receiptDate}{a.receipt.status === "VOID" && " (void)"}</span><span className="tabular-nums">{money(a.amount)}</span></li>)}
                {inv.applications?.map((a) => <li key={a.id} className="flex justify-between py-2"><span>Deposit {a.deposit.number} applied · {a.appliedDate.slice(0, 10)}</span><span className="tabular-nums">{money(a.amount)}</span></li>)}
                {inv.creditNotes?.map((c) => <li key={c.id} className="flex justify-between py-2"><span>Credit note {c.number} · {c.creditDate.slice(0, 10)}{c.status === "VOID" && " (void)"}</span><span className="tabular-nums">{money(c.total)}</span></li>)}
              </ul>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {editable && canCreate && (
            <>
              <button className="app-button-secondary" disabled={!!busy || !contactId || !validLines} onClick={() => save(false)}>{busy === "save" ? <Spinner size="xs" /> : null} Save draft</button>
              {canPost && <button className="app-button-primary" disabled={!!busy || !contactId || !validLines} onClick={() => save(true)}>{busy === "issue" ? <Spinner size="xs" /> : null} Save &amp; issue</button>}
              {inv && <button className="app-button-danger" disabled={!!busy} onClick={() => setModal("delete")}>Delete draft</button>}
            </>
          )}
          {inv && inv.status !== "DRAFT" && (
            <>
              {open && canPost && <button className="app-button-primary" onClick={() => setModal("pay")}>Record payment</button>}
              {open && canPost && <button className="app-button-secondary" onClick={() => setModal("deposit")}>Apply deposit</button>}
              {inv.status === "SENT" && canPost && <button className="app-button-secondary" onClick={() => setModal("credit")}>Credit note</button>}
              <button className="app-button-secondary" onClick={() => setModal("share")}><Share2 className="h-4 w-4" aria-hidden /> Share</button>
              <button className="app-button-secondary" onClick={openPdf} disabled={busy === "pdf"}><Printer className="h-4 w-4" aria-hidden /> PDF</button>
              {inv.status === "SENT" && canVoid && <button className="app-button-danger" onClick={() => setModal("void")}>Void</button>}
            </>
          )}
          <Link href="/fin/sales/invoices" className="ml-auto text-sm text-ink/60 hover:underline">Back to invoices</Link>
        </div>
        {inv && inv.status === "SENT" && <p className="text-xs text-ink/45">An issued invoice can never be edited. To correct it, void it, or issue a credit note.</p>}

        {inv && (
          <>
            <PaymentModal open={modal === "pay"} inv={inv} accounts={moneyAccounts} onClose={() => setModal("")} onDone={() => { setModal(""); void load(); }} />
            <DepositModal open={modal === "deposit"} inv={inv} onClose={() => setModal("")} onDone={() => { setModal(""); void load(); }} />
            <CreditModal open={modal === "credit"} inv={inv} onClose={() => setModal("")} onDone={() => { setModal(""); void load(); }} />
            <ShareModal open={modal === "share"} inv={inv} onClose={() => setModal("")} onChanged={() => void load()} canPost={canPost} />
            <VoidModal open={modal === "void"} title={`Void ${inv.number}`} text="This posts an exact reversing entry and cancels the invoice. It is refused if payments or credit notes exist." onClose={() => setModal("")} onDone={() => { setModal(""); void load(); }} path={`/sales/invoices/${inv.id}/void`} />
            <ConfirmModal open={modal === "delete"} title="Delete this draft?" message="Only drafts can be deleted. Nothing has been posted." confirmLabel="Delete" loading={busy === "delete"} onConfirm={remove} onClose={() => setModal("")} />
          </>
        )}
      </div>
    </FinGuard>
  );
}

// ─── dialogs ─────────────────────────────────────────────────────────────────

export function VoidModal({ open, title, text, path, onClose, onDone }: { open: boolean; title: string; text: string; path: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", path, { reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not void it."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/70">{text}</p>
        <FormField label="Reason" required><input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} required autoFocus /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-danger" disabled={busy || reason.trim().length < 3}>{busy ? <Spinner size="xs" /> : null} Void</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentModal({ open, inv, accounts, onClose, onDone }: { open: boolean; inv: Invoice; accounts: { id: string; code: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(inv.balanceDue);
      setDate(today());
      setReference("");
      setError("");
    }
  }, [open, inv.balanceDue]);
  useEffect(() => {
    if (open && !account && accounts[0]) setAccount(accounts[0].id);
  }, [open, accounts, account]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/sales/receipts", { contactId: inv.contactId, receiptDate: date, method, paidToAccountId: account, reference: reference.trim() || undefined, allocations: [{ invoiceId: inv.id, amount: amount.trim() }] });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not record the payment."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Record payment for ${inv.number}`} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/65">Balance due: <b>{money(inv.balanceDue)}</b>. Enter less to record a part payment.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Amount" required><input className={control} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></FormField>
          <FormField label="Date" required><input type="date" className={control} value={date} min={inv.issueDate} onChange={(e) => setDate(e.target.value)} required /></FormField>
          <FormField label="Paid by">
            <select className={control} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </FormField>
          <FormField label="Money went into" required>
            <select className={control} value={account} onChange={(e) => setAccount(e.target.value)} required>
              <option value="">Choose an account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Reference"><input className={control} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder="MoMo ID, cheque number…" /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !account || !amount.trim()}>{busy ? <Spinner size="xs" /> : null} Record payment</button>
        </div>
      </form>
    </Modal>
  );
}

type DepositLite = { id: string; number: string; depositDate: string; remaining: string };

function DepositModal({ open, inv, onClose, onDone }: { open: boolean; inv: Invoice; onClose: () => void; onDone: () => void }) {
  const [deposits, setDeposits] = useState<DepositLite[]>([]);
  const [depositId, setDepositId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setDepositId("");
    setAmount("");
    finGet<DepositLite[]>(`/sales/deposits?contactId=${inv.contactId}&openOnly=true&take=100`).then((r) => setDeposits(r.data)).catch((e) => setError(errMsg(e)));
  }, [open, inv.contactId]);
  const chosen = deposits.find((d) => d.id === depositId);
  useEffect(() => {
    if (chosen) setAmount(String(Math.min(Number(chosen.remaining), Number(inv.balanceDue))));
  }, [chosen, inv.balanceDue]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", `/sales/deposits/${depositId}/apply`, { invoiceId: inv.id, amount: amount.trim() });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not apply the deposit."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Apply a deposit to ${inv.number}`} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        {deposits.length === 0 ? (
          <p className="text-sm text-ink/60">This customer has no unused deposits.</p>
        ) : (
          <>
            <FormField label="Deposit" required>
              <select className={control} value={depositId} onChange={(e) => setDepositId(e.target.value)} required>
                <option value="">Choose a deposit…</option>
                {deposits.map((d) => <option key={d.id} value={d.id}>{d.number} · {d.depositDate} · {money(d.remaining)} left</option>)}
              </select>
            </FormField>
            <FormField label="Amount to apply" required><input className={control} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></FormField>
          </>
        )}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !depositId || !amount.trim()}>{busy ? <Spinner size="xs" /> : null} Apply</button>
        </div>
      </form>
    </Modal>
  );
}

function CreditModal({ open, inv, onClose, onDone }: { open: boolean; inv: Invoice; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setQty({});
      setDate(today());
      setReason("");
      setError("");
    }
  }, [open]);
  const chosen = useMemo(() => (inv.lines ?? []).filter((l) => l.id && Number(qty[l.id] ?? 0) > 0), [inv.lines, qty]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/sales/credit-notes", { invoiceId: inv.id, creditDate: date, reason: reason.trim(), lines: chosen.map((l) => ({ invoiceLineId: l.id, quantity: qty[l.id as string].trim() })) });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not create the credit note."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Credit note against ${inv.number}`} size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/65">Enter the quantity being returned or refunded on each line. If the invoice is already paid, the credit is kept as customer credit that can be used on a later invoice.</p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">Invoiced</th><th className="w-32 px-3 py-2 text-right">Credit qty</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(inv.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(l.quantity)} × {money(l.unitPrice)}</td>
                  <td className="px-3 py-2"><input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={qty[l.id as string] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id as string]: e.target.value }))} placeholder="0" aria-label={`Credit quantity for ${l.description}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Date" required><input type="date" className={control} value={date} min={inv.issueDate} onChange={(e) => setDate(e.target.value)} required /></FormField>
          <div className="sm:col-span-2"><FormField label="Reason" required><input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} required placeholder="e.g. 3 bags damaged on delivery" /></FormField></div>
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || chosen.length === 0 || reason.trim().length < 3}>{busy ? <Spinner size="xs" /> : null} Create credit note</button>
        </div>
      </form>
    </Modal>
  );
}

type ShareInfo = { enabled: boolean; link: string | null; whatsappUrl: string | null; email: string | null; phone: string | null };

function ShareModal({ open, inv, onClose, onChanged, canPost }: { open: boolean; inv: Invoice; onClose: () => void; onChanged: () => void; canPost: boolean }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!open) return;
    setInfo(null);
    setNote("");
    setError("");
    setMessage("");
    finGet<ShareInfo>(`/sales/invoices/${inv.id}/share`).then((r) => { setInfo(r.data); setTo(r.data.email ?? ""); }).catch((e) => setError(errMsg(e)));
  }, [open, inv.id]);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    setNote("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy("");
    }
  }
  const linkAction = (action: "regenerate" | "disable" | "enable") =>
    act(action, async () => {
      const r = await finSend<ShareInfo>("POST", `/sales/invoices/${inv.id}/link/${action}`);
      setInfo(r.data);
      setNote(action === "regenerate" ? "A new link is ready. The old one no longer works." : action === "disable" ? "The public link is switched off." : "The public link is on.");
      onChanged();
    });

  return (
    <Modal open={open} onClose={onClose} title={`Share ${inv.number}`} size="lg">
      <div className="grid gap-4">
        {!info && !error && <div className="flex justify-center py-6"><Spinner /></div>}
        <ErrorNote message={error} />
        {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{note}</p>}
        {info && (
          <>
            <div>
              <p className="text-sm font-semibold text-ink">Public link</p>
              {info.link ? (
                <div className="mt-1.5 flex gap-2">
                  <input className="app-control w-full font-mono text-xs" readOnly value={info.link} onFocus={(e) => e.currentTarget.select()} aria-label="Public link" />
                  <button className="app-button-secondary" onClick={() => act("copy", async () => { await navigator.clipboard.writeText(info.link as string); setNote("Link copied."); })}><Copy className="h-4 w-4" aria-hidden /> Copy</button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink/55">The public link is switched off.</p>
              )}
              <p className="mt-1.5 text-xs text-ink/45">Anyone with this link can view and download this invoice, and nothing else. It cannot be guessed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {info.whatsappUrl && <a className="app-button-primary" href={info.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" aria-hidden /> Share on WhatsApp</a>}
              {info.link && <a className="app-button-secondary" href={info.link} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4" aria-hidden /> Open customer view</a>}
            </div>
            {canPost && (
              <div className="rounded-lg border border-line p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><Mail className="h-4 w-4" aria-hidden /> Email the invoice (PDF attached)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="To"><input className={control} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" /></FormField>
                  <FormField label="Message (optional)"><input className={control} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} /></FormField>
                </div>
                <button className="app-button-primary mt-3" disabled={busy === "email" || !to.trim()} onClick={() => act("email", async () => { const r = await finSend<{ sentTo: string }>("POST", `/sales/invoices/${inv.id}/email`, { to: to.trim(), message: message.trim() || undefined }); setNote(`Sent to ${r.data.sentTo}.`); })}>
                  {busy === "email" ? <Spinner size="xs" /> : null} Send email
                </button>
              </div>
            )}
            {canPost && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
                <button className="app-button-secondary" disabled={!!busy} onClick={() => linkAction("regenerate")}>Make a new link</button>
                {info.enabled ? <button className="app-button-secondary" disabled={!!busy} onClick={() => linkAction("disable")}>Switch link off</button> : <button className="app-button-secondary" disabled={!!busy} onClick={() => linkAction("enable")}>Switch link on</button>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export type { FinContact };
