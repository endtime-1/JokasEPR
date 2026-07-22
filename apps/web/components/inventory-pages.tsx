"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { InventoryShell } from "./inventory-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport, hasCached, getCached } from "../lib/api";

type Option = {
  id: string;
  code?: string;
  sku?: string;
  name: string;
  product?: { sku: string; name: string };
  warehouse?: { code: string; name: string };
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
  const [options, setOptions] = useState<InventoryOptions>(EMPTY_OPTIONS);
  const [optionsError, setOptionsError] = useState("");
  useEffect(() => {
    apiFetch<ApiEnvelope<InventoryOptions>>("/inventory/options")
      .then((response) => setOptions(response.data ?? EMPTY_OPTIONS))
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load warehouse and product options."));
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


export function InventoryItemsPage({ create = false }: { create?: boolean }) {
  const { options, optionsError } = useInventoryOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/inventory/items")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/inventory/items"));
  const [form, setForm] = useState({ warehouseId: "", productId: "", reorderLevel: "", openingQuantity: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/inventory/items");
    setRows(response.data ?? []);
  }
  useEffect(() => { load().catch(() => undefined).finally(() => setLoading(false)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/inventory/items", { method: "POST", body: JSON.stringify({ warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || options.products[0]?.id, reorderLevel: Number(form.reorderLevel), openingQuantity: Number(form.openingQuantity || 0) }) });
    await load();
  }
  return (
    <InventoryShell>
      <PageHeader title={create ? "Create Inventory Item" : "Product and Item List"} subtitle="Warehouse-specific stock balances across poultry, feed, soya, eggs, medicine, packaging, spares, equipment, and supplies." />
      {optionsError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{optionsError}</p>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Product" value={form.productId || options.products[0]?.id || ""} options={options.products} onChange={(value) => setForm({ ...form, productId: value })} />
          <FormField label="Reorder level"><input className={inputClass} type="number" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} required /></FormField>
          <FormField label="Opening quantity"><input className={inputClass} type="number" value={form.openingQuantity} onChange={(event) => setForm({ ...form, openingQuantity: event.target.value })} /></FormField>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Plus aria-hidden className="h-4 w-4" /> Save item</button>
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/inventory/items/create"><Plus aria-hidden className="h-4 w-4" /> Create item</Link>}
      <SimpleRowsTable rows={rows} loading={loading} />
    </InventoryShell>
  );
}

export function StockOperationPage({ mode }: { mode: "stock-in" | "stock-out" | "transfers" | "adjustments" }) {
  const { options, optionsError } = useInventoryOptions();
  const [form, setForm] = useState<Record<string, string>>({ warehouseId: "", fromWarehouseId: "", toWarehouseId: "", productId: "", batchNumber: "", quantity: "", unitCost: "", reason: "", adjustmentType: "DAMAGE", movementType: "ADJUSTMENT_OUT", expiryDate: "" });
  const title = mode === "stock-in" ? "Stock In" : mode === "stock-out" ? "Stock Out" : mode === "transfers" ? "Stock Transfer" : "Stock Adjustment";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = { productId: form.productId || options.products[0]?.id, quantity: Number(form.quantity) };
    const payload =
      mode === "stock-in" ? { ...base, warehouseId: form.warehouseId || options.warehouses[0]?.id, batchNumber: form.batchNumber, unitCost: Number(form.unitCost), expiryDate: form.expiryDate || undefined } :
      mode === "stock-out" ? { ...base, warehouseId: form.warehouseId || options.warehouses[0]?.id, movementType: form.movementType } :
      mode === "transfers" ? { ...base, fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id, toWarehouseId: form.toWarehouseId || options.warehouses[1]?.id } :
      { ...base, warehouseId: form.warehouseId || options.warehouses[0]?.id, adjustmentType: form.adjustmentType, quantity: Number(form.quantity), reason: form.reason, approveNow: false };
    const endpoint = mode === "transfers" ? "/inventory/transfers" : mode === "adjustments" ? "/inventory/adjustments" : `/inventory/${mode}`;
    await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
    setForm({ ...form, batchNumber: "", quantity: "", unitCost: "", reason: "" });
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
        <SelectField label="Product" value={form.productId || options.products[0]?.id || ""} options={options.products} onChange={(value) => setForm({ ...form, productId: value })} />
        {mode === "stock-in" ? <FormField label="Batch number"><input className={inputClass} value={form.batchNumber} onChange={(event) => setForm({ ...form, batchNumber: event.target.value })} required /></FormField> : null}
        <FormField label="Quantity"><input className={inputClass} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></FormField>
        {mode === "stock-in" ? <FormField label="Unit cost"><input className={inputClass} type="number" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></FormField> : null}
        {mode === "stock-in" ? <FormField label="Expiry date"><input className={inputClass} type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></FormField> : null}
        {mode === "stock-out" ? <FormField label="Movement type"><select className={inputClass} value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value })}><option>ADJUSTMENT_OUT</option><option>SALE_DISPATCH</option><option>PRODUCTION_INPUT</option><option>WASTE</option></select></FormField> : null}
        {mode === "adjustments" ? <FormField label="Adjustment type"><select className={inputClass} value={form.adjustmentType} onChange={(event) => setForm({ ...form, adjustmentType: event.target.value })}><option>DAMAGE</option><option>EXPIRY</option><option>WASTE</option><option>COUNT_CORRECTION</option><option>WRITE_OFF</option><option>FOUND_STOCK</option></select></FormField> : null}
        {mode === "adjustments" ? <FormField label="Reason"><input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></FormField> : null}
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Submit {title.toLowerCase()}</button>
      </form>
    </InventoryShell>
  );
}

export function InventoryListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(endpoint)
      .then((response) => setRows(response.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [endpoint]);
  return (
    <InventoryShell>
      <PageHeader title={title} subtitle={subtitle} />
      <SimpleRowsTable rows={rows} loading={loading} />
    </InventoryShell>
  );
}

export function ScopedInventoryViewPage({ scope }: { scope: "warehouses" | "farms" | "production-sites" }) {
  const { options } = useInventoryOptions();
  const [selectedId, setSelectedId] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const source = scope === "warehouses" ? options.warehouses : scope === "farms" ? options.farms : options.productionSites;
  const id = selectedId || source[0]?.id || "";
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setRows([]);
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/inventory/${scope}/${id}`)
      .then((response) => setRows(response.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id, scope]);
  return (
    <InventoryShell>
      <PageHeader title={scope === "warehouses" ? "Warehouse Stock View" : scope === "farms" ? "Farm Stock View" : "Production Site Stock View"} subtitle="Scoped inventory balances for the selected operating location." />
      <div className="mb-6 max-w-md">
        <SelectField label="Scope" value={id} options={source} onChange={setSelectedId} />
      </div>
      <SimpleRowsTable rows={rows} loading={loading} />
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
  const keys = Object.keys(rows?.[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }))} />;
}

