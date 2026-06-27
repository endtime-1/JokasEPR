"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserCircle } from "lucide-react";
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

type PwForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyPw: PwForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pw, setPw] = useState<PwForm>(emptyPw);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Profile>>("/auth/me")
      .then((response) => setProfile(response.data))
      .catch(() => undefined);
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (pw.newPassword !== pw.confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    if (pw.newPassword.length < 10) {
      setPwError("New password must be at least 10 characters");
      return;
    }

    setPwLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      });
      setPwSuccess(true);
      setPw(emptyPw);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  }

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

        <section className="rounded-md border border-line bg-white p-5 shadow-panel xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound aria-hidden className="h-5 w-5 text-brand" />
            <h3 className="text-base font-semibold">Change Password</h3>
          </div>

          <form onSubmit={handleChangePassword} className="grid gap-4 sm:max-w-sm">
            <div className="grid gap-1">
              <label htmlFor="current-password" className="text-sm font-medium">Current password</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={pw.currentPassword}
                onChange={(e) => setPw((f) => ({ ...f, currentPassword: e.target.value }))}
                className="rounded-md border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="new-password" className="text-sm font-medium">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={pw.newPassword}
                onChange={(e) => setPw((f) => ({ ...f, newPassword: e.target.value }))}
                className="rounded-md border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <p className="text-xs text-ink/55">Min 10 characters · uppercase, lowercase, number, and symbol</p>
            </div>

            <div className="grid gap-1">
              <label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={pw.confirmPassword}
                onChange={(e) => setPw((f) => ({ ...f, confirmPassword: e.target.value }))}
                className="rounded-md border border-line bg-field px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {pwError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {pwError}
              </p>
            )}
            {pwSuccess && (
              <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Password changed successfully.
              </p>
            )}

            <button
              type="submit"
              disabled={pwLoading}
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-60"
            >
              {pwLoading ? "Saving…" : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
