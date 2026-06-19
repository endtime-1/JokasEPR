"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

type Option = {
  id: string;
  code: string;
  name: string;
  farmId?: string;
  poultryHouseId?: string;
};

type PoultryOptions = {
  farms: Option[];
  houses: Option[];
  batches: (Option & { birdType: string })[];
};

type BatchRow = {
  id: string;
  code: string;
  name: string;
  birdType: string;
  status: string;
  openingBirdCount: number;
  currentLiveBirds: number;
  mortalityRate: number;
  eggProductionPercent: number;
  feedConversionRatio: number;
  costPerBird: number;
  profitability: number;
  farm: { name: string; code: string };
  poultryHouse: { name: string; code: string };
};

const inputClass = "min-h-11 rounded-md border border-line px-3";

function usePoultryOptions() {
  const [options, setOptions] = useState<PoultryOptions>({ farms: [], houses: [], batches: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<PoultryOptions>>("/poultry/options")
      .then((response) => setOptions(response.data))
      .catch(() => undefined);
  }, []);
  return options;
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-sm text-ink/65">{subtitle}</p>
    </div>
  );
}

export function PoultryDashboardPage() {
  const [dashboard, setDashboard] = useState<{
    currentLiveBirds: number;
    activeBatches: number;
    totalEggs: number;
    totalFeedKg: number;
    totalCosts: number;
    batches: BatchRow[];
  } | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<typeof dashboard>>("/poultry/dashboard")
      .then((response) => setDashboard(response.data))
      .catch(() => undefined);
  }, []);

  const cards = [
    ["Current live birds", dashboard?.currentLiveBirds ?? 0],
    ["Active batches", dashboard?.activeBatches ?? 0],
    ["Eggs recorded", dashboard?.totalEggs ?? 0],
    ["Feed consumed kg", dashboard?.totalFeedKg ?? 0],
    ["Batch costs", dashboard?.totalCosts ?? 0]
  ];

  return (
    <AppShell>
      <PageHeader title="Poultry Dashboard" subtitle="Live flock, production, mortality, feed, and cost performance across assigned farms." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm text-ink/65">{label}</p>
            <strong className="mt-3 block text-2xl font-semibold">{Number(value).toLocaleString()}</strong>
          </article>
        ))}
      </section>
      <section className="mt-6">
        <BatchTable rows={dashboard?.batches ?? []} />
      </section>
    </AppShell>
  );
}

export function FarmPoultryOverviewPage() {
  const options = usePoultryOptions();
  const [farmId, setFarmId] = useState("");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const selectedFarmId = farmId || options.farms[0]?.id || "";

  useEffect(() => {
    if (!selectedFarmId) return;
    apiFetch<ApiEnvelope<Record<string, number>>>(`/poultry/farms/${selectedFarmId}/overview`)
      .then((response) => setOverview(response.data))
      .catch(() => undefined);
  }, [selectedFarmId]);

  return (
    <AppShell>
      <PageHeader title="Farm Poultry Overview" subtitle="Farm-level poultry operating totals for assigned farms." />
      <FormField label="Farm">
        <select className={inputClass} value={selectedFarmId} onChange={(event) => setFarmId(event.target.value)}>
          {options.farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.code} - {farm.name}
            </option>
          ))}
        </select>
      </FormField>
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Object.entries(overview ?? {}).map(([key, value]) => (
          <article key={key} className="rounded-md border border-line bg-white p-4 shadow-panel">
            <p className="text-sm capitalize text-ink/65">{key.replace(/([A-Z])/g, " $1")}</p>
            <strong className="mt-3 block text-2xl font-semibold">{Number(value).toLocaleString()}</strong>
          </article>
        ))}
      </section>
    </AppShell>
  );
}

export function PoultryHousesPage({ create = false }: { create?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<Array<{ id: string; code: string; name: string; capacity?: number; farm: Option }>>([]);
  const [form, setForm] = useState({ farmId: "", name: "", code: "", capacity: "" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<typeof rows>>("/poultry/houses");
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/poultry/houses", {
      method: "POST",
      body: JSON.stringify({ farmId: form.farmId || options.farms[0]?.id, name: form.name, code: form.code, capacity: Number(form.capacity || 0) || undefined })
    });
    setForm({ farmId: "", name: "", code: "", capacity: "" });
    await load();
  }

  return (
    <AppShell>
      <PageHeader title={create ? "Create Poultry House" : "Poultry Houses"} subtitle="Manage poultry houses by farm with capacity and status." />
      {create ? (
        <PoultryHouseForm options={options} form={form} setForm={setForm} submit={submit} />
      ) : (
        <div className="mb-4">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/poultry/houses/create">
            <Plus aria-hidden className="h-4 w-4" /> Create house
          </Link>
        </div>
      )}
      <DataTable
        rows={rows}
        empty="No poultry houses found"
        columns={[
          { key: "code", label: "Code", render: (row) => row.code },
          { key: "name", label: "Name", render: (row) => row.name },
          { key: "farm", label: "Farm", render: (row) => row.farm?.name ?? "-" },
          { key: "capacity", label: "Capacity", render: (row) => row.capacity?.toLocaleString() ?? "-" }
        ]}
      />
    </AppShell>
  );
}

function PoultryHouseForm({ options, form, setForm, submit }: { options: PoultryOptions; form: { farmId: string; name: string; code: string; capacity: string }; setForm: (form: { farmId: string; name: string; code: string; capacity: string }) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <FormField label="Farm">
        <select className={inputClass} value={form.farmId || options.farms[0]?.id || ""} onChange={(event) => setForm({ ...form, farmId: event.target.value })}>
          {options.farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.code} - {farm.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="House name">
        <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </FormField>
      <FormField label="Code">
        <input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
      </FormField>
      <FormField label="Capacity">
        <input className={inputClass} type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
      </FormField>
      <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Save poultry house</button>
    </form>
  );
}

export function FlockBatchesPage({ create = false }: { create?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [form, setForm] = useState({ farmId: "", poultryHouseId: "", code: "", name: "", birdType: "LAYERS", openingBirdCount: "", startDate: new Date().toISOString().slice(0, 10) });
  const houses = useMemo(() => options.houses.filter((house) => !form.farmId || house.farmId === form.farmId), [options.houses, form.farmId]);

  async function load() {
    const response = await apiFetch<ApiEnvelope<BatchRow[]>>("/poultry/batches");
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/poultry/batches", {
      method: "POST",
      body: JSON.stringify({
        farmId: form.farmId || options.farms[0]?.id,
        poultryHouseId: form.poultryHouseId || houses[0]?.id,
        code: form.code,
        name: form.name,
        birdType: form.birdType,
        openingBirdCount: Number(form.openingBirdCount),
        startDate: form.startDate
      })
    });
    setForm({ farmId: "", poultryHouseId: "", code: "", name: "", birdType: "LAYERS", openingBirdCount: "", startDate: new Date().toISOString().slice(0, 10) });
    await load();
  }

  return (
    <AppShell>
      <PageHeader title={create ? "Create Flock Batch" : "Flock Batches"} subtitle="Register and monitor flock batches by farm and poultry house." />
      {create ? <FlockBatchForm options={options} houses={houses} form={form} setForm={setForm} submit={submit} /> : <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/poultry/batches/create"><Plus aria-hidden className="h-4 w-4" /> Create batch</Link>}
      <BatchTable rows={rows} />
    </AppShell>
  );
}

function FlockBatchForm({ options, houses, form, setForm, submit }: { options: PoultryOptions; houses: Option[]; form: { farmId: string; poultryHouseId: string; code: string; name: string; birdType: string; openingBirdCount: string; startDate: string }; setForm: (form: { farmId: string; poultryHouseId: string; code: string; name: string; birdType: string; openingBirdCount: string; startDate: string }) => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
      <FormField label="Farm">
        <select className={inputClass} value={form.farmId || options.farms[0]?.id || ""} onChange={(event) => setForm({ ...form, farmId: event.target.value, poultryHouseId: "" })}>
          {options.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.code} - {farm.name}</option>)}
        </select>
      </FormField>
      <FormField label="Poultry house">
        <select className={inputClass} value={form.poultryHouseId || houses[0]?.id || ""} onChange={(event) => setForm({ ...form, poultryHouseId: event.target.value })}>
          {houses.map((house) => <option key={house.id} value={house.id}>{house.code} - {house.name}</option>)}
        </select>
      </FormField>
      <FormField label="Bird type">
        <select className={inputClass} value={form.birdType} onChange={(event) => setForm({ ...form, birdType: event.target.value })}>
          {["LAYERS", "BROILERS", "COCKERELS", "BREEDERS", "CHICKS"].map((type) => <option key={type}>{type}</option>)}
        </select>
      </FormField>
      <FormField label="Batch name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></FormField>
      <FormField label="Code"><input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required /></FormField>
      <FormField label="Opening birds"><input className={inputClass} type="number" value={form.openingBirdCount} onChange={(event) => setForm({ ...form, openingBirdCount: event.target.value })} required /></FormField>
      <FormField label="Start date"><input className={inputClass} type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></FormField>
      <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3">Save flock batch</button>
    </form>
  );
}

function BatchTable({ rows }: { rows: BatchRow[] }) {
  return (
    <DataTable
      rows={rows}
      empty="No flock batches found"
      columns={[
        { key: "code", label: "Batch", render: (row) => <Link className="font-semibold text-brand" href={`/poultry/batches/${row.id}`}>{row.code}</Link> },
        { key: "farm", label: "Farm", render: (row) => row.farm?.name ?? "-" },
        { key: "house", label: "House", render: (row) => row.poultryHouse?.name ?? "-" },
        { key: "birds", label: "Live birds", render: (row) => row.currentLiveBirds.toLocaleString() },
        { key: "mortality", label: "Mortality %", render: (row) => `${row.mortalityRate}%` },
        { key: "egg", label: "Egg %", render: (row) => `${row.eggProductionPercent}%` },
        { key: "fcr", label: "FCR", render: (row) => row.feedConversionRatio || "-" },
        { key: "profit", label: "Profitability", render: (row) => `GHS ${row.profitability.toLocaleString()}` }
      ]}
    />
  );
}

export function FlockBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, any>>>(`/poultry/batches/${params.id}`)
      .then((response) => setBatch(response.data))
      .catch(() => undefined);
  }, [params.id]);

  return (
    <AppShell>
      <PageHeader title={batch?.name ?? "Flock Batch Details"} subtitle="Batch metrics, daily records, health history, transfers, and costs." />
      {batch?.metrics ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {["currentLiveBirds", "mortalityRate", "eggProductionPercent", "feedConversionRatio", "costPerBird"].map((key) => (
            <article key={key} className="rounded-md border border-line bg-white p-4 shadow-panel">
              <p className="text-sm capitalize text-ink/65">{key.replace(/([A-Z])/g, " $1")}</p>
              <strong className="mt-3 block text-2xl font-semibold">{batch.metrics[key]}</strong>
            </article>
          ))}
        </section>
      ) : null}
      <pre className="mt-6 max-h-[540px] overflow-auto rounded-md border border-line bg-white p-4 text-xs shadow-panel">{JSON.stringify(batch, null, 2)}</pre>
    </AppShell>
  );
}

export function PoultryRecordPage({ title, type, endpoint, health = false }: { title: string; type: string; endpoint: string; health?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ flockBatchId: "", recordDate: new Date().toISOString().slice(0, 10) });

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, any>[]>>(`/poultry/records/${type}`);
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch(endpoint, { method: "POST", body: JSON.stringify(buildRecordPayload(type, form, options)) });
    setForm({ flockBatchId: "", recordDate: new Date().toISOString().slice(0, 10) });
    await load();
  }

  return (
    <AppShell>
      <PageHeader title={title} subtitle={health ? "Veterinary and health workflow entries for assigned farms." : "Operational record entry and history for assigned flock batches."} />
      <GenericRecordForm options={options} form={form} setForm={setForm} submit={submit} type={type} />
      <SimpleRecordTable rows={rows} />
    </AppShell>
  );
}

function GenericRecordForm({ options, form, setForm, submit, type }: { options: PoultryOptions; form: Record<string, string>; setForm: (form: Record<string, string>) => void; submit: (event: FormEvent<HTMLFormElement>) => void; type: string }) {
  const fields = recordFields(type);
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <FormField label="Flock batch">
        <select className={inputClass} value={form.flockBatchId || options.batches[0]?.id || ""} onChange={(event) => setForm({ ...form, flockBatchId: event.target.value })}>
          {options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} - {batch.name}</option>)}
        </select>
      </FormField>
      {fields.map((field) => (
        <FormField key={field.name} label={field.label}>
          {field.kind === "select" ? (
            <select className={inputClass} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}>
              {field.options?.map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : (
            <input className={inputClass} type={field.kind} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} required={field.required} />
          )}
        </FormField>
      ))}
      <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Submit record</button>
    </form>
  );
}

function recordFields(type: string) {
  const date = { name: "recordDate", label: "Record date", kind: "date", required: true };
  const map: Record<string, Array<{ name: string; label: string; kind: string; required?: boolean; defaultValue?: string; options?: string[] }>> = {
    daily: [date, { name: "mortalityCount", label: "Mortality", kind: "number", required: true, defaultValue: "0" }, { name: "culledCount", label: "Culled", kind: "number", required: true, defaultValue: "0" }, { name: "feedConsumedKg", label: "Feed kg", kind: "number", required: true, defaultValue: "0" }, { name: "totalEggs", label: "Total eggs", kind: "number", required: true, defaultValue: "0" }],
    mortality: [date, { name: "birdCount", label: "Bird count", kind: "number", required: true }, { name: "reason", label: "Reason", kind: "text" }],
    feed: [date, { name: "quantityKg", label: "Quantity kg", kind: "number", required: true }, { name: "costAmount", label: "Cost", kind: "number" }],
    eggs: [date, { name: "goodEggs", label: "Good", kind: "number", defaultValue: "0" }, { name: "crackedEggs", label: "Cracked", kind: "number", defaultValue: "0" }, { name: "dirtyEggs", label: "Dirty", kind: "number", defaultValue: "0" }, { name: "brokenEggs", label: "Broken", kind: "number", defaultValue: "0" }, { name: "rejectedEggs", label: "Rejected", kind: "number", defaultValue: "0" }],
    weights: [date, { name: "sampleSize", label: "Sample size", kind: "number", required: true }, { name: "averageWeightKg", label: "Average kg", kind: "number", required: true }],
    medications: [{ name: "medicationName", label: "Medication", kind: "text", required: true }, { name: "dosage", label: "Dosage", kind: "text", required: true }, { name: "route", label: "Route", kind: "text" }, { name: "startDate", label: "Start date", kind: "date", required: true }],
    vaccinations: [{ name: "vaccineName", label: "Vaccine", kind: "text", required: true }, { name: "dose", label: "Dose", kind: "text", required: true }, { name: "vaccinationDate", label: "Date", kind: "date", required: true }],
    health: [{ name: "observationDate", label: "Date", kind: "date", required: true }, { name: "severity", label: "Severity", kind: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }, { name: "observation", label: "Observation", kind: "text", required: true }, { name: "veterinarianName", label: "Vet", kind: "text" }],
    costs: [{ name: "costDate", label: "Date", kind: "date", required: true }, { name: "costType", label: "Type", kind: "select", options: ["CHICK_PURCHASE", "FEED", "MEDICATION", "VACCINATION", "LABOR", "UTILITIES", "MAINTENANCE", "OTHER"] }, { name: "amount", label: "Amount", kind: "number", required: true }, { name: "description", label: "Description", kind: "text" }]
  };
  return map[type] ?? [date];
}

function buildRecordPayload(type: string, form: Record<string, string>, options: PoultryOptions) {
  const payload: Record<string, string | number | boolean> = { ...form, flockBatchId: form.flockBatchId || options.batches[0]?.id };
  for (const key of Object.keys(payload)) {
    if (["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "birdCount", "quantityKg", "costAmount", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "sampleSize", "averageWeightKg", "amount"].includes(key)) {
      payload[key] = Number(payload[key] || 0);
    }
  }
  if (type === "mortality") payload.isCulling = false;
  return payload;
}

function SimpleRecordTable({ rows }: { rows: Record<string, any>[] }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) => ["recordDate", "startDate", "vaccinationDate", "observationDate", "transferDate", "costDate", "birdCount", "quantityKg", "goodEggs", "medicationName", "vaccineName", "severity", "amount", "status"].includes(key));
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, any>) => String(row[key] ?? "-").slice(0, 80) }))} />;
}

export function PoultryTransferPage() {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [form, setForm] = useState({ flockBatchId: "", toFarmId: "", toPoultryHouseId: "", birdCount: "", transferDate: new Date().toISOString().slice(0, 10), reason: "" });

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, any>[]>>("/poultry/records/transfers");
    setRows(response.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/poultry/transfers", { method: "POST", body: JSON.stringify({ ...form, flockBatchId: form.flockBatchId || options.batches[0]?.id, toFarmId: form.toFarmId || options.farms[0]?.id, toPoultryHouseId: form.toPoultryHouseId || options.houses[0]?.id, birdCount: Number(form.birdCount) }) });
    await load();
  }
  return (
    <AppShell>
      <PageHeader title="Poultry Transfers" subtitle="Move birds between houses or farms with transfer audit tracking." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-5">
        <FormField label="Batch"><select className={inputClass} value={form.flockBatchId || options.batches[0]?.id || ""} onChange={(event) => setForm({ ...form, flockBatchId: event.target.value })}>{options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></FormField>
        <FormField label="To farm"><select className={inputClass} value={form.toFarmId || options.farms[0]?.id || ""} onChange={(event) => setForm({ ...form, toFarmId: event.target.value })}>{options.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.code}</option>)}</select></FormField>
        <FormField label="To house"><select className={inputClass} value={form.toPoultryHouseId || options.houses[0]?.id || ""} onChange={(event) => setForm({ ...form, toPoultryHouseId: event.target.value })}>{options.houses.map((house) => <option key={house.id} value={house.id}>{house.code}</option>)}</select></FormField>
        <FormField label="Birds"><input className={inputClass} type="number" value={form.birdCount} onChange={(event) => setForm({ ...form, birdCount: event.target.value })} required /></FormField>
        <FormField label="Date"><input className={inputClass} type="date" value={form.transferDate} onChange={(event) => setForm({ ...form, transferDate: event.target.value })} required /></FormField>
        <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-5">Create transfer</button>
      </form>
      <SimpleRecordTable rows={rows} />
    </AppShell>
  );
}

export function PoultryReportsPage() {
  return (
    <AppShell>
      <PageHeader title="Poultry Reports" subtitle="Export poultry flock performance, health, production, and cost reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/poultry/reports/summary.csv", "poultry-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download poultry summary CSV
      </button>
    </AppShell>
  );
}

