"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { PoultryShell } from "./poultry-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport, getCached, getCachedFirst, hasCached } from "../lib/api";
import { formatCell } from "../lib/format";
import { useAuth } from "./auth-context";

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
  warehouses: Option[];
  products: Option[];
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
  const [options, setOptions] = useState<PoultryOptions>(() =>
    getCached<ApiEnvelope<PoultryOptions>>("/poultry/options")?.data ?? { farms: [], houses: [], pens: [], batches: [], warehouses: [], products: [] }
  );
  const [optionsError, setOptionsError] = useState("");
  const [optionsKey, setOptionsKey] = useState(0);

  useEffect(() => {
    setOptionsError("");
    apiFetch<ApiEnvelope<PoultryOptions>>("/poultry/options")
      .then((response) => setOptions(response.data ?? { farms: [], houses: [], pens: [], batches: [], warehouses: [], products: [] }))
      .catch((err) => setOptionsError(err?.message ?? "Failed to load dropdown options. Refresh the page."));
  }, [optionsKey]);

  const refreshOptions = () => setOptionsKey((k) => k + 1);
  return { options, optionsError, refreshOptions };
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
  const { options } = usePoultryOptions();
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

const HOUSES_CACHE = "jokas_poultry_houses";

export function PoultryHousesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError, refreshOptions } = usePoultryOptions();
  const [rows, setRows] = useState<HouseRow[]>(() => {
    const cached = getCachedFirst<ApiEnvelope<HouseRow[]>>("/poultry/houses");
    if (Array.isArray(cached?.data) && cached.data.length > 0) return cached.data;
    try {
      const stored = JSON.parse(sessionStorage.getItem(HOUSES_CACHE) ?? "null");
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch { /* noop */ }
    return [];
  });
  const [loading, setLoading] = useState(!hasCached("/poultry/houses"));
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ farmId: "", name: "", code: "", capacity: "", defaultPenCount: "5" });
  const [expandedHouseId, setExpandedHouseId] = useState<string | null>(null);
  const [addPenHouseId, setAddPenHouseId] = useState<string | null>(null);
  const [editHouse, setEditHouse] = useState<HouseRow | null>(null);
  const [editHouseForm, setEditHouseForm] = useState({ name: "", code: "", capacity: "" });
  const [editPen, setEditPen] = useState<PenOption | null>(null);
  const [editPenForm, setEditPenForm] = useState({ name: "", capacity: "" });
  const [submitMsg, setSubmitMsg] = useState("");
  const loadingRef = useRef(false);

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<HouseRow[]>>("/poultry/houses");
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows(data);
    if (data.length > 0) {
      try { sessionStorage.setItem(HOUSES_CACHE, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadHouses() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    load()
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load houses."))
      .finally(() => { setLoading(false); loadingRef.current = false; });
  }

  useEffect(() => { loadHouses(); }, []);

  useEffect(() => {
    function onRecovered() { if (rows.length === 0) loadHouses(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [rows.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMsg("");
    try {
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
      refreshOptions();
      setSubmitMsg("House created successfully.");
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to create house.");
    }
  }

  async function addPen(houseId: string, penData: { name?: string; capacity?: number }) {
    await apiFetch(`/poultry/houses/${houseId}/pens`, { method: "POST", body: JSON.stringify(penData) });
    setAddPenHouseId(null);
    await load();
    refreshOptions();
  }

  function startEditHouse(house: HouseRow) {
    setEditHouse(house);
    setEditHouseForm({ name: house.name, code: house.code, capacity: house.capacity ? String(house.capacity) : "" });
  }

  async function saveHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editHouse) return;
    try {
      await apiFetch(`/poultry/houses/${editHouse.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editHouseForm.name || undefined, code: editHouseForm.code || undefined, capacity: Number(editHouseForm.capacity) || undefined })
      });
      setEditHouse(null);
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to update house.");
    }
  }

  async function deleteHouse(house: HouseRow) {
    if (!confirm(`Delete house "${house.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/poultry/houses/${house.id}`, { method: "DELETE" });
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to delete house.");
    }
  }

  function startEditPen(pen: PenOption) {
    setEditPen(pen);
    setEditPenForm({ name: pen.name ?? "", capacity: pen.capacity ? String(pen.capacity) : "" });
  }

  async function savePen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editPen) return;
    try {
      await apiFetch(`/poultry/pens/${editPen.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editPenForm.name || undefined, capacity: Number(editPenForm.capacity) || undefined })
      });
      setEditPen(null);
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to update pen.");
    }
  }

  async function deletePen(pen: PenOption) {
    if (!confirm(`Delete pen "${pen.code}"?`)) return;
    try {
      await apiFetch(`/poultry/pens/${pen.id}`, { method: "DELETE" });
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to delete pen.");
    }
  }

  return (
    <PoultryShell>
      <PageHeader title={create ? "Create Poultry House" : "Poultry Houses"} subtitle="Manage poultry houses by farm. Each house auto-creates 5 pens." />
      {optionsError && <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{optionsError}</p>}
      {submitMsg && <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{submitMsg}</p>}
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
        {loading && rows.length === 0
          ? [1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-md border border-line bg-white" />)
          : loadError
          ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{loadError}</span>
              <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={loadHouses}>Retry</button>
            </div>
          )
          : !loading && rows.length === 0 && <p className="rounded-md border border-line bg-white p-4 text-sm text-ink/65">No poultry houses found. <Link className="font-semibold text-brand hover:underline" href="/poultry/houses/create">Create one →</Link></p>
        }
        {rows.map((house) => {
          const housePens = house.pens && house.pens.length > 0 ? house.pens : options.pens.filter((p) => p.poultryHouseId === house.id);
          const pens = housePens;
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
                  <button className="rounded border border-line p-1.5 text-ink/50 hover:border-brand hover:text-brand" title="Edit house" onClick={() => startEditHouse(house)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded border border-line p-1.5 text-ink/50 hover:border-red-400 hover:text-red-500" title="Delete house" onClick={() => deleteHouse(house)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {editHouse?.id === house.id && (
                <form onSubmit={saveHouse} className="border-t border-line bg-amber-50 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-amber-700">Edit house</p>
                  <div className="flex flex-wrap gap-2">
                    <input className={inputClass + " flex-1"} placeholder="Name" value={editHouseForm.name} onChange={(e) => setEditHouseForm({ ...editHouseForm, name: e.target.value })} />
                    <input className={inputClass + " w-28"} placeholder="Code" value={editHouseForm.code} onChange={(e) => setEditHouseForm({ ...editHouseForm, code: e.target.value })} />
                    <input className={inputClass + " w-28"} type="number" placeholder="Capacity" value={editHouseForm.capacity} onChange={(e) => setEditHouseForm({ ...editHouseForm, capacity: e.target.value })} />
                    <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white">Save</button>
                    <button type="button" className="min-h-11 rounded-md border border-line px-4 text-sm" onClick={() => setEditHouse(null)}>Cancel</button>
                  </div>
                </form>
              )}

              {isExpanded && (
                <div className="border-t border-line px-4 pb-4">
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                    {pens.map((pen) => (
                      <div key={pen.id} className="group relative rounded border border-line p-2 text-center text-sm">
                        <div className="font-semibold">{pen.code}</div>
                        {pen.name && <div className="text-xs text-ink/60">{pen.name}</div>}
                        {pen.capacity && <div className="text-xs text-ink/60">cap {pen.capacity}</div>}
                        <div className="mt-1 flex justify-center gap-1 opacity-0 group-hover:opacity-100">
                          <button type="button" title="Edit pen" onClick={() => startEditPen(pen)} className="rounded p-0.5 text-ink/40 hover:bg-brand/10 hover:text-brand"><Pencil className="h-3 w-3" /></button>
                          <button type="button" title="Delete pen" onClick={() => deletePen(pen)} className="rounded p-0.5 text-ink/40 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {editPen && pens.some((p) => p.id === editPen.id) && (
                    <form onSubmit={savePen} className="mt-3 flex gap-2 rounded border border-amber-200 bg-amber-50 p-2">
                      <span className="self-center text-xs font-semibold text-amber-700">{editPen.code}</span>
                      <input className={inputClass + " flex-1"} placeholder="Name (optional)" value={editPenForm.name} onChange={(e) => setEditPenForm({ ...editPenForm, name: e.target.value })} />
                      <input className={inputClass + " w-28"} type="number" placeholder="Capacity" value={editPenForm.capacity} onChange={(e) => setEditPenForm({ ...editPenForm, capacity: e.target.value })} />
                      <button type="submit" className="min-h-11 rounded-md bg-brand px-3 text-sm font-semibold text-white">Save</button>
                      <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => setEditPen(null)}>Cancel</button>
                    </form>
                  )}
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

const BATCHES_CACHE = "jokas_poultry_batches";

export function FlockBatchesPage({ create = false }: { create?: boolean }) {
  const { options, optionsError, refreshOptions } = usePoultryOptions();
  const [rows, setRows] = useState<BatchRow[]>(() => {
    const cached = getCachedFirst<ApiEnvelope<BatchRow[]>>("/poultry/batches");
    if (Array.isArray(cached?.data) && cached.data.length > 0) return cached.data;
    try {
      const stored = JSON.parse(sessionStorage.getItem(BATCHES_CACHE) ?? "null");
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch { /* noop */ }
    return [];
  });
  const [loading, setLoading] = useState(!hasCached("/poultry/batches"));
  const [loadError, setLoadError] = useState("");
  const [editBatch, setEditBatch] = useState<BatchRow | null>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "", birdType: "LAYERS", expectedCloseDate: "", notes: "" });
  const [editMsg, setEditMsg] = useState("");
  const loadingRef = useRef(false);

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<BatchRow[]>>("/poultry/batches");
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows(data);
    if (data.length > 0) {
      try { sessionStorage.setItem(BATCHES_CACHE, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadBatches() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    load()
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load batches."))
      .finally(() => { setLoading(false); loadingRef.current = false; });
  }

  useEffect(() => { loadBatches(); }, []);

  useEffect(() => {
    function onRecovered() { if (rows.length === 0) loadBatches(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [rows.length]);

  function startEdit(batch: BatchRow) {
    setEditBatch(batch);
    setEditForm({ code: batch.code, name: batch.name, birdType: batch.birdType, expectedCloseDate: "", notes: "" });
    setEditMsg("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editBatch) return;
    setEditMsg("");
    try {
      await apiFetch(`/poultry/batches/${editBatch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ code: editForm.code || undefined, name: editForm.name || undefined, birdType: editForm.birdType || undefined, expectedCloseDate: editForm.expectedCloseDate || undefined, notes: editForm.notes || undefined })
      });
      setEditBatch(null);
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to update batch.");
    }
  }

  async function deleteBatch(batch: BatchRow) {
    if (!confirm(`Delete batch "${batch.name}"? This will remove the batch and all its records.`)) return;
    try {
      await apiFetch(`/poultry/batches/${batch.id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete batch.");
    }
  }

  return (
    <PoultryShell>
      <PageHeader title={create ? "Create Flock Batch" : "Flock Batches"} subtitle="Register and monitor flock batches distributed across houses and pens." />
      {optionsError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{optionsError}</span>
          <button type="button" className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold" onClick={refreshOptions}>Retry</button>
        </div>
      )}
      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold" onClick={loadBatches}>Retry</button>
        </div>
      )}
      {editMsg && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{editMsg}</p>}
      {create ? (
        <FlockBatchForm options={options} onSaved={load} />
      ) : (
        <Link className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/poultry/batches/create">
          <Plus aria-hidden className="h-4 w-4" /> Create batch
        </Link>
      )}
      {editBatch && (
        <form onSubmit={saveEdit} className="mb-4 grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 shadow-panel sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-700">Edit batch — {editBatch.code}</p>
            <button type="button" onClick={() => setEditBatch(null)}><X className="h-4 w-4 text-amber-600" /></button>
          </div>
          <FormField label="Name"><input className={inputClass} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></FormField>
          <FormField label="Code"><input className={inputClass} value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></FormField>
          <FormField label="Bird type">
            <select className={inputClass} value={editForm.birdType} onChange={(e) => setEditForm({ ...editForm, birdType: e.target.value })}>
              {["LAYERS", "BROILERS", "COCKERELS", "BREEDERS", "CHICKS"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Expected close"><input className={inputClass} type="date" value={editForm.expectedCloseDate} onChange={(e) => setEditForm({ ...editForm, expectedCloseDate: e.target.value })} /></FormField>
          <FormField label="Notes"><input className={inputClass + " md:col-span-4"} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></FormField>
          <div className="md:col-span-4 flex gap-2">
            <button type="submit" className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white">Save changes</button>
            <button type="button" className="min-h-11 rounded-md border border-line px-4 text-sm" onClick={() => setEditBatch(null)}>Cancel</button>
          </div>
        </form>
      )}
      <BatchTable rows={rows} loading={loading} onEdit={startEdit} onDelete={deleteBatch} />
    </PoultryShell>
  );
}

function FlockBatchForm({ options, onSaved }: { options: PoultryOptions; onSaved: () => void }) {
  const router = useRouter();
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
      setError("");
      router.push("/poultry/batches");
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
        {pensByHouse.length === 0 && (
          <p className="text-sm text-ink/65">
            No pens available. <Link className="font-semibold text-brand hover:underline" href="/poultry/houses/create">Create a poultry house first →</Link>
          </p>
        )}
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

function BatchTable({ rows, loading, onEdit, onDelete }: { rows: BatchRow[]; loading?: boolean; onEdit?: (row: BatchRow) => void; onDelete?: (row: BatchRow) => void }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
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
        { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
        {
          key: "_actions", label: "",
          render: (row) => (
            <div className="flex gap-1">
              {onEdit && <button type="button" title="Edit batch" onClick={() => onEdit(row)} className="rounded p-1 text-ink/40 hover:bg-brand/10 hover:text-brand"><Pencil className="h-3.5 w-3.5" /></button>}
              {onDelete && <button type="button" title="Delete batch" onClick={() => onDelete(row)} className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          )
        }
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
  poultryTransferRecords?: Array<{ id: string; birdCount: number; transferDate: string; toPenId: string | null; toPoultryHouseId: string; toPoultryHouse?: { name: string; code: string } | null; toPen?: { code: string; name?: string } | null }>;
  metrics?: { currentLiveBirds: number; mortalityRate: number; eggProductionPercent: number; feedConversionRatio: number; costPerBird: number; profitability: number };
};

export function FlockBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const { options } = usePoultryOptions();
  const [batch, setBatch] = useState<BatchDetail | null>(() => getCachedFirst<ApiEnvelope<BatchDetail>>(`/poultry/batches/${params?.id}`)?.data ?? null);
  const [batchError, setBatchError] = useState("");
  const [tab, setTab] = useState<"overview" | "pens" | "records">("overview");
  const [statusForm, setStatusForm] = useState({ status: "", notes: "" });
  const [statusMsg, setStatusMsg] = useState("");
  const [pendingPens, setPendingPens] = useState<Record<string, string>>({});
  const [pendingErr, setPendingErr] = useState<Record<string, string>>({});

  function reloadBatch() {
    if (!params?.id) { setBatchError("Batch ID is missing. Please go back and try again."); return; }
    setBatchError("");
    apiFetch<ApiEnvelope<BatchDetail>>(`/poultry/batches/${params.id}`)
      .then((response) => {
        if (response?.data) setBatch(response.data);
        else setBatchError("Batch data not found. Please go back and try again.");
      })
      .catch((err: any) => setBatchError(err?.message ?? "Failed to load batch. Please refresh."));
  }

  useEffect(() => { reloadBatch(); }, [params?.id]);

  async function assignPen(transferId: string) {
    const penId = pendingPens[transferId];
    if (!penId) return;
    try {
      await apiFetch(`/poultry/transfers/${transferId}/allocate-pen`, { method: "PATCH", body: JSON.stringify({ penId }) });
      setPendingPens((p) => { const n = { ...p }; delete n[transferId]; return n; });
      setPendingErr((p) => { const n = { ...p }; delete n[transferId]; return n; });
      reloadBatch();
    } catch (err: any) {
      setPendingErr((p) => ({ ...p, [transferId]: err?.message ?? "Failed to assign pen." }));
    }
  }

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
      <PageHeader title={batch?.name ?? "Flock Batch"} subtitle={batch ? `${batch.code} · ${batch.birdType} · ${batch.farm?.name ?? ""}` : batchError ? "Failed to load" : "Loading…"} />
      {batchError && !batch && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">{batchError}</p>
          <button className="mt-2 rounded-md bg-red-100 px-3 py-1.5 text-xs font-semibold hover:bg-red-200" onClick={reloadBatch}>Retry</button>
        </div>
      )}
      {!batch && !batchError && (
        <div className="flex flex-col items-center justify-center py-20 text-ink/50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand mb-4" />
          <p className="text-sm">Loading batch data…</p>
        </div>
      )}
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
            <div className="space-y-4">
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

              {(batch.poultryTransferRecords ?? []).filter((t) => !t.toPenId).length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-panel">
                  <h3 className="mb-1 font-semibold text-amber-800">Pending Pen Assignments</h3>
                  <p className="mb-3 text-xs text-amber-700">These transfers arrived at a house without a specific pen. Assign a pen to complete the allocation.</p>
                  <div className="space-y-3">
                    {(batch.poultryTransferRecords ?? []).filter((t) => !t.toPenId).map((t) => {
                      const housePens = options.pens.filter((p) => p.poultryHouseId === t.toPoultryHouseId);
                      return (
                        <div key={t.id} className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-white p-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{t.toPoultryHouse?.name ?? t.toPoultryHouseId}</p>
                            <p className="text-xs text-ink/60">{t.birdCount.toLocaleString()} birds · {t.transferDate?.slice(0, 10)}</p>
                            {pendingErr[t.id] && <p className="mt-1 text-xs text-red-600">{pendingErr[t.id]}</p>}
                          </div>
                          <select
                            className={inputClass + " text-sm"}
                            value={pendingPens[t.id] ?? ""}
                            onChange={(e) => setPendingPens((p) => ({ ...p, [t.id]: e.target.value }))}
                          >
                            <option value="">Select pen…</option>
                            {housePens.map((p) => <option key={p.id} value={p.id}>{p.code}{p.name ? ` — ${p.name}` : ""}</option>)}
                          </select>
                          <button
                            onClick={() => assignPen(t.id)}
                            disabled={!pendingPens[t.id]}
                            className="min-h-9 rounded-md bg-brand px-3 text-sm font-semibold text-white disabled:opacity-40"
                          >
                            Assign
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "records" && batch && (
            <BatchRecordsTab batchId={batch.id} options={options} />
          )}
        </>
      )}
    </PoultryShell>
  );
}

// ─── Batch Records Tab ────────────────────────────────────────────────────────

const BATCH_RECORD_TYPES: Array<{ type: string; label: string; cols: string[]; endpoint: string }> = [
  { type: "daily",        label: "Daily Records",      cols: ["recordDate", "openingBirdCount", "notes"],                                     endpoint: "/poultry/daily" },
  { type: "mortality",    label: "Mortality",          cols: ["recordDate", "birdCount", "reason"],                                           endpoint: "/poultry/mortality" },
  { type: "feed",         label: "Feed Consumption",   cols: ["recordDate", "quantityKg", "costAmount"],                                      endpoint: "/poultry/feed" },
  { type: "eggs",         label: "Egg Production",     cols: ["recordDate", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs"], endpoint: "/poultry/eggs" },
  { type: "weights",      label: "Bird Weights",       cols: ["recordDate", "sampleSize", "averageWeightKg"],                                 endpoint: "/poultry/weights" },
  { type: "medications",  label: "Medications",        cols: ["startDate", "medicationName", "dosage", "route"],                              endpoint: "/poultry/medications" },
  { type: "vaccinations", label: "Vaccinations",       cols: ["vaccinationDate", "vaccineName", "dose"],                                      endpoint: "/poultry/vaccinations" },
  { type: "health",       label: "Health Observations",cols: ["observationDate", "severity", "observation"],                                  endpoint: "/poultry/health" },
  { type: "costs",        label: "Costs",              cols: ["costDate", "costType", "amount", "description"],                               endpoint: "/poultry/costs" },
];

function BatchRecordSection({ batchId, type, label, cols, endpoint, options }: { batchId: string; type: string; label: string; cols: string[]; endpoint: string; options: PoultryOptions }) {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess ?? false;
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [editRow, setEditRow] = useState<Record<string, any> | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editMsg, setEditMsg] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch<{ data: Record<string, any>[]; meta: any }>(`/poultry/records/${type}?flockBatchId=${batchId}&take=200`);
      if (Array.isArray(res.data)) setRows(res.data);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load records.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open && rows.length === 0) load();
    setOpen((o) => !o);
  }

  function openAdd() {
    const today = new Date().toISOString().slice(0, 10);
    const defaults: Record<string, string> = { recordDate: today, startDate: today, vaccinationDate: today, observationDate: today, costDate: today };
    for (const f of recordFields(type)) {
      if (f.defaultValue !== undefined) defaults[f.name] = String(f.defaultValue);
      else if (f.kind === "select" && f.options?.length) defaults[f.name] = f.options[0];
    }
    if (type === "feed") {
      defaults.feedProductId = options.products[0]?.id ?? "";
      defaults.warehouseId = options.warehouses[0]?.id ?? "";
    }
    setAddForm(defaults);
    setAddError("");
    setAddOpen(true);
    if (!open) { load(); setOpen(true); }
  }

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setAddLoading(true);
    setAddError("");
    try {
      const payload = buildRecordPayload(type, { ...addForm, flockBatchId: batchId }, options);
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setAddOpen(false);
      setAddForm({});
      await load();
    } catch (err: any) {
      setAddError(err?.message ?? "Failed to save record.");
    } finally {
      setAddLoading(false);
    }
  }

  function startEdit(row: Record<string, any>) {
    const form: Record<string, string> = {};
    for (const col of cols) form[col] = String(row[col] ?? "");
    setEditForm(form);
    setEditRow(row);
    setEditMsg("");
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editRow) return;
    setEditMsg("");
    try {
      const payload: Record<string, any> = {};
      const numericCols = ["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "birdCount", "quantityKg", "costAmount", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "sampleSize", "averageWeightKg"];
      for (const [k, v] of Object.entries(editForm)) {
        if (cols.includes(k) && !["recordDate", "startDate", "vaccinationDate", "observationDate"].includes(k)) {
          payload[k] = numericCols.includes(k) ? Number(v) : v;
        }
      }
      await apiFetch(`/poultry/records/${type}/${editRow.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to save correction.");
    }
  }

  async function deleteRow(row: Record<string, any>) {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    setEditMsg("");
    try {
      await apiFetch(`/poultry/records/${type}/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete record.");
    }
  }

  const editableCols = cols.filter((c) => !["recordDate", "startDate", "vaccinationDate", "observationDate"].includes(c));

  return (
    <div className="rounded-md border border-line bg-white shadow-panel">
      <div className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold" onClick={toggle}>
        <span>{label} {rows.length > 0 && open && <span className="ml-1 text-xs font-normal text-ink/50">({rows.length})</span>}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); openAdd(); }} className="flex items-center gap-1 rounded border border-line bg-white px-2 py-0.5 text-xs font-semibold hover:bg-field">
            <Plus className="h-3 w-3" /> Add
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-ink/40" /> : <ChevronDown className="h-4 w-4 text-ink/40" />}
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4">
          {addOpen && (
            <form onSubmit={submitAdd} className="mb-4 rounded-md border border-green-200 bg-green-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-green-700">
                <Plus className="h-3 w-3" />Add {label}
                <button type="button" className="ml-auto" onClick={() => setAddOpen(false)}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {type === "feed" && (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Feed product</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.feedProductId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, feedProductId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Warehouse</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.warehouseId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {recordFields(type).map((f) => (
                  <div key={f.name}>
                    <label className="mb-0.5 block text-[10px] text-ink/60">{f.label}</label>
                    {f.kind === "select" ? (
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm[f.name] ?? f.defaultValue ?? ""} onChange={(e) => setAddForm((prev) => ({ ...prev, [f.name]: e.target.value }))}>
                        {f.options?.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="w-full rounded border border-line bg-white px-2 py-1 text-xs" type={f.kind} value={addForm[f.name] ?? f.defaultValue ?? ""} onChange={(e) => setAddForm((prev) => ({ ...prev, [f.name]: e.target.value }))} required={f.required} />
                    )}
                  </div>
                ))}
              </div>
              {addError && <p className="mt-2 text-xs text-red-600">{addError}</p>}
              <button type="submit" disabled={addLoading} className="mt-2 rounded bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                {addLoading ? "Saving…" : "Save record"}
              </button>
            </form>
          )}
          {loading && <p className="text-xs text-ink/50">Loading…</p>}
          {!loading && loadError && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <span>{loadError}</span>
              <button type="button" className="shrink-0 rounded border border-red-300 bg-white px-2 py-0.5 font-semibold hover:bg-red-100" onClick={load}>Retry</button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && !addOpen && <p className="text-xs text-ink/50">No records yet.</p>}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-field">
                  <tr>
                    {cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold text-ink/60 uppercase text-[10px]">{c.replace(/([A-Z])/g, " $1")}</th>)}
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-line">
                      {cols.map((c) => <td key={c} className="px-2 py-1.5">{formatCell(c, row[c])}</td>)}
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button type="button" title="Correct record" onClick={() => startEdit(row)} className="rounded p-1 text-ink/40 hover:bg-brand/10 hover:text-brand">
                            <Pencil className="h-3 w-3" />
                          </button>
                          {canManage && (
                            <button type="button" title="Delete record" onClick={() => deleteRow(row)} className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editRow && (
            <form onSubmit={saveEdit} className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-700">
                <Pencil className="h-3 w-3" />Correct record
                <button type="button" className="ml-auto" onClick={() => setEditRow(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {editableCols.map((col) => (
                  <div key={col}>
                    <label className="mb-0.5 block text-[10px] text-ink/60">{col.replace(/([A-Z])/g, " $1")}</label>
                    <input className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={editForm[col] ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, [col]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {editMsg && <p className="mt-2 text-xs text-red-600">{editMsg}</p>}
              <button type="submit" className="mt-2 rounded bg-brand px-3 py-1 text-xs font-semibold text-white">Save correction</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function BatchRecordsTab({ batchId, options }: { batchId: string; options: PoultryOptions }) {
  return (
    <div className="space-y-3">
      {BATCH_RECORD_TYPES.map(({ type, label, cols, endpoint }) => (
        <BatchRecordSection key={type} batchId={batchId} type={type} label={label} cols={cols} endpoint={endpoint} options={options} />
      ))}
    </div>
  );
}

// ─── Records ──────────────────────────────────────────────────────────────────

function makeFormDefaults(type: string): Record<string, string> {
  const base: Record<string, string> = { flockBatchId: "", poultryHouseId: "", penId: "", recordDate: new Date().toISOString().slice(0, 10) };
  for (const field of recordFields(type)) {
    if (field.defaultValue !== undefined) {
      base[field.name] = field.defaultValue;
    } else if (field.kind === "select" && field.options?.length) {
      base[field.name] = field.options[0];
    }
  }
  return base;
}

export function PoultryRecordPage({ title, type, endpoint, health = false }: { title: string; type: string; endpoint: string; health?: boolean }) {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess ?? false;
  const { options, optionsError, refreshOptions } = usePoultryOptions();
  const recordCacheKey = `jokas_records_${type}`;
  const [rows, setRows] = useState<Record<string, any>[]>(() => {
    const ep = `/poultry/records/${type}?take=200`;
    const cached = getCachedFirst<{ data: Record<string, any>[] }>(ep);
    if (Array.isArray(cached?.data) && cached.data.length > 0) return cached.data;
    try {
      const stored = JSON.parse(sessionStorage.getItem(recordCacheKey) ?? "null");
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch { /* noop */ }
    return [];
  });
  const [form, setForm] = useState<Record<string, string>>(() => makeFormDefaults(type));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const recordLoadingRef = useRef(false);

  async function load() {
    const response = await apiFetch<{ data: Record<string, any>[]; meta?: any }>(`/poultry/records/${type}?take=200`);
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows(data);
    if (data.length > 0) {
      try { sessionStorage.setItem(recordCacheKey, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadRecords() {
    if (recordLoadingRef.current) return;
    recordLoadingRef.current = true;
    load().catch(() => undefined).finally(() => { recordLoadingRef.current = false; });
  }

  useEffect(() => {
    loadRecords();
  }, [type]);

  function startEdit(row: Record<string, any>) {
    const pre: Record<string, string> = { flockBatchId: row.flockBatchId ?? "", penId: row.penId ?? "", poultryHouseId: "" };
    // Restore the house filter so the pen dropdown shows the right options when editing
    if (row.penId) {
      const pen = options.pens.find((p) => p.id === row.penId);
      if (pen) pre.poultryHouseId = pen.poultryHouseId;
    }
    for (const field of recordFields(type)) pre[field.name] = String(row[field.name] ?? field.defaultValue ?? "");
    setForm(pre);
    setEditingId(row.id);
    setSubmitError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(makeFormDefaults(type));
    setSubmitError("");
  }

  async function deleteRow(row: Record<string, any>) {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    setSubmitError("");
    try {
      await apiFetch(`/poultry/records/${type}/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to delete record.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    try {
      if (editingId) {
        const payload = buildRecordPayload(type, form, options);
        await apiFetch(`/poultry/records/${type}/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setEditingId(null);
      } else {
        await apiFetch(endpoint, { method: "POST", body: JSON.stringify(buildRecordPayload(type, form, options)) });
      }
      setForm(makeFormDefaults(type));
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to save record.");
    }
  }

  return (
    <PoultryShell>
      <PageHeader title={title} subtitle={health ? "Veterinary and health workflow entries for assigned farms." : "Operational record entry and history for assigned flock batches."} />
      {optionsError && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{optionsError}</span>
          <button className="ml-4 rounded border border-amber-400 px-3 py-1 text-xs font-semibold hover:bg-amber-100" onClick={refreshOptions}>Retry</button>
        </div>
      )}
      {options.batches.length === 0 && !optionsError && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No flock batches found. <Link className="font-semibold underline" href="/poultry/batches/create">Create a batch first →</Link>
        </div>
      )}
      {editingId && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Pencil className="h-4 w-4 shrink-0" />
          <span>Editing existing record — submit to save correction</span>
          <button type="button" className="ml-auto flex items-center gap-1 text-xs underline" onClick={cancelEdit}><X className="h-3 w-3" />Cancel</button>
        </div>
      )}
      {submitError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</p>}
      <GenericRecordForm options={options} form={form} setForm={setForm} submit={submit} type={type} isEditing={!!editingId} />
      <SimpleRecordTable rows={rows} onEdit={startEdit} onDelete={canManage ? deleteRow : undefined} />
    </PoultryShell>
  );
}

function GenericRecordForm({ options, form, setForm, submit, type, isEditing = false }: {
  options: PoultryOptions;
  form: Record<string, string>;
  setForm: (form: Record<string, string>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  type: string;
  isEditing?: boolean;
}) {
  const fields = recordFields(type);

  // Houses that actually have at least one pen
  const housesWithPens = useMemo(() => {
    const houseIds = new Set(options.pens.map((p) => p.poultryHouseId));
    return options.houses.filter((h) => houseIds.has(h.id));
  }, [options.houses, options.pens]);

  // Pens filtered to the selected house — empty until a house is chosen
  const pensInHouse = useMemo(() => {
    if (!form.poultryHouseId) return [];
    return options.pens.filter((p) => p.poultryHouseId === form.poultryHouseId);
  }, [options.pens, form.poultryHouseId]);

  return (
    <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-4">
      <FormField label="Flock batch">
        <select
          className={`${inputClass} ${options.batches.length === 0 ? "border-amber-400 bg-amber-50" : ""}`}
          value={form.flockBatchId || options.batches[0]?.id || ""}
          onChange={(e) => setForm({ ...form, flockBatchId: e.target.value, poultryHouseId: "", penId: "" })}
          required
        >
          {options.batches.length === 0
            ? <option value="">— No batches found — create one first —</option>
            : options.batches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)
          }
        </select>
      </FormField>

      <FormField label="House">
        <select
          className={inputClass}
          value={form.poultryHouseId}
          onChange={(e) => setForm({ ...form, poultryHouseId: e.target.value, penId: "" })}
        >
          <option value="">— select a house —</option>
          {housesWithPens.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
        </select>
      </FormField>

      <FormField label="Pen (optional)">
        <select
          className={inputClass}
          value={form.penId}
          onChange={(e) => setForm({ ...form, penId: e.target.value })}
          disabled={!form.poultryHouseId}
        >
          <option value="">{form.poultryHouseId ? "— all pens in house —" : "— select a house first —"}</option>
          {pensInHouse.map((pen) => <option key={pen.id} value={pen.id}>{pen.code}{pen.name ? ` — ${pen.name}` : ""}{pen.capacity ? ` (cap ${pen.capacity})` : ""}</option>)}
        </select>
      </FormField>

      {type === "feed" && (
        <>
          <FormField label="Feed product">
            <select className={inputClass} value={form.feedProductId ?? ""} onChange={(e) => setForm({ ...form, feedProductId: e.target.value })}>
              <option value="">— select product —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Warehouse">
            <select className={inputClass} value={form.warehouseId ?? ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">— select warehouse —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
        </>
      )}

      {fields.map((field) => (
        <FormField key={field.name} label={field.label}>
          {field.kind === "select" ? (
            <select className={inputClass} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}>
              {field.options?.map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : (
            <input className={inputClass} type={field.kind} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} required={field.required} />
          )}
        </FormField>
      ))}

      <button className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white md:col-span-4 ${isEditing ? "bg-amber-600" : "bg-brand"}`}>
        {isEditing ? "Save correction" : "Submit record"}
      </button>
    </form>
  );
}

function recordFields(type: string) {
  const date = { name: "recordDate", label: "Record date", kind: "date", required: true };
  const map: Record<string, Array<{ name: string; label: string; kind: string; required?: boolean; defaultValue?: string; options?: string[] }>> = {
    daily: [date, { name: "openingBirdCount", label: "Opening birds", kind: "number", defaultValue: "0" }, { name: "notes", label: "Notes", kind: "text" }],
    mortality: [date, { name: "birdCount", label: "Bird count", kind: "number", required: true }, { name: "reason", label: "Reason", kind: "text" }],
    feed: [date, { name: "bags", label: "Bags (50 kg each)", kind: "number", required: true }, { name: "costAmount", label: "Cost (GHS)", kind: "number" }],
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
  const merged: Record<string, string> = makeFormDefaults(type);
  Object.assign(merged, form);

  const payload: Record<string, string | number | boolean | undefined> = {
    ...merged,
    flockBatchId: merged.flockBatchId || options.batches[0]?.id,
    penId: merged.penId || undefined,
    poultryHouseId: undefined
  };
  const numericKeys = ["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "birdCount", "quantityKg", "costAmount", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "sampleSize", "averageWeightKg", "amount", "openingBirdCount"];
  for (const key of Object.keys(payload)) {
    if (numericKeys.includes(key)) {
      payload[key] = Number(payload[key] || 0);
    }
  }
  if (type === "mortality") payload.isCulling = false;

  // Strip recordDate for record types that use a different date field name
  const hasRecordDate = recordFields(type).some((f) => f.name === "recordDate");
  if (!hasRecordDate) payload.recordDate = undefined;

  // Feed: convert bags input → quantityKg (1 bag = 50 kg), wire warehouse and product
  if (type === "feed") {
    payload.quantityKg = Number(merged.bags || 0) * 50;
    payload.bags = undefined;
    payload.feedProductId = merged.feedProductId || undefined;
    payload.warehouseId = merged.warehouseId || undefined;
  }

  return payload;
}

function SimpleRecordTable({ rows, onEdit, onDelete }: { rows: Record<string, any>[]; onEdit?: (row: Record<string, any>) => void; onDelete?: (row: Record<string, any>) => void }) {
  const allowedKeys = new Set([
    "recordDate", "startDate", "costDate", "vaccinationDate", "observationDate", "transferDate",
    "mortalityCount", "culledCount", "feedConsumedKg", "totalEggs",
    "birdCount", "quantityKg", "costAmount",
    "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs",
    "sampleSize", "averageWeightKg",
    "medicationName", "vaccineName", "severity", "observation", "amount", "costType",
    "status"
  ]);
  const keys = Object.keys(rows?.[0] ?? {}).filter((key) => allowedKeys.has(key));
  const columns = [
    ...keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, any>) => formatCell(key, row[key], 80) })),
    ...((onEdit || onDelete) ? [{ key: "_actions", label: "", render: (row: Record<string, any>) => (
      <div className="flex gap-1">
        {onEdit && (
          <button type="button" title="Correct record" onClick={() => onEdit(row)} className="rounded p-1 text-ink/40 hover:bg-brand/10 hover:text-brand">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button type="button" title="Delete record" onClick={() => onDelete(row)} className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    ) }] : [])
  ];
  return <DataTable rows={rows} empty="No records found" columns={columns} />;
}

// ─── Transfers ────────────────────────────────────────────────────────────────

const TRANSFER_STATUSES = ["PENDING", "APPROVED", "COMPLETED", "CANCELLED"] as const;
const TRANSFERS_CACHE = "jokas_poultry_transfers";

type PenSelection = { penId: string; code: string; name?: string; selected: boolean; birdCount: string };

export function PoultryTransferPage() {
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess ?? false;
  const { options, refreshOptions } = usePoultryOptions();
  const [rows, setRows] = useState<Record<string, any>[]>(() => {
    const cached = getCachedFirst<ApiEnvelope<Record<string, any>[]>>("/poultry/records/transfers");
    if (Array.isArray(cached?.data) && cached.data.length > 0) return cached.data;
    try {
      const stored = JSON.parse(sessionStorage.getItem(TRANSFERS_CACHE) ?? "null");
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch { /* noop */ }
    return [];
  });
  const [form, setForm] = useState({ flockBatchId: "", fromHouseId: "", toFarmId: "", toPoultryHouseId: "", toPenId: "", birdCount: "", transferDate: new Date().toISOString().slice(0, 10), reason: "" });
  const [penSelections, setPenSelections] = useState<PenSelection[]>([]);
  const [submitError, setSubmitError] = useState("");
  const [editRow, setEditRow] = useState<Record<string, any> | null>(null);
  const [editForm, setEditForm] = useState({ birdCount: "", reason: "", status: "" });
  const [editMsg, setEditMsg] = useState("");

  const fromHouses = useMemo(() => {
    const houseIds = new Set(options.pens.map((p) => p.poultryHouseId));
    return options.houses.filter((h) => houseIds.has(h.id));
  }, [options.houses, options.pens]);
  const toHouses = useMemo(() => options.houses.filter((h) => !form.toFarmId || h.farmId === form.toFarmId), [options.houses, form.toFarmId]);
  const effectiveToHouseId = form.toPoultryHouseId || toHouses[0]?.id || "";
  const toPens = useMemo(() => options.pens.filter((p) => !effectiveToHouseId || p.poultryHouseId === effectiveToHouseId), [options.pens, effectiveToHouseId]);

  const selectedPens = penSelections.filter((p) => p.selected);
  const anyPenSelected = selectedPens.length > 0;

  function onFromHouseChange(houseId: string) {
    const pens = options.pens
      .filter((p) => p.poultryHouseId === houseId)
      .map((p) => ({ penId: p.id, code: p.code, name: p.name, selected: false, birdCount: "" }));
    setForm((f) => ({ ...f, fromHouseId: houseId }));
    setPenSelections(pens);
  }

  function togglePen(i: number, checked: boolean) {
    setPenSelections((prev) => prev.map((p, idx) => idx === i ? { ...p, selected: checked } : p));
  }

  function setPenBirdCount(i: number, val: string) {
    setPenSelections((prev) => prev.map((p, idx) => idx === i ? { ...p, birdCount: val } : p));
  }

  const transferLoadingRef = useRef(false);

  async function load() {
    const response = await apiFetch<ApiEnvelope<Record<string, any>[]>>("/poultry/records/transfers");
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows(data);
    if (data.length > 0) {
      try { sessionStorage.setItem(TRANSFERS_CACHE, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadTransfers() {
    if (transferLoadingRef.current) return;
    transferLoadingRef.current = true;
    load().catch(() => undefined).finally(() => { transferLoadingRef.current = false; });
  }

  useEffect(() => { loadTransfers(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    const base = {
      flockBatchId: form.flockBatchId || options.batches[0]?.id,
      fromPoultryHouseId: form.fromHouseId || undefined,
      toFarmId: form.toFarmId || options.farms[0]?.id,
      toPoultryHouseId: effectiveToHouseId,
      toPenId: form.toPenId || undefined,
      transferDate: form.transferDate,
      reason: form.reason || undefined
    };
    try {
      if (anyPenSelected) {
        for (const p of selectedPens) {
          await apiFetch("/poultry/transfers", { method: "POST", body: JSON.stringify({ ...base, fromPenId: p.penId, birdCount: Number(p.birdCount) }) });
        }
      } else {
        await apiFetch("/poultry/transfers", { method: "POST", body: JSON.stringify({ ...base, birdCount: Number(form.birdCount) }) });
      }
      setForm({ flockBatchId: "", fromHouseId: "", toFarmId: "", toPoultryHouseId: "", toPenId: "", birdCount: "", transferDate: new Date().toISOString().slice(0, 10), reason: "" });
      setPenSelections([]);
      refreshOptions();
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to create transfer.");
    }
  }

  function startEdit(row: Record<string, any>) {
    setEditForm({ birdCount: String(row.birdCount ?? ""), reason: row.reason ?? "", status: row.status ?? "PENDING" });
    setEditRow(row);
    setEditMsg("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRow) return;
    setEditMsg("");
    try {
      await apiFetch(`/poultry/records/transfers/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ birdCount: Number(editForm.birdCount), reason: editForm.reason || undefined })
      });
      if (editForm.status !== editRow.status) {
        await apiFetch(`/poultry/transfers/${editRow.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: editForm.status })
        });
      }
      setEditRow(null);
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to save changes.");
    }
  }

  async function deleteRow(row: Record<string, any>) {
    if (!confirm("Delete this transfer? This cannot be undone.")) return;
    setEditMsg("");
    try {
      await apiFetch(`/poultry/records/transfers/${row.id}`, { method: "DELETE" });
      if (editRow?.id === row.id) setEditRow(null);
      await load();
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete transfer.");
    }
  }

  return (
    <PoultryShell>
      <PageHeader title="Poultry Transfers" subtitle="Move birds between pens, houses, or farms with full transfer audit tracking." />
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <FormField label="Batch">
          <select className={inputClass} value={form.flockBatchId || options.batches[0]?.id || ""} onChange={(e) => { setForm({ ...form, flockBatchId: e.target.value, fromHouseId: "" }); setPenSelections([]); }}>
            {options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} — {batch.name}</option>)}
          </select>
        </FormField>
        <FormField label="From house (optional)">
          <select className={inputClass} value={form.fromHouseId} onChange={(e) => onFromHouseChange(e.target.value)}>
            <option value="">— any house —</option>
            {fromHouses.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
          </select>
        </FormField>

        {/* Multi-pen selector — expands below when a house is picked */}
        {form.fromHouseId && penSelections.length > 0 && (
          <div className="md:col-span-3">
            <p className="mb-2 text-sm font-medium">From pens <span className="font-normal text-ink/50 text-xs">— check pens to transfer from, enter birds per pen; leave all unchecked to transfer from the whole house</span></p>
            <div className="grid gap-2 rounded-md border border-line bg-field p-3 sm:grid-cols-2 lg:grid-cols-3">
              {penSelections.map((pen, i) => (
                <div key={pen.penId} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
                  <input type="checkbox" id={`fpen-${pen.penId}`} checked={pen.selected} onChange={(e) => togglePen(i, e.target.checked)} className="h-4 w-4 accent-brand shrink-0" />
                  <label htmlFor={`fpen-${pen.penId}`} className="flex-1 truncate text-sm">{pen.code}{pen.name ? ` — ${pen.name}` : ""}</label>
                  {pen.selected && (
                    <input type="number" min="1" placeholder="Birds" value={pen.birdCount} onChange={(e) => setPenBirdCount(i, e.target.value)} className="w-20 rounded border border-line px-2 py-1 text-sm" required />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <FormField label="To farm">
          <select className={inputClass} value={form.toFarmId || options.farms[0]?.id || ""} onChange={(e) => setForm({ ...form, toFarmId: e.target.value, toPoultryHouseId: "", toPenId: "" })}>
            {options.farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.code} - {farm.name}</option>)}
          </select>
        </FormField>
        <FormField label="To house">
          <select className={inputClass} value={effectiveToHouseId} onChange={(e) => setForm({ ...form, toPoultryHouseId: e.target.value, toPenId: "" })}>
            {toHouses.map((house) => <option key={house.id} value={house.id}>{house.code} - {house.name}</option>)}
          </select>
        </FormField>
        <FormField label="To pen (optional)">
          <select className={inputClass} value={form.toPenId} onChange={(e) => setForm({ ...form, toPenId: e.target.value })}>
            <option value="">— any pen —</option>
            {toPens.map((pen) => <option key={pen.id} value={pen.id}>{pen.code}</option>)}
          </select>
        </FormField>
        {!anyPenSelected && (
          <FormField label="Bird count">
            <input className={inputClass} type="number" min="1" value={form.birdCount} onChange={(e) => setForm({ ...form, birdCount: e.target.value })} required />
          </FormField>
        )}
        <FormField label="Transfer date">
          <input className={inputClass} type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} required />
        </FormField>
        <FormField label="Reason">
          <input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </FormField>
        {submitError && <p className="text-sm text-red-600 md:col-span-3">{submitError}</p>}
        <button className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white md:col-span-3">
          {anyPenSelected ? `Create ${selectedPens.length} transfer${selectedPens.length > 1 ? "s" : ""}` : "Create transfer"}
        </button>
      </form>
      <SimpleRecordTable
        rows={rows}
        onEdit={canManage ? startEdit : undefined}
        onDelete={canManage ? deleteRow : undefined}
      />
      {editRow && (
        <form onSubmit={saveEdit} className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 shadow-panel">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
            <Pencil className="h-4 w-4" />
            <span>Edit transfer</span>
            <button type="button" className="ml-auto" onClick={() => setEditRow(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Bird count">
              <input className={inputClass} type="number" min="1" value={editForm.birdCount} onChange={(e) => setEditForm((f) => ({ ...f, birdCount: e.target.value }))} required />
            </FormField>
            <FormField label="Reason">
              <input className={inputClass} value={editForm.reason} onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))} />
            </FormField>
            <FormField label="Status">
              <select className={inputClass} value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                {TRANSFER_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
          </div>
          {editMsg && <p className="mt-2 text-sm text-red-600">{editMsg}</p>}
          <button type="submit" className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Save changes</button>
        </form>
      )}
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
