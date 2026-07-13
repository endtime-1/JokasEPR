"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Building2, ChevronRight, HardDrive, Package, Plus, Save, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type Row = Record<string, any> & { id: string; code?: string; name?: string };
type MasterData = Record<string, Row[]>;
type Option = { id: string; code: string; name: string };

type SettingsMap = {
  "poultry.types": { values: string[] };
  "feed.types": { values: string[] };
  "tax.settings": { enabled: boolean; taxName?: string; ratePercent?: number; taxIdLabel?: string };
  "numbering.settings": {
    invoice: NumberingRule;
    productionBatch: NumberingRule;
    stockMovement: NumberingRule;
  };
  "ai.settings": { enabled: boolean; defaultModel: string; allowedModels: string[]; monthlyBudgetLimit?: number; allowOperationalRecommendations?: boolean };
  "backup.settings": { enabled: boolean; frequency: string; retentionDays?: string; storageTarget?: string };
  "user-access.settings": {
    enforceBranchScope: boolean;
    enforceFarmScope: boolean;
    enforceWarehouseScope: boolean;
    enforceProductionSiteScope: boolean;
    requireMfaForAdmins: boolean;
  };
};

type NumberingRule = { prefix: string; includeYear?: boolean; padding?: number; nextNumber?: number };

// Default form values for tabs that have required enum selects.
// These ensure the enum value is in the payload even if the user
// never touches the dropdown (visual default ≠ form state default).
const TAB_DEFAULTS: Partial<Record<string, Record<string, string>>> = {
  "farms": { type: "POULTRY" },
  "production-sites": { type: "FEED_PRODUCTION" },
  "warehouses": { type: "GENERAL" },
};

const masterSections = [
  ["branches", "Branches"],
  ["farms", "Farms"],
  ["warehouses", "Warehouses"],
  ["production-sites", "Production sites"],
  ["departments", "Departments"],
  ["units-of-measure", "Units of measure"],
  ["product-categories", "Product categories"],
  ["expense-categories", "Expense categories"]
] as const;

const DEFAULT_SETTINGS: SettingsMap = {
  "poultry.types": { values: [] },
  "feed.types": { values: [] },
  "tax.settings": { enabled: false, taxName: "", ratePercent: 0 },
  "numbering.settings": {
    invoice: { prefix: "INV", nextNumber: 1 },
    productionBatch: { prefix: "PB", nextNumber: 1 },
    stockMovement: { prefix: "SM", nextNumber: 1 }
  },
  "ai.settings": { enabled: false, defaultModel: "", allowedModels: [] },
  "backup.settings": { enabled: false, frequency: "daily" },
  "user-access.settings": {
    enforceBranchScope: false,
    enforceFarmScope: false,
    enforceWarehouseScope: false,
    enforceProductionSiteScope: false,
    requireMfaForAdmins: false
  }
};

const inputClass = "min-h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand";

function bool(value: unknown) {
  return Boolean(value);
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function SettingCard({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <section className="app-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [company, setCompany] = useState<any>({});
  const [master, setMaster] = useState<MasterData>({});
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [notification, setNotification] = useState<any>({});
  const [activeMaster, setActiveMaster] = useState<(typeof masterSections)[number][0]>("branches");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const results = await Promise.allSettled([
      apiFetch<ApiEnvelope<any>>("/settings/company"),
      apiFetch<ApiEnvelope<MasterData>>("/settings/master-data"),
      apiFetch<ApiEnvelope<Record<string, Option[]>>>("/settings/options"),
      apiFetch<SettingsMap>("/settings/system"),
      apiFetch<ApiEnvelope<any>>("/settings/notifications")
    ]);
    const [companyRes, masterRes, optionsRes, settingsRes, notificationRes] = results;
    if (companyRes.status === "fulfilled") setCompany(companyRes.value.data ?? {});
    if (masterRes.status === "fulfilled") setMaster(masterRes.value.data ?? {});
    if (optionsRes.status === "fulfilled") setOptions(optionsRes.value.data ?? {});
    if (settingsRes.status === "fulfilled") setSettings({ ...DEFAULT_SETTINGS, ...(settingsRes.value as Partial<SettingsMap>) });
    if (notificationRes.status === "fulfilled") setNotification(notificationRes.value.data ?? {});
    const firstFailure = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (firstFailure) throw firstFailure.reason;
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings."));
  }, []);

  const rows = useMemo(() => master[camel(activeMaster)] ?? [], [master, activeMaster]);

  // Merge API options with master-data so dropdowns populate even if the
  // /settings/options request failed or returned stale data.
  const toOpt = (arr: any[]) => arr.map((b) => ({ id: b.id, code: b.code ?? b.name, name: b.name }));
  const mergedOptions = useMemo(() => ({
    ...options,
    branches: options.branches?.length ? options.branches : toOpt(master.branches ?? []),
    farms: options.farms?.length ? options.farms : toOpt(master.farms ?? []),
    productCategories: options.productCategories?.length ? options.productCategories : toOpt(master.productCategories ?? []),
    accounts: options.accounts ?? [],
  }), [options, master]);

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, status, createdById, updatedById, createdAt, updatedAt, deletedAt, ...payload } = company;
    if (!payload.logoUrl) delete payload.logoUrl;
    await save("company", () => apiFetch("/settings/company", { method: "PUT", body: JSON.stringify(payload) }), "Company profile saved.");
  }

  async function save(key: string, action: () => Promise<unknown>, successMsg = "Saved."): Promise<boolean> {
    setSaving(key);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(successMsg);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving("");
    }
  }

  async function createMaster(event: FormEvent) {
    event.preventDefault();
    if (["farms", "warehouses", "production-sites"].includes(activeMaster) && !form.branchId) {
      setError("Please select a branch before adding.");
      return;
    }
    const payload = buildMasterPayload(activeMaster, form);
    const ok = await save(activeMaster, () => apiFetch(`/settings/${activeMaster}`, { method: "POST", body: JSON.stringify(payload) }), "Record added.");
    if (ok) setForm(TAB_DEFAULTS[activeMaster] ?? {});
  }

  function updateSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  if (!settings) {
    return (
      <AppShell>
        {error ? (
          <div className="p-6">
            <p className="mb-3 text-sm font-semibold text-red-700">Failed to load settings</p>
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            <button className="app-button-primary" onClick={() => { setError(""); load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings.")); }}>
              Retry
            </button>
          </div>
        ) : (
          <p className="p-6 text-sm text-ink/60">Loading settings…</p>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">System Settings</h1>
            <p className="mt-1 max-w-3xl text-sm text-ink/60">Company profile, sites, master data, numbering, notifications, AI, backup, and access controls.</p>
          </div>
          <span className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand">Admin configuration</span>
        </div>

        {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

        <SettingCard title="Company Profile" icon={Building2}>
          <form onSubmit={saveCompany} className="grid gap-3 md:grid-cols-2">
            <input className={inputClass} placeholder="Company name" value={company.name ?? ""} onChange={(e) => setCompany({ ...company, name: e.target.value })} required />
            <input className={inputClass} placeholder="Legal name" value={company.legalName ?? ""} onChange={(e) => setCompany({ ...company, legalName: e.target.value })} />
            <input className={inputClass} placeholder="Tax ID" value={company.taxId ?? ""} onChange={(e) => setCompany({ ...company, taxId: e.target.value })} />
            <input className={inputClass} placeholder="Timezone" value={company.timezone ?? ""} onChange={(e) => setCompany({ ...company, timezone: e.target.value })} />
            <input className={`${inputClass} md:col-span-2`} placeholder="Logo URL" value={company.logoUrl ?? ""} onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })} />
            <button className="app-button-primary md:w-max" disabled={saving === "company"}><Save className="h-4 w-4" />Save company</button>
          </form>
        </SettingCard>

        {/* Product Catalog shortcut */}
        <Link
          href="/settings/catalog"
          className="flex items-center justify-between rounded-xl border border-line bg-white p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-soft"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
              <Package className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Product Catalog</h2>
              <p className="mt-0.5 text-sm text-ink/55">Manage raw materials (ingredients), finished goods, and consumables</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink/30" />
        </Link>

        <SettingCard title="Master Data" icon={Settings}>
          <div className="mb-4 flex flex-wrap gap-2">
            {masterSections.map(([key, label]) => (
              <button key={key} onClick={() => { setActiveMaster(key); setForm(TAB_DEFAULTS[key] ?? {}); setError(""); setSuccess(""); }} className={`rounded-md border px-3 py-2 text-sm font-semibold ${activeMaster === key ? "border-brand bg-brand text-white" : "border-line bg-white text-ink/70"}`}>
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={createMaster} className="mb-4 grid gap-3 md:grid-cols-4">
            {masterFields(activeMaster, form, setForm, mergedOptions)}
            <button className="app-button-primary md:mt-auto" disabled={saving === activeMaster}><Plus className="h-4 w-4" />Add</button>
          </form>
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-field text-xs uppercase text-ink/55"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-line"><td className="px-3 py-2 font-semibold">{row.code ?? "-"}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2">{row.status ?? (row.isActive ? "ACTIVE" : "INACTIVE")}</td></tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-ink/45">No records yet</td></tr>}
              </tbody>
            </table>
            {rows.length > 0 && <p className="px-3 py-2 text-xs text-ink/45 border-t border-line">{rows.length} record{rows.length !== 1 ? "s" : ""}</p>}
          </div>
        </SettingCard>

        <div className="grid gap-5 xl:grid-cols-2">
          <SettingCard title="Tax & Numbering" icon={Settings}>
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bool(settings["tax.settings"].enabled)} onChange={(e) => updateSetting("tax.settings", { ...settings["tax.settings"], enabled: e.target.checked })} /> Enable tax</label>
              <input className={inputClass} placeholder="Tax name" value={settings["tax.settings"].taxName ?? ""} onChange={(e) => updateSetting("tax.settings", { ...settings["tax.settings"], taxName: e.target.value })} />
              <input className={inputClass} type="number" placeholder="Rate %" value={settings["tax.settings"].ratePercent ?? 0} onChange={(e) => updateSetting("tax.settings", { ...settings["tax.settings"], ratePercent: Number(e.target.value) })} />
              <NumberingEditor settings={settings["numbering.settings"]} onChange={(value) => updateSetting("numbering.settings", value)} />
              <button className="app-button-primary w-max" onClick={() => save("tax-numbering", async () => { await apiFetch("/settings/system/tax", { method: "PUT", body: JSON.stringify(settings["tax.settings"]) }); await apiFetch("/settings/system/numbering", { method: "PUT", body: JSON.stringify(settings["numbering.settings"]) }); }, "Tax & numbering saved.")}>Save tax & numbering</button>
            </div>
          </SettingCard>

          <SettingCard title="Notifications & AI" icon={Bot}>
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bool(notification.emailEnabled)} onChange={(e) => setNotification({ ...notification, emailEnabled: e.target.checked })} /> Email notifications</label>
              <input className={inputClass} placeholder="From address" value={notification.emailFromAddress ?? ""} onChange={(e) => setNotification({ ...notification, emailFromAddress: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bool(settings["ai.settings"].enabled)} onChange={(e) => updateSetting("ai.settings", { ...settings["ai.settings"], enabled: e.target.checked })} /> AI assistant enabled</label>
              <input className={inputClass} placeholder="Default AI model" value={settings["ai.settings"].defaultModel} onChange={(e) => updateSetting("ai.settings", { ...settings["ai.settings"], defaultModel: e.target.value })} />
              <input className={inputClass} placeholder="Allowed AI models, comma separated" value={settings["ai.settings"].allowedModels.join(", ")} onChange={(e) => updateSetting("ai.settings", { ...settings["ai.settings"], allowedModels: parseList(e.target.value) })} />
              <button className="app-button-primary w-max" onClick={() => save("notifications-ai", async () => { await apiFetch("/settings/notifications", { method: "PUT", body: JSON.stringify(notification) }); await apiFetch("/settings/system/ai", { method: "PUT", body: JSON.stringify(settings["ai.settings"]) }); }, "Notifications & AI saved.")}>Save notifications & AI</button>
            </div>
          </SettingCard>

          <SettingCard title="Backup Settings" icon={HardDrive}>
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bool(settings["backup.settings"].enabled)} onChange={(e) => updateSetting("backup.settings", { ...settings["backup.settings"], enabled: e.target.checked })} /> Backups enabled</label>
              <input className={inputClass} placeholder="Frequency" value={settings["backup.settings"].frequency} onChange={(e) => updateSetting("backup.settings", { ...settings["backup.settings"], frequency: e.target.value })} />
              <input className={inputClass} placeholder="Retention days" value={settings["backup.settings"].retentionDays ?? ""} onChange={(e) => updateSetting("backup.settings", { ...settings["backup.settings"], retentionDays: e.target.value })} />
              <input className={inputClass} placeholder="Storage target" value={settings["backup.settings"].storageTarget ?? ""} onChange={(e) => updateSetting("backup.settings", { ...settings["backup.settings"], storageTarget: e.target.value })} />
              <button className="app-button-primary w-max" onClick={() => save("backup", () => apiFetch("/settings/system/backup", { method: "PUT", body: JSON.stringify(settings["backup.settings"]) }))}>Save backup</button>
            </div>
          </SettingCard>

          <SettingCard title="User Access & Domain Types" icon={ShieldCheck}>
            <div className="grid gap-3">
              {(["enforceBranchScope", "enforceFarmScope", "enforceWarehouseScope", "enforceProductionSiteScope", "requireMfaForAdmins"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings["user-access.settings"][key]} onChange={(e) => updateSetting("user-access.settings", { ...settings["user-access.settings"], [key]: e.target.checked })} />
                  {key.replace(/([A-Z])/g, " $1")}
                </label>
              ))}
              <input className={inputClass} value={settings["poultry.types"].values.join(", ")} onChange={(e) => updateSetting("poultry.types", { values: parseList(e.target.value) })} />
              <input className={inputClass} value={settings["feed.types"].values.join(", ")} onChange={(e) => updateSetting("feed.types", { values: parseList(e.target.value) })} />
              <button className="app-button-primary w-max" onClick={() => save("access-types", async () => { await apiFetch("/settings/system/user-access", { method: "PUT", body: JSON.stringify(settings["user-access.settings"]) }); await apiFetch("/settings/system/poultry-types", { method: "PUT", body: JSON.stringify(settings["poultry.types"]) }); await apiFetch("/settings/system/feed-types", { method: "PUT", body: JSON.stringify(settings["feed.types"]) }); })}>Save access & types</button>
            </div>
          </SettingCard>
        </div>
      </div>
    </AppShell>
  );
}

function camel(resource: string) {
  const map: Record<string, string> = {
    "production-sites": "productionSites",
    "units-of-measure": "unitsOfMeasure",
    "product-categories": "productCategories",
    "expense-categories": "expenseCategories"
  };
  return map[resource] ?? resource;
}

function Select({ value, onChange, options, placeholder, required }: { value: string; onChange: (value: string) => void; options: Option[]; placeholder: string; required?: boolean }) {
  return <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}</select>;
}

function masterFields(resource: string, form: Record<string, string>, setForm: (updater: ((prev: Record<string, string>) => Record<string, string>) | Record<string, string>) => void, options: Record<string, Option[]>) {
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const base = [
    <input key="name" className={inputClass} placeholder="Name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required />,
    <input key="code" className={inputClass} placeholder="Code" value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} required />,
  ];
  if (resource === "branches") base.push(<input key="city" className={inputClass} placeholder="City" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />);
  if (["farms", "warehouses", "production-sites", "departments"].includes(resource)) base.push(<Select key="branchId" value={form.branchId ?? ""} onChange={(v) => set("branchId", v)} options={options.branches ?? []} placeholder="Branch" required={["farms", "warehouses", "production-sites"].includes(resource)} />);
  if (resource === "farms") base.push(<select key="type" className={inputClass} value={form.type ?? "POULTRY"} onChange={(e) => set("type", e.target.value)}><option value="POULTRY">Poultry</option><option value="CROP">Crop</option><option value="MIXED">Mixed</option></select>);
  if (resource === "warehouses") base.push(<Select key="farmId" value={form.farmId ?? ""} onChange={(v) => set("farmId", v)} options={options.farms ?? []} placeholder="Farm (optional)" />);
  if (resource === "warehouses") base.push(<select key="type" className={inputClass} value={form.type ?? "GENERAL"} onChange={(e) => set("type", e.target.value)}><option value="GENERAL">General</option><option value="FARM_STORE">Farm store</option><option value="FEED_STORE">Feed store</option><option value="SOYA_STORE">Soya store</option><option value="COLD_STORAGE">Cold storage</option></select>);
  if (resource === "production-sites") base.push(<select key="type" className={inputClass} value={form.type ?? "FEED_PRODUCTION"} onChange={(e) => set("type", e.target.value)}><option value="FEED_PRODUCTION">Feed production</option><option value="SOYA_PROCESSING">Soya processing</option><option value="MIXED">Mixed</option></select>);
  if (resource === "units-of-measure") base.push(<input key="symbol" className={inputClass} placeholder="Symbol" value={form.symbol ?? ""} onChange={(e) => set("symbol", e.target.value)} required />);
  if (resource === "product-categories") base.push(<Select key="parentId" value={form.parentId ?? ""} onChange={(v) => set("parentId", v)} options={options.productCategories ?? []} placeholder="Parent category (optional)" />);
  if (resource === "expense-categories") base.push(<Select key="accountId" value={form.accountId ?? ""} onChange={(v) => set("accountId", v)} options={options.accounts ?? []} placeholder="Account (optional)" />);
  if (["farms", "warehouses", "production-sites"].includes(resource)) base.push(<input key="location" className={inputClass} placeholder="Location" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />);
  return base;
}

function buildMasterPayload(resource: string, form: Record<string, string>) {
  const payload: Record<string, unknown> = { ...form };
  for (const key of Object.keys(payload)) if (payload[key] === "") delete payload[key];
  if (resource === "branches") payload.country = payload.country ?? "Ghana";
  if (resource === "units-of-measure") payload.symbol = payload.symbol ?? payload.code;
  return payload;
}

function NumberingEditor({ settings, onChange }: { settings: SettingsMap["numbering.settings"]; onChange: (value: SettingsMap["numbering.settings"]) => void }) {
  return (
    <div className="grid gap-2">
      {(["invoice", "productionBatch", "stockMovement"] as const).map((key) => (
        <div key={key} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-4">
          <span className="text-sm font-semibold">{key.replace(/([A-Z])/g, " $1")}</span>
          <input className={inputClass} value={settings[key].prefix} onChange={(e) => onChange({ ...settings, [key]: { ...settings[key], prefix: e.target.value } })} />
          <input className={inputClass} type="number" value={settings[key].padding ?? 4} onChange={(e) => onChange({ ...settings, [key]: { ...settings[key], padding: Number(e.target.value) } })} />
          <input className={inputClass} type="number" value={settings[key].nextNumber ?? 1} onChange={(e) => onChange({ ...settings, [key]: { ...settings[key], nextNumber: Number(e.target.value) } })} />
        </div>
      ))}
    </div>
  );
}
