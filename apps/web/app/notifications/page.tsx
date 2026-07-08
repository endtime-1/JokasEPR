"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Filter,
  LoaderCircle,
  Settings
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { apiFetch, ApiEnvelope } from "../../lib/api";

type Notification = {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  status: "UNREAD" | "READ";
  createdAt: string;
  readAt: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK_ALERT: "Low Stock",
  EXPIRY_ALERT: "Expiry Alert",
  VACCINATION_REMINDER: "Vaccination",
  MEDICATION_REMINDER: "Medication",
  PRODUCTION_ORDER_COMPLETED: "Production Done",
  PURCHASE_APPROVAL_NEEDED: "Purchase Approval",
  CUSTOMER_PAYMENT_OVERDUE: "Payment Overdue",
  SUPPLIER_PAYMENT_DUE: "Supplier Payment",
  MACHINE_MAINTENANCE_DUE: "Maintenance Due",
  AI_RISK_ALERT: "AI Risk",
  TASK_ASSIGNED: "Task Assigned",
  QUALITY_BATCH_REJECTED: "Batch Rejected",
  STOCK_TRANSFER_REQUEST: "Transfer Request"
};

const TYPE_ICONS: Record<string, string> = {
  LOW_STOCK_ALERT: "📦",
  EXPIRY_ALERT: "⚠️",
  VACCINATION_REMINDER: "💉",
  MEDICATION_REMINDER: "💊",
  PRODUCTION_ORDER_COMPLETED: "✅",
  PURCHASE_APPROVAL_NEEDED: "🛒",
  CUSTOMER_PAYMENT_OVERDUE: "💰",
  SUPPLIER_PAYMENT_DUE: "📋",
  MACHINE_MAINTENANCE_DUE: "🔧",
  AI_RISK_ALERT: "🤖",
  TASK_ASSIGNED: "📌",
  QUALITY_BATCH_REJECTED: "❌",
  STOCK_TRANSFER_REQUEST: "🔄"
};

const CHANNEL_BADGE: Record<string, string> = {
  IN_APP: "bg-blue-100 text-blue-700",
  EMAIL: "bg-amber-100 text-amber-700",
  SMS: "bg-green-100 text-green-700",
  WHATSAPP: "bg-emerald-100 text-emerald-700"
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "UNREAD" | "READ">("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch<ApiEnvelope<{ data: Notification[]; total: number }>>(`/notifications?${params}`);
      setItems(res.data.data);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: "READ", readAt: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    await apiFetch("/notifications/mark-all-read", { method: "PATCH" }).catch(() => undefined);
    setItems((prev) => prev.map((n) => ({ ...n, status: "READ", readAt: n.readAt ?? new Date().toISOString() })));
  }

  const unread = items.filter((n) => n.status === "UNREAD").length;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-sm text-ink/55">{total} total{unread > 0 ? ` · ${unread} unread` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-field"
              >
                <CheckCheck className="h-4 w-4 text-brand" />
                Mark all read
              </button>
            )}
            <Link
              href="/notifications/preferences"
              className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-field"
            >
              <Settings className="h-4 w-4 text-ink/60" />
              Preferences
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink/40" />
          {(["", "UNREAD", "READ"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                statusFilter === s ? "bg-brand text-white" : "border border-line bg-white text-ink/60 hover:border-brand/40"
              }`}
            >
              {s === "" ? "All" : s === "UNREAD" ? "Unread" : "Read"}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <LoaderCircle className="h-6 w-6 animate-spin text-ink/40" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="mb-3 h-10 w-10 text-ink/20" />
              <p className="font-medium text-ink/50">No notifications</p>
              <p className="text-sm text-ink/35">You&apos;re all caught up!</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-4 px-5 py-4 transition hover:bg-field/60 ${n.status === "UNREAD" ? "bg-brand/[0.03]" : ""}`}
                >
                  <span className="mt-0.5 text-xl">{TYPE_ICONS[n.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold ${n.status === "READ" ? "text-ink/60" : "text-ink"}`}>{n.title}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${CHANNEL_BADGE[n.channel] ?? "bg-gray-100 text-gray-600"}`}>
                        {n.channel.replace("_", " ")}
                      </span>
                      {n.type in TYPE_LABELS && (
                        <span className="rounded-full border border-line bg-field px-1.5 py-0.5 text-[10px] text-ink/50">
                          {TYPE_LABELS[n.type]}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink/65">{n.body}</p>
                    <p className="mt-1.5 text-[11px] text-ink/35">{timeAgo(n.createdAt)}{n.readAt ? ` · read ${timeAgo(n.readAt)}` : ""}</p>
                  </div>
                  {n.status === "UNREAD" && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="mt-1 shrink-0 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-medium text-ink/60 transition hover:text-brand"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-ink/50">
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/notifications/preferences" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
            Manage notification preferences
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
