"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, UserCircle } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type Profile = {
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  farmIds: string[];
  warehouseIds: string[];
  productionSiteIds: string[];
  hasGlobalAccess: boolean;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<Profile>>("/auth/me")
      .then((response) => setProfile(response.data))
      .catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-md bg-brand text-white">
          <UserCircle aria-hidden className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">{profile?.fullName ?? "Profile"}</h2>
          <p className="text-sm text-ink/65">{profile?.email ?? "Loading account details"}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck aria-hidden className="h-5 w-5 text-brand" />
            <h3 className="text-base font-semibold">Roles and Permissions</h3>
          </div>
          <p className="text-sm font-medium">Roles</p>
          <p className="mt-1 text-sm text-ink/70">{profile?.roles.join(", ") || "-"}</p>
          <p className="mt-4 text-sm font-medium">Permissions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(profile?.permissions ?? []).map((permission) => (
              <span key={permission} className="rounded-md border border-line bg-field px-2 py-1 text-xs">
                {permission}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h3 className="text-base font-semibold">Access Scope</h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink/65">Global access</dt>
              <dd className="font-medium">{profile?.hasGlobalAccess ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/65">Branches</dt>
              <dd className="font-medium">{profile?.branchIds.length ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/65">Farms</dt>
              <dd className="font-medium">{profile?.farmIds.length ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/65">Warehouses</dt>
              <dd className="font-medium">{profile?.warehouseIds.length ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/65">Production sites</dt>
              <dd className="font-medium">{profile?.productionSiteIds.length ?? 0}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AppShell>
  );
}
