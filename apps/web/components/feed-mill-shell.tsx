"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { AppShell } from "./app-shell";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/feed-production", label: "Dashboard", exact: true },
      { href: "/feed-production/formulas", label: "Formulas" },
      { href: "/feed-production/orders", label: "Orders" }
    ]
  },
  {
    label: "Production",
    items: [
      { href: "/feed-production/quality-control", label: "Quality Control" },
      { href: "/feed-production/raw-material-usage", label: "Raw Materials" }
    ]
  },
  {
    label: "Stock",
    items: [
      { href: "/feed-production/finished-feed-inventory", label: "Finished Stock" },
      { href: "/feed-production/internal-transfer", label: "Transfers" }
    ]
  },
  {
    label: "Reports",
    items: [{ href: "/feed-production/reports", label: "Reports" }]
  },
  {
    label: "Intelligence",
    items: [{ href: "/feed-production/hipro-predictive", label: "Hi-Pro Predictive" }]
  }
];

export function FeedMillShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="-mx-4 -mt-6 mb-6 border-b border-line bg-white px-4 lg:-mx-8 lg:px-8">
        <div className="flex items-end gap-0 overflow-x-auto scrollbar-none">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={`flex items-end ${gi > 0 ? "ml-1 border-l border-line pl-1" : ""}`}>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      active
                        ? "border-brand text-brand"
                        : "border-transparent text-ink/55 hover:text-ink hover:border-ink/20"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {children}
    </AppShell>
  );
}
