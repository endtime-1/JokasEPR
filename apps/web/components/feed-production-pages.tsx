"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, BarChart3, Brain, Calculator, CheckCircle2, ChevronDown, ChevronUp, Download, Factory, GripVertical, Package, PackageCheck, Plus, Printer, RotateCw, Trash2, TrendingUp, Zap } from "lucide-react";
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
  status: string;
  notes: string;
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const today = () => new Date().toISOString().slice(0, 10);

function useFeedOptions() {
  const [options, setOptions] = useState<FeedOptions>({ productionSites: [], warehouses: [], farms: [], poultryHouses: [], rawMaterials: [], finishedFeeds: [], formulas: [], batches: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<FeedOptions>>("/feed-production/options")
      .then((response) => setOptions(response.data))
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
  return `GHS ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function FeedFormulaListPage() {
  const [rows, setRows] = useState<FormulaRow[]>([]);

  async function load() {
    const response = await apiFetch<ApiEnvelope<FormulaRow[]>>("/feed-production/formulas");
    setRows(response.data);
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
      <FormulaTable rows={rows} />
    </FeedMillShell>
  );
}


let _uidCounter = 0;
function uid() { return `row-${++_uidCounter}`; }

const FEED_TYPES = ["CHICK_MASH", "GROWER_MASH", "LAYER_MASH", "BROILER_STARTER", "BROILER_FINISHER", "BREEDER_FEED", "CONCENTRATE", "CUSTOM_FEED"] as const;

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
  const costPer100Kg = totalKg > 0 ? (totalCost / totalKg) * 100 : 0;

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
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 120 }}>Unit Cost (GHS/kg)</th>
                    <th className="py-2.5 pr-4 text-right" style={{ minWidth: 110 }}>Line Cost (GHS)</th>
                    <th className="w-10 py-2.5 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {ingRows.map((row, idx) => {
                    const lineKg = Number(row.quantityKg) || 0;
                    const lineCost = Number(row.unitCost) || 0;
                    const lineTotal = lineKg * lineCost;
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
                          {lineTotal > 0 ? lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-ink/25">—</span>}
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
                <p className="mt-0.5 text-lg font-bold text-ink">{totalKg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                {Math.abs(totalKg - batchKg) > 0.1 && totalKg > 0 && (
                  <p className={`text-[10px] font-semibold ${totalKg < batchKg ? "text-amber-600" : "text-blue-600"}`}>
                    {totalKg > batchKg ? `+${(totalKg - batchKg).toFixed(2)} over target` : `${(batchKg - totalKg).toFixed(2)} under target`}
                  </p>
                )}
              </div>
              <div className="px-5 py-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Total Ingredient Cost</p>
                <p className="mt-0.5 text-lg font-bold text-ink">
                  {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-1 text-xs font-normal text-ink/40">GHS</span>
                </p>
              </div>
              <div className="px-5 py-3.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">Cost per 100 kg</p>
                <p className="mt-0.5 text-lg font-bold text-brand">
                  {costPer100Kg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

function FormulaTable({ rows }: { rows: FormulaRow[] }) {
  return (
    <DataTable
      rows={rows}
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
  const options = useFeedOptions();
  const [formula, setFormula] = useState<FormulaRow | null>(null);
  const [costing, setCosting] = useState<FormulaRow["costing"] | null>(null);
  const [ingredient, setIngredient] = useState({ ingredientId: "", quantityKg: "", unitCost: "" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<FormulaRow>>(`/feed-production/formulas/${params.id}`);
    setFormula(response.data);
    if (mode === "costing") {
      const cost = await apiFetch<ApiEnvelope<FormulaRow["costing"]>>(`/feed-production/formulas/${params.id}/costing`);
      setCosting(cost.data);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [mode, params.id]);

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

  const title = mode === "costing" ? "Formula Costing" : mode === "versions" ? "Formula Version History" : formula?.name ?? "Formula Details";
  return (
    <FeedMillShell>
      <PageHeader title={title} subtitle="Formula ingredients, cost per 100kg, cost per 50kg bag, and version history." />
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
                    <th className="py-2.5 pr-4 text-right">Unit Cost (GHS)</th>
                    <th className="py-2.5 pr-5 text-right">Line Cost (GHS)</th>
                  </tr>
                </thead>
                <tbody>
                  {(formula?.ingredients ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-ink/40">No ingredients yet — add below</td></tr>
                  ) : (
                    (formula?.ingredients ?? []).map((ing, idx) => (
                      <tr key={ing.id} className="border-b border-line/40 last:border-0 hover:bg-field/30">
                        <td className="px-5 py-2.5 text-xs font-semibold text-ink/30">{idx + 1}</td>
                        <td className="py-2.5 pr-4 font-semibold text-ink">{ing.ingredient?.name ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          <span className="rounded bg-field px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink/50">{ing.ingredient?.sku ?? "—"}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-right">{number(ing.quantityKg)}</td>
                        <td className="py-2.5 pr-4 text-right text-ink/60">{number(ing.unitCost)}</td>
                        <td className="py-2.5 pr-5 text-right font-semibold">{number(Number(ing.quantityKg) * Number(ing.unitCost))}</td>
                      </tr>
                    ))
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
                        <td className="py-2.5 pr-5 text-right text-brand">{number(totalCost)} GHS</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>

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
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  placeholder="0"
                  className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-right text-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                  value={ingredient.quantityKg}
                  onChange={(e) => setIngredient({ ...ingredient, quantityKg: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/55">Unit Cost (GHS/kg)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
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
  const [form, setForm] = useState({ productionSiteId: "", formulaId: "", plannedQuantityKg: "", scheduledDate: today(), rawMaterialWarehouseId: "", status: "APPROVED", notes: "" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<OrderRow[]>>("/feed-production/orders");
    setRows(response.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/feed-production/orders", {
      method: "POST",
      body: JSON.stringify({
        productionSiteId: form.productionSiteId || options.productionSites[0]?.id,
        formulaId: form.formulaId || options.formulas[0]?.id,
        plannedQuantityKg: Number(form.plannedQuantityKg),
        scheduledDate: form.scheduledDate,
        rawMaterialWarehouseId: form.rawMaterialWarehouseId || options.warehouses[0]?.id,
        status: form.status,
        notes: form.notes || undefined
      })
    });
    setForm({ ...form, plannedQuantityKg: "", notes: "" });
    await load();
  }

  return (
    <FeedMillShell>
      <PageHeader title={create ? "Create Production Order" : "Feed Production Orders"} subtitle="Plan, approve, and monitor feed mill production orders." />
      {create ? <OrderForm options={options} form={form} setForm={setForm} submit={submit} /> : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/feed-production/orders/create"><Plus aria-hidden className="h-4 w-4" /> Create order</Link>}
      <OrderTable rows={rows} />
    </FeedMillShell>
  );
}

function OrderForm({ options, form, setForm, submit }: { options: FeedOptions; form: OrderFormState; setForm: (form: OrderFormState) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <SelectField label="Production site" value={form.productionSiteId || options.productionSites[0]?.id || ""} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
      <SelectField label="Formula" value={form.formulaId || options.formulas[0]?.id || ""} options={options.formulas} onChange={(value) => setForm({ ...form, formulaId: value })} />
      <SelectField label="Raw material warehouse" value={form.rawMaterialWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, rawMaterialWarehouseId: value })} />
      <FormField label="Planned kg"><input className={inputClass} type="number" value={form.plannedQuantityKg} onChange={(event) => setForm({ ...form, plannedQuantityKg: event.target.value })} required /></FormField>
      <FormField label="Scheduled date"><input className={inputClass} type="date" value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} required /></FormField>
      <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>APPROVED</option><option>DRAFT</option></select></FormField>
      <FormField label="Notes"><input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FormField>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"><Plus aria-hidden className="h-4 w-4" /> Save order</button>
    </form>
  );
}

function OrderTable({ rows }: { rows: OrderRow[] }) {
  return (
    <DataTable rows={rows} empty="No feed production orders found" columns={[
      { key: "order", label: "Order", render: (row) => row.orderNumber },
      { key: "site", label: "Site", render: (row) => row.productionSite?.name ?? "-" },
      { key: "formula", label: "Formula", render: (row) => row.formula?.name ?? "-" },
      { key: "planned", label: "Planned kg", render: (row) => number(row.plannedQuantityKg) },
      { key: "date", label: "Scheduled", render: (row) => new Date(row.scheduledDate).toLocaleDateString() },
      { key: "status", label: "Status", render: (row) => row.status },
      { key: "batch", label: "Batch", render: (row) => row.batches?.[0] ? <Link className="text-brand" href={`/feed-production/batches/${row.batches[0].id}`}>{row.batches[0].batchNumber}</Link> : "-" }
    ]} />
  );
}

export function FeedBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Record<string, unknown> | null>(null);
  const [label, setLabel] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/feed-production/batches/${params.id}`)
      .then((response) => setBatch(response.data))
      .catch(() => undefined);
  }, [params.id]);

  async function printLabel() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>>>(`/feed-production/batches/${params.id}/label`);
    setLabel(response.data);
  }

  return (
    <FeedMillShell>
      <PageHeader title={String(batch?.batchNumber ?? "Production Batch Details")} subtitle="Batch raw material usage, QC status, packaging, finished stock, transfers, and costing." />
      <button className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={printLabel}>
        <Printer aria-hidden className="h-4 w-4" /> Print batch label
      </button>
      {label ? <pre className="mb-6 max-h-60 overflow-auto rounded-md border border-line bg-white p-4 text-xs shadow-panel">{JSON.stringify(label, null, 2)}</pre> : null}
      <pre className="max-h-[620px] overflow-auto rounded-md border border-line bg-white p-4 text-xs shadow-panel">{JSON.stringify(batch, null, 2)}</pre>
    </FeedMillShell>
  );
}

export function FeedRecordListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Array<Record<string, unknown>>>>(endpoint)
      .then((response) => setRows(response.data))
      .catch(() => undefined);
  }, [endpoint]);
  const keys = Object.keys(rows[0] ?? {}).filter((key) => ["batchNumber", "quantityKg", "unitCost", "wastageKg", "status", "moisturePercent", "proteinPercent", "packageCount", "bag50KgCount", "createdAt", "checkedAt", "packagedAt"].includes(key));
  return (
    <FeedMillShell>
      <PageHeader title={title} subtitle={subtitle} />
      <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => String(row[key] ?? "-").slice(0, 90) }))} />
    </FeedMillShell>
  );
}

export function FeedQualityControlPage() {
  const options = useFeedOptions();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ productionBatchId: "", moisturePercent: "", proteinPercent: "", textureNotes: "", status: "APPROVED" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<Array<Record<string, unknown>>>>("/feed-production/quality-checks");
    setRows(response.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/feed-production/quality-checks", {
      method: "POST",
      body: JSON.stringify({ productionBatchId: form.productionBatchId || options.batches[0]?.id, moisturePercent: Number(form.moisturePercent), proteinPercent: Number(form.proteinPercent), textureNotes: form.textureNotes, status: form.status })
    });
    await load();
  }

  return (
    <FeedMillShell>
      <PageHeader title="Feed Quality Control" subtitle="Record and approve feed quality checks for production batches." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <FormField label="Moisture %"><input className={inputClass} type="number" value={form.moisturePercent} onChange={(event) => setForm({ ...form, moisturePercent: event.target.value })} /></FormField>
        <FormField label="Protein %"><input className={inputClass} type="number" value={form.proteinPercent} onChange={(event) => setForm({ ...form, proteinPercent: event.target.value })} /></FormField>
        <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>APPROVED</option><option>PASSED</option><option>FAILED</option><option>PENDING</option></select></FormField>
        <FormField label="Notes"><input className={inputClass} value={form.textureNotes} onChange={(event) => setForm({ ...form, textureNotes: event.target.value })} /></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5"><PackageCheck aria-hidden className="h-4 w-4" /> Save quality check</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </FeedMillShell>
  );
}

export function FinishedFeedInventoryPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Array<Record<string, unknown>>>>("/feed-production/finished-feed-stock")
      .then((response) => setRows(response.data))
      .catch(() => undefined);
  }, []);
  return (
    <FeedMillShell>
      <PageHeader title="Finished Feed Inventory" subtitle="Current finished feed stock by warehouse, batch, product, bag count, and unit cost." />
      <SimpleRowsTable rows={rows} />
    </FeedMillShell>
  );
}

export function InternalFeedTransferPage() {
  const options = useFeedOptions();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ productionBatchId: "", fromWarehouseId: "", toFarmId: "", toPoultryHouseId: "", quantityKg: "", notes: "" });
  const houses = useMemo(() => options.poultryHouses.filter((house) => !form.toFarmId || house.farmId === form.toFarmId), [options.poultryHouses, form.toFarmId]);

  async function load() {
    const response = await apiFetch<ApiEnvelope<Array<Record<string, unknown>>>>("/feed-production/transfers");
    setRows(response.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/feed-production/transfers", {
      method: "POST",
      body: JSON.stringify({
        productionBatchId: form.productionBatchId || options.batches[0]?.id,
        fromWarehouseId: form.fromWarehouseId || options.warehouses[0]?.id,
        toFarmId: form.toFarmId || options.farms[0]?.id,
        toPoultryHouseId: form.toPoultryHouseId || houses[0]?.id,
        quantityKg: Number(form.quantityKg),
        notes: form.notes || undefined
      })
    });
    await load();
  }

  return (
    <FeedMillShell>
      <PageHeader title="Internal Feed Transfer" subtitle="Transfer finished feed from feed mill stores to assigned farms and poultry houses." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <SelectField label="Batch" value={form.productionBatchId || options.batches[0]?.id || ""} options={options.batches.map((batch) => ({ ...batch, name: batch.batchNumber }))} onChange={(value) => setForm({ ...form, productionBatchId: value })} />
        <SelectField label="From warehouse" value={form.fromWarehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
        <SelectField label="To farm" value={form.toFarmId || options.farms[0]?.id || ""} options={options.farms} onChange={(value) => setForm({ ...form, toFarmId: value, toPoultryHouseId: "" })} />
        <SelectField label="To house" value={form.toPoultryHouseId || houses[0]?.id || ""} options={houses} onChange={(value) => setForm({ ...form, toPoultryHouseId: value })} />
        <FormField label="Quantity kg"><input className={inputClass} type="number" value={form.quantityKg} onChange={(event) => setForm({ ...form, quantityKg: event.target.value })} required /></FormField>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5">Create transfer</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </FeedMillShell>
  );
}

export function FeedReportsPage() {
  return (
    <FeedMillShell>
      <PageHeader title="Feed Production Reports" subtitle="Export feed formula, production, cost, quality, stock, and transfer reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/feed-production/reports/summary.csv", "feed-production-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download feed summary CSV
      </button>
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
  return n.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec });
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
        setData(r.data);
        if (r.data.ingredientView.length > 0) {
          setActiveIngId((prev) => prev ?? r.data.ingredientView[0].ingredientId);
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
                    .then((r) => setData(r.data))
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
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
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
