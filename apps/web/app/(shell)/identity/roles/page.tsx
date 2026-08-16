"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { DataTable } from "../../../../components/data-table";
import { FormField } from "../../../../components/form-field";
import { ApiEnvelope, apiFetch, getCachedFirst } from "../../../../lib/api";

type Role = {
  id: string;
  name: string;
  description?: string;
  level?: string;
  isSystem?: boolean;
  permissions: { id: string; key: string; module: string }[];
};

type Permission = { id: string; key: string; module: string; description?: string };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>(() => getCachedFirst<ApiEnvelope<Role[]>>("/identity/roles")?.data ?? []);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoadError("");
    try {
      const [roleResponse, permissionResponse] = await Promise.all([
        apiFetch<ApiEnvelope<Role[]>>("/identity/roles"),
        apiFetch<ApiEnvelope<Permission[]>>("/identity/permissions"),
      ]);
      setRoles(roleResponse.data ?? []);
      setPermissions(permissionResponse.data ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load roles.");
    }
  }

  useEffect(() => { load(); }, []);

  const permissionsByModule = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const p of permissions) {
      (groups[p.module] ??= []).push(p);
    }
    return groups;
  }, [permissions]);

  function togglePermission(id: string, checked: boolean) {
    setSelectedPermissionIds((prev) => checked ? [...prev, id] : prev.filter((p) => p !== id));
  }

  function toggleModule(module: string, checked: boolean) {
    const ids = (permissionsByModule[module] ?? []).map((p) => p.id);
    setSelectedPermissionIds((prev) => checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setMessage("");
    if (selectedPermissionIds.length === 0) { setSubmitError("Select at least one permission for this role."); return; }
    setSaving(true);
    try {
      await apiFetch("/identity/roles", {
        method: "POST",
        body: JSON.stringify({ ...form, permissionIds: selectedPermissionIds }),
      });
      setMessage(`Role "${form.name}" created.`);
      setForm({ name: "", description: "" });
      setSelectedPermissionIds([]);
      setShowCreate(false);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Roles</h2>
          <p className="text-sm text-ink/65">Permission bundles used by API guards and user access checks.</p>
        </div>
        <button
          type="button"
          className={showCreate ? "inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm font-semibold hover:bg-field" : "inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"}
          onClick={() => setShowCreate((p) => !p)}
        >
          {showCreate ? "Cancel" : <><Plus className="h-4 w-4" /> New role</>}
        </button>
      </div>

      {loadError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}
      {message && <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      {showCreate && (
        <form onSubmit={submit} className="mb-6 rounded-md border border-line bg-white p-4 shadow-panel">
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <FormField label="Role name">
              <input className="min-h-11 rounded-md border border-line px-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
            </FormField>
            <FormField label="Description (optional)">
              <input className="min-h-11 rounded-md border border-line px-3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} />
            </FormField>
          </div>

          <p className="mb-2 text-sm font-semibold text-ink">Permissions</p>
          {permissions.length === 0 ? (
            <p className="mb-3 text-sm text-ink/50">No permission catalog loaded yet.</p>
          ) : (
            <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(permissionsByModule).map(([module, perms]) => {
                const allSelected = perms.every((p) => selectedPermissionIds.includes(p.id));
                return (
                  <div key={module} className="rounded-md border border-line p-3">
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink/60">
                      <input type="checkbox" checked={allSelected} onChange={(e) => toggleModule(module, e.target.checked)} />
                      {module}
                    </label>
                    <div className="space-y-1.5">
                      {perms.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
                          <input type="checkbox" checked={selectedPermissionIds.includes(p.id)} onChange={(e) => togglePermission(p.id, e.target.checked)} />
                          {p.key}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {submitError && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
            <ShieldCheck className="h-4 w-4" />
            {saving ? "Creating…" : "Create role"}
          </button>
        </form>
      )}

      <DataTable
        rows={roles}
        empty="No roles found"
        columns={[
          { key: "name", label: "Role", render: (row) => row.name },
          { key: "description", label: "Description", render: (row) => row.description ?? "-" },
          { key: "isSystem", label: "System role", render: (row) => row.isSystem ? "Yes" : "No" },
          {
            key: "permissions",
            label: "Permissions",
            render: (row) => (row.permissions ?? []).length > 0
              ? <span className="text-xs text-ink/70">{(row.permissions ?? []).map((p) => p.key).join(", ")}</span>
              : <span className="text-ink/40">None assigned</span>
          }
        ]}
      />
    </>
  );
}
