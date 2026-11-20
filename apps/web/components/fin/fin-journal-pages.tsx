"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, ConfirmModal, Modal, Spinner } from "../ui";
import { ACCOUNT_TYPES, FinAccount, JournalEntry, TYPE_LABEL, amount, errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

const control = "app-control w-full";

const STATUS_BADGE: Record<JournalEntry["status"], { label: string; variant: "success" | "warning" | "neutral" }> = {
  DRAFT: { label: "Draft", variant: "warning" },
  POSTED: { label: "Posted", variant: "success" },
  REVERSED: { label: "Reversed", variant: "neutral" }
};

const num = (s: string) => Number(s);

// ─── List ────────────────────────────────────────────────────────────────────

export function FinJournalsPage() {
  useFinHeader("Journals", "Manual journal entries and everything posted to the ledger");
  const canCreate = useFinPermission("fin.accounting.create");
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const take = 50;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ page: String(page), take: String(take) });
      if (status) q.set("status", status);
      if (search.trim()) q.set("search", search.trim());
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      finGet<JournalEntry[]>(`/accounting/journals?${q.toString()}`)
        .then((r) => {
          setRows(r.data);
          setTotal(r.meta?.total ?? 0);
          setError("");
        })
        .catch((e) => setError(errMsg(e, "Could not load the journals.")))
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
    <FinGuard permission="fin.accounting.view">
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-end gap-3">
          <input className="app-control w-56" placeholder="Search reference or description" value={search} onChange={(e) => reset(setSearch)(e.target.value)} aria-label="Search journals" />
          <select className="app-control" value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Reversed</option>
          </select>
          <label className="grid gap-1 text-xs text-ink/55">From<input type="date" className="app-control" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-ink/55">To<input type="date" className="app-control" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          <div className="flex-1" />
          {canCreate && (
            <Link href="/fin/accounting/journals/new" className="app-button-primary"><Plus className="h-4 w-4" aria-hidden /> New journal</Link>
          )}
        </div>

        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-field/60">
                  <td className="px-4 py-2.5 font-mono text-xs"><Link className="font-semibold text-brand hover:underline" href={`/fin/accounting/journals/${r.id}`}>{r.reference}</Link></td>
                  <td className="whitespace-nowrap px-4 py-2.5">{r.entryDate.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">{r.description}{r.type === "REVERSAL" && <span className="ml-2 text-xs text-ink/45">(reversal)</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{amount(num(r.totalDebit))}</td>
                  <td className="px-4 py-2.5"><Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge></td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/50">No journals found.</td></tr>}
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

// ─── Editor / viewer ─────────────────────────────────────────────────────────

type EditLine = { key: number; accountId: string; debit: string; credit: string; description: string };

let lineKey = 1;
const emptyLine = (): EditLine => ({ key: lineKey++, accountId: "", debit: "", credit: "", description: "" });

/** Exact pesewa maths on the client too, so the balance indicator never shows float noise. */
function toPesewas(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

export function FinJournalDetailPage({ id }: { id?: string }) {
  const router = useRouter();
  const canCreate = useFinPermission("fin.accounting.create");
  const canPost = useFinPermission("fin.accounting.post");
  const canVoid = useFinPermission("fin.accounting.void");
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);

  useFinHeader(entry ? `Journal ${entry.status === "DRAFT" ? "(draft)" : entry.reference}` : "New journal", "Debits must equal credits before a journal can be posted");

  const hydrate = useCallback((e: JournalEntry) => {
    setEntry(e);
    setDate(e.entryDate.slice(0, 10));
    setDescription(e.description);
    setNotes(e.notes ?? "");
    setLines((e.lines ?? []).map((l) => ({ key: lineKey++, accountId: l.accountId, debit: num(l.debit) ? l.debit : "", credit: num(l.credit) ? l.credit : "", description: l.description ?? "" })));
  }, []);

  useEffect(() => {
    finGet<FinAccount[]>("/accounting/accounts").then((r) => setAccounts(r.data)).catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    finGet<JournalEntry>(`/accounting/journals/${id}`)
      .then((r) => hydrate(r.data))
      .catch((e) => setError(errMsg(e, "Could not load the journal.")))
      .finally(() => setLoading(false));
  }, [id, hydrate]);

  const editable = !entry || entry.status === "DRAFT";
  const usable = useMemo(() => accounts.filter((a) => a.isPostable && a.isActive), [accounts]);
  const accountLabel = useCallback((a: string) => {
    const x = accounts.find((y) => y.id === a);
    return x ? `${x.code} ${x.name}` : "";
  }, [accounts]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let invalid = false;
    for (const l of lines) {
      const d = toPesewas(l.debit);
      const c = toPesewas(l.credit);
      if (d === null || c === null) invalid = true;
      else {
        debit += d;
        credit += c;
      }
    }
    return { debit, credit, invalid, diff: debit - credit };
  }, [lines]);

  const filled = lines.filter((l) => l.accountId || l.debit || l.credit);
  const bothSides = filled.some((l) => toPesewas(l.debit) && toPesewas(l.credit));
  const balanced = !totals.invalid && totals.debit === totals.credit && totals.debit > 0 && filled.length >= 2 && !bothSides && filled.every((l) => l.accountId);

  const setLine = (key: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function body() {
    return {
      entryDate: date,
      description: description.trim(),
      notes: notes.trim() || undefined,
      lines: filled.map((l) => ({ accountId: l.accountId, debit: l.debit.trim() || undefined, credit: l.credit.trim() || undefined, description: l.description.trim() || undefined }))
    };
  }

  async function save(thenPost: boolean) {
    setBusy(thenPost ? "post" : "save");
    setError("");
    try {
      let saved: JournalEntry;
      if (entry) saved = (await finSend<JournalEntry>("PATCH", `/accounting/journals/${entry.id}`, body())).data;
      else saved = (await finSend<JournalEntry>("POST", "/accounting/journals", body())).data;
      if (thenPost) saved = (await finSend<JournalEntry>("POST", `/accounting/journals/${saved.id}/post`)).data;
      if (!entry) router.replace(`/fin/accounting/journals/${saved.id}`);
      hydrate(saved);
    } catch (e) {
      setError(errMsg(e, "Could not save the journal."));
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!entry) return;
    setBusy("delete");
    try {
      await finSend("DELETE", `/accounting/journals/${entry.id}`);
      router.replace("/fin/accounting/journals");
    } catch (e) {
      setError(errMsg(e));
      setConfirmDelete(false);
      setBusy("");
    }
  }

  async function reverse(reason: string) {
    if (!entry) return;
    setBusy("reverse");
    setError("");
    try {
      const r = await finSend<JournalEntry>("POST", `/accounting/journals/${entry.id}/reverse`, { reason });
      router.push(`/fin/accounting/journals/${r.data.id}`);
    } catch (e) {
      setError(errMsg(e, "Could not reverse the journal."));
      setReverseOpen(false);
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <FinGuard permission="fin.accounting.view">
      <div className="mx-auto max-w-4xl space-y-5">
        <ErrorNote message={error} />
        {entry && (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={STATUS_BADGE[entry.status].variant}>{STATUS_BADGE[entry.status].label}</Badge>
            {entry.status !== "DRAFT" && <span className="font-mono text-sm font-semibold text-ink">{entry.reference}</span>}
            {entry.type === "REVERSAL" && entry.reversalOf && <Link className="text-sm text-brand hover:underline" href={`/fin/accounting/journals/${entry.reversalOf}`}>Reverses an earlier entry</Link>}
            {entry.status === "REVERSED" && entry.reversedById && <Link className="text-sm text-brand hover:underline" href={`/fin/accounting/journals/${entry.reversedById}`}>See the reversing entry</Link>}
          </div>
        )}

        <div className="app-card grid gap-4 p-5 sm:grid-cols-3">
          <FormField label="Date" required>
            <input type="date" className={control} value={date} onChange={(e) => setDate(e.target.value)} disabled={!editable} required />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Description" required>
              <input className={control} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} disabled={!editable} required />
            </FormField>
          </div>
          <div className="sm:col-span-3">
            <FormField label="Notes">
              <input className={control} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} disabled={!editable} />
            </FormField>
          </div>
        </div>

        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-3 py-3">Account</th>
                <th className="px-3 py-3">Memo</th>
                <th className="w-36 px-3 py-3 text-right">Debit</th>
                <th className="w-36 px-3 py-3 text-right">Credit</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select className="app-control w-full" value={l.accountId} onChange={(e) => setLine(l.key, { accountId: e.target.value })} aria-label="Account">
                        <option value="">Choose an account…</option>
                        {ACCOUNT_TYPES.map((t) => (
                          <optgroup key={t} label={TYPE_LABEL[t]}>
                            {usable.filter((a) => a.type === t).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <span>{accountLabel(l.accountId) || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? <input className="app-control w-full" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} maxLength={240} aria-label="Memo" /> : l.description}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={l.debit} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} aria-label="Debit" /> : <span className="tabular-nums">{l.debit ? amount(num(l.debit)) : ""}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? <input className="app-control w-full text-right tabular-nums" inputMode="decimal" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} aria-label="Credit" /> : <span className="tabular-nums">{l.credit ? amount(num(l.credit)) : ""}</span>}
                  </td>
                  {editable && (
                    <td className="px-1">
                      <button type="button" className="rounded-md p-1.5 text-ink/40 hover:bg-field hover:text-red-600" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label="Remove line" disabled={lines.length <= 2}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-field/50 font-semibold">
              <tr>
                <td className="px-3 py-3" colSpan={2}>
                  {editable && <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ Add line</button>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{amount(totals.debit / 100)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{amount(totals.credit / 100)}</td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {editable && (
          <p className={`text-sm font-medium ${balanced ? "text-emerald-600" : "text-amber-700"}`} role="status">
            {totals.invalid
              ? "An amount is not valid (use numbers with at most 2 decimals)."
              : bothSides
                ? "A line can be a debit or a credit, not both."
                : totals.debit === totals.credit && totals.debit > 0
                  ? filled.every((l) => l.accountId) ? "Balanced: ready to post." : "Choose an account on every line."
                  : `Out of balance by ${amount(Math.abs(totals.diff) / 100)}`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {editable && canCreate && (
            <>
              <button className="app-button-secondary" disabled={!!busy || !description.trim() || filled.length === 0 || totals.invalid} onClick={() => save(false)}>{busy === "save" ? <Spinner size="xs" /> : null} Save draft</button>
              {canPost && <button className="app-button-primary" disabled={!!busy || !balanced || !description.trim()} onClick={() => save(true)}>{busy === "post" ? <Spinner size="xs" /> : null} Save &amp; post</button>}
              {entry && <button className="app-button-danger" disabled={!!busy} onClick={() => setConfirmDelete(true)}>Delete draft</button>}
            </>
          )}
          {entry?.status === "POSTED" && entry.type !== "REVERSAL" && canVoid && (
            <button className="app-button-secondary" disabled={!!busy} onClick={() => setReverseOpen(true)}>Reverse this entry</button>
          )}
          <Link href="/fin/accounting/journals" className="ml-auto text-sm text-ink/60 hover:underline">Back to journals</Link>
        </div>
        {entry && entry.status !== "DRAFT" && <p className="text-xs text-ink/45">Posted entries can never be edited or deleted. To correct one, reverse it and post a new entry.</p>}

        <ConfirmModal open={confirmDelete} title="Delete this draft?" message="The draft will be removed. Only drafts can be deleted." confirmLabel="Delete" loading={busy === "delete"} onConfirm={remove} onClose={() => setConfirmDelete(false)} />
        <ReverseModal open={reverseOpen} busy={busy === "reverse"} onClose={() => setReverseOpen(false)} onConfirm={reverse} />
      </div>
    </FinGuard>
  );
}

function ReverseModal({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  function submit(e: FormEvent) {
    e.preventDefault();
    onConfirm(reason.trim());
  }
  return (
    <Modal open={open} onClose={onClose} title="Reverse this entry" size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/70">This posts an exact opposite entry and marks this one as reversed. Nothing is deleted.</p>
        <FormField label="Reason" required>
          <input className={control} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} required autoFocus />
        </FormField>
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || reason.trim().length < 3}>{busy ? <Spinner size="xs" /> : null} Reverse</button>
        </div>
      </form>
    </Modal>
  );
}
