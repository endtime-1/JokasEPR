"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import {
  AlertTriangle,
  BellRing,
  Bird,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  ChevronRight,
  ClipboardList,
  Factory,
  FileDown,
  FlaskConical,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  PackageSearch,
  QrCode,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sprout,
  Target,
  UserCircle,
  Users,
  Wallet,
  Wrench,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Command",
    items: [
      { href: "/dashboard", label: "Executive", icon: LayoutDashboard },
      { href: "/ai-assistant", label: "AI Assistant", icon: Bot, permission: "ai.read" },
      { href: "/alerts", label: "AI Alerts", icon: AlertTriangle, permission: "alerts.read" },
      { href: "/reports", label: "Reports", icon: FileDown, permission: "reports.export" }
    ]
  },
  {
    title: "Operations",
    items: [
      { href: "/poultry", label: "Poultry", icon: Bird, permission: "poultry.read" },
      { href: "/market-planning", label: "Market Planning", icon: Target, permission: "market-planning.read" },
      { href: "/feed-production", label: "Feed Mill", icon: Factory, permission: "feed.read" },
      { href: "/soya-processing", label: "Soya", icon: Sprout, permission: "soya.read" },
      { href: "/inventory", label: "Inventory", icon: PackageSearch, permission: "inventory.read" },
      { href: "/qr-labels", label: "QR Labels", icon: QrCode, permission: "inventory.read" },
      { href: "/maintenance", label: "Maintenance", icon: Wrench, permission: "maintenance.read" },
      { href: "/quality", label: "Quality", icon: FlaskConical, permission: "quality.read" }
    ]
  },
  {
    title: "Commercial",
    items: [
      { href: "/sales", label: "Sales", icon: ReceiptText, permission: "sales.read" },
      { href: "/finance", label: "Finance", icon: Wallet, permission: "finance.read" },
      { href: "/procurement", label: "Procurement", icon: ShoppingCart, permission: "procurement.read" },
      { href: "/quickbooks", label: "QuickBooks", icon: BookOpen, permission: "quickbooks.read" }
    ]
  },
  {
    title: "Admin",
    items: [
      { href: "/hr", label: "HR", icon: Briefcase, permission: "hr.read" },
      { href: "/platform", label: "Sites", icon: MapPinned, permission: "platform.read" },
      { href: "/identity/users", label: "Users", icon: Users, permission: "identity.read" },
      { href: "/identity/roles", label: "Roles", icon: ShieldCheck, permission: "identity.read" },
      { href: "/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
      { href: "/settings/catalog", label: "Catalog", icon: PackageSearch, permission: "settings.manage" },
      { href: "/audit", label: "Audit", icon: ClipboardList, permission: "audit.read" },
      { href: "/notifications", label: "Notifications", icon: BellRing },
      { href: "/platform/mobile-sync", label: "Mobile Sync", icon: Smartphone, permission: "platform.manage" },
      { href: "/platform/backup", label: "Backup", icon: HardDrive, permission: "platform.manage" },
      { href: "/profile", label: "Profile", icon: UserCircle }
    ]
  }
];

function initials(name?: string) {
  return (name ?? "AKOKO SOLUTIONS")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function hasAccess(
  permission: string | undefined,
  userPermissions: string[],
  globalAccess?: boolean
): boolean {
  if (!permission) return true;
  if (globalAccess) return true;
  return userPermissions.includes(permission);
}

function NavLink({
  item,
  pathname,
  unreadAlerts,
  onClick
}: {
  item: NavItem;
  pathname: string;
  unreadAlerts: number;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-brand text-white shadow-soft"
          : "text-ink/70 hover:bg-field hover:text-ink"
      }`}
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.href === "/alerts" && unreadAlerts > 0 ? (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {unreadAlerts > 99 ? "99+" : unreadAlerts}
        </span>
      ) : active ? (
        <ChevronRight aria-hidden className="h-4 w-4 opacity-80" />
      ) : null}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, ready, signOut } = useAuth();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    apiFetch<ApiEnvelope<{ count: number }>>("/alerts/unread-count")
      .then((res) => setUnreadAlerts(res.data.count))
      .catch(() => undefined);
  }, []);

  function openSearch() {
    setSearchQuery("");
    setSearchFocus(0);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchFocus(0);
  }

  // Global keyboard shortcut: Ctrl+K / Cmd+K opens search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchOpen ? closeSearch() : openSearch();
      }
      if (e.key === "Escape" && searchOpen) closeSearch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 20);
  }, [searchOpen]);

  async function handleSignOut() {
    await signOut();
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-field">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-sm text-ink/70 shadow-panel">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand" />
          Loading secure session...
        </div>
      </main>
    );
  }

  const userPermissions = profile?.permissions ?? [];
  const globalAccess = profile?.hasGlobalAccess;

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAccess(item.permission, userPermissions, globalAccess))
    }))
    .filter((group) => group.items.length > 0);

  const renderNav = (onNavigate?: () => void) => (
    <nav aria-label="Main navigation">
      {visibleGroups.map((group) => (
        <div key={group.title} className="mb-1">
          <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-ink/40">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                unreadAlerts={unreadAlerts}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderUserCard = () => (
    <div className="rounded-lg border border-line bg-field/70 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-brand shadow-sm ring-1 ring-line">
          {initials(profile?.fullName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{profile?.fullName ?? "Signed in"}</p>
          <p className="truncate text-xs text-ink/55">{profile?.email ?? "Secure session"}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-ink/55">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live environment
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-field/70 text-ink lg:grid lg:grid-cols-[280px_1fr]">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden border-r border-line bg-white px-5 py-5 shadow-soft lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-12 w-12 shrink-0 rounded-xl shadow-soft" />
            <span className="min-w-0">
              <span className="app-kicker block">AKOKO SOLUTIONS ERP</span>
              <span className="block truncate text-[17px] font-bold tracking-tight">
                Operations Console
              </span>
            </span>
          </Link>
        </div>

        <div className="mb-3">
          {renderUserCard()}
        </div>

        <div className="relative flex-1 overflow-y-auto">
          {renderNav()}
          {/* fade hint that sidebar scrolls */}
          <div className="pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
        </div>

        <button
          className="app-button-secondary mt-4 w-full"
          onClick={handleSignOut}
        >
          <LogOut aria-hidden className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 animate-fade-in bg-ink/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] animate-slide-in flex-col border-r border-line bg-white px-5 py-5 shadow-panel lg:hidden">
            <div className="mb-4 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
                <BrandLogo className="h-10 w-10 shrink-0 rounded-xl" />
                <span className="text-sm font-bold">AKOKO SOLUTIONS ERP</span>
              </Link>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg text-ink/50 transition hover:bg-field"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3">
              {renderUserCard()}
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderNav(() => setMobileOpen(false))}
            </div>

            <button
              className="app-button-secondary mt-4 w-full"
              onClick={handleSignOut}
            >
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </button>
          </aside>
        </>
      )}

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:bg-field lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-sidebar"
              >
                <Menu aria-hidden className="h-4 w-4" />
              </button>
              {/* Workspace label — desktop only */}
              <div className="hidden items-center gap-2 text-sm text-ink/60 lg:flex">
                <Building2 aria-hidden className="h-4 w-4 text-brand" />
                <span className="font-medium">Multi-farm ERP workspace</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search button */}
              <button
                onClick={openSearch}
                className="hidden min-h-10 w-[220px] items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-ink/40 transition hover:border-brand/30 hover:text-ink/60 xl:flex"
                aria-label="Search"
              >
                <Search aria-hidden className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Search modules…</span>
                <kbd className="hidden rounded border border-line bg-field px-1.5 py-0.5 text-[10px] font-semibold text-ink/30 sm:block">⌃K</kbd>
              </button>
              <button
                onClick={openSearch}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:bg-field xl:hidden"
                aria-label="Search"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>

              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>

      {/* ── Global Search Modal ──────────────────────────────────────────── */}
      {searchOpen && (() => {
        const allItems = visibleGroups.flatMap((g) =>
          g.items.map((item) => ({ ...item, group: g.title }))
        );
        const q = searchQuery.toLowerCase().trim();
        const filtered = q
          ? allItems.filter(
              (item) =>
                item.label.toLowerCase().includes(q) ||
                item.group.toLowerCase().includes(q)
            )
          : allItems;
        const clamped = Math.min(Math.max(searchFocus, 0), Math.max(filtered.length - 1, 0));

        function onSearchKey(e: React.KeyboardEvent) {
          if (e.key === "ArrowDown") { e.preventDefault(); setSearchFocus((f) => Math.min(f + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSearchFocus((f) => Math.max(f - 1, 0)); }
          else if (e.key === "Enter" && filtered[clamped]) {
            closeSearch();
            router.push(filtered[clamped].href);
          }
          else if (e.key === "Escape") closeSearch();
        }

        return (
          <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
              onClick={closeSearch}
              aria-hidden
            />

            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-ink/40" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search modules, pages…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchFocus(0); }}
                  onKeyDown={onSearchKey}
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink/35 focus:outline-none"
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchFocus(0); searchInputRef.current?.focus(); }}
                    className="rounded p-0.5 text-ink/40 hover:text-ink"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <kbd className="rounded border border-line bg-field px-1.5 py-0.5 text-[10px] font-semibold text-ink/30">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[380px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-ink/40">No results for "{searchQuery}"</p>
                ) : (
                  (() => {
                    let globalIdx = -1;
                    const groups = visibleGroups
                      .map((g) => ({
                        title: g.title,
                        items: filtered.filter((item) => item.group === g.title)
                      }))
                      .filter((g) => g.items.length > 0);

                    return groups.map((g) => (
                      <div key={g.title}>
                        <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-ink/35">
                          {g.title}
                        </p>
                        {g.items.map((item) => {
                          globalIdx++;
                          const idx = globalIdx;
                          const Icon = item.icon;
                          const isFocused = idx === clamped && filtered.length > 0;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={closeSearch}
                              onMouseEnter={() => setSearchFocus(idx)}
                              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                                isFocused
                                  ? "bg-brand text-white"
                                  : "text-ink hover:bg-field"
                              }`}
                            >
                              <Icon
                                className={`h-4 w-4 shrink-0 ${isFocused ? "text-white" : "text-ink/50"}`}
                                aria-hidden
                              />
                              <span className="flex-1 font-medium">{item.label}</span>
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 ${isFocused ? "text-white/70" : "text-ink/25"}`}
                                aria-hidden
                              />
                            </Link>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center gap-4 border-t border-line bg-field/60 px-4 py-2">
                <span className="text-[10px] text-ink/40">
                  <kbd className="rounded border border-line bg-white px-1 font-semibold">↑↓</kbd> navigate
                </span>
                <span className="text-[10px] text-ink/40">
                  <kbd className="rounded border border-line bg-white px-1 font-semibold">↵</kbd> open
                </span>
                <span className="text-[10px] text-ink/40">
                  <kbd className="rounded border border-line bg-white px-1 font-semibold">ESC</kbd> close
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
