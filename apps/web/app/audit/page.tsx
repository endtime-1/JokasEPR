"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
  actor?: {
    fullName: string;
    email: string;
  };
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    apiFetch<ApiEnvelope<AuditLog[]>>("/audit-logs")
      .then((response) => setLogs(response.data))
      .catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Audit Logs</h2>
        <p className="text-sm text-ink/65">Recent security and operational events.</p>
      </div>
      <DataTable
        rows={logs}
        empty="No audit events found"
        columns={[
          { key: "time", label: "Time", render: (row) => new Date(row.createdAt).toLocaleString() },
          { key: "action", label: "Action", render: (row) => row.action },
          { key: "entity", label: "Entity", render: (row) => `${row.entityType}${row.entityId ? `:${row.entityId}` : ""}` },
          { key: "summary", label: "Summary", render: (row) => row.summary },
          { key: "actor", label: "Actor", render: (row) => row.actor?.email ?? "-" }
        ]}
      />
    </AppShell>
  );
}

