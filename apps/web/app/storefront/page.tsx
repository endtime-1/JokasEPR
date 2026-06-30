"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, type ApiEnvelope } from "../../lib/api";
import {
  Globe,
  Package,
  ShoppingBag,
  CheckCircle2,
  Clock,
  Truck,
  ArrowRight,
  ExternalLink,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Stats {
  published: number;
  pending: number;
  confirmed: number;
  delivered: number;
  total: number;
}

export default function StorefrontPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ApiEnvelope<Stats>>("/public/admin/stats")
      .then((r) => setStats(r.data))
      .catch(() => setStats({ published: 0, pending: 0, confirmed: 0, delivered: 0, total: 0 }))
      .finally(() => setLoading(false));
  }, []);

  const cards: { label: string; value: number; icon: LucideIcon; color: string; ring: string; href: string }[] = [
    {
      label: "Published Products",
      value: stats?.published ?? 0,
      icon: Package,
      color: "bg-emerald-50 text-emerald-600",
      ring: "ring-emerald-100",
      href: "/storefront/products",
    },
    {
      label: "Pending Orders",
      value: stats?.pending ?? 0,
      icon: Clock,
      color: "bg-amber-50 text-amber-600",
      ring: "ring-amber-100",
      href: "/storefront/orders?status=PENDING_STOCK_APPROVAL",
    },
    {
      label: "Confirmed Orders",
      value: stats?.confirmed ?? 0,
      icon: CheckCircle2,
      color: "bg-blue-50 text-blue-600",
      ring: "ring-blue-100",
      href: "/storefront/orders?status=APPROVED",
    },
    {
      label: "Total Storefront Orders",
      value: stats?.total ?? 0,
      icon: TrendingUp,
      color: "bg-brand/8 text-brand",
      ring: "ring-brand/15",
      href: "/storefront/orders",
    },
  ];

  const quickLinks: { href: string; label: string; sub: string; icon: LucideIcon }[] = [
    { href: "/storefront/products", label: "Manage Products", sub: "Publish, set descriptions & prices", icon: Package },
    { href: "/storefront/orders", label: "Orders Inbox", sub: "Review and action customer orders", icon: ShoppingBag },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10">
              <Globe className="h-4 w-4 text-brand" />
            </div>
            <h1 className="text-xl font-bold text-ink">Akoko Storefront</h1>
          </div>
          <p className="text-sm text-ink/50">
            Manage what appears on the Akoko Solutions public website and action incoming web orders.
          </p>
        </div>
        <a
          href="http://localhost:3002"
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-brand/30 hover:text-brand"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Live Site
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className={`group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm ring-1 ${c.ring} transition hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${c.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-black text-ink">
                  {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded-lg bg-ink/8" /> : c.value}
                </p>
                <p className="truncate text-xs text-ink/50">{c.label}</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center gap-5 rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/8 transition group-hover:bg-brand/14">
                <Icon className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{l.label}</p>
                <p className="text-sm text-ink/45">{l.sub}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          );
        })}
      </div>

      {/* Info panel */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div>
            <p className="text-sm font-semibold text-blue-800">How the storefront works</p>
            <p className="mt-1 text-sm text-blue-700">
              Products you mark as <strong>Published</strong> appear on the Akoko Solutions website. When a customer
              places an order it lands here as <strong>Pending</strong> — your team confirms it, contacts the customer,
              then marks it <strong>Confirmed → Delivered</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
