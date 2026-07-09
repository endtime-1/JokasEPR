"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CircleCheckBig, ClipboardList, Factory, PackageCheck, Plus, RefreshCw, ShoppingCart, TrendingUp } from "lucide-react";
import { MarketPlanningShell } from "./market-planning-shell";
import { DataTable } from "./data-table";
import { ApiEnvelope, apiFetch } from "../lib/api";

type Option = { id: string; branchId?: string; productionSiteId?: string; code?: string; sku?: string; name: string; finishedProductId?: string };
type PlanningOptions = { branches: Option[]; productionSites: Option[]; warehouses: Option[]; finishedFeeds: Option[]; formulas: Option[]; rawMaterials: Option[] };
type TargetRow = { id: string; targetNumber: string; title: string; period: string; status: string; periodStart: string; periodEnd: string; targetKg?: number; itemCount?: number };
type TargetItem = { id: string; productId: string; baseQuantity: string | number; adjustmentPercent: string | number; finalTargetQuantity: string | number; bagSizeKg: string | number; targetQuantityKg: string | number; approvalStatus: string; product?: { name: string; sku: string } };
type TargetDetail = TargetRow & { branchId?: string; productionSiteId?: string; items: TargetItem[]; productionPlans: PlanRow[]; mrps: MrpRow[]; recommendations: RecommendationRow[] };
type PlanRow = { id: string; planNumber: string; marketTargetId: string; productionSiteId: string; centralWarehouseId: string; status: string; totalPlannedKg: string | number; producedQuantityKg?: number; createdAt: string; items?: PlanItem[] };
type PlanItem = { id: string; productId: string; plannedQuantityKg: string | number; producedQuantityKg: string | number; status: string; product?: { name: string; sku: string } };
type MrpRow = { id: string; mrpNumber: string; status: string; totalRequiredKg: string | number; totalAvailableKg: string | number; totalShortageKg: string | number; centralWarehouseId: string; createdAt: string; items?: MrpItem[]; checks?: unknown[]; recommendations?: RecommendationRow[] };
type MrpItem = { id: string; rawMaterialId: string; requiredQuantityKg: string | number; availableQuantityKg: string | number; shortageQuantityKg: string | number; estimatedShortageCost: string | number; rawMaterial?: { name: string; sku: string }; finishedProduct?: { name: string; sku: string } };
type RecommendationRow = { id: string; rawMaterialId: string; recommendedQuantityKg: string | number; estimatedTotalCost: string | number; status: string; purchaseRequestId?: string; rawMaterial?: { name: string; sku: string } };
type Dashboard = {
  currentWeekTarget: TargetRow | null;
  adjustedTarget: number;
  targetKg: number;
  requiredRawMaterials: number;
  availableRawMaterials: number;
  shortageMaterials: number;
  procurementPending: number;
  productionPending: number;
  productionCompleted: number;
  finishedGoodsInventory: number;
  salesAchieved: number;
  targetAchievementPercentage: number;
  recentTargets: TargetRow[];
  recentPlans: PlanRow[];
  recentMrps: MrpRow[];
  recentRecommendations: RecommendationRow[];
};
type ReportRow = {
  marketTargetId: string;
  productionPlanId?: string;
  periodStart: string;
  periodEnd: string;
  targetKg: number;
  productionTargetKg: number;
  requiredRawMaterialKg: number;
  procuredRawMaterialKg: number;
  actualProducedKg: number;
  finishedGoodsKg: number;
  actualSalesKg: number;
  targetAchievementPct: number;
  salesAchievementPct: number;
};

const inputClass = "min-h-11 rounded-md border border-line px-3";
const today = () => new Date().toISOString().slice(0, 10);
const nextWeek = () => new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const monthEnd = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `GHS ${number(value)}`;
}

function useOptions() {
  const [options, setOptions] = useState<PlanningOptions>({ branches: [], productionSites: [], warehouses: [], finishedFeeds: [], formulas: [], rawMaterials: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<PlanningOptions>>("/market-planning/options")
      .then((res) => setOptions(res.data ?? { branches: [], productionSites: [], warehouses: [], finishedFeeds: [], formulas: [], rawMaterials: [] }))
      .catch(() => undefined);
  }, []);
  return options;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-ink/65">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/market-planning/targets">
          Targets
        </Link>
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/market-planning/mrp">
          MRP
        </Link>
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/market-planning/reports/target-vs-actual">
          Reports
        </Link>
      </div>
    </div>
  );
}

function Card({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof TrendingUp }) {
  return (
    <article className="rounded-md border border-line bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink/65">{label}</p>
        <Icon className="h-4 w-4 text-brand" aria-hidden />
      </div>
      <strong className="mt-3 block text-2xl font-semibold">{value}</strong>
    </article>
  );
}

function TargetTable({ rows }: { rows: TargetRow[] }) {
  return (
    <DataTable<TargetRow>
      rows={rows}
      empty="No market targets found."
      columns={[
        { key: "targetNumber", label: "Target", render: (row) => <Link className="font-semibold text-brand hover:underline" href={`/market-planning/targets/${row.id}`}>{row.targetNumber}</Link> },
        { key: "title", label: "Title" },
        { key: "period", label: "Period" },
        { key: "status", label: "Status" },
        { key: "targetKg", label: "Target kg", render: (row) => number(row.targetKg) },
        { key: "itemCount", label: "Items", render: (row) => number(row.itemCount) }
      ]}
    />
  );
}

function PlanTable({ rows }: { rows: PlanRow[] }) {
  return (
    <DataTable<PlanRow>
      rows={rows}
      empty="No production plans found."
      columns={[
        { key: "planNumber", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "totalPlannedKg", label: "Planned kg", render: (row) => number(row.totalPlannedKg) },
        { key: "producedQuantityKg", label: "Produced kg", render: (row) => number(row.producedQuantityKg) },
        { key: "createdAt", label: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() }
      ]}
    />
  );
}

function MrpTable({ rows }: { rows: MrpRow[] }) {
  return (
    <DataTable<MrpRow>
      rows={rows}
      empty="No MRP checks found."
      columns={[
        { key: "mrpNumber", label: "MRP" },
        { key: "status", label: "Status" },
        { key: "totalRequiredKg", label: "Required kg", render: (row) => number(row.totalRequiredKg) },
        { key: "totalAvailableKg", label: "Available kg", render: (row) => number(row.totalAvailableKg) },
        { key: "totalShortageKg", label: "Shortage kg", render: (row) => number(row.totalShortageKg) }
      ]}
    />
  );
}

function RecommendationTable({ rows }: { rows: RecommendationRow[] }) {
  return (
    <DataTable<RecommendationRow>
      rows={rows}
      empty="No procurement recommendations found."
      columns={[
        { key: "rawMaterialId", label: "Material", render: (row) => row.rawMaterial?.name ?? row.rawMaterialId },
        { key: "recommendedQuantityKg", label: "Quantity kg", render: (row) => number(row.recommendedQuantityKg) },
        { key: "estimatedTotalCost", label: "Estimate", render: (row) => money(row.estimatedTotalCost) },
        { key: "status", label: "Status" },
        { key: "purchaseRequestId", label: "Purchase request", render: (row) => row.purchaseRequestId ?? "-" }
      ]}
    />
  );
}

export function MarketTargetListPage() {
  const [rows, setRows] = useState<TargetRow[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<TargetRow[]>>("/market-planning/targets")
      .then((res) => setRows(res.data))
      .catch(() => undefined);
  }, []);
  return (
    <MarketPlanningShell>
      <Header title="Market Targets" subtitle="Weekly and monthly targets that become approved feed production plans." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/market-planning/targets/create-weekly"><Plus className="h-4 w-4" /> Weekly target</Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" href="/market-planning/targets/create-monthly"><Plus className="h-4 w-4" /> Monthly target</Link>
      </div>
      <TargetTable rows={rows} />
    </MarketPlanningShell>
  );
}

export function CreateMarketTargetPage({ period }: { period: "WEEKLY" | "MONTHLY" }) {
  const options = useOptions();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: period === "WEEKLY" ? "Weekly feed market target" : "Monthly feed market target",
    periodStart: today(),
    periodEnd: period === "WEEKLY" ? nextWeek() : monthEnd(),
    branchId: "",
    productionSiteId: "",
    productId: "",
    formulaId: "",
    baseQuantity: "100",
    adjustmentPercent: "10",
    bagSizeKg: "50",
    reason: "Demand forecast adjustment"
  });

  const formulas = useMemo(() => options.formulas.filter((f) => !form.productId || f.finishedProductId === form.productId), [options.formulas, form.productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await apiFetch<ApiEnvelope<TargetRow>>("/market-planning/targets", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        period,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        branchId: form.branchId || undefined,
        productionSiteId: form.productionSiteId || undefined,
        items: [{
          productId: form.productId || options.finishedFeeds[0]?.id,
          formulaId: form.formulaId || formulas[0]?.id,
          baseQuantity: Number(form.baseQuantity),
          adjustmentPercent: Number(form.adjustmentPercent),
          bagSizeKg: Number(form.bagSizeKg),
          adjustmentReason: form.reason,
          demandEstimateNotes: form.reason
        }]
      })
    });
    setMessage(`Created ${response.data.targetNumber}`);
  }

  return (
    <MarketPlanningShell>
      <Header title={period === "WEEKLY" ? "Create Weekly Market Target" : "Create Monthly Market Target"} subtitle="Enter demand estimates and percentage adjustments before management approval." />
      <form onSubmit={submit} className="app-card grid gap-4 p-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold md:col-span-2">Title<input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Start date<input className={inputClass} type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">End date<input className={inputClass} type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Branch<select className={inputClass} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">Auto</option>{options.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Production site<select className={inputClass} value={form.productionSiteId} onChange={(e) => setForm({ ...form, productionSiteId: e.target.value })}><option value="">Select later</option>{options.productionSites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Feed product<select required className={inputClass} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value, formulaId: "" })}><option value="">Select product</option>{options.finishedFeeds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Formula<select className={inputClass} value={form.formulaId} onChange={(e) => setForm({ ...form, formulaId: e.target.value })}><option value="">Active formula</option>{formulas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Base bags<input className={inputClass} type="number" min="0" step="0.01" value={form.baseQuantity} onChange={(e) => setForm({ ...form, baseQuantity: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Adjustment %<input className={inputClass} type="number" step="0.01" value={form.adjustmentPercent} onChange={(e) => setForm({ ...form, adjustmentPercent: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Bag size kg<input className={inputClass} type="number" min="1" step="0.01" value={form.bagSizeKg} onChange={(e) => setForm({ ...form, bagSizeKg: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold md:col-span-2">Adjustment reason<textarea className="min-h-24 rounded-md border border-line px-3 py-2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
        <div className="flex items-center gap-3 md:col-span-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><Plus className="h-4 w-4" /> Create target</button>{message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}</div>
      </form>
    </MarketPlanningShell>
  );
}

export function MarketTargetDetailsPage() {
  const params = useParams<{ id: string }>();
  const options = useOptions();
  const [target, setTarget] = useState<TargetDetail | null>(null);
  const [approve, setApprove] = useState({ productionSiteId: "", centralWarehouseId: "", notes: "" });
  async function load() {
    const res = await apiFetch<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`);
    setTarget(res.data);
  }
  useEffect(() => { load().catch(() => undefined); }, [params.id]);
  async function approveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/targets/${params.id}/approve`, { method: "PATCH", body: JSON.stringify(approve) });
    await load();
  }
  return (
    <MarketPlanningShell>
      <Header title={target?.targetNumber ?? "Market Target"} subtitle={target?.title ?? "Target details, production plan, MRP, recommendations, and approval trail."} />
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card label="Status" value={target?.status ?? "-"} icon={CircleCheckBig} />
        <Card label="Target kg" value={number(target?.items?.reduce((s, i) => s + Number(i.targetQuantityKg ?? 0), 0))} icon={TrendingUp} />
        <Card label="Items" value={number(target?.items?.length)} icon={ClipboardList} />
        <Card label="Plans" value={number(target?.productionPlans?.length)} icon={Factory} />
      </section>
      <form onSubmit={approveTarget} className="app-card mb-6 grid gap-4 p-5 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Production site<select required className={inputClass} value={approve.productionSiteId} onChange={(e) => setApprove({ ...approve, productionSiteId: e.target.value })}><option value="">Select</option>{options.productionSites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Central warehouse<select required className={inputClass} value={approve.centralWarehouseId} onChange={(e) => setApprove({ ...approve, centralWarehouseId: e.target.value })}><option value="">Select</option>{options.warehouses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Notes<input className={inputClass} value={approve.notes} onChange={(e) => setApprove({ ...approve, notes: e.target.value })} /></label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:w-fit" type="submit"><CircleCheckBig className="h-4 w-4" /> Approve and plan</button>
      </form>
      <section className="grid gap-6 xl:grid-cols-2">
        <div><h3 className="mb-3 text-lg font-semibold">Target items</h3><DataTable<TargetItem> rows={target?.items ?? []} empty="No target items." columns={[{ key: "productId", label: "Product", render: (row) => row.product?.name ?? row.productId }, { key: "baseQuantity", label: "Base bags", render: (row) => number(row.baseQuantity) }, { key: "adjustmentPercent", label: "Adjustment %", render: (row) => number(row.adjustmentPercent) }, { key: "targetQuantityKg", label: "Target kg", render: (row) => number(row.targetQuantityKg) }, { key: "approvalStatus", label: "Status" }]} /></div>
        <div><h3 className="mb-3 text-lg font-semibold">Production plans</h3><PlanTable rows={target?.productionPlans ?? []} /></div>
      </section>
    </MarketPlanningShell>
  );
}

export function TargetAdjustmentPage() {
  const params = useParams<{ id: string }>();
  const [target, setTarget] = useState<TargetDetail | null>(null);
  const [itemId, setItemId] = useState("");
  const [adjustmentPercent, setAdjustmentPercent] = useState("10");
  const [reason, setReason] = useState("Demand change");
  async function load() {
    const res = await apiFetch<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`);
    setTarget(res.data);
  }
  useEffect(() => { load().catch(() => undefined); }, [params.id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/targets/${params.id}/items/${itemId || target?.items?.[0]?.id}/adjust`, { method: "PATCH", body: JSON.stringify({ adjustmentPercent: Number(adjustmentPercent), reason }) });
    await load();
  }
  return (
    <MarketPlanningShell>
      <Header title="Target Adjustment" subtitle="Apply demand percentage changes and preserve the adjustment reason for approval and audit." />
      <form onSubmit={submit} className="app-card grid gap-4 p-5 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Target item<select required className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Select item</option>{target?.items?.map((x) => <option key={x.id} value={x.id}>{x.product?.name ?? x.productId}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Adjustment %<input className={inputClass} type="number" step="0.01" value={adjustmentPercent} onChange={(e) => setAdjustmentPercent(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Reason<input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:w-fit" type="submit"><RefreshCw className="h-4 w-4" /> Adjust target</button>
      </form>
    </MarketPlanningShell>
  );
}

export function ProductionPlanPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planId, setPlanId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data)).catch(() => undefined); }, []);
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await apiFetch<ApiEnvelope<MrpRow>>(`/market-planning/production-plans/${planId}/mrp`, { method: "POST", body: JSON.stringify({}) });
    setMessage(`Created ${res.data.mrpNumber}`);
  }
  return (
    <MarketPlanningShell>
      <Header title="Production Plans" subtitle="Approved market targets translated into feed mill production plans." />
      <form onSubmit={calculate} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <label className="grid min-w-72 gap-1 text-sm font-semibold">Plan<select required className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.planNumber}</option>)}</select></label>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><PackageCheck className="h-4 w-4" /> Calculate MRP</button>
        {message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}
      </form>
      <PlanTable rows={plans} />
    </MarketPlanningShell>
  );
}

export function MaterialRequirementPlanningPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [mrps, setMrps] = useState<MrpRow[]>([]);
  const [planId, setPlanId] = useState("");
  useEffect(() => {
    apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data)).catch(() => undefined);
  }, []);
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await apiFetch<ApiEnvelope<MrpRow>>(`/market-planning/production-plans/${planId}/mrp`, { method: "POST", body: JSON.stringify({}) });
    setMrps([res.data, ...mrps]);
  }
  return (
    <MarketPlanningShell>
      <Header title="Material Requirement Planning" subtitle="Calculate raw material needs from active feed formulas and central inventory." />
      <form onSubmit={calculate} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <label className="grid min-w-72 gap-1 text-sm font-semibold">Production plan<select required className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.planNumber}</option>)}</select></label>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><PackageCheck className="h-4 w-4" /> Run availability check</button>
      </form>
      <MrpTable rows={mrps.length ? mrps : plans.flatMap((p) => [])} />
    </MarketPlanningShell>
  );
}

export function InventoryAvailabilityCheckPage() {
  return <MaterialRequirementPlanningPage />;
}

export function ProcurementRecommendationPage({ convert = false }: { convert?: boolean }) {
  const [rows, setRows] = useState<RecommendationRow[]>([]);
  const [mrpId, setMrpId] = useState("");
  const [recommendationId, setRecommendationId] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    const res = await apiFetch<ApiEnvelope<RecommendationRow[]>>("/market-planning/recommendations");
    setRows(res.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/mrp/${mrpId}/recommendations`, { method: "POST", body: JSON.stringify({ notes: "Generated from MRP shortage" }) });
    await load();
  }
  async function convertOne(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/recommendations/${recommendationId || rows[0]?.id}/convert-to-purchase-request`, { method: "POST", body: JSON.stringify({ notes: "Converted from market-led MRP" }) });
    setMessage("Converted to purchase request");
    await load();
  }
  return (
    <MarketPlanningShell>
      <Header title={convert ? "Convert Recommendation" : "Procurement Recommendations"} subtitle="Turn raw material shortages into purchase requests linked to the originating market target and MRP." />
      {convert ? (
        <form onSubmit={convertOne} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
          <label className="grid min-w-80 gap-1 text-sm font-semibold">Recommendation<select required className={inputClass} value={recommendationId} onChange={(e) => setRecommendationId(e.target.value)}><option value="">Select recommendation</option>{rows.filter((r) => r.status === "OPEN").map((x) => <option key={x.id} value={x.id}>{x.rawMaterial?.name ?? x.rawMaterialId} - {number(x.recommendedQuantityKg)} kg</option>)}</select></label>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><ShoppingCart className="h-4 w-4" /> Convert</button>
          {message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}
        </form>
      ) : (
        <form onSubmit={generate} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
          <label className="grid min-w-80 gap-1 text-sm font-semibold">MRP ID<input required className={inputClass} value={mrpId} onChange={(e) => setMrpId(e.target.value)} placeholder="Paste MRP ID from details or API result" /></label>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><ShoppingCart className="h-4 w-4" /> Generate recommendations</button>
        </form>
      )}
      <RecommendationTable rows={rows} />
    </MarketPlanningShell>
  );
}

export function ProductionExecutionPage() {
  const options = useOptions();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [form, setForm] = useState({ planId: "", productionPlanItemId: "", rawMaterialWarehouseId: "", finishedGoodsWarehouseId: "", producedQuantityKg: "1000", wastageKg: "0" });
  const [message, setMessage] = useState("");
  useEffect(() => { apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data)).catch(() => undefined); }, []);
  async function selectPlan(planId: string) {
    setForm({ ...form, planId, productionPlanItemId: "" });
    if (!planId) return setPlan(null);
    const res = await apiFetch<ApiEnvelope<PlanRow>>(`/market-planning/production-plans/${planId}`);
    setPlan(res.data);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/market-planning/executions", { method: "POST", body: JSON.stringify({ ...form, producedQuantityKg: Number(form.producedQuantityKg), wastageKg: Number(form.wastageKg) }) });
    setMessage("Production execution posted to inventory");
  }
  return (
    <MarketPlanningShell>
      <Header title="Production Execution" subtitle="Consume raw materials from central inventory and post finished feed back into finished goods inventory." />
      <form onSubmit={submit} className="app-card grid gap-4 p-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Production plan<select required className={inputClass} value={form.planId} onChange={(e) => selectPlan(e.target.value)}><option value="">Select plan</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.planNumber}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Plan item<select required className={inputClass} value={form.productionPlanItemId} onChange={(e) => setForm({ ...form, productionPlanItemId: e.target.value })}><option value="">Select item</option>{plan?.items?.map((x) => <option key={x.id} value={x.id}>{x.product?.name ?? x.productId} - {number(x.plannedQuantityKg)} kg</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Raw material warehouse<select required className={inputClass} value={form.rawMaterialWarehouseId} onChange={(e) => setForm({ ...form, rawMaterialWarehouseId: e.target.value })}><option value="">Select warehouse</option>{options.warehouses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Finished goods warehouse<select required className={inputClass} value={form.finishedGoodsWarehouseId} onChange={(e) => setForm({ ...form, finishedGoodsWarehouseId: e.target.value })}><option value="">Select warehouse</option>{options.warehouses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Produced kg<input className={inputClass} type="number" min="0" step="0.01" value={form.producedQuantityKg} onChange={(e) => setForm({ ...form, producedQuantityKg: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">Wastage kg<input className={inputClass} type="number" min="0" step="0.01" value={form.wastageKg} onChange={(e) => setForm({ ...form, wastageKg: e.target.value })} /></label>
        <div className="flex items-center gap-3 md:col-span-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><Factory className="h-4 w-4" /> Post execution</button>{message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}</div>
      </form>
    </MarketPlanningShell>
  );
}

export function TargetVsActualReportPage({ demandOnly = false }: { demandOnly?: boolean }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<ReportRow[]>>(demandOnly ? "/market-planning/reports/demand-vs-sales" : "/market-planning/reports/target-vs-actual")
      .then((res) => setRows(res.data))
      .catch(() => undefined);
  }, [demandOnly]);
  return (
    <MarketPlanningShell>
      <Header title={demandOnly ? "Market Demand vs Sales" : "Target vs Actual Report"} subtitle="Compare market targets, production targets, required materials, procurement, actual production, finished goods, and sales." />
      <DataTable<ReportRow>
        rows={rows}
        empty="No report rows found."
        columns={[
          { key: "periodStart", label: "Start", render: (row) => new Date(row.periodStart).toLocaleDateString() },
          { key: "periodEnd", label: "End", render: (row) => new Date(row.periodEnd).toLocaleDateString() },
          { key: "targetKg", label: "Target kg", render: (row) => number(row.targetKg) },
          { key: "actualProducedKg", label: "Produced kg", render: (row) => number(row.actualProducedKg) },
          { key: "actualSalesKg", label: "Sales kg", render: (row) => number(row.actualSalesKg) },
          { key: "targetAchievementPct", label: "Production %", render: (row) => `${number(row.targetAchievementPct)}%` },
          { key: "salesAchievementPct", label: "Sales %", render: (row) => `${number(row.salesAchievementPct)}%` }
        ]}
      />
    </MarketPlanningShell>
  );
}
