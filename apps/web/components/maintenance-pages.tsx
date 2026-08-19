"use client";

import { ComponentType, FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Calendar, ChevronRight, Clock, Cpu, DollarSign, Download, FileText, Pencil, Plus, RefreshCw, Save, Trash2, User, Wrench } from "lucide-react";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ConfirmModal, Modal, StatusBadge } from "./ui";
import { useAuth } from "./auth-context";
import { ApiEnvelope, apiFetch, downloadReport, getCached, getCachedFirst, hasCached, invalidateCache } from "../lib/api";
import { useApiRecovery } from "../lib/use-api-recovery";

type Option = {
  id: string;
  code?: string;
  sku?: string;
  name?: string;
  fullName?: string;
  email?: string;
};

type MaintenanceOptions = {
  branches: Option[];
  farms: Option[];
  warehouses: Option[];
  productionSites: Option[];
  machines: Option[];
  equipment: Option[];
  spareParts: Option[];
  technicians: Option[];
};

type AssetRef = { id: string; code: string; name: string };

type Schedule = {
  id: string;
  scheduleNumber: string;
  title: string;
  maintenanceType: string;
  priority: string;
  status: string;
  nextDueDate: string;
  machine?: AssetRef | null;
  equipment?: AssetRef | null;
};

type Breakdown = {
  id: string;
  breakdownNumber: string;
  severity: string;
  status: string;
  description: string;
  reportedAt: string;
  machine?: AssetRef | null;
  equipment?: AssetRef | null;
};

type Assignment = {
  id: string;
  status: string;
  assignedAt: string;
  dueDate?: string | null;
  technician: { fullName: string; email: string };
  machine?: AssetRef | null;
  equipment?: AssetRef | null;
};

type AssetDocument = {
  id: string;
  documentType: string;
  documentNumber?: string | null;
  expiryDate: string;
  machine?: AssetRef | null;
  equipment?: AssetRef | null;
};

type DashboardData = {
  machineCount: number;
  activeMachines: number;
  maintenanceAlerts: number;
  openBreakdowns: number;
  expiringDocuments: number;
  downtimeHours: number;
  maintenanceCost: number;
  schedules: Schedule[];
  breakdowns: Breakdown[];
  documents: AssetDocument[];
  assignments: Assignment[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";

function useOptions() {
  const [options, setOptions] = useState<MaintenanceOptions>(() => getCached<ApiEnvelope<MaintenanceOptions>>("/maintenance/options")?.data ?? { branches: [], farms: [], warehouses: [], productionSites: [], machines: [], equipment: [], spareParts: [], technicians: [] });
  const [optionsError, setOptionsError] = useState("");
  const [_maintOptKey, _setMaintOptKey] = useState(0);
  const forceAccept = useRef(false);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<MaintenanceOptions>>("/maintenance/options")
      .then((response) => {
        const fresh = response.data ?? { branches: [], farms: [], warehouses: [], productionSites: [], machines: [], equipment: [], spareParts: [], technicians: [] };
        setOptions((prev) => !force && fresh.machines.length === 0 && prev.machines.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load options."));
  }, [_maintOptKey]);
  useEffect(() => {
    function onRecovered() { _setMaintOptKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);
  return { options, optionsError };
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div>
          <p className="app-kicker flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Operations · Maintenance
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/55">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="app-button-secondary text-xs" href="/maintenance/machines">Machines</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/equipment">Equipment</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/schedules">Schedules</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/breakdowns">Breakdowns</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/assignments">Assignments</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/downtime">Downtime</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/documents">Documents</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/costs">Costs</Link>
        </div>
      </div>
    </div>
  );
}

function fmt(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-GH", { maximumFractionDigits: 2 });
}

type KpiColor = "blue" | "emerald" | "amber" | "red" | "purple" | "brand";
const KPI_STYLES: Record<KpiColor, { wrap: string; icon: string; dot: string }> = {
  blue:    { wrap: "from-blue-50",    icon: "bg-blue-100 text-blue-600",       dot: "bg-blue-500" },
  emerald: { wrap: "from-emerald-50", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
  amber:   { wrap: "from-amber-50",   icon: "bg-amber-100 text-amber-600",     dot: "bg-amber-500" },
  red:     { wrap: "from-red-50",     icon: "bg-red-100 text-red-600",         dot: "bg-red-500" },
  purple:  { wrap: "from-purple-50",  icon: "bg-purple-100 text-purple-600",   dot: "bg-purple-500" },
  brand:   { wrap: "from-brand/10",   icon: "bg-brand/15 text-brand",          dot: "bg-brand" },
};

function KpiCard({ label, value, Icon, color, sub }: { label: string; value: string; Icon: ComponentType<{ className?: string }>; color: KpiColor; sub?: string }) {
  const s = KPI_STYLES[color];
  return (
    <article className={`rounded-2xl border border-line bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className={`mt-1 h-2 w-2 rounded-full ${s.dot}`} />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <strong className="mt-1 block text-[26px] font-extrabold leading-none tracking-tight text-ink">{value}</strong>
      {sub && <p className="mt-1 text-xs text-ink/45">{sub}</p>}
    </article>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const c: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 border-red-200",
    HIGH:     "bg-amber-100 text-amber-700 border-amber-200",
    MEDIUM:   "bg-blue-100 text-blue-700 border-blue-200",
    LOW:      "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${c[priority] ?? c.LOW}`}>{priority}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const c: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 border-red-200",
    HIGH:     "bg-amber-100 text-amber-700 border-amber-200",
    MEDIUM:   "bg-blue-100 text-blue-700 border-blue-200",
    LOW:      "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${c[severity] ?? c.LOW}`}>{severity}</span>;
}

const QUICK_ACTIONS = [
  { href: "/maintenance/machines",           label: "Machines",        desc: "Register & view assets",     icon: Cpu,           color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
  { href: "/maintenance/equipment",          label: "Equipment",       desc: "Register & view equipment",  icon: Cpu,           color: "text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100" },
  { href: "/maintenance/schedules",          label: "PM Schedules",    desc: "Preventive maintenance",     icon: Calendar,      color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
  { href: "/maintenance/breakdowns",         label: "Breakdowns",      desc: "Log & track incidents",      icon: AlertTriangle, color: "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" },
  { href: "/maintenance/records",            label: "Work Orders",     desc: "Log & view completed work",  icon: Activity,      color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
  { href: "/maintenance/assignments",        label: "Assignments",     desc: "Technician work assignment", icon: User,          color: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
  { href: "/maintenance/spare-parts",        label: "Spare Parts",     desc: "Parts inventory",            icon: Wrench,        color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { href: "/maintenance/downtime",           label: "Downtime",        desc: "Log asset downtime",         icon: Clock,         color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
  { href: "/maintenance/documents",          label: "Documents",       desc: "Registration & renewals",    icon: FileText,      color: "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100" },
  { href: "/maintenance/costs",              label: "Costs",           desc: "Repair & labour costs",      icon: DollarSign,    color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" },
];

export function MaintenanceDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(() => getCachedFirst<ApiEnvelope<DashboardData>>("/maintenance/dashboard")?.data ?? null);
  const [loading, setLoading] = useState(!hasCached("/maintenance/dashboard"));
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch<ApiEnvelope<DashboardData>>("/maintenance/dashboard");
      setData(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maintenance dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useApiRecovery(!data, () => void load());

  const today = new Date();
  const overdueCount = (data?.schedules ?? []).filter((s) => new Date(s.nextDueDate) < today && s.status !== "COMPLETED").length;
  const hasAlerts = (data?.maintenanceAlerts ?? 0) > 0 || (data?.openBreakdowns ?? 0) > 0 || (data?.expiringDocuments ?? 0) > 0;
  const utilPct = data && data.machineCount > 0 ? Math.round((data.activeMachines / data.machineCount) * 100) : 0;

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <p className="app-kicker flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Maintenance
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Maintenance Dashboard
            </h1>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink/55">
              Machine health, preventive schedules, breakdown tracking, spare parts, downtime, and repair cost visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {data && (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 shadow-card">
                <span className={`h-2.5 w-2.5 rounded-full ${hasAlerts ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <span className="text-xs font-semibold text-ink/70">
                  {hasAlerts ? "Attention needed" : "All systems normal"}
                </span>
              </div>
            )}
            <button onClick={load} disabled={loading} className="app-button-secondary text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link className="app-button-primary text-xs" href="/maintenance/breakdowns">
              <Plus className="h-3.5 w-3.5" />
              Report breakdown
            </Link>
          </div>
        </div>

        {/* Machine utilisation bar */}
        {data && data.machineCount > 0 && (
          <div className="border-t border-line/50 bg-field/30 px-6 py-3.5">
            <div className="flex items-center gap-4">
              <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink/40">Fleet utilisation</p>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{ width: `${utilPct}%`, background: utilPct >= 80 ? "linear-gradient(90deg,#10b981,#059669)" : utilPct >= 50 ? "linear-gradient(90deg,#f58220,#dd741b)" : "linear-gradient(90deg,#ef4444,#dc2626)" }}
                />
              </div>
              <p className="shrink-0 text-xs font-bold text-ink/70">{data.activeMachines}/{data.machineCount} active · {utilPct}%</p>
            </div>
          </div>
        )}
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {/* Alert banner */}
      {hasAlerts && data && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 shadow-card">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Maintenance attention needed</p>
            <p className="mt-0.5 text-sm text-ink/60">
              {data.maintenanceAlerts > 0 && `${data.maintenanceAlerts} overdue maintenance ${data.maintenanceAlerts === 1 ? "schedule" : "schedules"}`}
              {data.maintenanceAlerts > 0 && data.openBreakdowns > 0 && " · "}
              {data.openBreakdowns > 0 && `${data.openBreakdowns} open ${data.openBreakdowns === 1 ? "breakdown" : "breakdowns"}`}
              {(data.maintenanceAlerts > 0 || data.openBreakdowns > 0) && data.expiringDocuments > 0 && " · "}
              {data.expiringDocuments > 0 && `${data.expiringDocuments} document${data.expiringDocuments === 1 ? "" : "s"} expiring/overdue`}
              {overdueCount > 0 && ` · ${overdueCount} past due date`}
            </p>
          </div>
          <Link href="/maintenance/schedules" className="shrink-0 text-xs font-semibold text-amber-700 hover:underline">
            View schedules →
          </Link>
        </div>
      )}

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total machines"     value={fmt(data?.machineCount)}           Icon={Cpu}           color="blue"    />
        <KpiCard label="Active machines"    value={fmt(data?.activeMachines)}         Icon={Activity}      color="emerald" sub={data ? `${utilPct}% fleet utilisation` : undefined} />
        <KpiCard label="Maintenance alerts" value={fmt(data?.maintenanceAlerts)}      Icon={AlertTriangle} color="amber"   sub={overdueCount > 0 ? `${overdueCount} past due` : undefined} />
        <KpiCard label="Open breakdowns"    value={fmt(data?.openBreakdowns)}         Icon={Wrench}        color="red"     />
        <KpiCard label="Expiring documents" value={fmt(data?.expiringDocuments)}      Icon={FileText}      color="purple"  sub="Due or expiring within 30 days" />
        <KpiCard label="Total downtime"     value={`${fmt(data?.downtimeHours)} hrs`} Icon={Clock}         color="purple"  />
        <KpiCard label="Maintenance cost"   value={`GHS ${fmt(data?.maintenanceCost)}`} Icon={DollarSign}  color="brand"   />
      </section>

      {/* ── Quick actions ───────────────────────────────────────────────────── */}
      <section className="mb-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-ink/40">Quick access</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map(({ href, label, desc, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col gap-2 rounded-xl border p-4 transition ${color}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="text-sm font-bold">{label}</span>
              </div>
              <p className="text-[11px] font-medium opacity-75 leading-snug">{desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Schedules + Breakdowns ─────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Upcoming schedules */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-white to-field/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                <Calendar className="h-4 w-4 text-blue-600" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">Upcoming Schedules</h3>
                <p className="text-[11px] text-ink/45">Preventive maintenance queue</p>
              </div>
            </div>
            <Link href="/maintenance/schedules" className="flex items-center gap-0.5 text-xs font-semibold text-brand hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-line/60">
            {(data?.schedules ?? []).slice(0, 6).length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-field">
                  <Calendar className="h-5 w-5 text-ink/20" />
                </span>
                <p className="text-sm font-medium text-ink/40">No upcoming schedules</p>
                <Link href="/maintenance/schedules/create" className="mt-2 text-xs font-semibold text-brand hover:underline">Create a schedule →</Link>
              </div>
            ) : (data?.schedules ?? []).slice(0, 6).map((s) => {
              const due = new Date(s.nextDueDate);
              const overdue = due < today && s.status !== "COMPLETED";
              const soon = !overdue && due <= new Date(today.getTime() + 7 * 86_400_000);
              return (
                <div key={s.id} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-field/40">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-red-100 text-red-600" : soon ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">{s.title}</span>
                      <PriorityBadge priority={s.priority} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {s.machine?.name ?? s.equipment?.name ?? "No asset"} · {s.maintenanceType.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-bold ${overdue ? "text-red-600" : soon ? "text-amber-600" : "text-ink/55"}`}>
                      {due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </p>
                    {overdue && <p className="text-[10px] font-semibold text-red-500">Overdue</p>}
                    {soon && !overdue && <p className="text-[10px] font-semibold text-amber-500">Due soon</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent breakdowns */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-white to-field/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                <Wrench className="h-4 w-4 text-red-600" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">Recent Breakdowns</h3>
                <p className="text-[11px] text-ink/45">Unresolved incidents</p>
              </div>
            </div>
            <Link href="/maintenance/breakdowns" className="flex items-center gap-0.5 text-xs font-semibold text-brand hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-line/60">
            {(data?.breakdowns ?? []).slice(0, 6).length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-field">
                  <Wrench className="h-5 w-5 text-ink/20" />
                </span>
                <p className="text-sm font-medium text-ink/40">No breakdowns recorded</p>
                <Link href="/maintenance/breakdowns" className="mt-2 text-xs font-semibold text-brand hover:underline">Report a breakdown →</Link>
              </div>
            ) : (data?.breakdowns ?? []).slice(0, 6).map((b) => (
              <div key={b.id} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-field/40">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${b.severity === "CRITICAL" || b.severity === "HIGH" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
                  <Wrench className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">
                      {b.machine?.name ?? b.equipment?.name ?? b.breakdownNumber}
                    </span>
                    <SeverityBadge severity={b.severity} />
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink/50">{b.description}</p>
                </div>
                <p className="shrink-0 text-[11px] font-medium text-ink/40">
                  {new Date(b.reportedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Technician Assignments ─────────────────────────────────────────── */}
      {(data?.assignments ?? []).length > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
          <div className="flex items-center gap-2.5 border-b border-line bg-gradient-to-r from-white to-field/60 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
              <User className="h-4 w-4 text-brand" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink">Technician Assignments</h3>
              <p className="text-[11px] text-ink/45">Active work assignments</p>
            </div>
          </div>
          <div className="grid divide-y divide-line/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {(data?.assignments ?? []).slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-field/40">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-brand/10 text-sm font-bold text-brand">
                  {a.technician.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{a.technician.fullName}</p>
                  <p className="text-xs text-ink/50">{a.machine?.name ?? a.equipment?.name ?? "General task"}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const MACHINE_TYPES = ["FEED_MIXER", "GRINDER", "PELLETIZER", "SOYA_EXPELLER", "OIL_FILTER", "GENERATOR", "WEIGHING_SCALE", "PACKAGING_MACHINE", "DELIVERY_VEHICLE", "POULTRY_EQUIPMENT", "OTHER"];
const ASSET_STATUSES = ["ACTIVE", "UNDER_MAINTENANCE", "BROKEN_DOWN", "RETIRED", "INACTIVE"];
const MACHINE_EDIT_FORM_DEFAULT = { name: "", machineType: "FEED_MIXER", status: "ACTIVE", manufacturer: "", serialNumber: "", capacity: "", location: "" };

export function MachinesPage({ create = false }: { create?: boolean }) {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/machines")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/machines"));
  const [form, setForm] = useState({ branchId: "", farmId: "", warehouseId: "", productionSiteId: "", code: "", name: "", machineType: "FEED_MIXER", manufacturer: "", serialNumber: "", capacity: "", location: "" });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(MACHINE_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/machines");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const branchId = form.branchId || options.branches[0]?.id;
    if (!branchId) { setSubmitError("Wait for branches to load, then select a branch."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/machines", { method: "POST", body: JSON.stringify({ ...form, branchId, farmId: form.farmId || undefined, warehouseId: form.warehouseId || undefined, productionSiteId: form.productionSiteId || undefined }) });
      setForm({ ...form, code: "", name: "", manufacturer: "", serialNumber: "", capacity: "", location: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save machine. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      name: String(row.name ?? ""),
      machineType: String(row.machineType ?? "FEED_MIXER"),
      status: String(row.status ?? "ACTIVE"),
      manufacturer: String(row.manufacturer ?? ""),
      serialNumber: String(row.serialNumber ?? ""),
      capacity: row.capacity != null ? String(row.capacity) : "",
      location: String(row.location ?? ""),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/machines/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          manufacturer: editForm.manufacturer || undefined,
          serialNumber: editForm.serialNumber || undefined,
          capacity: editForm.capacity || undefined,
          location: editForm.location || undefined,
        }),
      });
      invalidateCache("/maintenance/machines", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/machines/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/machines", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete machine.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title={create ? "Create Machine" : "Machine List"} subtitle="Register and scope machines across farms, warehouses, production sites, and delivery operations." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
          <SelectField label="Farm" value={form.farmId} options={options.farms} onChange={(value) => setForm({ ...form, farmId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Production site" value={form.productionSiteId} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <TextField label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
          <TextField label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <FormField label="Type"><select className={inputClass} value={form.machineType} onChange={(event) => setForm({ ...form, machineType: event.target.value })}>{MACHINE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <TextField label="Manufacturer" value={form.manufacturer} onChange={(value) => setForm({ ...form, manufacturer: value })} />
          <TextField label="Serial number" value={form.serialNumber} onChange={(value) => setForm({ ...form, serialNumber: value })} />
          <TextField label="Capacity" value={form.capacity} onChange={(value) => setForm({ ...form, capacity: value })} />
          <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
            <Save aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save machine"}
          </button>
          {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/maintenance/machines/create"><Plus aria-hidden className="h-4 w-4" /> Create machine</Link>}
      <DataTable
        rows={rows}
        loading={loading}
        empty="No machines found"
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name", render: (row) => <Link href={`/maintenance/machines/${row.id}`} className="font-medium text-brand hover:underline">{String(row.name ?? "-")}</Link> },
          { key: "machineType", label: "Type" },
          { key: "manufacturer", label: "Manufacturer", render: (row) => String(row.manufacturer ?? "—") },
          { key: "serialNumber", label: "Serial", render: (row) => String(row.serialNumber ?? "—") },
          { key: "location", label: "Location", render: (row) => String(row.location ?? "—") },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title={`Edit ${editRow?.name ?? "Machine"}`} size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <TextField label="Name" value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} required />
          <FormField label="Type"><select className={inputClass} value={editForm.machineType} onChange={(event) => setEditForm({ ...editForm, machineType: event.target.value })}>{MACHINE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <FormField label="Status"><select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
          <TextField label="Manufacturer" value={editForm.manufacturer} onChange={(value) => setEditForm({ ...editForm, manufacturer: value })} />
          <TextField label="Serial number" value={editForm.serialNumber} onChange={(value) => setEditForm({ ...editForm, serialNumber: value })} />
          <TextField label="Capacity" value={editForm.capacity} onChange={(value) => setEditForm({ ...editForm, capacity: value })} />
          <TextField label="Location" value={editForm.location} onChange={(value) => setEditForm({ ...editForm, location: value })} />
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete machine?"
        message={`This will permanently remove "${deleteRow?.name}" (${deleteRow?.code}). This can't be undone.`}
        confirmLabel="Delete machine"
      />
    </>
  );
}

function machineDate(value: unknown) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function MachineDetailsPage({ id }: { id: string }) {
  const [machine, setMachine] = useState<Record<string, unknown> | null>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>>>(`/maintenance/machines/${id}`)?.data ?? null);
  const [loadError, setLoadError] = useState("");
  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/maintenance/machines/${id}`)
      .then((response) => setMachine(response.data))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load machine."));
  }
  useEffect(() => { load(); }, [id]);
  useApiRecovery(!machine, load);

  const branch = machine?.branch as { name?: string } | undefined;
  const farm = machine?.farm as { name?: string } | undefined;
  const warehouse = machine?.warehouse as { name?: string } | undefined;
  const productionSite = machine?.productionSite as { name?: string } | undefined;

  return (
    <>
      <PageHeader title={String(machine?.name ?? "Machine Details")} subtitle="Maintenance schedules, repairs, breakdowns, downtime, equipment, and cost history." />
      {loadError && <div className="app-alert-warning mb-4">{loadError}</div>}

      <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Machine Details</h2>
          {machine && <StatusBadge status={String(machine.status ?? "")} />}
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Code</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.code ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Type</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.machineType ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Manufacturer</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.manufacturer ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Model</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.modelNumber ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Serial Number</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.serialNumber ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Capacity</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.capacity ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Location</dt><dd className="mt-0.5 text-sm text-ink">{String(machine?.location ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Purchase Date</dt><dd className="mt-0.5 text-sm text-ink">{machineDate(machine?.purchaseDate)}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Installation Date</dt><dd className="mt-0.5 text-sm text-ink">{machineDate(machine?.installationDate)}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Branch</dt><dd className="mt-0.5 text-sm text-ink">{branch?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Farm</dt><dd className="mt-0.5 text-sm text-ink">{farm?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</dt><dd className="mt-0.5 text-sm text-ink">{warehouse?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Production Site</dt><dd className="mt-0.5 text-sm text-ink">{productionSite?.name ?? "—"}</dd></div>
          {!!machine?.notes && (
            <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Notes</dt><dd className="mt-0.5 text-sm text-ink">{String(machine.notes)}</dd></div>
          )}
        </dl>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Attached Equipment</h3>
          <SimpleRowsTable rows={(machine?.equipment as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Maintenance Schedules</h3>
          <SimpleRowsTable rows={(machine?.schedules as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Breakdown Records</h3>
          <SimpleRowsTable rows={(machine?.breakdownRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Maintenance Records</h3>
          <SimpleRowsTable rows={(machine?.maintenanceRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Downtime Records</h3>
          <SimpleRowsTable rows={(machine?.downtimeRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Costs</h3>
          <SimpleRowsTable rows={(machine?.costs as Record<string, unknown>[]) ?? []} />
        </div>
      </section>
    </>
  );
}

const EQUIPMENT_TYPES = ["FARM_EQUIPMENT", "PROCESSING_EQUIPMENT", "WAREHOUSE_EQUIPMENT", "VEHICLE_ACCESSORY", "TOOL", "SAFETY_EQUIPMENT", "OTHER"];
const EQUIPMENT_EDIT_FORM_DEFAULT = { name: "", equipmentType: "FARM_EQUIPMENT", status: "ACTIVE", serialNumber: "", location: "" };

export function EquipmentPage({ create = false }: { create?: boolean }) {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/equipment")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/equipment"));
  const [form, setForm] = useState({ branchId: "", farmId: "", warehouseId: "", productionSiteId: "", machineId: "", code: "", name: "", equipmentType: "FARM_EQUIPMENT", serialNumber: "", location: "" });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(EQUIPMENT_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/equipment");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const branchId = form.branchId || options.branches[0]?.id;
    if (!branchId) { setSubmitError("Wait for branches to load, then select a branch."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/equipment", { method: "POST", body: JSON.stringify({ ...form, branchId, farmId: form.farmId || undefined, warehouseId: form.warehouseId || undefined, productionSiteId: form.productionSiteId || undefined, machineId: form.machineId || undefined }) });
      setForm({ ...form, code: "", name: "", serialNumber: "", location: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save equipment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      name: String(row.name ?? ""),
      equipmentType: String(row.equipmentType ?? "FARM_EQUIPMENT"),
      status: String(row.status ?? "ACTIVE"),
      serialNumber: String(row.serialNumber ?? ""),
      location: String(row.location ?? ""),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/equipment/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, serialNumber: editForm.serialNumber || undefined, location: editForm.location || undefined }),
      });
      invalidateCache("/maintenance/equipment", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/equipment/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/equipment", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete equipment.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title={create ? "Register Equipment" : "Equipment List"} subtitle="Register and track equipment — tools, safety gear, and processing/warehouse accessories — across farms, warehouses, and production sites." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
          <SelectField label="Farm" value={form.farmId} options={options.farms} onChange={(value) => setForm({ ...form, farmId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Production site" value={form.productionSiteId} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <SelectField label="Parent machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
          <TextField label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
          <TextField label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <FormField label="Type"><select className={inputClass} value={form.equipmentType} onChange={(event) => setForm({ ...form, equipmentType: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <TextField label="Serial number" value={form.serialNumber} onChange={(value) => setForm({ ...form, serialNumber: value })} />
          <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
            <Save aria-hidden className="h-4 w-4" /> {submitting ? "Saving…" : "Save equipment"}
          </button>
          {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/maintenance/equipment/create"><Plus aria-hidden className="h-4 w-4" /> Register equipment</Link>}
      <DataTable
        rows={rows}
        loading={loading}
        empty="No equipment found"
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name", render: (row) => <Link href={`/maintenance/equipment/${row.id}`} className="font-medium text-brand hover:underline">{String(row.name ?? "-")}</Link> },
          { key: "equipmentType", label: "Type" },
          { key: "serialNumber", label: "Serial", render: (row) => String(row.serialNumber ?? "—") },
          { key: "location", label: "Location", render: (row) => String(row.location ?? "—") },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title={`Edit ${editRow?.name ?? "Equipment"}`} size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <TextField label="Name" value={editForm.name} onChange={(value) => setEditForm({ ...editForm, name: value })} required />
          <FormField label="Type"><select className={inputClass} value={editForm.equipmentType} onChange={(event) => setEditForm({ ...editForm, equipmentType: event.target.value })}>{EQUIPMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <FormField label="Status"><select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
          <TextField label="Serial number" value={editForm.serialNumber} onChange={(value) => setEditForm({ ...editForm, serialNumber: value })} />
          <TextField label="Location" value={editForm.location} onChange={(value) => setEditForm({ ...editForm, location: value })} />
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete equipment?"
        message={`This will permanently remove "${deleteRow?.name}" (${deleteRow?.code}). This can't be undone.`}
        confirmLabel="Delete equipment"
      />
    </>
  );
}

function equipmentDate(value: unknown) {
  if (!value) return "—";
  return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function EquipmentDetailsPage({ id }: { id: string }) {
  const [equipment, setEquipment] = useState<Record<string, unknown> | null>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>>>(`/maintenance/equipment/${id}`)?.data ?? null);
  const [loadError, setLoadError] = useState("");
  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/maintenance/equipment/${id}`)
      .then((response) => setEquipment(response.data))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load equipment."));
  }
  useEffect(() => { load(); }, [id]);
  useApiRecovery(!equipment, load);

  const branch = equipment?.branch as { name?: string } | undefined;
  const farm = equipment?.farm as { name?: string } | undefined;
  const warehouse = equipment?.warehouse as { name?: string } | undefined;
  const productionSite = equipment?.productionSite as { name?: string } | undefined;
  const machine = equipment?.machine as { id?: string; name?: string } | undefined;

  return (
    <>
      <PageHeader title={String(equipment?.name ?? "Equipment Details")} subtitle="Maintenance schedules, repairs, breakdowns, downtime, and cost history." />
      {loadError && <div className="app-alert-warning mb-4">{loadError}</div>}

      <div className="mb-6 rounded-md border border-line bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Equipment Details</h2>
          {equipment && <StatusBadge status={String(equipment.status ?? "")} />}
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Code</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.code ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Type</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.equipmentType ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Manufacturer</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.manufacturer ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Model</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.modelNumber ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Serial Number</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.serialNumber ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Location</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment?.location ?? "—")}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Purchase Date</dt><dd className="mt-0.5 text-sm text-ink">{equipmentDate(equipment?.purchaseDate)}</dd></div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Parent Machine</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {machine?.id ? <Link href={`/maintenance/machines/${machine.id}`} className="text-brand hover:underline">{machine.name}</Link> : "—"}
            </dd>
          </div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Branch</dt><dd className="mt-0.5 text-sm text-ink">{branch?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Farm</dt><dd className="mt-0.5 text-sm text-ink">{farm?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</dt><dd className="mt-0.5 text-sm text-ink">{warehouse?.name ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Production Site</dt><dd className="mt-0.5 text-sm text-ink">{productionSite?.name ?? "—"}</dd></div>
          {!!equipment?.notes && (
            <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Notes</dt><dd className="mt-0.5 text-sm text-ink">{String(equipment.notes)}</dd></div>
          )}
        </dl>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Maintenance Schedules</h3>
          <SimpleRowsTable rows={(equipment?.schedules as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Breakdown Records</h3>
          <SimpleRowsTable rows={(equipment?.breakdownRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Maintenance Records</h3>
          <SimpleRowsTable rows={(equipment?.maintenanceRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Downtime Records</h3>
          <SimpleRowsTable rows={(equipment?.downtimeRecords as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/45">Costs</h3>
          <SimpleRowsTable rows={(equipment?.costs as Record<string, unknown>[]) ?? []} />
        </div>
      </section>
    </>
  );
}

const ASSIGNMENT_STATUSES = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const ASSIGNMENT_EDIT_FORM_DEFAULT = { technicianId: "", dueDate: "", status: "ASSIGNED", notes: "" };

export function AssignmentsPage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/assignments")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/assignments"));
  const [form, setForm] = useState({ technicianId: "", machineId: "", equipmentId: "", dueDate: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(ASSIGNMENT_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/assignments");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/assignments", {
        method: "POST",
        body: JSON.stringify({ ...form, technicianId: form.technicianId || options.technicians[0]?.id, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, dueDate: form.dueDate || undefined })
      });
      setForm({ ...form, dueDate: "", notes: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to assign technician. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    const technician = row.technician as Record<string, unknown> | undefined;
    setEditForm({
      technicianId: String(technician?.id ?? ""),
      dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : "",
      status: String(row.status ?? "ASSIGNED"),
      notes: String(row.notes ?? ""),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/assignments/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, technicianId: editForm.technicianId || undefined, dueDate: editForm.dueDate || undefined, notes: editForm.notes || undefined }),
      });
      invalidateCache("/maintenance/assignments", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/assignments/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/assignments", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete assignment.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Technician Assignments" subtitle="Assign a technician to a machine or equipment for scheduled or breakdown work." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Technician" value={form.technicianId || options.technicians[0]?.id || ""} options={options.technicians} onChange={(value) => setForm({ ...form, technicianId: value })} />
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <TextField label="Due date" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
        <TextField label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Assigning…" : "Assign technician"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No technician assignments found"
        columns={[
          { key: "technician", label: "Technician", render: (row) => String((row.technician as Record<string, unknown>)?.fullName ?? "—") },
          { key: "asset", label: "Asset", render: assetName },
          { key: "dueDate", label: "Due", render: (row) => machineDate(row.dueDate) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          { key: "notes", label: "Notes", render: (row) => String(row.notes ?? "—") },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Assignment" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <SelectField label="Technician" value={editForm.technicianId} options={options.technicians} onChange={(value) => setEditForm({ ...editForm, technicianId: value })} />
          <FormField label="Status"><select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{ASSIGNMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
          <TextField label="Due date" type="date" value={editForm.dueDate} onChange={(value) => setEditForm({ ...editForm, dueDate: value })} />
          <div className="sm:col-span-2"><TextField label="Notes" value={editForm.notes} onChange={(value) => setEditForm({ ...editForm, notes: value })} /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete assignment?"
        message="This will permanently remove this technician assignment. This can't be undone."
        confirmLabel="Delete assignment"
      />
    </>
  );
}

const DOWNTIME_STATUSES = ["OPEN", "CLOSED", "VERIFIED"];
const DOWNTIME_EDIT_FORM_DEFAULT = { endAt: "", reason: "", status: "OPEN" };

export function DowntimePage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/downtime")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/downtime"));
  const [form, setForm] = useState({ machineId: "", equipmentId: "", startAt: "", endAt: "", reason: "", status: "OPEN" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(DOWNTIME_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/downtime");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!form.machineId && !form.equipmentId) { setSubmitError("Select a machine or equipment for this downtime record."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/downtime", {
        method: "POST",
        body: JSON.stringify({ ...form, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, endAt: form.endAt || undefined })
      });
      setForm({ ...form, startAt: "", endAt: "", reason: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to log downtime. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      endAt: row.endAt ? String(row.endAt).slice(0, 16) : "",
      reason: String(row.reason ?? ""),
      status: String(row.status ?? "OPEN"),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/downtime/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, endAt: editForm.endAt || undefined }),
      });
      invalidateCache("/maintenance/downtime", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/downtime/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/downtime", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete downtime record.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Downtime Log" subtitle="Machine and equipment downtime by asset, reason, duration, and status." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <TextField label="Started at" type="datetime-local" value={form.startAt} onChange={(value) => setForm({ ...form, startAt: value })} required />
        <TextField label="Ended at" type="datetime-local" value={form.endAt} onChange={(value) => setForm({ ...form, endAt: value })} />
        <TextField label="Reason" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required />
        <FormField label="Status"><select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{DOWNTIME_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Logging…" : "Log downtime"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No downtime records found"
        columns={[
          { key: "asset", label: "Asset", render: assetName },
          { key: "startAt", label: "Started", render: (row) => machineDate(row.startAt) },
          { key: "endAt", label: "Ended", render: (row) => row.endAt ? machineDate(row.endAt) : "—" },
          { key: "durationHours", label: "Hours", render: (row) => row.durationHours != null ? String(row.durationHours) : "—" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Downtime" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <TextField label="Ended at" type="datetime-local" value={editForm.endAt} onChange={(value) => setEditForm({ ...editForm, endAt: value })} />
          <FormField label="Status"><select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{DOWNTIME_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
          <div className="sm:col-span-2"><TextField label="Reason" value={editForm.reason} onChange={(value) => setEditForm({ ...editForm, reason: value })} required /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete downtime record?"
        message="This will permanently remove this downtime record. This can't be undone."
        confirmLabel="Delete record"
      />
    </>
  );
}

const RECORD_EDIT_FORM_DEFAULT = { maintenanceType: "PREVENTIVE", description: "", findings: "", nextDueDate: "" };

export function RecordsPage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/records")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/records"));
  const [form, setForm] = useState({ machineId: "", equipmentId: "", maintenanceType: "PREVENTIVE", description: "", findings: "", nextDueDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(RECORD_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/records");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!form.machineId && !form.equipmentId) { setSubmitError("Select a machine or equipment for this work order."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/records", {
        method: "POST",
        body: JSON.stringify({ ...form, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, findings: form.findings || undefined, nextDueDate: form.nextDueDate || undefined })
      });
      setForm({ ...form, description: "", findings: "", nextDueDate: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to log work. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      maintenanceType: String(row.maintenanceType ?? "PREVENTIVE"),
      description: String(row.description ?? ""),
      findings: String(row.findings ?? ""),
      nextDueDate: row.nextDueDate ? String(row.nextDueDate).slice(0, 10) : "",
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/records/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, findings: editForm.findings || undefined, nextDueDate: editForm.nextDueDate || undefined }),
      });
      invalidateCache("/maintenance/records", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/records/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/records", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete work order.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Work Orders" subtitle="Log completed preventive, corrective, inspection, calibration, and repair work." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <FormField label="Type"><select className={inputClass} value={form.maintenanceType} onChange={(event) => setForm({ ...form, maintenanceType: event.target.value })}>{MAINTENANCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></FormField>
        <TextField label="Next due date" type="date" value={form.nextDueDate} onChange={(value) => setForm({ ...form, nextDueDate: value })} />
        <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <TextField label="Findings" value={form.findings} onChange={(value) => setForm({ ...form, findings: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Logging…" : "Log work done"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No work orders logged"
        columns={[
          { key: "recordNumber", label: "Record #" },
          { key: "asset", label: "Asset", render: assetName },
          { key: "maintenanceType", label: "Type" },
          { key: "maintenanceDate", label: "Date", render: (row) => machineDate(row.maintenanceDate) },
          { key: "description", label: "Description" },
          { key: "findings", label: "Findings", render: (row) => String(row.findings ?? "—") },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Work Order" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Type"><select className={inputClass} value={editForm.maintenanceType} onChange={(event) => setEditForm({ ...editForm, maintenanceType: event.target.value })}>{MAINTENANCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></FormField>
          <TextField label="Next due date" type="date" value={editForm.nextDueDate} onChange={(value) => setEditForm({ ...editForm, nextDueDate: value })} />
          <div className="sm:col-span-2"><TextField label="Description" value={editForm.description} onChange={(value) => setEditForm({ ...editForm, description: value })} required /></div>
          <div className="sm:col-span-2"><TextField label="Findings" value={editForm.findings} onChange={(value) => setEditForm({ ...editForm, findings: value })} /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete work order?"
        message="This will permanently remove this work order. This can't be undone."
        confirmLabel="Delete work order"
      />
    </>
  );
}

const DOCUMENT_TYPES = ["REGISTRATION", "INSURANCE", "ROADWORTHY", "LICENSE", "OTHER"];

function daysUntil(dateStr: unknown) {
  const ms = new Date(String(dateStr)).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

const DOCUMENT_EDIT_FORM_DEFAULT = { documentType: "REGISTRATION", documentNumber: "", issueDate: "", expiryDate: "", notes: "" };

export function DocumentsPage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/documents")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/documents"));
  const [form, setForm] = useState({ machineId: "", equipmentId: "", documentType: "REGISTRATION", documentNumber: "", issueDate: "", expiryDate: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(DOCUMENT_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/documents");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!form.machineId && !form.equipmentId) { setSubmitError("Select a machine or equipment for this document."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/documents", {
        method: "POST",
        body: JSON.stringify({ ...form, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, documentNumber: form.documentNumber || undefined, issueDate: form.issueDate || undefined, notes: form.notes || undefined })
      });
      setForm({ ...form, documentNumber: "", issueDate: "", expiryDate: "", notes: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save document. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      documentType: String(row.documentType ?? "REGISTRATION"),
      documentNumber: String(row.documentNumber ?? ""),
      issueDate: row.issueDate ? String(row.issueDate).slice(0, 10) : "",
      expiryDate: row.expiryDate ? String(row.expiryDate).slice(0, 10) : "",
      notes: String(row.notes ?? ""),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/documents/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, documentNumber: editForm.documentNumber || undefined, issueDate: editForm.issueDate || undefined, notes: editForm.notes || undefined }),
      });
      invalidateCache("/maintenance/documents", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/documents/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/documents", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Machine & Vehicle Documents" subtitle="Track registration, insurance, roadworthy, and license documents with renewal reminders sent automatically as expiry approaches." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <FormField label="Document type"><select className={inputClass} value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}>{DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
        <TextField label="Document number" value={form.documentNumber} onChange={(value) => setForm({ ...form, documentNumber: value })} />
        <TextField label="Issue date" type="date" value={form.issueDate} onChange={(value) => setForm({ ...form, issueDate: value })} />
        <TextField label="Expiry date" type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} required />
        <TextField label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Saving…" : "Save document"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No documents recorded"
        columns={[
          { key: "asset", label: "Asset", render: (row) => String((row.machine as Record<string, unknown>)?.name ?? (row.equipment as Record<string, unknown>)?.name ?? "—") },
          { key: "documentType", label: "Type" },
          { key: "documentNumber", label: "Number", render: (row) => String(row.documentNumber ?? "—") },
          {
            key: "expiryDate",
            label: "Expires",
            render: (row) => {
              const days = daysUntil(row.expiryDate);
              const cls = days < 0 ? "text-red-600 font-semibold" : days <= 30 ? "text-amber-600 font-semibold" : "text-ink/70";
              const label = new Date(String(row.expiryDate)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
              return <span className={cls}>{label}{days < 0 ? " (expired)" : days <= 30 ? ` (${days}d)` : ""}</span>;
            }
          },
          { key: "notes", label: "Notes", render: (row) => String(row.notes ?? "—") },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Document" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Document type"><select className={inputClass} value={editForm.documentType} onChange={(event) => setEditForm({ ...editForm, documentType: event.target.value })}>{DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <TextField label="Document number" value={editForm.documentNumber} onChange={(value) => setEditForm({ ...editForm, documentNumber: value })} />
          <TextField label="Issue date" type="date" value={editForm.issueDate} onChange={(value) => setEditForm({ ...editForm, issueDate: value })} />
          <TextField label="Expiry date" type="date" value={editForm.expiryDate} onChange={(value) => setEditForm({ ...editForm, expiryDate: value })} required />
          <div className="sm:col-span-2"><TextField label="Notes" value={editForm.notes} onChange={(value) => setEditForm({ ...editForm, notes: value })} /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete document?"
        message={`This will permanently remove this ${String(deleteRow?.documentType ?? "").toLowerCase()} document. This can't be undone.`}
        confirmLabel="Delete document"
      />
    </>
  );
}

const MAINTENANCE_TYPES = ["PREVENTIVE", "CORRECTIVE", "INSPECTION", "CALIBRATION", "REPAIR"];
const MAINTENANCE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SCHEDULE_EDIT_FORM_DEFAULT = { title: "", maintenanceType: "PREVENTIVE", priority: "MEDIUM", frequencyDays: "", nextDueDate: "", instructions: "" };

function assetName(row: Record<string, unknown>) {
  const machine = row.machine as Record<string, unknown> | undefined;
  const equipment = row.equipment as Record<string, unknown> | undefined;
  return String(machine?.name ?? equipment?.name ?? "—");
}

export function SchedulePage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("maintenance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/schedules")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/schedules"));
  const [form, setForm] = useState({ branchId: "", machineId: "", equipmentId: "", title: "", maintenanceType: "PREVENTIVE", priority: "MEDIUM", frequencyDays: "", nextDueDate: "", instructions: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(SCHEDULE_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/schedules");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!form.machineId && !form.equipmentId) { setSubmitError("Select a machine or equipment for this schedule."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/schedules", { method: "POST", body: JSON.stringify({ ...form, branchId: form.branchId || options.branches[0]?.id, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, frequencyDays: Number(form.frequencyDays) }) });
      setForm({ ...form, title: "", frequencyDays: "", nextDueDate: "", instructions: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save schedule. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      title: String(row.title ?? ""),
      maintenanceType: String(row.maintenanceType ?? "PREVENTIVE"),
      priority: String(row.priority ?? "MEDIUM"),
      frequencyDays: row.frequencyDays != null ? String(row.frequencyDays) : "",
      nextDueDate: row.nextDueDate ? String(row.nextDueDate).slice(0, 10) : "",
      instructions: String(row.instructions ?? ""),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/schedules/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, frequencyDays: Number(editForm.frequencyDays), instructions: editForm.instructions || undefined }),
      });
      invalidateCache("/maintenance/schedules", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/schedules/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/schedules", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete schedule.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Maintenance Schedule" subtitle="Preventive maintenance, inspection, calibration, and service due-date planning." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <TextField label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
        <FormField label="Type"><select className={inputClass} value={form.maintenanceType} onChange={(event) => setForm({ ...form, maintenanceType: event.target.value })}>{MAINTENANCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></FormField>
        <FormField label="Priority"><select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{MAINTENANCE_PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></FormField>
        <TextField label="Frequency days" type="number" value={form.frequencyDays} onChange={(value) => setForm({ ...form, frequencyDays: value })} required />
        <TextField label="Next due date" type="date" value={form.nextDueDate} onChange={(value) => setForm({ ...form, nextDueDate: value })} required />
        <TextField label="Instructions" value={form.instructions} onChange={(value) => setForm({ ...form, instructions: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
        {submitting ? "Saving…" : "Save schedule"}
      </button>
      {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No maintenance schedules found"
        columns={[
          { key: "scheduleNumber", label: "Schedule #" },
          { key: "asset", label: "Asset", render: assetName },
          { key: "title", label: "Title" },
          { key: "maintenanceType", label: "Type" },
          { key: "priority", label: "Priority" },
          { key: "nextDueDate", label: "Next Due", render: (row) => machineDate(row.nextDueDate) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Schedule" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <div className="sm:col-span-2"><TextField label="Title" value={editForm.title} onChange={(value) => setEditForm({ ...editForm, title: value })} required /></div>
          <FormField label="Type"><select className={inputClass} value={editForm.maintenanceType} onChange={(event) => setEditForm({ ...editForm, maintenanceType: event.target.value })}>{MAINTENANCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></FormField>
          <FormField label="Priority"><select className={inputClass} value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}>{MAINTENANCE_PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></FormField>
          <TextField label="Frequency days" type="number" value={editForm.frequencyDays} onChange={(value) => setEditForm({ ...editForm, frequencyDays: value })} required />
          <TextField label="Next due date" type="date" value={editForm.nextDueDate} onChange={(value) => setEditForm({ ...editForm, nextDueDate: value })} required />
          <div className="sm:col-span-2"><TextField label="Instructions" value={editForm.instructions} onChange={(value) => setEditForm({ ...editForm, instructions: value })} /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete schedule?"
        message={`This will permanently remove "${deleteRow?.title}". This can't be undone.`}
        confirmLabel="Delete schedule"
      />
    </>
  );
}

const BREAKDOWN_STATUS_FLOW: Record<string, string | null> = {
  REPORTED: "ASSIGNED",
  ASSIGNED: "IN_REPAIR",
  IN_REPAIR: "RESOLVED",
  RESOLVED: "CLOSED",
  CLOSED: null,
  CANCELLED: null,
};

export function BreakdownPage() {
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/breakdowns")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/breakdowns"));
  const [form, setForm] = useState({ machineId: "", equipmentId: "", severity: "MEDIUM", description: "", rootCause: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const [resolveError, setResolveError] = useState("");
  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/breakdowns");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    if (!form.machineId && !form.equipmentId) { setSubmitError("Select a machine or equipment for this breakdown."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/maintenance/breakdowns", { method: "POST", body: JSON.stringify({ ...form, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined }) });
      setForm({ ...form, description: "", rootCause: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to report breakdown. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  async function advance(id: string, nextStatus: string) {
    setResolvingId(id);
    setResolveError("");
    try {
      await apiFetch(`/maintenance/breakdowns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Failed to update breakdown status.");
    } finally {
      setResolvingId("");
    }
  }
  return (
    <>
      <PageHeader title="Breakdown Records" subtitle="Production managers and maintenance teams can report, triage, and resolve machine failures." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <FormField label="Severity"><select className={inputClass} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></FormField>
        <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <TextField label="Root cause" value={form.rootCause} onChange={(value) => setForm({ ...form, rootCause: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Reporting…" : "Report breakdown"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      {resolveError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{resolveError}</p>}
      <DataTable
        rows={rows}
        loading={loading}
        empty="No breakdowns recorded"
        columns={[
          { key: "breakdownNumber", label: "Ref" },
          { key: "severity", label: "Severity", render: (row) => <SeverityBadge severity={String(row.severity ?? "")} /> },
          { key: "description", label: "Description" },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          {
            key: "actions",
            label: "Action",
            sortable: false,
            render: (row) => {
              const id = String(row.id ?? "");
              const status = String(row.status ?? "");
              const next = BREAKDOWN_STATUS_FLOW[status];
              if (!next) return <span className="text-xs text-ink/40">—</span>;
              return (
                <button
                  className="app-button-secondary text-xs"
                  disabled={resolvingId === id}
                  onClick={() => advance(id, next)}
                >
                  {resolvingId === id ? "Updating…" : `Mark ${next.replace(/_/g, " ").toLowerCase()}`}
                </button>
              );
            }
          }
        ]}
      />
    </>
  );
}

export function SparePartsPage() {
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/spare-parts")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/spare-parts"));
  const [form, setForm] = useState({ warehouseId: "", productId: "", machineId: "", quantity: "", unitCost: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");
  async function load() {
    setLoadError("");
    try {
      const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/spare-parts");
      const fresh = response.data ?? [];
      setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/spare-parts", { method: "POST", body: JSON.stringify({ ...form, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || options.spareParts[0]?.id, machineId: form.machineId || undefined, quantity: Number(form.quantity), unitCost: Number(form.unitCost || 0) }) });
      setForm({ ...form, quantity: "", unitCost: "", notes: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to issue spare part. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <PageHeader title="Spare Parts Usage" subtitle="Storekeeper-controlled spare part issue with stock movement and cost capture." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
        <SelectField label="Spare part" value={form.productId || options.spareParts[0]?.id || ""} options={options.spareParts} onChange={(value) => setForm({ ...form, productId: value })} />
        <SelectField label="Machine (optional)" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
        <TextField label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
        <TextField label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
        <TextField label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-3">
          {submitting ? "Issuing…" : "Issue spare part"}
        </button>
        {submitError && <p className="col-span-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <SimpleRowsTable rows={rows} loading={loading} />
    </>
  );
}

const COST_TYPES = ["LABOR", "SPARE_PART", "OUTSOURCED_SERVICE", "UTILITIES", "TRANSPORT", "OTHER"];
const COST_STATUSES = ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"];
const COST_EDIT_FORM_DEFAULT = { costType: "LABOR", amount: "", costDate: "", description: "", status: "COMPLETED" };

export function MaintenanceCostReportPage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("finance.manage");
  const { options, optionsError } = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>(() => getCachedFirst<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/costs")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/maintenance/costs"));
  const [form, setForm] = useState({ machineId: "", equipmentId: "", costType: "LABOR", amount: "", costDate: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editForm, setEditForm] = useState(COST_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    return apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/costs")
      .then((response) => { const fresh = response.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load().catch((err: any) => setLoadError(err?.message ?? "Failed to load.")); }, []);
  useApiRecovery(rows.length === 0, load);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/costs", {
        method: "POST",
        body: JSON.stringify({ ...form, machineId: form.machineId || undefined, equipmentId: form.equipmentId || undefined, amount: Number(form.amount), costDate: form.costDate || undefined })
      });
      setForm({ ...form, amount: "", costDate: "", description: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record cost. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(row: Record<string, unknown>) {
    setEditForm({
      costType: String(row.costType ?? "LABOR"),
      amount: row.amount != null ? String(row.amount) : "",
      costDate: row.costDate ? String(row.costDate).slice(0, 10) : "",
      description: String(row.description ?? ""),
      status: String(row.status ?? "COMPLETED"),
    });
    setEditError("");
    setEditRow(row);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/maintenance/costs/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, amount: Number(editForm.amount), costDate: editForm.costDate || undefined, description: editForm.description || undefined }),
      });
      invalidateCache("/maintenance/costs", true);
      setEditRow(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/maintenance/costs/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/maintenance/costs", true);
      setDeleteRow(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete cost record.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Maintenance Cost Report" subtitle="Repair cost tracking by machine, equipment, spare parts, labor, and outsourced work." />
      {(loadError || optionsError) && <div className="app-alert-warning mb-4">{loadError || optionsError}</div>}
      {deleteError && <div className="app-alert-warning mb-4">{deleteError}</div>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value, equipmentId: value ? "" : form.equipmentId })} />
        <SelectField label="Equipment" value={form.equipmentId} options={options.equipment} onChange={(value) => setForm({ ...form, equipmentId: value, machineId: value ? "" : form.machineId })} />
        <FormField label="Cost type"><select className={inputClass} value={form.costType} onChange={(event) => setForm({ ...form, costType: event.target.value })}>{COST_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
        <TextField label="Amount (GHS)" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} required />
        <TextField label="Cost date" type="date" value={form.costDate} onChange={(value) => setForm({ ...form, costDate: value })} />
        <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Recording…" : "Record cost"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <button className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/maintenance/reports/costs.csv", "maintenance-costs.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download maintenance costs CSV
      </button>
      <DataTable
        rows={rows}
        loading={loading}
        empty="No maintenance costs recorded"
        columns={[
          { key: "asset", label: "Asset", render: assetName },
          { key: "costType", label: "Type" },
          { key: "amount", label: "Amount (GHS)", render: (row) => row.amount != null ? String(row.amount) : "—" },
          { key: "costDate", label: "Date", render: (row) => machineDate(row.costDate) },
          { key: "description", label: "Description", render: (row) => String(row.description ?? "—") },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={String(row.status ?? "")} /> },
          ...(canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setDeleteRow(row); }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ),
          }] : []),
        ]}
      />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title="Edit Cost Record" size="md">
        <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
          {editError && <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <FormField label="Cost type"><select className={inputClass} value={editForm.costType} onChange={(event) => setEditForm({ ...editForm, costType: event.target.value })}>{COST_TYPES.map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <FormField label="Status"><select className={inputClass} value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>{COST_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></FormField>
          <TextField label="Amount (GHS)" type="number" value={editForm.amount} onChange={(value) => setEditForm({ ...editForm, amount: value })} required />
          <TextField label="Cost date" type="date" value={editForm.costDate} onChange={(value) => setEditForm({ ...editForm, costDate: value })} />
          <div className="sm:col-span-2"><TextField label="Description" value={editForm.description} onChange={(value) => setEditForm({ ...editForm, description: value })} /></div>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button disabled={savingEdit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete cost record?"
        message="This will permanently remove this maintenance cost record. This can't be undone."
        confirmLabel="Delete cost record"
      />
    </>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return (
    <FormField label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ?? option.sku ?? ""} {option.name ?? option.fullName ?? option.email ?? ""}</option>)}
      </select>
    </FormField>
  );
}

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <FormField label={label}>
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </FormField>
  );
}

function SimpleRowsTable({ rows, loading }: { rows: Record<string, unknown>[]; loading?: boolean }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" loading={loading} columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }))} />;
}
