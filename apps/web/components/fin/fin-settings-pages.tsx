"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, ImagePlus, Trash2 } from "lucide-react";
import { FormField } from "../form-field";
import { Spinner } from "../ui";
import { Envelope, errMsg, finGet, finSend, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

type Settings = {
  businessName: string;
  legalName: string | null;
  tin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
  hasLogo: boolean;
  currency: string;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
};

type Sequence = {
  docType: string;
  label: string;
  prefix: string;
  padding: number;
  nextNumber: number;
  includeYear: boolean;
  resetYearly: boolean;
  preview: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MAX_LOGO_BYTES = 700 * 1024;

const control = "app-control w-full";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="app-card p-5 lg:p-6">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink/55">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SaveBar({ saving, saved, error, disabled }: { saving: boolean; saved: boolean; error: string; disabled: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button type="submit" className="app-button-primary" disabled={saving || disabled}>
        {saving ? <Spinner size="sm" /> : null}
        Save
      </button>
      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600" role="status">
          <CircleCheck className="h-4 w-4" aria-hidden /> Saved
        </span>
      )}
      {error && <span className="text-sm font-medium text-red-600" role="alert">{error}</span>}
    </div>
  );
}

// ─── Settings page ───────────────────────────────────────────────────────────

export function FinSettingsPage() {
  useFinHeader("Settings", "Business details, currency, fiscal year and document numbering");
  const canEdit = useFinPermission("fin.settings.settings");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(() => {
    finGet<{ settings: Settings; sequences: Sequence[] }>("/settings")
      .then((r) => {
        setSettings(r.data.settings);
        setSequences(r.data.sequences);
      })
      .catch((e) => setLoadError(errMsg(e, "Could not load the settings.")));
  }, []);
  useEffect(load, [load]);

  return (
    <FinGuard permission="fin.settings.view">
      <div className="mx-auto max-w-3xl space-y-6">
        <ErrorNote message={loadError} />
        {!settings && !loadError && <div className="flex justify-center py-16"><Spinner /></div>}
        {settings && (
          <>
            {!canEdit && <p className="rounded-lg border border-line bg-field px-4 py-3 text-sm text-ink/70">You can view these settings but not change them.</p>}
            <BusinessSection settings={settings} canEdit={canEdit} onSaved={setSettings} />
            <CurrencySection settings={settings} canEdit={canEdit} onSaved={setSettings} />
            <NumberingSection sequences={sequences} canEdit={canEdit} onSaved={setSequences} />
          </>
        )}
      </div>
    </FinGuard>
  );
}

function useSaver<T>(call: () => Promise<Envelope<T>>, onDone: (v: T) => void) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const r = await call();
      onDone(r.data);
      setSaved(true);
    } catch (e) {
      setError(errMsg(e, "Could not save."));
    } finally {
      setSaving(false);
    }
  }
  return { saving, saved, error, run, clear: () => setSaved(false) };
}

function BusinessSection({ settings, canEdit, onSaved }: { settings: Settings; canEdit: boolean; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState({
    businessName: settings.businessName,
    legalName: settings.legalName ?? "",
    tin: settings.tin ?? "",
    addressLine1: settings.addressLine1 ?? "",
    addressLine2: settings.addressLine2 ?? "",
    city: settings.city ?? "",
    region: settings.region ?? "",
    country: settings.country,
    phone: settings.phone ?? "",
    email: settings.email ?? ""
  });
  const [logo, setLogo] = useState<string | null>(settings.logoDataUrl);
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const saver = useSaver<Settings>(
    () => finSend<Settings>("PUT", "/settings", { ...form, logoDataUrl: logo }),
    (s) => {
      onSaved(s);
      setLogo(s.logoDataUrl);
    }
  );
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    saver.clear();
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  function pickLogo(file: File | undefined) {
    setLogoError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setLogoError("Use a PNG, JPEG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("That image is too large. Please use one under 700 KB.");
    const reader = new FileReader();
    reader.onload = () => {
      saver.clear();
      setLogo(String(reader.result));
    };
    reader.onerror = () => setLogoError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void saver.run();
  }

  return (
    <Section title="Business details" description="Shown on invoices, receipts, statements and other finance documents.">
      <form onSubmit={submit}>
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Business name" required>
            <input className={control} value={form.businessName} onChange={set("businessName")} maxLength={160} required />
          </FormField>
          <FormField label="Legal name" hint="If different from the business name">
            <input className={control} value={form.legalName} onChange={set("legalName")} maxLength={160} />
          </FormField>
          <FormField label="TIN" hint="Tax Identification Number">
            <input className={control} value={form.tin} onChange={set("tin")} maxLength={40} />
          </FormField>
          <FormField label="Phone">
            <input className={control} value={form.phone} onChange={set("phone")} maxLength={40} inputMode="tel" />
          </FormField>
          <FormField label="Email">
            <input className={control} type="email" value={form.email} onChange={set("email")} maxLength={160} />
          </FormField>
          <FormField label="Country">
            <input className={control} value={form.country} onChange={set("country")} maxLength={80} />
          </FormField>
          <FormField label="Address line 1">
            <input className={control} value={form.addressLine1} onChange={set("addressLine1")} maxLength={160} />
          </FormField>
          <FormField label="Address line 2">
            <input className={control} value={form.addressLine2} onChange={set("addressLine2")} maxLength={160} />
          </FormField>
          <FormField label="City / town">
            <input className={control} value={form.city} onChange={set("city")} maxLength={80} />
          </FormField>
          <FormField label="Region">
            <input className={control} value={form.region} onChange={set("region")} maxLength={80} />
          </FormField>

          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-ink">Logo</p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <div className="grid h-20 w-40 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-field">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Business logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-ink/40">No logo</span>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickLogo(e.target.files?.[0])} aria-label="Choose a logo image" />
                  <button type="button" className="app-button-secondary" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" aria-hidden /> {logo ? "Change" : "Upload"}
                  </button>
                  {logo && (
                    <button type="button" className="app-button-secondary" onClick={() => { saver.clear(); setLogo(null); }}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Remove
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink/45">PNG, JPEG or WebP, up to 700 KB.</p>
            {logoError && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{logoError}</p>}
          </div>
        </fieldset>
        {canEdit && <SaveBar saving={saver.saving} saved={saver.saved} error={saver.error} disabled={form.businessName.trim().length === 0} />}
      </form>
    </Section>
  );
}

function CurrencySection({ settings, canEdit, onSaved }: { settings: Settings; canEdit: boolean; onSaved: (s: Settings) => void }) {
  const [currency, setCurrency] = useState(settings.currency);
  const [month, setMonth] = useState(settings.fiscalYearStartMonth);
  const [day, setDay] = useState(settings.fiscalYearStartDay);
  const maxDay = DAYS_IN_MONTH[month - 1];
  const saver = useSaver<Settings>(() => finSend<Settings>("PUT", "/settings", { currency, fiscalYearStartMonth: month, fiscalYearStartDay: Math.min(day, maxDay) }), onSaved);

  function submit(e: FormEvent) {
    e.preventDefault();
    void saver.run();
  }

  return (
    <Section title="Currency and fiscal year" description="Every amount in the books is in this currency.">
      <form onSubmit={submit}>
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
          <FormField label="Currency" hint="3-letter code, e.g. GHS">
            <input className={control} value={currency} onChange={(e) => { saver.clear(); setCurrency(e.target.value.toUpperCase().slice(0, 3)); }} maxLength={3} pattern="[A-Z]{3}" required />
          </FormField>
          <FormField label="Fiscal year starts in">
            <select className={control} value={month} onChange={(e) => { saver.clear(); setMonth(Number(e.target.value)); }}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </FormField>
          <FormField label="On day">
            <select className={control} value={Math.min(day, maxDay)} onChange={(e) => { saver.clear(); setDay(Number(e.target.value)); }}>
              {Array.from({ length: maxDay }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </FormField>
        </fieldset>
        {canEdit && <SaveBar saving={saver.saving} saved={saver.saved} error={saver.error} disabled={currency.length !== 3} />}
      </form>
    </Section>
  );
}

function NumberingSection({ sequences, canEdit, onSaved }: { sequences: Sequence[]; canEdit: boolean; onSaved: (s: Sequence[]) => void }) {
  return (
    <Section title="Document numbering" description="How invoices, receipts and other documents are numbered. The next number can only go up, so a number is never used twice.">
      <div className="space-y-4">
        {sequences.map((s) => (
          <NumberRow key={s.docType} seq={s} canEdit={canEdit} onSaved={onSaved} />
        ))}
      </div>
    </Section>
  );
}

function NumberRow({ seq, canEdit, onSaved }: { seq: Sequence; canEdit: boolean; onSaved: (s: Sequence[]) => void }) {
  const [prefix, setPrefix] = useState(seq.prefix);
  const [padding, setPadding] = useState(seq.padding);
  const [next, setNext] = useState(seq.nextNumber);
  const [includeYear, setIncludeYear] = useState(seq.includeYear);
  const [resetYearly, setResetYearly] = useState(seq.resetYearly);
  const saver = useSaver<Sequence[]>(() => finSend<Sequence[]>("PUT", `/numbering/${seq.docType}`, { prefix, padding, nextNumber: next, includeYear, resetYearly }), onSaved);

  // Live preview of what the next document will be called.
  const year = new Date().getFullYear();
  const preview = [prefix || "—", includeYear ? String(year) : null, String(Math.max(1, next)).padStart(padding, "0")].filter(Boolean).join("-");
  const dirty = prefix !== seq.prefix || padding !== seq.padding || next !== seq.nextNumber || includeYear !== seq.includeYear || resetYearly !== seq.resetYearly;

  function submit(e: FormEvent) {
    e.preventDefault();
    void saver.run();
  }
  const touch = () => saver.clear();

  return (
    <form onSubmit={submit} className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">{seq.label}</p>
        <p className="text-sm text-ink/60">
          Next: <span className="font-mono font-semibold text-ink">{preview}</span>
        </p>
      </div>
      <fieldset disabled={!canEdit} className="mt-3 grid gap-3 sm:grid-cols-4">
        <FormField label="Prefix">
          <input className={control} value={prefix} onChange={(e) => { touch(); setPrefix(e.target.value.toUpperCase()); }} maxLength={12} pattern="[A-Z0-9\-]{1,12}" required />
        </FormField>
        <FormField label="Digits">
          <select className={control} value={padding} onChange={(e) => { touch(); setPadding(Number(e.target.value)); }}>
            {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </FormField>
        <FormField label="Next number" hint="Can only go up">
          <input className={control} type="number" min={seq.nextNumber} value={next} onChange={(e) => { touch(); setNext(Math.max(1, Math.floor(Number(e.target.value) || 1))); }} />
        </FormField>
        <div className="grid content-end gap-2 text-sm text-ink">
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeYear} onChange={(e) => { touch(); setIncludeYear(e.target.checked); }} /> Include the year</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={resetYearly} onChange={(e) => { touch(); setResetYearly(e.target.checked); }} /> Restart every year</label>
        </div>
      </fieldset>
      {canEdit && <SaveBar saving={saver.saving} saved={saver.saved} error={saver.error} disabled={!dirty} />}
    </form>
  );
}

// ─── Audit log ───────────────────────────────────────────────────────────────

type AuditRow = { id: string; createdAt: string; userId: string | null; area: string; action: string; entityType: string; summary: string };

export function FinAuditLogPage() {
  useFinHeader("Audit Log", "Every change made in the finance module. Entries can never be edited or deleted.");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [area, setArea] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const take = 50;

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), take: String(take), ...(area ? { area } : {}) });
    finGet<AuditRow[]>(`/audit-log?${q.toString()}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta?.total ?? 0);
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the audit log.")))
      .finally(() => setLoading(false));
  }, [page, area]);

  const pages = Math.max(1, Math.ceil(total / take));
  return (
    <FinGuard permission="fin.settings.view">
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            Area
            <select className="app-control" value={area} onChange={(e) => { setPage(1); setArea(e.target.value); }}>
              <option value="">All</option>
              <option value="settings">Settings</option>
              <option value="accounting">Accounting</option>
            </select>
          </label>
          <span className="text-sm text-ink/50">{total} entries</span>
        </div>
        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">What happened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink/70">{new Date(r.createdAt).toLocaleString("en-GH")}</td>
                  <td className="px-4 py-2.5 capitalize">{r.area}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2.5">{r.summary}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink/50">Nothing recorded yet.</td></tr>
              )}
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
