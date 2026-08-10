import { api, type PublicProduct } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ProductsClient from "./ProductsClient";
import { SlidersHorizontal } from "lucide-react";

export const revalidate = 60;
export const metadata = { title: "Products — Akoko Solutions" };

const CATEGORY_LIST = ["Feed", "Eggs & Poultry", "Soya Products"] as const;

function ProductGrid({
  products,
  apiError,
  category,
  q,
}: {
  products: PublicProduct[];
  apiError: boolean;
  category?: string;
  q?: string;
}) {
  if (apiError)
    return (
      <div className="col-span-full py-24 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <SlidersHorizontal size={28} className="text-red-400" />
        </div>
        <p className="font-semibold text-ink">Products temporarily unavailable</p>
        <p className="mt-1 text-sm text-muted">
          We&apos;re having trouble connecting right now. Please try again shortly, or call us on{" "}
          <a href="tel:+233505455090" className="text-brand font-semibold hover:underline">+233 505 455 090</a>.
        </p>
      </div>
    );

  if (!products.length)
    return (
      <div className="col-span-full py-24 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warm">
          <SlidersHorizontal size={28} className="text-muted" />
        </div>
        <p className="font-semibold text-ink">No products found</p>
        <p className="mt-1 text-sm text-muted">
          {q
            ? `No products matching "${q}"${category ? ` in "${category}"` : ""}`
            : category
            ? `No products in "${category}" yet`
            : "Check back soon"}
        </p>
      </div>
    );

  return (
    <>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </>
  );
}

export default async function ProductsPage(props: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await props.searchParams;

  let allProducts: PublicProduct[] = [];
  let apiError = false;
  try {
    allProducts = await api.products.list();
  } catch {
    apiError = true;
  }

  const counts: Record<string, number> = { All: allProducts.length };
  for (const cat of CATEGORY_LIST) {
    counts[cat] = allProducts.filter((p) => p.storefrontCategory === cat).length;
  }

  const query = q?.trim().toLowerCase();
  const filtered = allProducts.filter((p) => {
    if (category && p.storefrontCategory !== category) return false;
    if (query) {
      const haystack = `${p.name} ${p.publicDescription ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="bg-white">
      {/* Page header */}
      <div className="border-b border-gray-100 bg-warm">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-brand">
            Akoko Solutions
          </p>
          <h1 className="text-3xl font-extrabold text-ink">
            {category ? category : "All Products"}
          </h1>
          <p className="mt-1 text-muted">
            Mill-fresh feed, farm eggs, and soya products — direct from Akoko Solutions
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Category filter + search */}
        <ProductsClient activeCategory={category} activeQuery={q} counts={counts} />

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ProductGrid products={filtered} apiError={apiError} category={category} q={q} />
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-3xl bg-dark-gradient p-10 text-center text-white">
          <h2 className="text-2xl font-extrabold">Need a bulk price or custom order?</h2>
          <p className="mt-2 text-white/60">
            We offer volume discounts and can accommodate recurring supply arrangements.
          </p>
          <a
            href="mailto:orders@akokosolutions.com?subject=Bulk Order Enquiry"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark"
          >
            Contact Us for Pricing
          </a>
        </div>
      </div>
    </div>
  );
}
