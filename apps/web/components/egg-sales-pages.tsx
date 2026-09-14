"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Egg, Trash2 } from "lucide-react";
import { DataTable } from "./data-table";
import { ConfirmModal, PageHeader } from "./ui";
import { ApiEnvelope, apiFetch, getCachedFirst, hasCached, invalidateCache } from "../lib/api";
import { useApiRecovery } from "../lib/use-api-recovery";

type Warehouse = { id: string; code?: string; name: string; branchId: string; onHandCrates: number };
type Options = { warehouses: Warehouse[]; eggsProductConfigured: boolean; piecesPerCrate: number };
type SaleRow = {
  id: string;
  saleNumber: string;
  saleDate: string;
  warehouseId: string;
  warehouseName: string;
  buyerName?: string;
  quantityPieces: number;
  quantityCrates: string | number;
  unitPriceCrate: string | number;
  totalAmount: string | number;
  notes?: string;
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const money = (v: string | number | undefined) => `GHS ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EggSalesPage() {
  const [opts, setOpts] = useState<Options>(() => getCachedFirst<ApiEnvelope<Options>>("/egg-sales/options")?.data ?? { warehouses: [], eggsProductConfigured: true, piecesPerCrate: 30 });
  const [rows, setRows] = useState<SaleRow[]>(() => getCachedFirst<ApiEnvelope<SaleRow[]>>("/egg-sales")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/egg-sales"));
  const [loadError, setLoadError] = useState("");

  // Owner feedback (2026-09-14): typed-by-hand sales defaulted to "right
  // now" with no way to backdate — unlike the bulk import, which could set
  // any date. The backend always supported this (saleDate is optional on
  // CreateEggSaleDto); this field was just missing from the form.
  const [form, setForm] = useState({ warehouseId: "", buyerName: "", quantity: "", unit: "CRATES" as "PIECES" | "CRATES", unitPriceCrate: "", saleDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");

  const [voidRow, setVoidRow] = useState<SaleRow | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState("");

  function load() {
    setLoadError("");
    Promise.all([
      apiFetch<ApiEnvelope<Options>>("/egg-sales/options"),
      apiFetch<ApiEnvelope<SaleRow[]>>("/egg-sales")
    ])
      .then(([o, r]) => {
        setOpts(o.data);
        setRows(r.data ?? []);
        setForm((f) => (f.warehouseId ? f : { ...f, warehouseId: o.data.warehouses[0]?.id ?? "" }));
      })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useApiRecovery(rows.length === 0, load);

  const selectedWarehouse = opts.warehouses.find((w) => w.id === form.warehouseId);
  const quantityNum = Number(form.quantity) || 0;
  const crates = useMemo(() => (form.unit === "CRATES" ? quantityNum : quantityNum / (opts.piecesPerCrate || 30)), [quantityNum, form.unit, opts.piecesPerCrate]);
  const pieces = useMemo(() => (form.unit === "PIECES" ? quantityNum : quantityNum * (opts.piecesPerCrate || 30)), [quantityNum, form.unit, opts.piecesPerCrate]);
  const total = crates * (Number(form.unitPriceCrate) || 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setMessage("");
    try {
      const res = await apiFetch<ApiEnvelope<SaleRow>>("/egg-sales", {
        method: "POST",
        body: JSON.stringify({
          warehouseId: form.warehouseId,
          buyerName: form.buyerName || undefined,
          quantity: quantityNum,
          unit: form.unit,
          unitPriceCrate: Number(form.unitPriceCrate),
          saleDate: form.saleDate || undefined,
          notes: form.notes || undefined
        })
      });
      invalidateCache("/egg-sales", true);
      invalidateCache("/egg-sales/options", true);
      setMessage(`Sold ${res.data.quantityCrates} crate(s) — ${res.data.saleNumber}`);
      setForm((f) => ({ ...f, buyerName: "", quantity: "", unitPriceCrate: "", saleDate: new Date().toISOString().slice(0, 10), notes: "" }));
      load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record egg sale.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmVoid() {
    if (!voidRow) return;
    setVoiding(true);
    setVoidError("");
    try {
      await apiFetch(`/egg-sales/${voidRow.id}`, { method: "DELETE" });
      invalidateCache("/egg-sales", true);
      invalidateCache("/egg-sales/options", true);
      setVoidRow(null);
      load();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Failed to void sale.");
    } finally {
      setVoiding(false);
    }
  }

  return (
    <>
      <PageHeader title="Egg Sales" description="Sell eggs directly from an egg store — priced per crate, entered in pieces or crates. Kept separate from the general Sales module." />

      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
      {!loading && opts.warehouses.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No Egg Store warehouse is set up (or you don't have access to one) — an egg sale needs a warehouse of type "Egg Store" to sell from.
        </p>
      )}
      {!loading && opts.warehouses.length > 0 && !opts.eggsProductConfigured && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No "Eggs" product (SKU "EG") exists in the catalog yet — add it under Settings → Catalog before recording a sale.
        </p>
      )}

      <form onSubmit={submit} className="app-card mb-6 grid gap-4 p-5 md:grid-cols-3">
        <div className="flex items-center gap-2 md:col-span-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><Egg className="h-4 w-4" /></div>
          <p className="text-sm font-semibold text-ink">Record a sale</p>
        </div>

        <label className="grid gap-1 text-sm font-semibold">
          Egg store
          <select required className={inputClass} value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select store…</option>
            {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.onHandCrates} crate(s) on hand</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Buyer (optional)<input className={inputClass} value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} placeholder="Walk-in / customer name" /></label>
        <label className="grid gap-1 text-sm font-semibold">Sale date<input required type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} /></label>

        <label className="grid gap-1 text-sm font-semibold">
          Quantity
          <div className="flex gap-2">
            <input required type="number" min={0} step="1" className={inputClass + " flex-1"} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <select className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as "PIECES" | "CRATES" })}>
              <option value="CRATES">Crates</option>
              <option value="PIECES">Pieces</option>
            </select>
          </div>
          {quantityNum > 0 && <span className="text-[11px] font-normal text-ink/45">= {crates.toLocaleString(undefined, { maximumFractionDigits: 2 })} crate(s), {Math.round(pieces).toLocaleString()} piece(s)</span>}
        </label>
        <label className="grid gap-1 text-sm font-semibold">Price per crate (GHS)<input required type="number" min={0} step="0.01" className={inputClass} value={form.unitPriceCrate} onChange={(e) => setForm({ ...form, unitPriceCrate: e.target.value })} /></label>
        <div className="grid content-end">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Total</span>
          <span className="text-xl font-extrabold text-ink">{money(total)}</span>
        </div>

        <label className="grid gap-1 text-sm font-semibold md:col-span-3">Notes<input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>

        {selectedWarehouse && crates > selectedWarehouse.onHandCrates && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-3">
            Only {selectedWarehouse.onHandCrates} crate(s) on hand at {selectedWarehouse.name} — this will be rejected.
          </p>
        )}
        <div className="md:col-span-3">
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60" type="submit">
            {submitting ? "Recording…" : "Record sale"}
          </button>
        </div>
        {message && <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:col-span-3">{message}</p>}
        {submitError && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-3">{submitError}</p>}
      </form>

      {voidError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{voidError}</p>}
      <DataTable<SaleRow>
        rows={rows}
        loading={loading}
        empty="No egg sales recorded yet."
        columns={[
          { key: "saleNumber", label: "Sale #" },
          { key: "saleDate", label: "Date", render: (r) => new Date(r.saleDate).toLocaleDateString() },
          { key: "warehouseName", label: "Store" },
          { key: "buyerName", label: "Buyer", render: (r) => r.buyerName || "—" },
          { key: "quantityCrates", label: "Crates", render: (r) => Number(r.quantityCrates).toLocaleString() },
          { key: "quantityPieces", label: "Pieces", render: (r) => r.quantityPieces.toLocaleString() },
          { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
          {
            key: "actions", label: "", render: (r) => (
              <button type="button" onClick={() => { setVoidError(""); setVoidRow(r); }} className="rounded-lg p-1.5 text-ink/50 transition hover:bg-red-50 hover:text-red-600" title="Void sale">
                <Trash2 className="h-4 w-4" />
              </button>
            )
          }
        ]}
      />
      <ConfirmModal
        open={!!voidRow}
        onClose={() => setVoidRow(null)}
        onConfirm={confirmVoid}
        loading={voiding}
        title="Void this egg sale?"
        message={`This will reverse ${voidRow?.saleNumber} and put ${voidRow ? Number(voidRow.quantityCrates) : 0} crate(s) back into stock. This can't be undone.`}
        confirmLabel="Void sale"
      />
    </>
  );
}
