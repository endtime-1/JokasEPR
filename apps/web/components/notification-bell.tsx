"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight, Loader2 } from "lucide-react";
import { apiFetch, ApiEnvelope } from "../lib/api";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: "UNREAD" | "READ";
  createdAt: string;
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await apiFetch<ApiEnvelope<{ count: number }>>("/notifications/unread-count");
      setCount(res.data.count);
    } catch {
      // silently ignore if not authenticated yet
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<{ data: Notification[] }>>("/notifications?limit=10");
      setItems(res.data.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: "READ" } : n)));
    setCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await apiFetch("/notifications/mark-all-read", { method: "PATCH" }).catch(() => undefined);
    setItems((prev) => prev.map((n) => ({ ...n, status: "READ" })));
    setCount(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="relative grid h-10 w-10 place-items-center rounded-md border border-line bg-white text-ink/70 transition hover:bg-field"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell aria-hidden className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">Notifications</span>
            {count > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-ink/40" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/45">No notifications yet</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-field ${n.status === "UNREAD" ? "bg-brand/5" : ""}`}
                  onClick={() => markRead(n.id)}
                >
                  <span className="mt-0.5 text-base">{TYPE_ICONS[n.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${n.status === "UNREAD" ? "font-semibold" : "font-medium text-ink/70"}`}>{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink/55">{n.body}</p>
                    <p className="mt-1 text-[10px] text-ink/40">{timeAgo(n.createdAt)}</p>
                  </div>
                  {n.status === "UNREAD" && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              View all notifications
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
