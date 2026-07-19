"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { FormField } from "../../components/form-field";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type BranchRow = { id: string; code: string; name: string; city?: string; country?: string; isHeadOffice?: boolean };
type FarmRow = { id: string; code: string; name: string; location?: string; type?: string };
type WarehouseRow = { id: string; code: string; name: string; type?: string; location?: string };
type ProductionSiteRow = { id: string; code: string; name: string; type?: string; location?: string };

type Tab = "branches" | "farms" | "warehouses" | "production-sites";

const TABS: { key: Tab; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "farms", label: "Farms" },
  { key: "warehouses", label: "Warehouses" },
  { key: "production-sites", label: "Production Sites" },
];

const inputClass = "min-h-11 rounded-md border border-line px-3 text-sm bg-white";

type DeleteConfirm = { type: string; id: string; name: string };
type EditTarget = { tab: Tab; id: string };

export default function PlatformPage() {
  const [activeTab, setActiveTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [productionSites, setProductionSites] = useState<ProductionSiteRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Create forms
  const [branchForm, setBranchForm] = useState({ name: "", code: "", city: "", country: "Ghana" });
  const [farmForm, setFarmForm] = useState({ name: "", code: "", location: "" });
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "", location: "", type: "GENERAL", branchId: "" });
  const [siteForm, setSiteForm] = useState({ name: "", code: "", location: "", type: "FEED_PRODUCTION", branchId: "" });

  // Edit state
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editBranch, setEditBranch] = useState({ name: "", code: "", city: "", country: "" });
  const [editFarm, setEditFarm] = useState({ name: "", code: "", location: "" });
  const [editWarehouse, setEditWarehouse] = useState({ name: "", code: "", location: "", type: "" });
  const [editSite, setEditSite] = useState({ name: "", code: "", location: "", type: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const [branchRes, farmRes, warehouseRes, siteRes] = await Promise.all([
      apiFetch<ApiEnvelope<BranchRow[]>>("/platform/branches"),
      apiFetch<ApiEnvelope<FarmRow[]>>("/platform/farms"),
      apiFetch<ApiEnvelope<WarehouseRow[]>>("/platform/warehouses"),
      apiFetch<ApiEnvelope<ProductionSiteRow[]>>("/platform/production-sites"),
    ]);
    setBranches(branchRes.data);
    setFarms(farmRes.data);
    setWarehouses(warehouseRes.data);
    setProductionSites(siteRes.data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load sites."));
  }, []);

  // ── Create helpers ───────────────────────────────────────────────────────
  async function handleCreate(event: FormEvent, endpoint: string, body: object, reset: () => void) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/platform/${endpoint}`, { method: "POST", body: JSON.stringify(body) });
      reset();
      await load();
      setMessage("Created successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function submitBranch(e: FormEvent) {
    const payload: Record<string, unknown> = { name: branchForm.name, code: branchForm.code };
    if (branchForm.city) payload.city = branchForm.city;
    if (branchForm.country) payload.country = branchForm.country;
    return handleCreate(e, "branches", payload, () => setBranchForm({ name: "", code: "", city: "", country: "Ghana" }));
  }
  function submitFarm(e: FormEvent) {
    const payload: Record<string, unknown> = { name: farmForm.name, code: farmForm.code };
    if (farmForm.location) payload.location = farmForm.location;
    return handleCreate(e, "farms", payload, () => setFarmForm({ name: "", code: "", location: "" }));
  }
  function submitWarehouse(e: FormEvent) {
    const payload: Record<string, unknown> = { name: warehouseForm.name, code: warehouseForm.code, type: warehouseForm.type };
    if (warehouseForm.location) payload.location = warehouseForm.location;
    if (warehouseForm.branchId) payload.branchId = warehouseForm.branchId;
    return handleCreate(e, "warehouses", payload, () => setWarehouseForm({ name: "", code: "", location: "", type: "GENERAL", branchId: "" }));
  }
  function submitSite(e: FormEvent) {
    const payload: Record<string, unknown> = { name: siteForm.name, code: siteForm.code, type: siteForm.type };
    if (siteForm.location) payload.location = siteForm.location;
    if (siteForm.branchId) payload.branchId = siteForm.branchId;
    return handleCreate(e, "production-sites", payload, () => setSiteForm({ name: "", code: "", location: "", type: "FEED_PRODUCTION", branchId: "" }));
  }

  // ── Edit helpers ─────────────────────────────────────────────────────────
  function openEdit(tab: Tab, id: string) {
    setEditing({ tab, id });
    setError("");
    setMessage("");
    if (tab === "branches") {
      const r = branches.find((b) => b.id === id);
      if (r) setEditBranch({ name: r.name, code: r.code, city: r.city ?? "", country: r.country ?? "" });
    } else if (tab === "farms") {
      const r = farms.find((f) => f.id === id);
      if (r) setEditFarm({ name: r.name, code: r.code, location: r.location ?? "" });
    } else if (tab === "warehouses") {
      const r = warehouses.find((w) => w.id === id);
      if (r) setEditWarehouse({ name: r.name, code: r.code, location: r.location ?? "", type: r.type ?? "GENERAL" });
    } else if (tab === "production-sites") {
      const r = productionSites.find((s) => s.id === id);
      if (r) setEditSite({ name: r.name, code: r.code, location: r.location ?? "", type: r.type ?? "FEED_PRODUCTION" });
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setError("");
    setMessage("");
    const endpointMap: Record<Tab, string> = {
      branches: "branches",
      farms: "farms",
      warehouses: "warehouses",
      "production-sites": "production-sites"
    };
    const bodyMap: Record<Tab, object> = {
      branches: editBranch,
      farms: editFarm,
      warehouses: editWarehouse,
      "production-sites": editSite
    };
    try {
      await apiFetch(`/platform/${endpointMap[editing.tab]}/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify(bodyMap[editing.tab])
      });
      setEditing(null);
      setMessage("Updated successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete helpers ───────────────────────────────────────────────────────
  function openDelete(tab: Tab, id: string, name: string) {
    setDeleteConfirm({ type: tab, id, name });
    setError("");
    setMessage("");
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    setError("");
    const endpointMap: Record<string, string> = {
      branches: "branches",
      farms: "farms",
      warehouses: "warehouses",
      "production-sites": "production-sites"
    };
    try {
      await apiFetch(`/platform/${endpointMap[deleteConfirm.type]}/${deleteConfirm.id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      setMessage("Deleted successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Action buttons component ─────────────────────────────────────────────
  function ActionButtons({ tab, id, name }: { tab: Tab; id: string; name: string }) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => openEdit(tab, id)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={() => openDelete(tab, id, name)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="app-kicker">Platform</p>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="mt-1 text-sm text-ink/60">Branches, farms, warehouses, and production sites for the organisation.</p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-sm font-semibold text-red-800">
            Delete <span className="font-bold">{deleteConfirm.name}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setEditing(null); setDeleteConfirm(null); }}
            className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === key
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-ink/65 hover:bg-field"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Branches ──────────────────────────────────────────────────────── */}
      {activeTab === "branches" && (
        <div className="space-y-6">
          <form
            onSubmit={submitBranch}
            className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-panel md:grid-cols-[1fr_140px_1fr_140px_auto]"
          >
            <FormField label="Branch name">
              <input className={inputClass} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required />
            </FormField>
            <FormField label="Code">
              <input className={inputClass} value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} required />
            </FormField>
            <FormField label="City">
              <input className={inputClass} value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} />
            </FormField>
            <FormField label="Country">
              <input className={inputClass} value={branchForm.country} onChange={(e) => setBranchForm({ ...branchForm, country: e.target.value })} />
            </FormField>
            <button disabled={saving} className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" />
              Add branch
            </button>
          </form>

          {editing?.tab === "branches" && (
            <form onSubmit={saveEdit} className="rounded-xl border border-sky-200 bg-sky-50 p-5">
              <p className="mb-4 text-sm font-semibold text-sky-800">Edit branch</p>
              <div className="grid gap-4 md:grid-cols-[1fr_140px_1fr_140px_auto]">
                <FormField label="Branch name">
                  <input className={inputClass} required value={editBranch.name} onChange={(e) => setEditBranch({ ...editBranch, name: e.target.value })} />
                </FormField>
                <FormField label="Code">
                  <input className={inputClass} required value={editBranch.code} onChange={(e) => setEditBranch({ ...editBranch, code: e.target.value })} />
                </FormField>
                <FormField label="City">
                  <input className={inputClass} value={editBranch.city} onChange={(e) => setEditBranch({ ...editBranch, city: e.target.value })} />
                </FormField>
                <FormField label="Country">
                  <input className={inputClass} value={editBranch.country} onChange={(e) => setEditBranch({ ...editBranch, country: e.target.value })} />
                </FormField>
                <div className="mt-auto flex gap-2">
                  <button type="submit" disabled={editSaving} className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-field">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <DataTable
            rows={branches}
            empty="No branches found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "city", label: "City", render: (r) => r.city ?? "-" },
              { key: "country", label: "Country", render: (r) => r.country ?? "-" },
              { key: "actions", label: "Actions", render: (r) => <ActionButtons tab="branches" id={r.id} name={r.name} /> }
            ]}
          />
        </div>
      )}

      {/* ── Farms ─────────────────────────────────────────────────────────── */}
      {activeTab === "farms" && (
        <div className="space-y-6">
          <form
            onSubmit={submitFarm}
            className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-panel md:grid-cols-[1fr_150px_1fr_auto]"
          >
            <FormField label="Farm name">
              <input className={inputClass} value={farmForm.name} onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })} required />
            </FormField>
            <FormField label="Code">
              <input className={inputClass} value={farmForm.code} onChange={(e) => setFarmForm({ ...farmForm, code: e.target.value })} required />
            </FormField>
            <FormField label="Location">
              <input className={inputClass} value={farmForm.location} onChange={(e) => setFarmForm({ ...farmForm, location: e.target.value })} />
            </FormField>
            <button disabled={saving} className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" />
              Add farm
            </button>
          </form>

          {editing?.tab === "farms" && (
            <form onSubmit={saveEdit} className="rounded-xl border border-sky-200 bg-sky-50 p-5">
              <p className="mb-4 text-sm font-semibold text-sky-800">Edit farm</p>
              <div className="grid gap-4 md:grid-cols-[1fr_150px_1fr_auto]">
                <FormField label="Farm name">
                  <input className={inputClass} required value={editFarm.name} onChange={(e) => setEditFarm({ ...editFarm, name: e.target.value })} />
                </FormField>
                <FormField label="Code">
                  <input className={inputClass} required value={editFarm.code} onChange={(e) => setEditFarm({ ...editFarm, code: e.target.value })} />
                </FormField>
                <FormField label="Location">
                  <input className={inputClass} value={editFarm.location} onChange={(e) => setEditFarm({ ...editFarm, location: e.target.value })} />
                </FormField>
                <div className="mt-auto flex gap-2">
                  <button type="submit" disabled={editSaving} className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-field">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <DataTable
            rows={farms}
            empty="No farms found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
              { key: "actions", label: "Actions", render: (r) => <ActionButtons tab="farms" id={r.id} name={r.name} /> }
            ]}
          />
        </div>
      )}

      {/* ── Warehouses ────────────────────────────────────────────────────── */}
      {activeTab === "warehouses" && (
        <div className="space-y-6">
          <form
            onSubmit={submitWarehouse}
            className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-panel md:grid-cols-[1fr_130px_1fr_160px_auto]"
          >
            <FormField label="Warehouse name">
              <input className={inputClass} value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} required />
            </FormField>
            <FormField label="Code">
              <input className={inputClass} value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} required />
            </FormField>
            <FormField label="Location">
              <input className={inputClass} value={warehouseForm.location} onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })} />
            </FormField>
            <FormField label="Type">
              <select className={inputClass} value={warehouseForm.type} onChange={(e) => setWarehouseForm({ ...warehouseForm, type: e.target.value })}>
                <option value="GENERAL">General</option>
                <option value="FARM_STORE">Farm store</option>
                <option value="FEED_STORE">Feed store</option>
                <option value="SOYA_STORE">Soya store</option>
                <option value="COLD_STORAGE">Cold storage</option>
              </select>
            </FormField>
            <button disabled={saving} className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" />
              Add warehouse
            </button>
          </form>

          {editing?.tab === "warehouses" && (
            <form onSubmit={saveEdit} className="rounded-xl border border-sky-200 bg-sky-50 p-5">
              <p className="mb-4 text-sm font-semibold text-sky-800">Edit warehouse</p>
              <div className="grid gap-4 md:grid-cols-[1fr_130px_1fr_160px_auto]">
                <FormField label="Warehouse name">
                  <input className={inputClass} required value={editWarehouse.name} onChange={(e) => setEditWarehouse({ ...editWarehouse, name: e.target.value })} />
                </FormField>
                <FormField label="Code">
                  <input className={inputClass} required value={editWarehouse.code} onChange={(e) => setEditWarehouse({ ...editWarehouse, code: e.target.value })} />
                </FormField>
                <FormField label="Location">
                  <input className={inputClass} value={editWarehouse.location} onChange={(e) => setEditWarehouse({ ...editWarehouse, location: e.target.value })} />
                </FormField>
                <FormField label="Type">
                  <select className={inputClass} value={editWarehouse.type} onChange={(e) => setEditWarehouse({ ...editWarehouse, type: e.target.value })}>
                    <option value="GENERAL">General</option>
                    <option value="FARM_STORE">Farm store</option>
                    <option value="FEED_STORE">Feed store</option>
                    <option value="SOYA_STORE">Soya store</option>
                    <option value="COLD_STORAGE">Cold storage</option>
                  </select>
                </FormField>
                <div className="mt-auto flex gap-2">
                  <button type="submit" disabled={editSaving} className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-field">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <DataTable
            rows={warehouses}
            empty="No warehouses found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "type", label: "Type", render: (r) => r.type ?? "-" },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
              { key: "actions", label: "Actions", render: (r) => <ActionButtons tab="warehouses" id={r.id} name={r.name} /> }
            ]}
          />
        </div>
      )}

      {/* ── Production Sites ──────────────────────────────────────────────── */}
      {activeTab === "production-sites" && (
        <div className="space-y-6">
          <form
            onSubmit={submitSite}
            className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-panel md:grid-cols-[1fr_130px_1fr_180px_auto]"
          >
            <FormField label="Site name">
              <input className={inputClass} value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} required />
            </FormField>
            <FormField label="Code">
              <input className={inputClass} value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} required />
            </FormField>
            <FormField label="Location">
              <input className={inputClass} value={siteForm.location} onChange={(e) => setSiteForm({ ...siteForm, location: e.target.value })} />
            </FormField>
            <FormField label="Type">
              <select className={inputClass} value={siteForm.type} onChange={(e) => setSiteForm({ ...siteForm, type: e.target.value })}>
                <option value="FEED_PRODUCTION">Feed Production</option>
                <option value="SOYA_PROCESSING">Soya Processing</option>
                <option value="MIXED">Mixed</option>
              </select>
            </FormField>
            <button disabled={saving} className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" />
              Add site
            </button>
          </form>

          {editing?.tab === "production-sites" && (
            <form onSubmit={saveEdit} className="rounded-xl border border-sky-200 bg-sky-50 p-5">
              <p className="mb-4 text-sm font-semibold text-sky-800">Edit production site</p>
              <div className="grid gap-4 md:grid-cols-[1fr_130px_1fr_180px_auto]">
                <FormField label="Site name">
                  <input className={inputClass} required value={editSite.name} onChange={(e) => setEditSite({ ...editSite, name: e.target.value })} />
                </FormField>
                <FormField label="Code">
                  <input className={inputClass} required value={editSite.code} onChange={(e) => setEditSite({ ...editSite, code: e.target.value })} />
                </FormField>
                <FormField label="Location">
                  <input className={inputClass} value={editSite.location} onChange={(e) => setEditSite({ ...editSite, location: e.target.value })} />
                </FormField>
                <FormField label="Type">
                  <select className={inputClass} value={editSite.type} onChange={(e) => setEditSite({ ...editSite, type: e.target.value })}>
                    <option value="FEED_PRODUCTION">Feed Production</option>
                    <option value="SOYA_PROCESSING">Soya Processing</option>
                    <option value="MIXED">Mixed</option>
                  </select>
                </FormField>
                <div className="mt-auto flex gap-2">
                  <button type="submit" disabled={editSaving} className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-field">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <DataTable
            rows={productionSites}
            empty="No production sites found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "type", label: "Type", render: (r) => r.type ?? "-" },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
              { key: "actions", label: "Actions", render: (r) => <ActionButtons tab="production-sites" id={r.id} name={r.name} /> }
            ]}
          />
        </div>
      )}
    </AppShell>
  );
}
