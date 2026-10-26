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
import { buildAutoColumns } from "../lib/auto-columns";

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
  piecesPerUnit?: number;
  productId?: string;
  remainingKg?: number | null;
  onHold?: boolean;
  analysisState?: string;
};

type SoyaOptions = {
  productionSites: Option[];
  warehouses: Option[];
  products: Option[];
  intakes: Option[];
  batches: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const SOYA_BAG_KG = 50;
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
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/soya-processing/delivery-analysis">Delivery analysis</Link>
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

// Soya products are classified by name/SKU rather than fixed seed SKUs (the
// live catalog uses its own codes, e.g. "Local Soya" for the cake). The API
// already limits options.products to soya products; here: beans = "bean",
// oil = "oil" (not a raw feed-ingredient oil), cake = every other soya product.
type SoyaKind = "BEANS" | "OIL" | "CAKE";
const SOYA_SEED_SKU: Record<SoyaKind, string> = { BEANS: "SOYA-BEANS-RAW", OIL: "SOYA-OIL", CAKE: "SOYA-CAKE" };

function soyaKind(product: Option): SoyaKind | null {
  const text = `${product.name ?? ""} ${product.sku ?? ""}`;
  if (!/soy/i.test(text)) return null;
  if (/bean/i.test(text)) return "BEANS";
  if (/oil/i.test(text)) return /raw/i.test(text) ? null : "OIL";
  return "CAKE";
}

// "Hipro Soya" is a PURCHASED soya meal. Our own processing never produces it,
// but the cake picker used to pre-select the first soya product alphabetically
// (Hipro), so a form left unchanged posted local cake as Hipro (2026-10-19:
// 51,700 kg across 8 batches). Hipro is now excluded from the cake choices and
// "Local Soya" is first, so it is the default.
const isHipro = (product: Option) => /hi-?pro/i.test(`${product.name ?? ""} ${product.sku ?? ""}`);
const isLocalSoya = (product: Option) => /local/i.test(`${product.name ?? ""}`);

function soyaProducts(options: SoyaOptions, kind: SoyaKind) {
  return options.products
    .filter((product) => soyaKind(product) === kind)
    .filter((product) => kind !== "CAKE" || !isHipro(product))
    .sort((a, b) =>
      Number(b.sku === SOYA_SEED_SKU[kind]) - Number(a.sku === SOYA_SEED_SKU[kind]) ||
      (kind === "CAKE" ? Number(isLocalSoya(b)) - Number(isLocalSoya(a)) : 0)
    );
}

export function SoyaIntakesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useSoyaOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/soya-processing/intakes")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/soya-processing/intakes"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ productionSiteId: "", warehouseId: "", productId: "", receiptNumber: "", supplierName: "", quantity: "", unit: "KG" as "KG" | "BAGS", unitCost: "", moisture: "", receivedAt: today() });
  const beanProducts = soyaProducts(options, "BEANS");
  const selectedBeanProduct = beanProducts.find((p) => p.id === (form.productId || beanProducts[0]?.id));
  // Product.piecesPerUnit doubles as a generic bulk-unit conversion factor
  // (30 pieces/crate for eggs, kg/bag here) — set on the product in Settings
  // → Catalog. The column defaults to 1, which for beans would silently
  // record a bag as 1 kg — so anything ≤ 1 falls back to the standard 50 kg
  // soya bean bag.
  const configuredKgPerBag = Number(selectedBeanProduct?.piecesPerUnit) || 0;
  const kgPerBag = configuredKgPerBag > 1 ? configuredKgPerBag : SOYA_BAG_KG;
  const quantityNum = Number(form.quantity) || 0;
  const quantityKg = form.unit === "BAGS" ? quantityNum * kgPerBag : quantityNum;
  const unitCostPerKg = form.unit === "BAGS" ? (Number(form.unitCost) || 0) / kgPerBag : (Number(form.unitCost) || 0);
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ receiptNumber: "", supplierName: "", receivedAt: "", notes: "" });
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
      await apiFetch("/soya-processing/intakes", { method: "POST", body: JSON.stringify({ productionSiteId: form.productionSiteId || options.productionSites[0]?.id, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || beanProducts[0]?.id, receiptNumber: form.receiptNumber, supplierName: form.supplierName, quantityKg, unitCost: unitCostPerKg, moistureReadings: form.moisture.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0), receivedAt: form.receivedAt }) });
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
      await apiFetch(`/soya-processing/intakes/${editRow.id}`, { method: "PATCH", body: JSON.stringify({ receiptNumber: editForm.receiptNumber, supplierName: editForm.supplierName, receivedAt: editForm.receivedAt || undefined, notes: editForm.notes || undefined }) });
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
      <PageHeader title={create ? "Create Soya Bean Intake" : "Soya Bean Intakes"} subtitle="Record supplier, received quantity, cost and moisture readings for each bean delivery." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Bean product" value={form.productId || beanProducts[0]?.id || ""} options={beanProducts} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Receipt number"><input className={inputClass} value={form.receiptNumber} onChange={(event) => setForm({ ...form, receiptNumber: event.target.value })} required /></FormField>
          <FormField label="Supplier"><input className={inputClass} value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} required /></FormField>
          <FormField label="Quantity">
            <div className="flex gap-2">
              <input className={inputClass + " flex-1"} type="number" min={0} step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
              <select className={inputClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value as "KG" | "BAGS" })}>
                <option value="KG">kg</option>
                <option value="BAGS">bags</option>
              </select>
            </div>
            {form.unit === "BAGS" && quantityNum > 0 && (
              <span className="text-[11px] text-ink/45">= {number(quantityKg)} kg (at {kgPerBag} kg/bag)</span>
            )}
          </FormField>
          <FormField label={form.unit === "BAGS" ? "Unit cost (per bag)" : "Unit cost (per kg)"}>
            <input className={inputClass} type="number" min={0} step="any" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required />
            {form.unit === "BAGS" && Number(form.unitCost) > 0 && (
              <span className="text-[11px] text-ink/45">= {money(unitCostPerKg)}/kg</span>
            )}
          </FormField>
          <FormField label="Moisture readings %">
            <input className={inputClass} value={form.moisture} onChange={(event) => setForm({ ...form, moisture: event.target.value })} placeholder="e.g. 12.4, 12.8, 13.1" inputMode="decimal" />
            <span className="text-[11px] text-ink/45">One reading per sample from the truck, separated by commas. Leave blank if not tested yet; you can add readings later under Delivery analysis. Above the moisture limit the delivery is held until a manager accepts it.</span>
          </FormField>
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
          <p className="text-xs text-ink/55">Moisture readings and the accept / reject decision are managed under <Link className="font-semibold text-brand" href="/soya-processing/delivery-analysis">Delivery analysis</Link>, so the history is kept.</p>
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
  const [form, setForm] = useState({ productionSiteId: "", rawWarehouseId: "", oilWarehouseId: "", cakeWarehouseId: "", intakeId: "", oilProductId: "", cakeProductId: "", beansUsedKg: "", oilProducedLitres: "", cakeProducedKg: "", wasteKg: "", processingDate: today() });
  // Default each warehouse picker to the matching store by name instead of
  // the alphabetically-first warehouse — the old default silently posted
  // cake into whatever warehouse sorted first, so it never showed in the
  // Cake Store. Prefers stores at the chosen production site.
  const siteId = form.productionSiteId || options.productionSites[0]?.id || "";
  const defaultWarehouse = (pattern: RegExp) => {
    const named = options.warehouses.filter((w) => pattern.test(`${w.name ?? ""} ${w.code ?? ""}`));
    return (named.find((w) => w.productionSiteId === siteId) ?? named[0] ?? options.warehouses[0])?.id ?? "";
  };
  const rawWarehouseId = form.rawWarehouseId || defaultWarehouse(/bean|raw|soya store/i);
  const oilWarehouseId = form.oilWarehouseId || defaultWarehouse(/oil/i);
  const cakeWarehouseId = form.cakeWarehouseId || defaultWarehouse(/cake|local soya/i);
  const oilCandidates = useMemo(() => soyaProducts(options, "OIL"), [options]);
  const cakeCandidates = useMemo(() => soyaProducts(options, "CAKE"), [options]);
  // Deliveries a run can use: still has beans, not on hold, not rejected. Oldest first, because
  // that is the one to process next. A run uses ONE delivery so its oil and cake can be measured.
  const deliveryChoices = useMemo(
    () => options.intakes
      .filter((i) => !i.onHold && i.analysisState !== "REJECTED" && (i.remainingKg == null || Number(i.remainingKg) > 0))
      .slice()
      .sort((a, b) => String((a as { receivedAt?: string }).receivedAt ?? "").localeCompare(String((b as { receivedAt?: string }).receivedAt ?? ""))),
    [options]
  );
  const defaultIntake = deliveryChoices[0];
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
    // Beans come from the chosen intake's own product when there is one;
    // oil/cake are picked on the form (pre-filled with the best catalog match).
    const chosenIntakeId = form.intakeId || defaultIntake?.id || "";
    const chosen = options.intakes.find((item) => item.id === chosenIntakeId);
    if (chosen && chosen.remainingKg != null && Number(form.beansUsedKg) > Number(chosen.remainingKg) + 0.0001) {
      setSubmitError(`Delivery ${chosen.receiptNumber} has only ${number(chosen.remainingKg)} kg left. Record ${number(chosen.remainingKg)} kg as this run, and the rest as a separate run from the next delivery, so each delivery's oil and cake stay separate.`);
      return;
    }
    const intakeProductId = chosen?.productId;
    const beanProductId = intakeProductId || soyaProducts(options, "BEANS")[0]?.id || "";
    const oilProductId = form.oilProductId || oilCandidates[0]?.id || "";
    const cakeProductId = form.cakeProductId || cakeCandidates[0]?.id || "";
    const missing = [!beanProductId && "soya beans", !oilProductId && "soya oil", !cakeProductId && "soya cake"].filter(Boolean);
    if (missing.length) {
      setSubmitError(`No ${missing.join(", ")} product found — pick it above, or add it in Settings → Catalog first.`);
      return;
    }
    try {
      await apiFetch("/soya-processing/batches", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          productionSiteId: form.productionSiteId || options.productionSites[0]?.id,
          rawWarehouseId,
          oilWarehouseId,
          cakeWarehouseId,
          intakeId: chosenIntakeId || undefined,
          beanProductId,
          oilProductId,
          cakeProductId,
          beansUsedKg: Number(form.beansUsedKg),
          oilProducedLitres: Number(form.oilProducedLitres),
          cakeProducedKg: Number(form.cakeProducedKg),
          wasteKg: Number(form.wasteKg || 0)
        })
      });
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to save batch.");
    }
  }

  return (
    <>
      <PageHeader title={create ? "Create Processing Batch" : "Soya Processing Batches"} subtitle="Post soya processing batches — beans used, oil and cake produced, and waste." />
      {optionsError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{optionsError}</p>}
      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Raw warehouse" value={rawWarehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, rawWarehouseId: value })} />
          <SelectField label="Oil warehouse" value={oilWarehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, oilWarehouseId: value })} />
          <SelectField label="Cake warehouse" value={cakeWarehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, cakeWarehouseId: value })} />
          <SelectField label="Bean delivery (this run uses only this delivery)" value={form.intakeId || defaultIntake?.id || ""} options={deliveryChoices.map((item) => ({ ...item, name: `${item.receiptNumber} · ${item.supplierName}${item.remainingKg !== null && item.remainingKg !== undefined ? ` · ${number(item.remainingKg)} kg left` : ""}` }))} onChange={(value) => setForm({ ...form, intakeId: value })} />
          <SelectField label="Oil product" value={form.oilProductId || oilCandidates[0]?.id || ""} options={oilCandidates} onChange={(value) => setForm({ ...form, oilProductId: value })} />
          <SelectField label="Cake product" value={form.cakeProductId || cakeCandidates[0]?.id || ""} options={cakeCandidates} onChange={(value) => setForm({ ...form, cakeProductId: value })} />
          {[
            ["beansUsedKg", "Beans used kg"],
            ["oilProducedLitres", "Oil produced L"],
            ["cakeProducedKg", "Cake produced kg"],
            ["wasteKg", "Waste kg"]
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
  oilOutputs: { id: string; quantityLitres: number | string; unitCost: number | string; warehouse?: { name: string } | null }[];
  cakeOutputs: { id: string; quantityKg: number | string; unitCost: number | string; warehouse?: { name: string } | null }[];
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
          ["Oil stored in", batch.oilOutputs.map((o) => o.warehouse?.name).filter(Boolean).join(", ") || "—"],
          ["Cake stored in", batch.cakeOutputs.map((o) => o.warehouse?.name).filter(Boolean).join(", ") || "—"],
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
  // Product list follows the output type, so CAKE never offers the oil product.
  const outputProducts = useMemo(() => soyaProducts(options, form.outputType === "OIL" ? "OIL" : "CAKE"), [options, form.outputType]);
  // Cake moves in 50 kg bags (or the product's own kg/bag if set in Catalog,
  // same rule as the intake form); oil is always litres. The API takes kg/L.
  const [quantityUnit, setQuantityUnit] = useState<"KG" | "BAGS">("KG");
  const selectedOutput = outputProducts.find((p) => p.id === (form.productId || outputProducts[0]?.id));
  const kgPerBag = Number(selectedOutput?.piecesPerUnit) > 1 ? Number(selectedOutput?.piecesPerUnit) : SOYA_BAG_KG;
  const inBags = form.outputType === "CAKE" && quantityUnit === "BAGS";
  const quantityBase = inBags ? (Number(form.quantity) || 0) * kgPerBag : Number(form.quantity) || 0;
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
      await apiFetch("/soya-processing/transfers", { method: "POST", body: JSON.stringify({ ...form, productionBatchId: form.productionBatchId || options.batches[0]?.id, fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id, toWarehouseId: form.toWarehouseId || options.warehouses[0]?.id, toProductionSiteId: form.toProductionSiteId || undefined, productId: form.productId || outputProducts[0]?.id, quantity: quantityBase }) });
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
        <FormField label="Output type"><select className={inputClass} value={form.outputType} onChange={(event) => setForm({ ...form, outputType: event.target.value, productId: "" })}><option>CAKE</option><option>OIL</option></select></FormField>
        <FormField label="Quantity">
          <div className="flex gap-2">
            <input className={inputClass + " min-w-0 flex-1"} type="number" min={0} step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
            {form.outputType === "CAKE" ? (
              <select className={inputClass} value={quantityUnit} onChange={(event) => setQuantityUnit(event.target.value as "KG" | "BAGS")}>
                <option value="KG">kg</option>
                <option value="BAGS">bags</option>
              </select>
            ) : <span className="inline-flex items-center text-sm text-ink/60">L</span>}
          </div>
          {inBags && Number(form.quantity) > 0 && <span className="text-[11px] text-ink/45">= {number(quantityBase)} kg (at {kgPerBag} kg/bag)</span>}
        </FormField>
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
  const outputProducts = useMemo(() => [...soyaProducts(options, "OIL"), ...soyaProducts(options, "CAKE")], [options]);
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
  const auto = useMemo(() => buildAutoColumns(rows), [rows]);
  const columns: { key: string; label: string; sortable?: boolean; render?: (row: Record<string, unknown>) => React.ReactNode }[] = [...auto.columns];
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
  return <DataTable rows={auto.rows} empty="No records found" loading={loading} columns={columns} />;
}

// ─── Bean delivery analysis (moisture per delivery, held / accepted, yield per delivery) ───

type DeliveryRow = {
  id: string; receiptNumber: string; supplierName: string; receivedAt: string; quantityKg: number; unitCost: number;
  moisturePercent: number | null; readings: number[]; qualityStatus: string; analysisState: string; decisionNote?: string | null;
  processedKg: number; remainingKg: number; oilLitres: number; cakeKg: number; oilPer100Kg: number | null; cakeYieldPercent: number | null;
};
type SupplierRow = { supplierName: string; deliveries: number; quantityKg: number; avgMoisturePercent: number | null; overLimitOrHeld: number; rejected: number; oilPer100Kg: number | null; cakeYieldPercent: number | null };

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  WITHIN_LIMIT: { label: "Within limit", cls: "bg-green-100 text-green-800" },
  HELD: { label: "On hold: too moist", cls: "bg-amber-100 text-amber-800" },
  APPROVED_OVER_LIMIT: { label: "Accepted over limit", cls: "bg-blue-100 text-blue-800" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-800" },
  NOT_TESTED: { label: "Not tested", cls: "bg-slate-100 text-slate-700" },
};

export function SoyaDeliveryAnalysisPage() {
  const [data, setData] = useState<{ maxMoisturePercent: number; deliveries: DeliveryRow[]; suppliers: SupplierRow[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [limitInput, setLimitInput] = useState("");
  const [readingFor, setReadingFor] = useState<DeliveryRow | null>(null);
  const [readingValue, setReadingValue] = useState("");
  const [decisionFor, setDecisionFor] = useState<{ row: DeliveryRow; decision: "APPROVE" | "REJECT" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await apiFetch<ApiEnvelope<{ maxMoisturePercent: number; deliveries: DeliveryRow[]; suppliers: SupplierRow[] }>>("/soya-processing/intake-analysis");
    setData(r.data);
    setLimitInput(String(r.data.maxMoisturePercent));
  }
  useEffect(() => { load().catch((e: any) => setError(e?.message ?? "Failed to load.")); }, []);
  useApiRecovery(!data, () => void load());

  async function saveLimit() {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/soya-processing/settings", { method: "PATCH", body: JSON.stringify({ maxMoisturePercent: Number(limitInput) }) });
      setNotice("Moisture limit saved. It applies to new readings; deliveries already decided keep their status.");
      await load();
    } catch (e: any) { setError(e?.message ?? "Could not save the limit."); } finally { setBusy(false); }
  }

  async function addReading(e: FormEvent) {
    e.preventDefault();
    if (!readingFor) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/soya-processing/intakes/${readingFor.id}/moisture`, { method: "POST", body: JSON.stringify({ moisturePercent: Number(readingValue) }) });
      setReadingFor(null); setReadingValue("");
      await load();
    } catch (err: any) { setError(err?.message ?? "Could not save the reading."); } finally { setBusy(false); }
  }

  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!decisionFor) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/soya-processing/intakes/${decisionFor.row.id}/decision`, { method: "POST", body: JSON.stringify({ decision: decisionFor.decision, note: decisionNote }) });
      setDecisionFor(null); setDecisionNote("");
      await load();
    } catch (err: any) { setError(err?.message ?? "Could not save the decision."); } finally { setBusy(false); }
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB");

  return (
    <>
      <PageHeader title="Bean Delivery Analysis" subtitle="Moisture for each bean delivery, which deliveries were processed, and what each one yielded." />
      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-4 shadow-panel">
        <FormField label="Hold deliveries with average moisture above (%)">
          <input className={inputClass} type="number" min={1} max={40} step="0.1" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
        </FormField>
        <button onClick={saveLimit} disabled={busy || !limitInput} className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">Save limit</button>
        <p className="max-w-md text-xs text-ink/55">A delivery above the limit is held: its beans can&apos;t be processed until a manager accepts it (for example after drying) or rejects it.</p>
      </div>

      <h3 className="mb-2 text-sm font-bold text-ink">Deliveries</h3>
      <div className="mb-8 overflow-x-auto rounded-md border border-line bg-white shadow-panel">
        <table className="w-full text-left text-sm">
          <thead className="bg-field text-xs uppercase text-ink/60">
            <tr><th className="px-3 py-2">Receipt</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Received</th><th className="px-3 py-2 text-right">Kg</th><th className="px-3 py-2">Moisture</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Processed kg</th><th className="px-3 py-2 text-right">Left kg</th><th className="px-3 py-2 text-right">Oil L / 100 kg</th><th className="px-3 py-2 text-right">Cake %</th><th className="px-3 py-2">Actions</th></tr>
          </thead>
          <tbody>
            {(data?.deliveries ?? []).map((d) => {
              const b = STATE_BADGE[d.analysisState] ?? STATE_BADGE.NOT_TESTED;
              return (
                <tr key={d.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-medium">{d.receiptNumber}</td>
                  <td className="px-3 py-2">{d.supplierName}</td>
                  <td className="px-3 py-2">{fmtDate(d.receivedAt)}</td>
                  <td className="px-3 py-2 text-right">{number(d.quantityKg)}</td>
                  <td className="px-3 py-2">{d.moisturePercent !== null ? <><b>{d.moisturePercent}%</b><span className="block text-[11px] text-ink/50">{d.readings.length} reading(s): {d.readings.join(", ")}</span></> : "-"}</td>
                  <td className="px-3 py-2"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>{d.decisionNote && <span className="block text-[11px] italic text-ink/55">&ldquo;{d.decisionNote}&rdquo;</span>}</td>
                  <td className="px-3 py-2 text-right">{number(d.processedKg)}</td>
                  <td className="px-3 py-2 text-right">{number(d.remainingKg)}</td>
                  <td className="px-3 py-2 text-right">{d.oilPer100Kg ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{d.cakeYieldPercent !== null ? `${d.cakeYieldPercent}%` : "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap space-x-1">
                    {d.analysisState !== "REJECTED" && <button onClick={() => { setReadingFor(d); setReadingValue(""); setError(""); }} className="rounded border border-line px-2 py-1 text-xs font-medium hover:bg-field">+ Reading</button>}
                    {(d.analysisState === "HELD" || d.analysisState === "REJECTED") && <button onClick={() => { setDecisionFor({ row: d, decision: "APPROVE" }); setDecisionNote(""); setError(""); }} className="rounded border border-green-300 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50">Accept</button>}
                    {d.analysisState === "HELD" && <button onClick={() => { setDecisionFor({ row: d, decision: "REJECT" }); setDecisionNote(""); setError(""); }} className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Reject</button>}
                  </td>
                </tr>
              );
            })}
            {data && data.deliveries.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-ink/50">No bean deliveries yet.</td></tr>}
            {!data && !error && <tr><td colSpan={11} className="px-3 py-6 text-center text-ink/50">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mb-8 text-xs text-ink/55">Each processing run uses one delivery, so the oil and cake shown for a delivery are exactly what that delivery produced. Runs posted before this feature don&apos;t record which delivery they used, so older deliveries show no processing here.</p>

      <h3 className="mb-2 text-sm font-bold text-ink">By supplier</h3>
      <div className="overflow-x-auto rounded-md border border-line bg-white shadow-panel">
        <table className="w-full text-left text-sm">
          <thead className="bg-field text-xs uppercase text-ink/60">
            <tr><th className="px-3 py-2">Supplier</th><th className="px-3 py-2 text-right">Deliveries</th><th className="px-3 py-2 text-right">Kg</th><th className="px-3 py-2 text-right">Avg moisture</th><th className="px-3 py-2 text-right">Too moist</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2 text-right">Oil L / 100 kg</th><th className="px-3 py-2 text-right">Cake %</th></tr>
          </thead>
          <tbody>
            {(data?.suppliers ?? []).map((sp) => (
              <tr key={sp.supplierName} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{sp.supplierName}</td>
                <td className="px-3 py-2 text-right">{sp.deliveries}</td>
                <td className="px-3 py-2 text-right">{number(sp.quantityKg)}</td>
                <td className="px-3 py-2 text-right">{sp.avgMoisturePercent !== null ? `${sp.avgMoisturePercent}%` : "-"}</td>
                <td className="px-3 py-2 text-right">{sp.overLimitOrHeld}</td>
                <td className="px-3 py-2 text-right">{sp.rejected}</td>
                <td className="px-3 py-2 text-right">{sp.oilPer100Kg ?? "-"}</td>
                <td className="px-3 py-2 text-right">{sp.cakeYieldPercent !== null ? `${sp.cakeYieldPercent}%` : "-"}</td>
              </tr>
            ))}
            {data && data.suppliers.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-ink/50">No suppliers yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!readingFor} onClose={() => setReadingFor(null)} title={`Add moisture reading: ${readingFor?.receiptNumber ?? ""}`}>
        <form onSubmit={addReading} className="grid gap-4">
          <FormField label="Moisture %"><input className={inputClass} type="number" min={0.1} max={100} step="0.1" value={readingValue} onChange={(e) => setReadingValue(e.target.value)} required autoFocus /></FormField>
          <p className="text-xs text-ink/55">Each reading is kept. The delivery&apos;s moisture is the average of all its readings.</p>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Saving…" : "Save reading"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setReadingFor(null)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!decisionFor} onClose={() => setDecisionFor(null)} title={`${decisionFor?.decision === "APPROVE" ? "Accept" : "Reject"} delivery ${decisionFor?.row.receiptNumber ?? ""}`}>
        <form onSubmit={decide} className="grid gap-4">
          <p className="text-sm text-ink/70">{decisionFor?.decision === "APPROVE" ? "The beans become available for processing." : "The beans stay blocked and can't be processed."} Average moisture: <b>{decisionFor?.row.moisturePercent ?? "-"}%</b>.</p>
          <FormField label="Reason *"><input className={inputClass} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} minLength={3} maxLength={300} required placeholder={decisionFor?.decision === "APPROVE" ? "e.g. Dried again, re-tested at 12.5%" : "e.g. Mouldy, returned to supplier"} /></FormField>
          <div className="flex gap-3">
            <button className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>{busy ? "Saving…" : decisionFor?.decision === "APPROVE" ? "Accept delivery" : "Reject delivery"}</button>
            <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" onClick={() => setDecisionFor(null)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
