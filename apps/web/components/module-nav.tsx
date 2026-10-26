"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export type ModuleNavItem = {
  href: string;
  label: string;
  /** Active only on this exact path (use for a module's dashboard). */
  exact?: boolean;
  /** Custom rule, e.g. for tabs that differ only by a query string. */
  isActive?: (pathname: string) => boolean;
};
export type ModuleNavGroup = { label: string; icon: LucideIcon; items: ModuleNavItem[] };

function itemActive(pathname: string, item: ModuleNavItem) {
  if (item.isActive) return item.isActive(pathname);
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * The navigation every module uses: group pills on top, and that group's pages as tabs below.
 * The group is chosen from the page you are on, so sub-pages stay under their parent.
 */
export function ModuleNav({ groups, ariaLabel = "Sections" }: { groups: ModuleNavGroup[]; ariaLabel?: string }) {
  const pathname = usePathname() ?? "";
  const rowRef = useRef<HTMLDivElement>(null);

  // Prefer the most specific matching link (longest href) so "/x/items" beats the "/x" dashboard.
  let active = groups[0];
  let best = -1;
  for (const g of groups) {
    for (const i of g.items) {
      if (itemActive(pathname, i) && i.href.length > best) {
        best = i.href.length;
        active = g;
      }
    }
  }

  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="mb-6 space-y-3" data-no-print="">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={ariaLabel}>
        {groups.map((g) => {
          const on = g === active;
          const Icon = g.icon;
          return (
            <Link
              key={g.label}
              href={g.items[0].href}
              role="tab"
              aria-selected={on}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                on
                  ? "border-brand bg-brandTint text-brand shadow-sm"
                  : "border-line bg-surface text-ink/65 hover:border-brand/40 hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {g.label}
            </Link>
          );
        })}
      </div>
      {active.items.length > 1 && (
        <div ref={rowRef} className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label={`${active.label} pages`}>
          {active.items.map((n) => {
            const on = itemActive(pathname, n);
            return (
              <Link
                key={n.href + n.label}
                href={n.href}
                role="tab"
                aria-selected={on}
                {...(on ? { "data-active": "" } : {})}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
                  on ? "border-brand font-semibold text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
