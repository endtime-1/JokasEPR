"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { api } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, ShieldCheck, Phone, User, MapPin, FileText, Mail } from "lucide-react";

const FIELDS = [
  { id: "name", label: "Full Name", icon: <User size={14} />, type: "text", required: true, placeholder: "e.g. Kwame Asante" },
  { id: "phone", label: "Phone Number", icon: <Phone size={14} />, type: "tel", required: true, placeholder: "+233 XX XXX XXXX" },
  { id: "email", label: "Email Address", icon: <Mail size={14} />, type: "email", required: false, placeholder: "optional" },
  { id: "address", label: "Delivery Address", icon: <MapPin size={14} />, type: "text", required: true, placeholder: "Town, region — or 'Farm pickup'" },
  { id: "notes", label: "Notes", icon: <FileText size={14} />, type: "textarea", required: false, placeholder: "Delivery instructions, questions…" },
] as const;

export default function CheckoutPage() {
  const { items, totalPrice, clear } = useCart();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!items.length)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-24 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/products" className="mt-4 text-sm font-semibold text-brand hover:underline">
          Browse products
        </Link>
      </div>
    );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.orders.place({
        customerName: form.name,
        customerPhone: form.phone,
        customerEmail: form.email || undefined,
        deliveryAddress: form.address,
        notes: form.notes || undefined,
        lines: items.map((i) => ({
          productId: i.product.id,
          qty: i.qty,
          unitPrice: i.product.price ?? 0,
        })),
      });
      clear();
      router.push(`/order/${result.storefrontRef}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white">
      <div className="border-b border-gray-100 bg-warm">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          {/* Progress */}
          <div className="mb-4 flex items-center gap-2 text-xs text-muted">
            <Link href="/cart" className="hover:text-brand transition-colors">Cart</Link>
            <span className="text-gray-300">›</span>
            <span className="font-semibold text-brand">Checkout</span>
            <span className="text-gray-300">›</span>
            <span>Confirmation</span>
          </div>
          <h1 className="text-3xl font-extrabold text-ink">Checkout</h1>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link href="/cart" className="mb-8 inline-flex items-center gap-1.5 rounded-lg bg-warm px-3 py-1.5 text-sm font-medium text-muted hover:text-brand transition-colors">
          <ArrowLeft size={13} /> Back to cart
        </Link>

        <div className="grid gap-10 md:grid-cols-5">
          {/* Form */}
          <div className="md:col-span-3">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-ink">Your Details</h2>
              <p className="mt-1 text-sm text-muted">
                Our team will call you on the number below to confirm and arrange delivery.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {FIELDS.map((f) => (
                <div key={f.id}>
                  <label htmlFor={f.id} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <span className="text-muted">{f.icon}</span>
                    {f.label}
                    {f.required && <span className="text-brand">*</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.id}
                      rows={3}
                      placeholder={f.placeholder}
                      value={form[f.id as keyof typeof form]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.id]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                    />
                  ) : (
                    <input
                      id={f.id}
                      type={f.type}
                      required={f.required}
                      placeholder={f.placeholder}
                      value={form[f.id as keyof typeof form]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.id]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark disabled:opacity-60"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Placing order…</>
                ) : (
                  <><CheckCircle2 size={16} /> Place Order</>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck size={12} className="text-green-500" />
                Your details are only used to confirm and deliver your order
              </div>
            </form>
          </div>

          {/* Summary */}
          <div className="md:col-span-2">
            <div className="sticky top-24 rounded-2xl border border-gray-100 bg-white p-5 shadow-panel">
              <h3 className="mb-4 font-bold text-ink text-sm">Order Summary</h3>
              <ul className="space-y-3">
                {items.map(({ product, qty }) => (
                  <li key={product.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-muted leading-snug">
                      <span className="block font-semibold text-ink">{product.name}</span>
                      {qty} × {product.unitLabel}
                    </span>
                    {product.price != null ? (
                      <span className="shrink-0 font-bold text-ink">
                        GHS {(product.price * qty).toFixed(2)}
                      </span>
                    ) : (
                      <span className="shrink-0 italic text-muted">TBD</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="my-4 border-t border-dashed border-gray-200" />

              {totalPrice != null ? (
                <div className="flex items-center justify-between font-bold">
                  <span className="text-sm text-ink">Total</span>
                  <span className="text-lg text-brand">GHS {totalPrice.toFixed(2)}</span>
                </div>
              ) : (
                <p className="text-xs text-muted leading-relaxed">
                  Final total confirmed by our team after order review.
                </p>
              )}

              <div className="mt-4 rounded-xl bg-warm p-3 text-xs text-muted">
                💡 Delivery fees calculated based on your location and order volume.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
