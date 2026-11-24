"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookUser, Download, FileUp, Pencil, Plus, Search } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, EmptyState, Modal, Spinner } from "../ui";
import { FinContact, amount, downloadText, errMsg, finGet, finSend, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

const control = "app-control w-full";

type Tab = "all" | "customer" | "supplier";

export function FinContactsPage() {
  useFinHeader("Contacts", "Your customers and suppliers");
  const canCreate = useFinPermission("fin.contacts.create");
  const canImport = useFinPermission("fin.contacts.import");
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FinContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<FinContact | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);
  const take = 50;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ type: tab, page: String(page), take: String(take) });
      if (search.trim()) q.set("search", search.trim());
      if (activeOnly) q.set("activeOnly", "true");
      finGet<FinContact[]>(`/contacts?${q.toString()}`)
        .then((r) => {
          setRows(r.data);
          setTotal(r.meta?.total ?? 0);
          setError("");
        })
        .catch((e) => setError(errMsg(e, "Could not load the contacts.")))
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [tab, search, activeOnly, page, reload]);

  async function exportAll() {
    try {
      const r = await finGet<{ csv: string }>("/contacts/export");
      downloadText(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, r.data.csv);
    } catch (e) {
      setError(errMsg(e, "Could not export the contacts."));
    }
  }

  const pages = Math.max(1, Math.ceil(total / take));
  const changeFilter = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(1);
    set(v);
  };

  return (
    <FinGuard permission="fin.contacts.view">
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
            {(["all", "customer", "supplier"] as Tab[]).map((t) => (
              <button key={t} className={`px-3 py-2 capitalize ${tab === t ? "bg-brand text-white" : "bg-surface text-ink"}`} onClick={() => changeFilter(setTab)(t)}>
                {t === "all" ? "All" : t === "customer" ? "Customers" : "Suppliers"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden />
            <input className="app-control w-64 pl-9" placeholder="Search name, code, phone, email, TIN" value={search} onChange={(e) => changeFilter(setSearch)(e.target.value)} aria-label="Search contacts" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={activeOnly} onChange={(e) => changeFilter(setActiveOnly)(e.target.checked)} /> Active only</label>
          <div className="flex-1" />
          {canImport && (
            <>
              <button className="app-button-secondary" onClick={exportAll}><Download className="h-4 w-4" aria-hidden /> Export</button>
              <button className="app-button-secondary" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" aria-hidden /> Import CSV</button>
            </>
          )}
          {canCreate && <button className="app-button-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> New contact</button>}
        </div>

        <div className="app-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Terms</th>
                <th className="px-4 py-3 text-right">Credit limit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink/60">{c.code}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {c.isCustomer && <Badge variant="info">Customer</Badge>}
                      {c.isSupplier && <Badge variant="warning">Supplier</Badge>}
                      {!c.isActive && <Badge variant="neutral">Inactive</Badge>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{c.phone ?? ""}</td>
                  <td className="px-4 py-2.5">{c.email ?? ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.paymentTermsDays ? `${c.paymentTermsDays} days` : "Immediate"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.creditLimit ? amount(Number(c.creditLimit)) : ""}</td>
                  <td className="px-1">
                    {canCreate && (
                      <button className="rounded-md p-1.5 text-ink/50 hover:bg-field hover:text-ink" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center"><Spinner /></td></tr>}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <EmptyState
              icon={BookUser}
              title={search ? "No contacts match" : "No contacts yet"}
              description={search ? undefined : "Add your customers and suppliers one by one, or import them from a CSV file."}
              action={!search && canCreate ? <button className="app-button-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> New contact</button> : undefined}
            />
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button className="app-button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="text-ink/60">Page {page} of {pages} · {total} contacts</span>
            <button className="app-button-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}

        <ContactModal
          open={editing !== null}
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
        <ImportModal
          open={importing}
          onClose={() => setImporting(false)}
          onDone={() => {
            setReload((n) => n + 1);
          }}
        />
      </div>
    </FinGuard>
  );
}

// ─── Add / edit ──────────────────────────────────────────────────────────────

type Form = {
  name: string;
  code: string;
  isCustomer: boolean;
  isSupplier: boolean;
  contactPerson: string;
  phone: string;
  email: string;
  tin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  paymentTermsDays: string;
  creditLimit: string;
  notes: string;
  externalRef: string;
  isActive: boolean;
};

const blank: Form = { name: "", code: "", isCustomer: true, isSupplier: false, contactPerson: "", phone: "", email: "", tin: "", addressLine1: "", addressLine2: "", city: "", region: "", paymentTermsDays: "0", creditLimit: "", notes: "", externalRef: "", isActive: true };

function ContactModal({ open, contact, onClose, onSaved }: { open: boolean; contact: FinContact | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setDuplicate("");
    setForm(
      contact
        ? {
            name: contact.name, code: contact.code, isCustomer: contact.isCustomer, isSupplier: contact.isSupplier, contactPerson: contact.contactPerson ?? "", phone: contact.phone ?? "", email: contact.email ?? "",
            tin: contact.tin ?? "", addressLine1: contact.addressLine1 ?? "", addressLine2: contact.addressLine2 ?? "", city: contact.city ?? "", region: contact.region ?? "",
            paymentTermsDays: String(contact.paymentTermsDays), creditLimit: contact.creditLimit ?? "", notes: contact.notes ?? "", externalRef: contact.externalRef ?? "", isActive: contact.isActive
          }
        : blank
    );
  }, [open, contact]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setDuplicate("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function save(confirmDuplicate: boolean) {
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        isCustomer: form.isCustomer,
        isSupplier: form.isSupplier,
        contactPerson: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tin: form.tin.trim() || null,
        addressLine1: form.addressLine1.trim() || null,
        addressLine2: form.addressLine2.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        paymentTermsDays: Math.max(0, Math.min(365, Math.floor(Number(form.paymentTermsDays) || 0))),
        creditLimit: form.creditLimit.trim() || null,
        notes: form.notes.trim() || null,
        externalRef: form.externalRef.trim() || null,
        ...(confirmDuplicate ? { confirmDuplicate: true } : {})
      };
      if (contact) await finSend("PATCH", `/contacts/${contact.id}`, { ...body, isActive: form.isActive });
      else await finSend("POST", "/contacts", { ...body, ...(form.code.trim() ? { code: form.code.trim() } : {}) });
      onSaved();
    } catch (e) {
      const msg = errMsg(e, "Could not save the contact.");
      if (msg.startsWith("Possible duplicate")) setDuplicate(msg);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? `Edit ${contact.code}` : "New contact"} size="lg">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required>
            <input className={control} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={160} required autoFocus />
          </FormField>
          <FormField label="Code" hint={contact ? "Codes never change" : "Leave blank to number it automatically"}>
            <input className={control} value={form.code} onChange={(e) => set("code", e.target.value)} maxLength={30} disabled={!!contact} placeholder={contact ? "" : "Automatic"} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-ink">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCustomer} onChange={(e) => set("isCustomer", e.target.checked)} /> Customer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isSupplier} onChange={(e) => set("isSupplier", e.target.checked)} /> Supplier</label>
          {contact && <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active</label>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Contact person"><input className={control} value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} maxLength={120} /></FormField>
          <FormField label="Phone" hint="0244123456 becomes +233244123456"><input className={control} value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} inputMode="tel" /></FormField>
          <FormField label="Email"><input className={control} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={160} /></FormField>
          <FormField label="TIN"><input className={control} value={form.tin} onChange={(e) => set("tin", e.target.value)} maxLength={40} /></FormField>
          <FormField label="Address line 1"><input className={control} value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} maxLength={160} /></FormField>
          <FormField label="Address line 2"><input className={control} value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} maxLength={160} /></FormField>
          <FormField label="City / town"><input className={control} value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} /></FormField>
          <FormField label="Region"><input className={control} value={form.region} onChange={(e) => set("region", e.target.value)} maxLength={80} /></FormField>
          <FormField label="Payment terms (days)" hint="0 = pay immediately"><input className={control} type="number" min={0} max={365} value={form.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value)} /></FormField>
          <FormField label="Credit limit" hint="Leave blank for no limit"><input className={control} inputMode="decimal" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} /></FormField>
        </div>
        <FormField label="Notes"><input className={control} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></FormField>
        <FormField label="External reference" hint="An id from another system, if you have one"><input className={control} value={form.externalRef} onChange={(e) => set("externalRef", e.target.value)} maxLength={100} /></FormField>

        <ErrorNote message={error} />
        {duplicate && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            <p>{duplicate.replace(" Save again to create it anyway.", "")}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="app-button-primary" disabled={saving} onClick={() => save(true)}>{contact ? "Save anyway" : "Create anyway"}</button>
              <button type="button" className="app-button-secondary" onClick={() => setDuplicate("")}>Let me check</button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={saving || !form.name.trim() || (!form.isCustomer && !form.isSupplier)}>{saving ? <Spinner size="xs" /> : null} Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── CSV import ──────────────────────────────────────────────────────────────

type Preview = {
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  errorRows: number;
  ignoredColumns: string[];
  canImport: boolean;
  rows: { line: number; action: "create" | "update" | "error"; errors: string[]; name: string; code: string | null; matchedBy?: string }[];
};

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setFileName("");
    setCsv("");
    setPreview(null);
    setResult(null);
    setError("");
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setPreview(null);
    setResult(null);
    if (file.size > 2_000_000) return setError("That file is larger than 2 MB. Split it into smaller files.");
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setBusy(true);
    try {
      const r = await finSend<Preview>("POST", "/contacts/import/preview", { csv: text, fileName: file.name });
      setPreview(r.data);
    } catch (e) {
      setError(errMsg(e, "Could not read that file."));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError("");
    try {
      const r = await finSend<{ created: number; updated: number }>("POST", "/contacts/import/commit", { csv, fileName });
      setResult(r.data);
      setPreview(null);
      onDone();
    } catch (e) {
      setError(errMsg(e, "The import failed. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  async function template() {
    try {
      const r = await finGet<{ csv: string }>("/contacts/import/template");
      downloadText("contacts-template.csv", r.data.csv);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const problems = preview?.rows.filter((r) => r.action === "error") ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Import contacts from CSV" size="lg">
      <div className="grid gap-4">
        {!result && (
          <>
            <p className="text-sm text-ink/65">
              Upload a CSV file with one contact per row. You will see a preview first and nothing is saved until you confirm. Rows match an existing contact by code, external reference, or name and phone, and update it; blank cells never erase existing details.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => void pick(e.target.files?.[0])} />
              <button className="app-button-primary" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp className="h-4 w-4" aria-hidden /> {fileName ? "Choose another file" : "Choose a CSV file"}</button>
              <button className="app-button-secondary" onClick={template}><Download className="h-4 w-4" aria-hidden /> Download template</button>
              {fileName && <span className="text-sm text-ink/60">{fileName}</span>}
              {busy && <Spinner size="sm" />}
            </div>
          </>
        )}
        <ErrorNote message={error} />

        {preview && (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="success">{preview.toCreate} to create</Badge>
              <Badge variant="info">{preview.toUpdate} to update</Badge>
              <Badge variant={preview.errorRows ? "danger" : "neutral"}>{preview.errorRows} with problems</Badge>
              <span className="text-ink/55">{preview.totalRows} rows</span>
            </div>
            {preview.ignoredColumns.length > 0 && <p className="text-xs text-ink/50">Ignored columns: {preview.ignoredColumns.join(", ")}</p>}
            {problems.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm">
                <p className="mb-2 font-semibold text-red-800">Fix these rows in your file, then choose it again. Nothing is imported while any row has a problem.</p>
                <ul className="space-y-1.5">
                  {problems.slice(0, 100).map((r) => (
                    <li key={r.line} className="text-red-900"><span className="font-mono text-xs">Line {r.line}</span> {r.name && `(${r.name})`}: {r.errors.join(" ")}</li>
                  ))}
                </ul>
                {problems.length > 100 && <p className="mt-2 text-xs text-red-800">…and {problems.length - 100} more.</p>}
              </div>
            )}
            {problems.length === 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {preview.rows.slice(0, 50).map((r) => (
                      <tr key={r.line}>
                        <td className="px-3 py-1.5 font-mono text-xs text-ink/45">{r.line}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5"><Badge variant={r.action === "create" ? "success" : "info"}>{r.action === "create" ? "New" : `Update ${r.code ?? ""}`}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 50 && <p className="px-3 py-2 text-xs text-ink/50">Showing the first 50 of {preview.rows.length} rows.</p>}
              </div>
            )}
          </>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
            Imported: {result.created} created, {result.updated} updated.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="app-button-secondary" onClick={onClose}>{result ? "Close" : "Cancel"}</button>
          {preview && (
            <button className="app-button-primary" disabled={busy || !preview.canImport} onClick={commit}>
              {busy ? <Spinner size="xs" /> : null} Import {preview.totalRows} contact{preview.totalRows === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
