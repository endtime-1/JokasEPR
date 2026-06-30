"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type PublicProduct } from "@/lib/api";
import { PRODUCT_IMAGES } from "@/lib/mock-data";
import { useCart } from "@/lib/cart-context";
import { Minus, Plus, ShoppingCart, ArrowLeft, Check, Truck, ShieldCheck, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const CATEGORY_STYLES: Record<string, { pill: string; bg: string }> = {
  Feed: { pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", bg: "from-amber-400 to-orange-500" },
  "Eggs & Poultry": { pill: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", bg: "from-orange-400 to-rose-500" },
  "Soya Products": { pill: "bg-green-50 text-green-700 ring-1 ring-green-200", bg: "from-green-500 to-emerald-600" },
};

function ProductHeroImage({ product }: { product: PublicProduct }) {
  const [error, setError] = useState(false);
  const cat = product.storefrontCategory ?? "Feed";
  const style = CATEGORY_STYLES[cat] ?? CATEGORY_STYLES["Feed"];
  const src = PRODUCT_IMAGES[product.publicSlug];

  if (!src || error) {
    return (
      <div className={`flex h-full min-h-[360px] items-end justify-start rounded-3xl bg-gradient-to-br ${style.bg} p-8`}>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-white/60">Akoko Solutions</div>
          <div className="mt-1 text-2xl font-extrabold uppercase leading-tight text-white">{product.name}</div>
          {product.unitLabel && <div className="mt-2 text-sm text-white/50">{product.unitLabel}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-3xl">
      <Image
        src={src}
        alt={product.name}
        fill
        className="object-cover"
        onError={() => setError(true)}
        sizes="(max-width: 768px) 100vw, 50vw"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      <div className="absolute bottom-5 left-5">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.pill} bg-white`}>
          {cat}
        </span>
      </div>
    </div>
  );
}

const GUARANTEES = [
  { icon: <ShieldCheck size={15} />, label: "Quality guaranteed — every batch inspected" },
  { icon: <Truck size={15} />, label: "Nationwide delivery available" },
  { icon: <RefreshCw size={15} />, label: "Standing orders & bulk pricing on request" },
];

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { addItem, items } = useCart();

  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const inCart = items.find((i) => i.product.publicSlug === slug);

  useEffect(() => {
    api.products
      .get(slug)
      .then((p) => {
        setProduct(p);
        setQty(p.minOrderQty || 1);
      })
      .catch(() => router.replace("/products"))
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading)
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="h-96 animate-pulse rounded-3xl bg-gray-100" />
          <div className="space-y-5 pt-4">
            {[120, 200, 80, 300, 100].map((w, i) => (
              <div key={i} className="h-4 animate-pulse rounded-full bg-gray-100" style={{ width: w }} />
            ))}
          </div>
        </div>
      </div>
    );

  if (!product) return null;

  const min = product.minOrderQty || 1;
  const cat = product.storefrontCategory ?? "Feed";
  const style = CATEGORY_STYLES[cat] ?? CATEGORY_STYLES["Feed"];

  function handleAdd() {
    if (!product) return;
    addItem(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="bg-white">
      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-warm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-xs text-muted sm:px-6">
          <Link href="/" className="hover:text-brand transition-colors">Home</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-brand transition-colors">Products</Link>
          <span>/</span>
          <span className="font-medium text-ink">{product.name}</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Link
          href="/products"
          className="mb-10 inline-flex items-center gap-1.5 rounded-lg bg-warm px-3 py-1.5 text-sm font-medium text-muted hover:text-brand transition-colors"
        >
          <ArrowLeft size={13} /> Back to products
        </Link>

        <div className="grid gap-14 md:grid-cols-2">
          {/* Product image */}
          <div className="relative overflow-hidden rounded-3xl">
            <ProductHeroImage product={product} />
          </div>

          {/* Details */}
          <div>
            {/* Category badge */}
            <span className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${style.pill}`}>
              {cat}
            </span>

            <h1 className="text-4xl font-black leading-tight text-ink">{product.name}</h1>

            {/* Price */}
            {product.price != null ? (
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-black text-brand">GHS {product.price.toFixed(2)}</span>
                {product.unitLabel && (
                  <span className="text-sm text-muted">/ {product.unitLabel}</span>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-warm px-4 py-3 text-sm text-muted">
                Price on request — contact us for a custom quote.
              </div>
            )}

            {/* Min order notice */}
            {min > 1 && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                Minimum order: {min} × {product.unitLabel ?? "unit"}
              </div>
            )}

            {/* Description */}
            {product.publicDescription && (
              <p className="mt-6 text-[15px] leading-relaxed text-muted">{product.publicDescription}</p>
            )}

            {/* Specs */}
            <div className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
              {[
                { label: "Unit", value: product.unitLabel ?? "—" },
                { label: "Category", value: cat },
                { label: "Minimum Order", value: `${min} ${min === 1 ? product.unitLabel ?? "unit" : (product.unitLabel ?? "units")}` },
                {
                  label: "Total (min order)",
                  value: product.price != null ? `GHS ${(product.price * min).toFixed(2)}` : "Contact us",
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-muted">{row.label}</span>
                  <span className="font-semibold text-ink">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Qty selector */}
            <div className="mt-8 flex items-center gap-3">
              <div className="flex overflow-hidden rounded-xl border border-gray-200">
                <button
                  onClick={() => setQty((q) => Math.max(min, q - 1))}
                  className="flex h-12 w-12 items-center justify-center text-muted transition hover:bg-gray-50 hover:text-ink"
                >
                  <Minus size={16} />
                </button>
                <div className="flex h-12 w-14 items-center justify-center text-base font-bold text-ink">
                  {qty}
                </div>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="flex h-12 w-12 items-center justify-center text-muted transition hover:bg-gray-50 hover:text-ink"
                >
                  <Plus size={16} />
                </button>
              </div>

              {product.price != null && (
                <div className="text-sm text-muted">
                  Total:{" "}
                  <span className="font-bold text-ink">GHS {(product.price * qty).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* CTAs */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleAdd}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-brand transition-all active:scale-95 ${
                  added ? "bg-green-500" : "bg-brand hover:bg-brandDark"
                }`}
              >
                {added ? <><Check size={15} /> Added to Order!</> : <><ShoppingCart size={15} /> Add to Order</>}
              </button>

              {inCart && (
                <Link
                  href="/cart"
                  className="rounded-xl border border-brand px-4 py-3.5 text-sm font-semibold text-brand transition hover:bg-warm"
                >
                  View Cart ({inCart.qty})
                </Link>
              )}
            </div>

            {/* Guarantees */}
            <div className="mt-6 space-y-2">
              {GUARANTEES.map((g) => (
                <div key={g.label} className="flex items-center gap-2 text-xs text-muted">
                  <span className="text-green-500">{g.icon}</span>
                  {g.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
