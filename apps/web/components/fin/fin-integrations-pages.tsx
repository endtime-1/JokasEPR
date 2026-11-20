"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, RefreshCw } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { Pager, usePaged } from "./fin-banking-parts";
import { useSalesLookups } from "./fin-sales-api";
import { ContactSelect, SalesTabs, control, money } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

type LinkInfo = {
  key: string;
  label: string;
  description: string;
  available: boolean;
  unavailableReason: string | null;
  enabled: boolean;
  enabledAt: string | null;
  defaultTaxCodeId: string | null;
  defaultAccountId: string | null;
  autoCreateContacts: boolean;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  counts: { created: number; needsMapping: number; errors: number; cancelled: number };
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" }) : "never");

// ─── Settings > Integrations ─────────────────────────────────────────────────

export function FinIntegrationsSettingsPage() {
  useFinHeader("Settings", "Business details, numbering, tax, links to other modules and the audit log");
  const canEdit = useFinPermission("fin.settings.settings");
  const [links, setLinks] = useState<LinkInfo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () =>
    finGet<LinkInfo[]>("/integrations")
      .then((r) => { setLinks(r.data); setError(""); })
      .catch((e) => setError(errMsg(e, "Could not load the links.")))
      .finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  return (
    <FinGuard permission="fin.settings.view">
      <div className="space-y-4">
        <p className="text-sm text-ink/65">Links let finance pick up work from other parts of the system. <b>Every link is OFF until you switch it on.</b> A link only ever creates <b>drafts</b>: nothing reaches the books until a finance user reviews and posts it. The other modules are never changed by a link.</p>
        <ErrorNote message={error} />
        {loading && <div className="py-10 text-center"><Spinner /></div>}
        {links.map((l) => <LinkCard key={l.key} link={l} canEdit={canEdit} onChanged={load} />)}
      </div>
    </FinGuard>
  );
}

function LinkCard({ link, canEdit, onChanged }: { link: LinkInfo; canEdit: boolean; onChanged: () => void }) {
  const { income, taxCodes } = useSalesLookups();
  const [tax, setTax] = useState(link.defaultTaxCodeId ?? "");
  const [account, setAccount] = useState(link.defaultAccountId ?? "");
  const [auto, setAuto] = useState(link.autoCreateContacts);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { setTax(link.defaultTaxCodeId ?? ""); setAccount(link.defaultAccountId ?? ""); setAuto(link.autoCreateContacts); }, [link]);

  async function save(patch: Record<string, unknown>, label: string) {
    setBusy(label); setError(""); setNote("");
    try {
      await finSend("PUT", `/integrations/links/${link.key}`, patch);
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Could not save."));
    } finally {
      setBusy("");
    }
  }
  async function syncNow() {
    setBusy("sync"); setError(""); setNote("");
    try {
      const r = await finSend<{ created?: number; needsMapping?: number; errors?: number; skipped?: boolean }>("POST", "/integrations/sync");
      setNote(r.data.skipped ? "A sync is already running. Try again in a moment." : `${r.data.created ?? 0} draft(s) created, ${r.data.needsMapping ?? 0} waiting for a customer match, ${r.data.errors ?? 0} problem(s).`);
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Could not sync."));
    } finally {
      setBusy("");
    }
  }
  const dirty = tax !== (link.defaultTaxCodeId ?? "") || account !== (link.defaultAccountId ?? "") || auto !== link.autoCreateContacts;

  return (
    <div className={`app-card space-y-4 p-5 ${link.available ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10"><Plug className="h-5 w-5 text-brand" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{link.label}</p>
          <p className="mt-0.5 text-sm text-ink/60">{link.description}</p>
          {!link.available && <p className="mt-1 text-sm font-medium text-amber-700">{link.unavailableReason}</p>}
        </div>
        <label className={`flex shrink-0 items-center gap-2 text-sm font-semibold ${link.available && canEdit ? "" : "opacity-50"}`}>
          <input type="checkbox" className="h-5 w-5" checked={link.enabled} disabled={!link.available || !canEdit || busy === "toggle"}
            onChange={(e) => {
              if (e.target.checked && !window.confirm("Switch this link on? From now on, newly approved orders will appear as DRAFT invoices for you to review. Orders approved before now are not imported.")) return;
              void save({ enabled: e.target.checked }, "toggle");
            }} />
          {link.enabled ? "ON" : "OFF"}
        </label>
      </div>
      <ErrorNote message={error} />
      {note && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</p>}

      {link.available && (
        <>
          {link.enabled && <p className="text-xs text-ink/55">Importing orders approved since {when(link.enabledAt)}. Last checked {when(link.lastRunAt)}{link.lastRunSummary ? `: ${link.lastRunSummary}` : ""}. It checks every 5 minutes.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tax code for the draft lines (optional)" hint="Blank = no tax added. The order's own tax is not copied.">
              <select className={control} value={tax} onChange={(e) => setTax(e.target.value)} disabled={!canEdit}>
                <option value="">No tax</option>
                {taxCodes.filter((t) => Number(t.currentRate) > 0).map((t) => <option key={t.id} value={t.id}>{t.code} {Number(t.currentRate)}%</option>)}
              </select>
            </FormField>
            <FormField label="Income account for the draft lines (optional)" hint="Blank = your General Sales account.">
              <select className={control} value={account} onChange={(e) => setAccount(e.target.value)} disabled={!canEdit}>
                <option value="">Default sales account</option>
                {income.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </FormField>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={auto} onChange={(e) => setAuto(e.target.checked)} disabled={!canEdit} />
            <span>Create the finance customer automatically when the Sales customer is not matched yet. <span className="text-ink/50">If off, such orders wait in the review list until you match the customer.</span></span></label>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <button className="app-button-primary" disabled={!dirty || busy === "save"} onClick={() => save({ defaultTaxCodeId: tax || null, defaultAccountId: account || null, autoCreateContacts: auto }, "save")}>{busy === "save" ? <Spinner size="xs" /> : null} Save options</button>}
            {canEdit && link.enabled && <button className="app-button-secondary" disabled={busy === "sync"} onClick={syncNow}>{busy === "sync" ? <Spinner size="xs" /> : <RefreshCw className="h-4 w-4" aria-hidden />} Sync now</button>}
            <div className="flex-1" />
            <Link href="/fin/sales/incoming" className="text-sm font-semibold text-brand hover:underline">
              Review list · {link.counts.created} created{link.counts.needsMapping ? `, ${link.counts.needsMapping} need a customer match` : ""}{link.counts.errors ? `, ${link.counts.errors} problem(s)` : ""}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sales > From other modules ──────────────────────────────────────────────

type Incoming = {
  id: string;
  sourceId: string;
  sourceLabel: string | null;
  sourceCustomerId: string | null;
  sourceCustomerName: string | null;
  status: "CREATED" | "NEEDS_MAPPING" | "ERROR" | "SOURCE_CANCELLED";
  message: string | null;
  updatedAt: string;
  review: "TO_REVIEW" | "POSTED" | "VOID" | "DISCARDED" | null;
  invoice: { id: string; number: string | null; status: string; total: string; sourceTotal: string | null; issueDate: string; customer: string } | null;
};

const REVIEW_TEXT: Record<string, [string, "info" | "success" | "neutral" | "warning" | "danger"]> = {
  TO_REVIEW: ["Draft to review", "info"],
  POSTED: ["Posted", "success"],
  VOID: ["Void", "neutral"],
  DISCARDED: ["Draft discarded", "neutral"]
};

export function FinIncomingPage() {
  useFinHeader("Sales", "Invoices, quotes, payments and statements");
  const canMap = useFinPermission("fin.settings.settings");
  const [status, setStatus] = useState("all");
  const list = usePaged<Incoming>(`/integrations/incoming?status=${status}`);
  const [matching, setMatching] = useState<Incoming | null>(null);

  return (
    <FinGuard permission="fin.sales.view">
      <SalesTabs />
      <div className="space-y-4">
        <ErrorNote message={list.error} />
        <div className="flex flex-wrap items-center gap-3">
          <select className="app-control" value={status} onChange={(e) => { list.setPage(() => 1); setStatus(e.target.value); }} aria-label="Show">
            <option value="all">Everything</option><option value="CREATED">Drafts created</option><option value="NEEDS_MAPPING">Need a customer match</option><option value="ERROR">Problems</option><option value="SOURCE_CANCELLED">Order cancelled</option>
          </select>
          <p className="text-sm text-ink/55">Drafts made automatically from other modules. Open one to review, edit and post it, as with any draft invoice.</p>
          <div className="flex-1" />
          <Link href="/fin/settings/integrations" className="text-sm font-semibold text-brand hover:underline">Link settings</Link>
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">State</th><th className="px-4 py-3 text-right">Draft total</th><th className="px-4 py-3 text-right">Order total</th><th className="w-40" /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5"><span className="font-semibold">{r.sourceLabel}</span><span className="block text-xs text-ink/45">{when(r.updatedAt)}</span></td>
                  <td className="px-4 py-2.5">{r.invoice?.customer ?? r.sourceCustomerName}</td>
                  <td className="px-4 py-2.5">
                    {r.status === "NEEDS_MAPPING" && <Badge variant="warning">Needs a customer match</Badge>}
                    {r.status === "ERROR" && <Badge variant="danger">Problem</Badge>}
                    {r.status === "SOURCE_CANCELLED" && <Badge variant="danger">Order cancelled</Badge>}
                    {r.status === "CREATED" && r.review && <Badge variant={REVIEW_TEXT[r.review][1]}>{REVIEW_TEXT[r.review][0]}</Badge>}
                    {r.message && <span className={`mt-1 block max-w-sm text-xs ${r.status === "CREATED" ? "text-amber-700" : "text-ink/60"}`}>{r.message}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.invoice ? money(r.invoice.total) : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.invoice?.sourceTotal ? money(r.invoice.sourceTotal) : ""}</td>
                  <td className="px-2 text-right text-xs font-semibold">
                    {r.invoice && <Link href={`/fin/sales/invoices/${r.invoice.id}`} className="text-brand hover:underline">{r.review === "TO_REVIEW" ? "Review" : "Open"}</Link>}
                    {r.status === "NEEDS_MAPPING" && canMap && <button className="text-brand hover:underline" onClick={() => setMatching(r)}>Match customer</button>}
                  </td>
                </tr>
              ))}
              {list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center"><Spinner /></td></tr>}
              {!list.loading && list.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/50">Nothing yet. Switch a link on under Settings &gt; Integrations.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
        <MatchModal row={matching} onClose={() => setMatching(null)} onDone={() => { setMatching(null); list.refresh(); }} />
      </div>
    </FinGuard>
  );
}

function MatchModal({ row, onClose, onDone }: { row: Incoming | null; onClose: () => void; onDone: () => void }) {
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setContactId(""); setError(""); }, [row]);
  async function submit() {
    if (!row?.sourceCustomerId) return;
    setBusy(true); setError("");
    try {
      await finSend("POST", "/integrations/map-customer", { sourceCustomerId: row.sourceCustomerId, contactId });
      onDone();
    } catch (e) {
      setError(errMsg(e, "Could not match the customer."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={row !== null} onClose={onClose} title="Match this customer" size="md">
      <div className="grid gap-4">
        <p className="text-sm text-ink/65">The Sales module calls this customer <b>{row?.sourceCustomerName}</b>. Choose the finance customer it is. All of this customer's waiting orders will then become drafts, and future ones will match automatically.</p>
        <FormField label="Finance customer" required><ContactSelect value={contactId} onChange={(id) => setContactId(id)} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="app-button-primary" onClick={submit} disabled={busy || !contactId}>{busy ? <Spinner size="xs" /> : null} Match and import</button>
        </div>
      </div>
    </Modal>
  );
}
