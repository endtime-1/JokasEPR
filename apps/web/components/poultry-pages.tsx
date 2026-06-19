"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { PoultryShell } from "./poultry-shell";
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

type PenOption = {
  id: string;
  code: string;
  name?: string;
  penNumber: number;
  poultryHouseId: string;
  farmId: string;
  capacity?: number;
};

type PoultryOptions = {
  farms: Option[];
  houses: Option[];
  pens: PenOption[];
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
  poultryHouse?: { name: string; code: string } | null;
};

type PenAllocation = { penId: string; birdCount: number; notes?: string };

const inputClass = "min-h-11 rounded-md border border-line px-3";

function usePoultryOptions() {
  const [options, setOptions] = useState<PoultryOptions>({ farms: [], houses: [], pens: [], batches: [] });
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
    <PoultryShell>
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
    </PoultryShell>
  );
}

// ─── Houses ───────────────────────────────────────────────────────────────────

type HouseRow = { id: string; code: string; name: string; capacity?: number; farm: Option; pens?: PenOption[] };

export function PoultryHousesPage({ create = false }: { create?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<HouseRow[]>([]);
  const [form, setForm] = useState({ farmId: "", name: "", code: "", capacity: "", defaultPenCount: "5" });
  const [expandedHouseId, setExpandedHouseId] = useState<string | null>(null);
  const [addPenHouseId, setAddPenHouseId] = useState<string | null>(null);

  async function load() {
    const response = await apiFetch<ApiEnvelope<HouseRow[]>>("/poultry/houses");
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/poultry/houses", {
      method: "POST",
      body: JSON.stringify({
        farmId: form.farmId || options.farms[0]?.id,
        name: form.name,
        code: form.code,
        capacity: Number(form.capacity || 0) || undefined,
        defaultPenCount: Number(form.defaultPenCount || 5)
      })
    });
    setForm({ farmId: "", name: "", code: "", capacity: "", defaultPenCount: "5" });
    await load();
  }

  async function addPen(houseId: string, penData: { name?: string; capacity?: number }) {
    await apiFetch(`/poultry/houses/${houseId}/pens`, { method: "POST", body: JSON.stringify(penData) });
    setAddPenHouseId(null);
    await load();
  }

  return (
    <PoultryShell>
      <PageHeader title={create ? "Create Poultry House" : "Poultry Houses"} subtitle="Manage poultry houses by farm. Each house auto-creates 5 pens." />
      {create ? (
        <PoultryHouseForm options={options} form={form} setForm={setForm} submit={submit} />
      ) : (
        <div className="mb-4">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/poultry/houses/create">
            <Plus aria-hidden className="h-4 w-4" /> Create house
          </Link>
        </div>
      )}
      <div className="space-y-3">
        {rows.length === 0 && <p className="rounded-md border border-line bg-white p-4 text-sm text-ink/65">No poultry houses found.</p>}
        {rows.map((house) => {
          const pens = house.pens ?? options.pens.filter((p) => p.poultryHouseId === house.id);
          const isExpanded = expandedHouseId === house.id;
          return (
            <div key={house.id} className="rounded-md border border-line bg-white shadow-panel">
              <div className="flex items-center justify-between p-4">
                <div>
                  <span className="font-semibold">{house.code} — {house.name}</span>
                  <span className="ml-3 text-sm text-ink/65">{house.farm?.name} · {pens.length} pens{house.capacity ? ` · cap ${house.capacity.toLocaleString()}` : ""}</span>
                </div>
                <div className="flex gap-2">
                  <button className="rounded border border-line px-3 py-1.5 text-xs font-medium" onClick={() => setExpandedHouseId(isExpanded ? null : house.id)}>
                    {isExpanded ? "Hide pens" : "Show pens"}
                  </button>
                  <button className="rounded border border-brand px-3 py-1.5 text-xs font-medium text-brand" onClick={() => setAddPenHouseId(house.id)}>
                    + Add pen
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-line px-4 pb-4">
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                    {pens.map((pen) => (
                      <div key={pen.id} className="rounded border border-line p-2 text-center text-sm">
                        <div className="font-semibold">{pen.code}</div>
                        {pen.name && <div className="text-xs text-ink/60">{pen.name}</div>}
                        {pen.capacity && <div className="text-xs text-ink/60">cap {pen.capacity}</div>}
                      </div>
                    ))}
                  </div>
                  {addPenHouseId === house.id && (
                    <AddPenForm houseId={house.id} onSave={addPen} onCancel={() => setAddPenHouseId(null)} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PoultryShell>
  );
}

function AddPenForm({ houseId, onSave, onCancel }: { houseId: string; onSave: (id: string, data: { name?: string; capacity?: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  return (
    <form className="mt-4 flex gap-3 rounded border border-line bg-ink/5 p-3" onSubmit={(e) => { e.preventDefault(); onSave(houseId, { name: name || undefined, capacity: Number(capacity) || undefined }); }}>
      <input className={inputClass + " flex-1"} placeholder="Pen name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputClass + " w-28"} type="number" placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white">Add</button>
      <button type="button" className="min-h-11 rounded-md border border-line px-4 text-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function PoultryHouseForm({ options, form, setForm, submit }: {
  options: PoultryOptions;
  form: { farmId: string; name: string; code: string; capacity: string; defaultPenCount: string };
  setForm: (f: typeof form) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
      <FormField label="Default pens (auto-created)">
        <input className={inputClass} type="number" min="1" max="20" value={form.defaultPenCount} onChange={(event) => setForm({ ...form, defaultPenCount: event.target.value })} />
      </FormField>
      <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-4">Save poultry house</button>
    </form>
  );
}

// ─── Batches ──────────────────────────────────────────────────────────────────

export function FlockBatchesPage({ create = false }: { create?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<BatchRow[]>([]);

  async function load() {
    const response = await apiFetch<ApiEnvelope<BatchRow[]>>("/poultry/batches");
    setRows(response.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <PoultryShell>
      <PageHeader title={create ? "Create Flock Batch" : "Flock Batches"} subtitle="Register and monitor flock batches distributed across houses and pens." />
      {create ? (
        <FlockBatchForm options={options} onSaved={load} />
      ) : (
        <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/poultry/batches/create">
          <Plus aria-hidden className="h-4 w-4" /> Create batch
        </Link>
      )}
      <BatchTable rows={rows} />
    </PoultryShell>
  );
}

function FlockBatchForm({ options, onSaved }: { options: PoultryOptions; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    birdType: "LAYERS",
    openingBirdCount: "",
    startDate: new Date().toISOString().slice(0, 10),
    expectedCloseDate: "",
    notes: ""
  });
  const [allocations, setAllocations] = useState<PenAllocation[]>([]);
  const [error, setError] = useState("");

  const totalAllocated = allocations.reduce((sum, a) => sum + (Number(a.birdCount) || 0), 0);
  const openingCount = Number(form.openingBirdCount) || 0;
  const remaining = openingCount - totalAllocated;

  function togglePen(pen: PenOption) {
    const exists = allocations.find((a) => a.penId === pen.id);
    if (exists) {
      setAllocations(allocations.filter((a) => a.penId !== pen.id));
    } else {
      setAllocations([...allocations, { penId: pen.id, birdCount: 0 }]);
    }
  }

  function updateAllocation(penId: string, birdCount: number) {
    setAllocations(allocations.map((a) => (a.penId === penId ? { ...a, birdCount } : a)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (openingCount === 0) { setError("Opening bird count must be greater than 0."); return; }
    if (allocations.length === 0) { setError("Select at least one pen to allocate birds."); return; }
    if (totalAllocated !== openingCount) { setError(`Allocated ${totalAllocated} birds but opening count is ${openingCount}. They must match.`); return; }
    try {
      await apiFetch("/poultry/batches", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          birdType: form.birdType,
          openingBirdCount: openingCount,
          startDate: form.startDate,
          expectedCloseDate: form.expectedCloseDate || undefined,
          notes: form.notes || undefined,
          penAllocations: allocations
        })
      });
      onSaved();
      setForm({ code: "", name: "", birdType: "LAYERS", openingBirdCount: "", startDate: new Date().toISOString().slice(0, 10), expectedCloseDate: "", notes: "" });
      setAllocations([]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create batch.");
    }
  }

  const pensByHouse = useMemo(() => {
    const map = new Map<string, { house: Option; pens: PenOption[] }>();
    for (const pen of options.pens) {
      const house = options.houses.find((h) => h.id === pen.poultryHouseId);
      if (!house) continue;
      if (!map.has(house.id)) map.set(house.id, { house, pens: [] });
      map.get(house.id)!.pens.push(pen);
    }
    return [...map.values()];
  }, [options.pens, options.houses]);

  return (
    <form onSubmit={submit} className="mb-6 space-y-4">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <FormField label="Batch name">
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FormField>
        <FormField label="Code">
          <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </FormField>
        <FormField label="Bird type">
          <select className={inputClass} value={form.birdType} onChange={(e) => setForm({ ...form, birdType: e.target.value })}>
            {["LAYERS", "BROILERS", "COCKERELS", "BREEDERS", "CHICKS"].map((type) => <option key={type}>{type}</option>)}
          </select>
        </FormField>
        <FormField label="Opening bird count">
          <input className={inputClass} type="number" min="1" value={form.openingBirdCount} onChange={(e) => setForm({ ...form, openingBirdCount: e.target.value })} required />
        </FormField>
        <FormField label="Start date">
          <input className={inputClass} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
        </FormField>
        <FormField label="Expected close date">
          <input className={inputClass} type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
        </FormField>
        <div className="md:col-span-3">
          <FormField label="Notes">
            <input className={inputClass + " w-full"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
        </div>
      </div>

      <div className="rounded-md border border-line bg-white p-4 shadow-panel">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Pen Allocation</h3>
          <span className={`text-sm font-medium ${remaining === 0 ? "text-green-600" : remaining < 0 ? "text-red-600" : "text-amber-600"}`}>
            {remaining === 0 ? "Fully allocated" : remaining > 0 ? `${remaining} birds remaining` : `Over-allocated by ${Math.abs(remaining)}`}
          </span>
        </div>
        {pensByHouse.length === 0 && <p className="text-sm text-ink/65">No pens available. Create houses first.</p>}
        {pensByHouse.map(({ house, pens }) => (
          <div key={house.id} className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">{house.code} — {house.name}</p>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {pens.map((pen) => {
                const alloc = allocations.find((a) => a.penId === pen.id);
                return (
                  <div key={pen.id} className={`rounded border p-2 ${alloc ? "border-brand bg-brand/5" : "border-line"}`}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={!!alloc} onChange={() => togglePen(pen)} />
                      <span className="text-sm font-medium">{pen.code}{pen.name ? ` — ${pen.name}` : ""}</span>
                    </label>
                    {alloc && (
                      <input
                        className="mt-1 w-full rounded border border-line px-2 py-1 text-sm"
                        type="number"
                        min="0"
                        placeholder="Birds"
                        value={alloc.birdCount || ""}
                        onChange={(e) => updateAllocation(pen.id, Number(e.target.value))}
                      />
                    )}
                    {pen.capacity && <p className="mt-1 text-xs text-ink/50">cap {pen.capacity}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button type="submit" className="min-h-11 rounded-md bg-brand px-6 text-sm font-semibold text-white">
        Create flock batch
      </button>
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
        { key: "house", label: "House", render: (row) => row.poultryHouse?.name ?? "Multi-house" },
        { key: "birds", label: "Live birds", render: (row) => row.currentLiveBirds.toLocaleString() },
        { key: "mortality", label: "Mortality %", render: (row) => `${row.mortalityRate}%` },
        { key: "egg", label: "Egg %", render: (row) => `${row.eggProductionPercent}%` },
        { key: "fcr", label: "FCR", render: (row) => row.feedConversionRatio || "-" },
        { key: "profit", label: "Profitability", render: (row) => `GHS ${row.profitability.toLocaleString()}` },
        { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> }
      ]}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    PLANNED: "bg-blue-100 text-blue-800",
    CLOSED: "bg-gray-100 text-gray-600",
    SOLD: "bg-purple-100 text-purple-800",
    CULLED: "bg-red-100 text-red-800"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

// ─── Batch Detail ─────────────────────────────────────────────────────────────

type BatchDetail = {
  id: string; code: string; name: string; birdType: string; status: string;
  openingBirdCount: number; startDate: string; expectedCloseDate?: string; notes?: string;
  farm?: { name: string }; poultryHouse?: { name: string } | null;
  penAllocations?: Array<{ birdCount: number; pen: { code: string; name?: string; poultryHouse?: { name: string } } }>;
  metrics?: { currentLiveBirds: number; mortalityRate: number; eggProductionPercent: number; feedConversionRatio: number; costPerBird: number; profitability: number };
};

export function FlockBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "pens" | "records">("overview");
  const [statusForm, setStatusForm] = useState({ status: "", notes: "" });
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<BatchDetail>>(`/poultry/batches/${params.id}`)
      .then((response) => setBatch(response.data))
      .catch(() => undefined);
  }, [params.id]);

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMsg("");
    try {
      await apiFetch(`/poultry/batches/${params.id}/status`, { method: "PATCH", body: JSON.stringify({ status: statusForm.status, notes: statusForm.notes || undefined }) });
      setStatusMsg("Status updated.");
      const response = await apiFetch<ApiEnvelope<BatchDetail>>(`/poultry/batches/${params.id}`);
      setBatch(response.data);
    } catch (err: any) {
      setStatusMsg(err?.message ?? "Failed to update status.");
    }
  }

  const metricKeys = ["currentLiveBirds", "mortalityRate", "eggProductionPercent", "feedConversionRatio", "costPerBird", "profitability"] as const;

  return (
    <PoultryShell>
      <PageHeader title={batch?.name ?? "Flock Batch"} subtitle={batch ? `${batch.code} · ${batch.birdType} · ${batch.farm?.name ?? ""}` : "Loading…"} />
      {batch && (
        <>
          <div className="mb-6 flex gap-2">
            <StatusBadge status={batch.status} />
          </div>

          {batch.metrics && (
            <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {metricKeys.map((key) => (
                <article key={key} className="rounded-md border border-line bg-white p-4 shadow-panel">
                  <p className="text-sm capitalize text-ink/65">{key.replace(/([A-Z])/g, " $1")}</p>
                  <strong className="mt-3 block text-2xl font-semibold">{String(batch.metrics![key] ?? "—")}</strong>
                </article>
              ))}
            </section>
          )}

          <div className="mb-4 flex gap-1 border-b border-line">
            {(["overview", "pens", "records"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-brand text-brand" : "text-ink/60"}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-2">
                <div><span className="text-xs text-ink/50">Opening birds</span><p className="font-semibold">{batch.openingBirdCount.toLocaleString()}</p></div>
                <div><span className="text-xs text-ink/50">Start date</span><p className="font-semibold">{batch.startDate?.slice(0, 10)}</p></div>
                {batch.expectedCloseDate && <div><span className="text-xs text-ink/50">Expected close</span><p className="font-semibold">{batch.expectedCloseDate.slice(0, 10)}</p></div>}
                {batch.notes && <div className="md:col-span-2"><span className="text-xs text-ink/50">Notes</span><p>{batch.notes}</p></div>}
              </div>

              <div className="rounded-md border border-line bg-white p-4 shadow-panel">
                <h3 className="mb-3 font-semibold">Update Batch Status</h3>
                {statusMsg && <p className="mb-2 text-sm text-green-600">{statusMsg}</p>}
                <form onSubmit={updateStatus} className="flex gap-3">
                  <select className={inputClass} value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })} required>
                    <option value="">Select status…</option>
                    {["ACTIVE", "PLANNED", "SOLD", "CULLED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <input className={inputClass + " flex-1"} placeholder="Notes (optional)" value={statusForm.notes} onChange={(e) => setStatusForm({ ...statusForm, notes: e.target.value })} />
                  <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white">Update</button>
                </form>
              </div>
            </div>
          )}

          {tab === "pens" && (
            <div className="rounded-md border border-line bg-white p-4 shadow-panel">
              <h3 className="mb-3 font-semibold">Pen Allocations</h3>
              {(batch.penAllocations ?? []).length === 0 && <p className="text-sm text-ink/65">No pen allocations recorded.</p>}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {(batch.penAllocations ?? []).map((alloc, i) => (
                  <div key={i} className="rounded border border-line p-3">
                    <p className="font-semibold">{alloc.pen?.code}{alloc.pen?.name ? ` — ${alloc.pen.name}` : ""}</p>
                    {alloc.pen?.poultryHouse && <p className="text-xs text-ink/60">{alloc.pen.poultryHouse.name}</p>}
                    <p className="mt-2 text-lg font-bold">{alloc.birdCount.toLocaleString()} <span className="text-sm font-normal text-ink/60">birds</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "records" && (
            <p className="rounded-md border border-line bg-white p-4 text-sm text-ink/65">
              Use the daily records, mortality, feed, eggs, health, and vaccination sections to view records for this batch.
            </p>
          )}
        </>
      )}
    </PoultryShell>
  );
}

// ─── Records ──────────────────────────────────────────────────────────────────

export function PoultryRecordPage({ title, type, endpoint, health = false }: { title: string; type: string; endpoint: string; health?: boolean }) {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ flockBatchId: "", penId: "", recordDate: new Date().toISOString().slice(0, 10) });

  const batchPens = useMemo(() => {
    const batchId = form.flockBatchId || options.batches[0]?.id || "";
    return options.pens.filter((p) => {
      // we can't know the batch's pen allocations from options, so show all pens
      return true;
    });
  }, [form.flockBatchId, options.pens, options.batches]);

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
    setForm({ flockBatchId: "", penId: "", recordDate: new Date().toISOString().slice(0, 10) });
    await load();
  }

  return (
    <PoultryShell>
      <PageHeader title={title} subtitle={health ? "Veterinary and health workflow entries for assigned farms." : "Operational record entry and history for assigned flock batches."} />
      <GenericRecordForm options={options} batchPens={batchPens} form={form} setForm={setForm} submit={submit} type={type} />
      <SimpleRecordTable rows={rows} />
    </PoultryShell>
  );
}

function GenericRecordForm({ options, batchPens, form, setForm, submit, type }: {
  options: PoultryOptions;
  batchPens: PenOption[];
  form: Record<string, string>;
  setForm: (form: Record<string, string>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  type: string;
}) {
  const fields = recordFields(type);
  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <FormField label="Flock batch">
        <select className={inputClass} value={form.flockBatchId || options.batches[0]?.id || ""} onChange={(event) => setForm({ ...form, flockBatchId: event.target.value, penId: "" })}>
          {options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} - {batch.name}</option>)}
        </select>
      </FormField>
      <FormField label="Pen (optional)">
        <select className={inputClass} value={form.penId ?? ""} onChange={(event) => setForm({ ...form, penId: event.target.value })}>
          <option value="">— all pens —</option>
          {batchPens.map((pen) => <option key={pen.id} value={pen.id}>{pen.code}{pen.name ? ` — ${pen.name}` : ""}</option>)}
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
  const payload: Record<string, string | number | boolean | undefined> = {
    ...form,
    flockBatchId: form.flockBatchId || options.batches[0]?.id,
    penId: form.penId || undefined
  };
  for (const key of Object.keys(payload)) {
    if (["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "birdCount", "quantityKg", "costAmount", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "sampleSize", "averageWeightKg", "amount"].includes(key)) {
      payload[key] = Number(payload[key] || 0);
    }
  }
  if (type === "mortality") payload.isCulling = false;
  return payload;
}

function SimpleRecordTable({ rows }: { rows: Record<string, any>[] }) {
  const keys = Object.keys(rows[0] ?? {}).filter((key) =>
    ["recordDate", "startDate", "vaccinationDate", "observationDate", "transferDate", "costDate", "birdCount", "quantityKg", "goodEggs", "medicationName", "vaccineName", "severity", "amount", "status"].includes(key)
  );
  return <DataTable rows={rows} empty="No records found" columns={keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, any>) => String(row[key] ?? "-").slice(0, 80) }))} />;
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export function PoultryTransferPage() {
  const options = usePoultryOptions();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [form, setForm] = useState({ flockBatchId: "", fromPenId: "", toFarmId: "", toPoultryHouseId: "", toPenId: "", birdCount: "", transferDate: new Date().toISOString().slice(0, 10), reason: "" });

  const toHouses = useMemo(() => options.houses.filter((h) => !form.toFarmId || h.farmId === form.toFarmId), [options.houses, form.toFarmId]);
  const toPens = useMemo(() => options.pens.filter((p) => !form.toPoultryHouseId || p.poultryHouseId === form.toPoultryHouseId), [options.pens, form.toPoultryHouseId]);

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, any>[]>>("/poultry/records/transfers");
    setRows(response.data);
  }
  useEffect(() => { load().catch(() => undefined); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/poultry/transfers", {
      method: "POST",
      body: JSON.stringify({
        flockBatchId: form.flockBatchId || options.batches[0]?.id,
        fromPenId: form.fromPenId || undefined,
        toFarmId: form.toFarmId || options.farms[0]?.id,
        toPoultryHouseId: form.toPoultryHouseId || toHouses[0]?.id,
        toPenId: form.toPenId || undefined,
        birdCount: Number(form.birdCount),
        transferDate: form.transferDate,
        reason: form.reason || undefined
      })
    });
    await load();
  }

  return (
    <PoultryShell>
      <PageHeader title="Poultry Transfers" subtitle="Move birds between pens, houses, or farms with full transfer audit tracking." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <FormField label="Batch">
          <select className={inputClass} value={form.flockBatchId || options.batches[0]?.id || ""} onChange={(e) => setForm({ ...form, flockBatchId: e.target.value, fromPenId: "" })}>
            {options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} - {batch.name}</option>)}
          </select>
        </FormField>
        <FormField label="From pen (optional)">
          <select className={inputClass} value={form.fromPenId} onChange={(e) => setForm({ ...form, fromPenId: e.target.value })}>
            <option value="">— any pen —</option>
            {options.pens.map((pen) => <option key={pen.id} value={pen.id}>{pen.code}</option>)}
          </select>
        </FormField>
        <FormField label="To farm">
          <select className={inputClass} value={form.toFarmId || options.farms[0]?.id || ""} onChange={(e) => setForm({ ...form, toFarmId: e.target.value, toPoultryHouseId: "", toPenId: "" })}>
            {options.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.code} - {farm.name}</option>)}
          </select>
        </FormField>
        <FormField label="To house">
          <select className={inputClass} value={form.toPoultryHouseId || toHouses[0]?.id || ""} onChange={(e) => setForm({ ...form, toPoultryHouseId: e.target.value, toPenId: "" })}>
            {toHouses.map((house) => <option key={house.id} value={house.id}>{house.code} - {house.name}</option>)}
          </select>
        </FormField>
        <FormField label="To pen (optional)">
          <select className={inputClass} value={form.toPenId} onChange={(e) => setForm({ ...form, toPenId: e.target.value })}>
            <option value="">— any pen —</option>
            {toPens.map((pen) => <option key={pen.id} value={pen.id}>{pen.code}</option>)}
          </select>
        </FormField>
        <FormField label="Bird count">
          <input className={inputClass} type="number" min="1" value={form.birdCount} onChange={(e) => setForm({ ...form, birdCount: e.target.value })} required />
        </FormField>
        <FormField label="Transfer date">
          <input className={inputClass} type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} required />
        </FormField>
        <FormField label="Reason">
          <input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </FormField>
        <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3">Create transfer</button>
      </form>
      <SimpleRecordTable rows={rows} />
    </PoultryShell>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function PoultryReportsPage() {
  return (
    <PoultryShell>
      <PageHeader title="Poultry Reports" subtitle="Export poultry flock performance, health, production, and cost reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/poultry/reports/summary.csv", "poultry-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download poultry summary CSV
      </button>
    </PoultryShell>
  );
}
