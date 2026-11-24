"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Percent, Plus } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, EmptyState, Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

const control = "app-control w-full";

type Rate = { id: string; ratePercent: string; effectiveFrom: string; note: string | null };
type TaxCode = {
  id: string;
  code: string;
  name: string;
  appliesTo: "SALES" | "PURCHASES" | "BOTH";
  isRecoverable: boolean;
  isActive: boolean;
  description: string | null;
  currentRate: string | null;
  rates: Rate[];
};

const APPLIES: Record<TaxCode["appliesTo"], string> = { SALES: "Sales", PURCHASES: "Purchases", BOTH: "Sales and purchases" };

/** "15.0000" -> "15", "2.5000" -> "2.5". */
const pct = (r: string | null) => (r === null ? "—" : `${Number(r)}%`);

export function FinTaxPage() {
  useFinHeader("Tax", "Tax codes and their rates. A rate takes effect from a date and is never changed afterwards.");
  const canEdit = useFinPermission("fin.settings.settings");
  const [codes, setCodes] = useState<TaxCode[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [rateFor, setRateFor] = useState<TaxCode | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    finGet<TaxCode[]>("/tax-codes")
      .then((r) => {
        setCodes(r.data);
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the tax codes.")));
  }, []);
  useEffect(load, [load]);

  async function toggle(c: TaxCode) {
    setBusyId(c.id);
    setError("");
    try {
      const r = await finSend<TaxCode[]>("PATCH", `/tax-codes/${c.id}`, { isActive: !c.isActive });
      setCodes(r.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <FinGuard permission="fin.settings.view">
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorNote message={error} />
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-ink/60">Invoices and bills use the rate in force on their own date, so changing a rate never alters a document that has already been issued.</p>
          {canEdit && <button className="app-button-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> New tax code</button>}
        </div>
        {!codes && !error && <div className="flex justify-center py-16"><Spinner /></div>}
        {codes?.length === 0 && <div className="app-card"><EmptyState icon={Percent} title="No tax codes" /></div>}
        {codes?.map((c) => (
          <section key={c.id} className={`app-card p-5 ${c.isActive ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-ink">{c.name} <span className="ml-1 font-mono text-xs font-normal text-ink/50">{c.code}</span></p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="neutral">{APPLIES[c.appliesTo]}</Badge>
                  {c.isRecoverable && <Badge variant="info">Recoverable</Badge>}
                  {!c.isActive && <Badge variant="neutral">Switched off</Badge>}
                </div>
                {c.description && <p className="mt-2 text-sm text-ink/60">{c.description}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-ink/45">Rate today</p>
                <p className="text-2xl font-bold tabular-nums text-ink">{pct(c.currentRate)}</p>
              </div>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink/45">
                <tr><th className="py-1.5">From</th><th className="py-1.5 text-right">Rate</th><th className="py-1.5 pl-4">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.rates.map((r) => (
                  <tr key={r.id}><td className="py-1.5">{r.effectiveFrom}</td><td className="py-1.5 text-right tabular-nums">{pct(r.ratePercent)}</td><td className="py-1.5 pl-4 text-ink/55">{r.note ?? ""}</td></tr>
                ))}
              </tbody>
            </table>
            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="app-button-secondary" onClick={() => setRateFor(c)}>Add a new rate</button>
                <button className="app-button-secondary" disabled={busyId === c.id} onClick={() => toggle(c)}>{c.isActive ? "Switch off" : "Switch on"}</button>
              </div>
            )}
          </section>
        ))}

        <NewCodeModal open={creating} onClose={() => setCreating(false)} onSaved={(list) => { setCodes(list); setCreating(false); }} />
        <AddRateModal code={rateFor} onClose={() => setRateFor(null)} onSaved={(list) => { setCodes(list); setRateFor(null); }} />
      </div>
    </FinGuard>
  );
}

function NewCodeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (list: TaxCode[]) => void }) {
  const [form, setForm] = useState({ code: "", name: "", appliesTo: "BOTH", isRecoverable: false, ratePercent: "", effectiveFrom: today(), description: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ code: "", name: "", appliesTo: "BOTH", isRecoverable: false, ratePercent: "", effectiveFrom: today(), description: "" });
      setError("");
    }
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await finSend<TaxCode[]>("POST", "/tax-codes", { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() || null });
      onSaved(r.data);
    } catch (err) {
      setError(errMsg(err, "Could not create the tax code."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New tax code">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Code" required hint="Short, e.g. VAT"><input className={control} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} maxLength={20} pattern="[A-Z0-9_\-]{1,20}" required /></FormField>
          <FormField label="Name" required><input className={control} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} required /></FormField>
          <FormField label="Applies to">
            <select className={control} value={form.appliesTo} onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))}>
              <option value="BOTH">Sales and purchases</option>
              <option value="SALES">Sales only</option>
              <option value="PURCHASES">Purchases only</option>
            </select>
          </FormField>
          <FormField label="Rate (%)" required hint="For example 15 or 2.5"><input className={control} inputMode="decimal" value={form.ratePercent} onChange={(e) => setForm((f) => ({ ...f, ratePercent: e.target.value }))} required /></FormField>
          <FormField label="Applies from" required><input type="date" className={control} value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} required /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.isRecoverable} onChange={(e) => setForm((f) => ({ ...f, isRecoverable: e.target.checked }))} /> Purchase tax we can claim back (otherwise it is added to the cost)</label>
        <FormField label="Description"><input className={control} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={240} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={saving}>{saving ? <Spinner size="xs" /> : null} Create</button>
        </div>
      </form>
    </Modal>
  );
}

function AddRateModal({ code, onClose, onSaved }: { code: TaxCode | null; onClose: () => void; onSaved: (list: TaxCode[]) => void }) {
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (code) {
      setRate("");
      setFrom(today());
      setNote("");
      setError("");
    }
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code) return;
    setSaving(true);
    setError("");
    try {
      const r = await finSend<TaxCode[]>("POST", `/tax-codes/${code.id}/rates`, { ratePercent: rate, effectiveFrom: from, note: note.trim() || undefined });
      onSaved(r.data);
    } catch (err) {
      setError(errMsg(err, "Could not add the rate."));
    } finally {
      setSaving(false);
    }
  }

  const latest = code?.rates[0]?.effectiveFrom;
  return (
    <Modal open={code !== null} onClose={onClose} title={code ? `New rate for ${code.name}` : "New rate"} size="sm">
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-ink/65">{code && `Today it is ${pct(code.currentRate)}.`} The new rate must start after {latest ?? "the first rate"}; earlier rates are kept as they are.</p>
        <FormField label="New rate (%)" required><input className={control} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required autoFocus /></FormField>
        <FormField label="Applies from" required><input type="date" className={control} value={from} onChange={(e) => setFrom(e.target.value)} required /></FormField>
        <FormField label="Note"><input className={control} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Budget announcement" /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={saving || !rate.trim()}>{saving ? <Spinner size="xs" /> : null} Add rate</button>
        </div>
      </form>
    </Modal>
  );
}
