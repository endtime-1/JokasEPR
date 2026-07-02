"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, Package, ShoppingBag, ExternalLink } from "lucide-react";
import { AppShell } from "../../components/app-shell";

const TABS = [
  { href: "/storefront",          label: "Overview", icon: Globe       },
  { href: "/storefront/products", label: "Products", icon: Package     },
  { href: "/storefront/orders",   label: "Orders",   icon: ShoppingBag },
];

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Sub-nav */}
        <div className="flex items-center justify-between gap-4 border-b border-line pb-0">
          <nav className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active =
                tab.href === "/storefront"
                  ? pathname === "/storefront"
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    active
                      ? "border-brand text-brand"
                      : "border-transparent text-ink/50 hover:text-ink"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <a
            href="http://localhost:3002"
            target="_blank"
            rel="noreferrer"
            className="mb-1 flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink/50 shadow-sm transition hover:border-brand/30 hover:text-brand"
          >
            <ExternalLink className="h-3 w-3" />
            Live Site
          </a>
        </div>

        {children}
      </div>
    </AppShell>
  );
}
