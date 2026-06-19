"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, Copy, RotateCcw } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { ApiEnvelope, apiFetch } from "../../../lib/api";

type MobileSyncRecord = {
  id: string;
  localId: string;
  module: string;
  endpoint: string;
  method: string;
  recordId?: string;
  status: "SYNCED" | "DUPLICATE" | "FAILED";
  errorMsg?: string;
  syncedAt: string;
  user?: { id: string; fullName: string; email: string };
};

type SyncStats = {
  total: number;
  synced: number;
  failed: number;
  duplicates: number;
};

const ENDPOINT_LABELS: Record<string, string> = {
  "daily-records": "Daily Poultry",
  "mortality-records": "Mortality",
  "egg-production-records": "Egg Production",
  "feed-consumption-records": "Feed Consumption",
  "medication-records": "Medication",
  "vaccination-records": "Vaccination",
  "stock-movements": "Stock Movement",
  "tasks": "Task Update",
  "sales-orders": "Sales Order"
};

function getLabel(endpoint: string) {
  const key = Object.keys(ENDPOINT_LABELS).find((k) => endpoint.includes(k));
  return key ? ENDPOINT_LABELS[key] : endpoint.split("/").filter(Boolean).pop() ?? endpoint;
}

function StatusBadge({ status }: { status: MobileSyncRecord["status"] }) {
  const cfg = {
    SYNCED: { bg: "bg-green-100", text: "text-green-800", label: "Synced" },
    DUPLICATE: { bg: "bg-blue-100", text: "text-blue-800", label: "Duplicate" },
    FAILED: { bg: "bg-red-100", text: "text-red-800", label: "Failed" }
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {status === "SYNCED" && <CheckCircle2 size={11} />}
      {status === "FAILED" && <AlertCircle size={11} />}
      {cfg.label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MobileSyncPage() {
  const [records, setRecords] = useState<MobileSyncRecord[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "SYNCED" | "FAILED" | "DUPLICATE">("ALL");
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filter !== "ALL") params.set("status", filter);

      const [recordsRes, statsRes] = await Promise.all([
        apiFetch<ApiEnvelope<{ data: MobileSyncRecord[]; total: number }>>(`/sync/records?${params}`),
        apiFetch<ApiEnvelope<SyncStats>>("/sync/stats")
      ]);
      setRecords(recordsRes.data.data);
      setStats(statsRes.data);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  async function handleRetry(localId: string) {
    setRetrying((s) => new Set(s).add(localId));
    try {
      await apiFetch(`/sync/records/${encodeURIComponent(localId)}/retry`, { method: "POST" });
      await load();
    } catch (err) {
      alert((err as Error).message ?? "Retry failed");
    } finally {
      setRetrying((s) => { const n = new Set(s); n.delete(localId); return n; });
    }
  }

  const statCards = stats
    ? [
        { label: "Total Records", value: stats.total, color: "text-gray-700" },
        { label: "Synced", value: stats.synced, color: "text-green-700" },
        { label: "Duplicates", value: stats.duplicates, color: "text-blue-700" },
        { label: "Failed", value: stats.failed, color: "text-red-700" }
      ]
    : [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mobile Sync Records</h1>
            <p className="text-sm text-gray-500 mt-1">Offline submissions synced from mobile devices</p>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                <p className={`mt-1 text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "SYNCED", "FAILED", "DUPLICATE"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-[#256f5f] text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CheckCircle2 size={40} className="mb-2 text-green-300" />
              <p className="font-medium">No records found</p>
              <p className="text-sm">Try changing the filter or refreshing</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Local ID</th>
                  <th className="px-4 py-3 text-left">Record ID</th>
                  <th className="px-4 py-3 text-left">Synced At</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{getLabel(r.endpoint)}</span>
                      <span className="ml-2 text-xs text-gray-400 uppercase">{r.method}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-700">{r.user?.fullName ?? "—"}</div>
                      <div className="text-xs text-gray-400">{r.user?.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.errorMsg && (
                        <p className="mt-1 text-xs text-red-500 max-w-xs truncate" title={r.errorMsg}>{r.errorMsg}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-gray-500 bg-gray-100 rounded px-1 py-0.5">{r.localId.slice(0, 8)}…</code>
                    </td>
                    <td className="px-4 py-3">
                      {r.recordId ? (
                        <code className="text-xs text-gray-500 bg-gray-100 rounded px-1 py-0.5">{r.recordId.slice(0, 8)}…</code>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{timeAgo(r.syncedAt)}</td>
                    <td className="px-4 py-3">
                      {r.status === "FAILED" && (
                        <button
                          onClick={() => handleRetry(r.localId)}
                          disabled={retrying.has(r.localId)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[#256f5f] bg-[#e8f4f0] hover:bg-[#d0ece6] disabled:opacity-50 transition-colors"
                        >
                          <RotateCcw size={11} className={retrying.has(r.localId) ? "animate-spin" : ""} />
                          {retrying.has(r.localId) ? "Retrying…" : "Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {records.length > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + records.length}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={records.length < PAGE_SIZE}
                className="rounded border border-gray-200 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
