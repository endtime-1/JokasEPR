"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, ArrowRight, Phone } from "lucide-react";

export default function TrackOrderPage() {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = ref.trim();
    if (!trimmed) {
      setError("Enter your order reference number.");
      return;
    }
    router.push(`/order/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="bg-white">
      <div className="border-b border-gray-100 bg-warm">
        <div className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
            <Package size={26} className="text-brand" />
          </div>
          <h1 className="text-3xl font-extrabold text-ink">Track Your Order</h1>
          <p className="mt-2 text-muted">
            Enter the reference number from your order confirmation to check its status.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ref" className="mb-1.5 block text-xs font-semibold text-ink">
              Order Reference
            </label>
            <input
              id="ref"
              type="text"
              value={ref}
              onChange={(e) => { setRef(e.target.value); setError(""); }}
              placeholder="e.g. AKO-2026-0042"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-sm uppercase tracking-wide transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
            {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark active:scale-95"
          >
            Track Order <ArrowRight size={15} />
          </button>
        </form>

        <div className="mt-8 rounded-xl bg-warm p-4 text-center text-sm text-muted">
          Can&apos;t find your reference?{" "}
          <a href="tel:+233505455090" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
            <Phone size={12} /> Call +233 505 455 090
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an order yet?{" "}
          <Link href="/products" className="font-semibold text-brand hover:underline">
            Browse products
          </Link>
        </p>
      </div>
    </div>
  );
}
