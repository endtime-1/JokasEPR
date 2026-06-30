"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, type ApiEnvelope } from "../../../lib/api";
import {
  Package,
  Search,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Save,
  Globe,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  isPublic: boolean;
  publicSlug: string | null;
  publicDescription: string | null;
  storefrontCategory: string | null;
  minOrderQty: number;
  unitLabel: string | null;
  unitPrice: number | null;
}

const CATEGORIES = ["Feed", "Eggs & Poultry", "Soya Products"];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ProductRow({ product, onSaved }: { product: AdminProduct; onSaved: (p: AdminProduct) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(product);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const dirty =
    draft.isPublic !== product.isPublic ||
    draft.publicSlug !== product.publicSlug ||
    draft.publicDescription !== product.publicDescription ||
    draft.storefrontCategory !== product.storefrontCategory ||
    draft.minOrderQty !== product.minOrderQty ||
    draft.unitLabel !== product.unitLabel;

  async function handleTogglePublish() {
    const next = { ...draft, isPublic: !draft.isPublic };
    setDraft(next);
    setSaving(true);
    try {
      await apiFetch<ApiEnvelope<unknown>>(`/public/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: next.isPublic }),
      });
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setDraft(draft);
      setErr("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      await apiFetch<ApiEnvelope<unknown>>(`/public/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isPublic: draft.isPublic,
          publicSlug: draft.publicSlug,
          publicDescription: draft.publicDescription,
          storefrontCategory: draft.storefrontCategory,
          minOrderQty: draft.minOrderQty,
          unitLabel: draft.unitLabel,
        }),
      });
      onSaved(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setErr("Save failed — check the slug is unique");
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof AdminProduct, value: string | number) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className={`rounded-2xl border bg-white transition-all ${expanded ? "border-brand/30 shadow-md" : "border-line shadow-sm"}`}>
      {/* Row header */}
      <div className="flex items-center gap-3 p-4">
        {/* Publish toggle */}
        <button
          onClick={handleTogglePublish}
          disabled={saving}
          title={draft.isPublic ? "Published — click to unpublish" : "Unpublished — click to publish"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
            draft.isPublic
              ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              : "bg-ink/5 text-ink/30 hover:bg-ink/10"
          }`}
        >
          {draft.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>

        {/* Product name & meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink">{product.name}</p>
            {draft.isPublic && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-100">
                Live
              </span>
            )}
            {saved && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink/40">
            {product.sku}
            {draft.storefrontCategory && <span className="ml-2 text-ink/30">· {draft.storefrontCategory}</span>}
            {draft.publicSlug && <span className="ml-2 text-ink/25">· /{draft.publicSlug}</span>}
          </p>
        </div>

        {/* Price */}
        <p className="shrink-0 text-sm font-semibold text-ink">
          {product.unitPrice ? `GHS ${product.unitPrice.toLocaleString()}` : <span className="text-ink/30">No price</span>}
        </p>

        {/* Expand */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink/4 text-ink/40 transition hover:bg-ink/8 hover:text-ink"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-line px-4 pb-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Slug */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/60">URL Slug</label>
              <div className="flex items-center gap-2">
                <input
                  value={draft.publicSlug ?? ""}
                  onChange={(e) => field("publicSlug", e.target.value)}
                  placeholder="e.g. broiler-starter-mash"
                  className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
                <button
                  onClick={() => field("publicSlug", slugify(product.name))}
                  className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/50 transition hover:border-brand/30 hover:text-brand"
                >
                  Auto
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/60">Storefront Category</label>
              <select
                value={draft.storefrontCategory ?? ""}
                onChange={(e) => field("storefrontCategory", e.target.value)}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
              >
                <option value="">None</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Min order qty */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/60">Min Order Qty</label>
              <input
                type="number"
                min={1}
                value={draft.minOrderQty}
                onChange={(e) => field("minOrderQty", parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </div>

            {/* Unit label */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/60">Unit Label</label>
              <input
                value={draft.unitLabel ?? ""}
                onChange={(e) => field("unitLabel", e.target.value)}
                placeholder="e.g. 50kg bag, crate, bird"
                className="w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </div>

            {/* Description — full width */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-ink/60">
                Public Description <span className="font-normal text-ink/35">(shown on website)</span>
              </label>
              <textarea
                value={draft.publicDescription ?? ""}
                onChange={(e) => field("publicDescription", e.target.value)}
                rows={3}
                placeholder="Describe the product for customers visiting the website…"
                className="w-full resize-none rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between gap-3">
            {err ? (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" /> {err}
              </div>
            ) : (
              <div />
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brandDark active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StorefrontProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PUBLISHED" | "UNPUBLISHED">("ALL");

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<ApiEnvelope<AdminProduct[]>>("/public/admin/products")
      .then((r) => setProducts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated: AdminProduct) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  const visible = products.filter((p) => {
    if (filter === "PUBLISHED" && !p.isPublic) return false;
    if (filter === "UNPUBLISHED" && p.isPublic) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const publishedCount = products.filter((p) => p.isPublic).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
              <Package className="h-3.5 w-3.5 text-brand" />
            </div>
            <h1 className="text-xl font-bold text-ink">Storefront Products</h1>
          </div>
          <p className="text-sm text-ink/50">
            {publishedCount} of {products.length} products published on the Akoko Solutions website.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
            {(["ALL", "PUBLISHED", "UNPUBLISHED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f ? "bg-brand text-white shadow-sm" : "text-ink/50 hover:text-ink"
                }`}
              >
                {f === "ALL" ? `All (${products.length})` : f === "PUBLISHED" ? `Live (${publishedCount})` : `Hidden (${products.length - publishedCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/35 shadow-sm focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
      </div>

      {/* Product list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/5">
            <Globe className="h-5 w-5 text-ink/25" />
          </div>
          <p className="font-semibold text-ink/40">No products found</p>
          <p className="text-sm text-ink/30">Try adjusting your search or filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <ProductRow key={p.id} product={p} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
