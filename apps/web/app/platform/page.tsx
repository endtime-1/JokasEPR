"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { FormField } from "../../components/form-field";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type BranchRow = { id: string; code: string; name: string; city?: string; country?: string; isHeadOffice?: boolean };
type FarmRow = { id: string; code: string; name: string; location?: string };
type WarehouseRow = { id: string; code: string; name: string; type?: string; location?: string };
type ProductionSiteRow = { id: string; code: string; name: string; type?: string; location?: string };

type Tab = "branches" | "farms" | "warehouses" | "production-sites";

const TABS: { key: Tab; label: string }[] = [
  { key: "branches", label: "Branches" },
  { key: "farms", label: "Farms" },
  { key: "warehouses", label: "Warehouses" },
  { key: "production-sites", label: "Production Sites" },
];

const inputClass = "min-h-11 rounded-md border border-line px-3 text-sm";

export default function PlatformPage() {
  const [activeTab, setActiveTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [productionSites, setProductionSites] = useState<ProductionSiteRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Branch form
  const [branchForm, setBranchForm] = useState({ name: "", code: "", city: "", country: "Ghana" });
  // Farm form
  const [farmForm, setFarmForm] = useState({ name: "", code: "", location: "" });
  // Warehouse form
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "", location: "", type: "GENERAL", branchId: "" });
  // Production site form
  const [siteForm, setSiteForm] = useState({ name: "", code: "", location: "", type: "FEED_PRODUCTION", branchId: "" });

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

  async function handleSubmit(event: FormEvent, endpoint: string, body: object, reset: () => void) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/platform/${endpoint}`, { method: "POST", body: JSON.stringify(body) });
      reset();
      await load();
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
    return handleSubmit(e, "branches", payload, () => setBranchForm({ name: "", code: "", city: "", country: "Ghana" }));
  }

  function submitFarm(e: FormEvent) {
    const payload: Record<string, unknown> = { name: farmForm.name, code: farmForm.code };
    if (farmForm.location) payload.location = farmForm.location;
    return handleSubmit(e, "farms", payload, () => setFarmForm({ name: "", code: "", location: "" }));
  }

  function submitWarehouse(e: FormEvent) {
    const payload: Record<string, unknown> = { name: warehouseForm.name, code: warehouseForm.code, type: warehouseForm.type };
    if (warehouseForm.location) payload.location = warehouseForm.location;
    if (warehouseForm.branchId) payload.branchId = warehouseForm.branchId;
    return handleSubmit(e, "warehouses", payload, () => setWarehouseForm({ name: "", code: "", location: "", type: "GENERAL", branchId: "" }));
  }

  function submitSite(e: FormEvent) {
    const payload: Record<string, unknown> = { name: siteForm.name, code: siteForm.code, type: siteForm.type };
    if (siteForm.location) payload.location = siteForm.location;
    if (siteForm.branchId) payload.branchId = siteForm.branchId;
    return handleSubmit(e, "production-sites", payload, () => setSiteForm({ name: "", code: "", location: "", type: "FEED_PRODUCTION", branchId: "" }));
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

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
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

      {/* Branches */}
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
            <button
              disabled={saving}
              className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Add branch
            </button>
          </form>
          <DataTable
            rows={branches}
            empty="No branches found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "city", label: "City", render: (r) => r.city ?? "-" },
              { key: "country", label: "Country", render: (r) => r.country ?? "-" },
            ]}
          />
        </div>
      )}

      {/* Farms */}
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
            <button
              disabled={saving}
              className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Add farm
            </button>
          </form>
          <DataTable
            rows={farms}
            empty="No farms found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
            ]}
          />
        </div>
      )}

      {/* Warehouses */}
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
              <select
                className={inputClass + " bg-white"}
                value={warehouseForm.type}
                onChange={(e) => setWarehouseForm({ ...warehouseForm, type: e.target.value })}
              >
                <option value="GENERAL">General</option>
                <option value="FARM_STORE">Farm store</option>
                <option value="FEED_STORE">Feed store</option>
                <option value="SOYA_STORE">Soya store</option>
                <option value="COLD_STORAGE">Cold storage</option>
              </select>
            </FormField>
            <button
              disabled={saving}
              className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Add warehouse
            </button>
          </form>
          <DataTable
            rows={warehouses}
            empty="No warehouses found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "type", label: "Type", render: (r) => r.type ?? "-" },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
            ]}
          />
        </div>
      )}

      {/* Production Sites */}
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
              <select
                className={inputClass + " bg-white"}
                value={siteForm.type}
                onChange={(e) => setSiteForm({ ...siteForm, type: e.target.value })}
              >
                <option value="FEED_PRODUCTION">Feed Production</option>
                <option value="SOYA_PROCESSING">Soya Processing</option>
                <option value="MIXED">Mixed</option>
              </select>
            </FormField>
            <button
              disabled={saving}
              className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Add site
            </button>
          </form>
          <DataTable
            rows={productionSites}
            empty="No production sites found"
            columns={[
              { key: "code", label: "Code", render: (r) => r.code },
              { key: "name", label: "Name", render: (r) => r.name },
              { key: "type", label: "Type", render: (r) => r.type ?? "-" },
              { key: "location", label: "Location", render: (r) => r.location ?? "-" },
            ]}
          />
        </div>
      )}
    </AppShell>
  );
}
