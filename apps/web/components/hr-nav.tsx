"use client";

import { Banknote, CalendarClock, Gavel, GraduationCap, Target, Users } from "lucide-react";
import { ModuleNav, type ModuleNavGroup } from "./module-nav";


// 23 flat links used to wrap over several rows. They are now six groups, each with a short tab row.
const HR_GROUPS: ModuleNavGroup[] = [
  {
    label: "People", icon: Users,
    items: [
      { href: "/hr", label: "Dashboard" },
      { href: "/hr/employees", label: "Employees" },
      { href: "/hr/employee-roles", label: "Roles" },
      { href: "/hr/org-chart", label: "Org chart" },
    ],
  },
  {
    label: "Time & leave", icon: CalendarClock,
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
    label: "Pay", icon: Banknote,
    items: [
      { href: "/hr/payroll", label: "Payroll" },
      { href: "/hr/salary-bands", label: "Salary bands" },
    ],
  },
  {
    label: "Talent", icon: GraduationCap,
    items: [
      { href: "/hr/recruitment", label: "Recruitment" },
      { href: "/hr/onboarding", label: "Onboarding" },
      { href: "/hr/training", label: "Training" },
      { href: "/hr/training-courses", label: "Training catalog" },
    ],
  },
  {
    label: "Performance", icon: Target,
    items: [
      { href: "/hr/tasks", label: "Task board" },
      { href: "/hr/performance", label: "Performance" },
      { href: "/hr/reports/productivity", label: "Productivity report" },
    ],
  },
  {
    label: "Governance", icon: Gavel,
    items: [
      { href: "/hr/disciplinary", label: "Disciplinary" },
      { href: "/hr/grievances", label: "Grievances" },
      { href: "/hr/compliance", label: "Compliance" },
      { href: "/hr/approval-workflows", label: "Approval workflows" },
    ],
  },
];

export function HRNavBar() {
  return <ModuleNav groups={HR_GROUPS} ariaLabel="HR sections" />;
}
