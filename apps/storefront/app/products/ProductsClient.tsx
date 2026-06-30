"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { label: "All Products", value: "All", count: "14" },
  { label: "Poultry Feed", value: "Feed", count: "10" },
  { label: "Eggs & Poultry", value: "Eggs & Poultry", count: "2" },
  { label: "Soya Products", value: "Soya Products", count: "2" },
];

export default function ProductsClient({ activeCategory }: { activeCategory?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = activeCategory ?? "All";

  function setCategory(cat: string) {
    const params = new URLSearchParams(sp.toString());
    if (cat === "All") params.delete("category");
    else params.set("category", cat);
    router.push(`/products?${params.toString()}`);
  }

  return (
    <div className="mb-8 flex flex-wrap items-center gap-2.5">
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
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
