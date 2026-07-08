"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/inventory", label: "Dashboard", exact: true },
      { href: "/inventory/items", label: "Items" },
      { href: "/inventory/movements", label: "Movements" }
    ]
  },
  {
    label: "Operations",
    items: [
      { href: "/inventory/stock-in", label: "Stock In" },
      { href: "/inventory/stock-out", label: "Stock Out" },
      { href: "/inventory/transfers", label: "Transfers" },
      { href: "/inventory/adjustments", label: "Adjustments" }
    ]
  },
  {
    label: "Alerts",
    items: [
      { href: "/inventory/low-stock", label: "Low Stock" },
      { href: "/inventory/expiry-alerts", label: "Expiry Alerts" }
    ]
  },
  {
    label: "Reports",
    items: [
      { href: "/inventory/valuation", label: "Valuation" },
      { href: "/inventory/reports", label: "Reports" }
    ]
  },
  {
    label: "Locations",
    items: [
      { href: "/inventory/warehouses", label: "Warehouses" },
      { href: "/inventory/farms", label: "Farms" },
      { href: "/inventory/production-sites", label: "Production Sites" }
    ]
  }
];

// Used by pages directly (AppShell is provided by the route layout)
export function InventoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
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
    </>
  );
}
