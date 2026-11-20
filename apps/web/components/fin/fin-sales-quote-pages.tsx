"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, ConfirmModal, Spinner } from "../ui";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { Quote, SalesLine, Totals, salesGet, useSalesLookups } from "./fin-sales-api";
import { ContactSelect, LineEditor, SalesTabs, control, emptyLine, fromApiLines, money, toApiLines } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

const QUOTE_VARIANT = { DRAFT: "neutral", SENT: "info", ACCEPTED: "success", DECLINED: "danger", EXPIRED: "warning" } as const;
const QUOTE_LABEL = { DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired" } as const;

export function FinQuotesPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canCreate = useFinPermission("fin.sales.create");
  const [rows, setRows] = useState<Quote[]>([]);
  const [totals, setTotals] = useState<Totals>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const take = 50;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ page: String(page), take: String(take), status });
      if (search.trim()) q.set("search", search.trim());
      finGet<Quote[]>(`/sales/quotes?${q.toString()}`)
        .then((r) => {
          setRows(r.data);
          setTotal(r.meta?.total ?? 0);
          setTotals((r.meta as { totals?: Totals } | undefined)?.totals ?? {});
          setError("");
        })
        .catch((e) => setError(errMsg(e, "Could not load the quotes.")))
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [page, status, search]);
  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-end gap-3">
          <input className="app-control w-56" placeholder="Search number or customer" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} aria-label="Search quotes" />
          <select className="app-control" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Status">
            <option value="all">All statuses</option>
            {Object.entries(QUOTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="pb-2 text-sm text-ink/55">Quoted: <b className="tabular-nums">{money(totals.quoted ?? "0")}</b></span>
          <div className="flex-1" />
          {canCreate && <Link href="/fin/sales/quotes/new" className="app-button-primary"><Plus className="h-4 w-4" aria-hidden /> New quote</Link>}
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Valid until</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-field/60">
                  <td className="px-4 py-2.5"><Link className="font-semibold text-brand hover:underline" href={`/fin/sales/quotes/${r.id}`}>{r.number ?? "Draft"}</Link></td>
                  <td className="px-4 py-2.5">{r.contact?.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.issueDate}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.validUntil ?? ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(r.total)}</td>
                  <td className="px-4 py-2.5"><Badge variant={QUOTE_VARIANT[r.status]}>{QUOTE_LABEL[r.status]}</Badge></td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/50">No quotes found.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="text-ink/60">Page {page} of {pages}</span>
            <button className="app-button-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </FinGuard>
  );
}

export function FinQuoteDetailPage({ id }: { id?: string }) {
  const router = useRouter();
  const canCreate = useFinPermission("fin.sales.create");
  const { income, taxCodes } = useSalesLookups();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFinHeader(quote ? (quote.number ?? "Draft quote") : "New quote", quote?.contact?.name ?? "Create a quote");

  const hydrate = useCallback((q: Quote) => {
    setQuote(q);
    setContactId(q.contactId);
    setIssueDate(q.issueDate);
    setValidUntil(q.validUntil ?? "");
    setNotes(q.notes ?? "");
    setTerms(q.terms ?? "");
    setLines(fromApiLines(q.lines));
  }, []);
  const load = useCallback(() => (id ? salesGet<Quote>(`/quotes/${id}`).then((r) => hydrate(r.data)).catch((e) => setError(errMsg(e))) : Promise.resolve()), [id, hydrate]);
  useEffect(() => {
    setLoading(!!id);
    void load().finally(() => setLoading(false));
  }, [id, load]);

  const editable = !quote || quote.status === "DRAFT";
  const body = () => ({ contactId, issueDate, validUntil: validUntil || null, notes: notes.trim() || null, terms: terms.trim() || null, lines: toApiLines(lines) });
  const validLines = lines.every((l) => l.description.trim() && l.quantity.trim() && l.unitPrice.trim());

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy("");
    }
  }
  const save = (thenSend: boolean) =>
    run(thenSend ? "send" : "save", async () => {
      let saved: Quote = quote
        ? (await finSend<Quote>("PATCH", `/sales/quotes/${quote.id}`, body())).data
        : (await finSend<Quote>("POST", "/sales/quotes", { ...body(), validUntil: validUntil || undefined })).data;
      if (thenSend) saved = (await finSend<Quote>("POST", `/sales/quotes/${saved.id}/send`)).data;
      if (!quote) router.replace(`/fin/sales/quotes/${saved.id}`);
      hydrate(saved);
    });
  const act = (name: string, path: string) =>
    run(name, async () => {
      const r = await finSend<Quote>("POST", `/sales/quotes/${quote!.id}/${path}`);
      hydrate(r.data);
    });
  const convert = () =>
    run("convert", async () => {
      const r = await finSend<{ invoice: { id: string } }>("POST", `/sales/quotes/${quote!.id}/convert`);
      router.push(`/fin/sales/invoices/${r.data.invoice.id}`);
    });
  const remove = () =>
    run("delete", async () => {
      await finSend("DELETE", `/sales/quotes/${quote!.id}`);
      router.replace("/fin/sales/quotes");
    });

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  const canConvert = quote && !quote.invoiceId && quote.status !== "DECLINED" && quote.status !== "EXPIRED";

  return (
    <FinGuard permission="fin.sales.view">
      <div className="mx-auto max-w-5xl space-y-5">
        <ErrorNote message={error} />
        {quote && (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={QUOTE_VARIANT[quote.status]}>{QUOTE_LABEL[quote.status]}</Badge>
            {quote.number && <span className="font-mono text-sm font-semibold">{quote.number}</span>}
            {quote.invoiceId && <Link className="text-sm text-brand hover:underline" href={`/fin/sales/invoices/${quote.invoiceId}`}>Open the invoice made from this quote</Link>}
          </div>
        )}
        <div className="app-card grid gap-4 p-5 sm:grid-cols-4">
          <div className="sm:col-span-2"><FormField label="Customer" required><ContactSelect value={contactId} onChange={(cid) => setContactId(cid)} selected={quote?.contact as never} disabled={!editable} /></FormField></div>
          <FormField label="Quote date" required><input type="date" className={control} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!editable} required /></FormField>
          <FormField label="Valid until"><input type="date" className={control} value={validUntil} min={issueDate} onChange={(e) => setValidUntil(e.target.value)} disabled={!editable} /></FormField>
        </div>
        <LineEditor lines={lines} onChange={setLines} income={income} taxCodes={taxCodes} disabled={!editable} />
        <div className="app-card grid gap-4 p-5 sm:grid-cols-2">
          <FormField label="Notes (shown to the customer)"><textarea className={`${control} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={!editable} /></FormField>
          <FormField label="Terms"><textarea className={`${control} min-h-20 py-2`} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={1000} disabled={!editable} /></FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && canCreate && (
            <>
              <button className="app-button-secondary" disabled={!!busy || !contactId || !validLines} onClick={() => save(false)}>{busy === "save" ? <Spinner size="xs" /> : null} Save draft</button>
              <button className="app-button-primary" disabled={!!busy || !contactId || !validLines} onClick={() => save(true)}>{busy === "send" ? <Spinner size="xs" /> : null} Save &amp; mark as sent</button>
              {quote && <button className="app-button-danger" disabled={!!busy} onClick={() => setConfirmDelete(true)}>Delete draft</button>}
            </>
          )}
          {quote?.status === "SENT" && canCreate && (
            <>
              <button className="app-button-secondary" disabled={!!busy} onClick={() => act("accept", "accept")}>Mark accepted</button>
              <button className="app-button-secondary" disabled={!!busy} onClick={() => act("decline", "decline")}>Mark declined</button>
            </>
          )}
          {canConvert && canCreate && <button className="app-button-primary" disabled={!!busy} onClick={convert}>{busy === "convert" ? <Spinner size="xs" /> : null} Convert to invoice</button>}
          <Link href="/fin/sales/quotes" className="ml-auto text-sm text-ink/60 hover:underline">Back to quotes</Link>
        </div>
        <p className="text-xs text-ink/45">A quote never touches your books. Converting it copies every line into a draft invoice and links the two.</p>
        <ConfirmModal open={confirmDelete} title="Delete this draft quote?" message="Only drafts can be deleted." confirmLabel="Delete" loading={busy === "delete"} onConfirm={remove} onClose={() => setConfirmDelete(false)} />
      </div>
    </FinGuard>
  );
}
