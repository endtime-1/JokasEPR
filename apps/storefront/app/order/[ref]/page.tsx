"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type PublicOrder } from "@/lib/api";
import Link from "next/link";
import { CheckCircle2, Loader2, Phone, ArrowRight, Package } from "lucide-react";
import { LogoIcon } from "@/components/Logo";

const STATUS_CONFIG: Record<string, { label: string; step: number; color: string; bg: string }> = {
  DRAFT:      { label: "Pending Review",       step: 0, color: "text-amber-600",   bg: "bg-amber-50" },
  PENDING:    { label: "Pending Review",       step: 0, color: "text-amber-600",   bg: "bg-amber-50" },
  CONFIRMED:  { label: "Order Confirmed",      step: 1, color: "text-blue-600",    bg: "bg-blue-50" },
  PROCESSING: { label: "Being Prepared",       step: 2, color: "text-purple-600",  bg: "bg-purple-50" },
  READY:      { label: "Ready for Delivery",   step: 3, color: "text-emerald-600", bg: "bg-emerald-50" },
  DELIVERED:  { label: "Delivered",            step: 4, color: "text-green-700",   bg: "bg-green-50" },
};

const STEPS = ["Received", "Confirmed", "Prepared", "Ready", "Delivered"];

export default function OrderStatusPage() {
  const { ref } = useParams<{ ref: string }>();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.orders
      .status(ref)
      .then(setOrder)
      .catch(() => setError("Order not found. Please check your reference number."))
      .finally(() => setLoading(false));
  }, [ref]);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={36} className="animate-spin text-brand" />
      </div>
    );

  if (error)
    return (
      <div className="mx-auto max-w-lg px-4 py-32 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <Package size={28} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-ink">Order Not Found</h2>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <Link href="/products" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
          Back to Shop
        </Link>
      </div>
    );

  if (!order) return null;

  const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["PENDING"];

  return (
    <div className="bg-white">
      {/* Success header */}
      <div className="bg-gradient-to-br from-ink to-inkMid py-16 text-white">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/20">
            <CheckCircle2 size={40} className="text-green-400" />
          </div>
          <h1 className="text-3xl font-extrabold">Order Received!</h1>
          <p className="mt-2 text-white/60">
            Thank you for your order. Our team will be in touch shortly.
          </p>
          <div className="mt-4 inline-flex items-center gap-3 rounded-xl bg-white/8 px-5 py-3 font-mono text-lg font-bold text-white ring-1 ring-white/10">
            <LogoIcon size={22} />
            {order.storefrontRef}
          </div>
          <p className="mt-2 text-xs text-white/40">
            Placed {new Date(order.createdAt).toLocaleDateString("en-GH", { dateStyle: "long" })}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        {/* Status tracker */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-extrabold text-ink">Order Status</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.bg} ${status.color}`}>
              {status.label}
            </span>
          </div>

          {/* Step tracker */}
          <div className="relative mt-2">
            <div className="absolute left-4 right-4 top-5 h-0.5 bg-gray-100" />
            <div
              className="absolute left-4 top-5 h-0.5 bg-brand transition-all duration-700"
              style={{ width: `calc(${(status.step / (STEPS.length - 1)) * 100}% - 2rem)` }}
            />
            <div className="relative flex justify-between px-0">
              {STEPS.map((s, i) => (
                <div key={s} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      i <= status.step
                        ? "bg-brand text-white shadow-brandSm"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i < status.step ? <CheckCircle2 size={16} /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-semibold ${i <= status.step ? "text-brand" : "text-gray-300"}`}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <h2 className="mb-4 font-extrabold text-ink">Items Ordered</h2>
          <ul className="divide-y divide-gray-100">
            {order.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <span className="font-medium text-ink">{l.productName}</span>
                  <span className="ml-2 text-muted">× {l.qty}</span>
                </div>
                {l.unitPrice > 0 ? (
                  <span className="font-semibold text-ink">GHS {(l.unitPrice * l.qty).toFixed(2)}</span>
                ) : (
                  <span className="text-xs italic text-muted">Price TBD</span>
                )}
              </li>
            ))}
          </ul>
          {order.total > 0 && (
            <div className="flex items-center justify-between border-t border-dashed border-gray-200 pt-3 font-bold">
              <span className="text-sm text-ink">Total</span>
              <span className="text-lg text-brand">GHS {order.total.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Next steps card */}
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="mb-2 font-bold text-amber-900">What happens next?</h3>
          <ol className="space-y-1.5 text-sm text-amber-800">
            <li className="flex gap-2"><span className="font-bold">1.</span> Our team reviews your order (usually within a few hours)</li>
            <li className="flex gap-2"><span className="font-bold">2.</span> We call you to confirm details and arrange delivery</li>
            <li className="flex gap-2"><span className="font-bold">3.</span> Products are packed and dispatched on the agreed date</li>
          </ol>
          <p className="mt-3 text-xs text-amber-700">
            Save your reference: <span className="font-mono font-bold">{ref}</span> — you'll need it to check status.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/products"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3 text-sm font-bold text-white shadow-brand hover:bg-brandDark"
          >
            Continue Shopping <ArrowRight size={14} />
          </Link>
          <a
            href="tel:+233XXXXXXXX"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-7 py-3 text-sm font-semibold text-ink hover:border-brand hover:text-brand transition"
          >
            <Phone size={14} /> Call Us About This Order
          </a>
        </div>
      </div>
    </div>
  );
}
