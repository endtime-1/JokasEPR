"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, FlaskConical, Package, PackagePlus, Pencil, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ApiEnvelope, apiFetch } from "../../../lib/api";

type UOM = { id: string; name: string; symbol: string };
type Ingredient = { id: string; name: string; sku: string; description: string | null; status: string; uom: UOM };

type FormState = { name: string; sku: string; uomId: string; description: string; status: string };

const EMPTY: FormState = { name: "", sku: "", uomId: "", description: "", status: "ACTIVE" };

const inputCls =
  "min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

export default function IngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Ingredient | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiEnvelope<Ingredient[]>>("/feed-production/ingredients");
      setItems(res.data);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Failed to load ingredients.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUoms = useCallback(async () => {
    try {
      const res = await apiFetch<ApiEnvelope<{ unitsOfMeasure: UOM[] }>>("/settings/master-data");
      setUoms(res.data.unitsOfMeasure ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { load(); loadUoms(); }, [load, loadUoms]);

  const filtered = items.filter(
    (i) =>
      search === "" ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase())
  );

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {}, 0);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setSaveError(null);
    setDrawerOpen(true);
  }

  function openEdit(item: Ingredient) {
    setEditing(item);
    setForm({ name: item.name, sku: item.sku, uomId: item.uom.id, description: item.description ?? "", status: item.status });
    setSaveError(null);
    setDrawerOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const body = { name: form.name, sku: form.sku, uomId: form.uomId, description: form.description || undefined, ...(editing ? { status: form.status } : {}) };
      if (editing) {
        await apiFetch(`/feed-production/ingredients/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/feed-production/ingredients", { method: "POST", body: JSON.stringify(body) });
      }
      setDrawerOpen(false);
      load();
    } catch (e: unknown) {
      setSaveError((e as Error)?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/feed-production/ingredients/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      load();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Delete failed.");
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Link href="/feed-production" className="inline-flex items-center gap-1 text-xs font-semibold text-ink/40 hover:text-brand">
                <ChevronLeft className="h-3 w-3" /> Feed Mill
              </Link>
            </div>
            <p className="app-kicker">Feed Mill</p>
            <h1 className="mt-0.5 text-2xl font-bold text-ink">Ingredients</h1>
            <p className="mt-1 max-w-xl text-sm text-ink/55">
              Manage raw material ingredients used in feed formulas. Add, edit, or remove items from the ingredient list.
            </p>
          </div>
          <button onClick={openCreate} className="app-button-primary">
            <PackagePlus className="h-4 w-4" />
            Add Ingredient
          </button>
        </div>

        {error && (
          <div className="app-alert-error">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="app-stat-card flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{items.filter((i) => i.status === "ACTIVE").length}</p>
              <p className="text-xs text-ink/50">Active Ingredients</p>
            </div>
          </div>
          <div className="app-stat-card flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{items.length}</p>
              <p className="text-xs text-ink/50">Total in List</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="app-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        {/* Table */}
        <div className="app-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-field/60">
                <tr className="text-[11px] font-bold uppercase tracking-wide text-ink/45">
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-4 py-3">Ingredient Name</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-line/40">
                        <td colSpan={6} className="px-5 py-3">
                          <div className="h-5 animate-pulse rounded-lg bg-line" style={{ width: `${55 + (i % 4) * 10}%` }} />
                        </td>
                      </tr>
                    ))
                  : filtered.map((item) => (
                      <tr key={item.id} className="border-b border-line/40 last:border-0 hover:bg-field/30 transition">
                        <td className="px-5 py-3">
                          <span className="rounded-md bg-field px-2 py-0.5 font-mono text-[11px] font-bold text-ink/60">{item.sku}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">{item.name}</td>
                        <td className="px-4 py-3 text-ink/60">{item.uom.symbol || item.uom.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === "ACTIVE"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink/45">{item.description ?? <span className="text-ink/25">—</span>}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEdit(item)}
                              className="rounded-lg p-1.5 text-ink/40 hover:bg-field hover:text-brand transition"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleting(item)}
                              className="rounded-lg p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-600 transition"
                              title="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <Package className="mx-auto mb-3 h-8 w-8 text-ink/20" />
                      <p className="font-semibold text-ink/40">{search ? "No ingredients match your search." : "No ingredients yet."}</p>
                      {!search && (
                        <button onClick={openCreate} className="app-button-primary mt-4 mx-auto">
                          <PackagePlus className="h-4 w-4" /> Add first ingredient
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <p className="app-kicker">Feed Mill — Ingredients</p>
                <h2 className="text-base font-bold text-ink">{editing ? `Edit: ${editing.name}` : "Add Ingredient"}</h2>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-ink/40 hover:bg-field hover:text-ink transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 space-y-4 px-6 py-5">
                {saveError && (
                  <div className="app-alert-error text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/60">Ingredient Name *</label>
                  <input
                    required
                    className={inputCls}
                    placeholder="e.g. Choline Chloride"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/60">SKU / Code *</label>
                  <input
                    required
                    className={inputCls}
                    placeholder="e.g. RM-CHOLINE"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  />
                  <p className="mt-1 text-[10px] text-ink/40">Unique code — auto-uppercased. Use RM- prefix for raw materials.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/60">Unit of Measure *</label>
                  <select
                    required
                    className={inputCls}
                    value={form.uomId}
                    onChange={(e) => setForm({ ...form, uomId: e.target.value })}
                  >
                    <option value="">Select unit...</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.symbol ? `(${u.symbol})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {editing && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Status</label>
                    <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="DISCONTINUED">Discontinued</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/60">Notes (optional)</label>
                  <textarea
                    rows={3}
                    className={`${inputCls} resize-none`}
                    placeholder="Any notes about this ingredient..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t border-line px-6 py-4">
                <div className="flex gap-3">
                  <button type="button" onClick={() => setDrawerOpen(false)} className="app-button-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !form.name || !form.sku || !form.uomId}
                    className="app-button-primary flex-1"
                  >
                    {saving ? "Saving..." : editing ? "Save changes" : "Add ingredient"}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setDeleting(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-ink">Remove ingredient?</h3>
            <p className="mt-1 text-sm text-ink/60">
              <strong>{deleting.name}</strong> ({deleting.sku}) will be removed from the ingredient list. Existing formula references will be retained.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleting(null)} className="app-button-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="app-button-danger flex-1">
                {deleteLoading ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
