"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { DataTable } from "../../../../components/data-table";
import { FormField } from "../../../../components/form-field";
import { ApiEnvelope, apiFetch } from "../../../../lib/api";

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
  const [editingRolesFor, setEditingRolesFor] = useState<UserRow | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editUserForm, setEditUserForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [savingUser, setSavingUser] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetPasswordFor, setResetPasswordFor] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingReset, setSavingReset] = useState(false);

  const defaultRoleIds = useMemo(() => (form.roleIds.length ? form.roleIds : roles[0] ? [roles[0].id] : []), [form.roleIds, roles]);

  const empty = { data: [] as ScopeOption[] };
  async function load() {
    setError("");
    const [userResponse, roleResponse, branchResponse, farmResponse, warehouseResponse, productionSiteResponse] = await Promise.all([
      apiFetch<ApiEnvelope<UserRow[]>>("/identity/users"),
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

  useEffect(() => {
    function onRecovered() { if (users.length === 0) load().catch(() => undefined); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, [users.length]);

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

  function openEditRoles(user: UserRow) {
    setEditingRolesFor(user);
    setEditRoleIds((user.roles ?? []).map((r) => r.role.id));
  }

  async function saveRoles(e: FormEvent) {
    e.preventDefault();
    if (!editingRolesFor) return;
    setSavingRoles(true);
    setError("");
    try {
      await apiFetch(`/identity/users/${editingRolesFor.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: editRoleIds })
      });
      setMessage(`Roles updated for ${editingRolesFor.fullName}.`);
      setEditingRolesFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update roles.");
    } finally {
      setSavingRoles(false);
    }
  }

  function openEditUser(user: UserRow) {
    setEditingUser(user);
    setEditUserForm({ fullName: user.fullName, email: user.email, phone: "", password: "" });
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setError("");
    try {
      const body: Record<string, string> = {
        fullName: editUserForm.fullName,
        email: editUserForm.email
      };
      if (editUserForm.phone) body.phone = editUserForm.phone;
      if (editUserForm.password) body.password = editUserForm.password;
      await apiFetch(`/identity/users/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
      setMessage(`Account updated for ${editUserForm.fullName}.`);
      setEditingUser(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSavingUser(false);
    }
  }

  function openResetPassword(user: UserRow) {
    setResetPasswordFor(user);
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function submitResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetPasswordFor) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSavingReset(true);
    setError("");
    try {
      await apiFetch(`/identity/users/${resetPasswordFor.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword })
      });
      setMessage(`Password reset for ${resetPasswordFor.fullName}. All their sessions have been invalidated.`);
      setResetPasswordFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setSavingReset(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/identity/users/${deleteConfirmId}`, { method: "DELETE" });
      setMessage("User account deleted.");
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
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

      {editingRolesFor && (
        <form onSubmit={saveRoles} className="mb-4 rounded-md border border-brand/30 bg-brand/5 p-4">
          <p className="mb-3 text-sm font-semibold">Edit roles for <span className="text-brand">{editingRolesFor.fullName}</span></p>
          <div className="mb-3 flex flex-wrap gap-2">
            {roles.map((role) => (
              <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm hover:border-brand/40">
                <input
                  type="checkbox"
                  checked={editRoleIds.includes(role.id)}
                  onChange={(e) => setEditRoleIds(e.target.checked ? [...editRoleIds, role.id] : editRoleIds.filter((id) => id !== role.id))}
                />
                {role.name}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingRoles} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              <ShieldCheck className="h-4 w-4" />
              {savingRoles ? "Saving…" : "Save roles"}
            </button>
            <button type="button" onClick={() => setEditingRolesFor(null)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field">
              Cancel
            </button>
          </div>
        </form>
      )}

      {editingUser && (
        <form onSubmit={saveUser} className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-4">
          <p className="mb-3 text-sm font-semibold">Edit account — <span className="text-brand">{editingUser.fullName}</span></p>
          <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Full name">
              <input className="min-h-10 rounded-md border border-line px-3 text-sm" required value={editUserForm.fullName} onChange={(e) => setEditUserForm({ ...editUserForm, fullName: e.target.value })} />
            </FormField>
            <FormField label="Email">
              <input className="min-h-10 rounded-md border border-line px-3 text-sm" type="email" required value={editUserForm.email} onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })} />
            </FormField>
            <FormField label="Phone (optional)">
              <input className="min-h-10 rounded-md border border-line px-3 text-sm" value={editUserForm.phone} onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })} />
            </FormField>
            <FormField label="New password (optional — leave blank to keep)">
              <input className="min-h-10 rounded-md border border-line px-3 text-sm" type="password" minLength={10} value={editUserForm.password} onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })} />
            </FormField>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingUser} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              <Pencil className="h-4 w-4" />
              {savingUser ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditingUser(null)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field">
              Cancel
            </button>
          </div>
        </form>
      )}

      {resetPasswordFor && (
        <form onSubmit={submitResetPassword} className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm font-semibold">Reset password — <span className="text-amber-700">{resetPasswordFor.fullName}</span></p>
          <p className="mb-3 text-xs text-amber-700">All active sessions for this user will be terminated. They must log in again with the new password.</p>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <FormField label="New password">
              <input
                className="min-h-10 rounded-md border border-line px-3 text-sm"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>
            <FormField label="Confirm new password">
              <input
                className="min-h-10 rounded-md border border-line px-3 text-sm"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingReset} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50 hover:bg-amber-700">
              <KeyRound className="h-4 w-4" />
              {savingReset ? "Resetting…" : "Reset password"}
            </button>
            <button type="button" onClick={() => setResetPasswordFor(null)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field">
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleteConfirmId && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-sm font-semibold text-red-800">
            Delete account for <span className="font-bold">{users.find((u) => u.id === deleteConfirmId)?.fullName}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={confirmDelete} disabled={deleting} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 hover:bg-red-700">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting…" : "Yes, delete account"}
            </button>
            <button onClick={() => setDeleteConfirmId(null)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold hover:bg-field">
              Cancel
            </button>
          </div>
        </div>
      )}

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
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100" onClick={() => openEditUser(row)}>
                  <Pencil aria-hidden className="h-4 w-4" />
                  Edit
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 text-xs font-semibold text-brand hover:bg-brand/10" onClick={() => openEditRoles(row)}>
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                  Roles
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" onClick={() => setStatus(row, "ACTIVE")}>
                  <UserCheck aria-hidden className="h-4 w-4" />
                  Activate
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold hover:bg-field" onClick={() => setStatus(row, "DEACTIVATED")}>
                  <UserX aria-hidden className="h-4 w-4" />
                  Deactivate
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100" onClick={() => openResetPassword(row)}>
                  <KeyRound aria-hidden className="h-4 w-4" />
                  Reset pwd
                </button>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100" onClick={() => setDeleteConfirmId(row.id)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Delete
                </button>
              </div>
            )
          }
        ]}
      />
    </>
  );
}

