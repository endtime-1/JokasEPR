"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CircleAlert, AlertTriangle, ArrowLeft, ChartBar, Brain, Calculator, CircleCheckBig, ChevronDown, ChevronUp, Download, Factory, GripVertical, Package, PackageCheck, Pencil, Plus, Printer, RotateCw, Trash2, TrendingUp, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FeedMillShell } from "./feed-mill-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

type Option = {
  id: string;
  branchId?: string;
  farmId?: string;
  productionSiteId?: string;
  code?: string;
  sku?: string;
  name: string;
  feedType?: string;
  finishedProductId?: string;
  currentVersionNo?: number;
};

type FeedOptions = {
  productionSites: Option[];
  warehouses: Option[];
  farms: Option[];
  poultryHouses: Option[];
  rawMaterials: Option[];
  finishedFeeds: Option[];
  formulas: Option[];
  batches: Array<Option & { batchNumber: string; status: string }>;
};

type FormulaRow = {
  id: string;
  code: string;
  name: string;
  feedType: string;
  status: string;
  targetBatchKg: string | number;
  finishedProduct?: { name: string; sku: string };
  costing?: { ingredientCost: number; costPer100Kg: number; costPer50KgBag: number };
  ingredients?: Array<{ id: string; quantityKg: string | number; unitCost: string | number; ingredient?: { name: string; sku: string } }>;
  versions?: Array<{ id: string; versionNo: number; status: string; costPer100Kg: string | number; costPer50KgBag: string | number; createdAt: string }>;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  plannedQuantityKg: string | number;
  scheduledDate: string;
  status: string;
  productionSite?: { name: string; code: string };
  formula?: { name: string; code: string; feedType: string };
  finishedProduct?: { name: string; sku: string };
  batches?: Array<{ id: string; batchNumber: string; status: string; producedQuantityKg: string | number }>;
};

type BatchRow = {
  id: string;
  batchNumber: string;
  status: string;
  producedQuantityKg: string | number;
  wastageKg: string | number;
  productionDate: string;
  productionSite?: { name: string; code: string };
  finishedProduct?: { name: string; sku: string };
  metrics?: { totalCost: number; expectedSalesValue: number; profitMargin: number };
};

type BatchDetail = {
  id: string;
  batchNumber: string;
  status: string;
  producedQuantityKg: string | number;
  wastageKg: string | number;
  productionDate: string;
  productionSite?: { name: string; code: string };
  finishedProduct?: { name: string; sku: string };
  productionOrder?: { orderNumber: string; plannedQuantityKg: string | number };
  rawMaterialUsages?: Array<{ id: string; rawMaterial?: { name: string; sku: string }; quantityKg: string | number; unitCost: string | number; wastageKg: string | number }>;
  qualityChecks?: Array<{ id: string; status: string; moisturePercent?: number | null; proteinPercent?: number | null; textureNotes?: string | null; checkedAt?: string }>;
  finishedFeedStocks?: Array<{ id: string; warehouse?: { name: string; code: string }; quantityKg: string | number; bag50KgCount: number; unitCost: string | number }>;
  packagingRecords?: Array<{ id: string; packageSizeKg: string | number; packageCount: number; packagedAt?: string }>;
  internalTransfers?: Array<{ id: string; fromWarehouse?: { name: string; code: string }; toFarm?: { name: string; code: string }; toPoultryHouse?: { name: string; code: string } | null; quantityKg: string | number; transferDate?: string }>;
  metrics?: { totalCost: number; expectedSalesValue: number; profitMargin: number };
};

type IngredientDraftRow = {
  uid: string;
  ingredientId: string;
  quantityKg: string;
  unitCost: string;
};

type OrderFormState = {
  productionSiteId: string;
  formulaId: string;
  plannedQuantityKg: string;
  scheduledDate: string;
  rawMaterialWarehouseId: string;
  notes: string;
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const today = () => new Date().toISOString().slice(0, 10);

function useFeedOptions() {
  const [options, setOptions] = useState<FeedOptions>({ productionSites: [], warehouses: [], farms: [], poultryHouses: [], rawMaterials: [], finishedFeeds: [], formulas: [], batches: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<FeedOptions>>("/feed-production/options")
      .then((response) => setOptions(response.data ?? { productionSites: [], warehouses: [], farms: [], poultryHouses: [], rawMaterials: [], finishedFeeds: [], formulas: [], batches: [] }))
      .catch(() => undefined);
  }, []);
  return options;
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-ink/65">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/feed-production/formulas">
          Formulas
        </Link>
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/feed-production/orders">
          Orders
        </Link>
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/feed-production/quality-control">
          QC
        </Link>
      </div>
    </div>
  );
}

function money(value: unknown) {
  return `GHS ${Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

export function FeedFormulaListPage() {
  const [rows, setRows] = useState<FormulaRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const response = await apiFetch<ApiEnvelope<FormulaRow[]>>("/feed-production/formulas");
      setRows(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <FeedMillShell>
      <PageHeader title="Feed Formulas" subtitle="Manage feed formulas, ingredients, costing, and active formula versions." />
      <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/feed-production/formulas/create">
        <Plus aria-hidden className="h-4 w-4" /> Create formula
      </Link>
      <FormulaTable rows={rows} loading={loading} />
    </FeedMillShell>
  );
}


let _uidCounter = 0;
function uid() { return `row-${++_uidCounter}`; }

const FEED_TYPES = [
  "CHICK_MASH",
  "GROWER_MASH",
  "LAYER_MASH",
  "BROILER_STARTER",
  "BROILER_FINISHER",
  "BREEDER_FEED",
  "CONCENTRATE",
  "CUSTOM_FEED",
  "BROILER_STARTER_MASH",
  "BROILER_STARTER_CONCENTRATE",
  "BROILER_FINISHER_MASH",
  "BROILER_FINISHER_CONCENTRATE",
  "SUPER_CHICKS_CONCENTRATE",
  "SUPER_CHICKS_MASH",
  "CHICKS_STARTER_MASH",
  "CHICKS_STARTER_CONCENTRATE",
  "DEVELOPER_MASH",
  "DEVELOPER_CONCENTRATE",
  "PRE_LAY_MASH",
  "PRE_LAY_CONCENTRATE",
  "LAYER_1_MASH",
  "LAYER_1_CONCENTRATE",
  "LAYER_2_MASH",
  "LAYER_2_CONCENTRATE"
] as const;

export function FormulaBuilderPage() {
  const options = useFeedOptions();
  const router = useRouter();

  const [finishedProductId, setFinishedProductId] = useState("");
  const [feedType, setFeedType] = useState("LAYER_MASH");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [targetBatchKg, setTargetBatchKg] = useState("100");

  const [ingRows, setIngRows] = useState<IngredientDraftRow[]>([
    { uid: uid(), ingredientId: "", quantityKg: "", unitCost: "" }
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setIngRows((prev) => [...prev, { uid: uid(), ingredientId: "", quantityKg: "", unitCost: "" }]);
  }

  function removeRow(rowUid: string) {
    setIngRows((prev) => prev.filter((r) => r.uid !== rowUid));
  }

  function updateRow(rowUid: string, field: keyof Omit<IngredientDraftRow, "uid">, value: string) {
    setIngRows((prev) => prev.map((r) => r.uid === rowUid ? { ...r, [field]: value } : r));
  }

  const validRows = ingRows.filter((r) => r.ingredientId && Number(r.quantityKg) > 0);
  const totalKg = ingRows.reduce((s, r) => s + (Number(r.quantityKg) || 0), 0);
  const totalCost = ingRows.reduce((s, r) => s + (Number(r.quantityKg) || 0) * (Number(r.unitCost) || 0), 0);
  const batchKg = Number(targetBatchKg) || 100;
  const costPer100Kg = batchKg > 0 ? (totalCost / batchKg) * 100 : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (validRows.length === 0) {
      setError("Add at least one ingredient before saving the formula.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<ApiEnvelope<FormulaRow>>("/feed-production/formulas", {
        method: "POST",
        body: JSON.stringify({
          finishedProductId: finishedProductId || options.finishedFeeds[0]?.id,
          feedType,
          code,
          name,
          targetBatchKg: batchKg,
          status: "ACTIVE",
          ingredients: validRows.map((r, i) => ({
            ingredientId: r.ingredientId,
            quantityKg: Number(r.quantityKg),
            unitCost: Number(r.unitCost),
            sortOrder: i + 1
          }))
        })
      });
      router.push(`/feed-production/formulas/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to save formula. Please try again.");
      setSaving(false);
    }
  }

  const inputCls = "min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

  return (
    <FeedMillShell>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/feed-production/formulas" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink/40 hover:text-brand">
              <ArrowLeft className="h-3 w-3" /> Formulas
            </Link>
            <p className="app-kicker">Feed Mill</p>
            <h1 className="mt-0.5 text-2xl font-bold text-ink">New Feed Formula</h1>
            <p className="mt-1 text-sm text-ink/55">
              Set formula details, then add as many ingredients as needed. The formula cannot be saved without at least one ingredient.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Formula header card */}
          <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink/40">Formula Details</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Finished Product *</label>
                <select
                  required
                  className={inputCls}
                  value={finishedProductId || options.finishedFeeds[0]?.id || ""}
                  onChange={(e) => setFinishedProductId(e.target.value)}
                >
                  <option value="">Select finished product…</option>
                  {options.finishedFeeds.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Feed Type *</label>
                <select required className={inputCls} value={feedType} onChange={(e) => setFeedType(e.target.value)}>
                  {FEED_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Formula Code *</label>
                <input required className={inputCls} placeholder="e.g. FM-LM-001" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Formula Name *</label>
                <input required className={inputCls} placeholder="e.g. Layer Mash Premium" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Target Batch kg *</label>
                <input required type="number" min="1" className={inputCls} value={targetBatchKg} onChange={(e) => setTargetBatchKg(e.target.value)} />
                <p className="mt-1 text-[10px] text-ink/40">All ingredient quantities are per this batch size</p>
              </div>
            </div>
          </section>

          {/* Ingredient builder card */}
          <section className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-ink">Ingredient List</h2>
                <p className="text-xs text-ink/45">Select each ingredient, enter kg per batch and unit cost (GHS/kg)</p>
              </div>
              {validRows.length > 0 && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                  {validRows.length} ingredient{validRows.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wide text-ink/40">
                    <th className="w-8 py-2.5 pl-4 pr-2">#</th>
                    <th className="py-2.5 pr-4" style={{ minWidth: 220 }}>Ingredient *</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 120 }}>kg per batch *</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 100 }}>Qty per kg</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 120 }}>Qty per Bag (50kg)</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 120 }}>Price (GHS/kg)</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 110 }}>Line Cost (GHS)</th>
                    <th className="w-10 py-2.5 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {ingRows.map((row, idx) => {
                    const lineKg = Number(row.quantityKg) || 0;
                    const lineCost = Number(row.unitCost) || 0;
                    const lineTotal = lineKg * lineCost;
                    const targetBatch = Number(targetBatchKg) || 100;
                    const qtyPerKg = lineKg / targetBatch;
                    const qtyPerBag = qtyPerKg * 50;
                    const isDupe = row.ingredientId && ingRows.filter((r) => r.ingredientId === row.ingredientId).length > 1;
                    return (
                      <tr key={row.uid} className="group border-b border-line/40 last:border-0">
                        <td className="py-2 pl-4 pr-2 text-center text-xs font-semibold text-ink/30">{idx + 1}</td>
                        <td className="py-2 pr-4">
                          <div>
                            <select
                              className={`${inputCls} ${isDupe ? "border-amber-400 ring-2 ring-amber-100" : ""}`}
                              value={row.ingredientId}
                              onChange={(e) => updateRow(row.uid, "ingredientId", e.target.value)}
                            >
                              <option value="">— select ingredient —</option>
                              {options.rawMaterials.map((m) => (
                                <option key={m.id} value={m.id}>{m.sku} — {m.name}</option>
                              ))}
                            </select>
                            {isDupe && <p className="mt-0.5 text-[10px] text-amber-600">Duplicate ingredient</p>}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            placeholder="0"
                            className={`${inputCls} text-right`}
                            value={row.quantityKg}
                            onChange={(e) => updateRow(row.uid, "quantityKg", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-4 text-right text-ink/50 text-xs">
                          {qtyPerKg.toLocaleString("en-GH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
                        </td>
                        <td className="py-2 pr-4 text-right text-ink/50 text-xs">
                          {qtyPerBag.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className={`${inputCls} text-right`}
                            value={row.unitCost}
                            onChange={(e) => updateRow(row.uid, "unitCost", e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-4 text-right font-semibold text-ink/70">
                          {lineTotal > 0 ? lineTotal.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-ink/25">—</span>}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => removeRow(row.uid)}
                            disabled={ingRows.length === 1}
                            className="rounded-lg p-1.5 text-ink/30 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Remove row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add row + totals */}
            <div className="border-t border-line/60 px-5 py-3">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5 transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add ingredient
              </button>
            </div>

            {/* Running totals footer */}
            <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-field/60">
              <div className="px-5 py-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Total kg (batch)</p>
                <p className="mt-0.5 text-lg font-bold text-ink">{totalKg.toLocaleString("en-GH", { maximumFractionDigits: 2 })}</p>
                {Math.abs(totalKg - batchKg) > 0.1 && totalKg > 0 && (
                  <p className={`text-[10px] font-semibold ${totalKg < batchKg ? "text-amber-600" : "text-blue-600"}`}>
                    {totalKg > batchKg ? `+${(totalKg - batchKg).toFixed(2)} over target` : `${(batchKg - totalKg).toFixed(2)} under target`}
                  </p>
                )}
              </div>
              <div className="px-5 py-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Total Ingredient Cost</p>
                <p className="mt-0.5 text-lg font-bold text-ink">
                  {totalCost.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-ink/40">GHS</span>
                </p>
              </div>
              <div className="px-5 py-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Cost per 100 kg</p>
                <p className="mt-0.5 text-lg font-bold text-brand">
                  {costPer100Kg.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-ink/40">GHS</span>
                </p>
              </div>
            </div>
          </section>

          {/* Validation hint */}
          {validRows.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select at least one ingredient and enter a quantity before saving.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4 shadow-panel">
            <Link href="/feed-production/formulas" className="app-button-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || validRows.length === 0}
              className="app-button-primary min-w-[160px]"
            >
              {saving ? "Saving…" : `Save formula (${validRows.length} ingredient${validRows.length !== 1 ? "s" : ""})`}
            </button>
          </div>

        </form>
      </div>
    </FeedMillShell>
  );
}

function FormulaTable({ rows, loading }: { rows: FormulaRow[]; loading?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      empty="No feed formulas found"
      columns={[
        { key: "code", label: "Formula", render: (row) => <Link className="font-semibold text-brand" href={`/feed-production/formulas/${row.id}`}>{row.code}</Link> },
        { key: "name", label: "Name", render: (row) => row.name },
        { key: "feedType", label: "Feed type", render: (row) => row.feedType },
        { key: "product", label: "Finished feed", render: (row) => row.finishedProduct?.name ?? "-" },
        { key: "cost100", label: "Cost / 100kg", render: (row) => money(row.costing?.costPer100Kg) },
        { key: "costBag", label: "Cost / 50kg", render: (row) => money(row.costing?.costPer50KgBag) },
        { key: "status", label: "Status", render: (row) => row.status }
      ]}
    />
  );
}

export function FeedFormulaDetailsPage({ mode = "details" }: { mode?: "details" | "costing" | "versions" }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const options = useFeedOptions();
  const [formula, setFormula] = useState<FormulaRow | null>(null);
  const [costing, setCosting] = useState<FormulaRow["costing"] | null>(null);

  // Header edit state
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerDraft, setHeaderDraft] = useState({ name: "", targetBatchKg: "" });
  const [headerSaving, setHeaderSaving] = useState(false);

  // Per-ingredient edit state
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState({ quantityKg: "", unitCost: "" });
  const [rowSaving, setRowSaving] = useState(false);
  // confirmDeleteId: first click → show inline confirm; deletingId: delete in flight
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");

  // Archive / restore / delete formula state
  const [archiving, setArchiving] = useState(false);
  const [archiveErr, setArchiveErr] = useState("");
  const [confirmDeleteFormula, setConfirmDeleteFormula] = useState(false);
  const [deletingFormula, setDeletingFormula] = useState(false);
  const [deleteFormulaErr, setDeleteFormulaErr] = useState("");

  // Add form
  const [ingredient, setIngredient] = useState({ ingredientId: "", quantityKg: "", unitCost: "" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<FormulaRow>>(`/feed-production/formulas/${params.id}`);
    setFormula(response.data);
    if (mode === "costing") {
      const cost = await apiFetch<ApiEnvelope<FormulaRow["costing"]>>(`/feed-production/formulas/${params.id}/costing`);
      setCosting(cost.data);
    }
  }

  useEffect(() => { load().catch(() => undefined); }, [mode, params.id]);

  function openHeaderEdit() {
    setHeaderDraft({ name: formula?.name ?? "", targetBatchKg: String(formula?.targetBatchKg ?? "") });
    setEditingHeader(true);
  }

  async function saveHeader() {
    setHeaderSaving(true);
    try {
      await apiFetch(`/feed-production/formulas/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: headerDraft.name, targetBatchKg: Number(headerDraft.targetBatchKg) }),
      });
      setEditingHeader(false);
      await load();
    } finally {
      setHeaderSaving(false);
    }
  }

  function openRowEdit(ing: { id: string; quantityKg: string | number; unitCost: string | number }) {
    setEditingRow(ing.id);
    setRowDraft({ quantityKg: String(ing.quantityKg), unitCost: String(ing.unitCost) });
  }

  async function saveRow(ingId: string) {
    setRowSaving(true);
    try {
      await apiFetch(`/feed-production/formulas/${params.id}/ingredients/${ingId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantityKg: Number(rowDraft.quantityKg), unitCost: Number(rowDraft.unitCost) }),
      });
      setEditingRow(null);
      await load();
    } finally {
      setRowSaving(false);
    }
  }

  async function deleteRow(ingId: string) {
    setDeletingId(ingId);
    setDeleteErr("");
    try {
      await apiFetch(`/feed-production/formulas/${params.id}/ingredients/${ingId}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      await load();
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function addIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/feed-production/formulas/${params.id}/ingredients`, {
      method: "POST",
      body: JSON.stringify({ ingredientId: ingredient.ingredientId || options.rawMaterials[0]?.id, quantityKg: Number(ingredient.quantityKg), unitCost: Number(ingredient.unitCost) })
    });
    setIngredient({ ingredientId: "", quantityKg: "", unitCost: "" });
    await load();
  }

  async function createVersion() {
    await apiFetch(`/feed-production/formulas/${params.id}/versions`, { method: "POST", body: JSON.stringify({ status: "ACTIVE", notes: "Version created from current formula ingredients" }) });
    await load();
  }

  async function archiveFormula() {
    setArchiving(true);
    setArchiveErr("");
    try {
      await apiFetch(`/feed-production/formulas/${params.id}`, { method: "PATCH", body: JSON.stringify({ status: "INACTIVE" }) });
      await load();
    } catch (e: unknown) {
      setArchiveErr(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiving(false);
    }
  }

  async function restoreFormula() {
    setArchiving(true);
    setArchiveErr("");
    try {
      await apiFetch(`/feed-production/formulas/${params.id}`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) });
      await load();
    } catch (e: unknown) {
      setArchiveErr(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setArchiving(false);
    }
  }

  async function deleteFormula() {
    setDeletingFormula(true);
    setDeleteFormulaErr("");
    try {
      await apiFetch(`/feed-production/formulas/${params.id}`, { method: "DELETE" });
      router.push("/feed-production/formulas");
    } catch (e: unknown) {
      setDeleteFormulaErr(e instanceof Error ? e.message : "Delete failed");
      setDeletingFormula(false);
    }
  }

  const title = mode === "costing" ? "Formula Costing" : mode === "versions" ? "Formula Version History" : formula?.name ?? "Formula Details";

  return (
    <FeedMillShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{title}</h1>
            {formula?.status && <StatusBadge status={formula.status} />}
          </div>
          <p className="mt-0.5 text-sm text-ink/50">Formula ingredients, cost per 100kg, cost per 50kg bag, and version history.</p>
        </div>
        {mode === "details" && !editingHeader && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={openHeaderEdit}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-brand/30 hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            {formula?.status === "INACTIVE" ? (
              <button
                onClick={restoreFormula}
                disabled={archiving}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> {archiving ? "Restoring…" : "Restore"}
              </button>
            ) : (
              <button
                onClick={archiveFormula}
                disabled={archiving}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
              >
                {archiving ? "Archiving…" : "Archive"}
              </button>
            )}
            {formula?.status === "INACTIVE" && (
              confirmDeleteFormula ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-ink/50">Delete permanently?</span>
                  <button
                    onClick={deleteFormula}
                    disabled={deletingFormula}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> {deletingFormula ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => { setConfirmDeleteFormula(false); setDeleteFormulaErr(""); }}
                    className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/50 transition hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteFormula(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                </button>
              )
            )}
          </div>
        )}
      </div>
      {(archiveErr || deleteFormulaErr) && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{archiveErr || deleteFormulaErr}</span>
          <button onClick={() => { setArchiveErr(""); setDeleteFormulaErr(""); }} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Header edit panel */}
      {editingHeader && (
        <div className="mb-6 rounded-2xl border border-brand/30 bg-brand/5 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-ink">Edit Formula Details</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Formula Name</label>
              <input
                value={headerDraft.name}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, name: e.target.value }))}
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Target Batch (kg)</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={headerDraft.targetBatchKg}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, targetBatchKg: e.target.value }))}
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveHeader} disabled={headerSaving} className="app-button-primary">
              {headerSaving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => setEditingHeader(false)} className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/50 transition hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          ["Target kg", formula?.targetBatchKg],
          ["Ingredient cost", costing?.ingredientCost ?? formula?.costing?.ingredientCost],
          ["Cost / 100kg", costing?.costPer100Kg ?? formula?.costing?.costPer100Kg],
          ["Cost / 50kg bag", costing?.costPer50KgBag ?? formula?.costing?.costPer50KgBag]
        ].map(([label, value]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm text-ink/65">{label}</p>
            <strong className="mt-3 block text-xl font-semibold">{number(value)}</strong>
          </article>
        ))}
      </section>

      {mode === "versions" ? (
        <>
          <button className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={createVersion}>
            <RotateCw aria-hidden className="h-4 w-4" /> Create version
          </button>
          <DataTable rows={formula?.versions ?? []} empty="No versions found" columns={[
            { key: "version", label: "Version", render: (row) => `v${row.versionNo}` },
            { key: "status", label: "Status", render: (row) => row.status },
            { key: "cost100", label: "Cost / 100kg", render: (row) => money(row.costPer100Kg) },
            { key: "cost50", label: "Cost / 50kg", render: (row) => money(row.costPer50KgBag) },
            { key: "created", label: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() }
          ]} />
        </>
      ) : (
        <>
          {/* Ingredient table */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 className="text-sm font-bold text-ink">Ingredient List</h3>
              {(formula?.ingredients?.length ?? 0) > 0 && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                  {formula?.ingredients?.length} ingredient{(formula?.ingredients?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wide text-ink/40">
                    <th className="px-5 py-2.5">#</th>
                    <th className="py-2.5 pr-4">Ingredient</th>
                    <th className="py-2.5 pr-4">SKU</th>
                    <th className="py-2.5 pr-4 text-right">kg per batch</th>
                    <th className="py-2.5 pr-4 text-right">Qty per kg</th>
                    <th className="py-2.5 pr-4 text-right">Qty per Bag (50kg)</th>
                    <th className="py-2.5 pr-4 text-right">Price (GHS/kg)</th>
                    <th className="py-2.5 pr-4 text-right">Amount (GHS)</th>
                    <th className="py-2.5 pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {(formula?.ingredients ?? []).length === 0 ? (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-ink/40">No ingredients yet — add below</td></tr>
                  ) : (
                    (formula?.ingredients ?? []).map((ing, idx) => {
                      const targetBatch = Number(formula?.targetBatchKg || 100);
                      const isEditing = editingRow === ing.id;
                      const kgVal = isEditing ? Number(rowDraft.quantityKg) : Number(ing.quantityKg);
                      const costVal = isEditing ? Number(rowDraft.unitCost) : Number(ing.unitCost);
                      const qtyPerKg = kgVal / targetBatch;
                      const qtyPerBag = qtyPerKg * 50;
                      return (
                        <tr key={ing.id} className={`border-b border-line/40 last:border-0 ${isEditing ? "bg-brand/5" : "hover:bg-field/30"}`}>
                          <td className="px-5 py-2.5 text-xs font-semibold text-ink/30">{idx + 1}</td>
                          <td className="py-2.5 pr-4 font-semibold text-ink">{ing.ingredient?.name ?? "—"}</td>
                          <td className="py-2.5 pr-4">
                            <span className="rounded bg-field px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink/50">{ing.ingredient?.sku ?? "—"}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-right">
                            {isEditing ? (
                              <input
                                type="number" min="0" step="0.001" autoFocus
                                value={rowDraft.quantityKg}
                                onChange={(e) => setRowDraft((d) => ({ ...d, quantityKg: e.target.value }))}
                                className="w-24 rounded-lg border border-brand/40 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                              />
                            ) : number(ing.quantityKg)}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-ink/60">{qtyPerKg.toLocaleString("en-GH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</td>
                          <td className="py-2.5 pr-4 text-right text-ink/60">{number(qtyPerBag)} kg</td>
                          <td className="py-2.5 pr-4 text-right text-ink/60">
                            {isEditing ? (
                              <input
                                type="number" min="0" step="0.01"
                                value={rowDraft.unitCost}
                                onChange={(e) => setRowDraft((d) => ({ ...d, unitCost: e.target.value }))}
                                className="w-24 rounded-lg border border-brand/40 bg-white px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                              />
                            ) : number(ing.unitCost)}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold">{number(kgVal * costVal)}</td>
                          <td className="py-2 pr-5">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => saveRow(ing.id)}
                                  disabled={rowSaving}
                                  className="rounded-lg bg-brand px-2.5 py-1 text-xs font-bold text-white transition hover:bg-brand/90 disabled:opacity-50"
                                >
                                  {rowSaving ? "…" : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingRow(null)}
                                  className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink/50 transition hover:text-ink"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : confirmDeleteId === ing.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-xs text-ink/50">Remove?</span>
                                <button
                                  onClick={() => deleteRow(ing.id)}
                                  disabled={deletingId === ing.id}
                                  className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                                >
                                  {deletingId === ing.id ? "…" : "Yes, remove"}
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(null); setDeleteErr(""); }}
                                  className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink/50 transition hover:text-ink"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openRowEdit(ing)}
                                  title="Edit quantities"
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink/40 transition hover:bg-brand/10 hover:text-brand"
                                >
                                  <Pencil className="h-3 w-3" aria-hidden /> Edit
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(ing.id); setDeleteErr(""); }}
                                  title="Remove ingredient"
                                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink/40 transition hover:bg-red-50 hover:text-red-500"
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden /> Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {(formula?.ingredients?.length ?? 0) > 0 && (() => {
                  const totalKg = (formula?.ingredients ?? []).reduce((s, r) => s + Number(r.quantityKg), 0);
                  const totalCost = (formula?.ingredients ?? []).reduce((s, r) => s + Number(r.quantityKg) * Number(r.unitCost), 0);
                  return (
                    <tfoot>
                      <tr className="border-t-2 border-line bg-field/60 font-bold">
                        <td colSpan={3} className="px-5 py-2.5 text-xs uppercase tracking-wide text-ink/40">Totals</td>
                        <td className="py-2.5 pr-4 text-right">{number(totalKg)} kg</td>
                        <td className="py-2.5 pr-4" />
                        <td className="py-2.5 pr-4" />
                        <td className="py-2.5 pr-4" />
                        <td className="py-2.5 pr-4 text-right text-brand">{number(totalCost)} GHS</td>
                        <td className="py-2.5 pr-5" />
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>

          {deleteErr && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <CircleAlert className="h-4 w-4 shrink-0" />
              <span>{deleteErr}</span>
              <button onClick={() => setDeleteErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* Add ingredient */}
          <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
            <h3 className="mb-4 text-sm font-bold text-ink">Add Ingredient</h3>
            <form onSubmit={addIngredient} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Ingredient *</label>
                <select
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={ingredient.ingredientId}
                  onChange={(e) => setIngredient({ ...ingredient, ingredientId: e.target.value })}
                  required
                >
                  <option value="">— select ingredient —</option>
                  {options.rawMaterials.map((m) => (
                    <option key={m.id} value={m.id}>{m.sku} — {m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">kg per batch *</label>
                <input
                  type="number" min="0" step="0.001" required placeholder="0"
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={ingredient.quantityKg}
                  onChange={(e) => setIngredient({ ...ingredient, quantityKg: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Unit Cost (GHS/kg)</label>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={ingredient.unitCost}
                  onChange={(e) => setIngredient({ ...ingredient, unitCost: e.target.value })}
                />
              </div>
              <button type="submit" className="app-button-primary lg:mt-[22px] sm:col-span-2 lg:col-span-4 lg:w-max">
                <Plus className="h-4 w-4" /> Add ingredient
              </button>
            </form>
          </div>
        </>
      )}
    </FeedMillShell>
  );
}

export function FeedProductionOrdersPage({ create = false }: { create?: boolean }) {
  const options = useFeedOptions();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OrderFormState>({ productionSiteId: "", formulaId: "", plannedQuantityKg: "", scheduledDate: today(), rawMaterialWarehouseId: "", notes: "" });
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<OrderRow[]>>("/feed-production/orders");
      setRows(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitErr("");
    try {
      await apiFetch("/feed-production/orders", {
        method: "POST",
        body: JSON.stringify({
          productionSiteId: form.productionSiteId || options.productionSites[0]?.id,
          formulaId: form.formulaId || options.formulas[0]?.id,
          plannedQuantityKg: Number(form.plannedQuantityKg),
          scheduledDate: form.scheduledDate,
          rawMaterialWarehouseId: form.rawMaterialWarehouseId || options.warehouses[0]?.id,
          notes: form.notes || undefined
        })
      });
      setForm({ ...form, plannedQuantityKg: "", notes: "" });
      await load();
    } catch (err: unknown) {
      setSubmitErr((err as Error)?.message ?? "Failed to create order.");
    } finally {
      setSubmitting(false);
    }
  }

  async function approveOrder(id: string) {
    setActionErr("");
    try {
      await apiFetch(`/feed-production/orders/${id}/approve`, { method: "PATCH" });
      await load();
    } catch (err: unknown) {
      setActionErr((err as Error)?.message ?? "Failed to approve order.");
    }
  }

  return (
    <FeedMillShell>
      <PageHeader title={create ? "Create Production Order" : "Feed Production Orders"} subtitle="Plan, approve, and monitor feed mill production orders." />
      {actionErr && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" /><span>{actionErr}</span>
          <button onClick={() => setActionErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {create ? (
        <>
          {submitErr && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              <CircleAlert className="h-4 w-4 shrink-0" /><span>{submitErr}</span>
              <button onClick={() => setSubmitErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}
          <OrderForm options={options} form={form} setForm={setForm} submit={submit} submitting={submitting} />
        </>
      ) : (
        <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/feed-production/orders/create">
          <Plus aria-hidden className="h-4 w-4" /> Create order
        </Link>
      )}
      <OrderTable rows={rows} loading={loading} onApprove={approveOrder} />
    </FeedMillShell>
  );
}

function OrderForm({ options, form, setForm, submit, submitting }: { options: FeedOptions; form: OrderFormState; setForm: (form: OrderFormState) => void; submit: (event: FormEvent<HTMLFormElement>) => void; submitting?: boolean }) {
  return (
    <form onSubmit={submit} className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-panel">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Production site *" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
        <SelectField label="Formula *" value={form.formulaId || options.formulas[0]?.id || ""} options={options.formulas} onChange={(value) => setForm({ ...form, formulaId: value })} />
        <SelectField label="Raw material warehouse" value={form.rawMaterialWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, rawMaterialWarehouseId: value })} />
        <FormField label="Planned quantity (kg) *"><input className={inputClass} type="number" min="0.001" step="0.001" value={form.plannedQuantityKg} onChange={(event) => setForm({ ...form, plannedQuantityKg: event.target.value })} required /></FormField>
        <FormField label="Scheduled date *"><input className={inputClass} type="date" value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} required /></FormField>
        <FormField label="Notes"><input className={inputClass} placeholder="Optional notes…" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FormField>
      </div>
      <p className="mb-4 mt-3 text-xs text-ink/45">Orders are created as DRAFT. Use the Approve action on the orders list to advance the workflow.</p>
      <div className="flex items-center justify-between gap-4">
        <Link href="/feed-production/orders" className="app-button-secondary">Cancel</Link>
        <button type="submit" disabled={submitting} className="app-button-primary min-w-[160px]">
          {submitting ? "Creating…" : "Create order"}
        </button>
      </div>
    </form>
  );
}

function OrderTable({ rows, loading, onApprove }: { rows: OrderRow[]; loading?: boolean; onApprove?: (id: string) => Promise<void> }) {
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setApprovingId(id);
    try { await onApprove?.(id); } finally { setApprovingId(null); }
  }

  return (
    <DataTable rows={rows} loading={loading} empty="No feed production orders found" columns={[
      { key: "order", label: "Order #", render: (row) => <span className="font-mono text-xs font-semibold">{row.orderNumber}</span> },
      { key: "site", label: "Site", render: (row) => row.productionSite?.name ?? "-" },
      { key: "formula", label: "Formula", render: (row) => row.formula?.name ?? "-" },
      { key: "planned", label: "Planned kg", render: (row) => number(row.plannedQuantityKg) },
      { key: "date", label: "Scheduled", render: (row) => new Date(row.scheduledDate).toLocaleDateString() },
      { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
      { key: "batch", label: "Batch", render: (row) => row.batches?.[0] ? <Link className="font-semibold text-brand" href={`/feed-production/batches/${row.batches[0].id}`}>{row.batches[0].batchNumber}</Link> : "-" },
      {
        key: "actions", label: "",
        render: (row) => (
          <div className="flex items-center gap-1">
            {row.status === "DRAFT" && onApprove && (
              <button onClick={() => handleApprove(row.id)} disabled={approvingId === row.id} className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50">
                {approvingId === row.id ? "…" : "Approve"}
              </button>
            )}
            {(row.status === "APPROVED" || row.status === "IN_PROGRESS") && (
              <Link href={`/feed-production/batches/create?orderId=${row.id}`} className="rounded-lg bg-brand px-2.5 py-1 text-xs font-bold text-white transition hover:bg-brand/90">
                Post batch
              </Link>
            )}
          </div>
        )
      }
    ]} />
  );
}

export function FeedBatchListPage() {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ApiEnvelope<BatchRow[]>>("/feed-production/batches")
      .then((res) => setRows(res.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const totalKg = rows.reduce((s, r) => s + Number(r.producedQuantityKg), 0);
  const completedCount = rows.filter((r) => r.status === "COMPLETED").length;

  return (
    <FeedMillShell>
      <PageHeader title="Production Batches" subtitle="All feed production batches — produced quantities, costs, margins, and status." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Total batches", rows.length],
          ["Completed", completedCount],
          ["Total produced (kg)", number(totalKg)],
          ["Avg margin", rows.length ? `${(rows.reduce((s, r) => s + (r.metrics?.profitMargin ?? 0), 0) / rows.length).toFixed(1)}%` : "-"],
        ].map(([lbl, val]) => (
          <article key={lbl} className="rounded-xl border border-line bg-white p-4 shadow-panel">
            <p className="text-xs text-ink/50">{lbl}</p>
            <strong className="mt-1.5 block text-xl font-bold text-ink">{val}</strong>
          </article>
        ))}
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No production batches found"
        columns={[
          { key: "batch", label: "Batch #", render: (r) => <Link className="font-semibold text-brand" href={`/feed-production/batches/${r.id}`}>{r.batchNumber}</Link> },
          { key: "product", label: "Product", render: (r) => r.finishedProduct?.name ?? "-" },
          { key: "site", label: "Site", render: (r) => r.productionSite?.name ?? "-" },
          { key: "date", label: "Date", render: (r) => r.productionDate ? new Date(r.productionDate).toLocaleDateString() : "-" },
          { key: "produced", label: "Produced (kg)", render: (r) => number(r.producedQuantityKg) },
          { key: "wastage", label: "Wastage (kg)", render: (r) => number(r.wastageKg) },
          { key: "margin", label: "Margin", render: (r) => `${r.metrics?.profitMargin ?? 0}%` },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </FeedMillShell>
  );
}

type ApprovedOrder = {
  id: string;
  orderNumber: string;
  plannedQuantityKg: string | number;
  status: string;
  formula?: { name: string; code: string };
  productionSite?: { name: string; code: string };
};

export function FeedBatchCreatePage() {
  const options = useFeedOptions();
  const router = useRouter();
  const [approvedOrders, setApprovedOrders] = useState<ApprovedOrder[]>([]);
  const [form, setForm] = useState({
    productionOrderId: "",
    rawMaterialWarehouseId: "",
    finishedWarehouseId: "",
    batchNumber: "",
    producedQuantityKg: "",
    wastageKg: "",
    productionDate: today(),
    laborCost: "",
    packagingCost: "",
    overheadCost: "",
    expectedSalesValue: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<ApprovedOrder[]>>("/feed-production/orders?status=APPROVED")
      .then((res) => setApprovedOrders(res.data))
      .catch(() => undefined);
  }, []);

  // Pre-select order from query param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qp = new URLSearchParams(window.location.search);
    const orderId = qp.get("orderId");
    if (orderId) setForm((f) => ({ ...f, productionOrderId: orderId }));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitErr("");
    try {
      const res = await apiFetch<ApiEnvelope<{ id: string; batchNumber: string }>>("/feed-production/batches", {
        method: "POST",
        body: JSON.stringify({
          productionOrderId: form.productionOrderId || approvedOrders[0]?.id,
          rawMaterialWarehouseId: form.rawMaterialWarehouseId || options.warehouses[0]?.id,
          finishedWarehouseId: form.finishedWarehouseId || options.warehouses[0]?.id,
          batchNumber: form.batchNumber || undefined,
          producedQuantityKg: Number(form.producedQuantityKg),
          wastageKg: Number(form.wastageKg) || undefined,
          productionDate: form.productionDate || undefined,
          laborCost: Number(form.laborCost) || undefined,
          packagingCost: Number(form.packagingCost) || undefined,
          overheadCost: Number(form.overheadCost) || undefined,
          expectedSalesValue: Number(form.expectedSalesValue) || undefined,
        }),
      });
      router.push(`/feed-production/batches/${res.data.id}`);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Batch creation failed");
      setSubmitting(false);
    }
  }

  const selectedOrder = approvedOrders.find((o) => o.id === form.productionOrderId);

  return (
    <FeedMillShell>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/feed-production/batches" className="inline-flex items-center gap-1 text-sm font-semibold text-ink/40 hover:text-brand">
          <ArrowLeft className="h-3.5 w-3.5" /> Batches
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Post Production Batch</h1>
        <p className="mt-0.5 text-sm text-ink/50">Record produced quantities, costs, and link to an approved production order.</p>
      </div>

      {submitErr && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" /><span>{submitErr}</span>
          <button onClick={() => setSubmitErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-4 text-sm font-bold text-ink">Production Order</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Production order *</label>
              <select
                required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.productionOrderId}
                onChange={(e) => setForm((f) => ({ ...f, productionOrderId: e.target.value }))}
              >
                <option value="">— select approved order —</option>
                {approvedOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.formula?.name ?? ""} · {number(o.plannedQuantityKg)} kg
                  </option>
                ))}
              </select>
              {approvedOrders.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-600">No approved orders found. Approve an order first.</p>
              )}
            </div>
            {selectedOrder && (
              <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 md:col-span-2">
                <p className="text-xs font-semibold text-brand">{selectedOrder.orderNumber}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{selectedOrder.formula?.name ?? ""}</p>
                <p className="text-xs text-ink/50">{selectedOrder.productionSite?.name ?? ""} · {number(selectedOrder.plannedQuantityKg)} kg planned</p>
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Raw material warehouse *</label>
              <select
                required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.rawMaterialWarehouseId}
                onChange={(e) => setForm((f) => ({ ...f, rawMaterialWarehouseId: e.target.value }))}
              >
                <option value="">— select warehouse —</option>
                {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Finished feed warehouse *</label>
              <select
                required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.finishedWarehouseId}
                onChange={(e) => setForm((f) => ({ ...f, finishedWarehouseId: e.target.value }))}
              >
                <option value="">— select warehouse —</option>
                {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Batch number (auto if blank)</label>
              <input
                type="text" placeholder="e.g. BATCH-2026-0012"
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.batchNumber}
                onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-4 text-sm font-bold text-ink">Production Quantities</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Produced quantity (kg) *</label>
              <input
                type="number" min="0.001" step="0.001" required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.producedQuantityKg}
                onChange={(e) => setForm((f) => ({ ...f, producedQuantityKg: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Wastage (kg)</label>
              <input
                type="number" min="0" step="0.001" placeholder="0"
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.wastageKg}
                onChange={(e) => setForm((f) => ({ ...f, wastageKg: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Production date</label>
              <input
                type="date"
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={form.productionDate}
                onChange={(e) => setForm((f) => ({ ...f, productionDate: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
          <h3 className="mb-1 text-sm font-bold text-ink">Production Costs <span className="font-normal text-ink/40">(optional — record separately later if unknown now)</span></h3>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {(["laborCost", "packagingCost", "overheadCost", "expectedSalesValue"] as const).map((field) => (
              <div key={field}>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">
                  {field === "laborCost" ? "Labor cost (GHS)" : field === "packagingCost" ? "Packaging cost (GHS)" : field === "overheadCost" ? "Overhead cost (GHS)" : "Expected sales value (GHS)"}
                </label>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pb-8">
          <Link href="/feed-production/batches" className="rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink/60 transition hover:text-ink">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="app-button-primary min-w-[200px]">
            <Factory className="h-4 w-4" aria-hidden /> {submitting ? "Posting batch…" : "Post production batch"}
          </button>
        </div>
      </form>
    </FeedMillShell>
  );
}

type BatchLabel = {
  title: string;
  batchNumber: string;
  product: string;
  feedType: string;
  productionSite: string;
  productionDate: string;
  producedQuantityKg: number;
  packageSizeKg: number;
  packageCount: number;
  status: string;
};

export function FeedBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const options = useFeedOptions();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [label, setLabel] = useState<BatchLabel | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [qcErr, setQcErr] = useState("");

  // External sale form
  const [saleForm, setSaleForm] = useState({ fromWarehouseId: "", quantityKg: "", unitPrice: "", customerName: "" });
  const [submittingSale, setSubmittingSale] = useState(false);
  const [saleErr, setSaleErr] = useState("");

  // Production cost form
  const [costForm, setCostForm] = useState({ laborCost: "", packagingCost: "", overheadCost: "", expectedSalesValue: "" });
  const [submittingCost, setSubmittingCost] = useState(false);
  const [costErr, setCostErr] = useState("");

  async function load() {
    const res = await apiFetch<ApiEnvelope<BatchDetail>>(`/feed-production/batches/${params.id}`);
    setBatch(res.data);
  }

  useEffect(() => { load().catch(() => undefined); }, [params.id]);

  async function fetchLabel() {
    const res = await apiFetch<ApiEnvelope<BatchLabel>>(`/feed-production/batches/${params.id}/label`);
    setLabel(res.data);
    setShowLabel(true);
  }

  async function updateQcStatus(qcId: string, status: "APPROVED" | "FAILED" | "PASSED") {
    setQcErr("");
    try {
      await apiFetch(`/feed-production/quality-checks/${qcId}/approve`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (e: unknown) {
      setQcErr((e as Error)?.message ?? "Failed to update QC status.");
    }
  }

  async function submitSale(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmittingSale(true);
    setSaleErr("");
    try {
      await apiFetch("/feed-production/external-sales", {
        method: "POST",
        body: JSON.stringify({
          productionBatchId: params.id,
          fromWarehouseId: saleForm.fromWarehouseId || options.warehouses[0]?.id,
          quantityKg: Number(saleForm.quantityKg),
          unitPrice: Number(saleForm.unitPrice),
          customerName: saleForm.customerName || undefined,
        }),
      });
      setSaleForm({ fromWarehouseId: "", quantityKg: "", unitPrice: "", customerName: "" });
      await load();
    } catch (e: unknown) {
      setSaleErr((e as Error)?.message ?? "Sale recording failed.");
    } finally {
      setSubmittingSale(false);
    }
  }

  async function submitCost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmittingCost(true);
    setCostErr("");
    try {
      await apiFetch("/feed-production/costs", {
        method: "POST",
        body: JSON.stringify({
          productionBatchId: params.id,
          laborCost: Number(costForm.laborCost) || 0,
          packagingCost: Number(costForm.packagingCost) || 0,
          overheadCost: Number(costForm.overheadCost) || 0,
          expectedSalesValue: Number(costForm.expectedSalesValue) || 0,
        }),
      });
      setCostForm({ laborCost: "", packagingCost: "", overheadCost: "", expectedSalesValue: "" });
      await load();
    } catch (e: unknown) {
      setCostErr((e as Error)?.message ?? "Cost recording failed.");
    } finally {
      setSubmittingCost(false);
    }
  }

  const b = batch;

  return (
    <FeedMillShell>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/feed-production/batches" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink/40 hover:text-brand">
            <ArrowLeft className="h-3 w-3" /> Batches
          </Link>
          <p className="app-kicker">Feed Mill</p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink">{b?.batchNumber ?? "Batch Details"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={b?.status ?? ""} />
            {b?.productionSite && <span className="text-sm text-ink/50">{b.productionSite.name}</span>}
            {b?.finishedProduct && <span className="text-sm text-ink/50">· {b.finishedProduct.name}</span>}
            {b?.productionDate && <span className="text-sm text-ink/40">· {new Date(b.productionDate).toLocaleDateString()}</span>}
          </div>
        </div>
        <button
          onClick={() => (showLabel ? setShowLabel(false) : fetchLabel())}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-brand/30 hover:text-brand"
        >
          <Printer className="h-4 w-4" aria-hidden /> {showLabel ? "Hide label" : "View label"}
        </button>
      </div>

      {/* Batch label card */}
      {showLabel && label && (
        <div className="mb-6 overflow-hidden rounded-2xl border-2 border-brand/20 bg-white shadow-panel print:border-black">
          <div className="bg-brand px-6 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">Jokas Agri — Feed Mill</p>
            <p className="text-lg font-bold text-white">{label.title}</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
            {[
              ["Batch #", label.batchNumber],
              ["Product", label.product],
              ["Feed Type", label.feedType?.replace(/_/g, " ")],
              ["Production Site", label.productionSite],
              ["Production Date", label.productionDate ? new Date(label.productionDate).toLocaleDateString() : "-"],
              ["Status", label.status],
              ["Produced (kg)", number(label.producedQuantityKg)],
              ["Pkg size (kg)", number(label.packageSizeKg)],
              ["Package count", String(label.packageCount)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">{k}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {([
          ["Produced (kg)", number(b?.producedQuantityKg)],
          ["Wastage (kg)", number(b?.wastageKg)],
          ["Total cost", money(b?.metrics?.totalCost)],
          ["Profit margin", `${b?.metrics?.profitMargin ?? 0}%`]
        ] as [string, string][]).map(([lbl, val]) => (
          <article key={lbl} className="rounded-xl border border-line bg-white p-4 shadow-panel">
            <p className="text-xs text-ink/50">{lbl}</p>
            <strong className="mt-1.5 block text-xl font-bold text-ink">{val}</strong>
          </article>
        ))}
      </div>

      {/* Production order reference */}
      {b?.productionOrder && (
        <div className="mb-6 rounded-xl border border-line bg-white px-5 py-3.5 shadow-panel">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/40">Production Order</span>
          <span className="ml-3 font-mono text-sm font-semibold text-ink">{b.productionOrder.orderNumber}</span>
          <span className="ml-3 text-sm text-ink/50">({number(b.productionOrder.plannedQuantityKg)} kg planned)</span>
        </div>
      )}

      {/* Raw material usage */}
      <BatchSection title="Raw Material Usage">
        <DataTable rows={b?.rawMaterialUsages ?? []} empty="No raw material usage recorded" columns={[
          { key: "name", label: "Ingredient", render: (r) => r.rawMaterial?.name ?? "-" },
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.rawMaterial?.sku ?? "-"}</span> },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "cost", label: "Unit cost", render: (r) => money(r.unitCost) },
          { key: "total", label: "Line cost", render: (r) => money(Number(r.quantityKg) * Number(r.unitCost)) },
          { key: "wastage", label: "Wastage (kg)", render: (r) => number(r.wastageKg) }
        ]} />
      </BatchSection>

      {/* Quality checks */}
      {qcErr && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" /><span>{qcErr}</span>
          <button onClick={() => setQcErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      <BatchSection title="Quality Checks">
        <DataTable rows={b?.qualityChecks ?? []} empty="No quality checks recorded" columns={[
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "moisture", label: "Moisture %", render: (r) => r.moisturePercent != null ? `${r.moisturePercent}%` : "-" },
          { key: "protein", label: "Protein %", render: (r) => r.proteinPercent != null ? `${r.proteinPercent}%` : "-" },
          { key: "notes", label: "Notes", render: (r) => r.textureNotes ?? "-" },
          { key: "date", label: "Checked", render: (r) => r.checkedAt ? new Date(r.checkedAt).toLocaleDateString() : "-" },
          {
            key: "actions", label: "",
            render: (r) => r.status === "PENDING" ? (
              <div className="flex items-center gap-1">
                <button onClick={() => updateQcStatus(r.id, "APPROVED")} className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-600">Approve</button>
                <button onClick={() => updateQcStatus(r.id, "FAILED")} className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-600">Fail</button>
              </div>
            ) : null
          }
        ]} />
      </BatchSection>

      {/* Finished feed stock */}
      <BatchSection title="Finished Feed Stock">
        <DataTable rows={b?.finishedFeedStocks ?? []} empty="No finished feed stock recorded" columns={[
          { key: "wh", label: "Warehouse", render: (r) => r.warehouse?.name ?? "-" },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "bags", label: "Bags (50 kg)", render: (r) => r.bag50KgCount },
          { key: "cost", label: "Unit cost", render: (r) => money(r.unitCost) }
        ]} />
      </BatchSection>

      {/* Packaging records */}
      <BatchSection title="Packaging Records">
        <DataTable rows={b?.packagingRecords ?? []} empty="No packaging records" columns={[
          { key: "size", label: "Bag size (kg)", render: (r) => number(r.packageSizeKg) },
          { key: "count", label: "Bags", render: (r) => r.packageCount },
          { key: "total", label: "Total kg", render: (r) => number(Number(r.packageSizeKg) * r.packageCount) },
          { key: "date", label: "Packaged", render: (r) => r.packagedAt ? new Date(r.packagedAt).toLocaleDateString() : "-" }
        ]} />
      </BatchSection>

      {/* Internal transfers */}
      <BatchSection title="Internal Transfers">
        <DataTable rows={b?.internalTransfers ?? []} empty="No transfers recorded" columns={[
          { key: "from", label: "From warehouse", render: (r) => r.fromWarehouse?.name ?? "-" },
          { key: "farm", label: "To farm", render: (r) => r.toFarm?.name ?? "-" },
          { key: "house", label: "To house", render: (r) => r.toPoultryHouse?.name ?? "-" },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "date", label: "Date", render: (r) => r.transferDate ? new Date(r.transferDate).toLocaleDateString() : "-" }
        ]} />
      </BatchSection>

      {/* External sale recording */}
      <BatchSection title="Record External Sale">
        {saleErr && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <CircleAlert className="h-4 w-4 shrink-0" /><span>{saleErr}</span>
            <button onClick={() => setSaleErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        <form onSubmit={submitSale} className="rounded-xl border border-line bg-white p-4 shadow-panel">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">From warehouse *</label>
              <select
                required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={saleForm.fromWarehouseId}
                onChange={(e) => setSaleForm((f) => ({ ...f, fromWarehouseId: e.target.value }))}
              >
                <option value="">— select —</option>
                {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Quantity (kg) *</label>
              <input type="number" min="0.001" step="0.001" required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={saleForm.quantityKg}
                onChange={(e) => setSaleForm((f) => ({ ...f, quantityKg: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Unit price (GHS/kg) *</label>
              <input type="number" min="0" step="0.01" required
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={saleForm.unitPrice}
                onChange={(e) => setSaleForm((f) => ({ ...f, unitPrice: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink/55">Customer name</label>
              <input type="text" placeholder="optional"
                className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                value={saleForm.customerName}
                onChange={(e) => setSaleForm((f) => ({ ...f, customerName: e.target.value }))}
              />
            </div>
          </div>
          {saleForm.quantityKg && saleForm.unitPrice && (
            <p className="mt-2 text-xs text-ink/50">
              Sale value: <strong>{money(Number(saleForm.quantityKg) * Number(saleForm.unitPrice))}</strong>
            </p>
          )}
          <button type="submit" disabled={submittingSale} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50">
            <TrendingUp className="h-4 w-4" aria-hidden /> {submittingSale ? "Recording…" : "Record sale"}
          </button>
        </form>
      </BatchSection>

      {/* Production cost recording */}
      <BatchSection title="Record Production Costs">
        {costErr && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <CircleAlert className="h-4 w-4 shrink-0" /><span>{costErr}</span>
            <button onClick={() => setCostErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        <form onSubmit={submitCost} className="rounded-xl border border-line bg-white p-4 shadow-panel">
          <p className="mb-3 text-xs text-ink/45">Records a new cost entry for this batch. Raw material cost is computed automatically from usage records.</p>
          <div className="grid gap-4 md:grid-cols-4">
            {(["laborCost", "packagingCost", "overheadCost", "expectedSalesValue"] as const).map((field) => (
              <div key={field}>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">
                  {field === "laborCost" ? "Labor cost (GHS)" : field === "packagingCost" ? "Packaging cost (GHS)" : field === "overheadCost" ? "Overhead cost (GHS)" : "Expected sales value (GHS)"}
                </label>
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={costForm[field]}
                  onChange={(e) => setCostForm((f) => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button type="submit" disabled={submittingCost} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50">
            <Calculator className="h-4 w-4" aria-hidden /> {submittingCost ? "Recording…" : "Record costs"}
          </button>
        </form>
      </BatchSection>
    </FeedMillShell>
  );
}

type UsageRow = {
  id: string;
  quantityKg: string | number;
  unitCost: string | number;
  wastageKg: string | number;
  createdAt: string;
  rawMaterial?: { name: string; sku: string };
  productionBatch?: { batchNumber: string };
  productionSite?: { name: string };
};

export function FeedRawMaterialUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ApiEnvelope<UsageRow[]>>("/feed-production/raw-material-usage")
      .then((res) => setRows(res.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const totalKg = rows.reduce((s, r) => s + Number(r.quantityKg), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.quantityKg) * Number(r.unitCost), 0);
  const totalWastage = rows.reduce((s, r) => s + Number(r.wastageKg), 0);

  return (
    <FeedMillShell>
      <PageHeader title="Raw Material Usage" subtitle="Raw material issue, cost, and wastage records by batch." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Usage records", rows.length],
          ["Total consumed (kg)", number(totalKg)],
          ["Total wastage (kg)", number(totalWastage)],
          ["Total raw material cost", money(totalCost)],
        ].map(([lbl, val]) => (
          <article key={lbl} className="rounded-xl border border-line bg-white p-4 shadow-panel">
            <p className="text-xs text-ink/50">{lbl}</p>
            <strong className="mt-1.5 block text-xl font-bold text-ink">{val}</strong>
          </article>
        ))}
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No raw material usage records found"
        columns={[
          { key: "ingredient", label: "Ingredient", render: (r) => r.rawMaterial?.name ?? "-" },
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.rawMaterial?.sku ?? "-"}</span> },
          { key: "batch", label: "Batch", render: (r) => r.productionBatch?.batchNumber ?? "-" },
          { key: "site", label: "Site", render: (r) => r.productionSite?.name ?? "-" },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "unitCost", label: "Unit cost", render: (r) => money(r.unitCost) },
          { key: "lineCost", label: "Line cost", render: (r) => money(Number(r.quantityKg) * Number(r.unitCost)) },
          { key: "wastage", label: "Wastage (kg)", render: (r) => number(r.wastageKg) },
          { key: "date", label: "Date", render: (r) => new Date(r.createdAt).toLocaleDateString() },
        ]}
      />
    </FeedMillShell>
  );
}

type QcRow = {
  id: string;
  status: string;
  moisturePercent?: number | null;
  proteinPercent?: number | null;
  textureNotes?: string | null;
  checkedAt?: string;
  productionBatch?: { batchNumber: string };
};

export function FeedQualityControlPage() {
  const options = useFeedOptions();
  const [rows, setRows] = useState<QcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ productionBatchId: "", moisturePercent: "", proteinPercent: "", textureNotes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<QcRow[]>>("/feed-production/quality-checks");
      setRows(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitErr("");
    try {
      await apiFetch("/feed-production/quality-checks", {
        method: "POST",
        body: JSON.stringify({
          productionBatchId: form.productionBatchId || options.batches[0]?.id,
          moisturePercent: Number(form.moisturePercent) || undefined,
          proteinPercent: Number(form.proteinPercent) || undefined,
          textureNotes: form.textureNotes || undefined
        })
      });
      setForm({ productionBatchId: "", moisturePercent: "", proteinPercent: "", textureNotes: "" });
      await load();
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const pending = rows.filter((r) => r.status === "PENDING").length;

  return (
    <FeedMillShell>
      <PageHeader title="Feed Quality Control" subtitle="Record and approve feed quality checks for production batches." />
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>{pending}</strong> quality check{pending !== 1 ? "s" : ""} awaiting review — open the batch detail page to approve or fail.</span>
        </div>
      )}
      <div className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-panel">
        <h3 className="mb-4 text-sm font-bold text-ink">Record Quality Check</h3>
        {submitErr && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <CircleAlert className="h-4 w-4 shrink-0" /><span>{submitErr}</span>
            <button onClick={() => setSubmitErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-4">
          <SelectField label="Batch *" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((b) => ({ ...b, name: b.batchNumber }))} onChange={(v) => setForm({ ...form, productionBatchId: v })} />
          <FormField label="Moisture %"><input className={inputClass} type="number" step="0.01" min="0" max="100" placeholder="e.g. 13.5" value={form.moisturePercent} onChange={(e) => setForm({ ...form, moisturePercent: e.target.value })} /></FormField>
          <FormField label="Protein %"><input className={inputClass} type="number" step="0.01" min="0" max="100" placeholder="e.g. 18.0" value={form.proteinPercent} onChange={(e) => setForm({ ...form, proteinPercent: e.target.value })} /></FormField>
          <FormField label="Texture notes"><input className={inputClass} placeholder="e.g. Fine mash, uniform colour" value={form.textureNotes} onChange={(e) => setForm({ ...form, textureNotes: e.target.value })} /></FormField>
          <div className="flex items-end gap-4 md:col-span-4">
            <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              <PackageCheck aria-hidden className="h-4 w-4" /> {submitting ? "Recording…" : "Record quality check"}
            </button>
            <p className="text-xs text-ink/40">Checks start as PENDING — approve or fail from the batch detail page.</p>
          </div>
        </form>
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No quality checks recorded"
        columns={[
          { key: "batch", label: "Batch", render: (r) => r.productionBatch?.batchNumber ?? "-" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "moisture", label: "Moisture %", render: (r) => r.moisturePercent != null ? `${r.moisturePercent}%` : "-" },
          { key: "protein", label: "Protein %", render: (r) => r.proteinPercent != null ? `${r.proteinPercent}%` : "-" },
          { key: "texture", label: "Texture notes", render: (r) => r.textureNotes ?? "-" },
          { key: "date", label: "Checked", render: (r) => r.checkedAt ? new Date(r.checkedAt).toLocaleDateString() : "-" },
        ]}
      />
    </FeedMillShell>
  );
}

type StockRow = {
  id: string;
  quantityKg: string | number;
  bag50KgCount: number;
  unitCost: string | number;
  productionBatch?: { batchNumber: string };
  warehouse?: { name: string; code: string };
  finishedProduct?: { name: string; sku: string };
};

export function FinishedFeedInventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<ApiEnvelope<StockRow[]>>("/feed-production/finished-feed-stock")
      .then((res) => setRows(res.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const totalKg = rows.reduce((s, r) => s + Number(r.quantityKg), 0);
  const totalBags = rows.reduce((s, r) => s + r.bag50KgCount, 0);
  const totalValue = rows.reduce((s, r) => s + Number(r.quantityKg) * Number(r.unitCost), 0);

  return (
    <FeedMillShell>
      <PageHeader title="Finished Feed Inventory" subtitle="Current finished feed stock by warehouse, batch, product, bag count, and unit cost." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Stock lines", rows.length],
          ["Total (kg)", number(totalKg)],
          ["Total bags (50kg)", totalBags],
          ["Stock value", money(totalValue)],
        ].map(([lbl, val]) => (
          <article key={lbl} className="rounded-xl border border-line bg-white p-4 shadow-panel">
            <p className="text-xs text-ink/50">{lbl}</p>
            <strong className="mt-1.5 block text-xl font-bold text-ink">{val}</strong>
          </article>
        ))}
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No finished feed stock found"
        columns={[
          { key: "batch", label: "Batch", render: (r) => r.productionBatch?.batchNumber ?? "-" },
          { key: "product", label: "Product", render: (r) => r.finishedProduct?.name ?? "-" },
          { key: "warehouse", label: "Warehouse", render: (r) => r.warehouse?.name ?? "-" },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "bags", label: "Bags (50kg)", render: (r) => String(r.bag50KgCount) },
          { key: "unitCost", label: "Unit cost", render: (r) => money(r.unitCost) },
          { key: "lineValue", label: "Line value", render: (r) => money(Number(r.quantityKg) * Number(r.unitCost)) },
        ]}
      />
    </FeedMillShell>
  );
}

type TransferRow = {
  id: string;
  quantityKg: string | number;
  transferDate?: string;
  notes?: string;
  productionBatch?: { batchNumber: string };
  fromWarehouse?: { name: string; code: string };
  toFarm?: { name: string };
  toPoultryHouse?: { name: string } | null;
};

export function InternalFeedTransferPage() {
  const options = useFeedOptions();
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ productionBatchId: "", fromWarehouseId: "", toFarmId: "", toPoultryHouseId: "", quantityKg: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const houses = useMemo(() => options.poultryHouses.filter((house) => !form.toFarmId || house.farmId === form.toFarmId), [options.poultryHouses, form.toFarmId]);

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<TransferRow[]>>("/feed-production/transfers");
      setRows(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitErr("");
    try {
      await apiFetch("/feed-production/transfers", {
        method: "POST",
        body: JSON.stringify({
          productionBatchId: form.productionBatchId || options.batches[0]?.id,
          fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id,
          toFarmId: form.toFarmId || options.farms[0]?.id,
          toPoultryHouseId: form.toPoultryHouseId || houses[0]?.id || undefined,
          quantityKg: Number(form.quantityKg),
          notes: form.notes || undefined
        })
      });
      setForm({ productionBatchId: "", fromWarehouseId: "", toFarmId: "", toPoultryHouseId: "", quantityKg: "", notes: "" });
      await load();
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }

  const totalTransferredKg = rows.reduce((s, r) => s + Number(r.quantityKg), 0);

  return (
    <FeedMillShell>
      <PageHeader title="Internal Feed Transfer" subtitle="Transfer finished feed from feed mill stores to assigned farms and poultry houses." />
      <div className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-panel">
        <h3 className="mb-4 text-sm font-bold text-ink">New Transfer</h3>
        {submitErr && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <CircleAlert className="h-4 w-4 shrink-0" /><span>{submitErr}</span>
            <button onClick={() => setSubmitErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-5">
          <SelectField label="Batch *" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((b) => ({ ...b, name: b.batchNumber }))} onChange={(v) => setForm({ ...form, productionBatchId: v })} />
          <SelectField label="From warehouse *" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(v) => setForm({ ...form, fromWarehouseId: v })} />
          <SelectField label="To farm *" value={form.toFarmId || options.farms[0]?.id || ""} options={options.farms} onChange={(v) => setForm({ ...form, toFarmId: v, toPoultryHouseId: "" })} />
          <SelectField label="To house" value={form.toPoultryHouseId || houses[0]?.id || ""} options={houses} onChange={(v) => setForm({ ...form, toPoultryHouseId: v })} />
          <FormField label="Quantity (kg) *"><input className={inputClass} type="number" min="0.001" step="0.001" required value={form.quantityKg} onChange={(e) => setForm({ ...form, quantityKg: e.target.value })} /></FormField>
          <div className="flex items-end md:col-span-5">
            <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? "Transferring…" : "Create transfer"}
            </button>
          </div>
        </form>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-ink">{rows.length} transfer{rows.length !== 1 ? "s" : ""}</span>
        <span className="text-sm text-ink/50">·</span>
        <span className="text-sm text-ink/60">{number(totalTransferredKg)} kg total</span>
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No transfers recorded"
        columns={[
          { key: "batch", label: "Batch", render: (r) => r.productionBatch?.batchNumber ?? "-" },
          { key: "from", label: "From warehouse", render: (r) => r.fromWarehouse?.name ?? "-" },
          { key: "farm", label: "To farm", render: (r) => r.toFarm?.name ?? "-" },
          { key: "house", label: "To house", render: (r) => r.toPoultryHouse?.name ?? "-" },
          { key: "qty", label: "Qty (kg)", render: (r) => number(r.quantityKg) },
          { key: "date", label: "Date", render: (r) => r.transferDate ? new Date(r.transferDate).toLocaleDateString() : "-" },
          { key: "notes", label: "Notes", render: (r) => r.notes ?? "-" },
        ]}
      />
    </FeedMillShell>
  );
}

export function FeedReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function download(reportPath: string, filename: string) {
    setDownloading(filename);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString();
      await downloadReport(`${reportPath}${qs ? `?${qs}` : ""}`, filename);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const reports = [
    { id: "summary", label: "Feed Production Summary", description: "Batches, quantities, costs, and margins across all production runs.", path: "/feed-production/reports/summary.csv", filename: "feed-production-summary.csv", icon: ChartBar },
  ];

  return (
    <FeedMillShell>
      <PageHeader title="Feed Production Reports" subtitle="Export feed formula, production, cost, quality, stock, and transfer reports." />
      <div className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-panel">
        <h3 className="mb-4 text-sm font-bold text-ink">Date Range Filter</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">From date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">To date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setStartDate(""); setEndDate(""); }}
              className="min-h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink/50 transition hover:text-ink"
            >
              Clear dates
            </button>
          </div>
        </div>
        {(startDate || endDate) && (
          <p className="mt-3 text-xs text-ink/50">
            Filtering:{" "}
            {startDate && endDate ? `${startDate} → ${endDate}` : startDate ? `from ${startDate}` : `until ${endDate}`}
          </p>
        )}
      </div>
      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" /><span>{err}</span>
          <button onClick={() => setErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const Icon = report.icon;
          const isDownloading = downloading === report.filename;
          return (
            <div key={report.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-panel">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <Icon className="h-5 w-5 text-brand" aria-hidden />
                </div>
                <div>
                  <p className="font-semibold text-ink">{report.label}</p>
                  <p className="mt-0.5 text-xs text-ink/50">{report.description}</p>
                </div>
              </div>
              <button
                onClick={() => download(report.path, report.filename)}
                disabled={isDownloading}
                className="mt-auto inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                {isDownloading ? "Downloading…" : "Download CSV"}
              </button>
            </div>
          );
        })}
      </div>
    </FeedMillShell>
  );
}

type PackagingRow = {
  id: string;
  packageSizeKg: string | number;
  packageCount: number;
  packagedAt?: string;
  productionBatch?: { batchNumber: string };
  productionSite?: { name: string };
};

export function FeedPackagingRecordPage() {
  const options = useFeedOptions();
  const [rows, setRows] = useState<PackagingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ productionBatchId: "", packageSizeKg: "50", packageCount: "", packagedAt: today() });
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch<ApiEnvelope<PackagingRow[]>>("/feed-production/packaging-records");
      setRows(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitErr("");
    try {
      await apiFetch("/feed-production/packaging-records", {
        method: "POST",
        body: JSON.stringify({
          productionBatchId: form.productionBatchId || options.batches[0]?.id,
          packageSizeKg: Number(form.packageSizeKg),
          packageCount: Number(form.packageCount),
          packagedAt: form.packagedAt || undefined,
        }),
      });
      setForm({ productionBatchId: "", packageSizeKg: "50", packageCount: "", packagedAt: today() });
      await load();
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FeedMillShell>
      <PageHeader title="Packaging Records" subtitle="Record and track feed packaging — bag counts, sizes, and dates." />
      <div className="mb-8 rounded-2xl border border-line bg-white p-5 shadow-panel">
        <h3 className="mb-4 text-sm font-bold text-ink">Record Packaging</h3>
        {submitErr && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <CircleAlert className="h-4 w-4 shrink-0" /><span>{submitErr}</span>
            <button onClick={() => setSubmitErr("")} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">Production Batch *</label>
            <select
              required
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              value={form.productionBatchId}
              onChange={(e) => setForm((f) => ({ ...f, productionBatchId: e.target.value }))}
            >
              <option value="">— select batch —</option>
              {options.batches.map((b) => (
                <option key={b.id} value={b.id}>{b.batchNumber} ({b.status})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">Package size (kg) *</label>
            <input
              type="number" min="0.001" step="0.001" required
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              value={form.packageSizeKg}
              onChange={(e) => setForm((f) => ({ ...f, packageSizeKg: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">Package count *</label>
            <input
              type="number" min="1" step="1" required
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              value={form.packageCount}
              onChange={(e) => setForm((f) => ({ ...f, packageCount: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink/55">Packaged date</label>
            <input
              type="date"
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              value={form.packagedAt}
              onChange={(e) => setForm((f) => ({ ...f, packagedAt: e.target.value }))}
            />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4 lg:justify-end">
            <button type="submit" disabled={submitting} className="app-button-primary disabled:opacity-50">
              <Package className="h-4 w-4" /> {submitting ? "Recording…" : "Record packaging"}
            </button>
          </div>
        </form>
      </div>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No packaging records yet"
        columns={[
          { key: "batch", label: "Batch", render: (row) => row.productionBatch?.batchNumber ?? "-" },
          { key: "site", label: "Site", render: (row) => row.productionSite?.name ?? "-" },
          { key: "size", label: "Pkg size (kg)", render: (row) => number(row.packageSizeKg) },
          { key: "count", label: "Count", render: (row) => String(row.packageCount) },
          { key: "totalKg", label: "Total kg", render: (row) => number(Number(row.packageSizeKg) * row.packageCount) },
          { key: "date", label: "Packaged at", render: (row) => row.packagedAt ? new Date(row.packagedAt).toLocaleDateString() : "-" },
        ]}
      />
    </FeedMillShell>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? ""} {option.name}</option>)}
      </select>
    </FormField>
  );
}

function BatchTable({ rows }: { rows: BatchRow[] }) {
  return (
    <DataTable rows={rows} empty="No feed production batches found" columns={[
      { key: "batch", label: "Batch", render: (row) => <Link className="font-semibold text-brand" href={`/feed-production/batches/${row.id}`}>{row.batchNumber}</Link> },
      { key: "site", label: "Site", render: (row) => row.productionSite?.name ?? "-" },
      { key: "product", label: "Product", render: (row) => row.finishedProduct?.name ?? "-" },
      { key: "produced", label: "Produced kg", render: (row) => number(row.producedQuantityKg) },
      { key: "margin", label: "Margin", render: (row) => `${row.metrics?.profitMargin ?? 0}%` },
      { key: "status", label: "Status", render: (row) => row.status }
    ]} />
  );
}

function SimpleRowsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 80) }))} />;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  APPROVED: "bg-emerald-50 text-emerald-700",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-teal-50 text-teal-700",
  REJECTED: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-100 text-gray-500",
  PENDING: "bg-amber-50 text-amber-700",
  PENDING_STOCK_APPROVAL: "bg-amber-50 text-amber-700",
  PASSED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
  ACTIVE: "bg-brand/10 text-brand",
  INACTIVE: "bg-gray-100 text-gray-500",
  QUALITY_HOLD: "bg-orange-50 text-orange-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function BatchSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

// ─── Hi-Pro Predictive Planner ──────────────────────────────────────────────

type HiproIng = {
  ingredientId: string;
  name: string;
  sku: string;
  kgsPerTon: number;
  unitCost: number;
  availableKg: number;
  bagsOnHand: number;
  tonsOnHand: number;
  maxProducibleKg: number | null;
  maxProducibleTons: number | null;
  feedConsumedKg: number;
};

type HiproFormula = {
  formulaId: string;
  formulaCode: string;
  formulaName: string;
  feedType: string;
  finishedProduct: { name: string; sku: string } | null;
  targetBatchKg: number;
  maxProducibleKg: number | null;
  maxProducibleTons: number | null;
  maxProducibleBags: number | null;
  limitingIngredient: { name: string; sku: string } | null;
  ingredients: HiproIng[];
};

type HiproIngView = {
  ingredientId: string;
  name: string;
  sku: string;
  unitCost: number;
  availableKg: number;
  bagsOnHand: number;
  tonsOnHand: number;
  feedConsumedKg: number;
  formulaUsages: Array<{
    formulaId: string;
    formulaName: string;
    feedType: string;
    kgsPerTon: number;
    maxProducibleKg: number | null;
  }>;
};

type HiproPredictiveData = {
  asOf: string;
  warehouseId: string | null;
  formulas: HiproFormula[];
  ingredientView: HiproIngView[];
};

type SimPlan = {
  formulaId: string;
  formulaName: string;
  formulaCode: string;
  feedType: string;
  plannedTons: number;
  plannedKg: number;
  canProduce: boolean;
  ingredients: Array<{
    ingredientId: string;
    productName: string;
    sku: string;
    quantityKg: number;
    availableKg: number;
    shortageKg: number;
    unitCost: number;
    bagsRequired: number;
    tonsRequired: number;
    bagsAvailable: number;
    tonsAvailable: number;
  }>;
};

type SimResult = {
  allCanProduce: boolean;
  plans: SimPlan[];
  ingredientSummary: Array<{
    ingredientId: string;
    name: string;
    sku: string;
    totalRequired: number;
    totalAvailable: number;
    shortfall: number;
  }>;
};

type HiKpiColor = "blue" | "emerald" | "amber" | "red" | "purple" | "brand" | "indigo";
const HI_KPI_STYLES: Record<HiKpiColor, { wrap: string; icon: string }> = {
  blue: { wrap: "border-blue-100 bg-blue-50", icon: "text-blue-600" },
  emerald: { wrap: "border-emerald-100 bg-emerald-50", icon: "text-emerald-600" },
  amber: { wrap: "border-amber-100 bg-amber-50", icon: "text-amber-600" },
  red: { wrap: "border-red-100 bg-red-50", icon: "text-red-600" },
  purple: { wrap: "border-purple-100 bg-purple-50", icon: "text-purple-600" },
  brand: { wrap: "border-orange-100 bg-orange-50", icon: "text-brand" },
  indigo: { wrap: "border-indigo-100 bg-indigo-50", icon: "text-indigo-600" },
};

function HiKpi({ label, value, Icon, color = "blue", sub }: {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  color?: HiKpiColor;
  sub?: string;
}) {
  const s = HI_KPI_STYLES[color];
  return (
    <div className={`flex items-start gap-4 rounded-2xl border p-5 shadow-sm ${s.wrap}`}>
      <div className={`rounded-xl border bg-white p-2.5 shadow-sm ${s.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
        <p className="mt-0.5 text-2xl font-black text-ink">{value}</p>
        {sub && <p className="text-xs text-ink/55">{sub}</p>}
      </div>
    </div>
  );
}

function FeedTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    LAYER_MASH: "bg-amber-100 text-amber-700 border-amber-200",
    BROILER_STARTER: "bg-blue-100 text-blue-700 border-blue-200",
    BROILER_FINISHER: "bg-indigo-100 text-indigo-700 border-indigo-200",
    CHICK_MASH: "bg-yellow-100 text-yellow-700 border-yellow-200",
    GROWER_MASH: "bg-emerald-100 text-emerald-700 border-emerald-200",
    PIG_STARTER: "bg-pink-100 text-pink-700 border-pink-200",
    PIG_GROWER: "bg-rose-100 text-rose-700 border-rose-200",
    CATTLE_FINISHER: "bg-orange-100 text-orange-700 border-orange-200",
  };
  const cls = map[type] ?? "bg-line text-ink/60 border-line";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function PctBar({ pct, danger = false }: { pct: number; danger?: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-1.5 w-full rounded-full bg-line">
      <div
        className={`h-1.5 rounded-full transition-all ${danger && clamped < 20 ? "bg-red-500" : clamped < 40 ? "bg-amber-400" : "bg-emerald-500"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function fmt(n: number | null | undefined, dec = 1): string {
  if (n == null) return "—";
  return n.toLocaleString("en-GH", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

// ─── Ingredient Sheet (per-ingredient detail view) ───────────────────────────

type IngSheetProps = {
  ing: HiproIngView;
  mode: "global" | "individual";
  getBags: (formulaId: string) => number;
  onBagChange?: (formulaId: string, value: string) => void;
};

function IngredientSheet({ ing, mode, getBags, onBagChange }: IngSheetProps) {
  let totalConsumedKg = 0;
  let totalCostGhs = 0;

  const rows = ing.formulaUsages.map((u) => {
    const bags = getBags(u.formulaId);
    const tons = bags * 0.05;
    const feedConsumedKg = tons * u.kgsPerTon;
    const costPerTon = ing.unitCost * u.kgsPerTon;
    const formulaCost = feedConsumedKg * ing.unitCost;
    totalConsumedKg += feedConsumedKg;
    totalCostGhs += formulaCost;
    return { u, bags, tons, feedConsumedKg, costPerTon, formulaCost };
  });

  const surplusKg = ing.availableKg - totalConsumedKg;
  const isShortfall = surplusKg < 0;
  const bagsNeeded = isShortfall ? Math.ceil(Math.abs(surplusKg) / 50) : 0;
  const hasPlan = totalConsumedKg > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      {/* Ingredient header */}
      <div className="border-b border-line bg-gradient-to-r from-white to-field px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-ink">{ing.name}</h2>
            <p className="mt-0.5 text-xs text-ink/40">{ing.sku} · {ing.formulaUsages.length} formula{ing.formulaUsages.length !== 1 ? "s" : ""} use this ingredient</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-ink/40">Price per kg</p>
              <p className="text-lg font-black text-brand">{ing.unitCost > 0 ? `GHS ${ing.unitCost.toFixed(2)}` : "—"}</p>
              {ing.unitCost > 0 && <p className="text-[10px] text-ink/40">GHS {(ing.unitCost * 50).toFixed(2)} / 50 kg bag</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-ink/40">Stock Available</p>
              <p className="text-lg font-black text-ink">{ing.bagsOnHand} bags</p>
              <p className="text-[10px] text-ink/40">{fmt(ing.availableKg, 1)} kg · {fmt(ing.tonsOnHand)} t</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-ink/40">{isShortfall ? "Shortfall" : hasPlan ? "Surplus" : "Status"}</p>
              <p className={`text-lg font-black ${isShortfall ? "text-red-600" : hasPlan ? "text-emerald-600" : "text-ink/25"}`}>
                {!hasPlan ? "No plan yet" : (isShortfall ? "−" : "+") + fmt(Math.abs(surplusKg), 1) + " kg"}
              </p>
              {bagsNeeded > 0 && <p className="text-[10px] font-bold text-red-500">Order {bagsNeeded} bags</p>}
            </div>
          </div>
        </div>
      </div>

      {/* TABLE 1 — Quantity */}
      <div className="px-6 pb-4 pt-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink/40">Feed Production — Quantity Analysis</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wide text-ink/35">
                <th className="pb-2 pr-4 text-left">Feed Type</th>
                <th className="pb-2 pr-4 text-right">No. of Bags</th>
                <th className="pb-2 pr-4 text-right">No. of Tons</th>
                <th className="pb-2 pr-4 text-right">Kgs per Ton</th>
                <th className="pb-2 text-right">Feed Consumed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, bags, tons, feedConsumedKg }) => (
                <tr key={u.formulaId} className="border-b border-line/40 last:border-0 hover:bg-field/30">
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{u.formulaName}</span>
                      <FeedTag type={u.feedType} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {onBagChange ? (
                      <input
                        type="number" min="0" step="1" placeholder="0"
                        value={bags || ""}
                        onChange={(e) => onBagChange(u.formulaId, e.target.value)}
                        className="w-24 rounded-xl border border-line bg-white px-3 py-1.5 text-right text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    ) : (
                      <span className={bags > 0 ? "font-bold text-ink" : "text-ink/25"}>{bags > 0 ? bags.toLocaleString() : "—"}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink/60">{tons > 0 ? fmt(tons, 2) + " t" : "—"}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-ink/70">{fmt(u.kgsPerTon, 2)}</td>
                  <td className="py-2.5 text-right font-semibold">{feedConsumedKg > 0 ? fmt(feedConsumedKg, 1) + " kg" : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line bg-field/40">
                <td colSpan={4} className="py-2.5 pr-4 text-right text-[11px] font-bold uppercase tracking-wide text-ink/50">Total Feed Consumed</td>
                <td className="py-2.5 text-right font-bold text-ink">{hasPlan ? fmt(totalConsumedKg, 1) + " kg" : "—"}</td>
              </tr>
              <tr>
                <td colSpan={4} className="py-1.5 pr-4 text-right text-[11px] font-bold uppercase tracking-wide text-ink/40">Stock Available</td>
                <td className="py-1.5 text-right text-ink/60">{fmt(ing.availableKg, 1)} kg &nbsp;({ing.bagsOnHand} bags)</td>
              </tr>
              <tr className={isShortfall ? "bg-red-50" : hasPlan ? "bg-emerald-50" : ""}>
                <td colSpan={4} className={`py-2.5 pr-4 text-right text-[11px] font-bold uppercase tracking-wide ${isShortfall ? "text-red-600" : hasPlan ? "text-emerald-700" : "text-ink/30"}`}>
                  {isShortfall ? "SHORTFALL — Order More Stock" : hasPlan ? "SURPLUS — Sufficient Stock" : "Enter bags above to see analysis"}
                </td>
                <td className={`py-2.5 text-right text-base font-black ${isShortfall ? "text-red-600" : hasPlan ? "text-emerald-600" : "text-ink/20"}`}>
                  {!hasPlan ? "—" : (isShortfall ? "−" : "+") + fmt(Math.abs(surplusKg), 1) + " kg"}
                  {bagsNeeded > 0 && <span className="ml-2 block text-xs font-bold">{bagsNeeded} bags short</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Price separator */}
      {ing.unitCost > 0 && (
        <>
          <div className="mx-6 flex flex-wrap items-center gap-3 border-t border-b border-line py-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Ingredient Price</span>
            <span className="text-base font-black text-brand">GHS {ing.unitCost.toFixed(2)} / kg</span>
            <span className="text-ink/25">·</span>
            <span className="text-sm text-ink/50">GHS {(ing.unitCost * 50).toFixed(2)} per 50 kg bag</span>
            {totalCostGhs > 0 && (
              <span className="ml-auto rounded-lg bg-brand/10 px-3 py-1 text-sm font-bold text-brand">
                Planned cost: GHS {fmt(totalCostGhs, 2)}
              </span>
            )}
          </div>

          {/* TABLE 2 — Cost Contribution (mirrors Excel bottom table) */}
          <div className="px-6 pb-6 pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink/40">Cost Contribution per Ton of Feed</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-[10px] font-bold uppercase tracking-wide text-ink/35">
                    <th className="pb-2 pr-4 text-left">Feed Type</th>
                    <th className="pb-2 pr-4 text-right">Kgs per Ton</th>
                    <th className="pb-2 pr-4 text-right">Price / kg</th>
                    <th className="pb-2 text-right">Cost per Ton of Feed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ u, costPerTon }) => (
                    <tr key={u.formulaId} className="border-b border-line/40 last:border-0 hover:bg-field/30">
                      <td className="py-2 pr-4 font-semibold text-ink">{u.formulaName}</td>
                      <td className="py-2 pr-4 text-right font-mono text-ink/70">{fmt(u.kgsPerTon, 2)}</td>
                      <td className="py-2 pr-4 text-right text-ink/60">GHS {ing.unitCost.toFixed(2)}</td>
                      <td className="py-2 text-right font-bold text-ink">GHS {fmt(costPerTon, 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-brand/5">
                    <td colSpan={3} className="py-2.5 pr-4 text-right text-[11px] font-bold uppercase tracking-wide text-brand/70">Total Ingredient Cost for This Plan</td>
                    <td className="py-2.5 text-right font-black text-brand">{totalCostGhs > 0 ? "GHS " + fmt(totalCostGhs, 2) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HiproPredictivePage() {
  const options = useFeedOptions();
  const [mode, setMode] = useState<"global" | "individual">("global");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [data, setData] = useState<HiproPredictiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeIngId, setActiveIngId] = useState<string | null>(null);

  // Global mode: formulaId → bags string (entered once, drives all ingredient sheets)
  const [globalBags, setGlobalBags] = useState<Record<string, string>>({});
  // Individual mode: ingredientId → formulaId → bags string (per-ingredient spot checks)
  const [indivBags, setIndivBags] = useState<Record<string, Record<string, string>>>({});

  function loadData(wh: string) {
    setLoading(true);
    setFetchError(null);
    const path = wh
      ? `/feed-production/hipro-predictive?warehouseId=${wh}`
      : `/feed-production/hipro-predictive`;
    apiFetch<ApiEnvelope<HiproPredictiveData>>(path)
      .then((r) => {
        const d = r.data ?? null;
        setData(d);
        if (d && d.ingredientView.length > 0) {
          setActiveIngId((prev) => prev ?? d.ingredientView[0].ingredientId);
        }
      })
      .catch((e: unknown) => setFetchError((e as Error)?.message ?? "Failed to load data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(warehouseId); }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getBags(formulaId: string, ingId: string): number {
    if (mode === "global") return Number(globalBags[formulaId] ?? 0);
    return Number(indivBags[ingId]?.[formulaId] ?? 0);
  }

  function setGlobalBag(formulaId: string, val: string) {
    setGlobalBags((prev) => ({ ...prev, [formulaId]: val }));
  }

  function setIndivBag(ingId: string, formulaId: string, val: string) {
    setIndivBags((prev) => ({ ...prev, [ingId]: { ...(prev[ingId] ?? {}), [formulaId]: val } }));
  }

  function ingStatus(iv: HiproIngView): "ok" | "low" | "critical" | "idle" {
    let consumed = 0;
    for (const u of iv.formulaUsages) consumed += getBags(u.formulaId, iv.ingredientId) * 0.05 * u.kgsPerTon;
    if (consumed === 0) return "idle";
    const ratio = consumed / Math.max(iv.availableKg, 0.001);
    if (ratio > 1) return "critical";
    if (ratio > 0.8) return "low";
    return "ok";
  }

  const globalTotalBags = Object.values(globalBags).reduce((s, v) => s + Number(v || 0), 0);
  const globalTotalTons = globalTotalBags * 0.05;
  const activeIng = data?.ingredientView.find((iv) => iv.ingredientId === activeIngId) ?? null;

  const ST_DOT: Record<string, string> = {
    ok: "bg-emerald-400",
    low: "bg-amber-400",
    critical: "bg-red-500",
    idle: "bg-ink/20",
  };
  const ST_LABEL: Record<string, string> = {
    ok: "Sufficient",
    low: "Running Low",
    critical: "Shortfall",
    idle: "No plan",
  };

  return (
    <FeedMillShell>
      <div className="space-y-6">
        {/* HERO */}
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field px-7 py-6 shadow-panel">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 75% 50%, #f58220 0%, transparent 55%)" }} />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="app-kicker flex items-center gap-1.5"><Brain className="h-3 w-3" /> Feed Mill Intelligence</span>
              <h1 className="mt-1.5 text-[22px] font-black tracking-tight text-ink">Hi-Pro Predictive Planner</h1>
              <p className="mt-1 max-w-xl text-sm text-ink/60">
                Enter production targets in bags — the system uses your stored formulas to calculate every ingredient required. Open any ingredient to see its full quantity and cost breakdown.
              </p>
              {data?.asOf && (
                <p className="mt-1.5 text-[11px] text-ink/40">Stock as of {new Date(data.asOf).toLocaleString()}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/70 shadow-sm transition hover:bg-field"
                onClick={() => {
                  setLoading(true);
                  setFetchError(null);
                  const path = warehouseId
                    ? `/feed-production/hipro-predictive?warehouseId=${warehouseId}`
                    : `/feed-production/hipro-predictive`;
                  apiFetch<ApiEnvelope<HiproPredictiveData>>(path)
                    .then((r) => setData(r.data ?? null))
                    .catch((e: unknown) => setFetchError((e as Error)?.message ?? "Failed to load"))
                    .finally(() => setLoading(false));
                }}
              >
                <RotateCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>
        </div>

        {/* WAREHOUSE + MODE ROW */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Warehouse:</span>
          {[{ id: "", name: "All" }, ...options.warehouses].map((wh) => (
            <button key={wh.id} onClick={() => setWarehouseId(wh.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${warehouseId === wh.id ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-white text-ink/60 hover:bg-field"}`}>
              {wh.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Input mode:</span>
            <div className="flex overflow-hidden rounded-xl border border-line bg-white">
              <button onClick={() => setMode("global")} className={`px-4 py-2 text-xs font-bold transition ${mode === "global" ? "bg-brand text-white" : "text-ink/60 hover:bg-field"}`}>Global Plan</button>
              <button onClick={() => setMode("individual")} className={`px-4 py-2 text-xs font-bold transition ${mode === "individual" ? "bg-brand text-white" : "text-ink/60 hover:bg-field"}`}>Per Ingredient</button>
            </div>
          </div>
        </div>

        {/* MODE INFO BANNER */}
        {mode === "global" ? (
          <div className="flex items-start gap-3 rounded-xl border-l-[3px] border-indigo-400 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
            <ChartBar className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Global Plan:</strong> Enter No. of Bags for each feed type in the table below. Every ingredient tab automatically calculates its consumption and cost from those numbers.</span>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border-l-[3px] border-purple-400 bg-purple-50 px-4 py-3 text-xs text-purple-800">
            <Package className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Per Ingredient:</strong> Open any ingredient tab and enter bags directly inside it. Useful for spot-checking a single ingredient without setting a full production plan.</span>
          </div>
        )}

        {fetchError && (
          <div className="flex items-center gap-3 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {fetchError}
          </div>
        )}


        {/* GLOBAL PLAN TABLE */}
        {mode === "global" && (
          <div className="rounded-2xl border border-line bg-white shadow-sm">
            <div className="border-b border-line px-5 py-3.5">
              <p className="text-sm font-bold text-ink">Production Plan</p>
              <p className="text-xs text-ink/50">Enter the number of 50 kg bags you plan to produce for each feed type</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wide text-ink/40">
                    <th className="px-5 pb-2.5 pt-3">Feed Type</th>
                    <th className="pb-2.5 pr-4 pt-3 text-right">No. of Bags</th>
                    <th className="pb-2.5 pr-5 pt-3 text-right">No. of Tons</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}><td colSpan={3} className="px-5 py-2.5"><div className="h-7 animate-pulse rounded-lg bg-line" /></td></tr>
                      ))
                    : (data?.formulas ?? []).map((f) => {
                        const bags = Number(globalBags[f.formulaId] ?? 0);
                        const tons = bags * 0.05;
                        return (
                          <tr key={f.formulaId} className="border-b border-line/40 last:border-0 hover:bg-field/30">
                            <td className="px-5 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-field px-1.5 py-0.5 text-[10px] font-bold text-ink/45">{f.formulaCode}</span>
                                <span className="font-semibold text-ink">{f.formulaName}</span>
                                <FeedTag type={f.feedType} />
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-right">
                              <input
                                type="number" min="0" step="1" placeholder="0"
                                value={globalBags[f.formulaId] ?? ""}
                                onChange={(e) => setGlobalBag(f.formulaId, e.target.value)}
                                className="w-24 rounded-xl border border-line bg-white px-3 py-1.5 text-right text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                              />
                            </td>
                            <td className="py-2.5 pr-5 text-right text-ink/60">{bags > 0 ? fmt(tons, 2) + " t" : "\u2014"}</td>
                          </tr>
                        );
                      })}
                </tbody>
                {!loading && data && (
                  <tfoot>
                    <tr className="border-t-2 border-line bg-field/40 font-bold">
                      <td className="px-5 py-2.5 text-xs uppercase tracking-wide text-ink/50">Total</td>
                      <td className="py-2.5 pr-4 text-right">{globalTotalBags.toLocaleString()} bags</td>
                      <td className="py-2.5 pr-5 text-right text-ink/60">{fmt(globalTotalTons, 2)} t</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* INGREDIENT TAB BAR */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">
            Ingredients — click any to open its full analysis
          </p>
          <div className="flex flex-wrap gap-2">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 w-28 animate-pulse rounded-xl bg-line" />
                ))
              : (data?.ingredientView ?? []).map((iv) => {
                  const st = ingStatus(iv);
                  const isActive = iv.ingredientId === activeIngId;
                  return (
                    <button
                      key={iv.ingredientId}
                      onClick={() => setActiveIngId(iv.ingredientId)}
                      className={
                        "rounded-xl border px-4 py-2.5 text-left transition " +
                        (isActive
                          ? "border-brand bg-brand text-white shadow-sm"
                          : "border-line bg-white hover:border-brand/30 hover:bg-field")
                      }
                    >
                      <p className={"text-xs font-bold " + (isActive ? "text-white" : "text-ink")}>{iv.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={"h-1.5 w-1.5 rounded-full " + ST_DOT[st]} />
                        <span className={"text-[10px] font-semibold " + (isActive ? "text-white/70" : "text-ink/40")}>
                          {iv.bagsOnHand} bags \u00b7 {ST_LABEL[st]}
                        </span>
                      </div>
                    </button>
                  );
                })}
          </div>
        </div>

        {/* ACTIVE INGREDIENT SHEET */}
        {!loading && activeIng && (
          <IngredientSheet
            ing={activeIng}
            mode={mode}
            getBags={(fid) => getBags(fid, activeIng.ingredientId)}
            onBagChange={
              mode === "individual"
                ? (fid, val) => setIndivBag(activeIng.ingredientId, fid, val)
                : undefined
            }
          />
        )}
        {!loading && !activeIng && (data?.ingredientView.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-line bg-white px-6 py-10 text-center text-sm text-ink/40 shadow-sm">
            No ingredients found. Add ingredients to your feed formulas first.
          </div>
        )}

      </div>
    </FeedMillShell>
  );
}
