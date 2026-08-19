"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ConfirmModal, Modal } from "./ui";
import { ApiEnvelope, apiFetch, downloadReport, getCached, getCachedFirst, hasCached, invalidateCache } from "../lib/api";
import { useApiRecovery } from "../lib/use-api-recovery";

type Option = {
  id: string;
  branchId?: string;
  productionSiteId?: string;
  code?: string;
  sku?: string;
  name?: string;
  type?: string;
  receiptNumber?: string;
  batchNumber?: string;
  supplierName?: string;
};

type SoyaOptions = {
  productionSites: Option[];
  warehouses: Option[];
  products: Option[];
  intakes: Option[];
  batches: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const today = () => new Date().toISOString().slice(0, 10);

function useSoyaOptions() {
  const [options, setOptions] = useState<SoyaOptions>(() => getCached<ApiEnvelope<SoyaOptions>>("/soya-processing/options")?.data ?? { productionSites: [], warehouses: [], products: [], intakes: [], batches: [] });
  const [optionsError, setOptionsError] = useState("");
  const [_soyaOptKey, _setSoyaOptKey] = useState(0);
  const forceAccept = useRef(false);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<SoyaOptions>>("/soya-processing/options")
      .then((response) => {
        const fresh = response.data ?? { productionSites: [], warehouses: [], products: [], intakes: [], batches: [] };
        setOptions((prev) => !force && fresh.batches.length === 0 && prev.batches.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load options."));
  }, [_soyaOptKey]);
  useEffect(() => {
    function onRecovered() { _setSoyaOptKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);
  return { options, optionsError };
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-ink/65">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/intakes">Intakes</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/batches">Batches</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/quality-control">QC</Link>
      </div>
    </div>
  );
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `GHS ${number(value)}`;
}

function products(options: SoyaOptions, matcher: (option: Option) => boolean) {
  return options.products.filter(matcher);
}

function productBySku(options: SoyaOptions, sku: string) {
  return options.products.find((product) => product.sku === sku)?.id ?? "";
}

export function SoyaIntakesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/intakes")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/intakes"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionSiteId: "", warehouseId: "", productId: "", receiptNumber: "", supplierName: "", quantityKg: "", unitCost: "", moisturePercent: "", qualityStatus: "APPROVED", receivedAt: today() });
  const beanProducts = products(options, (product) => product.sku?.includes("SOYA-BEANS") ?? false);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ receiptNumber: "", supplierName: "", moisturePercent: "", qualityStatus: "APPROVED", receivedAt: "", notes: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/intakes");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, () => void load());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/soya-processing/intakes", { method: "POST", body: JSON.stringify({ ...form, productionSiteId: form.productionSiteId || options.productionSites[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || beanProducts[0]?.id, quantityKg: Number(form.quantityKg), unitCost: Number(form.unitCost), moisturePercent: Number(form.moisturePercent || 0), receivedAt: form.receivedAt }) });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save intake.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(row: Record<string, unknown>) {
    setEditError("");
    setEditForm({
      receiptNumber: String(row.receiptNumber ?? ""),
      supplierName: String(row.supplierName ?? ""),
      moisturePercent: String(row.moisturePercent ?? ""),
      qualityStatus: String(row.qualityStatus ?? "APPROVED"),
      receivedAt: String(row.receivedAt ?? "").slice(0, 10),
      notes: String(row.notes ?? "")
    });
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/soya-processing/intakes/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ receiptNumber: editForm.receiptNumber, supplierName: editForm.supplierName, moisturePercent: Number(editForm.moisturePercent || 0), qualityStatus: editForm.qualityStatus, receivedAt: editForm.receivedAt || undefined, notes: editForm.notes || undefined }) });
      invalidateCache("/soya-processing/intakes", true);
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/soya-processing/intakes/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/soya-processing/intakes", true);
      setDeleteRow(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete intake.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title={create ? "Create Soya Bean Intake" : "Soya Bean Intakes"} subtitle="Record supplier, received quantity, cost, moisture, and intake quality status." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Bean product" value={form.productId || beanProducts[0]?.id || ""} options={beanProducts} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Receipt number"><input className={inputClass} value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} required /></FormField>
          <FormField label="Supplier"><input className={inputClass} value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} required /></FormField>
          <FormField label="Quantity kg"><input className={inputClass} type="number" value={form.quantityKg} onChange={(event) => setForm({ ...form, quantityKg: event.target.value })} required /></FormField>
          <FormField label="Unit cost"><input className={inputClass} type="number" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></FormField>
          <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save intake"}</button>
          {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-4">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/intakes/create"><Plus aria-hidden className="h-4 w-4" /> Create intake</Link>}
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} />
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit intake">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Receipt number"><input className={inputClass} value={editForm.receiptNumber} onChange={(event) => setEditForm({ ...editForm, receiptNumber: event.target.value })} required /></FormField>
          <FormField label="Supplier"><input className={inputClass} value={editForm.supplierName} onChange={(event) => setEditForm({ ...editForm, supplierName: event.target.value })} required /></FormField>
          <FormField label="Moisture %"><input className={inputClass} type="number" value={editForm.moisturePercent} onChange={(event) => setEditForm({ ...editForm, moisturePercent: event.target.value })} /></FormField>
          <FormField label="Quality status"><select className={inputClass} value={editForm.qualityStatus} onChange={(event) => setEditForm({ ...editForm, qualityStatus: event.target.value })}><option>PENDING</option><option>ACCEPTED</option><option>REJECTED</option><option>APPROVED</option></select></FormField>
          <FormField label="Received date"><input className={inputClass} type="date" value={editForm.receivedAt} onChange={(event) => setEditForm({ ...editForm, receivedAt: event.target.value })} /></FormField>
          <FormField label="Notes"><input className={inputClass} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete intake?"
        message={`This will permanently remove receipt "${deleteRow?.receiptNumber}" and reverse its inventory effect. This can't be undone.`}
        confirmLabel="Delete intake"
      />
    </>
  );
}

export function SoyaBatchesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/batches")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/batches"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionSiteId: "", rawWarehouseId: "", oilWarehouseId: "", cakeWarehouseId: "", intakeId: "", beansUsedKg: "", oilProducedLitres: "", cakeProducedKg: "", wasteKg: "", laborCost: "", packagingCost: "", overheadCost: "", expectedOilSalesValue: "", expectedCakeSalesValue: "", processingDate: today() });
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ batchNumber: "", processingDate: "", notes: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [submitError, setSubmitError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/batches");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, () => void load());

  function openEdit(row: Record<string, unknown>) {
    setEditError("");
    setEditForm({
      batchNumber: String(row.batchNumber ?? ""),
      processingDate: String(row.processingDate ?? "").slice(0, 10),
      notes: String(row.notes ?? "")
    });
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/soya-processing/batches/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ batchNumber: editForm.batchNumber || undefined, processingDate: editForm.processingDate || undefined, notes: editForm.notes || undefined }) });
      invalidateCache("/soya-processing/batches", true);
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/soya-processing/batches/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/soya-processing/batches", true);
      setDeleteRow(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete batch.");
    } finally {
      setDeleting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    // L-BACK: these three products are resolved by a fixed SKU rather than
    // picked from a dropdown — if a seed product is ever renamed or
    // re-SKU'd, productBySku silently returns "" and the create would
    // otherwise fail with a generic backend "must be a UUID" error instead
    // of naming which product is missing.
    const beanProductId = productBySku(options, "SOYA-BEANS-RAW");
    const oilProductId = productBySku(options, "SOYA-OIL");
    const cakeProductId = productBySku(options, "SOYA-CAKE");
    const missing = [!beanProductId && "SOYA-BEANS-RAW", !oilProductId && "SOYA-OIL", !cakeProductId && "SOYA-CAKE"].filter(Boolean);
    if (missing.length) {
      setSubmitError(`Product(s) with SKU ${missing.join(", ")} not found — check the product catalog for renamed or missing SKUs.`);
      return;
    }
    try {
      await apiFetch("/soya-processing/batches", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          productionSiteId: form.productionSiteId || options.productionSites[0]?.id,
          rawWarehouseId: form.rawWarehouseId || options.warehouses[0]?.id,
          oilWarehouseId: form.oilWarehouseId || options.warehouses[0]?.id,
          cakeWarehouseId: form.cakeWarehouseId || options.warehouses[0]?.id,
          intakeId: form.intakeId || undefined,
          beanProductId,
          oilProductId,
          cakeProductId,
          beansUsedKg: Number(form.beansUsedKg),
          oilProducedLitres: Number(form.oilProducedLitres),
          cakeProducedKg: Number(form.cakeProducedKg),
          wasteKg: Number(form.wasteKg || 0),
          laborCost: Number(form.laborCost || 0),
          packagingCost: Number(form.packagingCost || 0),
          overheadCost: Number(form.overheadCost || 0),
          expectedOilSalesValue: Number(form.expectedOilSalesValue || 0),
          expectedCakeSalesValue: Number(form.expectedCakeSalesValue || 0)
        })
      });
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to save batch.");
    }
  }

  return (
    <>
      <PageHeader title={create ? "Create Processing Batch" : "Soya Processing Batches"} subtitle="Post soya processing batches and calculate oil yield, cake yield, loss, costs, and profitability." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Raw warehouse" value={form.rawWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, rawWarehouseId: value })} />
          <SelectField label="Oil warehouse" value={form.oilWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, oilWarehouseId: value })} />
          <SelectField label="Cake warehouse" value={form.cakeWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, cakeWarehouseId: value })} />
          <SelectField label="Intake" value={form.intakeId || ""} options={options.intakes.map((item) => ({ ...item, name: item.receiptNumber }))} onChange={(value) => setForm({ ...form, intakeId: value })} />
          {[
            ["beansUsedKg", "Beans used kg"],
            ["oilProducedLitres", "Oil produced L"],
            ["cakeProducedKg", "Cake produced kg"],
            ["wasteKg", "Waste kg"],
            ["laborCost", "Labor cost"],
            ["packagingCost", "Packaging cost"],
            ["overheadCost", "Overhead cost"],
            ["expectedOilSalesValue", "Oil sales value"],
            ["expectedCakeSalesValue", "Cake sales value"]
          ].map(([key, label]) => <FormField key={key} label={label}><input className={inputClass} type="number" value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></FormField>)}
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save batch</button>
          {submitError && <p className="col-span-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/batches/create"><Plus aria-hidden className="h-4 w-4" /> Create batch</Link>}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} />
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit batch">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Batch number"><input className={inputClass} value={editForm.batchNumber} onChange={(event) => setEditForm({ ...editForm, batchNumber: event.target.value })} /></FormField>
          <FormField label="Processing date"><input className={inputClass} type="date" value={editForm.processingDate} onChange={(event) => setEditForm({ ...editForm, processingDate: event.target.value })} /></FormField>
          <FormField label="Notes"><input className={inputClass} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete batch?"
        message={`This will permanently remove batch "${deleteRow?.batchNumber}" and reverse its inventory effect. This can't be undone.`}
        confirmLabel="Delete batch"
      />
    </>
  );
}

type BatchDetail = {
  id: string;
  batchNumber: string;
  status: string;
  processingDate: string;
  beansUsedKg: number | string;
  notes?: string | null;
  productionSite?: { name: string; code: string };
  intake?: { receiptNumber: string; supplierName: string } | null;
  oilOutputs: { id: string; quantityLitres: number | string; unitCost: number | string }[];
  cakeOutputs: { id: string; quantityKg: number | string; unitCost: number | string }[];
  wasteRecords: { id: string; quantityKg: number | string; reason?: string | null }[];
  qualityChecks: { id: string; status: string; moisturePercent?: number | string | null; oilPurityPercent?: number | string | null; cakeProteinPercent?: number | string | null; checkedAt: string; notes?: string | null }[];
  costs: { id: string; rawBeanCost: number | string; laborCost: number | string; packagingCost: number | string; overheadCost: number | string; expectedOilSalesValue: number | string; expectedCakeSalesValue: number | string }[];
  metrics: {
    oilProducedLitres: number;
    cakeProducedKg: number;
    wasteKg: number;
    oilYieldPercent: number;
    cakeYieldPercent: number;
    productionLossPercent: number;
    costPerLitreOil: number;
    costPerKgCake: number;
    profitMargin: number;
  };
};

const batchStatusColor: Record<string, string> = {
  PLANNED: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function SoyaBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(() => getCachedFirst<ApiEnvelope<BatchDetail>>(`/soya-processing/batches/${params.id}`)?.data ?? null);
  const [loading, setLoading] = useState(!hasCached(`/soya-processing/batches/${params.id}`));
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<BatchDetail>>(`/soya-processing/batches/${params.id}`);
      setBatch(response.data);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load batch.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [params.id]);
  useApiRecovery(!batch, () => void load());

  if (loading && !batch) {
    return <p className="p-6 text-sm text-ink/55">Loading batch…</p>;
  }
  if (loadError && !batch) {
    return <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>;
  }
  if (!batch) {
    return <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Batch not found.</p>;
  }

  const cost = batch.costs[0];
  const totalCost = cost ? Number(cost.rawBeanCost) + Number(cost.laborCost) + Number(cost.packagingCost) + Number(cost.overheadCost) : 0;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">{batch.batchNumber}</h2>
            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${batchStatusColor[batch.status] ?? "bg-slate-100 text-slate-700"}`}>{batch.status}</span>
          </div>
          <p className="mt-1 text-sm text-ink/65">
            {batch.productionSite?.name ?? "—"} · Processed {new Date(batch.processingDate).toLocaleDateString()}
            {batch.intake && ` · Intake ${batch.intake.receiptNumber} (${batch.intake.supplierName})`}
          </p>
        </div>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/batches">← Back to batches</Link>
      </div>

      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Beans used (kg)", number(batch.beansUsedKg)],
          ["Oil produced (L)", number(batch.metrics.oilProducedLitres)],
          ["Cake produced (kg)", number(batch.metrics.cakeProducedKg)],
          ["Waste (kg)", number(batch.metrics.wasteKg)],
          ["Oil yield", `${batch.metrics.oilYieldPercent}%`],
          ["Cake yield", `${batch.metrics.cakeYieldPercent}%`],
          ["Production loss", `${batch.metrics.productionLossPercent}%`],
          ["Profit margin", `${batch.metrics.profitMargin}%`],
        ].map(([label, value]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-xs text-ink/50">{label}</p>
            <strong className="mt-1.5 block text-xl font-bold text-ink">{value}</strong>
          </article>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-4 text-sm font-bold text-ink">Costing</h3>
          {cost ? (
            <dl className="space-y-2.5 text-sm">
              {([
                ["Raw bean cost", money(cost.rawBeanCost)],
                ["Labor cost", money(cost.laborCost)],
                ["Packaging cost", money(cost.packagingCost)],
                ["Overhead cost", money(cost.overheadCost)],
                ["Total cost", money(totalCost)],
                ["Cost per litre oil", money(batch.metrics.costPerLitreOil)],
                ["Cost per kg cake", money(batch.metrics.costPerKgCake)],
                ["Expected oil sales", money(cost.expectedOilSalesValue)],
                ["Expected cake sales", money(cost.expectedCakeSalesValue)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0 last:pb-0">
                  <dt className="text-ink/55">{k}</dt>
                  <dd className="font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="text-sm text-ink/45">No costing recorded for this batch.</p>}
        </div>

        <div className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-4 text-sm font-bold text-ink">Quality Checks</h3>
          {batch.qualityChecks.length === 0 ? (
            <p className="text-sm text-ink/45">No quality checks recorded for this batch.</p>
          ) : (
            <div className="space-y-3">
              {batch.qualityChecks.map((qc) => (
                <div key={qc.id} className="rounded-md border border-line/70 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${qc.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : qc.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{qc.status}</span>
                    <span className="text-xs text-ink/45">{new Date(qc.checkedAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-xs text-ink/60">
                    Moisture {qc.moisturePercent != null ? `${qc.moisturePercent}%` : "—"} · Oil purity {qc.oilPurityPercent != null ? `${qc.oilPurityPercent}%` : "—"} · Cake protein {qc.cakeProteinPercent != null ? `${qc.cakeProteinPercent}%` : "—"}
                  </p>
                  {qc.notes && <p className="mt-1 text-xs text-ink/45">{qc.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {batch.wasteRecords.length > 0 && (
        <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-4 text-sm font-bold text-ink">Waste Records</h3>
          <div className="space-y-2 text-sm">
            {batch.wasteRecords.map((w) => (
              <div key={w.id} className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0 last:pb-0">
                <span className="text-ink/60">{w.reason ?? "No reason given"}</span>
                <span className="font-medium text-ink">{number(w.quantityKg)} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {batch.notes && (
        <div className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-2 text-sm font-bold text-ink">Notes</h3>
          <p className="text-sm text-ink/65">{batch.notes}</p>
        </div>
      )}
    </>
  );
}

export function SoyaQualityPage() {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/quality-checks")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/quality-checks"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionBatchId: "", moisturePercent: "", oilPurityPercent: "", cakeProteinPercent: "", status: "APPROVED", notes: "" });
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ moisturePercent: "", oilPurityPercent: "", cakeProteinPercent: "", notes: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/quality-checks");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, () => void load());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/soya-processing/quality-checks", { method: "POST", body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, moisturePercent: Number(form.moisturePercent || 0), oilPurityPercent: Number(form.oilPurityPercent || 0), cakeProteinPercent: Number(form.cakeProteinPercent || 0), status: form.status, notes: form.notes }) });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save quality check.");
    } finally {
      setSubmitting(false);
    }
  }
  function openEdit(row: Record<string, unknown>) {
    setEditError("");
    setEditForm({
      moisturePercent: String(row.moisturePercent ?? ""),
      oilPurityPercent: String(row.oilPurityPercent ?? ""),
      cakeProteinPercent: String(row.cakeProteinPercent ?? ""),
      notes: String(row.notes ?? "")
    });
    setEditRow(row);
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/soya-processing/quality-checks/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ moisturePercent: Number(editForm.moisturePercent || 0), oilPurityPercent: Number(editForm.oilPurityPercent || 0), cakeProteinPercent: Number(editForm.cakeProteinPercent || 0), notes: editForm.notes || undefined }) });
      invalidateCache("/soya-processing/quality-checks", true);
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }
  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/soya-processing/quality-checks/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/soya-processing/quality-checks", true);
      setDeleteRow(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete quality check.");
    } finally {
      setDeleting(false);
    }
  }
  const [approveError, setApproveError] = useState("");
  async function approveCheck(row: Record<string, unknown>, status: "APPROVED" | "REJECTED") {
    setApproveError("");
    try {
      await apiFetch(`/soya-processing/quality-checks/${row.id}/approve`, { method: "PATCH", body: JSON.stringify({ status }) });
      invalidateCache("/soya-processing/quality-checks", true);
      await load();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to update quality check status.");
    }
  }
  return (
    <>
      <PageHeader title="Soya Quality Control" subtitle="Approve soya oil purity, cake protein, moisture, and batch quality status." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
        <FormField label="Oil purity %"><input className={inputClass} type="number" value={form.oilPurityPercent} onChange={(event) => setForm({ ...form, oilPurityPercent: event.target.value })} /></FormField>
        <FormField label="Cake protein %"><input className={inputClass} type="number" value={form.cakeProteinPercent} onChange={(event) => setForm({ ...form, cakeProteinPercent: event.target.value })} /></FormField>
        <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>APPROVED</option><option>ACCEPTED</option><option>REJECTED</option><option>PENDING</option></select></FormField>
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-5"><ShieldCheck aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save quality check"}</button>
        {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-5">{submitError}</p>}
      </form>
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {approveError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{approveError}</p>}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} onApprove={approveCheck} />
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit quality check">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Moisture %"><input className={inputClass} type="number" value={editForm.moisturePercent} onChange={(event) => setEditForm({ ...editForm, moisturePercent: event.target.value })} /></FormField>
          <FormField label="Oil purity %"><input className={inputClass} type="number" value={editForm.oilPurityPercent} onChange={(event) => setEditForm({ ...editForm, oilPurityPercent: event.target.value })} /></FormField>
          <FormField label="Cake protein %"><input className={inputClass} type="number" value={editForm.cakeProteinPercent} onChange={(event) => setEditForm({ ...editForm, cakeProteinPercent: event.target.value })} /></FormField>
          <FormField label="Notes"><input className={inputClass} value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete quality check?"
        message="This will permanently remove this quality check. This can't be undone."
        confirmLabel="Delete quality check"
      />
    </>
  );
}

export function SoyaStockPage({ type }: { type: "oil" | "cake" }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>(`/soya-processing/${type}-stock`)?.data ?? []);
  const [loading, setLoading] = useState(!hasCached(`/soya-processing/${type}-stock`));
  const [loadError, setLoadError] = useState("");
  function load() {
    setLoading(true);
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/soya-processing/${type}-stock`)
      .then((response) => setRows(response.data ?? []))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [type]);
  useApiRecovery(rows.length === 0, load);
  return (
    <>
      <PageHeader title={type === "oil" ? "Soya Oil Stock" : "Soya Cake Stock"} subtitle="Production output stock by warehouse, batch, unit cost, and quantity." />
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90" href="/soya-processing/batches/create">
          <Plus aria-hidden className="h-4 w-4" /> Record new processing batch
        </Link>
        <p className="text-sm text-ink/55">
          {type === "oil" ? "Oil" : "Cake"} stock is added automatically when you post a soya processing batch.
        </p>
      </div>
      <SimpleRowsTable rows={rows} loading={loading} />
    </>
  );
}

export function SoyaTransferPage() {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/transfers")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/transfers"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionBatchId: "", fromWarehouseId: "", toWarehouseId: "", toProductionSiteId: "", outputType: "CAKE", productId: "", quantity: "", notes: "" });
  const outputProducts = useMemo(() => products(options, (product) => ["SOYA-OIL", "SOYA-CAKE"].includes(product.sku ?? "")), [options]);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/transfers");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, () => void load());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/soya-processing/transfers", { method: "POST", body: JSON.stringify({ ...form, productionBatchId: form.productionBatchId || options.batches[0]?.id, fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id, toWarehouseId: form.toWarehouseId || options.warehouses[0]?.id, toProductionSiteId: form.toProductionSiteId || undefined, productId: form.productId || outputProducts[0]?.id, quantity: Number(form.quantity) }) });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create transfer.");
    } finally {
      setSubmitting(false);
    }
  }
  function openEdit(row: Record<string, unknown>) {
    setEditError("");
    setEditNotes(String(row.notes ?? ""));
    setEditRow(row);
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/soya-processing/transfers/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ notes: editNotes || undefined }) });
      invalidateCache("/soya-processing/transfers", true);
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }
  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/soya-processing/transfers/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/soya-processing/transfers", true);
      setDeleteRow(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete transfer.");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <>
      <PageHeader title="Soya Internal Transfer" subtitle="Transfer soya cake to feed production inventory or move oil and cake between warehouses." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <SelectField label="From warehouse" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
        <SelectField label="To warehouse" value={form.toWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
        <SelectField label="To production site" value={form.toProductionSiteId} options={options.productionSites} onChange={(value) => setForm({ ...form, toProductionSiteId: value })} />
        <SelectField label="Product" value={form.productId || outputProducts[0]?.id || ""} options={outputProducts} onChange={(value) => setForm({ ...form, productId: value })} />
        <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value })}><option>CAKE</option><option>OIL</option></select></FormField>
        <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-5">{submitting ? "Creating…" : "Create transfer"}</button>
        {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-5">{submitError}</p>}
      </form>
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} />
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit transfer">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Notes"><input className={inputClass} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete transfer?"
        message="This will permanently remove this transfer and reverse its inventory effect. This can't be undone."
        confirmLabel="Delete transfer"
      />
    </>
  );
}

export function SoyaSalesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/sales")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/sales"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionBatchId: "", warehouseId: "", productId: "", outputType: "CAKE", customerName: "", quantity: "", unitPrice: "" });
  const outputProducts = useMemo(() => products(options, (product) => ["SOYA-OIL", "SOYA-CAKE"].includes(product.sku ?? "")), [options]);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ customerName: "", saleDate: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/sales");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, () => void load());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/soya-processing/sales", { method: "POST", body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || outputProducts[0]?.id, outputType: form.outputType, customerName: form.customerName, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }) });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record sale.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(row: Record<string, unknown>) {
    setEditError("");
    setEditForm({ customerName: String(row.customerName ?? ""), saleDate: String(row.saleDate ?? "").slice(0, 10) });
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/soya-processing/sales/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ customerName: editForm.customerName || undefined, saleDate: editForm.saleDate || undefined }) });
      invalidateCache("/soya-processing/sales", true);
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/soya-processing/sales/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/soya-processing/sales", true);
      setDeleteRow(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete sale.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title={create ? "Record Soya Sale" : "Soya Sales"} subtitle="Record external sales of soya oil and cake and dispatch them from warehouse stock." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Product" value={form.productId || outputProducts[0]?.id || ""} options={outputProducts} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value })}><option>CAKE</option><option>OIL</option></select></FormField>
          <FormField label="Customer"><input className={inputClass} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /></FormField>
          <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
          <FormField label="Unit price"><input className={inputClass} type="number" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} required /></FormField>
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save sale"}</button>
          {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-4">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/sales/create"><Plus aria-hidden className="h-4 w-4" /> Record sale</Link>}
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} />
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Edit sale">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Customer"><input className={inputClass} value={editForm.customerName} onChange={(event) => setEditForm({ ...editForm, customerName: event.target.value })} required /></FormField>
          <FormField label="Sale date"><input className={inputClass} type="date" value={editForm.saleDate} onChange={(event) => setEditForm({ ...editForm, saleDate: event.target.value })} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete sale?"
        message={`This will permanently remove the sale to "${deleteRow?.customerName}" and reverse its inventory effect. This can't be undone.`}
        confirmLabel="Delete sale"
      />
    </>
  );
}

export function SoyaReportsPage() {
  return (
    <>
      <PageHeader title="Soya Production Reports" subtitle="Export soya profitability, yield, loss, cost, quality, stock, transfer, and sales reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/soya-processing/reports/summary.csv", "soya-processing-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download soya profitability CSV
      </button>
    </>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? option.receiptNumber ?? option.batchNumber ?? ""} {option.name ?? option.supplierName ?? ""}</option>)}
      </select>
    </FormField>
  );
}

function SimpleRowsTable({ rows, loading, onEdit, onDelete, onApprove }: { rows: Record<string, unknown>[]; loading?: boolean; onEdit?: (row: Record<string, unknown>) => void; onDelete?: (row: Record<string, unknown>) => void; onApprove?: (row: Record<string, unknown>, status: "APPROVED" | "REJECTED") => void }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  const columns: { key: string; label: string; sortable?: boolean; render: (row: Record<string, unknown>) => React.ReactNode }[] = keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }));
  if (onEdit || onDelete || onApprove) {
    columns.push({
      key: "actions",
      label: "",
      sortable: false,
      render: (row: Record<string, unknown>) => (
        <div className="flex items-center gap-2">
          {onApprove && row.status === "PENDING" && (
            <>
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={(event) => { event.stopPropagation(); onApprove(row, "APPROVED"); }} title="Approve">
                <ShieldCheck className="h-3.5 w-3.5" /> Approve
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(event) => { event.stopPropagation(); onApprove(row, "REJECTED"); }} title="Reject">
                Reject
              </button>
            </>
          )}
          {onEdit && (
            <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10" onClick={(event) => { event.stopPropagation(); onEdit(row); }} title="Edit">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {onDelete && (
            <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(event) => { event.stopPropagation(); onDelete(row); }} title="Delete">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      )
    });
  }
  return <DataTable rows={rows} empty="No records found" loading={loading} columns={columns} />;
}

