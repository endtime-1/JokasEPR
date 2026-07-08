"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CircleArrowDown,
  ArrowLeft,
  CircleArrowUp,
  ChartBar,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  FileChartColumn,
  FileClock,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Plus,
  Receipt,
  ReceiptText,
  Scale,
  TrendingUp,
  Users,
  Wallet,
  X
} from "lucide-react";
import { useAuth } from "./auth-context";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";

// ─── Nav Config ──────────────────────────────────────────────────────────────

type NavSection = {
  title: string;
  items: { href: string; label: string; icon: React.ElementType }[];
};

const sections: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/finance", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    title: "Sales",
    items: [
      { href: "/sales/orders", label: "Invoices & Orders", icon: ReceiptText },
      { href: "/finance/customer-payments", label: "Customer Payments", icon: CircleArrowUp },
      { href: "/finance/reports/product-profitability", label: "Debtors (A/R)", icon: Users }
    ]
  },
  {
    title: "Expenses",
    items: [
      { href: "/finance/expenses", label: "Expenses", icon: CircleArrowDown },
      { href: "/finance/supplier-payments", label: "Supplier Payments", icon: Building2 },
      { href: "/finance/reports/batch-profitability", label: "Creditors (A/P)", icon: FileClock }
    ]
  },
  {
    title: "Accounting",
    items: [
      { href: "/finance/journal-entries", label: "Journal Entries", icon: BookOpen },
      { href: "/finance/petty-cash", label: "Petty Cash", icon: PiggyBank },
      { href: "/finance/chart-of-accounts", label: "Chart of Accounts", icon: Scale }
    ]
  },
  {
    title: "Payroll",
    items: [{ href: "/finance/payroll", label: "Payroll Records", icon: Wallet }]
  },
  {
    title: "Banking",
    items: [{ href: "/finance/bank-accounts", label: "Bank Accounts", icon: Landmark }]
  },
  {
    title: "Reports",
    items: [
      { href: "/finance/reports/profit-loss", label: "Profit & Loss", icon: TrendingUp },
      { href: "/finance/reports/cash-flow", label: "Cash Flow", icon: ChartBar },
      { href: "/finance/reports/product-profitability", label: "Product P&L", icon: FileChartColumn },
      { href: "/finance/reports/batch-profitability", label: "Batch P&L", icon: FileText }
    ]
  }
];

const newActions = [
  { href: "/finance/expenses/create", label: "Expense", icon: CircleArrowDown },
  { href: "/finance/revenue", label: "Revenue", icon: CircleArrowUp },
  { href: "/finance/journal-entries", label: "Journal Entry", icon: BookOpen },
  { href: "/finance/payroll", label: "Payroll Record", icon: Wallet },
  { href: "/finance/petty-cash", label: "Petty Cash", icon: PiggyBank },
  { href: "/finance/customer-payments", label: "Customer Payment", icon: Receipt },
  { href: "/finance/supplier-payments", label: "Supplier Payment", icon: CreditCard }
];

// ─── "+ New" Dropdown ─────────────────────────────────────────────────────────

function NewButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-brandDark"
      >
        <Plus className="h-4 w-4" />
        New
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            {newActions.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Icon className="h-4 w-4 text-slate-400" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

function FinanceSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function isActive(href: string) {
    if (href === "/finance") return pathname === "/finance";
    return pathname.startsWith(href);
  }

  return (
    <nav className="space-y-0.5">
      {sections.map((section) => {
        const open = collapsed[section.title] !== true;
        return (
          <div key={section.title} className="mb-1">
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [section.title]: !c[section.title] }))}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600"
            >
              {section.title}
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {open && (
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-brand/10 font-semibold text-brand"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-slate-400"}`}
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Sidebar Content (shared between desktop + mobile) ───────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth();

  function initials(name?: string | null) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Back to main app */}
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to App</span>
        </Link>
      </div>

      {/* Finance branding */}
      <div className="mb-4 flex items-center gap-3 px-1">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand shadow-md">
          <DollarSign className="h-5 w-5 text-white" aria-hidden />
        </div>
        <div>
          <p className="text-[13px] font-bold text-slate-900">Finance</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">GHS · Ghana Cedi</p>
        </div>
      </div>

      {/* + New */}
      <div className="mb-4">
        <NewButton />
      </div>

      <div className="h-px bg-slate-100" />

      {/* Nav */}
      <div className="mt-3 flex-1 overflow-y-auto pr-0.5">
        <FinanceSidebarNav onNavigate={onNavigate} />
      </div>

      {/* User footer */}
      {profile && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brandDark text-[11px] font-bold text-white">
              {initials(profile.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{profile.fullName}</p>
              <p className="truncate text-[10px] text-slate-400">{profile.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finance Shell ────────────────────────────────────────────────────────────

export function FinanceShell({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const { ready, profile } = useAuth();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auth guard — same as AppShell
  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
          Loading…
        </div>
      </main>
    );
  }

  if (!profile) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">

      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex xl:w-60">
        <div className="flex h-full flex-col p-3 pt-5">
          <SidebarContent />
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold text-slate-700">Finance</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 pt-4">
              <SidebarContent onNavigate={() => setMobileSidebarOpen(false)} />
            </div>
          </aside>
        </>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Top header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-5 py-3 shadow-sm backdrop-blur-md lg:px-8">
          {/* Mobile: hamburger */}
          <button
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-500 hover:bg-slate-50 lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open finance menu"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo — mobile only (desktop has sidebar) */}
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <BrandLogo className="h-7 w-7 rounded-lg" />
          </Link>

          {/* Back arrow — desktop */}
          <Link
            href="/dashboard"
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:flex"
            title="Back to main app"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-medium">Dashboard</span>
          </Link>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-slate-200 lg:block" />

          {/* Page title */}
          {title && (
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900 lg:text-lg">{title}</h1>
              {subtitle && <p className="hidden truncate text-xs text-slate-500 lg:block">{subtitle}</p>}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: notifications + currency badge */}
          <span className="hidden rounded-full bg-field px-2.5 py-0.5 text-[11px] font-semibold text-brand sm:inline">
            GHS · Ghana Cedi
          </span>
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 px-5 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
