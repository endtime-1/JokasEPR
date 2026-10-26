"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CalendarClock, Gavel, GraduationCap, Target, Users, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string };
type NavGroup = { key: string; label: string; icon: LucideIcon; items: NavItem[] };

// 23 flat links used to wrap over several rows. They are now six groups, each with a short tab row.
export const HR_NAV_GROUPS: NavGroup[] = [
  {
    key: "people", label: "People", icon: Users,
    items: [
      { href: "/hr", label: "Dashboard" },
      { href: "/hr/employees", label: "Employees" },
      { href: "/hr/employee-roles", label: "Roles" },
      { href: "/hr/org-chart", label: "Org chart" },
    ],
  },
  {
    key: "time", label: "Time & leave", icon: CalendarClock,
    items: [
      { href: "/hr/attendance", label: "Attendance" },
      { href: "/hr/shifts", label: "Shifts" },
      { href: "/hr/leave-requests", label: "Leave requests" },
      { href: "/hr/leave-balance", label: "Leave balance" },
      { href: "/hr/leave-policies", label: "Leave policies" },
      { href: "/hr/public-holidays", label: "Public holidays" },
    ],
  },
  {
    key: "pay", label: "Pay", icon: Banknote,
    items: [
      { href: "/hr/payroll", label: "Payroll" },
      { href: "/hr/salary-bands", label: "Salary bands" },
    ],
  },
  {
    key: "talent", label: "Talent", icon: GraduationCap,
    items: [
      { href: "/hr/recruitment", label: "Recruitment" },
      { href: "/hr/onboarding", label: "Onboarding" },
      { href: "/hr/training", label: "Training" },
      { href: "/hr/training-courses", label: "Training catalog" },
    ],
  },
  {
    key: "performance", label: "Performance", icon: Target,
    items: [
      { href: "/hr/tasks", label: "Task board" },
      { href: "/hr/performance", label: "Performance" },
      { href: "/hr/reports/productivity", label: "Productivity report" },
    ],
  },
  {
    key: "governance", label: "Governance", icon: Gavel,
    items: [
      { href: "/hr/disciplinary", label: "Disciplinary" },
      { href: "/hr/grievances", label: "Grievances" },
      { href: "/hr/compliance", label: "Compliance" },
      { href: "/hr/approval-workflows", label: "Approval workflows" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/hr" ? pathname === "/hr" : pathname === href || pathname.startsWith(href + "/");
}

/** Two-level navigation for the HR module: group pills on top, that group's pages below. */
export function HRNavBar() {
  const pathname = usePathname() ?? "";
  const rowRef = useRef<HTMLDivElement>(null);

  // The page you are on decides the group. Sub-pages like /hr/employees/123 belong to their parent.
  const active =
    HR_NAV_GROUPS.find((g) => g.items.some((i) => isActive(pathname, i.href) && i.href !== "/hr")) ??
    HR_NAV_GROUPS.find((g) => g.items.some((i) => isActive(pathname, i.href))) ??
    HR_NAV_GROUPS[0];

  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="mb-6 space-y-3" data-no-print="">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="HR sections">
        {HR_NAV_GROUPS.map((g) => {
          const on = g.key === active.key;
          const Icon = g.icon;
          return (
            <Link
              key={g.key}
              href={g.items[0].href}
              role="tab"
              aria-selected={on}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                on
                  ? "border-brand bg-brandTint text-brand shadow-sm"
                  : "border-line bg-white text-ink/65 hover:border-brand/40 hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {g.label}
            </Link>
          );
        })}
      </div>
      <div ref={rowRef} className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label={`${active.label} pages`}>
        {active.items.map((n) => {
          const on = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
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
    </div>
  );
}
