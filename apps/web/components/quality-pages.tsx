"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmt(d?: string | Date | null) {
  if (!d) return "â€”";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

function pct(v: unknown) {
  return `${Number(v ?? 0).toFixed(1)}%`;
}

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

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-600",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    PASSED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    CONDITIONALLY_PASSED: "bg-yellow-100 text-yellow-800",
    CANCELLED: "bg-gray-200 text-gray-500",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    QUARANTINE: "bg-orange-100 text-orange-700",
    CONDITIONALLY_APPROVED: "bg-yellow-100 text-yellow-800",
    OPEN: "bg-red-100 text-red-700",
    RESOLVED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-200 text-gray-600",
    LOW: "bg-gray-100 text-gray-600",
    MEDIUM: "bg-blue-100 text-blue-700",
    HIGH: "bg-orange-100 text-orange-700",
    URGENT: "bg-red-100 text-red-700",
    ACTIVE: "bg-green-100 text-green-700",
    RAW_MATERIAL: "bg-amber-100 text-amber-700",
    FEED_PRODUCTION: "bg-lime-100 text-lime-700",
    SOYA_PROCESSING: "bg-teal-100 text-teal-700",
    FINISHED_GOODS: "bg-indigo-100 text-indigo-700",
    POULTRY_HEALTH: "bg-pink-100 text-pink-700",
    GOODS_RECEIVED: "bg-purple-100 text-purple-700",
  };
  const c = colours[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{status.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, sub, colour }: { label: string; value: string | number; sub?: string; colour?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white p-5 shadow-sm ${colour ?? ""}`}>
      <p className="text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

// â”€â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const qualityNav = [
  { href: "/quality", label: "Dashboard" },
  { href: "/quality/templates", label: "Templates" },
  { href: "/quality/checks?checkType=RAW_MATERIAL", label: "Raw Material" },
  { href: "/quality/checks?checkType=FEED_PRODUCTION", label: "Feed Quality" },
  { href: "/quality/checks?checkType=SOYA_PROCESSING", label: "Soya Quality" },
  { href: "/quality/checks?checkType=FINISHED_GOODS", label: "Finished Goods" },
  { href: "/quality/checks?checkType=GOODS_RECEIVED", label: "GRN Checks" },
  { href: "/quality/checks?checkType=POULTRY_HEALTH", label: "Poultry Health" },
  { href: "/quality/rejected-batches", label: "Rejected" },
  { href: "/quality/approved-batches", label: "Approved" },
  { href: "/quality/lab-reports", label: "Lab Reports" },
  { href: "/quality/corrective-actions", label: "Corrective Actions" },
  { href: "/quality/reports", label: "Reports" },
];

function QualityNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {qualityNav.map((n) => (
        <Link key={n.href} href={n.href} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium hover:bg-field">
          {n.label}
        </Link>
      ))}
    </div>
  );
}

// â”€â”€â”€ Options hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const [opts, setOpts] = useState<QCOptions>({ templates: [], branches: [], farms: [], warehouses: [], productionSites: [], suppliers: [], users: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<QCOptions>>("/quality/options").then((r) => setOpts(r.data)).catch(() => undefined);
  }, []);
  return opts;
}

// â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DashData = {
  totalChecks: number; pendingChecks: number; passedChecks: number; failedChecks: number;
  rejectedBatches: number; approvedBatches: number; openCorrectiveActions: number; overdueActions: number;
  recentChecks: Array<{ id: string; reference: string; checkType: string; status: string; decision: string; batchNumber?: string; createdAt: string; template?: { name: string }; inspector?: { fullName: string } }>;
};

export function QualityDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<DashData>>("/quality/dashboard").then((r) => setData(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quality Control</h1>
            <p className="mt-0.5 text-sm text-ink/60">Inspections, batch decisions, lab reports and corrective actions</p>
          </div>
          <Link href="/quality/checks/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Check</Link>
        </div>

        <QualityNav />

        {data ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              <StatCard label="Total Checks" value={data.totalChecks} />
              <StatCard label="Pending" value={data.pendingChecks} />
              <StatCard label="Passed" value={data.passedChecks} />
              <StatCard label="Failed" value={data.failedChecks} />
              <StatCard label="Rejected Batches" value={data.rejectedBatches} />
              <StatCard label="Approved Batches" value={data.approvedBatches} />
              <StatCard label="Open CARs" value={data.openCorrectiveActions} />
              <StatCard label="Overdue CARs" value={data.overdueActions} colour={data.overdueActions > 0 ? "border-red-200" : ""} />
            </div>

            <div className="rounded-lg border border-line bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent Quality Checks</h2>
                <Link href="/quality/checks" className="text-xs text-brand hover:underline">View all</Link>
              </div>
              <DataTable
                columns={[
                  { key: "reference", label: "Reference", render: (r) => <Link href={`/quality/checks/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
                  { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
                  { key: "template", label: "Template", render: (r) => r.template?.name ?? "â€”" },
                  { key: "batchNumber", label: "Batch" },
                  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                  { key: "decision", label: "Decision", render: (r) => <StatusBadge status={r.decision as string} /> },
                  { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
                ]}
                rows={data.recentChecks as Record<string, any>[]}
                empty="No quality checks yet"
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/60">Loading dashboard...</p>
        )}
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Templates Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Template = { id: string; code: string; name: string; checkType: string; isActive: boolean; description?: string; _count: { parameters: number; checks: number } };

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

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function addParam() {
    setParams((p) => [...p, { paramCode: "", name: "", paramType: "NUMERIC", unit: "", minValue: "", maxValue: "", isRequired: true }]);
  }

  function removeParam(i: number) { setParams((p) => p.filter((_, idx) => idx !== i)); }

  function updateParam(i: number, k: string, v: string | boolean) {
    setParams((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("/quality/templates", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          parameters: params.map((p, i) => ({
            ...p,
            sortOrder: i,
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
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Quality Check Templates</h1>
          <button onClick={() => setShowCreate((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showCreate ? "Cancel" : "+ New Template"}</button>
        </div>
        <QualityNav />

        {showCreate && (
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">New Template</h2>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><label className="mb-1 block text-xs font-medium">Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium">Check Type *</label>
                  <select required value={form.checkType} onChange={f("checkType")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                    {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Description</label><textarea value={form.description} onChange={f("description")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold">Parameters</label>
                  <button type="button" onClick={addParam} className="text-xs text-brand hover:underline">+ Add Parameter</button>
                </div>
                {params.map((param, i) => (
                  <div key={i} className="mb-2 grid grid-cols-6 gap-2 rounded-md bg-field p-3">
                    <div><label className="mb-1 block text-xs font-medium">Code</label><input value={param.paramCode} onChange={(e) => updateParam(i, "paramCode", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-xs" /></div>
                    <div><label className="mb-1 block text-xs font-medium">Name</label><input value={param.name} onChange={(e) => updateParam(i, "name", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-xs" /></div>
                    <div><label className="mb-1 block text-xs font-medium">Type</label>
                      <select value={param.paramType} onChange={(e) => updateParam(i, "paramType", e.target.value)} className="w-full rounded border border-line px-2 py-1.5 text-xs">
                        {["NUMERIC", "BOOLEAN", "TEXT", "PERCENTAGE"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label className="mb-1 block text-xs font-medium">Unit</label><input value={param.unit} onChange={(e) => updateParam(i, "unit", e.target.value)} placeholder="e.g. %" className="w-full rounded border border-line px-2 py-1.5 text-xs" /></div>
                    <div><label className="mb-1 block text-xs font-medium">Min / Max</label>
                      <div className="flex gap-1">
                        <input type="number" value={param.minValue} onChange={(e) => updateParam(i, "minValue", e.target.value)} placeholder="Min" className="w-full rounded border border-line px-2 py-1.5 text-xs" />
                        <input type="number" value={param.maxValue} onChange={(e) => updateParam(i, "maxValue", e.target.value)} placeholder="Max" className="w-full rounded border border-line px-2 py-1.5 text-xs" />
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={param.isRequired} onChange={(e) => updateParam(i, "isRequired", e.target.checked)} /> Required</label>
                      <button type="button" onClick={() => removeParam(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Create Template"}</button>
            </form>
          </div>
        )}

        <div className="flex gap-3">
          <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Types</option>
            {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Name", render: (r) => <Link href={`/quality/templates/${r.id}`} className="font-medium text-brand hover:underline">{r.name as string}</Link> },
            { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
            { key: "params", label: "Parameters", render: (r) => r._count?.parameters ?? 0 },
            { key: "checks", label: "Checks Used", render: (r) => r._count?.checks ?? 0 },
            { key: "isActive", label: "Active", render: (r) => r.isActive ? "Yes" : "No" },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No templates yet"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Quality Checks List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{pageTitle}</h1>
          <Link href="/quality/checks/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Check</Link>
        </div>
        <QualityNav />

        <div className="flex flex-wrap gap-3">
          <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Types</option>
            {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["PENDING", "IN_PROGRESS", "PASSED", "FAILED", "CONDITIONALLY_PASSED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={decision} onChange={(e) => setDecision(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Decisions</option>
            {["PENDING", "APPROVED", "REJECTED", "QUARANTINE", "CONDITIONALLY_APPROVED"].map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </select>
        </div>

        <p className="text-xs text-ink/50">{data.total} result{data.total !== 1 ? "s" : ""}</p>

        <DataTable
          columns={[
            { key: "reference", label: "Reference", render: (r) => <Link href={`/quality/checks/${r.id}`} className="font-medium text-brand hover:underline">{r.reference as string}</Link> },
            { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
            { key: "template", label: "Template", render: (r) => r.template?.name ?? "â€”" },
            { key: "batchNumber", label: "Batch" },
            { key: "branch", label: "Branch", render: (r) => r.branch?.name ?? "â€”" },
            { key: "score", label: "Score", render: (r) => r.overallScore != null ? pct(r.overallScore) : `${r.passedParameters}/${r.totalParameters}` },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "decision", label: "Decision", render: (r) => <StatusBadge status={r.decision as string} /> },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={data.items as Record<string, any>[]}
          empty="No quality checks"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Quality Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CreateQualityCheckPage() {
  const router = useRouter();
  const opts = useQCOptions();
  const [form, setForm] = useState({
    checkType: "RAW_MATERIAL" as CheckType,
    templateId: "", referenceType: "", referenceId: "",
    batchNumber: "", inspectorId: "", checkedAt: new Date().toISOString().slice(0, 10),
    summary: "", notes: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "",
  });
  const [template, setTemplate] = useState<{ parameters: Array<{ id: string; paramCode: string; name: string; unit?: string; minValue?: number; maxValue?: number; paramType: string; isRequired: boolean }> } | null>(null);
  const [results, setResults] = useState<Record<string, { actualValue: string; passed: boolean; remarks: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!form.templateId) { setTemplate(null); return; }
    apiFetch<ApiEnvelope<typeof template>>(`/quality/templates/${form.templateId}`).then((r) => setTemplate(r.data)).catch(() => undefined);
  }, [form.templateId]);

  function setResult(paramId: string, k: string, v: string | boolean) {
    setResults((p) => ({ ...p, [paramId]: { ...{ actualValue: "", passed: false, remarks: "" }, ...p[paramId], [k]: v } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
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
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/quality/checks" className="text-sm text-ink/60 hover:text-ink">â† Checks</Link>
          <h1 className="text-xl font-bold">New Quality Check</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Check Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Check Type *</label>
                <select required value={form.checkType} onChange={f("checkType")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Template</label>
                <select value={form.templateId} onChange={f("templateId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.templates.filter((t) => !form.checkType || t.checkType === form.checkType).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Batch Number</label><input value={form.batchNumber} onChange={f("batchNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Checked At</label><input type="date" value={form.checkedAt} onChange={f("checkedAt")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Reference Type</label><input value={form.referenceType} onChange={f("referenceType")} placeholder="e.g. GoodsReceivedNote" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Inspector</label>
                <select value={form.inspectorId} onChange={f("inspectorId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Current User â€”</option>
                  {opts.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Farm</label>
                <select value={form.farmId} onChange={f("farmId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.farms.map((f_) => <option key={f_.id} value={f_.id}>{f_.name}</option>)}
                </select>
              </div>
            </div>
            <div><label className="mb-1 block text-xs font-medium">Notes</label><textarea value={form.notes} onChange={f("notes")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
          </div>

          {template && template.parameters.length > 0 && (
            <div className="rounded-lg border border-line bg-white p-5 space-y-3">
              <h2 className="font-semibold">Inspection Parameters</h2>
              {template.parameters.map((param) => {
                const r = results[param.id] ?? { actualValue: "", passed: false, remarks: "" };
                return (
                  <div key={param.id} className="rounded-md border border-line p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{param.name} <span className="text-ink/50 text-xs">({param.paramCode})</span>{param.isRequired && <span className="text-red-500 ml-1">*</span>}</p>
                      {param.unit && <span className="text-xs text-ink/50">{param.unit}</span>}
                    </div>
                    {(param.minValue != null || param.maxValue != null) && (
                      <p className="text-xs text-ink/50">Range: {param.minValue ?? "â€”"} â€“ {param.maxValue ?? "â€”"} {param.unit}</p>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Actual Value</label>
                        {param.paramType === "BOOLEAN"
                          ? <select value={r.actualValue} onChange={(e) => setResult(param.id, "actualValue", e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5 text-sm">
                              <option value="">â€”</option>
                              <option value="true">Pass</option>
                              <option value="false">Fail</option>
                            </select>
                          : <input type={param.paramType === "NUMERIC" || param.paramType === "PERCENTAGE" ? "number" : "text"} step="any" value={r.actualValue} onChange={(e) => setResult(param.id, "actualValue", e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5 text-sm" />
                        }
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={r.passed} onChange={(e) => setResult(param.id, "passed", e.target.checked)} />
                          <span>Passed</span>
                        </label>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Remarks</label>
                        <input value={r.remarks} onChange={(e) => setResult(param.id, "remarks", e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5 text-sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Create Quality Check"}</button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Quality Check Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

export function QualityCheckDetailPage({ id }: { id: string }) {
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [tab, setTab] = useState("overview");
  const [actionForm, setActionForm] = useState({ type: "", notes: "", reason: "", conditions: "", score: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<CheckDetail>>(`/quality/checks/${id}`).then((r) => setCheck(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [id]);

  async function takeAction(type: string) {
    setSaving(true); setError("");
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};
      if (type === "pass") { endpoint = `/quality/checks/${id}/pass`; body = { notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined }; }
      else if (type === "fail") { endpoint = `/quality/checks/${id}/fail`; body = { reason: actionForm.reason, notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined }; }
      else if (type === "conditional") { endpoint = `/quality/checks/${id}/conditional-pass`; body = { conditions: actionForm.conditions, notes: actionForm.notes, overallScore: actionForm.score ? Number(actionForm.score) : undefined }; }
      else if (type === "approve") { endpoint = `/quality/checks/${id}/approve-batch`; body = { approvalNotes: actionForm.notes }; }
      else if (type === "reject") { endpoint = `/quality/checks/${id}/reject-batch`; body = { rejectionReason: actionForm.reason }; }
      else if (type === "quarantine") { endpoint = `/quality/checks/${id}/quarantine`; body = { reason: actionForm.reason, notes: actionForm.notes }; }
      if (endpoint) {
        await apiFetch(endpoint, { method: "PATCH", body: JSON.stringify(body) });
        setActionForm({ type: "", notes: "", reason: "", conditions: "", score: "" });
        load();
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (!check) return <AppShell><p className="p-6 text-sm text-ink/60">Loading...</p></AppShell>;

  const canDecide = check.status === "IN_PROGRESS" || check.status === "PENDING";
  const tabs = ["overview", "results", "lab-reports", "corrective-actions"];

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/quality/checks" className="text-sm text-ink/60 hover:text-ink">â† Checks</Link>
          <h1 className="text-xl font-bold">{check.reference}</h1>
          <StatusBadge status={check.checkType} />
          <StatusBadge status={check.status} />
          <StatusBadge status={check.decision} />
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {canDecide && !actionForm.type && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActionForm((p) => ({ ...p, type: "pass" }))} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Pass Check</button>
            <button onClick={() => setActionForm((p) => ({ ...p, type: "fail" }))} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Fail Check</button>
            <button onClick={() => setActionForm((p) => ({ ...p, type: "conditional" }))} className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-semibold text-white">Conditional Pass</button>
            {!check.approvedBatch && !check.rejectedBatch && (
              <>
                <button onClick={() => setActionForm((p) => ({ ...p, type: "approve" }))} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Approve Batch</button>
                <button onClick={() => setActionForm((p) => ({ ...p, type: "reject" }))} className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">Reject Batch</button>
                <button onClick={() => setActionForm((p) => ({ ...p, type: "quarantine" }))} className="rounded-md bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white">Quarantine</button>
              </>
            )}
          </div>
        )}

        {actionForm.type && (
          <div className="rounded-lg border border-line bg-white p-4 space-y-3">
            <p className="font-semibold capitalize">{actionForm.type.replace(/_/g, " ")} Action</p>
            {(actionForm.type === "fail" || actionForm.type === "reject" || actionForm.type === "quarantine") && (
              <div><label className="mb-1 block text-xs font-medium">Reason *</label><textarea value={actionForm.reason} onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            )}
            {actionForm.type === "conditional" && (
              <div><label className="mb-1 block text-xs font-medium">Conditions *</label><textarea value={actionForm.conditions} onChange={(e) => setActionForm((p) => ({ ...p, conditions: e.target.value }))} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            )}
            {(actionForm.type === "pass" || actionForm.type === "fail" || actionForm.type === "conditional") && (
              <div><label className="mb-1 block text-xs font-medium">Overall Score (%)</label><input type="number" min={0} max={100} value={actionForm.score} onChange={(e) => setActionForm((p) => ({ ...p, score: e.target.value }))} className="w-48 rounded-md border border-line px-3 py-2 text-sm" /></div>
            )}
            <div><label className="mb-1 block text-xs font-medium">Notes</label><textarea value={actionForm.notes} onChange={(e) => setActionForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button onClick={() => takeAction(actionForm.type)} disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Confirm"}</button>
              <button onClick={() => setActionForm({ type: "", notes: "", reason: "", conditions: "", score: "" })} className="rounded-md border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-line pb-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-medium capitalize rounded-t-md ${tab === t ? "bg-brand text-white" : "hover:bg-field"}`}>{t.replace(/-/g, " ")}</button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-white p-5">
              <h2 className="mb-3 font-semibold">Check Info</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink/60">Reference</dt><dd className="font-medium">{check.reference}</dd>
                <dt className="text-ink/60">Type</dt><dd><StatusBadge status={check.checkType} /></dd>
                <dt className="text-ink/60">Template</dt><dd>{check.template?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Batch Number</dt><dd>{check.batchNumber ?? "â€”"}</dd>
                <dt className="text-ink/60">Inspector</dt><dd>{check.inspector?.fullName ?? "â€”"}</dd>
                <dt className="text-ink/60">Branch</dt><dd>{check.branch?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Score</dt><dd>{check.overallScore != null ? pct(check.overallScore) : `${check.passedParameters}/${check.totalParameters}`}</dd>
                <dt className="text-ink/60">Approved By</dt><dd>{check.approvedBy?.fullName ?? "â€”"}</dd>
              </dl>
            </div>
            {(check.rejectedBatch || check.approvedBatch) && (
              <div className="rounded-lg border border-line bg-white p-5">
                <h2 className="mb-3 font-semibold">Batch Decision</h2>
                {check.approvedBatch && (
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-ink/60">Decision</dt><dd><StatusBadge status="APPROVED" /></dd>
                    <dt className="text-ink/60">Reference</dt><dd>{check.approvedBatch.reference}</dd>
                    <dt className="text-ink/60">Stock Batch</dt><dd>{check.approvedBatch.stockBatch?.batchNumber ?? "â€”"}</dd>
                    <dt className="text-ink/60">Notes</dt><dd>{check.approvedBatch.approvalNotes ?? "â€”"}</dd>
                  </dl>
                )}
                {check.rejectedBatch && (
                  <dl className="grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-ink/60">Decision</dt><dd><StatusBadge status="REJECTED" /></dd>
                    <dt className="text-ink/60">Reference</dt><dd>{check.rejectedBatch.reference}</dd>
                    <dt className="text-ink/60">Reason</dt><dd>{check.rejectedBatch.rejectionReason}</dd>
                    <dt className="text-ink/60">Disposal</dt><dd>{check.rejectedBatch.disposalMethod}</dd>
                  </dl>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "results" && (
          <DataTable
            columns={[
              { key: "parameter", label: "Parameter", render: (r) => `${r.parameter?.name} (${r.parameter?.paramCode})` },
              { key: "actualValue", label: "Actual Value", render: (r) => r.actualValue ? `${r.actualValue}${r.parameter?.unit ? ` ${r.parameter.unit}` : ""}` : "â€”" },
              { key: "range", label: "Expected Range", render: (r) => r.parameter?.minValue != null ? `${r.parameter.minValue} â€“ ${r.parameter.maxValue} ${r.parameter.unit ?? ""}` : "â€”" },
              { key: "passed", label: "Result", render: (r) => <StatusBadge status={r.passed ? "PASSED" : "FAILED"} /> },
              { key: "deviation", label: "Deviation", render: (r) => r.deviation != null ? String(r.deviation) : "â€”" },
              { key: "remarks", label: "Remarks" },
            ]}
            rows={check.results as Record<string, any>[]}
            empty="No results recorded"
          />
        )}

        {tab === "lab-reports" && (
          <div className="space-y-3">
            <Link href={`/quality/lab-reports/create?checkId=${check.id}`} className="inline-block rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">+ Add Lab Report</Link>
            <DataTable
              columns={[
                { key: "reportNumber", label: "Report No." },
                { key: "labName", label: "Laboratory" },
                { key: "reportDate", label: "Date", render: (r) => fmt(r.reportDate as string) },
                { key: "summary", label: "Summary" },
              ]}
              rows={check.labReports as Record<string, any>[]}
              empty="No lab reports"
            />
          </div>
        )}

        {tab === "corrective-actions" && (
          <div className="space-y-3">
            <Link href={`/quality/corrective-actions/create?checkId=${check.id}`} className="inline-block rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">+ Add Corrective Action</Link>
            <DataTable
              columns={[
                { key: "reference", label: "CAR Ref." },
                { key: "title", label: "Title" },
                { key: "assignedTo", label: "Assigned To", render: (r) => r.assignedTo?.fullName ?? "â€”" },
                { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
                { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              ]}
              rows={check.correctiveActions as Record<string, any>[]}
              empty="No corrective actions"
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Rejected Batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type RejectedBatch = { id: string; reference: string; batchNumber?: string; rejectionReason: string; disposalMethod: string; disposalDate?: string; quantity?: number; estimatedValue?: number; createdAt: string; check?: { reference: string; checkType: string }; supplier?: { name: string }; correctiveActions: Array<{ id: string; status: string }> };

export function RejectedBatchesPage() {
  const [rows, setRows] = useState<RejectedBatch[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<RejectedBatch[]>>("/quality/rejected-batches").then((r) => setRows(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Rejected Batches</h1>
        <QualityNav />
        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "check", label: "Check", render: (r) => r.check ? `${r.check.reference} (${CHECK_TYPE_LABELS[r.check.checkType as CheckType] ?? r.check.checkType})` : "â€”" },
            { key: "batchNumber", label: "Batch No." },
            { key: "rejectionReason", label: "Reason", render: (r) => <span className="max-w-xs truncate block">{r.rejectionReason as string}</span> },
            { key: "disposalMethod", label: "Disposal", render: (r) => r.disposalMethod?.replace(/_/g, " ") ?? "â€”" },
            { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "â€”" },
            { key: "quantity", label: "Qty" },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
            { key: "cars", label: "CARs", render: (r) => r.correctiveActions?.length ?? 0 },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No rejected batches"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Approved Batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ApprovedBatch = { id: string; reference: string; batchNumber?: string; quantity?: number; approvalNotes?: string; createdAt: string; check?: { reference: string; checkType: string }; approvedBy?: { fullName: string }; stockBatch?: { batchNumber: string } };

export function ApprovedBatchesPage() {
  const [rows, setRows] = useState<ApprovedBatch[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<ApprovedBatch[]>>("/quality/approved-batches").then((r) => setRows(r.data)).catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Approved Batches</h1>
        <QualityNav />
        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "check", label: "Check", render: (r) => r.check ? `${r.check.reference} (${CHECK_TYPE_LABELS[r.check.checkType as CheckType] ?? r.check.checkType})` : "â€”" },
            { key: "batchNumber", label: "Batch No." },
            { key: "stockBatch", label: "Stock Batch", render: (r) => r.stockBatch?.batchNumber ?? "â€”" },
            { key: "quantity", label: "Qty" },
            { key: "approvedBy", label: "Approved By", render: (r) => r.approvedBy?.fullName ?? "â€”" },
            { key: "approvalNotes", label: "Notes", render: (r) => <span className="max-w-xs truncate block">{r.approvalNotes as string ?? "â€”"}</span> },
            { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No approved batches"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Lab Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type LabReport = { id: string; reportNumber: string; labName: string; reportDate: string; summary?: string; findings?: string; createdAt: string; check?: { reference: string; checkType: string; batchNumber?: string }; uploadedBy?: { fullName: string } };

export function LabReportsPage() {
  const [rows, setRows] = useState<LabReport[]>([]);
  const opts = useQCOptions();
  const [form, setForm] = useState({ checkId: "", reportNumber: "", labName: "", reportDate: "", fileUrl: "", fileType: "", summary: "", findings: "", recommendations: "" });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<LabReport[]>>("/quality/lab-reports").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("/quality/lab-reports", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Lab Report Uploads</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Upload Report"}</button>
        </div>
        <QualityNav />

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Lab Report</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Quality Check *</label>
                <select required value={form.checkId} onChange={f("checkId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select Check â€”</option>
                  {opts.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Report Number *</label><input required value={form.reportNumber} onChange={f("reportNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Laboratory Name *</label><input required value={form.labName} onChange={f("labName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Report Date *</label><input required type="date" value={form.reportDate} onChange={f("reportDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">File URL</label><input value={form.fileUrl} onChange={f("fileUrl")} placeholder="https://..." className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">File Type</label><input value={form.fileType} onChange={f("fileType")} placeholder="PDF, DOCX..." className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Summary</label><textarea value={form.summary} onChange={f("summary")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Findings</label><textarea value={form.findings} onChange={f("findings")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Recommendations</label><textarea value={form.recommendations} onChange={f("recommendations")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Report"}</button></div>
            </form>
          </div>
        )}

        <DataTable
          columns={[
            { key: "reportNumber", label: "Report No." },
            { key: "labName", label: "Laboratory" },
            { key: "check", label: "Check", render: (r) => r.check ? `${r.check.reference}${r.check.batchNumber ? ` â€” ${r.check.batchNumber}` : ""}` : "â€”" },
            { key: "checkType", label: "Type", render: (r) => r.check ? <StatusBadge status={r.check.checkType as string} /> : null },
            { key: "reportDate", label: "Date", render: (r) => fmt(r.reportDate as string) },
            { key: "uploadedBy", label: "Uploaded By", render: (r) => r.uploadedBy?.fullName ?? "â€”" },
            { key: "summary", label: "Summary", render: (r) => <span className="max-w-xs truncate block">{r.summary as string ?? "â€”"}</span> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No lab reports uploaded"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Corrective Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CorrectiveAction = { id: string; reference: string; title: string; status: string; priority: string; dueDate?: string; completedAt?: string; createdAt: string; check?: { reference: string; checkType: string }; assignedTo?: { fullName: string }; verifiedBy?: { fullName: string }; rejectedBatch?: { reference: string } };

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

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("/quality/corrective-actions", {
        method: "POST",
        body: JSON.stringify({ ...form, checkId: form.checkId || undefined, rejectedBatchId: form.rejectedBatchId || undefined, assignedToId: form.assignedToId || undefined, dueDate: form.dueDate || undefined }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function resolve() {
    if (!resolveId || !resolution) return;
    await apiFetch(`/quality/corrective-actions/${resolveId}/resolve`, { method: "PATCH", body: JSON.stringify({ resolution }) }).then(() => { setResolveId(""); setResolution(""); load(); }).catch(() => undefined);
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Corrective Actions (CARs)</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ New CAR"}</button>
        </div>
        <QualityNav />

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Corrective Action Request</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Title *</label><input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Description *</label><textarea required value={form.description} onChange={f("description")} rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Priority</label>
                <select value={form.priority} onChange={f("priority")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Assign To</label>
                <select value={form.assignedToId} onChange={f("assignedToId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Unassigned â€”</option>
                  {opts.users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Due Date</label><input type="date" value={form.dueDate} onChange={f("dueDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Root Cause</label><input value={form.rootCause} onChange={f("rootCause")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Preventive Measure</label><textarea value={form.preventiveMeasure} onChange={f("preventiveMeasure")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Create CAR"}</button></div>
            </form>
          </div>
        )}

        {resolveId && (
          <div className="rounded-lg border border-line bg-white p-4 space-y-3">
            <p className="font-semibold text-sm">Resolve Corrective Action</p>
            <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Describe the resolution..." rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={resolve} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white">Confirm Resolution</button>
              <button onClick={() => { setResolveId(""); setResolution(""); }} className="rounded-md border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>

        <DataTable
          columns={[
            { key: "reference", label: "CAR Ref." },
            { key: "title", label: "Title" },
            { key: "check", label: "Linked Check", render: (r) => r.check?.reference ?? r.rejectedBatch?.reference ?? "â€”" },
            { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority as string} /> },
            { key: "assignedTo", label: "Assigned To", render: (r) => r.assignedTo?.fullName ?? "â€”" },
            { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            {
              key: "actions", label: "Actions", render: (r) => r.status === "OPEN" || r.status === "IN_PROGRESS"
                ? <button onClick={() => setResolveId(r.id as string)} className="text-xs text-brand hover:underline">Resolve</button>
                : null
            },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No corrective actions"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Quality Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ReportData = {
  period: { from?: string; to?: string };
  passRate: number;
  byType: Array<{ checkType: string; status: string; _count: { _all: number } }>;
  byDecision: Array<{ decision: string; _count: { _all: number } }>;
  failureReasons: Array<{ reference: string; checkType: string; batchNumber?: string; notes?: string; createdAt: string; branch?: { name: string } }>;
  corrActStats: Array<{ status: string; _count: { _all: number } }>;
};

export function QualityReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<ApiEnvelope<ReportData>>(`/quality/reports?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => setData(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const decisionsMap = Object.fromEntries((data?.byDecision ?? []).map((d) => [d.decision, d._count._all]));
  const totalDecisions = Object.values(decisionsMap).reduce((s, v) => s + v, 0);

  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Quality Reports</h1>
        <QualityNav />

        <div className="flex items-end gap-3">
          <div><label className="mb-1 block text-xs font-medium">From</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-medium">To</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" /></div>
          <button onClick={load} disabled={loading} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading..." : "Generate"}</button>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Pass Rate" value={pct(data.passRate)} colour={data.passRate >= 90 ? "border-green-200" : data.passRate < 70 ? "border-red-200" : ""} />
              <StatCard label="Total Checks" value={totalDecisions} />
              <StatCard label="Approved" value={decisionsMap["APPROVED"] ?? 0} />
              <StatCard label="Rejected" value={decisionsMap["REJECTED"] ?? 0} />
              <StatCard label="Quarantine" value={decisionsMap["QUARANTINE"] ?? 0} />
              <StatCard label="Conditional" value={decisionsMap["CONDITIONALLY_APPROVED"] ?? 0} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold">Checks by Type & Status</h2>
                <DataTable
                  columns={[
                    { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                    { key: "count", label: "Count", render: (r) => r._count?._all ?? 0 },
                  ]}
                  rows={data.byType as Record<string, any>[]}
                  empty="No data"
                />
              </div>

              <div className="rounded-lg border border-line bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold">Corrective Action Status</h2>
                <DataTable
                  columns={[
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                    { key: "count", label: "Count", render: (r) => r._count?._all ?? 0 },
                  ]}
                  rows={data.corrActStats as Record<string, any>[]}
                  empty="No data"
                />
              </div>
            </div>

            <div className="rounded-lg border border-line bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold">Recent Failures</h2>
              <DataTable
                columns={[
                  { key: "reference", label: "Reference" },
                  { key: "checkType", label: "Type", render: (r) => <StatusBadge status={r.checkType as string} /> },
                  { key: "batchNumber", label: "Batch" },
                  { key: "branch", label: "Branch", render: (r) => r.branch?.name ?? "â€”" },
                  { key: "notes", label: "Notes", render: (r) => <span className="max-w-xs truncate block">{r.notes as string ?? "â€”"}</span> },
                  { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
                ]}
                rows={data.failureReasons as Record<string, any>[]}
                empty="No failures in period"
              />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}



