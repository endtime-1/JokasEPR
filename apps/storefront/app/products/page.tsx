import { Suspense } from "react";
import { api } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ProductsClient from "./ProductsClient";
import { SlidersHorizontal } from "lucide-react";

export const revalidate = 60;
export const metadata = { title: "Products — Akoko Solutions" };

async function ProductGrid({ category }: { category?: string }) {
  const products = await api.products.list(category).catch(() => []);

  if (!products.length)
    return (
      <div className="col-span-full py-24 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warm">
          <SlidersHorizontal size={28} className="text-muted" />
        </div>
        <p className="font-semibold text-ink">No products found</p>
        <p className="mt-1 text-sm text-muted">
          {category ? `No products in "${category}"` : "Check back soon"}
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
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await props.searchParams;

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
        {/* Category filter */}
        <ProductsClient activeCategory={category} />

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Suspense
            fallback={Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          >
            <ProductGrid category={category} />
          </Suspense>
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
