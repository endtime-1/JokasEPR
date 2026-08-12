"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CircleCheckBig, ClipboardList, Factory, PackageCheck, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, TrendingUp } from "lucide-react";
import { DataTable } from "./data-table";
import { ConfirmModal, LockedNote } from "./ui";
import { ApiEnvelope, apiFetch, getCached, getCachedFirst, hasCached, invalidateCache } from "../lib/api";

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
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `GHS ${number(value)}`;
}

function useOptions() {
  const [options, setOptions] = useState<PlanningOptions>(() => getCached<ApiEnvelope<PlanningOptions>>("/market-planning/options")?.data ?? { branches: [], productionSites: [], warehouses: [], finishedFeeds: [], formulas: [], rawMaterials: [] });
  const [optionsError, setOptionsError] = useState("");
  const [_planOptKey, _setPlanOptKey] = useState(0);
  const forceAccept = useRef(false);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<PlanningOptions>>("/market-planning/options")
      .then((res) => {
        const fresh = res.data ?? { branches: [], productionSites: [], warehouses: [], finishedFeeds: [], formulas: [], rawMaterials: [] };
        setOptions((prev) => !force && fresh.rawMaterials.length === 0 && prev.rawMaterials.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load options."));
  }, [_planOptKey]);
  useEffect(() => {
    function onRecovered() { _setPlanOptKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);
  return { options, optionsError };
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

// Delete is only offered for DRAFT/SUBMITTED targets — matches the backend
// guard exactly (deleteTarget rejects anything APPROVED+, since production
// plans/MRP/recommendations already depend on it by then).
const TARGET_DELETABLE_STATUSES = ["DRAFT", "SUBMITTED"];

function TargetTable({ rows, loading, onDelete }: { rows: TargetRow[]; loading?: boolean; onDelete?: (row: TargetRow) => void }) {
  return (
    <DataTable<TargetRow>
      rows={rows}
      loading={loading}
      empty="No market targets found."
      columns={[
        { key: "targetNumber", label: "Target", render: (row) => <Link className="font-semibold text-brand hover:underline" href={`/market-planning/targets/${row.id}`}>{row.targetNumber}</Link> },
        { key: "title", label: "Title" },
        { key: "period", label: "Period" },
        { key: "status", label: "Status" },
        { key: "targetKg", label: "Target kg", render: (row) => number(row.targetKg) },
        { key: "itemCount", label: "Items", render: (row) => number(row.itemCount) },
        ...(onDelete ? [{
          key: "actions", label: "", render: (row: TargetRow) => (
            TARGET_DELETABLE_STATUSES.includes(row.status) ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                onClick={(e) => { e.stopPropagation(); onDelete(row); }}
                title="Delete target"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : (
              <LockedNote reason={`${row.status.charAt(0) + row.status.slice(1).toLowerCase()} targets can't be deleted — only Draft or Submitted ones can.`} />
            )
          )
        }] : [])
      ]}
    />
  );
}

// Mirrors deleteProductionPlan's guard exactly: delete allowed only before
// an MRP run or execution could depend on it.
const PLAN_DELETABLE_STATUSES = ["DRAFT", "READY_FOR_APPROVAL"];
// Mirrors deleteMrp's guard: delete allowed only before a procurement
// recommendation could depend on it.
const MRP_DELETABLE_STATUSES = ["DRAFT", "CALCULATED", "SHORTAGE"];

function PlanTable({ rows, loading, onDelete }: { rows: PlanRow[]; loading?: boolean; onDelete?: (row: PlanRow) => void }) {
  return (
    <DataTable<PlanRow>
      rows={rows}
      loading={loading}
      empty="No production plans found."
      columns={[
        { key: "planNumber", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "totalPlannedKg", label: "Planned kg", render: (row) => number(row.totalPlannedKg) },
        { key: "producedQuantityKg", label: "Produced kg", render: (row) => number(row.producedQuantityKg) },
        { key: "createdAt", label: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
        ...(onDelete ? [{
          key: "actions", label: "", render: (row: PlanRow) => (
            PLAN_DELETABLE_STATUSES.includes(row.status) ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onDelete(row); }} title="Delete production plan">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : <LockedNote reason={`${row.status.charAt(0) + row.status.slice(1).toLowerCase().replace(/_/g, " ")} plans can't be deleted — only Draft or Ready-for-approval ones can.`} />
          )
        }] : [])
      ]}
    />
  );
}

function MrpTable({ rows, loading, onDelete }: { rows: MrpRow[]; loading?: boolean; onDelete?: (row: MrpRow) => void }) {
  return (
    <DataTable<MrpRow>
      rows={rows}
      loading={loading}
      empty="No MRP checks found."
      columns={[
        { key: "mrpNumber", label: "MRP" },
        { key: "status", label: "Status" },
        { key: "totalRequiredKg", label: "Required kg", render: (row) => number(row.totalRequiredKg) },
        { key: "totalAvailableKg", label: "Available kg", render: (row) => number(row.totalAvailableKg) },
        { key: "totalShortageKg", label: "Shortage kg", render: (row) => number(row.totalShortageKg) },
        ...(onDelete ? [{
          key: "actions", label: "", render: (row: MrpRow) => (
            MRP_DELETABLE_STATUSES.includes(row.status) ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onDelete(row); }} title="Delete MRP run">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : <LockedNote reason={`${row.status.charAt(0) + row.status.slice(1).toLowerCase().replace(/_/g, " ")} MRP runs can't be deleted — only Draft, Calculated, or Shortage ones can.`} />
          )
        }] : [])
      ]}
    />
  );
}

function RecommendationTable({ rows, loading, onCancel }: { rows: RecommendationRow[]; loading?: boolean; onCancel?: (row: RecommendationRow) => void }) {
  return (
    <DataTable<RecommendationRow>
      rows={rows}
      loading={loading}
      empty="No procurement recommendations found."
      columns={[
        { key: "rawMaterialId", label: "Material", render: (row) => row.rawMaterial?.name ?? row.rawMaterialId },
        { key: "recommendedQuantityKg", label: "Quantity kg", render: (row) => number(row.recommendedQuantityKg) },
        { key: "estimatedTotalCost", label: "Estimate", render: (row) => money(row.estimatedTotalCost) },
        { key: "status", label: "Status" },
        { key: "purchaseRequestId", label: "Purchase request", render: (row) => row.purchaseRequestId ?? "-" },
        ...(onCancel ? [{
          key: "actions", label: "", render: (row: RecommendationRow) => (
            row.status === "OPEN" ? (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onCancel(row); }} title="Cancel recommendation">
                <Trash2 className="h-3.5 w-3.5" /> Cancel
              </button>
            ) : <LockedNote reason={`${row.status.charAt(0) + row.status.slice(1).toLowerCase().replace(/_/g, " ")} recommendations can't be cancelled — only Open ones can.`} />
          )
        }] : [])
      ]}
    />
  );
}

export function MarketTargetListPage() {
  const [rows, setRows] = useState<TargetRow[]>(() => getCachedFirst<ApiEnvelope<TargetRow[]>>("/market-planning/targets")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/market-planning/targets"));
  const [loadError, setLoadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TargetRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<TargetRow[]>>("/market-planning/targets")
      .then((res) => { const fresh = res.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/market-planning/targets/${deleteTarget.id}`, { method: "DELETE" });
      invalidateCache("/market-planning/targets", true);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete target.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Header title="Market Targets" subtitle="Weekly and monthly targets that become approved feed production plans." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/market-planning/targets/create-weekly"><Plus className="h-4 w-4" /> Weekly target</Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" href="/market-planning/targets/create-monthly"><Plus className="h-4 w-4" /> Monthly target</Link>
      </div>
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <TargetTable rows={rows} loading={loading} onDelete={(row) => { setDeleteError(""); setDeleteTarget(row); }} />
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete market target?"
        message={`This will permanently remove "${deleteTarget?.title}" (${deleteTarget?.targetNumber}). This can't be undone.`}
        confirmLabel="Delete target"
      />
    </>
  );
}

export function CreateMarketTargetPage({ period }: { period: "WEEKLY" | "MONTHLY" }) {
  const { options, optionsError } = useOptions();
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
    <>
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
    </>
  );
}

// Mirrors the backend guard exactly (market-planning.service.ts's
// updateTarget/deleteTarget): editing is DRAFT-only, delete allowed for
// DRAFT and SUBMITTED — once APPROVED, production plans/MRP/recommendations
// already depend on the target's values.
const TARGET_EDITABLE_STATUSES = ["DRAFT"];
const TARGET_DELETABLE_STATUSES_DETAIL = ["DRAFT", "SUBMITTED"];

export function MarketTargetDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { options, optionsError } = useOptions();
  const [target, setTarget] = useState<TargetDetail | null>(() => getCachedFirst<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`)?.data ?? null);
  const [approve, setApprove] = useState({ productionSiteId: "", centralWarehouseId: "", notes: "" });
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", periodStart: "", periodEnd: "", notes: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletePlanRow, setDeletePlanRow] = useState<PlanRow | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deletePlanError, setDeletePlanError] = useState("");

  async function load() {
    setLoadError("");
    const res = await apiFetch<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`);
    setTarget(res.data);
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, [params.id]);

  async function confirmDeletePlan() {
    if (!deletePlanRow) return;
    setDeletingPlan(true);
    setDeletePlanError("");
    try {
      await apiFetch(`/market-planning/production-plans/${deletePlanRow.id}`, { method: "DELETE" });
      invalidateCache("/market-planning/production-plans", true);
      setDeletePlanRow(null);
      await load();
    } catch (err: any) {
      setDeletePlanError(err?.message ?? "Failed to delete production plan.");
    } finally {
      setDeletingPlan(false);
    }
  }

  async function approveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/targets/${params.id}/approve`, { method: "PATCH", body: JSON.stringify(approve) });
    await load();
  }

  function startEdit() {
    if (!target) return;
    setEditForm({
      title: target.title,
      periodStart: target.periodStart?.slice(0, 10) ?? "",
      periodEnd: target.periodEnd?.slice(0, 10) ?? "",
      notes: (target as unknown as { notes?: string }).notes ?? ""
    });
    setEditError("");
    setEditing(true);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/market-planning/targets/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editForm.title, periodStart: editForm.periodStart, periodEnd: editForm.periodEnd, notes: editForm.notes || undefined })
      });
      invalidateCache("/market-planning/targets", true);
      setEditing(false);
      await load();
    } catch (err: any) {
      setEditError(err?.message ?? "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/market-planning/targets/${params.id}`, { method: "DELETE" });
      invalidateCache("/market-planning/targets", true);
      router.push("/market-planning/targets");
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete target.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const canEdit = !!target && TARGET_EDITABLE_STATUSES.includes(target.status);
  const canDelete = !!target && TARGET_DELETABLE_STATUSES_DETAIL.includes(target.status);

  return (
    <>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <Header title={target?.targetNumber ?? "Market Target"} subtitle={target?.title ?? "Target details, production plan, MRP, recommendations, and approval trail."} />
        <div className="flex gap-2">
          {canEdit && (
            <button type="button" onClick={startEdit} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => { setDeleteError(""); setConfirmDelete(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-600 hover:bg-red-100">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>
      {!canEdit && !canDelete && target && (
        <p className="mb-4 text-xs text-ink/45">This target is {target.status.toLowerCase()} — editing and deleting are only available for DRAFT (or SUBMITTED, for delete) targets.</p>
      )}
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}

      {editing && (
        <form onSubmit={saveEdit} className="app-card mb-6 grid gap-4 p-5 md:grid-cols-2">
          <h3 className="text-sm font-bold text-ink md:col-span-2">Edit target</h3>
          {editError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{editError}</p>}
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">Title<input required className={inputClass} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">Start date<input required className={inputClass} type="date" value={editForm.periodStart} onChange={(e) => setEditForm({ ...editForm, periodStart: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">End date<input required className={inputClass} type="date" value={editForm.periodEnd} onChange={(e) => setEditForm({ ...editForm, periodEnd: e.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">Notes<textarea className="min-h-20 rounded-md border border-line px-3 py-2" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
          <div className="flex gap-3 md:col-span-2">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</button>
            <button type="button" className="app-button-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</button>
          </div>
        </form>
      )}

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
        <div>
          <h3 className="mb-3 text-lg font-semibold">Production plans</h3>
          {deletePlanError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deletePlanError}</p>}
          <PlanTable rows={target?.productionPlans ?? []} onDelete={(row) => { setDeletePlanError(""); setDeletePlanRow(row); }} />
        </div>
      </section>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete market target?"
        message={`This will permanently remove "${target?.title}" (${target?.targetNumber}). This can't be undone.`}
        confirmLabel="Delete target"
      />
      <ConfirmModal
        open={!!deletePlanRow}
        onClose={() => setDeletePlanRow(null)}
        onConfirm={confirmDeletePlan}
        loading={deletingPlan}
        title="Delete production plan?"
        message={`This will permanently remove plan "${deletePlanRow?.planNumber}". This can't be undone.`}
        confirmLabel="Delete plan"
      />
    </>
  );
}

export function TargetAdjustmentPage() {
  const params = useParams<{ id: string }>();
  const [target, setTarget] = useState<TargetDetail | null>(() => getCachedFirst<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`)?.data ?? null);
  const [itemId, setItemId] = useState("");
  const [adjustmentPercent, setAdjustmentPercent] = useState("10");
  const [reason, setReason] = useState("Demand change");
  const [loadError, setLoadError] = useState("");
  async function load() {
    setLoadError("");
    const res = await apiFetch<ApiEnvelope<TargetDetail>>(`/market-planning/targets/${params.id}`);
    setTarget(res.data);
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, [params.id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(`/market-planning/targets/${params.id}/items/${itemId || target?.items?.[0]?.id}/adjust`, { method: "PATCH", body: JSON.stringify({ adjustmentPercent: Number(adjustmentPercent), reason }) });
    await load();
  }
  return (
    <>
      <Header title="Target Adjustment" subtitle="Apply demand percentage changes and preserve the adjustment reason for approval and audit." />
      <form onSubmit={submit} className="app-card grid gap-4 p-5 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Target item<select required className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Select item</option>{target?.items?.map((x) => <option key={x.id} value={x.id}>{x.product?.name ?? x.productId}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Adjustment %<input className={inputClass} type="number" step="0.01" value={adjustmentPercent} onChange={(e) => setAdjustmentPercent(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Reason<input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:w-fit" type="submit"><RefreshCw className="h-4 w-4" /> Adjust target</button>
      </form>
    </>
  );
}

export function ProductionPlanPage() {
  const [plans, setPlans] = useState<PlanRow[]>(() => getCachedFirst<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/market-planning/production-plans"));
  const [planId, setPlanId] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [deletePlan, setDeletePlan] = useState<PlanRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data ?? [])).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await apiFetch<ApiEnvelope<MrpRow>>(`/market-planning/production-plans/${planId}/mrp`, { method: "POST", body: JSON.stringify({}) });
    setMessage(`Created ${res.data.mrpNumber}`);
  }

  async function confirmDelete() {
    if (!deletePlan) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/market-planning/production-plans/${deletePlan.id}`, { method: "DELETE" });
      invalidateCache("/market-planning/production-plans", true);
      setDeletePlan(null);
      load();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete production plan.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Header title="Production Plans" subtitle="Approved market targets translated into feed mill production plans." />
      <form onSubmit={calculate} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <label className="grid min-w-72 gap-1 text-sm font-semibold">Plan<select required className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.planNumber}</option>)}</select></label>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><PackageCheck className="h-4 w-4" /> Calculate MRP</button>
        {message && <span className="text-sm font-semibold text-emerald-700">{message}</span>}
      </form>
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <PlanTable rows={plans} loading={loading} onDelete={(row) => { setDeleteError(""); setDeletePlan(row); }} />
      <ConfirmModal
        open={!!deletePlan}
        onClose={() => setDeletePlan(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete production plan?"
        message={`This will permanently remove plan "${deletePlan?.planNumber}". This can't be undone.`}
        confirmLabel="Delete plan"
      />
    </>
  );
}

export function MaterialRequirementPlanningPage() {
  const [plans, setPlans] = useState<PlanRow[]>(() => getCachedFirst<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans")?.data ?? []);
  const [mrps, setMrps] = useState<MrpRow[]>(() => getCachedFirst<ApiEnvelope<MrpRow[]>>("/market-planning/mrp")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/market-planning/mrp"));
  const [planId, setPlanId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [deleteMrpRow, setDeleteMrpRow] = useState<MrpRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function loadMrps() {
    apiFetch<ApiEnvelope<MrpRow[]>>("/market-planning/mrp").then((res) => setMrps(res.data ?? [])).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }
  useEffect(() => {
    apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data ?? [])).catch((err: any) => setLoadError(err?.message ?? "Failed to load."));
    loadMrps();
  }, []);
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch<ApiEnvelope<MrpRow>>(`/market-planning/production-plans/${planId}/mrp`, { method: "POST", body: JSON.stringify({}) });
    invalidateCache("/market-planning/mrp", true);
    loadMrps();
  }

  async function confirmDelete() {
    if (!deleteMrpRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/market-planning/mrp/${deleteMrpRow.id}`, { method: "DELETE" });
      invalidateCache("/market-planning/mrp", true);
      setDeleteMrpRow(null);
      loadMrps();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete MRP run.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Header title="Material Requirement Planning" subtitle="Calculate raw material needs from active feed formulas and central inventory." />
      <form onSubmit={calculate} className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
        <label className="grid min-w-72 gap-1 text-sm font-semibold">Production plan<select required className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.planNumber}</option>)}</select></label>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" type="submit"><PackageCheck className="h-4 w-4" /> Run availability check</button>
      </form>
      {deleteError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
      <MrpTable rows={mrps} loading={loading} onDelete={(row) => { setDeleteError(""); setDeleteMrpRow(row); }} />
      <ConfirmModal
        open={!!deleteMrpRow}
        onClose={() => setDeleteMrpRow(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete MRP run?"
        message={`This will permanently remove MRP run "${deleteMrpRow?.mrpNumber}". This can't be undone.`}
        confirmLabel="Delete MRP run"
      />
    </>
  );
}

export function InventoryAvailabilityCheckPage() {
  const [mrps, setMrps] = useState<MrpRow[]>(() => getCachedFirst<ApiEnvelope<MrpRow[]>>("/market-planning/mrp")?.data ?? []);
  const [selected, setSelected] = useState<MrpRow | null>(() => getCachedFirst<ApiEnvelope<MrpRow[]>>("/market-planning/mrp")?.data?.[0] ?? null);
  const [loading, setLoading] = useState(!hasCached("/market-planning/mrp"));
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<MrpRow[]>>("/market-planning/mrp")
      .then((r) => { setMrps(r.data ?? []); if (r.data?.length) setSelected(r.data[0]); })
      .catch((e: any) => setLoadError(e?.message ?? "Failed to load MRP data."))
      .finally(() => setLoading(false));
  }, []);

  const items: MrpItem[] = (selected as any)?.items ?? [];
  const statusColor = (item: MrpItem) => {
    const shortage = Number(item.shortageQuantityKg ?? 0);
    if (shortage > 0) return "text-red-600 font-semibold";
    const avail = Number(item.availableQuantityKg ?? 0);
    const req = Number(item.requiredQuantityKg ?? 0);
    if (req > 0 && avail / req < 1.2) return "text-amber-600 font-semibold";
    return "text-emerald-600 font-semibold";
  };
  const statusLabel = (item: MrpItem) => {
    const shortage = Number(item.shortageQuantityKg ?? 0);
    if (shortage > 0) return "Shortage";
    const avail = Number(item.availableQuantityKg ?? 0);
    const req = Number(item.requiredQuantityKg ?? 0);
    if (req > 0 && avail / req < 1.2) return "Low";
    return "OK";
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Inventory Availability</h1>
          <p className="text-sm text-ink/55">Raw material stock vs. requirements from the latest MRP runs.</p>
        </div>
      </div>

      {loadError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}

      {mrps.length > 0 && (
        <div className="app-card mb-6 flex flex-wrap items-end gap-4 p-5">
          <label className="grid min-w-80 gap-1 text-sm font-semibold">
            MRP run
            <select className={inputClass} value={selected?.id ?? ""} onChange={(e) => setSelected(mrps.find((m) => m.id === e.target.value) ?? null)}>
              {mrps.map((m) => (
                <option key={m.id} value={m.id}>{m.mrpNumber} — {new Date(m.createdAt).toLocaleDateString("en-GH")} ({m.status})</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selected && (
        <div className="app-card mb-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <div><p className="text-xs text-ink/50 uppercase tracking-wide">Required</p><p className="text-xl font-extrabold text-ink">{number(selected.totalRequiredKg)} kg</p></div>
          <div><p className="text-xs text-ink/50 uppercase tracking-wide">Available</p><p className="text-xl font-extrabold text-emerald-600">{number(selected.totalAvailableKg)} kg</p></div>
          <div><p className="text-xs text-ink/50 uppercase tracking-wide">Shortage</p><p className={`text-xl font-extrabold ${Number(selected.totalShortageKg) > 0 ? "text-red-600" : "text-ink"}`}>{number(selected.totalShortageKg)} kg</p></div>
          <div><p className="text-xs text-ink/50 uppercase tracking-wide">Status</p><p className={`text-xl font-extrabold ${Number(selected.totalShortageKg) > 0 ? "text-red-600" : "text-emerald-600"}`}>{Number(selected.totalShortageKg) > 0 ? "Shortages" : "Sufficient"}</p></div>
        </div>
      )}

      <DataTable
        columns={[
          { key: "name", label: "Raw Material", render: (row) => { const r = row as unknown as MrpItem; return <span className="font-medium">{r.rawMaterial?.name ?? r.rawMaterialId}<span className="ml-2 text-xs text-ink/40">{r.rawMaterial?.sku}</span></span>; } },
          { key: "required", label: "Required (kg)", render: (row) => number((row as unknown as MrpItem).requiredQuantityKg) },
          { key: "available", label: "Available (kg)", render: (row) => number((row as unknown as MrpItem).availableQuantityKg) },
          { key: "shortage", label: "Shortage (kg)", render: (row) => { const r = row as unknown as MrpItem; return <span className={Number(r.shortageQuantityKg) > 0 ? "text-red-600 font-semibold" : "text-ink/40"}>{number(r.shortageQuantityKg)}</span>; } },
          { key: "cost", label: "Est. Cost (GHS)", render: (row) => { const r = row as unknown as MrpItem; return Number(r.estimatedShortageCost) > 0 ? money(r.estimatedShortageCost) : "—"; } },
          { key: "status", label: "Status", render: (row) => { const r = row as unknown as MrpItem; return <span className={statusColor(r)}>{statusLabel(r)}</span>; } },
        ]}
        rows={items as unknown as Record<string, unknown>[]}
        loading={loading}
        empty={selected ? "No material items in this MRP run." : "Select an MRP run above to view availability."}
      />
    </>
  );
}

export function ProcurementRecommendationPage({ convert = false }: { convert?: boolean }) {
  const [rows, setRows] = useState<RecommendationRow[]>(() => getCachedFirst<ApiEnvelope<RecommendationRow[]>>("/market-planning/recommendations")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/market-planning/recommendations"));
  const [mrpId, setMrpId] = useState("");
  const [recommendationId, setRecommendationId] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [cancelRow, setCancelRow] = useState<RecommendationRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  async function load() {
    setLoadError("");
    const res = await apiFetch<ApiEnvelope<RecommendationRow[]>>("/market-planning/recommendations");
    const fresh = res.data ?? [];
    setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false)); }, []);
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
  async function confirmCancel() {
    if (!cancelRow) return;
    setCancelling(true);
    setCancelError("");
    try {
      await apiFetch(`/market-planning/recommendations/${cancelRow.id}/cancel`, { method: "PATCH" });
      invalidateCache("/market-planning/recommendations", true);
      setCancelRow(null);
      await load();
    } catch (err: any) {
      setCancelError(err?.message ?? "Failed to cancel recommendation.");
    } finally {
      setCancelling(false);
    }
  }
  return (
    <>
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
      {cancelError && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{cancelError}</p>}
      <RecommendationTable rows={rows} loading={loading} onCancel={(row) => { setCancelError(""); setCancelRow(row); }} />
      <ConfirmModal
        open={!!cancelRow}
        onClose={() => setCancelRow(null)}
        onConfirm={confirmCancel}
        loading={cancelling}
        title="Cancel recommendation?"
        message={`This will cancel the recommendation for "${cancelRow?.rawMaterial?.name ?? cancelRow?.rawMaterialId}". This can't be undone.`}
        confirmLabel="Cancel recommendation"
      />
    </>
  );
}

export function ProductionExecutionPage() {
  const { options, optionsError } = useOptions();
  const [plans, setPlans] = useState<PlanRow[]>(() => getCachedFirst<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans")?.data ?? []);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [form, setForm] = useState({ planId: "", productionPlanItemId: "", rawMaterialWarehouseId: "", finishedGoodsWarehouseId: "", producedQuantityKg: "1000", wastageKg: "0" });
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  useEffect(() => { apiFetch<ApiEnvelope<PlanRow[]>>("/market-planning/production-plans").then((res) => setPlans(res.data ?? [])).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
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
    <>
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
    </>
  );
}

export function TargetVsActualReportPage({ demandOnly = false }: { demandOnly?: boolean }) {
  const [rows, setRows] = useState<ReportRow[]>(() => getCachedFirst<ApiEnvelope<ReportRow[]>>(demandOnly ? "/market-planning/reports/demand-vs-sales" : "/market-planning/reports/target-vs-actual")?.data ?? []);
  useEffect(() => {
    apiFetch<ApiEnvelope<ReportRow[]>>(demandOnly ? "/market-planning/reports/demand-vs-sales" : "/market-planning/reports/target-vs-actual")
      .then((res) => setRows(res.data ?? []))
      .catch(() => undefined);
  }, [demandOnly]);
  return (
    <>
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
    </>
  );
}
