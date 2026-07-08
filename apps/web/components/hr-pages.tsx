"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, CircleAlert, ClipboardList, DollarSign, UserCheck, UserPlus, Users } from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(d?: string | Date | null) {
  if (!d) return "â€”";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    ON_LEAVE: "bg-yellow-100 text-yellow-800",
    SUSPENDED: "bg-orange-100 text-orange-700",
    TERMINATED: "bg-red-100 text-red-700",
    RESIGNED: "bg-gray-200 text-gray-700",
    PRESENT: "bg-green-100 text-green-700",
    ABSENT: "bg-red-100 text-red-700",
    LATE: "bg-yellow-100 text-yellow-800",
    HALF_DAY: "bg-blue-100 text-blue-700",
    PUBLIC_HOLIDAY: "bg-purple-100 text-purple-700",
    OPEN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-indigo-100 text-indigo-700",
    ON_HOLD: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-200 text-gray-700",
    LOW: "bg-gray-100 text-gray-600",
    MEDIUM: "bg-blue-100 text-blue-700",
    HIGH: "bg-orange-100 text-orange-700",
    URGENT: "bg-red-100 text-red-700",
    ASSIGNED: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-indigo-100 text-indigo-700",
    REJECTED: "bg-red-100 text-red-700",
    PASSED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    ONGOING: "bg-blue-100 text-blue-700",
    DRAFT: "bg-gray-100 text-gray-600",
    APPROVED: "bg-green-100 text-green-700",
    PAID: "bg-green-200 text-green-800",
    REVIEWED: "bg-indigo-100 text-indigo-700",
    ACKNOWLEDGED: "bg-green-100 text-green-700",
    OUTSTANDING: "bg-purple-100 text-purple-700",
    EXCEEDS_EXPECTATIONS: "bg-blue-100 text-blue-700",
    MEETS_EXPECTATIONS: "bg-green-100 text-green-700",
    NEEDS_IMPROVEMENT: "bg-yellow-100 text-yellow-800",
    UNSATISFACTORY: "bg-red-100 text-red-700",
  };
  const c = colours[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{status.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

// â”€â”€â”€ Nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const hrNav = [
  { href: "/hr", label: "Dashboard" },
  { href: "/hr/employees", label: "Employees" },
  { href: "/hr/attendance", label: "Attendance" },
  { href: "/hr/shifts", label: "Shifts" },
  { href: "/hr/tasks", label: "Task Board" },
  { href: "/hr/payroll", label: "Payroll" },
  { href: "/hr/training", label: "Training" },
  { href: "/hr/performance", label: "Performance" },
  { href: "/hr/reports/productivity", label: "Productivity Report" },
];

function HRNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-field/60 p-1 [scrollbar-width:none]">
      {hrNav.map((n) => {
        const active = n.href === "/hr" ? pathname === "/hr" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all ${
              active
                ? "bg-white text-brand shadow-sm font-semibold"
                : "text-ink/55 hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

// â”€â”€â”€ Options hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type HROptions = {
  branches: { id: string; name: string; code: string }[];
  farms: { id: string; name: string; code: string }[];
  warehouses: { id: string; name: string; code: string }[];
  productionSites: { id: string; name: string; code: string }[];
  employeeRoles: { id: string; name: string; code: string }[];
  shifts: { id: string; name: string; code: string; startTime: string; endTime: string }[];
  employees: { id: string; fullName: string; code: string }[];
  bankAccounts: { id: string; accountName: string; bankName: string }[];
};

function useHROptions() {
  const [opts, setOpts] = useState<HROptions>({ branches: [], farms: [], warehouses: [], productionSites: [], employeeRoles: [], shifts: [], employees: [], bankAccounts: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<HROptions>>("/hr/options").then((r) => setOpts(r.data)).catch(() => undefined);
  }, []);
  return opts;
}

// â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DashData = {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  todayAttendanceCount: number;
  openTasks: number;
  urgentTasks: number;
  pendingPayroll: number;
  recentEmployees: Array<{ id: string; code: string; fullName: string; status: string; employeeRole?: { name: string }; branch?: { name: string } }>;
  recentTasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string }>;
};

export function HRDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  useEffect(() => {
    apiFetch<ApiEnvelope<DashData>>(“/hr/dashboard”).then((r) => setData(r.data)).catch(() => undefined);
  }, []);

  const kpis = [
    { label: “Total Employees”, value: data?.totalEmployees, icon: Users, color: “text-sky-400” },
    { label: “Active”, value: data?.activeEmployees, icon: UserCheck, color: “text-emerald-400” },
    { label: “On Leave”, value: data?.onLeave, icon: CalendarDays, color: “text-yellow-400” },
    { label: “Today Present”, value: data?.todayAttendanceCount, icon: ClipboardList, color: “text-blue-400” },
    { label: “Open Tasks”, value: data?.openTasks, icon: AlertTriangle, color: “text-purple-400” },
    { label: “Urgent Tasks”, value: data?.urgentTasks, icon: CircleAlert, color: “text-red-400” },
    { label: “Pending Payroll”, value: data?.pendingPayroll, icon: DollarSign, color: “text-orange-400” },
  ];

  return (
    <AppShell>
      <div className=”space-y-6”>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className=”overflow-hidden rounded-2xl bg-sidebar shadow-panel”>
          <div className=”flex flex-wrap items-start justify-between gap-4 px-6 py-5”>
            <div>
              <p className=”text-[11px] font-bold uppercase tracking-widest text-white/40”>Human Resources</p>
              <h1 className=”mt-1 text-2xl font-bold text-white”>HR & Workforce</h1>
              <p className=”mt-1 text-sm text-white/55”>Employees, attendance, payroll & task management</p>
            </div>
            <Link
              href=”/hr/employees/create”
              className=”flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-brandDark”
            >
              <UserPlus className=”h-4 w-4” aria-hidden />
              New Employee
            </Link>
          </div>

          {/* KPI strip */}
          <div className=”grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4 lg:grid-cols-7”>
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className=”flex flex-col items-center bg-sidebar px-3 py-4 text-center”>
                <Icon className={`mb-1.5 h-5 w-5 ${color}`} aria-hidden />
                {data
                  ? <p className=”text-2xl font-bold text-white”>{value ?? 0}</p>
                  : <div className=”h-7 w-10 animate-pulse rounded-md bg-white/10” />
                }
                <p className=”mt-0.5 text-[10px] leading-tight text-white/40”>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab nav ──────────────────────────────────────────────────────── */}
        <HRNav />

        {/* ── Recent data ──────────────────────────────────────────────────── */}
        <div className=”grid grid-cols-1 gap-6 lg:grid-cols-2”>

          {/* Recent Employees */}
          <div className=”overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm”>
            <div className=”flex items-center justify-between border-b border-slate-100 px-5 py-4”>
              <div>
                <h2 className=”text-sm font-semibold text-slate-800”>Recent Employees</h2>
                <p className=”text-xs text-slate-400”>Latest additions to the workforce</p>
              </div>
              <Link href=”/hr/employees” className=”text-xs font-semibold text-brand hover:underline”>View all →</Link>
            </div>
            <ul className=”divide-y divide-slate-50”>
              {!data && [1, 2, 3].map((i) => (
                <li key={i} className=”flex items-center gap-3 px-5 py-3.5”>
                  <div className=”h-9 w-9 animate-pulse rounded-full bg-slate-100” />
                  <div className=”flex-1 space-y-1.5”>
                    <div className=”h-3.5 w-36 animate-pulse rounded bg-slate-100” />
                    <div className=”h-3 w-24 animate-pulse rounded bg-slate-100” />
                  </div>
                </li>
              ))}
              {data?.recentEmployees.map((emp) => (
                <li key={emp.id} className=”flex items-center gap-3 px-5 py-3.5”>
                  <div className=”grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand”>
                    {emp.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className=”min-w-0 flex-1”>
                    <Link href={`/hr/employees/${emp.id}`} className=”text-sm font-medium text-slate-800 hover:text-brand hover:underline”>
                      {emp.fullName}
                    </Link>
                    <p className=”text-xs text-slate-400”>{emp.code} · {emp.employeeRole?.name ?? “No role”} · {emp.branch?.name ?? “”}</p>
                  </div>
                  <StatusBadge status={emp.status} />
                </li>
              ))}
              {data?.recentEmployees.length === 0 && (
                <li className=”flex h-20 items-center justify-center text-sm text-slate-400”>No employees yet</li>
              )}
            </ul>
          </div>

          {/* Recent Tasks */}
          <div className=”overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm”>
            <div className=”flex items-center justify-between border-b border-slate-100 px-5 py-4”>
              <div>
                <h2 className=”text-sm font-semibold text-slate-800”>Recent Tasks</h2>
                <p className=”text-xs text-slate-400”>Active operational tasks</p>
              </div>
              <Link href=”/hr/tasks” className=”text-xs font-semibold text-brand hover:underline”>Task board →</Link>
            </div>
            <ul className=”divide-y divide-slate-50”>
              {!data && [1, 2, 3].map((i) => (
                <li key={i} className=”flex items-center gap-3 px-5 py-3.5”>
                  <div className=”flex-1 space-y-1.5”>
                    <div className=”h-3.5 w-48 animate-pulse rounded bg-slate-100” />
                    <div className=”h-3 w-24 animate-pulse rounded bg-slate-100” />
                  </div>
                </li>
              ))}
              {data?.recentTasks.map((task) => (
                <li key={task.id} className=”flex items-center gap-3 px-5 py-3.5”>
                  <div className=”min-w-0 flex-1”>
                    <p className=”text-sm font-medium text-slate-800”>{task.title}</p>
                    <p className=”text-xs text-slate-400”>{task.dueDate ? `Due ${fmt(task.dueDate)}` : “No due date”}</p>
                  </div>
                  <div className=”flex shrink-0 flex-col items-end gap-1”>
                    <StatusBadge status={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </li>
              ))}
              {data?.recentTasks.length === 0 && (
                <li className=”flex h-20 items-center justify-center text-sm text-slate-400”>No tasks yet</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Employee List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Employee = { id: string; code: string; fullName: string; phone?: string; email?: string; status: string; startDate: string; employeeRole?: { name: string }; branch?: { name: string }; farm?: { name: string } };

export function EmployeeListPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    apiFetch<ApiEnvelope<Employee[]>>(`/hr/employees?${params}`).then((r) => setRows(r.data)).catch(() => undefined);
  }, [search, status]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Employees</h1>
          <Link href="/hr/employees/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Employee</Link>
        </div>
        <HRNav />
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, phone..." className="w-64 rounded-md border border-line px-3 py-2 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED", "RESIGNED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "fullName", label: "Name", render: (r) => <Link href={`/hr/employees/${r.id}`} className="font-medium text-brand hover:underline">{r.fullName as string}</Link> },
            { key: "employeeRole", label: "Role", render: (r) => r.employeeRole?.name ?? "â€”" },
            { key: "branch", label: "Branch/Site", render: (r) => r.branch?.name ?? r.farm?.name ?? "â€”" },
            { key: "phone", label: "Phone" },
            { key: "startDate", label: "Start Date", render: (r) => fmt(r.startDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No employees found"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Employee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CreateEmployeePage() {
  const router = useRouter();
  const opts = useHROptions();
  const [form, setForm] = useState({ code: "", firstName: "", lastName: "", phone: "", email: "", address: "", nationalId: "", startDate: "", gender: "", dateOfBirth: "", employeeRoleId: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "", basicSalary: "", bankName: "", bankAccount: "", ssnitNumber: "", tinNumber: "", emergencyContactName: "", emergencyContactPhone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/employees", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          basicSalary: form.basicSalary ? Number(form.basicSalary) : undefined,
          gender: form.gender || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          employeeRoleId: form.employeeRoleId || undefined,
          branchId: form.branchId || undefined,
          farmId: form.farmId || undefined,
          warehouseId: form.warehouseId || undefined,
          productionSiteId: form.productionSiteId || undefined,
        }),
      });
      router.push("/hr/employees");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/employees" className="text-sm text-ink/60 hover:text-ink">â† Employees</Link>
          <h1 className="text-xl font-bold">New Employee</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Employee Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Role</label>
                <select value={form.employeeRoleId} onChange={f("employeeRoleId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.employeeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">First Name *</label><input required value={form.firstName} onChange={f("firstName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Last Name *</label><input required value={form.lastName} onChange={f("lastName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Gender</label>
                <select value={form.gender} onChange={f("gender")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€”</option>
                  {["MALE", "FEMALE", "OTHER"].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">National ID</label><input value={form.nationalId} onChange={f("nationalId")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Phone</label><input value={form.phone} onChange={f("phone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Email</label><input type="email" value={form.email} onChange={f("email")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="mb-1 block text-xs font-medium">Address</label><textarea value={form.address} onChange={f("address")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <h2 className="font-semibold">Assignment & Payroll</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Start Date *</label><input required type="date" value={form.startDate} onChange={f("startDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Basic Salary (GHS)</label><input type="number" min={0} step={0.01} value={form.basicSalary} onChange={f("basicSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Farm</label>
                <select value={form.farmId} onChange={f("farmId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.farms.map((f_) => <option key={f_.id} value={f_.id}>{f_.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Bank Name</label><input value={form.bankName} onChange={f("bankName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Bank Account</label><input value={form.bankAccount} onChange={f("bankAccount")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">SSNIT Number</label><input value={form.ssnitNumber} onChange={f("ssnitNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">TIN Number</label><input value={form.tinNumber} onChange={f("tinNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Emergency Contact</label><input value={form.emergencyContactName} onChange={f("emergencyContactName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Emergency Phone</label><input value={form.emergencyContactPhone} onChange={f("emergencyContactPhone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="mb-1 block text-xs font-medium">Notes</label><textarea value={form.notes} onChange={f("notes")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : "Create Employee"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Employee Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type EmployeeDetail = Employee & {
  email?: string; address?: string; nationalId?: string; gender?: string; dateOfBirth?: string; basicSalary?: number;
  bankName?: string; bankAccount?: string; ssnitNumber?: string; tinNumber?: string;
  emergencyContactName?: string; emergencyContactPhone?: string; notes?: string;
  warehouse?: { name: string }; productionSite?: { name: string };
  attendanceRecords: Array<{ id: string; date: string; status: string; hoursWorked?: number }>;
  taskAssignments: Array<{ id: string; status: string; task: { title: string; priority: string; dueDate?: string } }>;
  payrollRecords: Array<{ id: string; period: string; netPay: number; status: string }>;
  trainingRecords: Array<{ id: string; title: string; trainingDate: string; outcome: string }>;
  performanceRecords: Array<{ id: string; period: string; overallRating: string; status: string }>;
};

export function EmployeeDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    apiFetch<ApiEnvelope<EmployeeDetail>>(`/hr/employees/${id}`).then((r) => setData(r.data)).catch(() => undefined);
  }, [id]);

  if (!data) return <AppShell><p className="text-sm text-ink/60 p-6">Loading...</p></AppShell>;

  const tabs = ["overview", "attendance", "tasks", "payroll", "training", "performance"];

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/employees" className="text-sm text-ink/60 hover:text-ink">â† Employees</Link>
          <h1 className="text-xl font-bold">{data.fullName}</h1>
          <StatusBadge status={data.status} />
        </div>

        <div className="flex gap-2 border-b border-line pb-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-medium capitalize rounded-t-md ${tab === t ? "bg-brand text-white" : "hover:bg-field"}`}>{t}</button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-white p-5 space-y-3">
              <h2 className="font-semibold">Personal Details</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink/60">Code</dt><dd className="font-medium">{data.code}</dd>
                <dt className="text-ink/60">Gender</dt><dd>{data.gender ?? "â€”"}</dd>
                <dt className="text-ink/60">Date of Birth</dt><dd>{fmt(data.dateOfBirth)}</dd>
                <dt className="text-ink/60">National ID</dt><dd>{data.nationalId ?? "â€”"}</dd>
                <dt className="text-ink/60">Phone</dt><dd>{data.phone ?? "â€”"}</dd>
                <dt className="text-ink/60">Email</dt><dd>{data.email ?? "â€”"}</dd>
                <dt className="text-ink/60">Address</dt><dd>{data.address ?? "â€”"}</dd>
                <dt className="text-ink/60">Emergency Contact</dt><dd>{data.emergencyContactName ?? "â€”"}</dd>
                <dt className="text-ink/60">Emergency Phone</dt><dd>{data.emergencyContactPhone ?? "â€”"}</dd>
              </dl>
            </div>
            <div className="rounded-lg border border-line bg-white p-5 space-y-3">
              <h2 className="font-semibold">Employment & Payroll</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink/60">Role</dt><dd>{data.employeeRole?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Start Date</dt><dd>{fmt(data.startDate)}</dd>
                <dt className="text-ink/60">Branch</dt><dd>{data.branch?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Farm</dt><dd>{data.farm?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Warehouse</dt><dd>{data.warehouse?.name ?? "â€”"}</dd>
                <dt className="text-ink/60">Basic Salary</dt><dd>{data.basicSalary ? money(data.basicSalary) : "â€”"}</dd>
                <dt className="text-ink/60">Bank Name</dt><dd>{data.bankName ?? "â€”"}</dd>
                <dt className="text-ink/60">Bank Account</dt><dd>{data.bankAccount ?? "â€”"}</dd>
                <dt className="text-ink/60">SSNIT</dt><dd>{data.ssnitNumber ?? "â€”"}</dd>
                <dt className="text-ink/60">TIN</dt><dd>{data.tinNumber ?? "â€”"}</dd>
              </dl>
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <DataTable
            columns={[
              { key: "date", label: "Date", render: (r) => fmt(r.date as string) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              { key: "hoursWorked", label: "Hours Worked", render: (r) => r.hoursWorked ? `${Number(r.hoursWorked).toFixed(1)}h` : "â€”" },
            ]}
            rows={data.attendanceRecords as Record<string, any>[]}
            empty="No attendance records"
          />
        )}

        {tab === "tasks" && (
          <DataTable
            columns={[
              { key: "task", label: "Task", render: (r) => r.task?.title ?? "â€”" },
              { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.task?.priority as string} /> },
              { key: "dueDate", label: "Due", render: (r) => fmt(r.task?.dueDate as string) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={data.taskAssignments as Record<string, any>[]}
            empty="No task assignments"
          />
        )}

        {tab === "payroll" && (
          <DataTable
            columns={[
              { key: "period", label: "Period" },
              { key: "netPay", label: "Net Pay", render: (r) => money(r.netPay) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={data.payrollRecords as Record<string, any>[]}
            empty="No payroll records"
          />
        )}

        {tab === "training" && (
          <DataTable
            columns={[
              { key: "title", label: "Training" },
              { key: "trainingDate", label: "Date", render: (r) => fmt(r.trainingDate as string) },
              { key: "outcome", label: "Outcome", render: (r) => <StatusBadge status={r.outcome as string} /> },
            ]}
            rows={data.trainingRecords as Record<string, any>[]}
            empty="No training records"
          />
        )}

        {tab === "performance" && (
          <DataTable
            columns={[
              { key: "period", label: "Period" },
              { key: "overallRating", label: "Rating", render: (r) => <StatusBadge status={r.overallRating as string} /> },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={data.performanceRecords as Record<string, any>[]}
            empty="No performance records"
          />
        )}
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Attendance Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AttendanceRow = { id: string; date: string; status: string; hoursWorked?: number; employee: { fullName: string; code: string }; shift?: { name: string } };

export function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const opts = useHROptions();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({ employeeId: "", date: new Date().toISOString().slice(0, 10), checkInTime: "", checkOutTime: "", status: "PRESENT", shiftId: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<AttendanceRow[]>>(`/hr/attendance?dateFrom=${dateFilter}&dateTo=${dateFilter}`).then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [dateFilter]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/attendance", {
        method: "POST",
        body: JSON.stringify({ ...form, shiftId: form.shiftId || undefined, checkInTime: form.checkInTime ? `${form.date}T${form.checkInTime}:00` : undefined, checkOutTime: form.checkOutTime ? `${form.date}T${form.checkOutTime}:00` : undefined }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Attendance</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Record Attendance"}</button>
        </div>
        <HRNav />

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Record Attendance</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Date *</label>
                <input required type="date" value={form.date} onChange={f("date")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Status *</label>
                <select required value={form.status} onChange={f("status")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["PRESENT", "ABSENT", "LATE", "HALF_DAY", "ON_LEAVE", "PUBLIC_HOLIDAY"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Shift</label>
                <select value={form.shiftId} onChange={f("shiftId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}â€“{s.endTime})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Check In Time</label>
                <input type="time" value={form.checkInTime} onChange={f("checkInTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Check Out Time</label>
                <input type="time" value={form.checkOutTime} onChange={f("checkOutTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Record"}</button>
              </div>
            </form>
          </div>
        )}

        <div className="flex gap-3">
          <label className="text-sm font-medium">Date:</label>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-md border border-line px-3 py-1.5 text-sm" />
        </div>

        <DataTable
          columns={[
            { key: "employee", label: "Employee", render: (r) => `${r.employee?.fullName} (${r.employee?.code})` },
            { key: "date", label: "Date", render: (r) => fmt(r.date as string) },
            { key: "shift", label: "Shift", render: (r) => r.shift?.name ?? "â€”" },
            { key: "checkIn", label: "Check In", render: (r) => r.checkInTime ? new Date(r.checkInTime as string).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "â€”" },
            { key: "checkOut", label: "Check Out", render: (r) => r.checkOutTime ? new Date(r.checkOutTime as string).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "â€”" },
            { key: "hoursWorked", label: "Hours", render: (r) => r.hoursWorked ? `${Number(r.hoursWorked).toFixed(1)}h` : "â€”" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No attendance records for this date"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Shift Schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Shift = { id: string; code: string; name: string; startTime: string; endTime: string; isActive: boolean; branch?: { name: string } };

export function ShiftSchedulePage() {
  const [rows, setRows] = useState<Shift[]>([]);
  const opts = useHROptions();
  const [form, setForm] = useState({ code: "", name: "", startTime: "08:00", endTime: "17:00", branchId: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<Shift[]>>("/hr/shifts").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/shifts", { method: "POST", body: JSON.stringify({ ...form, branchId: form.branchId || undefined }) });
      setForm({ code: "", name: "", startTime: "08:00", endTime: "17:00", branchId: "", notes: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Shift Schedule</h1>
        <HRNav />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Add Shift</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div>}
            <form onSubmit={submit} className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium">Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="mb-1 block text-xs font-medium">Start</label><input required type="time" value={form.startTime} onChange={f("startTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium">End</label><input required type="time" value={form.endTime} onChange={f("endTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” All Branches â€”</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Add Shift"}</button>
            </form>
          </div>
          <div className="lg:col-span-2">
            <DataTable
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Shift Name" },
                { key: "startTime", label: "Start" },
                { key: "endTime", label: "End" },
                { key: "branch", label: "Branch", render: (r) => r.branch?.name ?? "All" },
                { key: "isActive", label: "Active", render: (r) => r.isActive ? "Yes" : "No" },
              ]}
              rows={rows as Record<string, any>[]}
              empty="No shifts defined"
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Task Board â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Task = { id: string; title: string; priority: string; status: string; dueDate?: string; taskType?: string; branch?: { name: string }; assignments: Array<{ employee: { fullName: string } }> };

export function TaskBoardPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    apiFetch<ApiEnvelope<Task[]>>(`/hr/tasks?${params}`).then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, [status, priority]);

  const columns = ["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
  const byStatus = (s: string) => rows.filter((r) => r.status === s);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Task Board</h1>
          <Link href="/hr/tasks/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Task</Link>
        </div>
        <HRNav />
        <div className="flex gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Priorities</option>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {columns.map((col) => (
            <div key={col} className="rounded-lg border border-line bg-field p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide">{col.replace(/_/g, " ")}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium">{byStatus(col).length}</span>
              </div>
              <div className="space-y-2">
                {byStatus(col).map((task) => (
                  <Link key={task.id} href={`/hr/tasks/${task.id}`} className="block rounded-md bg-white p-3 shadow-sm hover:shadow-md">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.taskType && <p className="text-xs text-ink/50 mt-0.5">{task.taskType}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge status={task.priority} />
                      {task.dueDate && <span className="text-xs text-ink/50">Due {fmt(task.dueDate)}</span>}
                    </div>
                    {task.assignments?.length > 0 && (
                      <p className="mt-1 text-xs text-ink/60">{task.assignments.map((a) => a.employee?.fullName).join(", ")}</p>
                    )}
                  </Link>
                ))}
                {byStatus(col).length === 0 && <p className="text-xs text-ink/40 text-center py-4">Empty</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Create Task â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function CreateTaskPage() {
  const router = useRouter();
  const opts = useHROptions();
  const [form, setForm] = useState({ title: "", description: "", taskType: "", priority: "MEDIUM", dueDate: "", branchId: "", farmId: "", productionSiteId: "", notes: "" });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function toggleAssignee(id: string) {
    setAssigneeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/tasks", {
        method: "POST",
        body: JSON.stringify({ ...form, dueDate: form.dueDate || undefined, branchId: form.branchId || undefined, farmId: form.farmId || undefined, productionSiteId: form.productionSiteId || undefined, assigneeIds: assigneeIds.length ? assigneeIds : undefined }),
      });
      router.push("/hr/tasks");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/tasks" className="text-sm text-ink/60 hover:text-ink">â† Tasks</Link>
          <h1 className="text-xl font-bold">New Task</h1>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5 space-y-4">
            <div><label className="mb-1 block text-xs font-medium">Title *</label><input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-medium">Description</label><textarea value={form.description} onChange={f("description")} rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Task Type</label><input value={form.taskType} onChange={f("taskType")} placeholder="e.g. Feeding, Cleaning..." className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Priority</label>
                <select value={form.priority} onChange={f("priority")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Due Date</label><input type="date" value={form.dueDate} onChange={f("dueDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” None â€”</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-3">
            <h2 className="font-semibold">Assign Employees</h2>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {opts.employees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-field cursor-pointer">
                  <input type="checkbox" checked={assigneeIds.includes(emp.id)} onChange={() => toggleAssignee(emp.id)} />
                  <span className="text-sm">{emp.fullName} <span className="text-ink/50">({emp.code})</span></span>
                </label>
              ))}
              {opts.employees.length === 0 && <p className="text-sm text-ink/50">No active employees found</p>}
            </div>
          </div>

          <button type="submit" disabled={saving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating..." : "Create Task"}</button>
        </form>
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Payroll Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PayrollRow = { id: string; reference: string; period: string; grossPay: number; netPay: number; status: string; employee?: { fullName: string; code: string }; paymentDate?: string };

export function PayrollPage() {
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const opts = useHROptions();
  const [form, setForm] = useState({ employeeId: "", period: "", periodStart: "", periodEnd: "", basicSalary: "", allowances: "0", deductions: "0", taxDeduction: "0", ssnit: "0", paymentMethod: "BANK_TRANSFER", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<PayrollRow[]>>("/hr/payroll").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const gross = (Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0);
  const net = gross - (Number(form.taxDeduction) || 0) - (Number(form.ssnit) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/payroll", {
        method: "POST",
        body: JSON.stringify({ ...form, basicSalary: Number(form.basicSalary), allowances: Number(form.allowances), deductions: Number(form.deductions), taxDeduction: Number(form.taxDeduction), ssnit: Number(form.ssnit) }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function approve(id: string) {
    await apiFetch(`/hr/payroll/${id}/approve`, { method: "PATCH" }).then(() => load()).catch(() => undefined);
  }

  async function markPaid(id: string) {
    await apiFetch(`/hr/payroll/${id}/mark-paid`, { method: "PATCH" }).then(() => load()).catch(() => undefined);
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Payroll Records</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Payroll"}</button>
        </div>
        <HRNav />

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Payroll Record</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Period (e.g. 2025-01) *</label><input required value={form.period} onChange={f("period")} placeholder="2025-01" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Period Start *</label><input required type="date" value={form.periodStart} onChange={f("periodStart")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Period End *</label><input required type="date" value={form.periodEnd} onChange={f("periodEnd")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Basic Salary *</label><input required type="number" min={0} step={0.01} value={form.basicSalary} onChange={f("basicSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Allowances</label><input type="number" min={0} step={0.01} value={form.allowances} onChange={f("allowances")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Deductions</label><input type="number" min={0} step={0.01} value={form.deductions} onChange={f("deductions")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Tax Deduction</label><input type="number" min={0} step={0.01} value={form.taxDeduction} onChange={f("taxDeduction")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">SSNIT</label><input type="number" min={0} step={0.01} value={form.ssnit} onChange={f("ssnit")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Payment Method</label>
                <select value={form.paymentMethod} onChange={f("paymentMethod")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 rounded-md bg-field p-3 text-sm">
                Gross Pay: <strong>{money(gross)}</strong> Â· Net Pay: <strong>{money(net)}</strong>
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Record"}</button>
              </div>
            </form>
          </div>
        )}

        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "â€”" },
            { key: "period", label: "Period" },
            { key: "grossPay", label: "Gross", render: (r) => money(r.grossPay) },
            { key: "netPay", label: "Net Pay", render: (r) => money(r.netPay) },
            { key: "paymentDate", label: "Paid On", render: (r) => fmt(r.paymentDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            {
              key: "actions", label: "Actions", render: (r) => (
                <div className="flex gap-1">
                  {r.status === "DRAFT" && <button onClick={() => approve(r.id as string)} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200">Approve</button>}
                  {r.status === "APPROVED" && <button onClick={() => markPaid(r.id as string)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Mark Paid</button>}
                </div>
              ),
            },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No payroll records"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Training Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TrainingRow = { id: string; title: string; trainer?: string; trainingDate: string; durationHours?: number; outcome: string; employee: { fullName: string; code: string } };

export function TrainingPage() {
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const opts = useHROptions();
  const [form, setForm] = useState({ employeeId: "", title: "", description: "", trainer: "", trainingDate: "", durationHours: "", outcome: "ONGOING", certificate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<TrainingRow[]>>("/hr/training").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/training", { method: "POST", body: JSON.stringify({ ...form, durationHours: form.durationHours ? Number(form.durationHours) : undefined }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Training Records</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Training"}</button>
        </div>
        <HRNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Training Record</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Training Title *</label><input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Trainer</label><input value={form.trainer} onChange={f("trainer")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Training Date *</label><input required type="date" value={form.trainingDate} onChange={f("trainingDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Duration (hours)</label><input type="number" min={0} step={0.5} value={form.durationHours} onChange={f("durationHours")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Outcome</label>
                <select value={form.outcome} onChange={f("outcome")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["PASSED", "FAILED", "ONGOING", "CANCELLED"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Certificate</label><input value={form.certificate} onChange={f("certificate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Record"}</button>
              </div>
            </form>
          </div>
        )}
        <DataTable
          columns={[
            { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "â€”" },
            { key: "title", label: "Training" },
            { key: "trainer", label: "Trainer" },
            { key: "trainingDate", label: "Date", render: (r) => fmt(r.trainingDate as string) },
            { key: "durationHours", label: "Hours", render: (r) => r.durationHours ? `${r.durationHours}h` : "â€”" },
            { key: "outcome", label: "Outcome", render: (r) => <StatusBadge status={r.outcome as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No training records"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Performance Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PerfRow = { id: string; period: string; overallRating: string; attendanceScore: number; taskCompletionScore: number; qualityScore: number; teamworkScore: number; status: string; employee: { fullName: string; code: string }; reviewer?: { fullName: string } };

export function PerformancePage() {
  const [rows, setRows] = useState<PerfRow[]>([]);
  const opts = useHROptions();
  const [form, setForm] = useState({ employeeId: "", period: "", overallRating: "MEETS_EXPECTATIONS", attendanceScore: "0", taskCompletionScore: "0", qualityScore: "0", teamworkScore: "0", comments: "", goals: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<PerfRow[]>>("/hr/performance").then((r) => setRows(r.data)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/performance", {
        method: "POST",
        body: JSON.stringify({ ...form, attendanceScore: Number(form.attendanceScore), taskCompletionScore: Number(form.taskCompletionScore), qualityScore: Number(form.qualityScore), teamworkScore: Number(form.teamworkScore) }),
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Employee Performance</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Review"}</button>
        </div>
        <HRNav />
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Performance Review</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">â€” Select â€”</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Period (e.g. 2025-Q1) *</label><input required value={form.period} onChange={f("period")} placeholder="2025-Q1" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">Overall Rating</label>
                <select value={form.overallRating} onChange={f("overallRating")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["OUTSTANDING", "EXCEEDS_EXPECTATIONS", "MEETS_EXPECTATIONS", "NEEDS_IMPROVEMENT", "UNSATISFACTORY"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Attendance Score (0-100)</label><input type="number" min={0} max={100} value={form.attendanceScore} onChange={f("attendanceScore")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Task Completion (0-100)</label><input type="number" min={0} max={100} value={form.taskCompletionScore} onChange={f("taskCompletionScore")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Quality Score (0-100)</label><input type="number" min={0} max={100} value={form.qualityScore} onChange={f("qualityScore")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Teamwork (0-100)</label><input type="number" min={0} max={100} value={form.teamworkScore} onChange={f("teamworkScore")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Comments</label><textarea value={form.comments} onChange={f("comments")} rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Goals for Next Period</label><textarea value={form.goals} onChange={f("goals")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Review"}</button>
              </div>
            </form>
          </div>
        )}
        <DataTable
          columns={[
            { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "â€”" },
            { key: "period", label: "Period" },
            { key: "overallRating", label: "Rating", render: (r) => <StatusBadge status={r.overallRating as string} /> },
            { key: "attendanceScore", label: "Attend.", render: (r) => `${r.attendanceScore}%` },
            { key: "taskCompletionScore", label: "Tasks", render: (r) => `${r.taskCompletionScore}%` },
            { key: "qualityScore", label: "Quality", render: (r) => `${r.qualityScore}%` },
            { key: "reviewer", label: "Reviewer", render: (r) => r.reviewer?.fullName ?? "â€”" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          empty="No performance records"
        />
      </div>
    </AppShell>
  );
}

// â”€â”€â”€ Productivity Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ProductivityData = {
  period: { from: string; to: string };
  employees: Array<{
    employee: { id: string; code: string; fullName: string; employeeRole?: { name: string }; branch?: { name: string } };
    attendance: { present: number; absent: number; late: number; total: number; rate: string };
    tasks: { completed: number; total: number; rate: string };
  }>;
};

export function ProductivityReportPage() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    apiFetch<ApiEnvelope<ProductivityData>>(`/hr/reports/productivity?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => setData(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Worker Productivity Report</h1>
        <HRNav />

        <div className="flex items-end gap-3">
          <div><label className="mb-1 block text-xs font-medium">From</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-medium">To</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm" /></div>
          <button onClick={load} disabled={loading} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading..." : "Generate"}</button>
        </div>

        {data && (
          <>
            <p className="text-sm text-ink/60">Period: {fmt(data.period.from)} â€” {fmt(data.period.to)} Â· {data.employees.length} employees</p>
            <DataTable
              columns={[
                { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "â€”" },
                { key: "code", label: "Code", render: (r) => r.employee?.code ?? "â€”" },
                { key: "role", label: "Role", render: (r) => r.employee?.employeeRole?.name ?? "â€”" },
                { key: "branch", label: "Branch", render: (r) => r.employee?.branch?.name ?? "â€”" },
                { key: "present", label: "Present", render: (r) => r.attendance?.present ?? 0 },
                { key: "absent", label: "Absent", render: (r) => r.attendance?.absent ?? 0 },
                { key: "late", label: "Late", render: (r) => r.attendance?.late ?? 0 },
                { key: "attendRate", label: "Attend. %", render: (r) => `${r.attendance?.rate ?? 0}%` },
                { key: "tasksDone", label: "Tasks Done", render: (r) => `${r.tasks?.completed ?? 0}/${r.tasks?.total ?? 0}` },
                { key: "taskRate", label: "Task %", render: (r) => `${r.tasks?.rate ?? 0}%` },
              ]}
              rows={data.employees as Record<string, any>[]}
              empty="No productivity data"
            />
          </>
        )}
      </div>
    </AppShell>
  );
}


