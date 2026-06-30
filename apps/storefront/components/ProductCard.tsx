"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingCart, Check } from "lucide-react";
import type { PublicProduct } from "@/lib/api";
import { PRODUCT_IMAGES } from "@/lib/mock-data";
import { useCart } from "@/lib/cart-context";
import { useState } from "react";

const CATEGORY_STYLES: Record<string, { pill: string; fallbackBg: string; label: string }> = {
  Feed: {
    pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    fallbackBg: "from-amber-400 to-orange-500",
    label: "Poultry Feed",
  },
  "Eggs & Poultry": {
    pill: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    fallbackBg: "from-orange-400 to-rose-500",
    label: "Eggs & Poultry",
  },
  "Soya Products": {
    pill: "bg-green-50 text-green-700 ring-1 ring-green-200",
    fallbackBg: "from-green-500 to-emerald-600",
    label: "Soya Products",
  },
};

function ProductImage({ product }: { product: PublicProduct }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = PRODUCT_IMAGES[product.publicSlug];
  const cat = product.storefrontCategory ?? "Feed";
  const style = CATEGORY_STYLES[cat] ?? CATEGORY_STYLES["Feed"];

  if (!imgSrc || imgError) {
    return (
      <div className={`flex h-52 w-full items-end justify-start bg-gradient-to-br ${style.fallbackBg} p-4`}>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/60">
            Akoko Solutions
          </div>
          <div className="mt-0.5 text-sm font-extrabold uppercase leading-tight text-white">
            {product.name}
          </div>
          {product.unitLabel && (
            <div className="mt-1 text-[10px] text-white/50">{product.unitLabel}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-52 w-full overflow-hidden">
      <Image
        src={imgSrc}
        alt={product.name}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        onError={() => setImgError(true)}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      />
      {/* gradient overlay so text pops if we add a bottom label */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
    </div>
  );
}

export default function ProductCard({ product }: { product: PublicProduct }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const cat = product.storefrontCategory ?? "Feed";
  const style = CATEGORY_STYLES[cat] ?? CATEGORY_STYLES["Feed"];

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    addItem(product, product.minOrderQty || 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <Link
      href={`/products/${product.publicSlug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-cardHover"
    >
      <ProductImage product={product} />

      <div className="flex flex-1 flex-col p-5">
        <span className={`mb-2.5 inline-block self-start rounded-full px-2.5 py-0.5 text-2xs font-semibold ${style.pill}`}>
          {style.label}
        </span>

        <h3 className="font-bold leading-snug text-ink transition-colors group-hover:text-brand">
          {product.name}
        </h3>

        {product.publicDescription && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
            {product.publicDescription}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            {product.price != null ? (
              <>
                <div className="text-xl font-black text-brand">
                  GHS {product.price % 1 === 0 ? product.price.toLocaleString() : product.price.toFixed(2)}
                </div>
                <div className="text-2xs text-muted">per {product.unitLabel ?? "unit"}</div>
              </>
            ) : (
              <span className="text-xs italic text-muted">Price on request</span>
            )}
          </div>
          {product.minOrderQty > 1 && (
            <span className="rounded-lg bg-warm px-2 py-1 text-2xs font-semibold text-ink/50">
              Min {product.minOrderQty}
            </span>
          )}
        </div>

        <button
          onClick={handleAdd}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-95 ${
            added ? "bg-green-500" : "bg-brand shadow-brandSm hover:bg-brandDark"
          }`}
        >
          {added ? <><Check size={14} /> Added!</> : <><ShoppingCart size={14} /> Add to Order</>}
        </button>
      </div>
    </Link>
  );
}
