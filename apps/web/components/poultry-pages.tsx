"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Download, Home, Pencil, Plus, Trash2, X } from "lucide-react";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch, downloadReport, getCached, getCachedFirst, hasCached } from "../lib/api";
import { formatCell } from "../lib/format";
import { useAuth } from "./auth-context";
import { ConfirmModal, EmptyState, StatusBadge } from "./ui";

// Eggs are physically collected and counted in crates on the farm, not
// individual pieces — 1 crate = 30 eggs. Mirrors the mobile Egg Collection
// screen's own constant.
const EGGS_PER_CRATE = 30;

// totalEggs/goodEggs (and the other egg quality-grade counts) are always
// raw piece counts, never crates — spelled out on both record tables since
// that's where historical data actually gets reviewed, not just on the
// add-record forms.
const EGG_PIECE_COLUMN_LABELS: Record<string, string> = {
  totalEggs: "Total Eggs (pieces)", goodEggs: "Good (pieces)", crackedEggs: "Cracked (pieces)",
  dirtyEggs: "Dirty (pieces)", brokenEggs: "Broken (pieces)", rejectedEggs: "Rejected (pieces)"
};

type Option = {
  id: string;
  code?: string;
  sku?: string;
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
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsKey, setOptionsKey] = useState(0);
  // When true, the next fetch accepts an empty result even if we have existing data.
  // Only set by explicit user-triggered refreshOptions() so normal navigation and
  // api:recovered re-fetches never overwrite good cached data with a transient empty response.
  const forceAccept = useRef(false);

  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    setOptionsError("");
    setOptionsLoading(true);
    apiFetch<ApiEnvelope<PoultryOptions>>("/poultry/options")
      .then((response) => {
        const fresh = response.data ?? { farms: [], houses: [], pens: [], batches: [], warehouses: [], products: [] };
        setOptions((prev) =>
          // Guard: if the server returned empty batches but we already have batches in
          // state, keep the existing data unless the user explicitly triggered a refresh.
          // This prevents the "appears then goes" flash caused by a stale server-side
          // LookupCache entry (from a cold-start DB warmup) overwriting good cached data.
          !force && fresh.batches.length === 0 && prev.batches.length > 0 ? prev : fresh
        );
      })
      .catch((err) => setOptionsError(err?.message ?? "Failed to load dropdown options. Refresh the page."))
      .finally(() => setOptionsLoading(false));
  }, [optionsKey]);

  // On API recovery, re-fetch options so stale dropdowns self-heal.
  useEffect(() => {
    function onRecovered() { setOptionsKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);

  // Explicit user-triggered refresh: force-accept the server response even if empty.
  const refreshOptions = () => { forceAccept.current = true; setOptionsKey((k) => k + 1); };
  return { options, optionsError, optionsLoading, refreshOptions };
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
  const selectedFarmId = farmId || options.farms[0]?.id || "";
  const [overview, setOverview] = useState<Record<string, number> | null>(() =>
    selectedFarmId ? getCachedFirst<ApiEnvelope<Record<string, number>>>(`/poultry/farms/${selectedFarmId}/overview`)?.data ?? null : null
  );
  const [loadError, setLoadError] = useState("");

  function loadOverview() {
    if (!selectedFarmId) return;
    setLoadError("");
    apiFetch<ApiEnvelope<Record<string, number>>>(`/poultry/farms/${selectedFarmId}/overview`)
      .then((response) => setOverview(response.data))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load overview."));
  }

  useEffect(() => { loadOverview(); }, [selectedFarmId]);

  // Same "disappearing content" self-heal every other data page in this
  // file already has — see app-shell.tsx's onApiUnavailable comment.
  useEffect(() => {
    function onRecovered() { if (!overview) loadOverview(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [overview, selectedFarmId]);

  return (
    <>
      <PageHeader title="Farm Poultry Overview" subtitle="Farm-level poultry operating totals for assigned farms." />
      {loadError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</p>}
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
    </>
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
  const [confirmHouse, setConfirmHouse] = useState<HouseRow | null>(null);
  const [confirmingHouse, setConfirmingHouse] = useState(false);
  const [confirmPen, setConfirmPen] = useState<PenOption | null>(null);
  const [confirmingPen, setConfirmingPen] = useState(false);
  const loadingRef = useRef(false);

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<HouseRow[]>>("/poultry/houses");
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows((prev) => data.length === 0 && prev.length > 0 ? prev : data);
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
        // Empty means "clear the cap" here (an edit form reflects the
        // current state of the field), so it must send null, not undefined
        // — undefined tells the backend "leave capacity as it was."
        body: JSON.stringify({ name: editHouseForm.name || undefined, code: editHouseForm.code || undefined, capacity: editHouseForm.capacity ? Number(editHouseForm.capacity) : null })
      });
      setEditHouse(null);
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to update house.");
    }
  }

  async function confirmDeleteHouse() {
    if (!confirmHouse) return;
    setConfirmingHouse(true);
    try {
      await apiFetch(`/poultry/houses/${confirmHouse.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((h) => h.id !== confirmHouse.id));
      load().catch(() => undefined);
      refreshOptions();
      setConfirmHouse(null);
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to delete house.");
    } finally {
      setConfirmingHouse(false);
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
        // See saveHouse's comment — empty means "clear the cap," so it
        // must send null, not undefined.
        body: JSON.stringify({ name: editPenForm.name || undefined, capacity: editPenForm.capacity ? Number(editPenForm.capacity) : null })
      });
      setEditPen(null);
      await load();
      refreshOptions();
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to update pen.");
    }
  }

  async function confirmDeletePen() {
    if (!confirmPen) return;
    setConfirmingPen(true);
    try {
      await apiFetch(`/poultry/pens/${confirmPen.id}`, { method: "DELETE" });
      await load();
      refreshOptions();
      setConfirmPen(null);
    } catch (err: any) {
      setSubmitMsg(err?.message ?? "Failed to delete pen.");
    } finally {
      setConfirmingPen(false);
    }
  }

  return (
    <>
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
          : !loading && rows.length === 0 && (
            <div className="rounded-md border border-line bg-white">
              <EmptyState
                icon={Home}
                title="No poultry houses found"
                action={<Link className="font-semibold text-brand hover:underline" href="/poultry/houses/create">Create one →</Link>}
              />
            </div>
          )
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
                  <button className="rounded border border-line p-1.5 text-ink/50 hover:border-red-400 hover:text-red-500" title="Delete house" onClick={() => setConfirmHouse(house)}>
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
                  <p className="mt-1 text-[11px] text-amber-700/70">Leave Capacity blank to remove the cap entirely.</p>
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
                          <button type="button" title="Delete pen" onClick={() => setConfirmPen(pen)} className="rounded p-0.5 text-ink/40 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {editPen && pens.some((p) => p.id === editPen.id) && (
                    <form onSubmit={savePen} className="mt-3 rounded border border-amber-200 bg-amber-50 p-2">
                      <div className="flex gap-2">
                        <span className="self-center text-xs font-semibold text-amber-700">{editPen.code}</span>
                        <input className={inputClass + " flex-1"} placeholder="Name (optional)" value={editPenForm.name} onChange={(e) => setEditPenForm({ ...editPenForm, name: e.target.value })} />
                        <input className={inputClass + " w-28"} type="number" placeholder="Capacity" value={editPenForm.capacity} onChange={(e) => setEditPenForm({ ...editPenForm, capacity: e.target.value })} />
                        <button type="submit" className="min-h-11 rounded-md bg-brand px-3 text-sm font-semibold text-white">Save</button>
                        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm" onClick={() => setEditPen(null)}>Cancel</button>
                      </div>
                      <p className="mt-1 text-[11px] text-amber-700/70">Leave Capacity blank to remove the cap entirely.</p>
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
      <ConfirmModal
        open={!!confirmHouse}
        onClose={() => setConfirmHouse(null)}
        onConfirm={confirmDeleteHouse}
        title="Delete house?"
        message={confirmHouse ? `Delete house "${confirmHouse.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingHouse}
      />
      <ConfirmModal
        open={!!confirmPen}
        onClose={() => setConfirmPen(null)}
        onConfirm={confirmDeletePen}
        title="Delete pen?"
        message={confirmPen ? `Delete pen "${confirmPen.code}"?` : ""}
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingPen}
      />
    </>
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
        <input name="name" className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </FormField>
      <FormField label="Code">
        <input name="code" className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
      </FormField>
      <FormField label="Capacity">
        <input name="capacity" className={inputClass} type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
      </FormField>
      <FormField label="Default pens (auto-created)">
        <input name="defaultPenCount" className={inputClass} type="number" min="1" max="20" value={form.defaultPenCount} onChange={(event) => setForm({ ...form, defaultPenCount: event.target.value })} />
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
  const [confirmBatch, setConfirmBatch] = useState<BatchRow | null>(null);
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const loadingRef = useRef(false);

  async function load() {
    setLoadError("");
    const response = await apiFetch<ApiEnvelope<BatchRow[]>>("/poultry/batches");
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows((prev) => data.length === 0 && prev.length > 0 ? prev : data);
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

  async function confirmDeleteBatch() {
    if (!confirmBatch) return;
    setConfirmingBatch(true);
    try {
      await apiFetch(`/poultry/batches/${confirmBatch.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((b) => b.id !== confirmBatch.id));
      load().catch(() => undefined);
      setConfirmBatch(null);
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete batch.");
    } finally {
      setConfirmingBatch(false);
    }
  }

  return (
    <>
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
      <BatchTable rows={rows} loading={loading} onEdit={startEdit} onDelete={setConfirmBatch} />
      <ConfirmModal
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={confirmDeleteBatch}
        title="Delete batch?"
        message={confirmBatch ? `Delete batch "${confirmBatch.name}"? This will remove the batch and all its records.` : ""}
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingBatch}
      />
    </>
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
  const [submitting, setSubmitting] = useState(false);

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
    if (submitting) return;
    setError("");
    if (openingCount === 0) { setError("Opening bird count must be greater than 0."); return; }
    if (allocations.length === 0) { setError("Select at least one pen to allocate birds."); return; }
    if (totalAllocated !== openingCount) { setError(`Allocated ${totalAllocated} birds but opening count is ${openingCount}. They must match.`); return; }
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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
          <input name="name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FormField>
        <FormField label="Code">
          <input name="code" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </FormField>
        <FormField label="Bird type">
          <select name="birdType" className={inputClass} value={form.birdType} onChange={(e) => setForm({ ...form, birdType: e.target.value })}>
            {["LAYERS", "BROILERS", "COCKERELS", "BREEDERS", "CHICKS"].map((type) => <option key={type}>{type}</option>)}
          </select>
        </FormField>
        <FormField label="Opening bird count">
          <input name="openingBirdCount" className={inputClass} type="number" min="1" value={form.openingBirdCount} onChange={(e) => setForm({ ...form, openingBirdCount: e.target.value })} required />
        </FormField>
        <FormField label="Start date">
          <input name="startDate" className={inputClass} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
        </FormField>
        <FormField label="Expected close date">
          <input name="expectedCloseDate" className={inputClass} type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
        </FormField>
        <div className="md:col-span-3">
          <FormField label="Notes">
            <input name="notes" className={inputClass + " w-full"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

      <button type="submit" disabled={submitting} className="min-h-11 rounded-md bg-brand px-6 text-sm font-semibold text-white disabled:opacity-60">
        {submitting ? "Creating…" : "Create flock batch"}
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

// ─── Batch Detail ─────────────────────────────────────────────────────────────

type BatchDetail = {
  id: string; code: string; name: string; birdType: string; status: string;
  openingBirdCount: number; startDate: string; expectedCloseDate?: string; notes?: string;
  farm?: { name: string }; poultryHouse?: { name: string } | null;
  penAllocations?: Array<{ birdCount: number; pen: { code: string; name?: string; poultryHouse?: { name: string } } }>;
  poultryTransferRecords?: Array<{ id: string; birdCount: number; transferDate: string; toPenId: string | null; toPoultryHouseId: string; status: string; toPoultryHouse?: { name: string; code: string } | null; toPen?: { code: string; name?: string } | null }>;
  metrics?: { currentLiveBirds: number; mortalityRate: number; eggProductionPercent: number; feedConversionRatio: number; costPerBird: number; profitability: number };
};

export function FlockBatchDetailsPage() {
  const params = useParams<{ id: string }>();
  const { options, optionsError } = usePoultryOptions();
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

  // Same "disappearing content" self-heal every other data page in this
  // file already has — see app-shell.tsx's onApiUnavailable comment.
  useEffect(() => {
    function onRecovered() { if (!batch) reloadBatch(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [batch]);

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
    <>
      <PageHeader title={batch?.name ?? "Flock Batch"} subtitle={batch ? `${batch.code} · ${batch.birdType} · ${batch.farm?.name ?? ""}` : batchError ? "Failed to load" : "Loading…"} />
      {optionsError && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{optionsError}</div>}
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
                    {(batch.status === "PLANNED" ? ["ACTIVE", "CULLED"] :
                      batch.status === "ACTIVE" ? ["TRANSFERRED", "CLOSED", "SOLD", "CULLED"] :
                      batch.status === "TRANSFERRED" ? ["CLOSED", "SOLD", "CULLED"] :
                      batch.status === "CLOSED" ? ["SOLD"] : []).map((s) => <option key={s}>{s}</option>)}
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

              {(batch.poultryTransferRecords ?? []).filter((t) => !t.toPenId && t.status !== "CANCELLED").length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-panel">
                  <h3 className="mb-1 font-semibold text-amber-800">Pending Pen Assignments</h3>
                  <p className="mb-3 text-xs text-amber-700">These transfers arrived at a house without a specific pen. Assign a pen to complete the allocation.</p>
                  <div className="space-y-3">
                    {(batch.poultryTransferRecords ?? []).filter((t) => !t.toPenId && t.status !== "CANCELLED").map((t) => {
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
    </>
  );
}

// ─── Batch Records Tab ────────────────────────────────────────────────────────

const BATCH_RECORD_TYPES: Array<{ type: string; label: string; cols: string[]; endpoint: string }> = [
  { type: "daily",        label: "Daily Records",      cols: ["recordDate", "openingBirdCount", "mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "notes"], endpoint: "/poultry/daily-records" },
  { type: "mortality",    label: "Mortality",          cols: ["recordDate", "birdCount", "reason"],                                           endpoint: "/poultry/mortality-records" },
  { type: "feed",         label: "Feed Consumption",   cols: ["recordDate", "quantityKg", "costAmount"],                                      endpoint: "/poultry/feed-consumption-records" },
  { type: "eggs",         label: "Egg Production",     cols: ["recordDate", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs"], endpoint: "/poultry/egg-production-records" },
  { type: "weights",      label: "Bird Weights",       cols: ["recordDate", "sampleSize", "averageWeightKg"],                                 endpoint: "/poultry/bird-weight-records" },
  { type: "medications",  label: "Medications",        cols: ["startDate", "medicationName", "dosage", "route"],                              endpoint: "/poultry/medication-records" },
  { type: "vaccinations", label: "Vaccinations",       cols: ["vaccinationDate", "vaccineName", "dose"],                                      endpoint: "/poultry/vaccination-records" },
  { type: "health",       label: "Health Observations",cols: ["observationDate", "severity", "observation"],                                  endpoint: "/poultry/health-observations" },
  { type: "costs",        label: "Costs",              cols: ["costDate", "costType", "amount", "description"],                               endpoint: "/poultry/costs" },
];

function BatchRecordSection({ batchId, type, label, cols, endpoint, options }: { batchId: string; type: string; label: string; cols: string[]; endpoint: string; options: PoultryOptions }) {
  const { profile } = useAuth();
  const canManage = !!profile;
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  // Crates is a data-entry convenience only — the real field submitted
  // ("goodEggs" for type=eggs, "totalEggs" for type=daily) is still a raw
  // piece count, unchanged. Mirrors the mobile Egg Collection screen's own
  // crate field (1 crate = 30 eggs).
  const [addCrates, setAddCrates] = useState("");
  function handleAddCratesChange(v: string, pieceField: string) {
    setAddCrates(v);
    const n = Math.max(0, Number(v) || 0);
    setAddForm((f) => ({ ...f, [pieceField]: v ? String(n * EGGS_PER_CRATE) : "" }));
  }
  const [addError, setAddError] = useState("");
  const [addWarning, setAddWarning] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [editRow, setEditRow] = useState<Record<string, any> | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editMsg, setEditMsg] = useState("");
  const [confirmRow, setConfirmRow] = useState<Record<string, any> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    if (["eggs", "medications", "vaccinations"].includes(type)) {
      defaults.warehouseId = options.warehouses[0]?.id ?? "";
    }
    setAddForm(defaults);
    setAddCrates("");
    setAddError("");
    setAddOpen(true);
    if (!open) { load(); setOpen(true); }
  }

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setAddLoading(true);
    setAddError("");
    setAddWarning("");
    try {
      const payload = buildRecordPayload(type, { ...addForm, flockBatchId: batchId }, options);
      const response = await apiFetch<{ warning?: string }>(endpoint, { method: "POST", body: JSON.stringify(payload) });
      if (response?.warning) setAddWarning(response.warning);
      setAddOpen(false);
      setAddForm({});
      setAddCrates("");
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

  async function confirmDeleteRow() {
    if (!confirmRow) return;
    setConfirmingDelete(true);
    setEditMsg("");
    try {
      await apiFetch(`/poultry/records/${type}/${confirmRow.id}`, { method: "DELETE" });
      await load();
      setConfirmRow(null);
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete record.");
    } finally {
      setConfirmingDelete(false);
    }
  }

  // Daily's mortalityCount/culledCount/feedConsumedKg/totalEggs are each
  // backed by their own linked Mortality/Feed/Egg entry (see the CORRECTABLE
  // comment in PoultryService.updateRecord) — the backend silently ignores
  // corrections to them here, so showing them as editable would look like a
  // save that does nothing.
  const DAILY_LOCKED_COLS = ["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs"];
  const editableCols = cols.filter((c) =>
    !["recordDate", "startDate", "vaccinationDate", "observationDate"].includes(c) &&
    !(type === "daily" && DAILY_LOCKED_COLS.includes(c))
  );

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
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
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
                {type === "mortality" && (
                  <div>
                    <label className="mb-0.5 block text-[10px] text-ink/60">Reason</label>
                    <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.isCulling ?? "false"} onChange={(e) => setAddForm((f) => ({ ...f, isCulling: e.target.value }))}>
                      <option value="false">Death</option>
                      <option value="true">Deliberate cull</option>
                    </select>
                  </div>
                )}
                {type === "eggs" && (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">{`Crates collected (1 crate = ${EGGS_PER_CRATE} eggs, optional)`}</label>
                      <input type="number" min="0" step="1" className="w-full rounded border border-line bg-white px-2 py-1 text-xs" placeholder="e.g. 140" value={addCrates} onChange={(e) => handleAddCratesChange(e.target.value, "goodEggs")} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Egg product (good eggs → stock)</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.eggProductId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, eggProductId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Seconds product (cracked/dirty → stock)</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.secondsProductId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, secondsProductId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
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
                {type === "daily" && (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">{`Crates of eggs collected (1 crate = ${EGGS_PER_CRATE} eggs, optional)`}</label>
                      <input type="number" min="0" step="1" className="w-full rounded border border-line bg-white px-2 py-1 text-xs" placeholder="e.g. 140" value={addCrates} onChange={(e) => handleAddCratesChange(e.target.value, "totalEggs")} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Feed product (optional — deducts stock)</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.feedProductId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, feedProductId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Feed warehouse</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.feedWarehouseId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, feedWarehouseId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Egg product (optional — credits stock)</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.eggProductId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, eggProductId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Egg warehouse</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.eggWarehouseId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, eggWarehouseId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {(type === "medications" || type === "vaccinations") && (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">{type === "medications" ? "Medicine product (deducts stock)" : "Vaccine product (deducts stock)"}</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={(type === "medications" ? addForm.medicineProductId : addForm.vaccineProductId) ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, [type === "medications" ? "medicineProductId" : "vaccineProductId"]: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Warehouse</label>
                      <select className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.warehouseId ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                        <option value="">— none —</option>
                        {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-ink/60">Quantity used</label>
                      <input type="number" min="0" step="0.001" className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm.quantityUsed ?? ""} onChange={(e) => setAddForm((f) => ({ ...f, quantityUsed: e.target.value }))} />
                    </div>
                  </>
                )}
                {recordFields(type).map((f) => (
                  <div key={f.name}>
                    <label className="mb-0.5 block text-[10px] text-ink/60">{f.label}</label>
                    {f.kind === "select" ? (
                      <select name={f.name} className="w-full rounded border border-line bg-white px-2 py-1 text-xs" value={addForm[f.name] ?? f.defaultValue ?? ""} onChange={(e) => setAddForm((prev) => ({ ...prev, [f.name]: e.target.value }))}>
                        {f.options?.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input name={f.name} className="w-full rounded border border-line bg-white px-2 py-1 text-xs" type={f.kind} value={addForm[f.name] ?? f.defaultValue ?? ""} onChange={(e) => setAddForm((prev) => ({ ...prev, [f.name]: e.target.value }))} required={f.required} />
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
          {addWarning && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>{addWarning}</span>
              <button type="button" className="shrink-0 text-amber-600 hover:text-amber-800" onClick={() => setAddWarning("")}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {loading && <p className="text-xs text-ink/50">Loading…</p>}
          {!loading && loadError && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <span>{loadError}</span>
              <button type="button" className="shrink-0 rounded border border-red-300 bg-white px-2 py-0.5 font-semibold hover:bg-red-100" onClick={load}>Retry</button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && !addOpen && <p className="text-xs text-ink/50">No records yet.</p>}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-field">
                  <tr>
                    {cols.map((c) => <th key={c} className="px-2 py-1.5 font-semibold text-ink/60 uppercase text-[10px]">{EGG_PIECE_COLUMN_LABELS[c] ?? c.replace(/([A-Z])/g, " $1")}</th>)}
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
                            <button type="button" title="Delete record" onClick={() => setConfirmRow(row)} className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-600">
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
              {type === "daily" && (
                <p className="mb-2 text-[11px] text-amber-800">
                  Mortality, culled, feed, and egg numbers can't be corrected here — each is tracked by its own linked
                  entry (tagged "Daily record") on the Mortality, Feed, or Egg Production screen. Correct it there instead.
                </p>
              )}
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
      <ConfirmModal
        open={!!confirmRow}
        onClose={() => setConfirmRow(null)}
        onConfirm={confirmDeleteRow}
        title="Delete record?"
        message="Delete this record? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingDelete}
      />
    </div>
  );
}

function BatchRecordsTab({ batchId, options }: { batchId: string; options: PoultryOptions }) {
  return (
    <div className="space-y-3">
      {BATCH_RECORD_TYPES.map(({ type, label, cols, endpoint }) => (
        // (2026-08-24) key was just `type` — navigating from one batch's detail
        // page to another's (client-side, no full page reload) reused the same
        // BatchRecordSection instance instead of remounting it. Its `rows` state
        // from the PREVIOUS batch stuck around, and toggle()'s own "only fetch
        // if rows is still empty" guard then actively prevented it from ever
        // re-fetching — so a section already expanded on batch A kept silently
        // showing batch A's records while the page displayed batch B. Keying on
        // batchId too forces a full remount (fresh rows/open/forms state) on
        // every batch switch.
        <BatchRecordSection key={`${batchId}-${type}`} batchId={batchId} type={type} label={label} cols={cols} endpoint={endpoint} options={options} />
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
  const canManage = !!profile;
  const { options, optionsError, optionsLoading, refreshOptions } = usePoultryOptions();
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
  const [submitWarning, setSubmitWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(rows.length === 0);
  const [recordsError, setRecordsError] = useState("");
  const [confirmRow, setConfirmRow] = useState<Record<string, any> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const recordLoadingRef = useRef(false);

  async function load() {
    // (2026-08-24) Was fetching every batch's records mixed together with no
    // flockBatchId filter at all — the "Flock batch" dropdown above only
    // ever controlled which batch a NEW record gets added to, so changing
    // it appeared to do nothing to the list below: viewing batch one still
    // showed batch two's (and every other batch's) records right alongside
    // it. Filters to whichever batch is currently selected in that same
    // dropdown, same as the batch-detail page's own Records tab does.
    //
    // (2026-08-25) Same bug, one level down: House and Pen are selectable
    // right below Flock batch, but the list ignored both — picking a house
    // to record against didn't narrow what showed below it, so records for
    // every house in the batch stayed mixed together. Leaving House/Pen on
    // "all" (empty) still shows everything, same as before.
    const params = new URLSearchParams({ take: "200" });
    if (form.flockBatchId) params.set("flockBatchId", form.flockBatchId);
    if (form.poultryHouseId) params.set("poultryHouseId", form.poultryHouseId);
    if (form.penId) params.set("penId", form.penId);
    const response = await apiFetch<{ data: Record<string, any>[]; meta?: any }>(`/poultry/records/${type}?${params}`);
    const data = response.data;
    if (!Array.isArray(data)) return;
    setRows((prev) => data.length === 0 && prev.length > 0 ? prev : data);
    if (data.length > 0) {
      try { sessionStorage.setItem(recordCacheKey, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadRecords() {
    if (recordLoadingRef.current) return;
    recordLoadingRef.current = true;
    setRecordsLoading(true);
    setRecordsError("");
    load().catch((err: any) => setRecordsError(err?.message ?? "Failed to load records.")).finally(() => { recordLoadingRef.current = false; setRecordsLoading(false); });
  }

  useEffect(() => {
    loadRecords();
  }, [type, form.flockBatchId, form.poultryHouseId, form.penId]);

  // Reload records after API recovery if the table is empty (mounted during outage).
  useEffect(() => {
    function onRecovered() { if (rows.length === 0) loadRecords(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [rows.length]);

  useEffect(() => {
    if (!editingId && !form.flockBatchId && options.batches.length > 0) {
      setForm((prev) => ({ ...prev, flockBatchId: options.batches[0].id }));
    }
  }, [options.batches]);

  // Auto-prefill opening bird count from previous day's closing count (daily records only).
  // If today's record for this batch+pen was already saved, the backend
  // returns it in full ("existing_today") — prefill every field from it, not
  // just Opening Count, so submitting here (rather than the edit-in-table
  // flow) doesn't quietly zero out mortality/culled/feed/eggs and trip the
  // "can't be reduced" guard.
  useEffect(() => {
    if (type !== "daily" || editingId || !form.flockBatchId || !form.recordDate) return;
    let cancelled = false;
    const penQuery = form.penId ? `&penId=${encodeURIComponent(form.penId)}` : "";
    apiFetch<{ data: { openingBirdCount: number; mortalityCount?: number; culledCount?: number; feedConsumedKg?: number; totalEggs?: number; notes?: string; source: string } }>(
      `/poultry/daily-records/prefill?flockBatchId=${encodeURIComponent(form.flockBatchId)}&date=${encodeURIComponent(form.recordDate)}${penQuery}`
    ).then((res) => {
      if (cancelled) return;
      const data = res?.data;
      if (data?.openingBirdCount == null) return;
      if (data.source === "existing_today") {
        setForm((prev) => ({
          ...prev,
          openingBirdCount: String(data.openingBirdCount),
          mortalityCount: String(data.mortalityCount ?? 0),
          culledCount: String(data.culledCount ?? 0),
          feedConsumedKg: String(data.feedConsumedKg ?? 0),
          totalEggs: String(data.totalEggs ?? 0),
          notes: data.notes ?? prev.notes ?? "",
        }));
      } else {
        setForm((prev) => ({ ...prev, openingBirdCount: String(data.openingBirdCount) }));
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [type, form.flockBatchId, form.recordDate, form.penId, editingId]);

  function startEdit(row: Record<string, any>) {
    const pre: Record<string, string> = { flockBatchId: row.flockBatchId ?? "", penId: row.penId ?? "", poultryHouseId: "" };
    // Restore the house filter so the pen dropdown shows the right options when editing
    if (row.penId) {
      const pen = options.pens.find((p) => p.id === row.penId);
      if (pen) pre.poultryHouseId = pen.poultryHouseId;
    }
    for (const field of recordFields(type, true)) pre[field.name] = String(row[field.name] ?? field.defaultValue ?? "");
    setForm(pre);
    setEditingId(row.id);
    setSubmitError("");
  }

  function cancelEdit() {
    setEditingId(null);
    // Keep the batch filter as-is (see the same reasoning in submit()) —
    // the record being edited already belonged to whichever batch was
    // selected, so there's no reason cancelling should jump the filter
    // elsewhere.
    setForm((prev) => ({ ...makeFormDefaults(type), flockBatchId: prev.flockBatchId, poultryHouseId: prev.poultryHouseId, penId: prev.penId }));
    setSubmitError("");
  }

  async function confirmDeleteRow() {
    if (!confirmRow) return;
    setConfirmingDelete(true);
    setSubmitError("");
    try {
      await apiFetch(`/poultry/records/${type}/${confirmRow.id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== confirmRow.id));
      load().catch(() => undefined);
      setConfirmRow(null);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to delete record.");
    } finally {
      setConfirmingDelete(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitError("");
    setSubmitWarning("");
    setSaving(true);
    try {
      let response: { warning?: string } | undefined;
      if (editingId) {
        const payload = buildRecordPayload(type, form, options);
        response = await apiFetch(`/poultry/records/${type}/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setEditingId(null);
      } else {
        response = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(buildRecordPayload(type, form, options)) });
      }
      if (response?.warning) setSubmitWarning(response.warning);
      // Keep the batch/house/pen selection after a successful save — entering
      // several records in a row for the same batch shouldn't require
      // re-picking it every time, and it also keeps the records list (now
      // filtered by this same field) from flipping back to "all batches"
      // and then back again on every submit.
      setForm((prev) => ({ ...makeFormDefaults(type), flockBatchId: prev.flockBatchId, poultryHouseId: prev.poultryHouseId, penId: prev.penId }));
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to save record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle={health ? "Veterinary and health workflow entries for assigned farms." : "Operational record entry and history for assigned flock batches."} />
      {optionsError && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{optionsError}</span>
          <button className="ml-4 rounded border border-amber-400 px-3 py-1 text-xs font-semibold hover:bg-amber-100" onClick={refreshOptions}>Retry</button>
        </div>
      )}
      {options.batches.length === 0 && !optionsError && !optionsLoading && (
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
      {submitWarning && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{submitWarning}</span>
          <button type="button" className="shrink-0 text-amber-600 hover:text-amber-800" onClick={() => setSubmitWarning("")}><X className="h-4 w-4" /></button>
        </div>
      )}
      {recordsError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{recordsError}</p>}
      <GenericRecordForm options={options} optionsLoading={optionsLoading} form={form} setForm={setForm} submit={submit} type={type} isEditing={!!editingId} saving={saving} />
      <SimpleRecordTable rows={rows} loading={recordsLoading} onEdit={startEdit} onDelete={canManage ? setConfirmRow : undefined} />
      <ConfirmModal
        open={!!confirmRow}
        onClose={() => setConfirmRow(null)}
        onConfirm={confirmDeleteRow}
        title="Delete record?"
        message="Delete this record? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingDelete}
      />
    </>
  );
}

function GenericRecordForm({ options, optionsLoading = false, form, setForm, submit, type, isEditing = false, saving = false }: {
  options: PoultryOptions;
  optionsLoading?: boolean;
  form: Record<string, string>;
  setForm: (form: Record<string, string>) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  type: string;
  isEditing?: boolean;
  saving?: boolean;
}) {
  const fields = recordFields(type, isEditing);
  // Crates is a data-entry convenience only — the real field submitted
  // ("goodEggs" for type=eggs, "totalEggs" for type=daily) is still a raw
  // piece count, unchanged. Mirrors the mobile Egg Collection screen's own
  // crate field (1 crate = 30 eggs).
  const [crates, setCrates] = useState("");
  function handleCratesChange(v: string, pieceField: string) {
    setCrates(v);
    const n = Math.max(0, Number(v) || 0);
    setForm({ ...form, [pieceField]: v ? String(n * EGGS_PER_CRATE) : "" });
  }

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
      <FormField label="Flock batch" hint="Also filters the records list below to this batch">
        <select
          name="flockBatchId"
          className={`${inputClass} ${!optionsLoading && options.batches.length === 0 ? "border-amber-400 bg-amber-50" : ""}`}
          value={form.flockBatchId}
          onChange={(e) => setForm({ ...form, flockBatchId: e.target.value, poultryHouseId: "", penId: "" })}
          disabled={optionsLoading && options.batches.length === 0}
          required
        >
          {optionsLoading && options.batches.length === 0
            ? <option value="">Loading batches…</option>
            : options.batches.length === 0
              ? <option value="">— No batches found — create one first —</option>
              : options.batches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)
          }
        </select>
      </FormField>

      <FormField label="House" hint="Also filters the records list below — leave unselected to see every house">
        <select
          name="poultryHouseId"
          className={inputClass}
          value={form.poultryHouseId}
          onChange={(e) => setForm({ ...form, poultryHouseId: e.target.value, penId: "" })}
        >
          <option value="">— select a house —</option>
          {housesWithPens.map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
        </select>
      </FormField>

      <FormField label="Pen (optional)" hint="Also filters the records list below to this pen">
        <select
          name="penId"
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
            <select name="feedProductId" className={inputClass} value={form.feedProductId ?? ""} onChange={(e) => setForm({ ...form, feedProductId: e.target.value })}>
              <option value="">— select product —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Warehouse">
            <select name="warehouseId" className={inputClass} value={form.warehouseId ?? ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">— select warehouse —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
        </>
      )}

      {type === "mortality" && (
        <FormField label="Reason">
          <select name="isCulling" className={inputClass} value={form.isCulling ?? "false"} onChange={(e) => setForm({ ...form, isCulling: e.target.value })}>
            <option value="false">Death</option>
            <option value="true">Deliberate cull</option>
          </select>
        </FormField>
      )}

      {type === "daily" && isEditing && (
        <p className="md:col-span-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Today's mortality, culled, feed, and egg numbers can't be corrected from here — each one is tracked by its own
          linked entry (tagged "Daily record") on the Mortality, Feed, or Egg Production screen. Correct it there instead.
        </p>
      )}

      {type === "daily" && !isEditing && (
        <>
          <FormField label={`Crates of eggs collected (1 crate = ${EGGS_PER_CRATE} eggs, optional)`}>
            <input type="number" min="0" step="1" className={inputClass} placeholder="e.g. 140" value={crates} onChange={(e) => handleCratesChange(e.target.value, "totalEggs")} />
          </FormField>
          <FormField label="Feed product (optional — deducts stock)">
            <select name="feedProductId" className={inputClass} value={form.feedProductId ?? ""} onChange={(e) => setForm({ ...form, feedProductId: e.target.value })}>
              <option value="">— none —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Feed warehouse">
            <select name="feedWarehouseId" className={inputClass} value={form.feedWarehouseId ?? ""} onChange={(e) => setForm({ ...form, feedWarehouseId: e.target.value })}>
              <option value="">— none —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
          <FormField label="Egg product (optional — credits stock)">
            <select name="eggProductId" className={inputClass} value={form.eggProductId ?? ""} onChange={(e) => setForm({ ...form, eggProductId: e.target.value })}>
              <option value="">— none —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Egg warehouse">
            <select name="eggWarehouseId" className={inputClass} value={form.eggWarehouseId ?? ""} onChange={(e) => setForm({ ...form, eggWarehouseId: e.target.value })}>
              <option value="">— none —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
        </>
      )}

      {type === "eggs" && (
        <>
          <FormField label={`Crates collected (1 crate = ${EGGS_PER_CRATE} eggs, optional)`}>
            <input type="number" min="0" step="1" className={inputClass} placeholder="e.g. 140" value={crates} onChange={(e) => handleCratesChange(e.target.value, "goodEggs")} />
          </FormField>
          <FormField label="Egg product (good eggs → stock)">
            <select name="eggProductId" className={inputClass} value={form.eggProductId ?? ""} onChange={(e) => setForm({ ...form, eggProductId: e.target.value })}>
              <option value="">— none —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Seconds product (cracked/dirty → stock)">
            <select name="secondsProductId" className={inputClass} value={form.secondsProductId ?? ""} onChange={(e) => setForm({ ...form, secondsProductId: e.target.value })}>
              <option value="">— none —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Warehouse">
            <select name="warehouseId" className={inputClass} value={form.warehouseId ?? ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">— none —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
        </>
      )}

      {(type === "medications" || type === "vaccinations") && (
        <>
          <FormField label={type === "medications" ? "Medicine product (deducts stock)" : "Vaccine product (deducts stock)"}>
            <select
              name={type === "medications" ? "medicineProductId" : "vaccineProductId"}
              className={inputClass}
              value={(type === "medications" ? form.medicineProductId : form.vaccineProductId) ?? ""}
              onChange={(e) => setForm({ ...form, [type === "medications" ? "medicineProductId" : "vaccineProductId"]: e.target.value })}
            >
              <option value="">— none —</option>
              {options.products.map((p) => <option key={p.id} value={p.id}>{p.sku ?? p.code} — {p.name}</option>)}
            </select>
          </FormField>
          <FormField label="Warehouse">
            <select name="warehouseId" className={inputClass} value={form.warehouseId ?? ""} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">— none —</option>
              {options.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </FormField>
          <FormField label="Quantity used">
            <input type="number" min="0" step="0.001" name="quantityUsed" className={inputClass} value={form.quantityUsed ?? ""} onChange={(e) => setForm({ ...form, quantityUsed: e.target.value })} />
          </FormField>
        </>
      )}

      {fields.map((field) => (
        <FormField key={field.name} label={field.label}>
          {field.kind === "select" ? (
            <select name={field.name} className={inputClass} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}>
              {field.options?.map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : (
            <input name={field.name} className={inputClass} type={field.kind} value={form[field.name] ?? field.defaultValue ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} required={field.required} />
          )}
        </FormField>
      ))}

      <button
        type="submit"
        disabled={saving}
        className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:col-span-4 ${isEditing ? "bg-amber-600" : "bg-brand"}`}
      >
        {saving ? "Saving…" : isEditing ? "Save correction" : "Submit record"}
      </button>
    </form>
  );
}

function recordFields(type: string, isEditing = false) {
  const date = { name: "recordDate", label: "Record date", kind: "date", required: true };
  // Editing a daily record only ever writes openingBirdCount/notes (see the
  // CORRECTABLE comment in PoultryService.updateRecord) — mortality/culled/
  // feed/eggs are each backed by their own linked Mortality/Feed/Egg entry,
  // so showing them here as editable would look like a save that silently
  // does nothing.
  if (type === "daily" && isEditing) {
    return [
      { name: "openingBirdCount", label: "Opening birds", kind: "number", defaultValue: "0" },
      { name: "notes", label: "Notes", kind: "text" }
    ];
  }
  const map: Record<string, Array<{ name: string; label: string; kind: string; required?: boolean; defaultValue?: string; options?: string[] }>> = {
    daily: [
      date,
      { name: "openingBirdCount", label: "Opening birds", kind: "number", defaultValue: "0" },
      { name: "mortalityCount", label: "Mortality today", kind: "number", defaultValue: "0" },
      { name: "culledCount", label: "Culled today", kind: "number", defaultValue: "0" },
      { name: "feedConsumedKg", label: "Feed consumed (kg)", kind: "number", defaultValue: "0" },
      // (2026-08-24) Explicitly labeled "pieces" — this is always a raw egg
      // count (same as goodEggs below), never crates, whether it was typed
      // in directly or filled in via the Crates helper above.
      { name: "totalEggs", label: "Total eggs (pieces)", kind: "number", defaultValue: "0" },
      { name: "notes", label: "Notes", kind: "text" }
    ],
    mortality: [date, { name: "birdCount", label: "Bird count", kind: "number", required: true }, { name: "reason", label: "Reason", kind: "text" }],
    feed: [date, { name: "bags", label: "Bags (50 kg each)", kind: "number", required: true }, { name: "costAmount", label: "Cost (GHS)", kind: "number" }],
    eggs: [date, { name: "goodEggs", label: "Good (pieces)", kind: "number", defaultValue: "0" }, { name: "crackedEggs", label: "Cracked (pieces)", kind: "number", defaultValue: "0" }, { name: "dirtyEggs", label: "Dirty (pieces)", kind: "number", defaultValue: "0" }, { name: "brokenEggs", label: "Broken (pieces)", kind: "number", defaultValue: "0" }, { name: "rejectedEggs", label: "Rejected (pieces)", kind: "number", defaultValue: "0" }],
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

  if (!merged.flockBatchId) throw new Error("Please select a flock batch before submitting.");
  const payload: Record<string, string | number | boolean | undefined> = {
    ...merged,
    flockBatchId: merged.flockBatchId,
    penId: merged.penId || undefined,
    poultryHouseId: undefined
  };
  const numericKeys = ["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "birdCount", "quantityKg", "costAmount", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "sampleSize", "averageWeightKg", "amount", "openingBirdCount", "quantityUsed"];
  for (const key of Object.keys(payload)) {
    if (numericKeys.includes(key)) {
      payload[key] = Number(payload[key] || 0);
    }
  }
  if (type === "mortality") payload.isCulling = merged.isCulling === "true";

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

  // Daily: feed/egg product+warehouse are optional stock links, same convention
  // as the dedicated Feed/Egg screens — an empty select must become undefined,
  // not an empty string (the backend's @IsOptional() @IsUUID() rejects "").
  if (type === "daily") {
    payload.feedProductId = merged.feedProductId || undefined;
    payload.feedWarehouseId = merged.feedWarehouseId || undefined;
    payload.eggProductId = merged.eggProductId || undefined;
    payload.eggWarehouseId = merged.eggWarehouseId || undefined;
  }

  return payload;
}

function SimpleRecordTable({ rows, loading, onEdit, onDelete }: { rows: Record<string, any>[]; loading?: boolean; onEdit?: (row: Record<string, any>) => void; onDelete?: (row: Record<string, any>) => void }) {
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
    ...keys.map((key) => ({ key, label: EGG_PIECE_COLUMN_LABELS[key] ?? key.replace(/([A-Z])/g, " $1"), render: (row: Record<string, any>) => formatCell(key, row[key], 80) })),
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
  return <DataTable rows={rows} loading={loading} empty="No records found" columns={columns} />;
}

// ─── Transfers ────────────────────────────────────────────────────────────────

const TRANSFER_STATUSES = ["PENDING", "APPROVED", "COMPLETED", "CANCELLED"] as const;
const TRANSFERS_CACHE = "jokas_poultry_transfers";

type PenSelection = { penId: string; code: string; name?: string; selected: boolean; birdCount: string };

export function PoultryTransferPage() {
  const { profile } = useAuth();
  const canManage = !!profile;
  const { options, optionsError, optionsLoading, refreshOptions } = usePoultryOptions();
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
  const [submitting, setSubmitting] = useState(false);
  const [editRow, setEditRow] = useState<Record<string, any> | null>(null);
  const [editForm, setEditForm] = useState({ birdCount: "", reason: "", status: "" });
  const [editMsg, setEditMsg] = useState("");
  const [confirmRow, setConfirmRow] = useState<Record<string, any> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loadError, setLoadError] = useState("");

  const fromHouses = useMemo(() => {
    const houseIds = new Set(options.pens.map((p) => p.poultryHouseId));
    return options.houses.filter((h) => houseIds.has(h.id));
  }, [options.houses, options.pens]);
  const toHouses = useMemo(() => options.houses.filter((h) => !form.toFarmId || h.farmId === form.toFarmId), [options.houses, form.toFarmId]);
  const effectiveToHouseId = form.toPoultryHouseId || toHouses[0]?.id || "";
  // The Batch <select> below displays options.batches[0] as a fallback the
  // same way "To house" does, so the visible selection and the value
  // actually submitted must come from the same place — otherwise a batch
  // clearly shown as selected (because it's the only/first option and the
  // user never had to touch the dropdown) still submits as empty, and
  // "Please select a flock batch" fires despite one being visibly chosen.
  const effectiveFlockBatchId = form.flockBatchId || options.batches[0]?.id || "";
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
    setRows((prev) => data.length === 0 && prev.length > 0 ? prev : data);
    if (data.length > 0) {
      try { sessionStorage.setItem(TRANSFERS_CACHE, JSON.stringify(data)); } catch { /* noop */ }
    }
  }

  function loadTransfers() {
    if (transferLoadingRef.current) return;
    transferLoadingRef.current = true;
    setLoadError("");
    load().catch((err: any) => setLoadError(err?.message ?? "Failed to load transfers.")).finally(() => { transferLoadingRef.current = false; });
  }

  useEffect(() => { loadTransfers(); }, []);

  // Same "disappearing content" self-heal every other data page in this
  // file already has — see app-shell.tsx's onApiUnavailable comment.
  useEffect(() => {
    function onRecovered() { if (rows.length === 0) loadTransfers(); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [rows.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitError("");
    if (!effectiveFlockBatchId) { setSubmitError("Please select a flock batch."); return; }
    if (!effectiveToHouseId) { setSubmitError("Please select a destination house (the destination farm has no houses to choose from)."); return; }
    if (!form.toPenId && toPens.length > 0) { setSubmitError("Please select a destination pen — this house has pens configured, so the birds need to land in one, not just the batch's total."); return; }
    const base = {
      flockBatchId: effectiveFlockBatchId,
      fromPoultryHouseId: form.fromHouseId || undefined,
      toFarmId: form.toFarmId || options.farms[0]?.id,
      toPoultryHouseId: effectiveToHouseId,
      toPenId: form.toPenId || undefined,
      transferDate: form.transferDate,
      reason: form.reason || undefined
    };
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
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

  async function confirmDeleteRow() {
    if (!confirmRow) return;
    setConfirmingDelete(true);
    setEditMsg("");
    try {
      await apiFetch(`/poultry/records/transfers/${confirmRow.id}`, { method: "DELETE" });
      if (editRow?.id === confirmRow.id) setEditRow(null);
      setRows((prev) => prev.filter((r) => r.id !== confirmRow.id));
      load().catch(() => undefined);
      setConfirmRow(null);
    } catch (err: any) {
      setEditMsg(err?.message ?? "Failed to delete transfer.");
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <>
      <PageHeader title="Poultry Transfers" subtitle="Move birds between pens, houses, or farms with full transfer audit tracking." />
      {(loadError || optionsError) && <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{loadError || optionsError}</p>}
      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-3">
        <FormField label="Batch">
          <select
            className={inputClass}
            value={effectiveFlockBatchId}
            onChange={(e) => { setForm({ ...form, flockBatchId: e.target.value, fromHouseId: "" }); setPenSelections([]); }}
            disabled={optionsLoading && options.batches.length === 0}
          >
            {optionsLoading && options.batches.length === 0
              ? <option value="">Loading batches…</option>
              : options.batches.length === 0
                ? <option value="">— No batches found —</option>
                : options.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} — {batch.name}</option>)
            }
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
        <FormField label={toPens.length > 0 ? "To pen" : "To pen (no pens in this house)"}>
          <select className={inputClass} value={form.toPenId} onChange={(e) => setForm({ ...form, toPenId: e.target.value })} required={toPens.length > 0}>
            <option value="">{toPens.length > 0 ? "— select a pen —" : "— no pens in this house —"}</option>
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
        <button disabled={submitting} className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 md:col-span-3">
          {submitting ? "Creating…" : anyPenSelected ? `Create ${selectedPens.length} transfer${selectedPens.length > 1 ? "s" : ""}` : "Create transfer"}
        </button>
      </form>
      <SimpleRecordTable
        rows={rows}
        onEdit={canManage ? startEdit : undefined}
        onDelete={canManage ? setConfirmRow : undefined}
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
      <ConfirmModal
        open={!!confirmRow}
        onClose={() => setConfirmRow(null)}
        onConfirm={confirmDeleteRow}
        title="Delete transfer?"
        message="Delete this transfer? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={confirmingDelete}
      />
    </>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function PoultryReportsPage() {
  return (
    <>
      <PageHeader title="Poultry Reports" subtitle="Export poultry flock performance, health, production, and cost reports." />
      <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white" onClick={() => downloadReport("/poultry/reports/summary.csv", "poultry-summary.csv")}>
        <Download aria-hidden className="h-4 w-4" /> Download poultry summary CSV
      </button>
    </>
  );
}
