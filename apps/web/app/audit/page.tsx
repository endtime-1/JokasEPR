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

type AuditMeta = { total: number; page: number; take: number; totalPages: number };
type AuditResponse = { data: AuditLog[]; meta: AuditMeta };

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [meta, setMeta] = useState<AuditMeta>({ total: 0, page: 1, take: PAGE_SIZE, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);

  function load(p = page) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), take: String(PAGE_SIZE) });
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);

    apiFetch<AuditResponse>(`/audit-logs?${params}`)
      .then((r) => {
        setLogs(r.data ?? []);
        if (r.meta) setMeta(r.meta);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { setPage(1); load(1); }, [entityType, action]);
  useEffect(() => { load(page); }, [page]);

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
          <span className="self-center text-xs text-ink/50 ml-auto">{meta.total.toLocaleString()} total events</span>
        </div>

        <DataTable
          rows={logs as Record<string, unknown>[]}
          empty="No audit events found"
          loading={loading}
          totalCount={meta.total}
          serverPage={page}
          serverPageSize={PAGE_SIZE}
          onPageChange={setPage}
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
      </div>
    </AppShell>
  );
}
