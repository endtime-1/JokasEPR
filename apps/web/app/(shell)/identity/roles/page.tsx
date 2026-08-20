"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { DataTable } from "../../../../components/data-table";
import { FormField } from "../../../../components/form-field";
import { ConfirmModal, Modal } from "../../../../components/ui";
import { useAuth } from "../../../../components/auth-context";
import { ApiEnvelope, apiFetch, getCachedFirst, invalidateCache } from "../../../../lib/api";
import { useApiRecovery } from "../../../../lib/use-api-recovery";

type Role = {
  id: string;
  name: string;
  description?: string;
  level?: string;
  isSystem?: boolean;
  permissions: { id: string; key: string; module: string }[];
};

type Permission = { id: string; key: string; module: string; description?: string };

function PermissionPicker({
  permissionsByModule, selectedIds, onTogglePermission, onToggleModule,
}: {
  permissionsByModule: Record<string, Permission[]>;
  selectedIds: string[];
  onTogglePermission: (id: string, checked: boolean) => void;
  onToggleModule: (module: string, checked: boolean) => void;
}) {
  if (Object.keys(permissionsByModule).length === 0) {
    return <p className="mb-3 text-sm text-ink/50">No permission catalog loaded yet.</p>;
  }
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(permissionsByModule).map(([module, perms]) => {
        const allSelected = perms.every((p) => selectedIds.includes(p.id));
        return (
          <div key={module} className="rounded-md border border-line p-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink/60">
              <input type="checkbox" checked={allSelected} onChange={(e) => onToggleModule(module, e.target.checked)} />
              {module}
            </label>
            <div className="space-y-1.5">
              {perms.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink/80">
                  <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={(e) => onTogglePermission(p.id, e.target.checked)} />
                  {p.key}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RolesPage() {
  const { profile } = useAuth();
  const canManageIdentity = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("identity.manage");

  const [roles, setRoles] = useState<Role[]>(() => getCachedFirst<ApiEnvelope<Role[]>>("/identity/roles")?.data ?? []);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");

  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [editPermissionIds, setEditPermissionIds] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
  // Previously had no self-heal at all — a cold-start hiccup left roles
  // and/or permissions permanently empty until a manual page reload.
  useApiRecovery(roles.length === 0 || permissions.length === 0, () => { load().catch(() => undefined); });

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

  function startEdit(role: Role) {
    setEditForm({ name: role.name, description: role.description ?? "" });
    setEditPermissionIds(role.permissions.map((p) => p.id));
    setEditError("");
    setEditRole(role);
  }

  function toggleEditPermission(id: string, checked: boolean) {
    setEditPermissionIds((prev) => checked ? [...prev, id] : prev.filter((p) => p !== id));
  }
  function toggleEditModule(module: string, checked: boolean) {
    const ids = (permissionsByModule[module] ?? []).map((p) => p.id);
    setEditPermissionIds((prev) => checked ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id)));
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editRole) return;
    if (editPermissionIds.length === 0) { setEditError("Select at least one permission for this role."); return; }
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/identity/roles/${editRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, permissionIds: editPermissionIds }),
      });
      invalidateCache("/identity/roles");
      setEditRole(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRole) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/identity/roles/${deleteRole.id}`, { method: "DELETE" });
      invalidateCache("/identity/roles");
      setDeleteRole(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setDeleting(false);
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
      {deleteError && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

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
          <PermissionPicker
            permissionsByModule={permissionsByModule}
            selectedIds={selectedPermissionIds}
            onTogglePermission={togglePermission}
            onToggleModule={toggleModule}
          />

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
          },
          ...(canManageIdentity ? [{
            key: "actions",
            label: "Actions",
            render: (row: Record<string, unknown>) => {
              const role = row as unknown as Role;
              if (role.isSystem) return <span className="text-xs text-ink/40">Built-in</span>;
              return (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(role)}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteError(""); setDeleteRole(role); }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              );
            },
          }] : []),
        ]}
      />

      <Modal open={!!editRole} onClose={() => !savingEdit && setEditRole(null)} title={`Edit ${editRole?.name ?? "Role"}`} size="lg">
        <form onSubmit={saveEdit}>
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <FormField label="Role name">
              <input className="min-h-11 rounded-md border border-line px-3" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required maxLength={80} />
            </FormField>
            <FormField label="Description (optional)">
              <input className="min-h-11 rounded-md border border-line px-3" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} maxLength={240} />
            </FormField>
          </div>

          <p className="mb-2 text-sm font-semibold text-ink">Permissions</p>
          <PermissionPicker
            permissionsByModule={permissionsByModule}
            selectedIds={editPermissionIds}
            onTogglePermission={toggleEditPermission}
            onToggleModule={toggleEditModule}
          />

          {editError && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRole(null)} disabled={savingEdit}>Cancel</button>
            <button type="submit" disabled={savingEdit} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
              <ShieldCheck className="h-4 w-4" />
              {savingEdit ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRole}
        onClose={() => setDeleteRole(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete role?"
        message={`This will permanently remove "${deleteRole?.name}". This can't be undone.`}
        confirmLabel="Delete role"
      />
    </>
  );
}
