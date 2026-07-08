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
  iconColor: string;
  items: { href: string; label: string; icon: React.ElementType }[];
};

const sections: NavSection[] = [
  {
    title: "Overview",
    iconColor: "text-sky-400",
    items: [{ href: "/finance", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    title: "Customers & Sales",
    iconColor: "text-emerald-400",
    items: [
      // Revenue Records — stays within finance (was incorrectly /sales/orders)
      { href: "/finance/revenue", label: "Revenue Records", icon: ReceiptText },
      { href: "/finance/customer-payments", label: "Customer Payments", icon: CircleArrowUp },
      { href: "/finance/reports/product-profitability", label: "Debtors (A/R)", icon: Users }
    ]
  },
  {
    title: "Vendors & Expenses",
    iconColor: "text-red-400",
    items: [
      { href: "/finance/expenses", label: "Expenses", icon: CircleArrowDown },
      { href: "/finance/supplier-payments", label: "Supplier Payments", icon: Building2 },
      { href: "/finance/reports/batch-profitability", label: "Creditors (A/P)", icon: FileClock }
    ]
  },
  {
    title: "Accounting",
    iconColor: "text-purple-400",
    items: [
      { href: "/finance/journal-entries", label: "Journal Entries", icon: BookOpen },
      { href: "/finance/petty-cash", label: "Petty Cash", icon: PiggyBank },
      { href: "/finance/chart-of-accounts", label: "Chart of Accounts", icon: Scale }
    ]
  },
  {
    title: "Payroll",
    iconColor: "text-yellow-400",
    items: [{ href: "/finance/payroll", label: "Payroll Records", icon: Wallet }]
  },
  {
    title: "Banking",
    iconColor: "text-cyan-400",
    items: [{ href: "/finance/bank-accounts", label: "Bank Accounts", icon: Landmark }]
  },
  {
    title: "Reports",
    iconColor: "text-orange-400",
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
  { href: "/finance/revenue", label: "Revenue Entry", icon: CircleArrowUp },
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
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-brandDark active:scale-95"
      >
        <Plus className="h-4 w-4" />
        New
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#1f2d45] shadow-2xl">
            {newActions.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-4 w-4 text-brand" aria-hidden />
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
    <nav className="space-y-1">
      {sections.map((section) => {
        const open = collapsed[section.title] !== true;
        return (
          <div key={section.title}>
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [section.title]: !c[section.title] }))}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-white/30 transition hover:text-white/55"
            >
              {section.title}
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {open && (
              <div className="mb-1.5 space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? "border-l-[3px] border-brand bg-white/10 pl-[9px] text-white"
                          : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? "text-brand" : section.iconColor}`}
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

// ─── Sidebar Content ──────────────────────────────────────────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth();

  function initials(name?: string | null) {
    if (!name) return "?";
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Finance branding */}
      <div className="mb-6 flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand shadow-lg">
          <DollarSign className="h-5 w-5 text-white" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Finance</p>
          <p className="text-[10px] uppercase tracking-widest text-white/35">GHS · Ghana Cedi</p>
        </div>
      </div>

      {/* + New */}
      <div className="mb-5">
        <NewButton />
      </div>

      <div className="h-px bg-white/[0.08]" />

      {/* Nav */}
      <div className="mt-4 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:none]">
        <FinanceSidebarNav onNavigate={onNavigate} />
      </div>

      <div className="mt-3 h-px bg-white/[0.08]" />

      {/* Back to main + user footer */}
      <div className="mt-3 space-y-0.5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/45 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Main App
        </Link>

        {profile && (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brandDark text-[11px] font-bold text-white shadow-md">
              {initials(profile.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white/75">{profile.fullName}</p>
              <p className="truncate text-[10px] text-white/35">{profile.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="shrink-0 rounded-md p-1 text-white/35 transition hover:bg-red-500/20 hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
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

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-sidebar">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/60">
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
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex xl:w-64">
        <div className="flex h-full flex-col px-3 py-5">
          <SidebarContent />
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-white">Finance</span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarContent onNavigate={() => setMobileSidebarOpen(false)} />
            </div>
          </aside>
        </>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Top header */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-5 py-3.5 shadow-sm backdrop-blur-md lg:px-8">
          {/* Mobile: hamburger */}
          <button
            className="flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open finance menu"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo — mobile only */}
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <BrandLogo className="h-7 w-7 rounded-lg" />
          </Link>

          {/* Page title */}
          {title && (
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900 lg:text-lg">{title}</h1>
              {subtitle && <p className="hidden truncate text-xs text-slate-400 lg:block">{subtitle}</p>}
            </div>
          )}

          <div className="flex-1" />

          {/* Currency badge */}
          <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 text-[11px] font-bold text-brand sm:inline-flex">
            <DollarSign className="h-3 w-3" />
            GHS
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
