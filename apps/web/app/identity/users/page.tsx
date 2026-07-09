"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { DataTable } from "../../../components/data-table";
import { FormField } from "../../../components/form-field";
import { ApiEnvelope, apiFetch } from "../../../lib/api";

type Role = {
  id: string;
  name: string;
};

type ScopeOption = {
  id: string;
  code: string;
  name: string;
};

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: { role: Role }[];
  branchAccesses: { branch: ScopeOption }[];
  farmAccesses: { farm: ScopeOption }[];
  warehouseAccesses: { warehouse: ScopeOption }[];
  productionSiteAccess: { productionSite: ScopeOption }[];
};

type UserForm = {
  email: string;
  fullName: string;
  password: string;
  roleIds: string[];
  branchIds: string[];
  farmIds: string[];
  warehouseIds: string[];
  productionSiteIds: string[];
};

const emptyForm: UserForm = {
  email: "",
  fullName: "",
  password: "",
  roleIds: [],
  branchIds: [],
  farmIds: [],
  warehouseIds: [],
  productionSiteIds: []
};

function selectedOptions(event: React.ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

function scopeNames<T extends Record<string, ScopeOption>>(items: T[] | undefined, key: keyof T) {
  return (items ?? []).map((item) => item[key].code).join(", ") || "-";
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<ScopeOption[]>([]);
  const [farms, setFarms] = useState<ScopeOption[]>([]);
  const [warehouses, setWarehouses] = useState<ScopeOption[]>([]);
  const [productionSites, setProductionSites] = useState<ScopeOption[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const defaultRoleIds = useMemo(() => (form.roleIds.length ? form.roleIds : roles[0] ? [roles[0].id] : []), [form.roleIds, roles]);

  const empty = { data: [] as ScopeOption[] };
  async function load() {
    const [userResponse, roleResponse, branchResponse, farmResponse, warehouseResponse, productionSiteResponse] = await Promise.all([
      apiFetch<ApiEnvelope<UserRow[]>>("/identity/users").catch(() => ({ data: [] as UserRow[] })),
      apiFetch<ApiEnvelope<Role[]>>("/identity/roles").catch(() => ({ data: [] as Role[] })),
      apiFetch<ApiEnvelope<ScopeOption[]>>("/platform/branches").catch(() => empty),
      apiFetch<ApiEnvelope<ScopeOption[]>>("/platform/farms").catch(() => empty),
      apiFetch<ApiEnvelope<ScopeOption[]>>("/platform/warehouses").catch(() => empty),
      apiFetch<ApiEnvelope<ScopeOption[]>>("/platform/production-sites").catch(() => empty),
    ]);
    const roles = roleResponse.data ?? [];
    setUsers(userResponse.data ?? []);
    setRoles(roles);
    setBranches(branchResponse.data ?? []);
    setFarms(farmResponse.data ?? []);
    setWarehouses(warehouseResponse.data ?? []);
    setProductionSites(productionSiteResponse.data ?? []);
    setForm((current) => ({ ...current, roleIds: current.roleIds.length ? current.roleIds : roles[0] ? [roles[0].id] : [] }));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load users."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await apiFetch("/identity/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          roleIds: defaultRoleIds,
          branchId: form.branchIds[0],
          farmId: form.farmIds[0],
          warehouseId: form.warehouseIds[0],
          productionSiteId: form.productionSiteIds[0]
        })
      });
      setForm({ ...emptyForm, roleIds: roles[0] ? [roles[0].id] : [] });
      setMessage("User created and access assigned.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    }
  }

  async function setStatus(user: UserRow, status: "ACTIVE" | "DEACTIVATED") {
    setError("");
    try {
      await apiFetch(`/identity/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Users</h2>
        <p className="text-sm text-ink/65">Admin-created accounts, role assignments, and operating access scopes.</p>
      </div>

      <form onSubmit={submit} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel xl:grid-cols-4">
        <FormField label="Full name">
          <input className="min-h-11 rounded-md border border-line px-3" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
        </FormField>
        <FormField label="Email">
          <input className="min-h-11 rounded-md border border-line px-3" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </FormField>
        <FormField label="Temporary password">
          <input className="min-h-11 rounded-md border border-line px-3" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={10} />
        </FormField>
        <FormField label="Roles">
          <select className="min-h-28 rounded-md border border-line px-3 py-2" multiple value={defaultRoleIds} onChange={(event) => setForm({ ...form, roleIds: selectedOptions(event) })} required>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Branches">
          <select className="min-h-28 rounded-md border border-line px-3 py-2" multiple value={form.branchIds} onChange={(event) => setForm({ ...form, branchIds: selectedOptions(event) })}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} - {branch.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Farms">
          <select className="min-h-28 rounded-md border border-line px-3 py-2" multiple value={form.farmIds} onChange={(event) => setForm({ ...form, farmIds: selectedOptions(event) })}>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.code} - {farm.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Warehouses">
          <select className="min-h-28 rounded-md border border-line px-3 py-2" multiple value={form.warehouseIds} onChange={(event) => setForm({ ...form, warehouseIds: selectedOptions(event) })}>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Production sites">
          <select className="min-h-28 rounded-md border border-line px-3 py-2" multiple value={form.productionSiteIds} onChange={(event) => setForm({ ...form, productionSiteIds: selectedOptions(event) })}>
            {productionSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.code} - {site.name}
              </option>
            ))}
          </select>
        </FormField>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white xl:col-span-4">
          <Plus aria-hidden className="h-4 w-4" />
          Create user
        </button>
      </form>

      {message && <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DataTable
        rows={users}
        empty="No users found"
        columns={[
          { key: "name", label: "Name", render: (row) => row.fullName },
          { key: "email", label: "Email", render: (row) => row.email },
          { key: "roles", label: "Roles", render: (row) => (row.roles ?? []).map((item) => item.role.name).join(", ") || "-" },
          { key: "scope", label: "Scope", render: (row) => `B: ${scopeNames(row.branchAccesses, "branch")} | F: ${scopeNames(row.farmAccesses, "farm")} | W: ${scopeNames(row.warehouseAccesses, "warehouse")}` },
          { key: "status", label: "Status", render: (row) => row.status },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" onClick={() => setStatus(row, "ACTIVE")}>
                  <UserCheck aria-hidden className="h-4 w-4" />
                  Activate
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" onClick={() => setStatus(row, "DEACTIVATED")}>
                  <UserX aria-hidden className="h-4 w-4" />
                  Deactivate
                </button>
                <ShieldCheck aria-hidden className="mt-2 h-4 w-4 text-brand" />
              </div>
            )
          }
        ]}
      />
    </AppShell>
  );
}

