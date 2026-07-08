"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, type ApiEnvelope } from "../../lib/api";
import {
  CircleCheckBig,
  Clock,
  Globe,
  Package,
  Phone,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
  CircleX,
  AlertTriangle,
  ChartBar,
  ArrowRight,
} from "lucide-react";

interface RecentOrder {
  id: string;
  orderNumber: string;
  ref: string | null;
  status: string;
  statusLabel: string;
  orderDate: string;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  itemSummary: string;
}

interface DashStats {
  published: number;
  totalProducts: number;
  pending: number;
  confirmed: number;
  delivered: number;
  cancelled: number;
  total: number;
  totalRevenue: number;
  revenueThisMonth: number;
  recentOrders: RecentOrder[];
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING_STOCK_APPROVAL: { label: "Pending",   color: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",    icon: Clock       },
  APPROVED:               { label: "Confirmed",  color: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",       icon: CircleCheckBig },
  FULFILLED:              { label: "Delivered",  color: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100", icon: Truck    },
  CANCELLED:              { label: "Cancelled",  color: "bg-red-50 text-red-500 ring-1 ring-red-100",          icon: CircleX     },
};

const NEXT_STATUS: Record<string, { label: string; value: string; color: string }> = {
  PENDING_STOCK_APPROVAL: { label: "Confirm",   value: "APPROVED",  color: "bg-blue-600 hover:bg-blue-700 text-white" },
  APPROVED:               { label: "Delivered", value: "FULFILLED", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

export default function StorefrontDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<ApiEnvelope<DashStats>>("/public/admin/stats")
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advanceOrder(id: string, nextStatus: string) {
    setUpdatingId(id);
    try {
      await apiFetch<ApiEnvelope<unknown>>(`/public/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setStats((prev) =>
        prev
          ? {
              ...prev,
              recentOrders: prev.recentOrders.map((o) =>
                o.id === id
                  ? { ...o, status: nextStatus, statusLabel: STATUS_META[nextStatus]?.label ?? nextStatus }
                  : o
              ),
              pending:   nextStatus === "APPROVED"  ? prev.pending - 1   : prev.pending,
              confirmed: nextStatus === "APPROVED"  ? prev.confirmed + 1 :
                         nextStatus === "FULFILLED" ? prev.confirmed - 1 : prev.confirmed,
              delivered: nextStatus === "FULFILLED" ? prev.delivered + 1 : prev.delivered,
            }
          : prev
      );
    } catch {
      //
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancelOrder(id: string) {
    if (!confirm("Cancel this order?")) return;
    await advanceOrder(id, "CANCELLED");
  }

  const skel = (w = "w-16") => (
    <span className={`inline-block h-5 ${w} animate-pulse rounded-lg bg-ink/8`} />
  );

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10">
              <Globe className="h-4 w-4 text-brand" />
            </div>
            <h1 className="text-xl font-bold text-ink">Akoko Storefront</h1>
          </div>
          <p className="text-sm text-ink/50">
            Manage the public website and act on incoming customer orders.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-brand/30 hover:text-brand"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* ── Alert: pending orders need action ───────────────────────────── */}
      {!loading && stats && stats.pending > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {stats.pending} order{stats.pending > 1 ? "s" : ""} waiting for your confirmation
            </p>
            <p className="text-xs text-amber-700">
              Review and confirm below, or go to the Orders page for full details.
            </p>
          </div>
          <Link
            href="/storefront/orders?status=PENDING_STOCK_APPROVAL"
            className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600"
          >
            View All
          </Link>
        </div>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Revenue this month */}
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm ring-1 ring-brand/8">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10">
            <ChartBar className="h-5 w-5 text-brand" />
          </div>
          <div>
            <p className="text-2xl font-black text-ink">
              {loading ? skel("w-20") : <>GHS {fmt(stats?.revenueThisMonth ?? 0)}</>}
            </p>
            <p className="text-xs text-ink/50">Revenue this month</p>
            {!loading && stats && stats.totalRevenue > 0 && (
              <p className="text-[10px] text-ink/35">GHS {fmt(stats.totalRevenue)} all-time</p>
            )}
          </div>
        </div>

        {/* Pending */}
        <Link
          href="/storefront/orders?status=PENDING_STOCK_APPROVAL"
          className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-ink">
              {loading ? skel() : stats?.pending ?? 0}
            </p>
            <p className="text-xs text-ink/50">Pending orders</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>

        {/* Confirmed */}
        <Link
          href="/storefront/orders?status=APPROVED"
          className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm ring-1 ring-blue-100 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50">
            <CircleCheckBig className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-ink">
              {loading ? skel() : stats?.confirmed ?? 0}
            </p>
            <p className="text-xs text-ink/50">Confirmed orders</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>

        {/* Published products */}
        <Link
          href="/storefront/products"
          className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50">
            <Package className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black text-ink">
              {loading ? skel() : <>{stats?.published ?? 0} <span className="text-sm font-medium text-ink/35">/ {stats?.totalProducts ?? 0}</span></>}
            </p>
            <p className="text-xs text-ink/50">Products published</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
      </div>

      {/* ── Order funnel ────────────────────────────────────────────────── */}
      {!loading && stats && stats.total > 0 && (
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-ink">Order Pipeline — {stats.total} total</p>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: "Pending",   value: stats.pending,   color: "bg-amber-400"   },
              { label: "Confirmed", value: stats.confirmed, color: "bg-blue-500"    },
              { label: "Delivered", value: stats.delivered, color: "bg-emerald-500" },
              { label: "Cancelled", value: stats.cancelled, color: "bg-red-400"     },
            ].map((s) => {
              const pct = stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0;
              return (
                <div key={s.label}>
                  <div className="mx-auto mb-2 h-2 w-full rounded-full bg-ink/5">
                    <div
                      className={`h-2 rounded-full ${s.color} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xl font-black text-ink">{s.value}</p>
                  <p className="text-xs text-ink/45">{s.label}</p>
                  <p className="text-[10px] text-ink/30">{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Orders ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-ink/40" />
            <h2 className="font-semibold text-ink">Recent Orders</h2>
          </div>
          <Link
            href="/storefront/orders"
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 w-20 animate-pulse rounded bg-ink/8" />
                <div className="h-4 flex-1 animate-pulse rounded bg-ink/5" />
                <div className="h-4 w-16 animate-pulse rounded bg-ink/8" />
              </div>
            ))}
          </div>
        ) : !stats?.recentOrders?.length ? (
          <div className="py-16 text-center">
            <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-ink/15" />
            <p className="text-sm font-medium text-ink/35">No orders yet</p>
            <p className="mt-1 text-xs text-ink/25">Orders placed on the storefront will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {stats.recentOrders.map((order) => {
              const meta = STATUS_META[order.status] ?? STATUS_META.PENDING_STOCK_APPROVAL;
              const Icon = meta.icon;
              const next = NEXT_STATUS[order.status];
              const isUpdating = updatingId === order.id;

              return (
                <div key={order.id} className="flex flex-wrap items-start gap-3 px-6 py-4">
                  {/* Status badge */}
                  <span className={`mt-0.5 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.color}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>

                  {/* Customer + items */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-ink">{order.customerName ?? "—"}</p>
                      <span className="text-xs text-ink/30">{order.ref ?? order.orderNumber}</span>
                    </div>
                    {order.itemSummary && (
                      <p className="mt-0.5 truncate text-xs text-ink/45">{order.itemSummary}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3">
                      <p className="text-xs text-ink/35">{fmtDate(order.orderDate)}</p>
                      {order.customerPhone && (
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {order.customerPhone}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <p className="text-sm font-black text-ink whitespace-nowrap">
                    GHS {fmt(order.total)}
                  </p>

                  {/* Quick actions */}
                  {order.status !== "FULFILLED" && order.status !== "CANCELLED" && (
                    <div className="flex items-center gap-2">
                      {next && (
                        <button
                          onClick={() => advanceOrder(order.id, next.value)}
                          disabled={isUpdating}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50 ${next.color}`}
                        >
                          {isUpdating ? "…" : next.label}
                        </button>
                      )}
                      <button
                        onClick={() => cancelOrder(order.id)}
                        disabled={isUpdating}
                        className="rounded-xl border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom quick links ───────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/storefront/products"
          className="group flex items-center gap-5 rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/8 transition group-hover:bg-brand/14">
            <Package className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Manage Products</p>
            <p className="text-sm text-ink/45">Publish products, set descriptions &amp; prices</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
        <Link
          href="/storefront/orders"
          className="group flex items-center gap-5 rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/8 transition group-hover:bg-brand/14">
            <TrendingUp className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Orders Inbox</p>
            <p className="text-sm text-ink/45">Review, confirm, and action customer orders</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink/20 transition group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
      </div>

    </div>
  );
}
