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
  Globe,
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
      { href: "/storefront", label: "Storefront", icon: Globe, permission: "sales.read" },
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
  return (name ?? "Jokas ERP")
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
  allHrefs,
  unreadAlerts,
  onClick
}: {
  item: NavItem;
  pathname: string;
  allHrefs: string[];
  unreadAlerts: number;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  // Only highlight with prefix-match if no other nav item has a longer, more specific match
  const active =
    pathname === item.href ||
    (pathname.startsWith(`${item.href}/`) &&
      !allHrefs.some(
        (h) => h !== item.href && h.length > item.href.length && pathname.startsWith(h)
      ));
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Scroll the active item into view within the sidebar only — never the main page
  useEffect(() => {
    if (active && linkRef.current) {
      const el = linkRef.current;
      const container = el.closest<HTMLElement>("[data-nav-scroll]");
      if (container) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        container.scrollTop += eRect.top - cRect.top - cRect.height / 2 + eRect.height / 2;
      }
    }
  }, [active]);

  return (
    <Link
      ref={linkRef}
      href={item.href}
      onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
        active
          ? "bg-brand text-white shadow-lg shadow-brand/25"
          : "text-white/65 hover:bg-white/8 hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/60" />
      )}
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all ${
        active ? "bg-white/20" : "bg-white/6 group-hover:bg-white/12"
      }`}>
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.href === "/alerts" && unreadAlerts > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
          {unreadAlerts > 99 ? "99+" : unreadAlerts}
        </span>
      ) : active ? (
        <ChevronRight aria-hidden className="h-3.5 w-3.5 opacity-60" />
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

  // Redirect to login when any apiFetch signals the session has fully expired
  useEffect(() => {
    function onSessionExpired() {
      router.push("/login");
    }
    window.addEventListener("auth:session-expired", onSessionExpired);
    return () => window.removeEventListener("auth:session-expired", onSessionExpired);
  }, [router]);

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
      <div className="min-h-screen bg-[#f0f2f5] text-ink lg:grid lg:grid-cols-[300px_1fr]">
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden"
          style={{ background: "linear-gradient(160deg, #1a2235 0%, #0f1623 60%, #141c2e 100%)" }}>
          <div className="relative flex h-full flex-col px-5 py-6">
            <div className="pointer-events-none absolute -top-10 left-4 h-32 w-32 rounded-full bg-brand/12 blur-2xl" />
            <div className="mb-5 h-11 w-44 animate-pulse rounded-xl bg-white/10" />
            <div className="mb-4 h-20 animate-pulse rounded-2xl bg-white/8" />
            <div className="mb-4 h-px bg-white/8" />
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl bg-white/6" />
              ))}
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-black/6 bg-white/80 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
              <div className="h-5 w-48 animate-pulse rounded-md bg-ink/8" />
              <div className="h-9 w-9 animate-pulse rounded-xl bg-ink/8" />
            </div>
          </header>
          <main className="px-5 py-7 lg:px-8">{children}</main>
        </div>
      </div>
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

  const allNavHrefs = visibleGroups.flatMap((g) => g.items.map((i) => i.href));

  const renderNav = (onNavigate?: () => void) => (
    <nav aria-label="Main navigation" className="space-y-0.5">
      {visibleGroups.map((group, gi) => (
        <div key={group.title} className={gi > 0 ? "mt-1 pt-4" : ""}>
          <p className="mb-1 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                allHrefs={allNavHrefs}
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
    <div className="rounded-2xl border border-white/10 bg-white/6 p-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-[#c65f0f] text-[13px] font-bold text-white shadow-lg shadow-brand/30">
            {initials(profile?.fullName)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#1a2235] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{profile?.fullName ?? "Loading…"}</p>
          <p className="truncate text-xs text-white/45">{profile?.email ?? ""}</p>
        </div>
      </div>
      {profile && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(profile.roles ?? []).slice(0, 2).map((role) => (
            <span key={role} className="rounded-md border border-brand/25 bg-brand/12 px-2 py-0.5 text-[10px] font-semibold text-brand/90">
              {role}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const sidebarContent = (onNavigate?: () => void) => (
    <>
      {/* Brand */}
      <div className="mb-5 flex items-center gap-3 px-1">
        <Link href="/dashboard" onClick={onNavigate} className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <BrandLogo className="h-11 w-11 rounded-xl shadow-lg shadow-brand/20" />
            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#1a2235] bg-emerald-400 shadow-sm" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand/80">Jokas ERP</p>
            <p className="truncate text-base font-bold text-white">Operations Console</p>
          </div>
        </Link>
      </div>

      {/* User card */}
      <div className="mb-4">
        {renderUserCard()}
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* Nav */}
      <div data-nav-scroll="" className="relative flex-1 overflow-y-auto">
        {renderNav(onNavigate)}
        <div className="pointer-events-none sticky bottom-0 h-8 bg-gradient-to-t from-[#1a2235] to-transparent" />
      </div>

      {/* Sign out */}
      <div className="mt-4 border-t border-white/8 pt-4">
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 transition hover:bg-red-500/12 hover:text-red-400"
          onClick={handleSignOut}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/6">
            <LogOut aria-hidden className="h-3.5 w-3.5" />
          </span>
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-ink lg:grid lg:grid-cols-[300px_1fr]">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1a2235 0%, #0f1623 60%, #141c2e 100%)" }}>
        {/* Decorative brand glow */}
        <div className="pointer-events-none absolute -top-10 left-4 h-32 w-32 rounded-full bg-brand/12 blur-2xl" />
        <div className="pointer-events-none absolute bottom-20 right-0 h-24 w-24 rounded-full bg-brand/6 blur-2xl" />
        <div className="relative flex h-full flex-col px-5 py-6">
          {sidebarContent()}
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-[300px] animate-slide-in flex-col overflow-hidden lg:hidden"
            style={{ background: "linear-gradient(160deg, #1a2235 0%, #0f1623 60%, #141c2e 100%)" }}
          >
            <div className="pointer-events-none absolute -top-10 left-4 h-32 w-32 rounded-full bg-brand/12 blur-2xl" />
            <div className="relative flex h-full flex-col px-5 py-6">
              <button
                className="absolute right-4 top-5 grid h-8 w-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarContent(() => setMobileOpen(false))}
            </div>
          </aside>
        </>
      )}

      {/* ── Main content area ────────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-black/6 bg-white/80 shadow-sm shadow-black/4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink/60 shadow-sm transition hover:bg-field hover:text-ink lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileOpen}
              >
                <Menu aria-hidden className="h-4 w-4" />
              </button>

              {/* Breadcrumb — desktop */}
              <div className="hidden items-center gap-2.5 lg:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10">
                  <Building2 aria-hidden className="h-3.5 w-3.5 text-brand" />
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-ink">
                    {profile?.fullName
                      ? (profile.roles?.[0] ?? "Admin")
                      : "Loading…"}
                  </span>
                  <span className="mx-1.5 text-ink/30">/</span>
                  <span className="text-ink/55">Multi-farm ERP workspace</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search button */}
              <button
                onClick={openSearch}
                className="hidden min-h-9 w-[240px] items-center gap-2.5 rounded-xl border border-line bg-field/60 px-3.5 text-sm text-ink/35 transition hover:border-brand/25 hover:bg-white hover:text-ink/55 xl:flex"
                aria-label="Search"
              >
                <Search aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Search modules…</span>
                <kbd className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-bold text-ink/25">⌃K</kbd>
              </button>
              <button
                onClick={openSearch}
                className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink/60 shadow-sm transition hover:bg-field xl:hidden"
                aria-label="Search"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>

              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="px-5 py-7 lg:px-8">{children}</main>
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
          <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh]">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeSearch}
              aria-hidden
            />
            <div className="relative z-10 w-full max-w-[540px] overflow-hidden rounded-2xl border border-line bg-white shadow-modal animate-slide-up">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10">
                  <Search className="h-3.5 w-3.5 text-brand" />
                </div>
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
                    className="rounded-lg p-1 text-ink/40 hover:bg-field hover:text-ink"
                    aria-label="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <kbd className="rounded-md border border-line bg-field px-1.5 py-0.5 text-[10px] font-bold text-ink/30">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[420px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-sm font-medium text-ink/40">No results for "{searchQuery}"</p>
                    <p className="mt-1 text-xs text-ink/25">Try a different keyword</p>
                  </div>
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
                        <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/35">
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
                              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                                isFocused
                                  ? "bg-brand text-white"
                                  : "text-ink hover:bg-field"
                              }`}
                            >
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                                isFocused ? "bg-white/20" : "bg-field"
                              }`}>
                                <Icon className={`h-3.5 w-3.5 ${isFocused ? "text-white" : "text-brand"}`} aria-hidden />
                              </span>
                              <span className="flex-1 font-medium">{item.label}</span>
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 ${isFocused ? "text-white/60" : "text-ink/20"}`}
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

              {/* Footer */}
              <div className="flex items-center gap-4 border-t border-line bg-field/60 px-4 py-2.5">
                {[["↑↓", "navigate"], ["↵", "open"], ["ESC", "close"]].map(([key, label]) => (
                  <span key={key} className="flex items-center gap-1.5 text-[10px] text-ink/40">
                    <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-bold">{key}</kbd>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
