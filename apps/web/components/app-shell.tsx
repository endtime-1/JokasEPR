"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notification-bell";
import {
  AlertTriangle,
  Bell,
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
      { href: "/audit", label: "Audit", icon: ClipboardList, permission: "audit.read" },
      { href: "/notifications", label: "Notifications", icon: BellRing },
      { href: "/platform/mobile-sync", label: "Mobile Sync", icon: Smartphone, permission: "platform.manage" },
      { href: "/platform/backup", label: "Backup", icon: HardDrive, permission: "platform.manage" },
      { href: "/profile", label: "Profile", icon: UserCircle }
    ]
  }
];

type Profile = {
  fullName: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  hasGlobalAccess?: boolean;
};

function initials(name?: string) {
  return (name ?? "Akoko")
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
      className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const signOutRef = useRef(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    apiFetch<ApiEnvelope<Profile>>("/auth/me")
      .then((res) => setProfile(res.data))
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setReady(true));

    apiFetch<ApiEnvelope<{ count: number }>>("/alerts/unread-count")
      .then((res) => setUnreadAlerts(res.data.count))
      .catch(() => undefined);
  }, [router]);

  async function handleSignOut() {
    if (signOutRef.current) return;
    signOutRef.current = true;
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
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
          <p className="px-3 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink/40">
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
              <span className="app-kicker block">Akoko ERP</span>
              <span className="block truncate text-[17px] font-bold tracking-tight">
                Operations Console
              </span>
            </span>
          </Link>
        </div>

        <div className="mb-4">
          {renderUserCard()}
        </div>

        <div className="flex-1 overflow-y-auto">
          {renderNav()}
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
                <span className="text-sm font-bold">Akoko ERP</span>
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
              {/* Search hint — large screens */}
              <div className="hidden min-h-10 w-[240px] items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-ink/40 xl:flex">
                <Search aria-hidden className="h-4 w-4 shrink-0" />
                <span>Search modules, records</span>
              </div>

              {/* Alerts bell */}
              <Link
                href="/alerts"
                className="relative grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink/70 transition hover:bg-field"
                aria-label={`AI alerts${unreadAlerts > 0 ? `, ${unreadAlerts} unread` : ""}`}
              >
                <Bell aria-hidden className="h-4 w-4" />
                {unreadAlerts > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                    {unreadAlerts > 99 ? "99+" : unreadAlerts}
                  </span>
                )}
              </Link>

              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
