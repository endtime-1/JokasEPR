"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

const CATEGORIES = [
  { label: "All Products", value: "All" },
  { label: "Poultry Feed", value: "Feed" },
  { label: "Eggs & Poultry", value: "Eggs & Poultry" },
  { label: "Soya Products", value: "Soya Products" },
];

export default function ProductsClient({
  activeCategory,
  activeQuery,
  counts,
}: {
  activeCategory?: string;
  activeQuery?: string;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = activeCategory ?? "All";
  const [q, setQ] = useState(activeQuery ?? "");

  function setCategory(cat: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat === "All") params.delete("category");
    else params.set("category", cat);
    router.push(`/products?${params.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`/products?${params.toString()}`);
  }

  function clearSearch() {
    setQ("");
    const params = new URLSearchParams(sp.toString());
    params.delete("q");
    router.push(`/products?${params.toString()}`);
  }

  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="mr-1 text-sm font-semibold text-muted">Filter:</span>
        {CATEGORIES.map((c) => {
          const isActive = active === c.value || (c.value === "All" && !activeCategory);
          return (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                isActive
                  ? "bg-brand text-white shadow-brandSm"
                  : "bg-gray-100 text-muted hover:bg-warm hover:text-brand"
              }`}
            >
              {c.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-white text-muted"
                }`}
              >
                {counts[c.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submitSearch} className="relative w-full sm:w-64">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        {q && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-brand"
          >
            <X size={14} />
          </button>
        )}
      </form>
    </div>
  );
}
