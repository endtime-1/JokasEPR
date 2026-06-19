"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, Save } from "lucide-react";
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
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-ink/65">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/maintenance/machines">Machines</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/maintenance/schedules">Schedules</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/maintenance/breakdowns">Breakdowns</Link>
        <Link className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-field" href="/maintenance/costs">Costs</Link>
      </div>
    </div>
  );
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function money(value: unknown) {
  return `GHS ${number(value)}`;
}

export function MaintenanceDashboardPage() {
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>>>("/maintenance/dashboard")
      .then((response) => setDashboard(response.data))
      .catch(() => undefined);
  }, []);
  const cards: Array<[string, unknown, "money" | "number"]> = [
    ["Machines", dashboard?.machineCount, "number"],
    ["Active machines", dashboard?.activeMachines, "number"],
    ["Maintenance alerts", dashboard?.maintenanceAlerts, "number"],
    ["Open breakdowns", dashboard?.openBreakdowns, "number"],
    ["Downtime hours", dashboard?.downtimeHours, "number"],
    ["Maintenance cost", dashboard?.maintenanceCost, "money"]
  ];
  return (
    <AppShell>
      <PageHeader title="Maintenance Dashboard" subtitle="Machine status, preventive maintenance, breakdowns, spare parts, downtime, and repair cost visibility." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, type]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm text-ink/65">{label}</p>
            <strong className="mt-3 block text-2xl font-semibold">{type === "money" ? money(value) : number(value)}</strong>
          </article>
        ))}
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-lg font-semibold">Upcoming schedules</h3>
          <SimpleRowsTable rows={(dashboard?.schedules as Record<string, unknown>[]) ?? []} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">Recent breakdowns</h3>
          <SimpleRowsTable rows={(dashboard?.breakdowns as Record<string, unknown>[]) ?? []} />
        </div>
      </section>
    </AppShell>
  );
}

export function MachinesPage({ create = false }: { create?: boolean }) {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ branchId: "", farmId: "", warehouseId: "", productionSiteId: "", code: "", name: "", machineType: "FEED_MIXER", manufacturer: "", serialNumber: "", capacity: "", location: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/machines");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/maintenance/machines", { method: "POST", body: JSON.stringify({ ...form, branchId: form.branchId || options.branches[0]?.id, farmId: form.farmId || undefined, warehouseId: form.warehouseId || undefined, productionSiteId: form.productionSiteId || undefined }) });
    setForm({ ...form, code: "", name: "", manufacturer: "", serialNumber: "", capacity: "", location: "" });
    await load();
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
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4"><Save aria-hidden className="h-4 w-4" /> Save machine</button>
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
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/schedules");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/maintenance/schedules", { method: "POST", body: JSON.stringify({ ...form, branchId: form.branchId || options.branches[0]?.id, machineId: form.machineId || options.machines[0]?.id, frequencyDays: Number(form.frequencyDays) }) });
    setForm({ ...form, title: "", frequencyDays: "", nextDueDate: "", instructions: "" });
    await load();
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
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Save schedule</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function BreakdownPage() {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ machineId: "", severity: "MEDIUM", description: "", rootCause: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/breakdowns");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/maintenance/breakdowns", { method: "POST", body: JSON.stringify({ ...form, machineId: form.machineId || options.machines[0]?.id }) });
    setForm({ ...form, description: "", rootCause: "" });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title="Breakdown Records" subtitle="Production managers and maintenance teams can report, triage, and resolve machine failures." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
        <SelectField label="Machine" value={form.machineId || options.machines[0]?.id || ""} options={options.machines} onChange={(value) => setForm({ ...form, machineId: value })} />
        <FormField label="Severity"><select className={inputClass} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></FormField>
        <TextField label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
        <TextField label="Root cause" value={form.rootCause} onChange={(value) => setForm({ ...form, rootCause: value })} />
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Report breakdown</button>
      </form>
      <SimpleRowsTable rows={rows} />
    </AppShell>
  );
}

export function SparePartsPage() {
  const options = useOptions();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({ warehouseId: "", productId: "", machineId: "", quantity: "", unitCost: "", notes: "" });
  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/maintenance/spare-parts");
    setRows(response.data);
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/maintenance/spare-parts", { method: "POST", body: JSON.stringify({ ...form, warehouseId: form.warehouseId || options.warehouses[0]?.id, productId: form.productId || options.spareParts[0]?.id, machineId: form.machineId || options.machines[0]?.id, quantity: Number(form.quantity), unitCost: Number(form.unitCost || 0) }) });
    setForm({ ...form, quantity: "", unitCost: "", notes: "" });
    await load();
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
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3">Issue spare part</button>
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
