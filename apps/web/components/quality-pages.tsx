"use client";

import { ChangeEvent, ComponentType, FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle, ChevronRight, ClipboardCheck,
  FileText, FlaskConical, Plus, RefreshCw, ShieldCheck,
  ShieldX, TrendingUp, XCircle,
} from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECK_TYPES = ["RAW_MATERIAL", "FEED_PRODUCTION", "SOYA_PROCESSING", "FINISHED_GOODS", "POULTRY_HEALTH", "GOODS_RECEIVED"] as const;
type CheckType = (typeof CHECK_TYPES)[number];

const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  RAW_MATERIAL: "Raw Material",
  FEED_PRODUCTION: "Feed Production",
  SOYA_PROCESSING: "Soya Processing",
  FINISHED_GOODS: "Finished Goods",
  POULTRY_HEALTH: "Poultry Health",
  GOODS_RECEIVED: "Goods Received",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

function pct(v: unknown) {
  return `${Number(v ?? 0).toFixed(1)}%`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function PageHero({ kicker, title, subtitle, actions }: { kicker: string; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div>
          <p className="app-kicker flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            {kicker}
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/55">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-start gap-2 pt-1">{actions}</div>}
      </div>
    </div>
  );
}

type KpiColor = "blue" | "emerald" | "amber" | "red" | "purple" | "brand" | "indigo";
const KPI_STYLES: Record<KpiColor, { wrap: string; icon: string; dot: string }> = {
  blue:    { wrap: "from-blue-50",    icon: "bg-blue-100 text-blue-600",       dot: "bg-blue-500" },
  emerald: { wrap: "from-emerald-50", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
  amber:   { wrap: "from-amber-50",   icon: "bg-amber-100 text-amber-600",     dot: "bg-amber-500" },
  red:     { wrap: "from-red-50",     icon: "bg-red-100 text-red-600",         dot: "bg-red-500" },
  purple:  { wrap: "from-purple-50",  icon: "bg-purple-100 text-purple-600",   dot: "bg-purple-500" },
  brand:   { wrap: "from-brand/10",   icon: "bg-brand/15 text-brand",          dot: "bg-brand" },
  indigo:  { wrap: "from-indigo-50",  icon: "bg-indigo-100 text-indigo-600",   dot: "bg-indigo-500" },
};

function KpiCard({ label, value, Icon, color, sub }: { label: string; value: string | number; Icon?: ComponentType<{ className?: string }>; color: KpiColor; sub?: string }) {
  const s = KPI_STYLES[color];
  return (
    <article className={`rounded-2xl border border-line bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card`}>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : <div className="h-10 w-10" />}
        <span className={`mt-1 h-2 w-2 rounded-full ${s.dot}`} />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <strong className="mt-1 block text-[26px] font-extrabold leading-none tracking-tight text-ink">{value}</strong>
      {sub && <p className="mt-1 text-xs text-ink/45">{sub}</p>}
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    PENDING:               "bg-gray-100 text-gray-600 border-gray-200",
    IN_PROGRESS:           "bg-blue-100 text-blue-700 border-blue-200",
    PASSED:                "bg-emerald-100 text-emerald-700 border-emerald-200",
    FAILED:                "bg-red-100 text-red-700 border-red-200",
    CONDITIONALLY_PASSED:  "bg-amber-100 text-amber-800 border-amber-200",
    CANCELLED:             "bg-gray-100 text-gray-500 border-gray-200",
    APPROVED:              "bg-emerald-100 text-emerald-700 border-emerald-200",
    REJECTED:              "bg-red-100 text-red-700 border-red-200",
    QUARANTINE:            "bg-orange-100 text-orange-700 border-orange-200",
    CONDITIONALLY_APPROVED:"bg-amber-100 text-amber-800 border-amber-200",
    OPEN:                  "bg-red-100 text-red-700 border-red-200",
    RESOLVED:              "bg-emerald-100 text-emerald-700 border-emerald-200",
    CLOSED:                "bg-gray-100 text-gray-600 border-gray-200",
    LOW:                   "bg-gray-100 text-gray-600 border-gray-200",
    MEDIUM:                "bg-blue-100 text-blue-700 border-blue-200",
    HIGH:                  "bg-orange-100 text-orange-700 border-orange-200",
    URGENT:                "bg-red-100 text-red-700 border-red-200",
    ACTIVE:                "bg-emerald-100 text-emerald-700 border-emerald-200",
    RAW_MATERIAL:          "bg-amber-100 text-amber-700 border-amber-200",
    FEED_PRODUCTION:       "bg-lime-100 text-lime-700 border-lime-200",
    SOYA_PROCESSING:       "bg-teal-100 text-teal-700 border-teal-200",
    FINISHED_GOODS:        "bg-indigo-100 text-indigo-700 border-indigo-200",
    POULTRY_HEALTH:        "bg-pink-100 text-pink-700 border-pink-200",
    GOODS_RECEIVED:        "bg-purple-100 text-purple-700 border-purple-200",
  };
  const c = colours[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const qualityNav = [
  { href: "/quality",                                    label: "Dashboard" },
  { href: "/quality/templates",                         label: "Templates" },
  { href: "/quality/checks",                            label: "All Checks" },
  { href: "/quality/checks?checkType=RAW_MATERIAL",     label: "Raw Material" },
  { href: "/quality/checks?checkType=FEED_PRODUCTION",  label: "Feed Quality" },
  { href: "/quality/checks?checkType=SOYA_PROCESSING",  label: "Soya Quality" },
  { href: "/quality/checks?checkType=FINISHED_GOODS",   label: "Finished Goods" },
  { href: "/quality/checks?checkType=GOODS_RECEIVED",   label: "GRN Checks" },
  { href: "/quality/checks?checkType=POULTRY_HEALTH",   label: "Poultry Health" },
  { href: "/quality/rejected-batches",                  label: "Rejected" },
  { href: "/quality/approved-batches",                  label: "Approved" },
  { href: "/quality/lab-reports",                       label: "Lab Reports" },
  { href: "/quality/corrective-actions",                label: "Corrective Actions" },
  { href: "/quality/reports",                           label: "Reports" },
];

function QualityNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-1.5">
      {qualityNav.map((n) => {
        const basePath = n.href.split("?")[0];
        const isActive =
          basePath === "/quality"
            ? pathname === "/quality"
            : pathname === basePath || (pathname?.startsWith(basePath + "/") ?? false);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-brand/30 bg-brand text-white"
                : "border-line bg-white text-ink/70 hover:border-brand/20 hover:bg-field hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

const inputCls = "min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";
const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45";

function FormLabel({ children }: { children: ReactNode }) {
  return <label className={labelCls}>{children}</label>;
}

// ─── Options hook ─────────────────────────────────────────────────────────────

type QCOptions = {
  templates: { id: string; code: string; name: string; checkType: string }[];
  branches: { id: string; code: string; name: string }[];
  farms: { id: string; code: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  productionSites: { id: string; code: string; name: string }[];
  suppliers: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string }[];
};

function useQCOptions() {
  const [opts, setOpts] = useState<QCOptions>({
    templates: [], branches: [], farms: [], warehouses: [],
    productionSites: [], suppliers: [], users: [],
  });
  useEffect(() => {
    apiFetch<ApiEnvelope<QCOptions>>("/quality/options")
      .then((r) => setOpts(r.data))
      .catch(() => undefined);
  }, []);
  return opts;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type RecentCheck = {
  id: string; reference: string; checkType: string; status: string; decision: string;
  batchNumber?: string; createdAt: string; template?: { name: string }; inspector?: { fullName: string };
};

type DashData = {
  totalChecks: number; pendingChecks: number; passedChecks: number; failedChecks: number;
  rejectedBatches: number; approvedBatches: number; openCorrectiveActions: number; overdueActions: number;
  recentChecks: RecentCheck[];
};

export function QualityDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await apiFetch<ApiEnvelope<DashData>>("/quality/dashboard");
      setData(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const passRate = data && (data.passedChecks + data.failedChecks) > 0
    ? (data.passedChecks / (data.passedChecks + data.failedChecks)) * 100
    : null;

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title="Quality Dashboard"
        subtitle="Inspection results, batch decisions, lab reports, and corrective action tracking across all production lines."
        actions={
          <>
            <button onClick={load} disabled={loading} className="app-button-secondary text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link href="/quality/checks/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> New Check
            </Link>
          </>
        }
      />

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {data && data.overdueActions > 0 && (
        <div className="mb-6 rounded-2xl border border-red-200 border-l-[3px] border-l-red-500 bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-ink">Overdue corrective actions</p>
              <p className="mt-0.5 text-sm text-ink/60">
                {data.overdueActions} corrective action{data.overdueActions > 1 ? "s" : ""} past due date.{" "}
                <Link href="/quality/corrective-actions" className="font-medium text-red-600 hover:underline">Review now →</Link>
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total checks"      value={data?.totalChecks ?? 0}             Icon={ClipboardCheck} color="blue" />
        <KpiCard label="Pending"           value={data?.pendingChecks ?? 0}           Icon={TrendingUp}     color="amber" />
        <KpiCard label="Passed"            value={data?.passedChecks ?? 0}            Icon={CheckCircle}    color="emerald" sub={passRate != null ? `${passRate.toFixed(1)}% pass rate` : undefined} />
        <KpiCard label="Failed"            value={data?.failedChecks ?? 0}            Icon={XCircle}        color="red" />
        <KpiCard label="Approved batches"  value={data?.approvedBatches ?? 0}         Icon={ShieldCheck}    color="indigo" />
        <KpiCard label="Rejected batches"  value={data?.rejectedBatches ?? 0}         Icon={ShieldX}        color="red" />
        <KpiCard label="Open CARs"         value={data?.openCorrectiveActions ?? 0}   Icon={FileText}       color="purple" />
        <KpiCard
          label="Overdue CARs"
          value={data?.overdueActions ?? 0}
          Icon={AlertTriangle}
          color={data && data.overdueActions > 0 ? "red" : "emerald"}
        />
      </section>

      {passRate != null && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Overall Pass Rate</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">{passRate.toFixed(1)}%</p>
            </div>
            <div className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold ${passRate >= 90 ? "bg-emerald-100 text-emerald-700" : passRate >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
              {passRate >= 90 ? "A" : passRate >= 70 ? "B" : "C"}
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-all ${passRate >= 90 ? "bg-emerald-500" : passRate >= 70 ? "bg-amber-400" : "bg-red-500"}`}
              style={{ width: `${passRate}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink/40">
            <span>0%</span><span className="text-amber-500">70% threshold</span><span>100%</span>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CHECK_TYPES.map((type) => (
          <Link
            key={type}
            href={`/quality/checks?checkType=${type}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs font-semibold text-ink/70 shadow-card transition hover:border-brand/30 hover:bg-field hover:text-ink"
          >
            <span>{CHECK_TYPE_LABELS[type]}</span>
            <ChevronRight className="h-3.5 w-3.5 text-ink/30" />
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-brand" />
            <h3 className="font-semibold text-ink">Recent Quality Checks</h3>
          </div>
          <Link href="/quality/checks" className="flex items-center gap-0.5 text-xs font-medium text-brand hover:underline">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-line">
          {(data?.recentChecks ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink/45">No quality checks yet</p>
          ) : (data?.recentChecks ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                <ClipboardCheck className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/quality/checks/${c.id}`} className="text-sm font-semibold text-ink hover:text-brand hover:underline">{c.reference}</Link>
                  <StatusBadge status={c.checkType} />
                  <StatusBadge status={c.status} />
                  {c.decision && c.decision !== "PENDING" && <StatusBadge status={c.decision} />}
                </div>
                <p className="mt-0.5 text-xs text-ink/55">
                  {c.template?.name ?? "No template"}
                  {c.batchNumber && ` · Batch ${c.batchNumber}`}
                  {c.inspector && ` · ${c.inspector.fullName}`}
                </p>
              </div>
              <p className="shrink-0 text-[11px] text-ink/40">{fmt(c.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

// ─── Templates Page ───────────────────────────────────────────────────────────

type Template = {
  id: string; code: string; name: string; checkType: string; isActive: boolean;
  description?: string; _count: { parameters: number; checks: number };
};

export function QualityTemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [checkType, setCheckType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", checkType: "RAW_MATERIAL" as CheckType, description: "" });
  const [params, setParams] = useState<{ paramCode: string; name: string; paramType: string; unit: string; minValue: string; maxValue: string; isRequired: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    const p = new URLSearchParams();
    if (checkType) p.set("checkType", checkType);
    apiFetch<ApiEnvelope<Template[]>>(`/quality/templates?${p}`).then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [checkType]);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function addParam() {
    setParams((p) => [...p, { paramCode: "", name: "", paramType: "NUMERIC", unit: "", minValue: "", maxValue: "", isRequired: true }]);
  }

  function removeParam(i: number) { setParams((p) => p.filter((_, idx) => idx !== i)); }

  function updateParam(i: number, k: string, v: string | boolean) {
    setParams((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/quality/templates", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          parameters: params.map((p, i) => ({
            ...p, sortOrder: i,
            minValue: p.minValue ? Number(p.minValue) : undefined,
            maxValue: p.maxValue ? Number(p.maxValue) : undefined,
          })),
        }),
      });
      setShowCreate(false);
      setForm({ code: "", name: "", checkType: "RAW_MATERIAL", description: "" });
      setParams([]);
      load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title="Quality Check Templates"
        subtitle="Define inspection parameters, pass/fail criteria, and measurement ranges for each check type."
        actions={
          <button onClick={() => setShowCreate((p) => !p)} className={showCreate ? "app-button-secondary" : "app-button-primary"}>
            {showCreate ? "Cancel" : <><Plus className="h-4 w-4" /> New Template</>}
          </button>
        }
      />
      <QualityNav />

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-4 text-base font-semibold text-ink">New Template</h2>
          {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><FormLabel>Code *</FormLabel><input required value={form.code} onChange={f("code")} className={inputCls} /></div>
              <div><FormLabel>Name *</FormLabel><input required value={form.name} onChange={f("name")} className={inputCls} /></div>
              <div><FormLabel>Check Type *</FormLabel>
                <select required value={form.checkType} onChange={f("checkType")} className={inputCls}>
                  {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>
            <div><FormLabel>Description</FormLabel><textarea value={form.description} onChange={f("description")} rows={2} className={inputCls} /></div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Parameters</p>
                <button type="button" onClick={addParam} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add Parameter
                </button>
              </div>
              {params.length === 0 && (
                <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-ink/45">No parameters yet — add one above</p>
              )}
              {params.map((param, i) => (
                <div key={i} className="mb-3 grid grid-cols-6 gap-3 rounded-xl bg-field/60 p-4">
                  <div><label className={labelCls}>Code</label><input value={param.paramCode} onChange={(e) => updateParam(i, "paramCode", e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Name</label><input value={param.name} onChange={(e) => updateParam(i, "name", e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Type</label>
                    <select value={param.paramType} onChange={(e) => updateParam(i, "paramType", e.target.value)} className={inputCls}>
                      {["NUMERIC", "BOOLEAN", "TEXT", "PERCENTAGE"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>Unit</label><input value={param.unit} onChange={(e) => updateParam(i, "unit", e.target.value)} placeholder="e.g. %" className={inputCls} /></div>
                  <div><label className={labelCls}>Min / Max</label>
                    <div className="flex gap-1.5">
                      <input type="number" value={param.minValue} onChange={(e) => updateParam(i, "minValue", e.target.value)} placeholder="Min" className={inputCls} />
                      <input type="number" value={param.maxValue} onChange={(e) => updateParam(i, "maxValue", e.target.value)} placeholder="Max" className={inputCls} />
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                      <input type="checkbox" checked={param.isRequired} onChange={(e) => updateParam(i, "isRequired", e.target.checked)} className="accent-brand" />
                      Required
                    </label>
                    <button type="button" onClick={() => removeParam(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">
              {saving ? "Saving..." : "Create Template"}
            </button>
          </form>
        </div>
      )}

      <div className="mb-5">
        <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10">
          <option value="">All Types</option>
          {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Name", render: (r) => <Link href={`/quality/templates/${r.id}`} className="font-medium text-brand hover:underline">{r.name as string}</Link> },
            { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
            { key: "params", label: "Parameters", render: (r) => (r._count as { parameters: number })?.parameters ?? 0 },
            { key: "checks", label: "Checks Used", render: (r) => (r._count as { checks: number })?.checks ?? 0 },
            { key: "isActive", label: "Active", render: (r) => r.isActive ? <span className="font-semibold text-emerald-600">Yes</span> : <span className="text-ink/40">No</span> },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No templates yet"
        />
      </div>
    </AppShell>
  );
}

// ─── Quality Checks List ──────────────────────────────────────────────────────

type QualityCheck = {
  id: string; reference: string; checkType: string; status: string; decision: string;
  batchNumber?: string; overallScore?: number; passedParameters: number; totalParameters: number;
  createdAt: string; template?: { name: string }; inspector?: { fullName: string }; branch?: { name: string };
  _count?: { results: number; labReports: number; correctiveActions: number };
};

export function QualityChecksPage({ filterType }: { filterType?: string }) {
  const [data, setData] = useState<{ total: number; items: QualityCheck[] }>({ total: 0, items: [] });
  const [checkType, setCheckType] = useState(filterType ?? "");
  const [status, setStatus] = useState("");
  const [decision, setDecision] = useState("");

  function load() {
    const p = new URLSearchParams();
    if (checkType) p.set("checkType", checkType);
    if (status) p.set("status", status);
    if (decision) p.set("decision", decision);
    apiFetch<ApiEnvelope<{ total: number; items: QualityCheck[] }>>(`/quality/checks?${p}`)
      .then((r) => setData(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [checkType, status, decision]);

  const pageTitle = filterType ? `${CHECK_TYPE_LABELS[filterType as CheckType] ?? filterType} Checks` : "Quality Checks";
  const selectCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title={pageTitle}
        subtitle="Review inspection results, batch scores, and decisions for all quality check types."
        actions={<Link href="/quality/checks/create" className="app-button-primary"><Plus className="h-4 w-4" /> New Check</Link>}
      />
      <QualityNav />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className={selectCls}>
          <option value="">All Types</option>
          {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {["PENDING", "IN_PROGRESS", "PASSED", "FAILED", "CONDITIONALLY_PASSED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className={selectCls}>
          <option value="">All Decisions</option>
          {["PENDING", "APPROVED", "REJECTED", "QUARANTINE", "CONDITIONALLY_APPROVED"].map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
        </select>
        <p className="text-xs text-ink/50">{data.total} result{data.total !== 1 ? "s" : ""}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "reference", label: "Reference", render: (r) => <Link href={`/quality/checks/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
            { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
            { key: "template", label: "Template", render: (r) => (r.template as { name: string } | undefined)?.name ?? "—" },
            { key: "batchNumber", label: "Batch" },
            { key: "branch", label: "Branch", render: (r) => (r.branch as { name: string } | undefined)?.name ?? "—" },
            { key: "score", label: "Score", render: (r) => r.overallScore != null ? pct(r.overallScore) : `${r.passedParameters}/${r.totalParameters}` },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "decision", label: "Decision", render: (r) => <StatusBadge status={r.decision as string} /> },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={data.items as Record<string, unknown>[]}
          empty="No quality checks"
        />
      </div>
    </AppShell>
  );
}

// ─── Create Quality Check ─────────────────────────────────────────────────────

type TemplateParam = { id: string; paramCode: string; name: string; unit?: string; minValue?: number; maxValue?: number; paramType: string; isRequired: boolean };
type TemplateDetail = { parameters: TemplateParam[] };

export function CreateQualityCheckPage() {
  const router = useRouter();
  const opts = useQCOptions();
  const [form, setForm] = useState({
    checkType: "RAW_MATERIAL" as CheckType,
    templateId: "", referenceType: "", referenceId: "",
    batchNumber: "", inspectorId: "", checkedAt: new Date().toISOString().slice(0, 10),
    summary: "", notes: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "",
  });
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [results, setResults] = useState<Record<string, { actualValue: string; passed: boolean; remarks: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!form.templateId) { setTemplate(null); return; }
    apiFetch<ApiEnvelope<TemplateDetail>>(`/quality/templates/${form.templateId}`)
      .then((r) => setTemplate(r.data)).catch(() => undefined);
  }, [form.templateId]);

  function setResult(paramId: string, k: string, v: string | boolean) {
    setResults((p) => ({ ...p, [paramId]: { ...{ actualValue: "", passed: false, remarks: "" }, ...p[paramId], [k]: v } }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const resultsArr = Object.entries(results).map(([parameterId, r]) => ({ parameterId, ...r }));
      const res = await apiFetch<ApiEnvelope<{ id: string }>>("/quality/checks", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          templateId: form.templateId || undefined,
          referenceId: form.referenceId || undefined,
          inspectorId: form.inspectorId || undefined,
          branchId: form.branchId || undefined,
          farmId: form.farmId || undefined,
          warehouseId: form.warehouseId || undefined,
          productionSiteId: form.productionSiteId || undefined,
          results: resultsArr.length ? resultsArr : undefined,
        }),
      });
      router.push(`/quality/checks/${res.data.id}`);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHero
          kicker="Operations · Quality Control"
          title="New Quality Check"
          subtitle="Create an inspection record with parameter results for any production or procurement batch."
          actions={<Link href="/quality/checks" className="app-button-secondary text-xs">← Back to checks</Link>}
        />

        {error && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
            <h2 className="mb-5 text-base font-semibold text-ink">Check Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><FormLabel>Check Type *</FormLabel>
                <select required value={form.checkType} onChange={f("checkType")} className={inputCls}>
                  {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div><FormLabel>Template</FormLabel>
                <select value={form.templateId} onChange={f("templateId")} className={inputCls}>
                  <option value="">— None —</option>
                  {opts.templates.filter((t) => !form.checkType || t.checkType === form.checkType).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><FormLabel>Batch Number</FormLabel><input value={form.batchNumber} onChange={f("batchNumber")} className={inputCls} /></div>
              <div><FormLabel>Checked At</FormLabel><input type="date" value={form.checkedAt} onChange={f("checkedAt")} className={inputCls} /></div>
              <div><FormLabel>Reference Type</FormLabel><input value={form.referenceType} onChange={f("referenceType")} placeholder="e.g. GoodsReceivedNote" className={inputCls} /></div>
              <div><FormLabel>Inspector</FormLabel>
                <select value={form.inspectorId} onChange={f("inspectorId")} className={inputCls}>
                  <option value="">— Current User —</option>
                  {opts.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
              <div><FormLabel>Branch</FormLabel>
                <select value={form.branchId} onChange={f("branchId")} className={inputCls}>
                  <option value="">— None —</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><FormLabel>Farm</FormLabel>
                <select value={form.farmId} onChange={f("farmId")} className={inputCls}>
                  <option value="">— None —</option>
                  {opts.farms.map((f_) => <option key={f_.id} value={f_.id}>{f_.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4"><FormLabel>Notes</FormLabel><textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} /></div>
          </div>

          {template && template.parameters.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <h2 className="mb-5 text-base font-semibold text-ink">Inspection Parameters</h2>
              <div className="space-y-3">
                {template.parameters.map((param) => {
                  const r = results[param.id] ?? { actualValue: "", passed: false, remarks: "" };
                  return (
                    <div key={param.id} className={`rounded-xl border p-4 transition ${r.passed ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-field/30"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {param.name}{" "}
                            <span className="text-xs font-normal text-ink/45">({param.paramCode})</span>
                            {param.isRequired && <span className="ml-1 text-red-500">*</span>}
                          </p>
                          {(param.minValue != null || param.maxValue != null) && (
                            <p className="mt-0.5 text-xs text-ink/45">
                              Range: {param.minValue ?? "—"} – {param.maxValue ?? "—"}{param.unit ? ` ${param.unit}` : ""}
                            </p>
                          )}
                        </div>
                        {param.unit && (
                          <span className="shrink-0 rounded-md border border-line bg-white px-2 py-0.5 text-xs text-ink/60">{param.unit}</span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <FormLabel>Actual Value</FormLabel>
                          {param.paramType === "BOOLEAN"
                            ? <select value={r.actualValue} onChange={(e) => setResult(param.id, "actualValue", e.target.value)} className={inputCls}>
                                <option value="">—</option>
                                <option value="true">Pass</option>
                                <option value="false">Fail</option>
                              </select>
                            : <input
                                type={param.paramType === "NUMERIC" || param.paramType === "PERCENTAGE" ? "number" : "text"}
                                step="any"
                                value={r.actualValue}
                                onChange={(e) => setResult(param.id, "actualValue", e.target.value)}
                                className={inputCls}
                              />
                          }
                        </div>
                        <div className="flex items-end pb-0.5">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={r.passed} onChange={(e) => setResult(param.id, "passed", e.target.checked)} className="h-4 w-4 accent-brand" />
                            <span className="font-medium">Passed</span>
                          </label>
                        </div>
                        <div>
                          <FormLabel>Remarks</FormLabel>
                          <input value={r.remarks} onChange={(e) => setResult(param.id, "remarks", e.target.value)} className={inputCls} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">
            {saving ? "Saving..." : "Create Quality Check"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// ─── Quality Check Detail ─────────────────────────────────────────────────────

type CheckDetail = QualityCheck & {
  template?: { name: string; checkType: string };
  inspector?: { fullName: string };
  approvedBy?: { fullName: string };
  branch?: { name: string };
  results: Array<{ id: string; passed: boolean; actualValue?: string; deviation?: number; remarks?: string; parameter: { name: string; paramCode: string; unit?: string; minValue?: number; maxValue?: number } }>;
  labReports: Array<{ id: string; reportNumber: string; labName: string; reportDate: string; summary?: string }>;
  rejectedBatch?: { id: string; reference: string; rejectionReason: string; disposalMethod: string };
  approvedBatch?: { id: string; reference: string; approvalNotes?: string; stockBatch?: { batchNumber: string } };
  correctiveActions: Array<{ id: string; reference: string; title: string; status: string; assignedTo?: { fullName: string }; dueDate?: string }>;
};

const ACTION_BTNS = [
  { type: "pass",        label: "Pass Check",      cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { type: "fail",        label: "Fail Check",       cls: "bg-red-600 hover:bg-red-700 text-white" },
  { type: "conditional", label: "Conditional Pass", cls: "bg-amber-500 hover:bg-amber-600 text-white" },
  { type: "approve",     label: "Approve Batch",    cls: "bg-indigo-600 hover:bg-indigo-700 text-white", batchOnly: true },
  { type: "reject",      label: "Reject Batch",     cls: "bg-orange-600 hover:bg-orange-700 text-white", batchOnly: true },
  { type: "quarantine",  label: "Quarantine",       cls: "bg-gray-600 hover:bg-gray-700 text-white",     batchOnly: true },
] as const;

export function QualityCheckDetailPage({ id }: { id: string }) {
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [tab, setTab] = useState("overview");
  const [actionForm, setActionForm] = useState({ type: "", notes: "", reason: "", conditions: "", score: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<CheckDetail>>(`/quality/checks/${id}`)
      .then((r) => setCheck(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [id]);

  async function takeAction(type: string) {
    setSaving(true); setError("");
    try {
      const ep: Record<string, string> = {
        pass: `/quality/checks/${id}/pass`, fail: `/quality/checks/${id}/fail`,
        conditional: `/quality/checks/${id}/conditional-pass`, approve: `/quality/checks/${id}/approve-batch`,
        reject: `/quality/checks/${id}/reject-batch`, quarantine: `/quality/checks/${id}/quarantine`,
      };
      const body: Record<string, Record<string, unknown>> = {
        pass:        { notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined },
        fail:        { reason: actionForm.reason, notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined },
        conditional: { conditions: actionForm.conditions, notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined },
        approve:     { approvalNotes: actionForm.notes },
        reject:      { rejectionReason: actionForm.reason },
        quarantine:  { reason: actionForm.reason, notes: actionForm.notes },
      };
      if (ep[type]) {
        await apiFetch(ep[type], { method: "PATCH", body: JSON.stringify(body[type]) });
        setActionForm({ type: "", notes: "", reason: "", conditions: "", score: "" });
        load();
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (!check) return <AppShell><div className="flex h-64 items-center justify-center text-sm text-ink/45">Loading check details…</div></AppShell>;

  const canDecide = check.status === "IN_PROGRESS" || check.status === "PENDING";
  const passedCount = check.results?.filter((r) => r.passed).length ?? 0;
  const totalCount = check.results?.length ?? 0;
  const hasBatchDecision = !!(check.approvedBatch || check.rejectedBatch);

  const tabs = [
    { key: "overview",           label: "Overview" },
    { key: "results",            label: `Results (${totalCount})` },
    { key: "lab-reports",        label: `Lab Reports (${check.labReports?.length ?? 0})` },
    { key: "corrective-actions", label: `CARs (${check.correctiveActions?.length ?? 0})` },
  ];

  return (
    <AppShell>
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Operations · Quality Control
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">{check.reference}</h1>
                <StatusBadge status={check.checkType} />
                <StatusBadge status={check.status} />
                {check.decision && check.decision !== "PENDING" && <StatusBadge status={check.decision} />}
              </div>
              <p className="mt-1 text-sm text-ink/55">
                {check.template?.name ?? "No template"}
                {check.batchNumber && ` · Batch ${check.batchNumber}`}
                {check.inspector && ` · ${check.inspector.fullName}`}
                {check.branch && ` · ${check.branch.name}`}
              </p>
            </div>
            <Link href="/quality/checks" className="app-button-secondary text-xs">← Checks</Link>
          </div>

          {totalCount > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between text-xs text-ink/55">
                  <span>Parameter results</span>
                  <span className="font-semibold">{passedCount}/{totalCount} passed</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${passedCount === totalCount ? "bg-emerald-500" : passedCount / totalCount >= 0.7 ? "bg-amber-400" : "bg-red-500"}`}
                    style={{ width: `${totalCount > 0 ? (passedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {check.overallScore != null && (
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${check.overallScore >= 90 ? "bg-emerald-100 text-emerald-700" : check.overallScore >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  {check.overallScore.toFixed(0)}%
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {canDecide && !actionForm.type && (
        <div className="mb-5 flex flex-wrap gap-2">
          {ACTION_BTNS.filter((a) => !("batchOnly" in a && a.batchOnly && hasBatchDecision)).map((a) => (
            <button key={a.type} onClick={() => setActionForm((p) => ({ ...p, type: a.type }))} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${a.cls}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {actionForm.type && (
        <div className="mb-5 rounded-2xl border border-line bg-white p-5 shadow-card">
          <p className="mb-4 text-base font-semibold capitalize text-ink">{actionForm.type.replace(/_/g, " ")} Action</p>
          <div className="space-y-3">
            {["fail", "reject", "quarantine"].includes(actionForm.type) && (
              <div><FormLabel>Reason *</FormLabel><textarea value={actionForm.reason} onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))} rows={2} className={inputCls} /></div>
            )}
            {actionForm.type === "conditional" && (
              <div><FormLabel>Conditions *</FormLabel><textarea value={actionForm.conditions} onChange={(e) => setActionForm((p) => ({ ...p, conditions: e.target.value }))} rows={2} className={inputCls} /></div>
            )}
            {["pass", "fail", "conditional"].includes(actionForm.type) && (
              <div><FormLabel>Overall Score (%)</FormLabel>
                <input type="number" min={0} max={100} value={actionForm.score} onChange={(e) => setActionForm((p) => ({ ...p, score: e.target.value }))} className="w-40 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
              </div>
            )}
            <div><FormLabel>Notes</FormLabel><textarea value={actionForm.notes} onChange={(e) => setActionForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls} /></div>
            <div className="flex gap-2">
              <button onClick={() => takeAction(actionForm.type)} disabled={saving} className="app-button-primary disabled:opacity-50">{saving ? "Saving..." : "Confirm"}</button>
              <button onClick={() => setActionForm({ type: "", notes: "", reason: "", conditions: "", score: "" })} className="app-button-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-4 py-2.5 text-sm font-medium transition ${tab === t.key ? "border-b-2 border-brand text-brand" : "text-ink/55 hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-ink/45">Check Info</h2>
            <dl className="space-y-3">
              {([["Reference", check.reference], ["Batch Number", check.batchNumber ?? "—"], ["Template", check.template?.name ?? "—"], ["Inspector", check.inspector?.fullName ?? "—"], ["Branch", check.branch?.name ?? "—"], ["Score", check.overallScore != null ? pct(check.overallScore) : `${check.passedParameters}/${check.totalParameters}`], ["Approved By", check.approvedBy?.fullName ?? "—"]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
                  <dt className="text-xs text-ink/45">{k}</dt>
                  <dd className="text-sm font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {hasBatchDecision && (
            <div className={`rounded-2xl border p-5 shadow-card ${check.approvedBatch ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wide text-ink/45">Batch Decision</h2>
              {check.approvedBatch && (
                <dl className="space-y-3">
                  {([["Decision", "APPROVED"], ["Reference", check.approvedBatch.reference], ["Stock Batch", check.approvedBatch.stockBatch?.batchNumber ?? "—"], ["Notes", check.approvedBatch.approvalNotes ?? "—"]] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
                      <dt className="text-xs text-ink/45">{k}</dt>
                      <dd className="text-right text-sm font-medium text-ink">{k === "Decision" ? <StatusBadge status={v} /> : v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {check.rejectedBatch && (
                <dl className="space-y-3">
                  {([["Decision", "REJECTED"], ["Reference", check.rejectedBatch.reference], ["Reason", check.rejectedBatch.rejectionReason], ["Disposal", check.rejectedBatch.disposalMethod?.replace(/_/g, " ")]] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
                      <dt className="text-xs text-ink/45">{k}</dt>
                      <dd className="text-right text-sm font-medium text-ink">{k === "Decision" ? <StatusBadge status={v} /> : v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "results" && (
        <div className="space-y-3">
          {check.results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-ink/45">No inspection results recorded</p>
          ) : check.results.map((r) => (
            <div key={r.id} className={`rounded-2xl border p-5 shadow-card ${r.passed ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {r.parameter.name}{" "}
                    <span className="text-xs font-normal text-ink/45">({r.parameter.paramCode})</span>
                  </p>
                  {(r.parameter.minValue != null || r.parameter.maxValue != null) && (
                    <p className="mt-0.5 text-xs text-ink/45">
                      Expected: {r.parameter.minValue ?? "—"} – {r.parameter.maxValue ?? "—"}{r.parameter.unit ? ` ${r.parameter.unit}` : ""}
                    </p>
                  )}
                </div>
                <StatusBadge status={r.passed ? "PASSED" : "FAILED"} />
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-[10px] font-bold uppercase text-ink/40">Actual Value</p><p className="mt-0.5 font-semibold">{r.actualValue ? `${r.actualValue}${r.parameter.unit ? ` ${r.parameter.unit}` : ""}` : "—"}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-ink/40">Deviation</p><p className="mt-0.5 font-semibold">{r.deviation != null ? String(r.deviation) : "—"}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-ink/40">Remarks</p><p className="mt-0.5 text-ink/70">{r.remarks ?? "—"}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "lab-reports" && (
        <div className="space-y-4">
          <Link href={`/quality/lab-reports/create?checkId=${check.id}`} className="app-button-primary inline-flex"><Plus className="h-4 w-4" /> Add Lab Report</Link>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <DataTable
              columns={[
                { key: "reportNumber", label: "Report No." },
                { key: "labName", label: "Laboratory" },
                { key: "reportDate", label: "Date", render: (r) => fmt(r.reportDate as string) },
                { key: "summary", label: "Summary" },
              ]}
              rows={check.labReports as Record<string, unknown>[]}
              empty="No lab reports"
            />
          </div>
        </div>
      )}

      {tab === "corrective-actions" && (
        <div className="space-y-4">
          <Link href={`/quality/corrective-actions/create?checkId=${check.id}`} className="app-button-primary inline-flex"><Plus className="h-4 w-4" /> Add Corrective Action</Link>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <DataTable
              columns={[
                { key: "reference", label: "CAR Ref." },
                { key: "title", label: "Title" },
                { key: "assignedTo", label: "Assigned To", render: (r) => (r.assignedTo as { fullName: string } | undefined)?.fullName ?? "—" },
                { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
                { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              ]}
              rows={check.correctiveActions as Record<string, unknown>[]}
              empty="No corrective actions"
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─── Rejected Batches ─────────────────────────────────────────────────────────

type RejectedBatch = {
  id: string; reference: string; batchNumber?: string; rejectionReason: string; disposalMethod: string;
  quantity?: number; createdAt: string; check?: { reference: string; checkType: string };
  supplier?: { name: string }; correctiveActions: Array<{ id: string; status: string }>;
};

export function RejectedBatchesPage() {
  const [rows, setRows] = useState<RejectedBatch[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<RejectedBatch[]>>("/quality/rejected-batches").then((r) => setRows(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <PageHero kicker="Operations · Quality Control" title="Rejected Batches" subtitle="Batches that failed quality inspection, with disposal status and linked corrective actions." />
      <QualityNav />
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "check", label: "Check", render: (r) => { const c = r.check as { reference: string; checkType: string } | undefined; return c ? `${c.reference} (${CHECK_TYPE_LABELS[c.checkType as CheckType] ?? c.checkType})` : "—"; } },
            { key: "batchNumber", label: "Batch No." },
            { key: "rejectionReason", label: "Reason", render: (r) => <span className="block max-w-xs truncate">{r.rejectionReason as string}</span> },
            { key: "disposalMethod", label: "Disposal", render: (r) => String(r.disposalMethod ?? "—").replace(/_/g, " ") },
            { key: "supplier", label: "Supplier", render: (r) => (r.supplier as { name: string } | undefined)?.name ?? "—" },
            { key: "quantity", label: "Qty" },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
            { key: "cars", label: "CARs", render: (r) => (r.correctiveActions as Array<unknown>)?.length ?? 0 },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No rejected batches"
        />
      </div>
    </AppShell>
  );
}

// ─── Approved Batches ─────────────────────────────────────────────────────────

type ApprovedBatch = {
  id: string; reference: string; batchNumber?: string; quantity?: number; approvalNotes?: string;
  createdAt: string; check?: { reference: string; checkType: string };
  approvedBy?: { fullName: string }; stockBatch?: { batchNumber: string };
};

export function ApprovedBatchesPage() {
  const [rows, setRows] = useState<ApprovedBatch[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<ApprovedBatch[]>>("/quality/approved-batches").then((r) => setRows(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <PageHero kicker="Operations · Quality Control" title="Approved Batches" subtitle="Batches that passed quality inspection and have been released to stock." />
      <QualityNav />
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "check", label: "Check", render: (r) => { const c = r.check as { reference: string; checkType: string } | undefined; return c ? `${c.reference} (${CHECK_TYPE_LABELS[c.checkType as CheckType] ?? c.checkType})` : "—"; } },
            { key: "batchNumber", label: "Batch No." },
            { key: "stockBatch", label: "Stock Batch", render: (r) => (r.stockBatch as { batchNumber: string } | undefined)?.batchNumber ?? "—" },
            { key: "quantity", label: "Qty" },
            { key: "approvedBy", label: "Approved By", render: (r) => (r.approvedBy as { fullName: string } | undefined)?.fullName ?? "—" },
            { key: "approvalNotes", label: "Notes", render: (r) => <span className="block max-w-xs truncate">{String(r.approvalNotes ?? "—")}</span> },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No approved batches"
        />
      </div>
    </AppShell>
  );
}

// ─── Lab Reports ──────────────────────────────────────────────────────────────

type LabReport = {
  id: string; reportNumber: string; labName: string; reportDate: string; summary?: string;
  createdAt: string; check?: { reference: string; checkType: string; batchNumber?: string };
  uploadedBy?: { fullName: string };
};

export function LabReportsPage() {
  const [rows, setRows] = useState<LabReport[]>([]);
  const [checks, setChecks] = useState<{ id: string; reference: string; checkType: string; batchNumber?: string }[]>([]);
  const [form, setForm] = useState({ checkId: "", reportNumber: "", labName: "", reportDate: "", fileUrl: "", fileType: "", summary: "", findings: "", recommendations: "" });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<LabReport[]>>("/quality/lab-reports").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => {
    load();
    apiFetch<ApiEnvelope<{ id: string; reference: string; checkType: string; batchNumber?: string }[]>>("/quality/checks")
      .then((r) => setChecks(r.data)).catch(() => undefined);
  }, []);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/quality/lab-reports", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title="Lab Report Uploads"
        subtitle="Attach external laboratory analysis reports to quality checks for audit and traceability."
        actions={
          <button onClick={() => setShowForm((p) => !p)} className={showForm ? "app-button-secondary" : "app-button-primary"}>
            {showForm ? "Cancel" : <><FlaskConical className="h-4 w-4" /> Upload Report</>}
          </button>
        }
      />
      <QualityNav />

      {showForm && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-5 text-base font-semibold text-ink">New Lab Report</h2>
          {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div><FormLabel>Quality Check *</FormLabel>
              <select required value={form.checkId} onChange={f("checkId")} className={inputCls}>
                <option value="">— Select Check —</option>
                {checks.map((c) => <option key={c.id} value={c.id}>{c.reference} — {c.checkType}{c.batchNumber ? ` (${c.batchNumber})` : ""}</option>)}
              </select>
            </div>
            <div><FormLabel>Report Number *</FormLabel><input required value={form.reportNumber} onChange={f("reportNumber")} className={inputCls} /></div>
            <div><FormLabel>Laboratory Name *</FormLabel><input required value={form.labName} onChange={f("labName")} className={inputCls} /></div>
            <div><FormLabel>Report Date *</FormLabel><input required type="date" value={form.reportDate} onChange={f("reportDate")} className={inputCls} /></div>
            <div><FormLabel>File URL</FormLabel><input value={form.fileUrl} onChange={f("fileUrl")} placeholder="https://..." className={inputCls} /></div>
            <div><FormLabel>File Type</FormLabel><input value={form.fileType} onChange={f("fileType")} placeholder="PDF, DOCX..." className={inputCls} /></div>
            <div className="sm:col-span-2"><FormLabel>Summary</FormLabel><textarea value={form.summary} onChange={f("summary")} rows={2} className={inputCls} /></div>
            <div className="sm:col-span-2"><FormLabel>Findings</FormLabel><textarea value={form.findings} onChange={f("findings")} rows={2} className={inputCls} /></div>
            <div className="sm:col-span-2"><FormLabel>Recommendations</FormLabel><textarea value={form.recommendations} onChange={f("recommendations")} rows={2} className={inputCls} /></div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">{saving ? "Saving..." : "Save Report"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "reportNumber", label: "Report No." },
            { key: "labName", label: "Laboratory" },
            { key: "check", label: "Check", render: (r) => { const c = r.check as { reference: string; batchNumber?: string } | undefined; return c ? `${c.reference}${c.batchNumber ? ` — ${c.batchNumber}` : ""}` : "—"; } },
            { key: "checkType", label: "Type", render: (r) => { const c = r.check as { checkType: string } | undefined; return c ? <StatusBadge status={c.checkType} /> : null; } },
            { key: "reportDate", label: "Date", render: (r) => fmt(r.reportDate as string) },
            { key: "uploadedBy", label: "Uploaded By", render: (r) => (r.uploadedBy as { fullName: string } | undefined)?.fullName ?? "—" },
            { key: "summary", label: "Summary", render: (r) => <span className="block max-w-xs truncate">{String(r.summary ?? "—")}</span> },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No lab reports uploaded"
        />
      </div>
    </AppShell>
  );
}

// ─── Corrective Actions ───────────────────────────────────────────────────────

type CorrectiveAction = {
  id: string; reference: string; title: string; status: string; priority: string;
  dueDate?: string; createdAt: string; check?: { reference: string; checkType: string };
  assignedTo?: { fullName: string }; rejectedBatch?: { reference: string };
};

export function CorrectiveActionsPage() {
  const [rows, setRows] = useState<CorrectiveAction[]>([]);
  const opts = useQCOptions();
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", checkId: "", rejectedBatchId: "", rootCause: "", preventiveMeasure: "", priority: "MEDIUM", assignedToId: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resolveId, setResolveId] = useState("");
  const [resolution, setResolution] = useState("");

  function load() {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    apiFetch<ApiEnvelope<CorrectiveAction[]>>(`/quality/corrective-actions?${p}`).then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [status]);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/quality/corrective-actions", {
        method: "POST",
        body: JSON.stringify({ ...form, checkId: form.checkId || undefined, rejectedBatchId: form.rejectedBatchId || undefined, assignedToId: form.assignedToId || undefined, dueDate: form.dueDate || undefined }),
      });
      setShowForm(false); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function resolve() {
    if (!resolveId || !resolution) return;
    await apiFetch(`/quality/corrective-actions/${resolveId}/resolve`, { method: "PATCH", body: JSON.stringify({ resolution }) })
      .then(() => { setResolveId(""); setResolution(""); load(); }).catch(() => undefined);
  }

  const today = new Date();
  const overdueCount = rows.filter((r) => r.dueDate && new Date(r.dueDate) < today && !["RESOLVED", "CLOSED", "CANCELLED"].includes(r.status)).length;

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title="Corrective Actions (CARs)"
        subtitle="Track, assign, and resolve quality failures with corrective and preventive action requests."
        actions={
          <button onClick={() => setShowForm((p) => !p)} className={showForm ? "app-button-secondary" : "app-button-primary"}>
            {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> New CAR</>}
          </button>
        }
      />
      <QualityNav />

      {overdueCount > 0 && (
        <div className="mb-5 rounded-2xl border border-red-200 border-l-[3px] border-l-red-500 bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-ink">{overdueCount} overdue corrective action{overdueCount > 1 ? "s" : ""}</p>
              <p className="mt-0.5 text-sm text-ink/60">Past their due date and still open. Review and update status immediately.</p>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-5 text-base font-semibold text-ink">New Corrective Action Request</h2>
          {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><FormLabel>Title *</FormLabel><input required value={form.title} onChange={f("title")} className={inputCls} /></div>
            <div className="sm:col-span-2"><FormLabel>Description *</FormLabel><textarea required value={form.description} onChange={f("description")} rows={3} className={inputCls} /></div>
            <div><FormLabel>Priority</FormLabel>
              <select value={form.priority} onChange={f("priority")} className={inputCls}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div><FormLabel>Assign To</FormLabel>
              <select value={form.assignedToId} onChange={f("assignedToId")} className={inputCls}>
                <option value="">— Unassigned —</option>
                {opts.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
            <div><FormLabel>Due Date</FormLabel><input type="date" value={form.dueDate} onChange={f("dueDate")} className={inputCls} /></div>
            <div><FormLabel>Root Cause</FormLabel><input value={form.rootCause} onChange={f("rootCause")} className={inputCls} /></div>
            <div className="sm:col-span-2"><FormLabel>Preventive Measure</FormLabel><textarea value={form.preventiveMeasure} onChange={f("preventiveMeasure")} rows={2} className={inputCls} /></div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">{saving ? "Saving..." : "Create CAR"}</button>
            </div>
          </form>
        </div>
      )}

      {resolveId && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-card">
          <p className="mb-3 font-semibold text-ink">Resolve Corrective Action</p>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Describe the resolution steps taken..." rows={3} className={inputCls} />
          <div className="mt-3 flex gap-2">
            <button onClick={resolve} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">Confirm Resolution</button>
            <button onClick={() => { setResolveId(""); setResolution(""); }} className="app-button-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="mb-5">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10">
          <option value="">All Statuses</option>
          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "reference", label: "CAR Ref." },
            { key: "title", label: "Title" },
            { key: "check", label: "Linked Check", render: (r) => { const c = r.check as { reference: string } | undefined; const rb = r.rejectedBatch as { reference: string } | undefined; return c?.reference ?? rb?.reference ?? "—"; } },
            { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority as string} /> },
            { key: "assignedTo", label: "Assigned To", render: (r) => (r.assignedTo as { fullName: string } | undefined)?.fullName ?? "—" },
            { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "actions", label: "", render: (r) => (r.status === "OPEN" || r.status === "IN_PROGRESS") ? <button onClick={() => setResolveId(r.id as string)} className="text-xs font-medium text-brand hover:underline">Resolve</button> : null },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No corrective actions"
        />
      </div>
    </AppShell>
  );
}

// ─── Quality Reports ──────────────────────────────────────────────────────────

type TypeStat    = { checkType: string; status: string; _count: { _all: number } };
type DecisionStat = { decision: string; _count: { _all: number } };
type CARStat     = { status: string; _count: { _all: number } };
type FailureItem = { reference: string; checkType: string; batchNumber?: string; notes?: string; createdAt: string; branch?: { name: string } };

type ReportData = {
  period: { from?: string; to?: string };
  passRate: number;
  byType: TypeStat[];
  byDecision: DecisionStat[];
  failureReasons: FailureItem[];
  corrActStats: CARStat[];
};

export function QualityReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load(from = dateFrom, to = dateTo) {
    setLoading(true);
    apiFetch<ApiEnvelope<ReportData>>(`/quality/reports?dateFrom=${from}&dateTo=${to}`)
      .then((r) => setData(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(dateFrom, dateTo); }, []);

  const decisionsMap = Object.fromEntries((data?.byDecision ?? []).map((d) => [d.decision, d._count._all]));
  const totalDecisions = Object.values(decisionsMap).reduce((s, v) => s + v, 0);

  const byTypeMap: Record<string, number> = {};
  (data?.byType ?? []).forEach((t) => { byTypeMap[t.checkType] = (byTypeMap[t.checkType] ?? 0) + t._count._all; });
  const maxTypeCount = Math.max(...Object.values(byTypeMap), 1);

  const carTotal = (data?.corrActStats ?? []).reduce((s, c) => s + c._count._all, 0);
  const passRate = data?.passRate ?? 0;

  return (
    <AppShell>
      <PageHero
        kicker="Operations · Quality Control"
        title="Quality Reports"
        subtitle="Period-based analytics — pass rates, batch decisions, check type distribution, and corrective action status."
        actions={
          <button onClick={() => load(dateFrom, dateTo)} disabled={loading} className="app-button-primary disabled:opacity-50">
            {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</> : "Generate Report"}
          </button>
        }
      />
      <QualityNav />

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
        <div>
          <label className={labelCls}>Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </div>
        <div>
          <label className={labelCls}>Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </div>
        <button onClick={() => load(dateFrom, dateTo)} disabled={loading} className="app-button-primary disabled:opacity-50">
          {loading ? "Loading..." : "Apply"}
        </button>
      </div>

      {data && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Pass Rate"    value={pct(passRate)}                       Icon={TrendingUp}     color={passRate >= 90 ? "emerald" : passRate < 70 ? "red" : "amber"} />
            <KpiCard label="Total checks" value={totalDecisions}                      Icon={ClipboardCheck} color="blue" />
            <KpiCard label="Approved"     value={decisionsMap["APPROVED"] ?? 0}       Icon={ShieldCheck}    color="emerald" />
            <KpiCard label="Rejected"     value={decisionsMap["REJECTED"] ?? 0}       Icon={ShieldX}        color="red" />
            <KpiCard label="Quarantine"   value={decisionsMap["QUARANTINE"] ?? 0}     Icon={AlertTriangle}  color="amber" />
            <KpiCard label="Conditional"  value={decisionsMap["CONDITIONALLY_APPROVED"] ?? 0} Icon={CheckCircle} color="purple" />
          </section>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Overall Pass Rate</p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink">{pct(passRate)}</p>
              </div>
              <div className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-extrabold ${passRate >= 90 ? "bg-emerald-100 text-emerald-700" : passRate >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {passRate >= 90 ? "A" : passRate >= 70 ? "B" : "C"}
              </div>
            </div>
            <div className="mt-4 h-4 overflow-hidden rounded-full bg-line">
              <div className={`h-full rounded-full transition-all ${passRate >= 90 ? "bg-emerald-500" : passRate >= 70 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${passRate}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink/40">
              <span>0%</span><span className="text-amber-500">70%</span><span>100%</span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h3 className="mb-4 font-semibold text-ink">Checks by Type</h3>
              <div className="space-y-3">
                {Object.entries(byTypeMap).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-28 shrink-0"><StatusBadge status={type} /></div>
                    <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 8 }}>
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(count / maxTypeCount) * 100}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-sm font-semibold text-ink">{count}</span>
                  </div>
                ))}
                {Object.keys(byTypeMap).length === 0 && <p className="text-sm text-ink/45">No data for period</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h3 className="mb-4 font-semibold text-ink">Corrective Action Status</h3>
              <div className="space-y-3">
                {(data.corrActStats ?? []).map((c) => (
                  <div key={c.status} className="flex items-center gap-3">
                    <div className="w-28 shrink-0"><StatusBadge status={c.status} /></div>
                    <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 8 }}>
                      <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${carTotal > 0 ? (c._count._all / carTotal) * 100 : 0}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-sm font-semibold text-ink">{c._count._all}</span>
                  </div>
                ))}
                {(data.corrActStats ?? []).length === 0 && <p className="text-sm text-ink/45">No corrective actions in period</p>}
              </div>
            </div>
          </div>

          {data.failureReasons.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <div className="flex items-center gap-2 border-b border-line px-5 py-4">
                <XCircle className="h-4 w-4 text-red-500" />
                <h3 className="font-semibold text-ink">Failed Checks in Period</h3>
              </div>
              <DataTable
                columns={[
                  { key: "reference", label: "Reference" },
                  { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
                  { key: "batchNumber", label: "Batch" },
                  { key: "branch", label: "Branch", render: (r) => (r.branch as { name: string } | undefined)?.name ?? "—" },
                  { key: "notes", label: "Notes", render: (r) => <span className="block max-w-xs truncate">{String(r.notes ?? "—")}</span> },
                  { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
                ]}
                rows={data.failureReasons as Record<string, unknown>[]}
                empty="No failures in period"
              />
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
