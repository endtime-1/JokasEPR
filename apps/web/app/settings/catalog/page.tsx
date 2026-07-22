"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  FlaskConical,
  Layers,
  Package,
  PackagePlus,
  Pencil,
  Search,
  ShoppingCart,
  Trash2,
  X
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell";
import { ApiEnvelope, apiFetch } from "../../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type ProductType = "RAW_MATERIAL" | "FINISHED_GOOD" | "SEMI_FINISHED" | "CONSUMABLE" | "SERVICE";
type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  type: ProductType;
  status: ProductStatus;
  categoryId: string | null;
  uomId: string;
  category: { id: string; name: string; code: string } | null;
  uom: { id: string; name: string; symbol: string };
  createdAt: string;
};

type Option = { id: string; code: string; name: string; symbol?: string };

type CatalogData = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  typeCounts: Record<string, number>;
};

type FormState = {
  name: string;
  sku: string;
  type: ProductType;
  uomId: string;
  categoryId: string;
  description: string;
  status: ProductStatus;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ProductType, string> = {
  RAW_MATERIAL: "Raw Material",
  FINISHED_GOOD: "Finished Good",
  SEMI_FINISHED: "Semi-Finished",
  CONSUMABLE: "Consumable",
  SERVICE: "Service"
};

const TYPE_COLORS: Record<ProductType, string> = {
  RAW_MATERIAL: "bg-amber-50 text-amber-700 border-amber-200",
  FINISHED_GOOD: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SEMI_FINISHED: "bg-blue-50 text-blue-700 border-blue-200",
  CONSUMABLE: "bg-purple-50 text-purple-700 border-purple-200",
  SERVICE: "bg-slate-50 text-slate-600 border-slate-200"
};

const STATUS_COLORS: Record<ProductStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INACTIVE: "bg-amber-50 text-amber-700 border-amber-200",
  DISCONTINUED: "bg-red-50 text-red-700 border-red-200"
};

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  type: "RAW_MATERIAL",
  uomId: "",
  categoryId: "",
  description: "",
  status: "ACTIVE"
};

const inputCls =
  "min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
}) {
  return (
    <div className="app-stat-card flex items-center gap-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-ink">{value.toLocaleString()}</p>
        <p className="text-xs text-ink/50">{label}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductCatalogPage() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [uoms, setUoms] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [tab, setTab] = useState<ProductType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "">("");
  const [page, setPage] = useState(1);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete confirm
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts?: { search?: string; tab?: ProductType | "ALL"; status?: string; page?: number }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const s = opts?.search ?? search;
      const t = opts?.tab ?? tab;
      const st = opts?.status ?? statusFilter;
      const pg = opts?.page ?? page;
      if (s) params.set("search", s);
      if (t !== "ALL") params.set("type", t);
      if (st) params.set("status", st);
      params.set("page", String(pg));
      params.set("limit", "50");
      const res = await apiFetch<ApiEnvelope<CatalogData>>(`/settings/catalog/products?${params}`);
      setData(res.data);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [search, tab, statusFilter, page]);

  const loadOptions = useCallback(async () => {
    try {
      const res = await apiFetch<ApiEnvelope<{ unitsOfMeasure: Option[]; productCategories: Option[] }>>("/settings/master-data");
      setUoms(res.data.unitsOfMeasure ?? []);
      setCategories(res.data.productCategories ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    load();
  }, [tab, statusFilter, page]);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      load({ search: val, page: 1 });
    }, 350);
  }

  function handleTabChange(t: ProductType | "ALL") {
    setTab(t);
    setPage(1);
    load({ tab: t, page: 1 });
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDrawerOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      type: p.type,
      uomId: p.uomId,
      categoryId: p.categoryId ?? "",
      description: p.description ?? "",
      status: p.status
    });
    setSaveError(null);
    setDrawerOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        sku: form.sku,
        type: form.type,
        uomId: form.uomId,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined
      };
      if (editing) {
        body.status = form.status;
        await apiFetch(`/settings/catalog/products/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(body)
        });
      } else {
        await apiFetch("/settings/catalog/products", {
          method: "POST",
          body: JSON.stringify(body)
        });
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
      await apiFetch(`/settings/catalog/products/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      load();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Delete failed.");
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  const typeCounts = data?.typeCounts ?? {};
  const totalActive =
    (typeCounts["RAW_MATERIAL"] ?? 0) +
    (typeCounts["FINISHED_GOOD"] ?? 0) +
    (typeCounts["SEMI_FINISHED"] ?? 0) +
    (typeCounts["CONSUMABLE"] ?? 0) +
    (typeCounts["SERVICE"] ?? 0);

  const TABS: { key: ProductType | "ALL"; label: string }[] = [
    { key: "ALL", label: "All Products" },
    { key: "RAW_MATERIAL", label: "Raw Materials" },
    { key: "FINISHED_GOOD", label: "Finished Goods" },
    { key: "CONSUMABLE", label: "Consumables" },
    { key: "SEMI_FINISHED", label: "Semi-Finished" }
  ];

  return (
    <AppShell>
      <div className="space-y-6">

        {/* ── Page header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-ink/40 hover:text-brand">
                <ChevronLeft className="h-3 w-3" /> Settings
              </Link>
            </div>
            <p className="app-kicker">Product Management</p>
            <h1 className="mt-0.5 text-2xl font-bold text-ink">Product Catalog</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink/55">
              Manage raw materials (ingredients), finished goods, and consumables used across the feed mill, poultry, and soya operations.
            </p>
          </div>
          <button onClick={openCreate} className="app-button-primary">
            <PackagePlus className="h-4 w-4" />
            New Product
          </button>
        </div>

        {error && (
          <div className="app-alert-error">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── KPI cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active Raw Materials" value={typeCounts["RAW_MATERIAL"] ?? 0} icon={Package} accent="bg-amber-100 text-amber-600" />
          <StatCard label="Finished Goods" value={typeCounts["FINISHED_GOOD"] ?? 0} icon={Layers} accent="bg-emerald-100 text-emerald-600" />
          <StatCard label="Consumables" value={typeCounts["CONSUMABLE"] ?? 0} icon={ShoppingCart} accent="bg-purple-100 text-purple-600" />
          <StatCard label="Total Active" value={totalActive} icon={FlaskConical} accent="bg-brand/10 text-brand" />
        </div>

        {/* ── Filter bar ── */}
        <div className="app-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1" style={{ minWidth: 200 }}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as ProductStatus | ""); setPage(1); load({ status: e.target.value, page: 1 }); }}
              className={inputCls}
              style={{ width: "auto", minWidth: 150 }}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DISCONTINUED">Discontinued</option>
            </select>
          </div>

          {/* Tab bar */}
          <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === t.key
                    ? "bg-brand text-white shadow-sm"
                    : "text-ink/60 hover:bg-field hover:text-ink"
                }`}
              >
                {t.label}
                {t.key !== "ALL" && (typeCounts[t.key] ?? 0) > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t.key ? "bg-white/20 text-white" : "bg-line text-ink/50"}`}>
                    {typeCounts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Data table ── */}
        <div className="app-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-field/60">
                <tr className="text-[11px] font-bold uppercase tracking-wide text-ink/45">
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-line/40">
                        <td colSpan={7} className="px-5 py-3">
                          <div className="h-5 animate-pulse rounded-lg bg-line" style={{ width: `${60 + (i % 3) * 15}%` }} />
                        </td>
                      </tr>
                    ))
                  : (data?.items ?? []).map((p) => (
                      <tr key={p.id} className="border-b border-line/40 last:border-0 hover:bg-field/30 transition">
                        <td className="px-5 py-3">
                          <span className="rounded-md bg-field px-2 py-0.5 font-mono text-[11px] font-bold text-ink/60">{p.sku}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{p.name}</p>
                          {p.description && <p className="mt-0.5 text-xs text-ink/45 line-clamp-1">{p.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-ink/60">{p.category?.name ?? <span className="text-ink/30">—</span>}</td>
                        <td className="px-4 py-3 text-ink/60">{p.uom.symbol || p.uom.name}</td>
                        <td className="px-4 py-3">
                          <Badge label={TYPE_LABELS[p.type]} cls={TYPE_COLORS[p.type]} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={p.status} cls={STATUS_COLORS[p.status]} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="rounded-lg p-1.5 text-ink/40 hover:bg-field hover:text-brand transition"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleting(p)}
                              className="rounded-lg p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-600 transition"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loading && (data?.items.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <Package className="mx-auto mb-3 h-8 w-8 text-ink/20" />
                      <p className="font-semibold text-ink/40">No products found</p>
                      <p className="mt-1 text-xs text-ink/30">
                        {search || tab !== "ALL" || statusFilter ? "Try adjusting your filters." : "Create your first product to get started."}
                      </p>
                      {!search && tab === "ALL" && !statusFilter && (
                        <button onClick={openCreate} className="app-button-primary mt-4 mx-auto">
                          <PackagePlus className="h-4 w-4" /> Create product
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(data?.pages ?? 0) > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <p className="text-xs text-ink/50">
                {((page - 1) * (data?.limit ?? 50) + 1).toLocaleString()}–{Math.min(page * (data?.limit ?? 50), data?.total ?? 0).toLocaleString()} of {data?.total.toLocaleString()} products
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => { const p = page - 1; setPage(p); load({ page: p }); }}
                  className="app-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= (data?.pages ?? 1)}
                  onClick={() => { const p = page + 1; setPage(p); load({ page: p }); }}
                  className="app-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <p className="app-kicker">{editing ? "Edit Product" : "New Product"}</p>
                <h2 className="text-base font-bold text-ink">
                  {editing ? editing.name : "Create product"}
                </h2>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-ink/40 hover:bg-field hover:text-ink transition"
              >
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Product Name *</label>
                    <input
                      required
                      className={inputCls}
                      placeholder="e.g. Soya Bean Meal"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">SKU *</label>
                    <input
                      required
                      className={inputCls}
                      placeholder="e.g. SBM-001"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                    />
                    <p className="mt-1 text-[10px] text-ink/40">Unique product code — auto-uppercased</p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Product Type *</label>
                    <select
                      required
                      className={inputCls}
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as ProductType })}
                    >
                      <option value="RAW_MATERIAL">Raw Material (Ingredient)</option>
                      <option value="FINISHED_GOOD">Finished Good</option>
                      <option value="SEMI_FINISHED">Semi-Finished</option>
                      <option value="CONSUMABLE">Consumable</option>
                      <option value="SERVICE">Service</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Unit of Measure *</label>
                    <select
                      required
                      className={inputCls}
                      value={form.uomId}
                      onChange={(e) => setForm({ ...form, uomId: e.target.value })}
                    >
                      <option value="">Select UOM</option>
                      {uoms.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.symbol ? `(${u.symbol})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Category</label>
                    <select
                      className={inputCls}
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    >
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editing && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-ink/60">Status</label>
                      <select
                        className={inputCls}
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="DISCONTINUED">Discontinued</option>
                      </select>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-ink/60">Description</label>
                    <textarea
                      rows={3}
                      className={`${inputCls} resize-none`}
                      placeholder="Optional notes about this product..."
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                </div>

                {form.type === "RAW_MATERIAL" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    <strong>Tip:</strong> Raw materials are used as ingredients in feed formulas. After creating this product, go to the Feed Mill formulas section to assign it to a formula with its kg-per-ton ratio and unit cost.
                  </div>
                )}

                {form.type === "FINISHED_GOOD" && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                    <strong>Tip:</strong> Finished goods are the output of production batches. Assign this product as the output when creating a feed formula.
                  </div>
                )}
              </div>

              <div className="border-t border-line px-6 py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="app-button-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !form.name || !form.sku || !form.uomId}
                    className="app-button-primary flex-1"
                  >
                    {saving ? "Saving..." : editing ? "Save changes" : "Create product"}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={() => setDeleting(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-ink">Delete product?</h3>
            <p className="mt-1 text-sm text-ink/60">
              <strong>{deleting.name}</strong> ({deleting.sku}) will be archived and removed from active lists. Existing stock and formula references will be retained.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleting(null)} className="app-button-secondary flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="app-button-danger flex-1"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
