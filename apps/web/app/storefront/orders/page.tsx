"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, type ApiEnvelope } from "../../../lib/api";
import {
  ShoppingBag,
  Search,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface OrderItem { name: string; qty: number; unitPrice: number; total: number; }
interface AdminOrder {
  id: string;
  orderNumber: string;
  ref: string | null;
  status: string;
  statusLabel: string;
  orderDate: string;
  total: number;
  customer: { name: string | null; phone: string | null; email: string | null; address: string | null; };
  notes: string | null;
  items: OrderItem[];
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Orders" },
  { value: "PENDING_STOCK_APPROVAL", label: "Pending" },
  { value: "APPROVED", label: "Confirmed" },
  { value: "FULFILLED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  PENDING_STOCK_APPROVAL: { label: "Pending",   color: "bg-amber-50 text-amber-700 ring-amber-100",    icon: Clock },
  APPROVED:               { label: "Confirmed",  color: "bg-blue-50 text-blue-700 ring-blue-100",       icon: CheckCircle2 },
  FULFILLED:              { label: "Delivered",  color: "bg-emerald-50 text-emerald-700 ring-emerald-100", icon: Truck },
  CANCELLED:              { label: "Cancelled",  color: "bg-red-50 text-red-600 ring-red-100",          icon: XCircle },
};

const NEXT_STATUS: Record<string, { label: string; value: string; color: string }> = {
  PENDING_STOCK_APPROVAL: { label: "Confirm Order",  value: "APPROVED",   color: "bg-blue-600 hover:bg-blue-700" },
  APPROVED:               { label: "Mark Delivered", value: "FULFILLED",  color: "bg-emerald-600 hover:bg-emerald-700" },
};

function OrderCard({ order, onUpdated }: { order: AdminOrder; onUpdated: (o: AdminOrder) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [err, setErr] = useState("");
  const meta = STATUS_META[order.status] ?? { label: order.statusLabel, color: "bg-ink/5 text-ink/50 ring-ink/10", icon: Clock };
  const Icon = meta.icon;
  const next = NEXT_STATUS[order.status];

  async function advance() {
    if (!next) return;
    setUpdating(true);
    setErr("");
    try {
      await apiFetch<ApiEnvelope<unknown>>(`/public/admin/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next.value }),
      });
      onUpdated({ ...order, status: next.value, statusLabel: STATUS_META[next.value]?.label ?? next.value });
    } catch {
      setErr("Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this order?")) return;
    setUpdating(true);
    try {
      await apiFetch<ApiEnvelope<unknown>>(`/public/admin/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      onUpdated({ ...order, status: "CANCELLED", statusLabel: "Cancelled" });
    } catch {
      setErr("Failed to cancel");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className={`rounded-2xl border bg-white transition-all ${expanded ? "border-brand/30 shadow-md" : "border-line shadow-sm"}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        {/* Status badge */}
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.color}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>

        {/* Customer / ref */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{order.customer.name ?? "—"}</p>
          <p className="truncate text-xs text-ink/40">
            {order.ref ?? order.orderNumber}
            <span className="mx-1.5">·</span>
            {new Date(order.orderDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>

        {/* Total */}
        <p className="shrink-0 text-sm font-black text-ink">GHS {order.total.toLocaleString()}</p>

        {/* Expand */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink/4 text-ink/40 transition hover:bg-ink/8 hover:text-ink"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line px-4 pb-4 pt-4 space-y-5">
          {/* Customer info */}
          <div className="grid gap-3 sm:grid-cols-2">
            {order.customer.phone && (
              <a href={`tel:${order.customer.phone}`}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink transition hover:border-brand/30">
                <Phone className="h-3.5 w-3.5 shrink-0 text-brand" />
                {order.customer.phone}
              </a>
            )}
            {order.customer.email && (
              <a href={`mailto:${order.customer.email}`}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink transition hover:border-brand/30">
                <Mail className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="truncate">{order.customer.email}</span>
              </a>
            )}
            {order.customer.address && (
              <div className="flex items-start gap-2.5 rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink sm:col-span-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                {order.customer.address}
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Order Items</p>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-field">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink/50">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink/50">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink/50">Unit Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink/50">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {order.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-ink">{item.name}</td>
                      <td className="px-3 py-2 text-right text-ink/70">{item.qty}</td>
                      <td className="px-3 py-2 text-right text-ink/70">GHS {item.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-semibold text-ink">GHS {item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-field">
                    <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-ink/50">Total</td>
                    <td className="px-3 py-2 text-right font-black text-ink">GHS {order.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <strong>Customer note:</strong> {order.notes}
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5" /> {err}
            </div>
          )}

          {/* Actions */}
          {order.status !== "FULFILLED" && order.status !== "CANCELLED" && (
            <div className="flex items-center gap-2">
              {next && (
                <button
                  onClick={advance}
                  disabled={updating}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-50 ${next.color}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {updating ? "Updating…" : next.label}
                </button>
              )}
              <button
                onClick={cancel}
                disabled={updating}
                className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "ALL");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (search) params.set("search", search);
    apiFetch<ApiEnvelope<AdminOrder[]>>(`/public/admin/orders?${params}`)
      .then((r) => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: AdminOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  const pendingCount = orders.filter((o) => o.status === "PENDING_STOCK_APPROVAL").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
              <ShoppingBag className="h-3.5 w-3.5 text-brand" />
            </div>
            <h1 className="text-xl font-bold text-ink">Storefront Orders</h1>
            {pendingCount > 0 && status === "ALL" && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-sm text-ink/50">
            Orders placed by customers on the Akoko Solutions website.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/60 shadow-sm transition hover:border-brand/30 hover:text-brand"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or ref…"
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/35 shadow-sm focus:border-brand/40 focus:outline-none focus:ring-2 focus:ring-brand/15"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                status === s.value ? "bg-brand text-white shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white shadow-sm" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/5">
            <ShoppingBag className="h-5 w-5 text-ink/25" />
          </div>
          <p className="font-semibold text-ink/40">No orders found</p>
          <p className="text-sm text-ink/30">
            {status !== "ALL" ? "Try changing the status filter" : "Storefront orders will appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function StorefrontOrdersPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-ink/40">Loading orders…</div>}>
      <OrdersContent />
    </Suspense>
  );
}
