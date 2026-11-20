"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Circle, Lock, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth-context";
import { EmptyState } from "../ui";
import { Envelope, FinAccount, finGet, hasFinPermission } from "./fin-api";
import { useFinHeader } from "./fin-shell";

/** Shows its children only to users holding the permission; everyone else gets a clear "no access" page. */
export function FinGuard({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { profile, ready } = useAuth();
  if (!ready) return null;
  if (!hasFinPermission(profile, permission)) {
    return (
      <div className="app-card">
        <EmptyState icon={Lock} title="You do not have access to this page" description={`Ask an administrator to give your role the "${permission}" permission.`} />
      </div>
    );
  }
  return <>{children}</>;
}

/** An empty finance area: real route, real menu entry, real permission, nothing built yet. */
export function FinPlaceholder({ title, permission, icon, description }: { title: string; permission: string; icon: LucideIcon; description: string }) {
  useFinHeader(title, "Coming soon");
  return (
    <FinGuard permission={permission}>
      <div className="app-card">
        <EmptyState icon={icon} title={`${title} is set up and waiting`} description={description} />
      </div>
    </FinGuard>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="app-alert-error" role="alert">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

type Settings = { businessName: string; tin: string | null; addressLine1: string | null };
type Periods = { lockedThrough: string | null };

/** The finance landing page: a short setup checklist plus links to the areas. */
export function FinDashboardPage() {
  useFinHeader("Finance", "Your books at a glance");
  const { profile } = useAuth();
  const canSettings = hasFinPermission(profile, "fin.settings.view");
  const canAccounting = hasFinPermission(profile, "fin.accounting.view");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [periods, setPeriods] = useState<Periods | null>(null);

  useEffect(() => {
    if (canSettings) finGet<{ settings: Settings }>("/settings").then((r) => setSettings(r.data.settings)).catch(() => undefined);
    if (canAccounting) {
      finGet<FinAccount[]>("/accounting/accounts").then((r) => setAccountCount(r.data.length)).catch(() => undefined);
      finGet<Periods>("/accounting/periods").then((r) => setPeriods(r.data)).catch(() => undefined);
    }
  }, [canSettings, canAccounting]);

  const steps = [
    { done: settings ? settings.businessName.trim().length > 0 && !!settings.tin : null, label: "Enter your business details and TIN", href: "/fin/settings", show: canSettings },
    { done: accountCount === null ? null : accountCount > 0, label: "Set up the chart of accounts (poultry & feed template available)", href: "/fin/accounting/chart-of-accounts", show: canAccounting },
    { done: periods ? true : null, label: periods?.lockedThrough ? `Books are closed through ${periods.lockedThrough}` : "Books are open for every date (close a period once it is reviewed)", href: "/fin/accounting/periods", show: canAccounting }
  ].filter((s) => s.show);

  return (
    <FinGuard permission="fin.dashboard.view">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="app-card p-6">
          <h2 className="text-lg font-bold text-ink">Getting started</h2>
          <p className="mt-1 text-sm text-ink/60">This is your finance module&apos;s own set of books. Work through these steps in order.</p>
          <ul className="mt-4 divide-y divide-line">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 py-3 text-sm text-ink hover:text-brand">
                  {s.done ? <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-ink/25" aria-hidden />}
                  <span>{s.label}</span>
                </Link>
              </li>
            ))}
            {steps.length === 0 && <li className="py-3 text-sm text-ink/60">Use the menu to open the areas you have access to.</li>}
          </ul>
        </div>
      </div>
    </FinGuard>
  );
}

export type { Envelope };
