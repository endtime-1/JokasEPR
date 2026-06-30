"use client";

import { useCart } from "@/lib/cart-context";
import Link from "next/link";
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight, ShieldCheck } from "lucide-react";

export default function CartPage() {
  const { items, totalPrice, updateQty, removeItem } = useCart();

  if (!items.length)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-32 text-center">
        <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-warm">
          <ShoppingBag size={40} className="text-brand/40" />
        </div>
        <h2 className="text-2xl font-extrabold text-ink">Your cart is empty</h2>
        <p className="mt-2 text-muted">Browse our products and add items to get started.</p>
        <Link
          href="/products"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-brand hover:bg-brandDark"
        >
          Browse Products <ArrowRight size={15} />
        </Link>
      </div>
    );

  return (
    <div className="bg-white">
      <div className="border-b border-gray-100 bg-warm">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h1 className="text-3xl font-extrabold text-ink">Your Order</h1>
          <p className="mt-1 text-muted">{items.length} item{items.length !== 1 ? "s" : ""} ready for checkout</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Item list */}
          <div className="space-y-3 lg:col-span-3">
            {items.map(({ product, qty }) => {
              const min = product.minOrderQty || 1;
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card"
                >
                  {/* Category color strip */}
                  <div
                    className={`flex h-16 w-14 shrink-0 items-center justify-center rounded-xl ${
                      product.storefrontCategory === "Feed"
                        ? "bg-gradient-to-br from-amber-400 to-orange-500"
                        : product.storefrontCategory === "Soya Products"
                        ? "bg-gradient-to-br from-green-500 to-emerald-600"
                        : "bg-gradient-to-br from-orange-400 to-rose-500"
                    }`}
                  >
                    <ShoppingBag size={22} className="text-white/80" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="truncate font-bold text-ink">{product.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{product.unitLabel}</p>
                    {product.price != null && (
                      <p className="mt-1 text-sm font-bold text-brand">
                        GHS {(product.price * qty).toFixed(2)}
                        <span className="ml-1 text-xs font-normal text-muted">
                          (GHS {product.price.toFixed(2)} each)
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center overflow-hidden rounded-lg border border-gray-200">
                    <button
                      onClick={() => {
                        if (qty - 1 < min) removeItem(product.id);
                        else updateQty(product.id, qty - 1);
                      }}
                      className="flex h-8 w-8 items-center justify-center text-muted transition hover:bg-gray-50 hover:text-ink"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="flex h-8 w-9 items-center justify-center text-sm font-bold text-ink">
                      {qty}
                    </span>
                    <button
                      onClick={() => updateQty(product.id, qty + 1)}
                      className="flex h-8 w-8 items-center justify-center text-muted transition hover:bg-gray-50 hover:text-ink"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(product.id)}
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition hover:bg-red-50 hover:text-red-400"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Summary panel */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-2xl border border-gray-100 bg-white p-6 shadow-panel">
              <h2 className="mb-5 text-lg font-extrabold text-ink">Order Summary</h2>

              <div className="space-y-3 text-sm">
                {items.map(({ product, qty }) => (
                  <div key={product.id} className="flex items-start justify-between gap-2">
                    <span className="max-w-[160px] text-muted leading-snug">
                      {product.name} × {qty}
                    </span>
                    {product.price != null ? (
                      <span className="shrink-0 font-semibold text-ink">
                        GHS {(product.price * qty).toFixed(2)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs italic text-muted">TBD</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="my-4 border-t border-dashed border-gray-200" />

              {totalPrice != null ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">Estimated Total</span>
                  <span className="text-xl font-black text-brand">GHS {totalPrice.toFixed(2)}</span>
                </div>
              ) : (
                <p className="text-xs text-muted leading-relaxed">
                  Some items are priced on request. Our team confirms the final total when they call you.
                </p>
              )}

              <div className="my-4 rounded-xl bg-warm p-3 text-xs text-muted">
                Delivery charges calculated at confirmation based on your location.
              </div>

              <Link
                href="/checkout"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-brand hover:bg-brandDark"
              >
                Proceed to Checkout <ArrowRight size={15} />
              </Link>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck size={12} className="text-green-500" />
                Orders reviewed personally by our team
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
