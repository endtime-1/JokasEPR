"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ConfirmModal, Modal } from "./ui";
import { ApiEnvelope, apiFetch, downloadReport, getCached, getCachedFirst, hasCached, invalidateCache } from "../lib/api";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/intakes", { method: "POST", body: JSON.stringify({ ...form, productionSiteId: form.productionSiteId || options.productionSites[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || beanProducts[0]?.id, quantityKg: Number(form.quantityKg), unitCost: Number(form.unitCost), moisturePercent: Number(form.moisturePercent || 0), receivedAt: form.receivedAt }) });
    await load();
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
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save intake</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/intakes/create"><Plus aria-hidden className="h-4 w-4" /> Create intake</Link>}
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/quality-checks", { method: "POST", body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, moisturePercent: Number(form.moisturePercent || 0), oilPurityPercent: Number(form.oilPurityPercent || 0), cakeProteinPercent: Number(form.cakeProteinPercent || 0), status: form.status, notes: form.notes }) });
    await load();
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
  return (
    <>
      <PageHeader title="Soya Quality Control" subtitle="Approve soya oil purity, cake protein, moisture, and batch quality status." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
        <FormField label="Oil purity %"><input className={inputClass} type="number" value={form.oilPurityPercent} onChange={(event) => setForm({ ...form, oilPurityPercent: event.target.value })} /></FormField>
        <FormField label="Cake protein %"><input className={inputClass} type="number" value={form.cakeProteinPercent} onChange={(event) => setForm({ ...form, cakeProteinPercent: event.target.value })} /></FormField>
        <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>APPROVED</option><option>ACCEPTED</option><option>REJECTED</option><option>PENDING</option></select></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5"><ShieldCheck aria-hidden className="h-4 w-4" /> Save quality check</button>
      </form>
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <SimpleRowsTable rows={rows} loading={loading} onEdit={openEdit} onDelete={(row) => { setDeleteError(""); setDeleteRow(row); }} />
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
  useEffect(() => {
    setLoading(true);
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/soya-processing/${type}-stock`)
      .then((response) => setRows(response.data ?? []))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [type]);
  return (
    <>
      <PageHeader title={type === "oil" ? "Soya Oil Stock" : "Soya Cake Stock"} subtitle="Production output stock by warehouse, batch, unit cost, and quantity." />
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/transfers", { method: "POST", body: JSON.stringify({ ...form, productionBatchId: form.productionBatchId || options.batches[0]?.id, fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id, toWarehouseId: form.toWarehouseId || options.warehouses[0]?.id, toProductionSiteId: form.toProductionSiteId || undefined, productId: form.productId || outputProducts[0]?.id, quantity: Number(form.quantity) }) });
    await load();
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
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <SelectField label="From warehouse" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
        <SelectField label="To warehouse" value={form.toWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
        <SelectField label="Product" value={form.productId || outputProducts[0]?.id || ""} options={outputProducts} onChange={(value) => setForm({ ...form, productId: value })} />
        <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value })}><option>CAKE</option><option>OIL</option></select></FormField>
        <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5">Create transfer</button>
      </form>
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/soya-processing/sales", { method: "POST", body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || outputProducts[0]?.id, outputType: form.outputType, customerName: form.customerName, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice) }) });
    await load();
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
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Product" value={form.productId || outputProducts[0]?.id || ""} options={outputProducts} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value })}><option>CAKE</option><option>OIL</option></select></FormField>
          <FormField label="Customer"><input className={inputClass} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required /></FormField>
          <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
          <FormField label="Unit price"><input className={inputClass} type="number" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} required /></FormField>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save sale</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/soya-processing/sales/create"><Plus aria-hidden className="h-4 w-4" /> Record sale</Link>}
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

function SimpleRowsTable({ rows, loading, onEdit, onDelete }: { rows: Record<string, unknown>[]; loading?: boolean; onEdit?: (row: Record<string, unknown>) => void; onDelete?: (row: Record<string, unknown>) => void }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  const columns: { key: string; label: string; sortable?: boolean; render: (row: Record<string, unknown>) => React.ReactNode }[] = keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }));
  if (onEdit || onDelete) {
    columns.push({
      key: "actions",
      label: "",
      sortable: false,
      render: (row: Record<string, unknown>) => (
        <div className="flex items-center gap-2">
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

