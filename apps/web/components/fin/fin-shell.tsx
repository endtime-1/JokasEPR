"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  BookUser,
  Calculator,
  ChartBar,
  ChevronDown,
  ChevronRight,
  Landmark,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Users,
  X
} from "lucide-react";
import { useAuth } from "../auth-context";
import { BrandLogo } from "../brand-logo";
import { NotificationBell } from "../notification-bell";
import { ThemeToggle } from "../theme-toggle";
import { hasFinPermission } from "./fin-api";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  permission: string;
  children?: { href: string; label: string }[];
};

// The nine areas of the finance module. Each is hidden unless the user holds its view permission.
const NAV: NavItem[] = [
  { href: "/fin", label: "Dashboard", icon: LayoutDashboard, permission: "fin.dashboard.view" },
  {
    href: "/fin/sales",
    label: "Sales",
    icon: Receipt,
    permission: "fin.sales.view",
    children: [
      { href: "/fin/sales/invoices", label: "Invoices" },
      { href: "/fin/sales/quotes", label: "Quotes" },
      { href: "/fin/sales/receipts", label: "Receipts" },
      { href: "/fin/sales/deposits", label: "Deposits" },
      { href: "/fin/sales/credit-notes", label: "Credit Notes" },
      { href: "/fin/sales/recurring", label: "Recurring" },
      { href: "/fin/sales/statements", label: "Statements" }
    ]
  },
  { href: "/fin/purchases", label: "Purchases", icon: ShoppingCart, permission: "fin.purchases.view" },
  { href: "/fin/contacts", label: "Contacts", icon: BookUser, permission: "fin.contacts.view" },
  {
    href: "/fin/banking",
    label: "Banking",
    icon: Landmark,
    permission: "fin.banking.view",
    children: [
      { href: "/fin/banking", label: "Accounts" },
      { href: "/fin/banking/payments", label: "Payments" },
      { href: "/fin/banking/transfers", label: "Transfers" },
      { href: "/fin/banking/online", label: "Online payments" },
      { href: "/fin/banking/reconcile", label: "Reconcile" }
    ]
  },
  { href: "/fin/pos", label: "POS", icon: Store, permission: "fin.pos.view" },
  { href: "/fin/payroll", label: "Payroll", icon: Users, permission: "fin.payroll.view" },
  {
    href: "/fin/accounting",
    label: "Accounting",
    icon: Calculator,
    permission: "fin.accounting.view",
    children: [
      { href: "/fin/accounting/chart-of-accounts", label: "Chart of Accounts" },
      { href: "/fin/accounting/journals", label: "Journals" },
      { href: "/fin/accounting/trial-balance", label: "Trial Balance" },
      { href: "/fin/accounting/periods", label: "Periods" }
    ]
  },
  { href: "/fin/reports", label: "Reports", icon: ChartBar, permission: "fin.reports.view" },
  {
    href: "/fin/settings",
    label: "Settings",
    icon: Settings,
    permission: "fin.settings.view",
    children: [
      { href: "/fin/settings", label: "Business & Numbering" },
      { href: "/fin/settings/tax", label: "Tax" },
      { href: "/fin/settings/audit-log", label: "Audit Log" }
    ]
  }
];

// ─── page header context ─────────────────────────────────────────────────────

type Header = { title?: string; subtitle?: string };
const HeaderContext = createContext<(h: Header) => void>(() => {});

/** Pages call this to set the title shown in the top bar. */
export function useFinHeader(title?: string, subtitle?: string) {
  const setHeader = useContext(HeaderContext);
  useEffect(() => {
    setHeader({ title, subtitle });
    return () => setHeader({});
  }, [setHeader, title, subtitle]);
}

// ─── sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const items = NAV.filter((n) => hasFinPermission(profile, n.permission));
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const isActive = (item: NavItem) => (item.href === "/fin" ? pathname === "/fin" : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand shadow-lg">
          <BookOpen className="h-5 w-5 text-white" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Finance</p>
          <p className="text-[10px] uppercase tracking-widest text-white/35">Books &amp; accounts</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:none]" aria-label="Finance">
        {items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          const expanded = item.children ? (open[item.href] ?? active) : false;
          return (
            <div key={item.href}>
              <div className="flex items-center">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active ? "border-l-[3px] border-brand bg-white/10 pl-[9px] text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-white/45"}`} aria-hidden />
                  {item.label}
                </Link>
                {item.children && (
                  <button
                    type="button"
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                    onClick={() => setOpen((o) => ({ ...o, [item.href]: !expanded }))}
                    className="ml-1 rounded-md p-1.5 text-white/35 hover:bg-white/10 hover:text-white"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {item.children && expanded && (
                <div className="mb-1 ml-5 space-y-0.5 border-l border-white/10 pl-2">
                  {item.children.map((c) => {
                    const childActive = pathname === c.href || (c.href !== item.href && pathname.startsWith(`${c.href}/`));
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={onNavigate}
                        className={`block rounded-md px-3 py-2 text-[13px] transition ${childActive ? "bg-white/10 font-semibold text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && <p className="px-3 py-2 text-xs text-white/45">You do not have access to any finance area yet.</p>}
      </nav>

      <div className="mt-3 h-px bg-white/[0.08]" />
      <div className="mt-3 space-y-0.5">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/45 transition hover:bg-white/[0.06] hover:text-white">
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Main App
        </Link>
        {profile && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brandDark text-[11px] font-bold text-white shadow-md">
              {profile.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white/75">{profile.fullName}</p>
              <p className="truncate text-[10px] text-white/35">{profile.email}</p>
            </div>
            <button onClick={signOut} title="Sign out" className="shrink-0 rounded-md p-1 text-white/35 transition hover:bg-red-500/20 hover:text-red-400">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── shell ───────────────────────────────────────────────────────────────────

export function FinShell({ children }: { children: React.ReactNode }) {
  const { ready, profile } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [header, setHeader] = useState<Header>({});

  useEffect(() => {
    if (ready && !profile) router.replace("/login");
  }, [ready, profile, router]);

  if (!ready || !profile) {
    return (
      <div className="flex h-screen overflow-hidden bg-canvas text-ink">
        <aside className="hidden h-full w-60 shrink-0 bg-sidebar lg:block xl:w-64" />
        <main className="flex-1 px-5 py-6 lg:px-8">
          <div className="h-6 w-48 animate-pulse rounded-md bg-ink/10" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      <aside className="hidden h-full w-60 shrink-0 flex-col overflow-y-auto bg-sidebar lg:flex xl:w-64">
        <div className="flex h-full flex-col px-3 py-5">
          <Sidebar />
        </div>
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold text-white">Finance</span>
              <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/90 px-5 py-3.5 backdrop-blur-md lg:px-8 print:hidden">
          <button className="flex items-center justify-center rounded-lg border border-line p-2 text-muted hover:bg-field lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open finance menu">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <BrandLogo className="h-7 w-7 rounded-lg" />
          </Link>
          {header.title && (
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ink lg:text-lg">{header.title}</h1>
              {header.subtitle && <p className="hidden truncate text-xs text-muted lg:block">{header.subtitle}</p>}
            </div>
          )}
          <div className="flex-1" />
          <ThemeToggle />
          <NotificationBell />
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8">
          <HeaderContext.Provider value={setHeader}>{children}</HeaderContext.Provider>
        </main>
      </div>
    </div>
  );
}
