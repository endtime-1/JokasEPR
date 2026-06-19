"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { AppShell } from "./app-shell";

const NAV_GROUPS = [
  {
    label: "Flock",
    items: [
      { href: "/poultry", label: "Dashboard", exact: true },
      { href: "/poultry/houses", label: "Houses & Pens" },
      { href: "/poultry/batches", label: "Batches" }
    ]
  },
  {
    label: "Operations",
    items: [
      { href: "/poultry/daily-records", label: "Daily Records" },
      { href: "/poultry/egg-production", label: "Egg Production" },
      { href: "/poultry/feed-consumption", label: "Feed" },
      { href: "/poultry/bird-weight", label: "Bird Weight" },
      { href: "/poultry/mortality", label: "Mortality" }
    ]
  },
  {
    label: "Health",
    items: [
      { href: "/poultry/health-observations", label: "Health" },
      { href: "/poultry/medication", label: "Medications" },
      { href: "/poultry/vaccination", label: "Vaccinations" }
    ]
  },
  {
    label: "Commercial",
    items: [
      { href: "/poultry/transfers", label: "Transfers" },
      { href: "/poultry/costs", label: "Costs" },
      { href: "/poultry/reports", label: "Reports" }
    ]
  }
];

export function PoultryShell({ children }: { children: React.ReactNode }) {
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
