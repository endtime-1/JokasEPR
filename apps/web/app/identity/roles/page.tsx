"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { DataTable } from "../../../components/data-table";
import { ApiEnvelope, apiFetch } from "../../../lib/api";

type Role = {
  id: string;
  name: string;
  description?: string;
  permissions: { key: string; module: string }[];
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    apiFetch<ApiEnvelope<Role[]>>("/identity/roles")
      .then((response) => setRoles(response.data))
      .catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Roles</h2>
        <p className="text-sm text-ink/65">Permission bundles used by API guards and user access checks.</p>
      </div>
      <DataTable
        rows={roles}
        empty="No roles found"
        columns={[
          { key: "name", label: "Role", render: (row) => row.name },
          { key: "description", label: "Description", render: (row) => row.description ?? "-" },
          {
            key: "permissions",
            label: "Permissions",
            render: (row) => (row.permissions ?? []).length > 0
              ? (row.permissions ?? []).map((p) => p.key).join(", ")
              : <span className="text-ink/40">None assigned</span>
          }
        ]}
      />
    </AppShell>
  );
}

