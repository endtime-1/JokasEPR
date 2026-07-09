"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { apiFetch } from "../../lib/api";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
  actor?: { fullName: string; email: string };
};

type AuditResponse = { data: AuditLog[]; total: number };

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);

  function load(p = page) {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(p * PAGE_SIZE));
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);

    apiFetch<AuditResponse>(`/audit-logs?${params}`)
      .then((r) => {
        setLogs(r.data);
        setTotal(r.total);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { setPage(0); load(0); }, [entityType, action]);
  useEffect(() => { load(page); }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const ACTIONS = [
    "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "LOGIN",
    "LOGOUT", "EXPORT", "IMPORT", "STATUS_CHANGE",
  ];

  function fmt(d: string) {
    return new Date(d).toLocaleString("en-GH", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">Audit Logs</h1>
          <p className="text-sm text-ink/60">Security and operational events across the system.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="Filter by entity type..."
            className="w-48 rounded-md border border-line px-3 py-2 text-sm"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          >
            <option value="">All Actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </select>
          {loading && <span className="self-center text-xs text-ink/50">Loading...</span>}
          <span className="self-center text-xs text-ink/50 ml-auto">{total.toLocaleString()} total events</span>
        </div>

        <DataTable
          rows={logs as Record<string, unknown>[]}
          empty="No audit events found"
          columns={[
            {
              key: "createdAt",
              label: "Time",
              render: (row) => (
                <span className="whitespace-nowrap text-xs">{fmt(row.createdAt as string)}</span>
              ),
            },
            {
              key: "action",
              label: "Action",
              render: (row) => (
                <span className="inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                  {(row.action as string).replace(/_/g, " ")}
                </span>
              ),
            },
            { key: "entityType", label: "Entity Type" },
            {
              key: "entityId",
              label: "Entity ID",
              render: (row) => row.entityId
                ? <span className="font-mono text-xs text-ink/60">{(row.entityId as string).slice(0, 8)}…</span>
                : <span className="text-ink/30">—</span>,
            },
            { key: "summary", label: "Summary" },
            {
              key: "actor",
              label: "Actor",
              render: (row) => {
                const actor = row.actor as AuditLog["actor"];
                return actor
                  ? <span title={actor.email}>{actor.fullName}</span>
                  : <span className="text-ink/30">System</span>;
              },
            },
          ]}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink/50">
              Page {page + 1} of {totalPages} · showing {logs.length} of {total}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
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
