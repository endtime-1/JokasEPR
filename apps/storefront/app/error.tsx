"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center">
      <h2 className="text-2xl font-extrabold text-ink">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred. Please try again or browse our products.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-brand hover:bg-brandDark"
        >
          <RefreshCw size={14} /> Try again
        </button>
        <Link
          href="/products"
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand hover:text-brand transition"
        >
          Browse products
        </Link>
      </div>
    </div>
  );
}
