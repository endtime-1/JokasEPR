"use client";

import { ComponentType, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Calendar, ChevronRight, Clock, Cpu, DollarSign, Download, Plus, RefreshCw, Save, User, Wrench } from "lucide-react";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

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

type DashboardData = {
  machineCount: number;
  activeMachines: number;
  maintenanceAlerts: number;
  openBreakdowns: number;
  downtimeHours: number;
  maintenanceCost: number;
  schedules: Schedule[];
  breakdowns: Breakdown[];
  assignments: Assignment[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3";

function useOptions() {
  const [options, setOptions] = useState<MaintenanceOptions>({ branches: [], farms: [], warehouses: [], productionSites: [], machines: [], equipment: [], spareParts: [], technicians: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<MaintenanceOptions>>("/maintenance/options")
      .then((response) => setOptions(response.data))
      .catch(() => undefined);
  }, []);
  return options;
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
          <Link className="app-button-secondary text-xs" href="/maintenance/schedules">Schedules</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/breakdowns">Breakdowns</Link>
          <Link className="app-button-secondary text-xs" href="/maintenance/costs">Costs</Link>
        </div>
      </div>
    </div>
  );
}

function fmt(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
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

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    OPEN:        "bg-red-100 text-red-700",
    REPORTED:    "bg-red-100 text-red-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    ASSIGNED:    "bg-blue-100 text-blue-700",
    RESOLVED:    "bg-emerald-100 text-emerald-700",
    CLOSED:      "bg-emerald-100 text-emerald-700",
    COMPLETED:   "bg-emerald-100 text-emerald-700",
    CANCELLED:   "bg-gray-100 text-gray-600",
    SCHEDULED:   "bg-blue-100 text-blue-700",
  };
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${c[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g, " ")}</span>;
}

export function MaintenanceDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
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

  const today = new Date();
  const overdueCount = (data?.schedules ?? []).filter((s) => new Date(s.nextDueDate) < today && s.status !== "COMPLETED").length;
  const hasAlerts = (data?.maintenanceAlerts ?? 0) > 0 || (data?.openBreakdowns ?? 0) > 0;
  const utilPct = data && data.machineCount > 0 ? `${Math.round((data.activeMachines / data.machineCount) * 100)}% utilisation` : undefined;

  return (
    <AppShell>
      {/* Hero header */}
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
              Machine status, preventive maintenance schedules, breakdown records, spare parts usage, downtime, and repair cost visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <button onClick={load} disabled={loading} className="app-button-secondary text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link className="app-button-secondary text-xs" href="/maintenance/machines">Machines</Link>
            <Link className="app-button-secondary text-xs" href="/maintenance/schedules">Schedules</Link>
            <Link className="app-button-secondary text-xs" href="/maintenance/breakdowns">Breakdowns</Link>
            <Link className="app-button-secondary text-xs" href="/maintenance/costs">Costs</Link>
          </div>
        </div>
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {/* Alert banner */}
      {hasAlerts && data && (
        <div className="mb-6 rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">Maintenance attention needed</p>
              <p className="mt-0.5 text-sm text-ink/60">
                {data.maintenanceAlerts > 0 && `${data.maintenanceAlerts} overdue maintenance ${data.maintenanceAlerts === 1 ? "schedule" : "schedules"}`}
                {data.maintenanceAlerts > 0 && data.openBreakdowns > 0 && " · "}
                {data.openBreakdowns > 0 && `${data.openBreakdowns} open ${data.openBreakdowns === 1 ? "breakdown" : "breakdowns"}`}
                {overdueCount > 0 && ` · ${overdueCount} past due date`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total machines"       value={fmt(data?.machineCount)}      Icon={Cpu}           color="blue"    />
        <KpiCard label="Active machines"      value={fmt(data?.activeMachines)}    Icon={Activity}      color="emerald" sub={utilPct} />
        <KpiCard label="Maintenance alerts"   value={fmt(data?.maintenanceAlerts)} Icon={AlertTriangle} color="amber"   />
        <KpiCard label="Open breakdowns"      value={fmt(data?.openBreakdowns)}    Icon={Wrench}        color="red"     />
        <KpiCard label="Total downtime"       value={`${fmt(data?.downtimeHours)} hrs`} Icon={Clock}   color="purple"  />
        <KpiCard label="Maintenance cost"     value={`GHS ${fmt(data?.maintenanceCost)}`} Icon={DollarSign} color="brand" />
      </section>

      {/* Schedules + Breakdowns */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Upcoming schedules */}
        <section className="rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand" />
              <h3 className="font-semibold text-ink">Upcoming Schedules</h3>
            </div>
            <Link href="/maintenance/schedules" className="flex items-center gap-0.5 text-xs font-medium text-brand hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {(data?.schedules ?? []).slice(0, 6).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink/45">No upcoming schedules</p>
            ) : (data?.schedules ?? []).slice(0, 6).map((s) => {
              const due = new Date(s.nextDueDate);
              const overdue = due < today && s.status !== "COMPLETED";
              const soon = !overdue && due <= new Date(today.getTime() + 7 * 86_400_000);
              return (
                <div key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-red-100 text-red-600" : soon ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">{s.title}</span>
                      <PriorityBadge priority={s.priority} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {s.machine?.name ?? s.equipment?.name ?? "No asset"} · {s.maintenanceType.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-semibold ${overdue ? "text-red-600" : soon ? "text-amber-600" : "text-ink/60"}`}>
                      {due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                    {overdue && <p className="text-[10px] text-red-500">Overdue</p>}
                    {soon && !overdue && <p className="text-[10px] text-amber-500">Due soon</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent breakdowns */}
        <section className="rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-red-500" />
              <h3 className="font-semibold text-ink">Recent Breakdowns</h3>
            </div>
            <Link href="/maintenance/breakdowns" className="flex items-center gap-0.5 text-xs font-medium text-brand hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {(data?.breakdowns ?? []).slice(0, 6).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink/45">No breakdowns recorded</p>
            ) : (data?.breakdowns ?? []).slice(0, 6).map((b) => (
              <div key={b.id} className="flex items-start gap-3 px-5 py-3.5">
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
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink/55">{b.description}</p>
                </div>
                <p className="shrink-0 text-[11px] text-ink/40">
                  {new Date(b.reportedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Technician Assignments */}
      {(data?.assignments ?? []).length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <User className="h-4 w-4 text-brand" />
            <h3 className="font-semibold text-ink">Technician Assignments</h3>
          </div>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {(data?.assignments ?? []).slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                  {a.technician.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{a.technician.fullName}</p>
                  <p className="text-xs text-ink/55">{a.machine?.name ?? a.equipment?.name ?? "General task"}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

export function MachinesPage({ create = false }: { create?: boolean }) {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ branchId: "", farmId: "", warehouseId: "", productionSiteId: "", code: "", name: "", machineType: "FEED_MIXER", manufacturer: "", serialNumber: "", capacity: "", location: "" });
  const [submitError, setSubmitError] = useState("");
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/machines");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const branchId = form.branchId || options.branches[0]?.id;
    if (!branchId) { setSubmitError("Wait for branches to load, then select a branch."); return; }
    try {
      await apiFetch("/maintenance/machines", { method: "POST", body: JSON.stringify({ ...form, branchId, farmId: form.farmId || undefined, warehouseId: form.warehouseId || undefined, productionSiteId: form.productionSiteId || undefined }) });
      setForm({ ...form, code: "", name: "", manufacturer: "", serialNumber: "", capacity: "", location: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save machine. Please try again.");
    }
  }
  return (
    <AppShell>
      <PageHeader title={create ? "Create Machine" : "Machine List"} subtitle="Register and scope machines across farms, warehouses, production sites, and delivery operations." />
      {create ? (
        <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
          <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
          <SelectField label="Farm" value={form.farmId} options={options.farms} onChange={(value) => setForm({ ...form, farmId: value })} />
          <SelectField label="Warehouse" value={form.warehouseId} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
          <SelectField label="Production site" value={form.productionSiteId} options={options.productionSites} onChange={(value) => setForm({ ...form, productionSiteId: value })} />
          <TextField label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} required />
          <TextField label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <FormField label="Type"><select className={inputClass} value={form.machineType} onChange={(event) => setForm({ ...form, machineType: event.target.value })}>{["FEED_MIXER", "GRINDER", "PELLETIZER", "SOYA_EXPELLER", "OIL_FILTER", "GENERATOR", "WEIGHING_SCALE", "PACKAGING_MACHINE", "DELIVERY_VEHICLE", "POULTRY_EQUIPMENT", "OTHER"].map((type) => <option key={type}>{type}</option>)}</select></FormField>
          <TextField label="Manufacturer" value={form.manufacturer} onChange={(value) => setForm({ ...form, manufacturer: value })} />
          <TextField label="Serial number" value={form.serialNumber} onChange={(value) => setForm({ ...form, serialNumber: value })} />
          <TextField label="Capacity" value={form.capacity} onChange={(value) => setForm({ ...form, capacity: value })} />
          <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">
            <Save aria-hidden className="h-4 w-4" /> Save machine
          </button>
          {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        </form>
      ) : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/maintenance/machines/create"><Plus aria-hidden className="h-4 w-4" /> Create machine</Link>}
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function MachineDetailsPage({ id }: { id: string }) {
  const [machine, setMachine] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>(`/maintenance/machines/${id}`)
      .then((response) => setMachine(response.data))
      .catch(() => undefined);
  }, [id]);
  return (
    <AppShell>
      <PageHeader title={String(machine?.name ?? "Machine Details")} subtitle="Maintenance schedules, repairs, breakdowns, downtime, equipment, and cost history." />
      <section className="grid gap-6 xl:grid-cols-2">
        <SimpleRowsTable rows={(machine?.schedules as Record<string, unknown>[]) ?? []} />
        <SimpleRowsTable rows={(machine?.breakdownRecords as Record<string, unknown>[]) ?? []} />
        <SimpleRowsTable rows={(machine?.maintenanceRecords as Record<string, unknown>[]) ?? []} />
        <SimpleRowsTable rows={(machine?.costs as Record<string, unknown>[]) ?? []} />
      </section>
    </AppShell>
  );
}

export function SchedulePage() {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ branchId: "", machineId: "", title: "", maintenanceType: "PREVENTIVE", priority: "MEDIUM", frequencyDays: "", nextDueDate: "", instructions: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/schedules");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/schedules", { method: "POST", body: JSON.stringify({ ...form, branchId: form.branchId || options.branches[0]?.id, machineId: form.machineId || options.machines[0]?.id, frequencyDays: Number(form.frequencyDays) }) });
      setForm({ ...form, title: "", frequencyDays: "", nextDueDate: "", instructions: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save schedule. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AppShell>
      <PageHeader title="Maintenance Schedule" subtitle="Preventive maintenance, inspection, calibration, and service due-date planning." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Branch" value={form.branchId || options.branches[0]?.id || ""} options={options.branches} onChange={(value) => setForm({ ...form, branchId: value })} />
        <SelectField label="Machine" value={form.machineId || options.machines[0]?.id || ""} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
        <TextField label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
        <FormField label="Type"><select className={inputClass} value={form.maintenanceType} onChange={(event) => setForm({ ...form, maintenanceType: event.target.value })}><option>PREVENTIVE</option><option>CORRECTIVE</option><option>INSPECTION</option><option>CALIBRATION</option><option>REPAIR</option></select></FormField>
        <FormField label="Priority"><select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></FormField>
        <TextField label="Frequency days" type="number" value={form.frequencyDays} onChange={(value) => setForm({ ...form, frequencyDays: value })} required />
        <TextField label="Next due date" type="date" value={form.nextDueDate} onChange={(value) => setForm({ ...form, nextDueDate: value })} required />
        <TextField label="Instructions" value={form.instructions} onChange={(value) => setForm({ ...form, instructions: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
        {submitting ? "Saving…" : "Save schedule"}
      </button>
      {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function BreakdownPage() {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ machineId: "", severity: "MEDIUM", description: "", rootCause: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/breakdowns");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/breakdowns", { method: "POST", body: JSON.stringify({ ...form, machineId: form.machineId || options.machines[0]?.id }) });
      setForm({ ...form, description: "", rootCause: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to report breakdown. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AppShell>
      <PageHeader title="Breakdown Records" subtitle="Production managers and maintenance teams can report, triage, and resolve machine failures." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId || options.machines[0]?.id || ""} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
        <FormField label="Severity"><select className={inputClass} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></FormField>
        <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <TextField label="Root cause" value={form.rootCause} onChange={(value) => setForm({ ...form, rootCause: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-4">
          {submitting ? "Reporting…" : "Report breakdown"}
        </button>
        {submitError && <p className="col-span-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function SparePartsPage() {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ warehouseId: "", productId: "", machineId: "", quantity: "", unitCost: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/spare-parts");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiFetch("/maintenance/spare-parts", { method: "POST", body: JSON.stringify({ ...form, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || options.spareParts[0]?.id, machineId: form.machineId || options.machines[0]?.id, quantity: Number(form.quantity), unitCost: Number(form.unitCost || 0) }) });
      setForm({ ...form, quantity: "", unitCost: "", notes: "" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to issue spare part. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AppShell>
      <PageHeader title="Spare Parts Usage" subtitle="Storekeeper-controlled spare part issue with stock movement and cost capture." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <SelectField label="Warehouse" value={form.warehouseId || options.warehouses[0]?.id || ""} options={options.warehouses} onChange={(value) => setForm({ ...form, warehouseId: value })} />
        <SelectField label="Spare part" value={form.productId || options.spareParts[0]?.id || ""} options={options.spareParts} onChange={(value) => setForm({ ...form, productId: value })} />
        <SelectField label="Machine" value={form.machineId || options.machines[0]?.id || ""} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
        <TextField label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
        <TextField label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
        <TextField label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        <button disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-3">
          {submitting ? "Issuing…" : "Issue spare part"}
        </button>
        {submitError && <p className="col-span-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function MaintenanceListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(endpoint)
      .then((response) => setRows(response.data))
      .catch(() => undefined);
  }, [endpoint]);
  return (
    <AppShell>
      <PageHeader title={title} subtitle={subtitle} />
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function MaintenanceCostReportPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/costs")
      .then((response) => setRows(response.data))
      .catch(() => undefined);
  }, []);
  return (
    <AppShell>
      <PageHeader title="Maintenance Cost Report" subtitle="Repair cost tracking by machine, equipment, spare parts, labor, and outsourced work." />
      <button className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/maintenance/reports/costs.csv", "maintenance-costs.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download maintenance costs CSV
      </button>
      <SimpleRowsTable rows={rows} />
    </AppShell>
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

function SimpleRowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => !["id", "companyId", "branchId", "deletedAt", "updatedAt"].includes(key)).slice(0, 8);
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, unknown>) => typeof row[key] === "object" && row[key] !== null ? JSON.stringify(row[key]).slice(0, 80) : String(row[key] ?? "-").slice(0, 90) }))} />;
}
