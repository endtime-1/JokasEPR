"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import type { PublicProduct } from "@/lib/api";
import { PRODUCT_IMAGES } from "@/lib/mock-data";

const CATEGORY_COLORS: Record<string, string> = {
  "Feed":           "from-amber-500/80 to-orange-600/80",
  "Eggs & Poultry": "from-orange-400/80 to-rose-500/80",
  "Soya Products":  "from-green-500/80 to-emerald-700/80",
};

interface Props {
  product: PublicProduct;
  featured?: boolean;
}

export default function PremiumProductCard({ product, featured = false }: Props) {
  const { addItem } = useCart();
  const [imgError, setImgError] = useState(false);
  const [added, setAdded] = useState(false);
  const imgSrc = PRODUCT_IMAGES[product.publicSlug];
  const gradient = CATEGORY_COLORS[product.storefrontCategory ?? ""] ?? "from-brand/80 to-brandDark/80";

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    addItem(product, product.minOrderQty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <Link
      href={`/products/${product.publicSlug}`}
      className={`product-card group relative block overflow-hidden rounded-3xl bg-white/6 ring-1 ring-white/10 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5)] ${
        featured ? "row-span-2" : ""
      }`}
    >
      {/* Image */}
      <div className={`relative overflow-hidden ${featured ? "h-96" : "h-64"}`}>
        {!imgError && imgSrc ? (
          <Image
            src={imgSrc}
            alt={product.name}
            fill
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
        {/* Overlay panel — slides up on hover */}
        <div className="product-card-overlay absolute inset-x-0 bottom-0 rounded-t-2xl bg-ink/92 p-5 backdrop-blur-sm">
          {/* Always-visible bottom strip: name + category */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand">
                {product.storefrontCategory}
              </span>
              <h3 className="mt-0.5 font-display text-xl leading-snug text-white">
                {product.name}
              </h3>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-black text-brand text-lg">
                GHS {product.price != null ? (product.price % 1 === 0 ? product.price.toLocaleString() : product.price.toFixed(2)) : "—"}
              </div>
              <div className="text-[10px] text-white/40">per {product.unitLabel}</div>
            </div>
          </div>

          {/* Hidden detail — revealed on hover */}
          <div className="product-card-detail mt-3">
            <p className="line-clamp-2 text-xs leading-relaxed text-white/55">
              {product.publicDescription}
            </p>
            <div className="mt-3.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/35">
                Min: {product.minOrderQty} {product.unitLabel}
              </span>
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-brand transition hover:bg-brandDark active:scale-95"
              >
                <ShoppingCart size={11} />
                {added ? "Added!" : "Add to Order"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
