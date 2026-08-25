"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { InventoryShell } from "./inventory-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ConfirmModal, Modal } from "./ui";
import { ApiEnvelope, apiFetch, downloadReport, hasCached, getCached, getCachedFirst, invalidateCache } from "../lib/api";
import { useApiRecovery } from "../lib/use-api-recovery";

type Option = {
  id: string;
  code?: string;
  sku?: string;
  name: string;
  product?: { sku: string; name: string };
  warehouse?: { code: string; name: string };
  piecesPerUnit?: number;
  uom?: { symbol?: string; name?: string };
};

type InventoryOptions = {
  warehouses: Option[];
  products: Option[];
  farms: Option[];
  productionSites: Option[];
  items: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";

const EMPTY_OPTIONS: InventoryOptions = { warehouses: [], products: [], farms: [], productionSites: [], items: [] };

function useInventoryOptions() {
  const [options, setOptions] = useState<InventoryOptions>(() => getCached<ApiEnvelope<InventoryOptions>>("/inventory/options")?.data ?? EMPTY_OPTIONS);
  const [optionsError, setOptionsError] = useState("");
  const [_invOptKey, _setInvOptKey] = useState(0);
  const forceAccept = useRef(false);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<InventoryOptions>>("/inventory/options")
      .then((response) => {
        const fresh = response.data ?? EMPTY_OPTIONS;
        setOptions((prev) => !force && fresh.products.length === 0 && prev.products.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load warehouse and product options."));
  }, [_invOptKey]);
  useEffect(() => {
    function onRecovered() { _setInvOptKey((k) => k + 1); }
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
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/inventory/items">Items</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/inventory/movements">Movements</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/inventory/valuation">Valuation</Link>
      </div>
    </div>
  );
}


function formatQtyWithBags(val: unknown): string {
  const qty = parseFloat(String(val ?? "0"));
  if (isNaN(qty) || qty <= 0) return String(val ?? "-");
  const bags = qty / 50;
  const bagsStr = Number.isInteger(bags) ? `${bags}` : bags.toFixed(2);
  return `${qty} kg (${bagsStr} bags)`;
}

export function InventoryItemsPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useInventoryOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/inventory/items")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/inventory/items"));
  const [form, setForm] = useState({ warehouseId: "", productId: "", reorderLevel: "", openingQuantity: "" });
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState({ reorderLevel: "", status: "ACTIVE" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/inventory/items");
    const fresh = response.data ?? [];
    setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false)); }, []);
  useApiRecovery(rows.length === 0, () => void load());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const warehouseId = form.warehouseId || options.warehouses[0]?.id;
    const productId = form.productId || options.products[0]?.id;
    if (!warehouseId || !productId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/inventory/items", { method: "POST", body: JSON.stringify({ warehouseId, productId, reorderLevel: Number(form.reorderLevel), openingQuantity: Number(form.openingQuantity || 0) }) });
      setForm({ ...form, reorderLevel: "", openingQuantity: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save item.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({ reorderLevel: String(row.reorderLevel ?? ""), status: String(row.status ?? "ACTIVE") });
    setEditError("");
    setEditItem(row);
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editItem) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/inventory/items/${editItem.id}`, { method: "PATCH", body: JSON.stringify({ reorderLevel: Number(editForm.reorderLevel), status: editForm.status }) });
      invalidateCache("/inventory/items", true);
      setEditItem(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeleteItem() {
    if (!deleteItem) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/inventory/items/${deleteItem.id}`, { method: "DELETE" });
      invalidateCache("/inventory/items", true);
      setDeleteItem(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete item.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <InventoryShell>
      <PageHeader title={create ? "Create Inventory Item" : "Product and Item List"} subtitle="Warehouse-specific stock balances across poultry, feed, soya, eggs, medicine, packaging, spares, equipment, and supplies." />
      {optionsError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{optionsError}</p>}
      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
        </div>
      )}
      {deleteError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{deleteError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Product" value={form.productId || options.products[0]?.id || ""} options={options.products} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Reorder level"><input className={inputClass} type="number" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} required /></FormField>
          <FormField label="Opening quantity"><input className={inputClass} type="number" value={form.openingQuantity} onChange={(event) => setForm({ ...form, openingQuantity: event.target.value })} /></FormField>
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save item"}</button>
          {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-4">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/inventory/items/create"><Plus aria-hidden className="h-4 w-4" /> Create item</Link>}
      {!create && rows.length >= 200 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Showing the first 200 inventory items. Use the table&apos;s search box to find an item outside this list.
        </div>
      )}
      <InventoryItemsTable rows={rows} loading={loading} onEdit={startEdit} onDelete={(row) => { setDeleteError(""); setDeleteItem(row); }} />
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Edit inventory item" size="sm">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Reorder level"><input className={inputClass} type="number" min="0" value={editForm.reorderLevel} onChange={(event) => setEditForm({ ...editForm, reorderLevel: event.target.value })} required /></FormField>
          <FormField label="Status">
            <select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditItem(null)} disabled={savingEdit}>Cancel</button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDeleteItem}
        loading={deleting}
        title="Delete inventory item?"
        message="This will permanently remove this inventory item. This can't be undone. Items with stock on hand or an active batch can't be deleted."
        confirmLabel="Delete item"
      />
    </InventoryShell>
  );
}

export function StockOperationPage({ mode }: { mode: "stock-in" | "stock-out" | "transfers" | "adjustments" }) {
  const { options, optionsError } = useInventoryOptions();
  const [form, setForm] = useState<Record<string, string>>({ warehouseId: "", fromWarehouseId: "", toWarehouseId: "", productId: "", batchNumber: "", bags: "", quantity: "", unitCost: "", reason: "", adjustmentType: "DAMAGE", movementType: "ADJUSTMENT_OUT", expiryDate: "" });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const title = mode === "stock-in" ? "Stock In" : mode === "stock-out" ? "Stock Out" : mode === "transfers" ? "Stock Transfer" : "Stock Adjustment";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const productId = form.productId || options.products[0]?.id;
    const warehouseId = form.warehouseId || options.warehouses[0]?.id;
    const fromWarehouseId = form.fromWarehouseId || options.warehouses[0]?.id;
    const toWarehouseId = form.toWarehouseId || options.warehouses[1]?.id;
    if (!productId || (mode === "transfers" ? (!fromWarehouseId || !toWarehouseId) : !warehouseId)) return;
    const base = { productId, quantity: Number(form.quantity) };
    const payload =
      mode === "stock-in" ? { ...base, warehouseId, batchNumber: form.batchNumber, unitCost: Number(form.unitCost), expiryDate: form.expiryDate || undefined } :
      mode === "stock-out" ? { ...base, warehouseId, movementType: form.movementType } :
      mode === "transfers" ? { ...base, fromWarehouseId, toWarehouseId } :
      { ...base, warehouseId, adjustmentType: form.adjustmentType, quantity: Number(form.quantity), reason: form.reason, approveNow: false };
    const endpoint = mode === "transfers" ? "/inventory/transfers" : mode === "adjustments" ? "/inventory/adjustments" : `/inventory/${mode}`;
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setForm({ ...form, batchNumber: "", bags: "", quantity: "", unitCost: "", reason: "" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : `Failed to submit ${title.toLowerCase()}.`);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <InventoryShell>
      <PageHeader title={title} subtitle="Validated stock workflow with FIFO issue, stock balance protection, audit trail, and movement records." />
      {optionsError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{optionsError}</p>}
      <form onSubmit={submit} className="grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        {mode === "transfers" ? (
          <>
            <SelectField label="From warehouse" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
            <SelectField label="To warehouse" value={form.toWarehouseId || options.warehouses[1]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
          </>
        ) : <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />}
        <SelectField
          label="Product"
          value={form.productId || options.products[0]?.id || ""}
          options={options.products}
          onChange={(value) => setForm({ ...form, productId: value, bags: "", quantity: "" })}
        />
        {mode === "stock-in" ? <FormField label="Batch number"><input className={inputClass} value={form.batchNumber} onChange={(event) => setForm({ ...form, batchNumber: event.target.value })} required /></FormField> : null}
        {/* (2026-08-25) Quantity used to be hardcoded as kg with a "Bags (50kg)"
            helper for every product — selecting Eggs (tracked in Crates of 30,
            via the same piecesPerUnit set on Settings > Catalog) still showed
            "Bags (50 kg each)", which makes no sense for a piece-count product.
            Picks the right helper (or none) from the selected product's own
            piecesPerUnit/UOM instead of assuming kg. */}
        {(() => {
          const selectedProduct = options.products.find((p) => p.id === (form.productId || options.products[0]?.id));
          const piecesPerUnit = selectedProduct?.piecesPerUnit ?? 1;
          const unitLabel = selectedProduct?.uom?.symbol || selectedProduct?.uom?.name || "units";
          const isCrateLike = piecesPerUnit > 1;
          const isKg = !isCrateLike && unitLabel.toLowerCase() === "kg";
          if (isCrateLike) {
            return (
              <>
                {mode !== "adjustments" && (
                  <FormField label={`Crates (1 = ${piecesPerUnit} pieces)`}>
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Enter crates to auto-fill pieces"
                      value={form.bags}
                      onChange={(event) => {
                        const crates = event.target.value;
                        setForm({ ...form, bags: crates, quantity: crates ? String(Number(crates) * piecesPerUnit) : "" });
                      }}
                    />
                  </FormField>
                )}
                <FormField label={form.bags && mode !== "adjustments" ? `Quantity (pieces) — ${form.bags} crate${Number(form.bags) !== 1 ? "s" : ""} × ${piecesPerUnit}` : "Quantity (pieces)"}>
                  <input className={inputClass} type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, bags: "", quantity: event.target.value })} required />
                </FormField>
              </>
            );
          }
          if (isKg) {
            return (
              <>
                {mode !== "adjustments" && (
                  <FormField label="Bags (50 kg each)">
                    <input
                      className={inputClass}
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder="Enter bags to auto-fill kg"
                      value={form.bags}
                      onChange={(event) => {
                        const bags = event.target.value;
                        setForm({ ...form, bags, quantity: bags ? String(Number(bags) * 50) : "" });
                      }}
                    />
                  </FormField>
                )}
                <FormField label={form.bags && mode !== "adjustments" ? `Quantity kg — ${form.bags} bag${Number(form.bags) !== 1 ? "s" : ""} × 50` : "Quantity kg"}>
                  <input className={inputClass} type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, bags: "", quantity: event.target.value })} required />
                </FormField>
              </>
            );
          }
          return (
            <FormField label={`Quantity (${unitLabel})`}>
              <input className={inputClass} type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
            </FormField>
          );
        })()}
        {mode === "stock-in" ? <FormField label="Unit cost"><input className={inputClass} type="number" min="0" step="0.01" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></FormField> : null}
        {mode === "stock-in" ? <FormField label="Expiry date"><input className={inputClass} type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></FormField> : null}
        {mode === "stock-out" ? <FormField label="Movement type"><select className={inputClass} value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value })}><option>ADJUSTMENT_OUT</option><option>SALE_DISPATCH</option><option>PRODUCTION_INPUT</option><option>WASTE</option></select></FormField> : null}
        {mode === "adjustments" ? <FormField label="Adjustment type"><select className={inputClass} value={form.adjustmentType} onChange={(event) => setForm({ ...form, adjustmentType: event.target.value })}><option>DAMAGE</option><option>EXPIRY</option><option>WASTE</option><option>COUNT_CORRECTION</option><option>WRITE_OFF</option><option>FOUND_STOCK</option></select></FormField> : null}
        {mode === "adjustments" ? <FormField label="Reason"><input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></FormField> : null}
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">{submitting ? "Submitting…" : `Submit ${title.toLowerCase()}`}</button>
        {submitError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-4">{submitError}</p>}
      </form>
    </InventoryShell>
  );
}

export function InventoryListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>(endpoint)?.data ?? []);
  const [loading, setLoading] = useState(!hasCached(endpoint));
  const [loadError, setLoadError] = useState("");
  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(endpoint)
      .then((response) => { const fresh = response.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [endpoint]);
  useApiRecovery(rows.length === 0, load);
  const table =
    endpoint === "/inventory/movements" ? <MovementsTable rows={rows as Record<string, any>[]} loading={loading} /> :
    endpoint === "/inventory/expiry-alerts" ? <ExpiryAlertsTable rows={rows as Record<string, any>[]} loading={loading} /> :
    <SimpleRowsTable rows={rows} loading={loading} />;
  return (
    <InventoryShell>
      <PageHeader title={title} subtitle={subtitle} />
      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
        </div>
      )}
      {table}
    </InventoryShell>
  );
}

export function ScopedInventoryViewPage({ scope }: { scope: "warehouses" | "farms" | "production-sites" }) {
  const { options } = useInventoryOptions();
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const source = scope === "warehouses" ? options.warehouses : scope === "farms" ? options.farms : options.productionSites;
  const id = selectedId || source[0]?.id || "";
  function loadRows() {
    if (!id) return;
    setLoading(true);
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/inventory/${scope}/${id}`)
      .then((response) => setRows(response.data ?? []))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { loadRows(); }, [id, scope]);
  useApiRecovery(!!id && rows.length === 0 && !loading, loadRows);
  return (
    <InventoryShell>
      <PageHeader title={scope === "warehouses" ? "Warehouse Stock View" : scope === "farms" ? "Farm Stock View" : "Production Site Stock View"} subtitle="Scoped inventory balances for the selected operating location." />
      <div className="mb-6 max-w-md">
        <SelectField label="Scope" value={id} options={source} onChange={setSelectedId} />
      </div>
      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={loadRows}>Retry</button>
        </div>
      )}
      <InventoryItemsTable rows={rows} loading={loading} />
    </InventoryShell>
  );
}

export function InventoryReportsPage() {
  return (
    <InventoryShell>
      <PageHeader title="Inventory Valuation Report" subtitle="FIFO inventory valuation by warehouse, SKU, quantity, unit cost, and total value." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/inventory/reports/valuation.csv", "inventory-valuation.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download valuation CSV
      </button>
    </InventoryShell>
  );
}

type LocationRow = {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  status: string;
  parentId?: string | null;
  warehouseId: string;
  warehouse?: { code: string; name: string };
};

export function WarehouseLocationsPage() {
  const { options, optionsError } = useInventoryOptions();
  const [rows, setRows] = useState<LocationRow[]>(() => getCachedFirst<ApiEnvelope<LocationRow[]>>("/inventory/locations")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/inventory/locations"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ warehouseId: "", parentId: "", code: "", name: "", barcode: "" });
  const [createError, setCreateError] = useState("");
  const [editLocation, setEditLocation] = useState<LocationRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", barcode: "", status: "ACTIVE" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteLocation, setDeleteLocation] = useState<LocationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<LocationRow[]>>("/inventory/locations");
    const fresh = response.data ?? [];
    setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false)); }, []);
  useApiRecovery(rows.length === 0, () => void load());

  const rootLocations = rows.filter((row) => !row.parentId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    const warehouseId = form.warehouseId || options.warehouses[0]?.id;
    if (!warehouseId || !form.code || !form.name) return;
    try {
      await apiFetch("/inventory/locations", {
        method: "POST",
        body: JSON.stringify({ warehouseId, parentId: form.parentId || undefined, code: form.code, name: form.name, barcode: form.barcode || undefined })
      });
      invalidateCache("/inventory/locations", true);
      setForm({ warehouseId: form.warehouseId, parentId: "", code: "", name: "", barcode: "" });
      await load();
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create location.");
    }
  }

  function startEdit(row: LocationRow) {
    setEditForm({ name: row.name ?? "", barcode: row.barcode ?? "", status: row.status ?? "ACTIVE" });
    setEditError("");
    setEditLocation(row);
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editLocation) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/inventory/locations/${editLocation.id}`, { method: "PATCH", body: JSON.stringify({ name: editForm.name, barcode: editForm.barcode || undefined, status: editForm.status }) });
      invalidateCache("/inventory/locations", true);
      setEditLocation(null);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeleteLocation() {
    if (!deleteLocation) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/inventory/locations/${deleteLocation.id}`, { method: "DELETE" });
      invalidateCache("/inventory/locations", true);
      setDeleteLocation(null);
      await load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete location.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <InventoryShell>
      <PageHeader title="Warehouse Locations" subtitle="Bins, shelves, and sub-areas within each warehouse for precise put-away and picking." />
      {optionsError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{optionsError}</p>}
      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
        </div>
      )}
      {deleteError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{deleteError}</p>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        {createError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-5">{createError}</p>}
        <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
        <FormField label="Parent location">
          <select className={inputClass} value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
            <option value="">None (top-level)</option>
            {rootLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>)}
          </select>
        </FormField>
        <FormField label="Code"><input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required maxLength={40} /></FormField>
        <FormField label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} /></FormField>
        <FormField label="Barcode"><input className={inputClass} value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5"><Plus aria-hidden className="h-4 w-4" /> Save location</button>
      </form>
      <LocationsTable rows={rows} loading={loading} onEdit={startEdit} onDelete={(row) => { setDeleteError(""); setDeleteLocation(row); }} />
      <Modal open={!!editLocation} onClose={() => setEditLocation(null)} title="Edit warehouse location" size="sm">
        <form onSubmit={saveEdit} className="grid gap-4">
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Name"><input className={inputClass} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required maxLength={120} /></FormField>
          <FormField label="Barcode"><input className={inputClass} value={editForm.barcode} onChange={(event) => setEditForm({ ...editForm, barcode: event.target.value })} /></FormField>
          <FormField label="Status">
            <select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditLocation(null)} disabled={savingEdit}>Cancel</button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteLocation}
        onClose={() => setDeleteLocation(null)}
        onConfirm={confirmDeleteLocation}
        loading={deleting}
        title="Delete warehouse location?"
        message={`This will permanently remove "${deleteLocation?.name}" (${deleteLocation?.code}). Locations with child locations can't be deleted.`}
        confirmLabel="Delete location"
      />
    </InventoryShell>
  );
}

function InventoryItemsTable({ rows, loading, onEdit, onDelete }: { rows: Record<string, any>[]; loading?: boolean; onEdit?: (row: Record<string, any>) => void; onDelete?: (row: Record<string, any>) => void }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      empty="No inventory items found"
      columns={[
        {
          key: "product", label: "Product",
          render: (row) => {
            const p = row.product;
            if (!p) return "-";
            return <span><span className="font-semibold">{p.sku}</span><span className="text-ink/60"> — {p.name}</span></span>;
          }
        },
        {
          key: "warehouse", label: "Warehouse",
          render: (row) => {
            const w = row.warehouse;
            return w ? `${w.code} — ${w.name}` : "-";
          }
        },
        { key: "farm", label: "Farm", render: (row) => row.farm?.name ?? "—" },
        { key: "quantityOnHand", label: "On hand", render: (row) => formatQtyWithBags(row.quantityOnHand) },
        { key: "reorderLevel", label: "Reorder at", render: (row) => `${Number(row.reorderLevel ?? 0)} kg` },
        { key: "status", label: "Status", render: (row) => row.status ?? "-" },
        {
          key: "stockBatches", label: "Batches",
          render: (row) => {
            const batches: any[] = row.stockBatches ?? [];
            const active = batches.filter((b) => b.quantityRemaining > 0);
            return active.length > 0 ? `${active.length} active` : "0";
          }
        },
        ...(onEdit || onDelete ? [{
          key: "actions", label: "", sortable: false, render: (row: Record<string, any>) => (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-ink/70 hover:bg-field" onClick={(e) => { e.stopPropagation(); onEdit(row); }} title="Edit item">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {onDelete && (
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onDelete(row); }} title="Delete item">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          )
        }] : [])
      ]}
    />
  );
}

function LocationsTable({ rows, loading, onEdit, onDelete }: { rows: LocationRow[]; loading?: boolean; onEdit?: (row: LocationRow) => void; onDelete?: (row: LocationRow) => void }) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <DataTable<LocationRow>
      rows={rows}
      loading={loading}
      empty="No warehouse locations found"
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "warehouse", label: "Warehouse", render: (row) => row.warehouse ? `${row.warehouse.code} — ${row.warehouse.name}` : "-" },
        { key: "parentId", label: "Parent", render: (row) => row.parentId ? (byId.get(row.parentId)?.name ?? row.parentId) : "—" },
        { key: "barcode", label: "Barcode", render: (row) => row.barcode ?? "-" },
        { key: "status", label: "Status" },
        ...(onEdit || onDelete ? [{
          key: "actions", label: "", sortable: false, render: (row: LocationRow) => (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-ink/70 hover:bg-field" onClick={(e) => { e.stopPropagation(); onEdit(row); }} title="Edit location">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {onDelete && (
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onDelete(row); }} title="Delete location">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          )
        }] : [])
      ]}
    />
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? option.product?.sku ?? ""} {option.name ?? option.product?.name ?? option.warehouse?.name ?? ""}</option>)}
      </select>
    </FormField>
  );
}

function SimpleRowsTable({ rows, loading }: { rows: Record<string, unknown>[]; loading?: boolean }) {
  if (loading && rows.length === 0) {
    return (
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="h-8 w-52 animate-pulse rounded-md bg-ink/6" />
          <div className="h-4 w-20 animate-pulse rounded-md bg-ink/6" />
        </div>
        <div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-6 border-b border-line/60 px-4 py-3.5">
              <div className="h-4 animate-pulse rounded bg-ink/6" style={{ width: `${14 + (i * 11) % 12}%` }} />
              <div className="h-4 animate-pulse rounded bg-ink/6" style={{ width: `${20 + (i * 7) % 18}%` }} />
              <div className="h-4 animate-pulse rounded bg-ink/6" style={{ width: `${10 + (i * 9) % 14}%` }} />
              <div className="h-4 flex-1 animate-pulse rounded bg-ink/6" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const HIDDEN = new Set(["id", "itemId", "companyId", "branchId", "deletedAt", "updatedAt"]);
  const keys = Object.keys(rows?.[0] ?? {}).filter((key) => !HIDDEN.has(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => {
    if (key === "quantityOnHand") return formatQtyWithBags(row[key]);
    return typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90);
  } }))} />;
}

function MovementsTable({ rows, loading }: { rows: Record<string, any>[]; loading?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      empty="No stock movements found"
      columns={[
        { key: "movementDate", label: "Date", render: (row) => row.movementDate ? new Date(row.movementDate).toLocaleDateString() : "-" },
        { key: "movementType", label: "Type", render: (row) => String(row.movementType ?? "").replace(/_/g, " ") },
        {
          key: "product", label: "Product",
          render: (row) => {
            const p = row.product;
            return p ? <span><span className="font-semibold">{p.sku}</span><span className="text-ink/60"> — {p.name}</span></span> : "-";
          }
        },
        { key: "quantity", label: "Qty (kg / bags)", render: (row) => formatQtyWithBags(row.quantity) },
        {
          key: "warehouse", label: "Warehouse",
          render: (row) => {
            if (row.fromWarehouse && row.toWarehouse) return `${row.fromWarehouse.name} → ${row.toWarehouse.name}`;
            return (row.warehouse ?? row.fromWarehouse ?? row.toWarehouse)?.name ?? "-";
          }
        },
        { key: "stockBatch", label: "Batch", render: (row) => row.stockBatch?.batchNumber ?? "-" },
        { key: "notes", label: "Notes", render: (row) => String(row.notes ?? "-").slice(0, 60) },
      ]}
    />
  );
}

function ExpiryAlertsTable({ rows, loading }: { rows: Record<string, any>[]; loading?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      empty="No expiry alerts found"
      columns={[
        {
          key: "product", label: "Product",
          render: (row) => {
            const p = row.product;
            return p ? <span><span className="font-semibold">{p.sku}</span><span className="text-ink/60"> — {p.name}</span></span> : "-";
          }
        },
        { key: "warehouse", label: "Warehouse", render: (row) => row.warehouse?.name ?? "-" },
        { key: "stockBatch", label: "Batch", render: (row) => row.stockBatch?.batchNumber ?? "-" },
        { key: "expiryDate", label: "Expiry", render: (row) => row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : "-" },
        {
          key: "daysToExpiry", label: "Days left",
          render: (row) => {
            const d = Number(row.daysToExpiry);
            const cls = d <= 7 ? "font-semibold text-red-600" : d <= 14 ? "font-semibold text-amber-600" : "";
            return <span className={cls}>{d}</span>;
          }
        },
        { key: "quantityRemaining", label: "Qty remaining", render: (row) => formatQtyWithBags(row.stockBatch?.quantityRemaining) },
      ]}
    />
  );
}

