"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, PackageCheck, Plus, Printer, RotateCw } from "lucide-react";
import { AppShell } from "./app-shell";
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

type FormulaFormState = {
  branchId: string;
  finishedProductId: string;
  code: string;
  name: string;
  feedType: string;
  targetBatchKg: string;
  ingredientA: string;
  ingredientAQuantity: string;
  ingredientAUnitCost: string;
  ingredientB: string;
  ingredientBQuantity: string;
  ingredientBUnitCost: string;
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

export function FeedMillDashboardPage() {
  const [dashboard, setDashboard] = useState<{
    formulaCount: number;
    openOrders: number;
    pendingQualityChecks: number;
    totalProducedKg: number;
    totalFinishedKg: number;
    bag50KgCount: number;
    finishedValue: number;
    rawMaterialCost: number;
    wastageKg: number;
    productionProfitMargin: number;
    recentOrders: OrderRow[];
    recentBatches: BatchRow[];
  } | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<NonNullable<typeof dashboard>>>("/feed-production/dashboard")
      .then((response) => setDashboard(response.data))
      .catch(() => undefined);
  }, []);

  const cards = [
    ["Feed formulas", dashboard?.formulaCount ?? 0],
    ["Open orders", dashboard?.openOrders ?? 0],
    ["Produced kg", dashboard?.totalProducedKg ?? 0],
    ["Finished stock kg", dashboard?.totalFinishedKg ?? 0],
    ["50kg bags", dashboard?.bag50KgCount ?? 0],
    ["Pending QC", dashboard?.pendingQualityChecks ?? 0],
    ["Wastage kg", dashboard?.wastageKg ?? 0],
    ["Profit margin", `${dashboard?.productionProfitMargin ?? 0}%`]
  ];

  return (
    <AppShell>
      <PageHeader title="Feed Mill Dashboard" subtitle="Formula, order, production, stock, quality, and cost performance for assigned feed sites." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm text-ink/65">{label}</p>
            <strong className="mt-3 block text-2xl font-semibold">{typeof value === "number" ? number(value) : value}</strong>
          </article>
        ))}
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-lg font-semibold">Recent orders</h3>
          <OrderTable rows={dashboard?.recentOrders ?? []} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Recent batches</h3>
          <BatchTable rows={dashboard?.recentBatches ?? []} />
        </div>
      </section>
    </AppShell>
  );
}

export function FeedFormulaListPage({ create = false }: { create?: boolean }) {
  const options = useFeedOptions();
  const [rows, setRows] = useState<FormulaRow[]>([]);
  const [form, setForm] = useState({
    branchId: "",
    finishedProductId: "",
    code: "",
    name: "",
    feedType: "LAYER_MASH",
    targetBatchKg: "100",
    ingredientA: "",
    ingredientAQuantity: "",
    ingredientAUnitCost: "",
    ingredientB: "",
    ingredientBQuantity: "",
    ingredientBUnitCost: ""
  });

  async function load() {
    const response = await apiFetch<ApiEnvelope<FormulaRow[]>>("/feed-production/formulas");
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredients = [
      { ingredientId: form.ingredientA, quantityKg: Number(form.ingredientAQuantity), unitCost: Number(form.ingredientAUnitCost), sortOrder: 1 },
      { ingredientId: form.ingredientB, quantityKg: Number(form.ingredientBQuantity), unitCost: Number(form.ingredientBUnitCost), sortOrder: 2 }
    ].filter((ingredient) => ingredient.ingredientId && ingredient.quantityKg > 0);

    await apiFetch("/feed-production/formulas", {
      method: "POST",
      body: JSON.stringify({
        branchId: form.branchId || undefined,
        finishedProductId: form.finishedProductId || options.finishedFeeds[0]?.id,
        code: form.code,
        name: form.name,
        feedType: form.feedType,
        targetBatchKg: Number(form.targetBatchKg),
        status: "ACTIVE",
        ingredients
      })
    });
    setForm({ ...form, code: "", name: "", ingredientAQuantity: "", ingredientAUnitCost: "", ingredientBQuantity: "", ingredientBUnitCost: "" });
    await load();
  }

  return (
    <AppShell>
      <PageHeader title={create ? "Create Feed Formula" : "Feed Formulas"} subtitle="Manage feed formulas, ingredients, costing, and active formula versions." />
      {create ? <FormulaForm options={options} form={form} setForm={setForm} submit={submit} /> : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/feed-production/formulas/create"><Plus aria-hidden className="h-4 w-4" /> Create formula</Link>}
      <FormulaTable rows={rows} />
    </AppShell>
  );
}

function FormulaForm({ options, form, setForm, submit }: { options: FeedOptions; form: FormulaFormState; setForm: (form: FormulaFormState) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <FormField label="Finished feed">
        <select className={inputClass} value={form.finishedProductId || options.finishedFeeds[0]?.id || ""} onChange={(event) => setForm({ ...form, finishedProductId: event.target.value })}>
          {options.finishedFeeds.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
        </select>
      </FormField>
      <FormField label="Feed type">
        <select className={inputClass} value={form.feedType} onChange={(event) => setForm({ ...form, feedType: event.target.value })}>
          {["CHICK_MASH", "GROWER_MASH", "LAYER_MASH", "BROILER_STARTER", "BROILER_FINISHER", "BREEDER_FEED", "CONCENTRATE", "CUSTOM_FEED"].map((type) => <option key={type}>{type}</option>)}
        </select>
      </FormField>
      <FormField label="Code"><input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></FormField>
      <FormField label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></FormField>
      <FormField label="Target kg"><input className={inputClass} type="number" value={form.targetBatchKg} onChange={(event) => setForm({ ...form, targetBatchKg: event.target.value })} required /></FormField>
      <FormField label="Ingredient 1">
        <select className={inputClass} value={form.ingredientA || options.rawMaterials[0]?.id || ""} onChange={(event) => setForm({ ...form, ingredientA: event.target.value })}>
          {options.rawMaterials.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
        </select>
      </FormField>
      <FormField label="Ingredient 1 kg"><input className={inputClass} type="number" value={form.ingredientAQuantity} onChange={(event) => setForm({ ...form, ingredientAQuantity: event.target.value })} /></FormField>
      <FormField label="Ingredient 1 unit cost"><input className={inputClass} type="number" value={form.ingredientAUnitCost} onChange={(event) => setForm({ ...form, ingredientAUnitCost: event.target.value })} /></FormField>
      <FormField label="Ingredient 2">
        <select className={inputClass} value={form.ingredientB || options.rawMaterials[1]?.id || options.rawMaterials[0]?.id || ""} onChange={(event) => setForm({ ...form, ingredientB: event.target.value })}>
          {options.rawMaterials.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
        </select>
      </FormField>
      <FormField label="Ingredient 2 kg"><input className={inputClass} type="number" value={form.ingredientBQuantity} onChange={(event) => setForm({ ...form, ingredientBQuantity: event.target.value })} /></FormField>
      <FormField label="Ingredient 2 unit cost"><input className={inputClass} type="number" value={form.ingredientBUnitCost} onChange={(event) => setForm({ ...form, ingredientBUnitCost: event.target.value })} /></FormField>
      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">
        <Plus aria-hidden className="h-4 w-4" /> Save formula
      </button>
    </form>
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
    <AppShell>
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
          <form onSubmit={addIngredient} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
            <FormField label="Ingredient">
              <select className={inputClass} value={ingredient.ingredientId || options.rawMaterials[0]?.id || ""} onChange={(event) => setIngredient({ ...ingredient, ingredientId: event.target.value })}>
                {options.rawMaterials.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
              </select>
            </FormField>
            <FormField label="Quantity kg"><input className={inputClass} type="number" value={ingredient.quantityKg} onChange={(event) => setIngredient({ ...ingredient, quantityKg: event.target.value })} required /></FormField>
            <FormField label="Unit cost"><input className={inputClass} type="number" value={ingredient.unitCost} onChange={(event) => setIngredient({ ...ingredient, unitCost: event.target.value })} required /></FormField>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"><Plus aria-hidden className="h-4 w-4" /> Add ingredient</button>
          </form>
          <DataTable rows={formula?.ingredients ?? []} empty="No ingredients found" columns={[
            { key: "ingredient", label: "Ingredient", render: (row) => row.ingredient?.name ?? "-" },
            { key: "sku", label: "SKU", render: (row) => row.ingredient?.sku ?? "-" },
            { key: "qty", label: "Quantity kg", render: (row) => number(row.quantityKg) },
            { key: "unit", label: "Unit cost", render: (row) => money(row.unitCost) },
            { key: "line", label: "Line cost", render: (row) => money(Number(row.quantityKg) * Number(row.unitCost)) }
          ]} />
        </>
      )}
    </AppShell>
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
    <AppShell>
      <PageHeader title={create ? "Create Production Order" : "Feed Production Orders"} subtitle="Plan, approve, and monitor feed mill production orders." />
      {create ? <OrderForm options={options} form={form} setForm={setForm} submit={submit} /> : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/feed-production/orders/create"><Plus aria-hidden className="h-4 w-4" /> Create order</Link>}
      <OrderTable rows={rows} />
    </AppShell>
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
    <AppShell>
      <PageHeader title={String(batch?.batchNumber ?? "Production Batch Details")} subtitle="Batch raw material usage, QC status, packaging, finished stock, transfers, and costing." />
      <button className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={printLabel}>
        <Printer aria-hidden className="h-4 w-4" /> Print batch label
      </button>
      {label ? <pre className="mb-6 max-h-60 overflow-auto rounded-md border border-line bg-white p-4 text-xs shadow-panel">{JSON.stringify(label, null, 2)}</pre> : null}
      <pre className="max-h-[620px] overflow-auto rounded-md border border-line bg-white p-4 text-xs shadow-panel">{JSON.stringify(batch, null, 2)}</pre>
    </AppShell>
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
    <AppShell>
      <PageHeader title={title} subtitle={subtitle} />
      <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => String(row[key] ?? "-").slice(0, 90) }))} />
    </AppShell>
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
    <AppShell>
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
    </AppShell>
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
    <AppShell>
      <PageHeader title="Finished Feed Inventory" subtitle="Current finished feed stock by warehouse, batch, product, bag count, and unit cost." />
      <SimpleRowsTable rows={rows} />
    </AppShell>
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
    <AppShell>
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
    </AppShell>
  );
}

export function FeedReportsPage() {
  return (
    <AppShell>
      <PageHeader title="Feed Production Reports" subtitle="Export feed formula, production, cost, quality, stock, and transfer reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/feed-production/reports/summary.csv", "feed-production-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download feed summary CSV
      </button>
    </AppShell>
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

