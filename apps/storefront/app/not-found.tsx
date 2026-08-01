import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-5xl font-black text-brand">404</p>
      <h2 className="mt-4 text-2xl font-extrabold text-ink">Page not found</h2>
      <p className="mt-2 text-sm text-muted">
        This page doesn't exist or has been moved.
      </p>
      <Link
        href="/products"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3 text-sm font-bold text-white shadow-brand hover:bg-brandDark"
      >
        Browse products <ArrowRight size={14} />
      </Link>
    </div>
  );
}
