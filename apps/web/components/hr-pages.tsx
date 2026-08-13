"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Camera, CircleAlert, ClipboardList, DollarSign, FileText, Pencil, Trash2, Upload, UserCheck, UserPlus, Users } from "lucide-react";
import { ApiEnvelope, apiFetch, getCached, getCachedFirst, hasCached } from "../lib/api";
import { DataTable } from "./data-table";
import { StatusBadge, EmptyState, ConfirmModal } from "./ui";

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Normalise any legacy photoUrl format to the current /api/v1/uploads/employees/ path.
// Handles: bare filename, /uploads/employees/file, /api/v1/uploads/employees/file.
function normalizePhotoUrl(url: string | undefined | null, type: "employees" | "products" = "employees"): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/v1/uploads/")) return url;
  if (url.startsWith("/uploads/")) return `/api/v1${url}`;
  // bare filename (no path separator)
  if (!url.includes("/")) return `/api/v1/uploads/${type}/${url}`;
  return url;
}

// Resize + convert any image (including HEIC/AVIF) to a JPEG blob before upload.
// Browsers can render HEIC/AVIF in an <img> element, so drawing to canvas and
// exporting as JPEG works even for formats the server's magic-bytes validator
// doesn't accept. Also caps file size to a manageable ~200-400 KB for most photos.
async function compressImage(file: File, maxDim = 1024, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Renders an employee avatar with automatic initials fallback when the photo
// URL returns an error (404, network failure, etc.). Resets to photo when url changes.
function EmployeeAvatar({ url, name, size, text = "text-sm", ring = "" }: {
  url?: string | null;
  name: string;
  size: string;
  text?: string;
  ring?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = normalizePhotoUrl(url);
  useEffect(() => { setBroken(false); }, [url]);
  if (src && !broken) {
    return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover ${ring}`.trim()} onError={() => setBroken(true)} />;
  }
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-brand/10 ${text} font-bold text-brand`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
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

// â"€â"€â"€ Nav â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const hrNav = [
  { href: "/hr", label: "Dashboard" },
  { href: "/hr/employees", label: "Employees" },
  { href: "/hr/employee-roles", label: "Roles" },
  { href: "/hr/attendance", label: "Attendance" },
  { href: "/hr/shifts", label: "Shifts" },
  { href: "/hr/tasks", label: "Task Board" },
  { href: "/hr/leave-requests", label: "Leave Requests" },
  { href: "/hr/leave-policies", label: "Leave Policies" },
  { href: "/hr/leave-balance", label: "Leave Balance" },
  { href: "/hr/public-holidays", label: "Public Holidays" },
  { href: "/hr/payroll", label: "Payroll" },
  { href: "/hr/training", label: "Training" },
  { href: "/hr/performance", label: "Performance" },
  { href: "/hr/disciplinary", label: "Disciplinary" },
  { href: "/hr/grievances", label: "Grievances" },
  { href: "/hr/org-chart", label: "Org Chart" },
  { href: "/hr/training-courses", label: "Training Catalog" },
  { href: "/hr/salary-bands", label: "Salary Bands" },
  { href: "/hr/recruitment", label: "Recruitment" },
  { href: "/hr/onboarding", label: "Onboarding" },
  { href: "/hr/approval-workflows", label: "Approval Workflows" },
  { href: "/hr/compliance", label: "Compliance" },
  { href: "/hr/reports/productivity", label: "Productivity Report" },
];

function HRNav() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>("[data-active]");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 rounded-xl border border-line bg-field/60 p-1">
      {hrNav.map((n) => {
        const active = n.href === "/hr" ? pathname === "/hr" : pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            {...(active ? { "data-active": "" } : {})}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
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

// â"€â"€â"€ Options hook â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
  const [opts, setOpts] = useState<HROptions>(() => getCached<ApiEnvelope<HROptions>>("/hr/options")?.data ?? { branches: [], farms: [], warehouses: [], productionSites: [], employeeRoles: [], shifts: [], employees: [], bankAccounts: [] });
  const [optionsError, setOptionsError] = useState("");
  const [_hrOptKey, _setHrOptKey] = useState(0);
  const forceAccept = useRef(false);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<HROptions>>("/hr/options")
      .then((r) => {
        const fresh = r.data ?? { branches: [], farms: [], warehouses: [], productionSites: [], employeeRoles: [], shifts: [], employees: [], bankAccounts: [] };
        setOpts((prev) => !force && fresh.employees.length === 0 && prev.employees.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load options."));
  }, [_hrOptKey]);
  useEffect(() => {
    function onRecovered() { _setHrOptKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);
  return { opts, optionsError };
}

// â"€â"€â"€ Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type DashData = {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
  openTasks: number;
  urgentTasks: number;
  pendingPayroll: number;
  openLeaveRequests: number;
  recentEmployees: Array<{ id: string; code: string; fullName: string; status: string; photoUrl?: string; employeeRole?: { name: string }; branch?: { name: string } }>;
  recentTasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string }>;
};

export function HRDashboardPage() {
  const [data, setData] = useState<DashData | null>(() => getCachedFirst<ApiEnvelope<DashData>>("/hr/dashboard")?.data ?? null);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setLoadError("");
    apiFetch<ApiEnvelope<DashData>>("/hr/dashboard")
      .then((r) => setData(r.data))
      .catch((err: any) => {
        setLoadError(err?.message || "Failed to load HR dashboard data. Please retry.");
        setData({ totalEmployees: 0, activeEmployees: 0, onLeave: 0, presentToday: 0, absentToday: 0, attendanceRate: 0, openLeaveRequests: 0, openTasks: 0, urgentTasks: 0, pendingPayroll: 0, recentEmployees: [], recentTasks: [] });
      });
  }, [refresh]);

  const kpis = [
    { label: "Total Employees", value: data?.totalEmployees, icon: Users, color: "text-sky-400" },
    { label: "Active", value: data?.activeEmployees, icon: UserCheck, color: "text-emerald-400" },
    { label: "On Leave", value: data?.onLeave, icon: CalendarDays, color: "text-yellow-400" },
    { label: "Present Today", value: data?.presentToday, icon: ClipboardList, color: "text-blue-400" },
    { label: "Open Tasks", value: data?.openTasks, icon: AlertTriangle, color: "text-purple-400" },
    { label: "Urgent Tasks", value: data?.urgentTasks, icon: CircleAlert, color: "text-red-400" },
    { label: "Leave Requests", value: data?.openLeaveRequests, icon: FileText, color: "text-teal-400" },
    { label: "Pending Payroll", value: data?.pendingPayroll, icon: DollarSign, color: "text-orange-400" },
  ];

  return (
    
      <div className="space-y-6">
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={() => setRefresh((r) => r + 1)}>Retry</button>
          </div>
        )}
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl bg-sidebar shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Human Resources</p>
              <h1 className="mt-1 text-2xl font-bold text-white">HR & Workforce</h1>
              <p className="mt-1 text-sm text-white/55">Employees, attendance, payroll & task management</p>
            </div>
            <Link
              href="/hr/employees/create"
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-brandDark"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              New Employee
            </Link>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4 lg:grid-cols-8">
            {kpis.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex flex-col items-center bg-sidebar px-3 py-4 text-center">
                <Icon className={`mb-1.5 h-5 w-5 ${color}`} aria-hidden />
                {data
                  ? <p className="text-2xl font-bold text-white">{value ?? 0}</p>
                  : <div className="h-7 w-10 animate-pulse rounded-md bg-white/10" />
                }
                <p className="mt-0.5 text-[10px] leading-tight text-white/40">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab nav ──────────────────────────────────────────────────────── */}
        <HRNav />

        {/* ── Recent data ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Recent Employees */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Recent Employees</h2>
                <p className="text-xs text-slate-400">Latest additions to the workforce</p>
              </div>
              <Link href="/hr/employees" className="text-xs font-semibold text-brand hover:underline">View all →</Link>
            </div>
            <ul className="divide-y divide-slate-50">
              {!data && [1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                  </div>
                </li>
              ))}
              {data?.recentEmployees.map((emp) => (
                <li key={emp.id} className="flex items-center gap-3 px-5 py-3.5">
                  <EmployeeAvatar url={emp.photoUrl} name={emp.fullName} size="h-9 w-9" text="text-sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/hr/employees/${emp.id}`} className="text-sm font-medium text-slate-800 hover:text-brand hover:underline">
                      {emp.fullName}
                    </Link>
                    <p className="text-xs text-slate-400">{emp.code} · {emp.employeeRole?.name ?? "No role"} · {emp.branch?.name ?? ""}</p>
                  </div>
                  <StatusBadge status={emp.status} />
                </li>
              ))}
              {data?.recentEmployees.length === 0 && (
                <li className="flex h-20 items-center justify-center text-sm text-slate-400">No employees yet</li>
              )}
            </ul>
          </div>

          {/* Recent Tasks */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Recent Tasks</h2>
                <p className="text-xs text-slate-400">Active operational tasks</p>
              </div>
              <Link href="/hr/tasks" className="text-xs font-semibold text-brand hover:underline">Task board →</Link>
            </div>
            <ul className="divide-y divide-slate-50">
              {!data && [1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-48 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                  </div>
                </li>
              ))}
              {data?.recentTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-400">{task.dueDate ? `Due ${fmt(task.dueDate)}` : "No due date"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </li>
              ))}
              {data?.recentTasks.length === 0 && (
                <li className="flex h-20 items-center justify-center text-sm text-slate-400">No tasks yet</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    
  );
}

// â"€â"€â"€ Employee List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Employee = { id: string; code: string; fullName: string; phone?: string; email?: string; status: string; startDate: string; photoUrl?: string; employeeRole?: { name: string }; branch?: { name: string }; farm?: { name: string } };

export function EmployeeListPage() {
  const router = useRouter();
  const pathname = usePathname();
  // Seed from cache so navigation back shows data instantly (stale-while-revalidate).
  const _cached = getCachedFirst<ApiEnvelope<Employee[]>>("/hr/employees");
  const [rows, setRows] = useState<Employee[]>(_cached?.data ?? []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(!(_cached?.data?.length));
  const [deleteError, setDeleteError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoadError("");
    // Only show the skeleton when there is no data to display yet; otherwise the
    // background refresh is silent so cached employees stay visible while re-fetching.
    if (!rows.length) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    apiFetch<ApiEnvelope<Employee[]>>(`/hr/employees?${params}`).then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load employees. Please retry.")).finally(() => setLoading(false));
  }

  // pathname in deps: re-fires load() on every client-side navigation to this page
  // even if Next.js keeps the component instance alive across soft navigations.
  useEffect(() => { load(); }, [search, status, pathname]);

  async function deleteEmployee() {
    if (!confirmTarget) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await apiFetch(`/hr/employees/${confirmTarget.id}`, { method: "DELETE" });
      load();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete employee.");
    } finally {
      setDeleting(false);
      setConfirmTarget(null);
    }
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Employees</h1>
          <Link href="/hr/employees/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Employee</Link>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {deleteError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{deleteError}</div>}
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
            { key: "fullName", label: "Name", render: (r) => (
              <Link href={`/hr/employees/${r.id}`} className="flex items-center gap-2 hover:text-brand">
                <EmployeeAvatar url={r.photoUrl as string} name={r.fullName as string} size="h-7 w-7" text="text-xs" />
                <span className="font-medium text-brand">{r.fullName as string}</span>
              </Link>
            ) },
            { key: "employeeRole", label: "Role", render: (r) => r.employeeRole?.name ?? "—" },
            { key: "branch", label: "Branch/Site", render: (r) => r.branch?.name ?? r.farm?.name ?? "—" },
            { key: "phone", label: "Phone" },
            { key: "startDate", label: "Start Date", render: (r) => fmt(r.startDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "_actions", label: "", render: (r) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Edit employee"
                  onClick={() => router.push(`/hr/employees/${r.id}?tab=edit`)}
                  className="rounded p-1 text-ink/40 hover:bg-brand/10 hover:text-brand"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete employee"
                  onClick={() => setConfirmTarget(r as Employee)}
                  className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )},
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No employees found"
        />
        <ConfirmModal
          open={!!confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onConfirm={deleteEmployee}
          title="Delete Employee"
          message={`Delete employee "${confirmTarget?.fullName}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
        />
      </div>

  );
}

// â"€â"€â"€ Create Employee â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function CreateEmployeePage() {
  const router = useRouter();
  const { opts, optionsError } = useHROptions();
  const [form, setForm] = useState({ code: "", firstName: "", lastName: "", phone: "", email: "", address: "", nationalId: "", startDate: "", gender: "", dateOfBirth: "", employeeRoleId: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "", basicSalary: "", bankName: "", bankAccount: "", ssnitNumber: "", tinNumber: "", emergencyContactName: "", emergencyContactPhone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [passportPreview, setPassportPreview] = useState<string | null>(null);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<{ id: string }>>("/hr/employees", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          basicSalary: form.basicSalary ? Number(form.basicSalary) : undefined,
          email: form.email || undefined,
          gender: form.gender || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          employeeRoleId: form.employeeRoleId || undefined,
          branchId: form.branchId || undefined,
          farmId: form.farmId || undefined,
          warehouseId: form.warehouseId || undefined,
          productionSiteId: form.productionSiteId || undefined,
        }),
      });
      if (passportFile && res.data?.id) {
        const compressed = await compressImage(passportFile);
        const fd = new FormData();
        fd.append("photo", compressed, "photo.jpg");
        try {
          // H-WEB-1/WEB-2: this used to be a raw fetch with `.catch(() =>
          // undefined)` — a failed upload (including a cold-start timeout,
          // the one time it's most likely to happen) was silently discarded
          // and the page still navigated away as if the photo had saved.
          // apiFetch now supports FormData bodies (see api.ts) so this gets
          // the same cold-start retry every other request already has, and a
          // genuine failure here surfaces instead of vanishing.
          await apiFetch(`/hr/employees/${res.data.id}/photo`, { method: "POST", body: fd });
        } catch (photoErr: unknown) {
          setError(
            `Employee created, but the photo failed to upload: ${photoErr instanceof Error ? photoErr.message : "unknown error"}. ` +
            `You can add it later from the employee's profile.`
          );
          return;
        }
      }
      router.push("/hr/employees");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setSaving(false);
    }
  }

  return (
    
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/employees" className="text-sm text-ink/60 hover:text-ink">â† Employees</Link>
          <h1 className="text-xl font-bold">New Employee</h1>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <p className="text-xs text-ink/50">Fields marked <span className="text-red-500">*</span> are required.</p>

        <form onSubmit={submit} className="space-y-5">

          {/* Personal Information */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/8 text-brand">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-ink">Personal Information</p>
                <p className="text-xs text-ink/50">Basic identity and contact details</p>
              </div>
            </div>

            {/* Photo */}
            <div className="mb-6 flex items-center gap-5 rounded-lg border border-line bg-field/50 p-4">
              <div className="shrink-0">
                {passportPreview ? (
                  <img src={passportPreview} alt="Passport" className="h-20 w-20 rounded-full object-cover ring-2 ring-brand/25 ring-offset-2" />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-line bg-white text-ink/20">
                    <Camera className="h-7 w-7" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Passport / Profile Photo</p>
                <p className="mt-0.5 text-xs text-ink/50">Optional — can be changed later from the employee profile.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand">
                    <Camera className="h-3.5 w-3.5" />Take Photo
                    <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setPassportFile(file); const rd = new FileReader(); rd.onload = () => setPassportPreview(rd.result as string); rd.readAsDataURL(file); }} />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand">
                    <Upload className="h-3.5 w-3.5" />Upload from Device
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setPassportFile(file); const rd = new FileReader(); rd.onload = () => setPassportPreview(rd.result as string); rd.readAsDataURL(file); }} />
                  </label>
                  {passportFile && <button type="button" onClick={() => { setPassportFile(null); setPassportPreview(null); }} className="text-xs text-red-500 hover:underline">Remove</button>}
                </div>
                {passportFile && <p className="mt-1.5 text-[11px] text-brand/70">{passportFile.name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Employee Code <span className="text-red-500">*</span></label><input required value={form.code} onChange={f("code")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Role</label>
                <select value={form.employeeRoleId} onChange={f("employeeRoleId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">— None —</option>
                  {opts.employeeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">National ID</label><input value={form.nationalId} onChange={f("nationalId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" /></div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">First Name <span className="text-red-500">*</span></label><input required value={form.firstName} onChange={f("firstName")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Last Name <span className="text-red-500">*</span></label><input required value={form.lastName} onChange={f("lastName")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" /></div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Gender</label>
                <select value={form.gender} onChange={f("gender")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">—</option>
                  {["MALE", "FEMALE", "OTHER"].map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Phone</label><input value={form.phone} onChange={f("phone")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Email</label><input type="email" value={form.email} onChange={f("email")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Address</label><textarea value={form.address} onChange={f("address")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm resize-none focus:border-brand focus:outline-none" /></div>
            </div>
          </div>

          {/* Assignment */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/8 text-brand"><UserCheck className="h-4 w-4" /></div>
              <div><p className="font-semibold text-ink">Assignment</p><p className="text-xs text-ink/50">Where this employee is based</p></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Start Date <span className="text-red-500">*</span></label><input required type="date" value={form.startDate} onChange={f("startDate")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">— None —</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Farm</label>
                <select value={form.farmId} onChange={f("farmId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">— None —</option>
                  {opts.farms.map((f_) => <option key={f_.id} value={f_.id}>{f_.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Warehouse</label>
                <select value={form.warehouseId} onChange={f("warehouseId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">— None —</option>
                  {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Production Site</label>
                <select value={form.productionSiteId} onChange={f("productionSiteId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">— None —</option>
                  {opts.productionSites.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Payroll & Banking */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/8 text-brand"><DollarSign className="h-4 w-4" /></div>
              <div><p className="font-semibold text-ink">Payroll & Banking</p><p className="text-xs text-ink/50">Salary and bank account for payroll processing</p></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Basic Salary (GHS)</label><input type="number" min={0} step={0.01} value={form.basicSalary} onChange={f("basicSalary")} placeholder="0.00" className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Bank Name</label><input value={form.bankName} onChange={f("bankName")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Bank Account Number</label><input value={form.bankAccount} onChange={f("bankAccount")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">SSNIT Number</label><input value={form.ssnitNumber} onChange={f("ssnitNumber")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">TIN Number</label><input value={form.tinNumber} onChange={f("tinNumber")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
            </div>
          </div>

          {/* Emergency & Notes */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="h-4 w-4" /></div>
              <div><p className="font-semibold text-ink">Emergency Contact & Notes</p></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Emergency Contact Name</label><input value={form.emergencyContactName} onChange={f("emergencyContactName")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div><label className="mb-1.5 block text-xs font-semibold text-ink/70">Emergency Contact Phone</label><input value={form.emergencyContactPhone} onChange={f("emergencyContactPhone")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" /></div>
              <div className="col-span-2"><label className="mb-1.5 block text-xs font-semibold text-ink/70">Notes</label><textarea value={form.notes} onChange={f("notes")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm resize-none focus:border-brand focus:outline-none" /></div>
            </div>
          </div>

          <div className="flex gap-3 pb-6">
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-brand px-8 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50">
              {saving ? "Creating..." : "Create Employee"}
            </button>
            <Link href="/hr/employees" className="inline-flex min-h-11 items-center rounded-lg border border-line px-6 text-sm font-medium text-ink/60 hover:border-ink/30 hover:text-ink">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    
  );
}

// â"€â"€â"€ Employee Detail â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type EmployeeDetail = Employee & {
  email?: string; address?: string; nationalId?: string; gender?: string; dateOfBirth?: string; basicSalary?: number;
  bankName?: string; bankAccount?: string; ssnitNumber?: string; tinNumber?: string;
  emergencyContactName?: string; emergencyContactPhone?: string; notes?: string; photoUrl?: string;
  warehouse?: { name: string }; productionSite?: { name: string };
  attendanceRecords: Array<{ id: string; date: string; status: string; hoursWorked?: number }>;
  taskAssignments: Array<{ id: string; status: string; task: { title: string; priority: string; dueDate?: string } }>;
  payrollRecords: Array<{ id: string; period: string; netPay: number; status: string }>;
  trainingRecords: Array<{ id: string; title: string; trainingDate: string; outcome: string }>;
  performanceRecords: Array<{ id: string; period: string; overallRating: string; status: string }>;
};

export function EmployeeDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<EmployeeDetail | null>(() => getCachedFirst<ApiEnvelope<EmployeeDetail>>(`/hr/employees/${id}`)?.data ?? null);
  const [loadError, setLoadError] = useState("");
  const { opts, optionsError } = useHROptions();
  // Read ?tab= from URL so external links (e.g. edit button in employee list) can deep-link
  const [tab, setTab] = useState(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && ["overview", "edit", "attendance", "tasks", "payroll", "training", "performance"].includes(t)) return t;
    }
    return "overview";
  });

  // edit state
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", phone: "", email: "", address: "", gender: "", dateOfBirth: "", employeeRoleId: "", branchId: "", farmId: "", warehouseId: "", productionSiteId: "", basicSalary: "", bankName: "", bankAccount: "", ssnitNumber: "", tinNumber: "", emergencyContactName: "", emergencyContactPhone: "", status: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<EmployeeDetail>>(`/hr/employees/${id}`).then((r) => {
      if (!r.data) return;
      setData(r.data);
      const d = r.data;
      setEditForm({
        firstName: (d as any).firstName ?? d.fullName.split(" ")[0] ?? "",
        lastName: (d as any).lastName ?? d.fullName.split(" ").slice(1).join(" ") ?? "",
        phone: d.phone ?? "",
        email: d.email ?? "",
        address: d.address ?? "",
        gender: d.gender ?? "",
        dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : "",
        employeeRoleId: (d as any).employeeRoleId ?? "",
        branchId: (d as any).branchId ?? "",
        farmId: (d as any).farmId ?? "",
        warehouseId: (d as any).warehouseId ?? "",
        productionSiteId: (d as any).productionSiteId ?? "",
        basicSalary: d.basicSalary?.toString() ?? "",
        bankName: d.bankName ?? "",
        bankAccount: d.bankAccount ?? "",
        ssnitNumber: d.ssnitNumber ?? "",
        tinNumber: d.tinNumber ?? "",
        emergencyContactName: d.emergencyContactName ?? "",
        emergencyContactPhone: d.emergencyContactPhone ?? "",
        status: d.status ?? "",
        notes: d.notes ?? "",
      });
    }).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Failed to load employee."));
  }

  useEffect(() => { load(); }, [id]);

  if (loadError) return (
    
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button type="button" onClick={load} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90">Retry</button>
        <Link href="/hr/employees" className="text-sm text-ink/50 hover:text-ink">← Back to Employees</Link>
      </div>
    
  );

  if (!data) return <div className="flex items-center justify-center p-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>;

  const ef = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEditForm((p) => ({ ...p, [k]: e.target.value }));

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    setEditSuccess(false);
    try {
      await apiFetch(`/hr/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName: editForm.firstName || undefined,
          lastName: editForm.lastName || undefined,
          phone: editForm.phone || undefined,
          email: editForm.email || undefined,
          address: editForm.address || undefined,
          gender: editForm.gender || undefined,
          dateOfBirth: editForm.dateOfBirth || undefined,
          employeeRoleId: editForm.employeeRoleId || undefined,
          branchId: editForm.branchId || undefined,
          farmId: editForm.farmId || undefined,
          warehouseId: editForm.warehouseId || undefined,
          productionSiteId: editForm.productionSiteId || undefined,
          basicSalary: editForm.basicSalary ? Number(editForm.basicSalary) : undefined,
          bankName: editForm.bankName || undefined,
          bankAccount: editForm.bankAccount || undefined,
          ssnitNumber: editForm.ssnitNumber || undefined,
          tinNumber: editForm.tinNumber || undefined,
          emergencyContactName: editForm.emergencyContactName || undefined,
          emergencyContactPhone: editForm.emergencyContactPhone || undefined,
          status: editForm.status || undefined,
          notes: editForm.notes || undefined,
        }),
      });
      setEditSuccess(true);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoError("");
    try {
      const compressed = await compressImage(file);
      const body = new FormData();
      body.append("photo", compressed, "photo.jpg");
      // H-WEB-2: was a raw fetch with no cold-start retry — every other
      // request on this page rides out a Hostinger cold start transparently
      // via apiFetch; this one used to fail immediately instead.
      await apiFetch(`/hr/employees/${id}/photo`, { method: "POST", body });
      load();
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoUploading(false);
    }
  }

  const tabs = ["overview", "edit", "attendance", "tasks", "payroll", "training", "performance"];

  return (
    
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/employees" className="text-sm text-ink/60 hover:text-ink">â† Employees</Link>
          <h1 className="text-xl font-bold">{data.fullName}</h1>
          <StatusBadge status={data.status} />
        </div>

        {/* Profile strip */}
        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
          <div className="relative shrink-0">
            <EmployeeAvatar url={data.photoUrl} name={data.fullName} size="h-20 w-20" text="text-2xl" ring="ring-2 ring-brand/20 ring-offset-1" />
            <label className={`absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 border-white shadow-sm transition ${photoUploading ? "bg-ink/20" : "bg-brand hover:bg-brandDark"}`} title="Change photo">
              <Camera className="h-3.5 w-3.5 text-white" aria-hidden />
              <input type="file" accept="image/*" className="sr-only" disabled={photoUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-ink leading-tight">{data.fullName}</p>
            <p className="mt-0.5 text-sm text-ink/55">{data.code} · {data.employeeRole?.name ?? "No role assigned"}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink/50">
              {data.startDate && <span>Started {fmt(data.startDate)}</span>}
              {(data.branch?.name || data.farm?.name) && <span>· {data.branch?.name ?? data.farm?.name}</span>}
            </div>
            {photoUploading && <p className="mt-1.5 text-xs text-brand/80 animate-pulse">Uploading photo…</p>}
            {photoError && <p className="mt-1.5 text-xs text-red-600">{photoError}</p>}
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-0.5 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "text-brand after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand"
                  : "text-ink/50 hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-1">
              <h2 className="mb-3 font-semibold text-ink">Personal Details</h2>
              {([
                ["Code", data.code],
                ["Gender", data.gender],
                ["Date of Birth", fmt(data.dateOfBirth)],
                ["National ID", data.nationalId],
                ["Phone", data.phone],
                ["Email", data.email],
                ["Address", data.address],
                ["Emergency Contact", data.emergencyContactName],
                ["Emergency Phone", data.emergencyContactPhone],
              ] as [string, string | undefined | null][]).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line/50 py-2 last:border-0 text-sm">
                  <span className="shrink-0 text-ink/50 w-36">{label}</span>
                  <span className="text-right font-medium text-ink break-words min-w-0">{value || "—"}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-line bg-white p-5 shadow-sm space-y-1">
              <h2 className="mb-3 font-semibold text-ink">Employment & Payroll</h2>
              {([
                ["Role", data.employeeRole?.name],
                ["Start Date", fmt(data.startDate)],
                ["Branch", data.branch?.name],
                ["Farm", data.farm?.name],
                ["Warehouse", data.warehouse?.name],
                ["Basic Salary", data.basicSalary ? money(data.basicSalary) : null],
                ["Bank Name", data.bankName],
                ["Bank Account", data.bankAccount],
                ["SSNIT", data.ssnitNumber],
                ["TIN", data.tinNumber],
              ] as [string, string | undefined | null][]).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line/50 py-2 last:border-0 text-sm">
                  <span className="shrink-0 text-ink/50 w-36">{label}</span>
                  <span className="text-right font-medium text-ink break-words min-w-0">{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "edit" && (
          <div className="space-y-5">
            {editError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{editError}</div>}
            {editSuccess && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">Saved successfully</div>}
            <form onSubmit={saveEdit} className="space-y-5">
              <div className="rounded-lg border border-line bg-white p-5 space-y-4">
                <h2 className="font-semibold">Personal Details</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">First Name</label><input value={editForm.firstName} onChange={ef("firstName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Last Name</label><input value={editForm.lastName} onChange={ef("lastName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div><label className="mb-1 block text-xs font-medium">Gender</label>
                    <select value={editForm.gender} onChange={ef("gender")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">—</option>
                      {["MALE", "FEMALE", "OTHER"].map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-xs font-medium">Date of Birth</label><input type="date" value={editForm.dateOfBirth} onChange={ef("dateOfBirth")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Status</label>
                    <select value={editForm.status} onChange={ef("status")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— Unchanged —</option>
                      {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED", "RESIGNED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Phone</label><input value={editForm.phone} onChange={ef("phone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Email</label><input type="email" value={editForm.email} onChange={ef("email")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="mb-1 block text-xs font-medium">Address</label><textarea value={editForm.address} onChange={ef("address")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              </div>

              <div className="rounded-lg border border-line bg-white p-5 space-y-4">
                <h2 className="font-semibold">Assignment & Payroll</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Role</label>
                    <select value={editForm.employeeRoleId} onChange={ef("employeeRoleId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {opts.employeeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-xs font-medium">Basic Salary (GHS)</label><input type="number" min={0} step={0.01} value={editForm.basicSalary} onChange={ef("basicSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Branch</label>
                    <select value={editForm.branchId} onChange={ef("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-xs font-medium">Farm</label>
                    <select value={editForm.farmId} onChange={ef("farmId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {opts.farms.map((f_) => <option key={f_.id} value={f_.id}>{f_.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Warehouse</label>
                    <select value={editForm.warehouseId} onChange={ef("warehouseId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div><label className="mb-1 block text-xs font-medium">Production Site</label>
                    <select value={editForm.productionSiteId} onChange={ef("productionSiteId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {opts.productionSites.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Bank Name</label><input value={editForm.bankName} onChange={ef("bankName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Bank Account</label><input value={editForm.bankAccount} onChange={ef("bankAccount")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">SSNIT Number</label><input value={editForm.ssnitNumber} onChange={ef("ssnitNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">TIN Number</label><input value={editForm.tinNumber} onChange={ef("tinNumber")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Emergency Contact</label><input value={editForm.emergencyContactName} onChange={ef("emergencyContactName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Emergency Phone</label><input value={editForm.emergencyContactPhone} onChange={ef("emergencyContactPhone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                </div>
                <div><label className="mb-1 block text-xs font-medium">Notes</label><textarea value={editForm.notes} onChange={ef("notes")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              </div>

              <button type="submit" disabled={editSaving} className="rounded-md bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}

        {tab === "attendance" && (
          <DataTable
            columns={[
              { key: "date", label: "Date", render: (r) => fmt(r.date as string) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              { key: "hoursWorked", label: "Hours Worked", render: (r) => r.hoursWorked ? `${Number(r.hoursWorked).toFixed(1)}h` : "—" },
            ]}
            rows={data.attendanceRecords as Record<string, any>[]}
            empty="No attendance records"
          />
        )}

        {tab === "tasks" && (
          <DataTable
            columns={[
              { key: "task", label: "Task", render: (r) => r.task?.title ?? "—" },
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
    
  );
}

// â"€â"€â"€ Attendance Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type AttendanceRow = { id: string; date: string; status: string; hoursWorked?: number; employee: { fullName: string; code: string }; shift?: { name: string } };

export function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>(() => getCachedFirst<ApiEnvelope<AttendanceRow[]>>("/hr/attendance")?.data ?? []);
  const { opts, optionsError } = useHROptions();
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({ employeeId: "", date: new Date().toISOString().slice(0, 10), checkInTime: "", checkOutTime: "", status: "PRESENT", shiftId: "", notes: "" });
  const [loading, setLoading] = useState(!hasCached("/hr/attendance"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<AttendanceRow[]>>(`/hr/attendance?dateFrom=${dateFilter}&dateTo=${dateFilter}`).then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
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
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Attendance</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Record Attendance"}</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Record Attendance</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
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
                  <option value="">— None —</option>
                  {opts.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}—{s.endTime})</option>)}
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
            { key: "shift", label: "Shift", render: (r) => r.shift?.name ?? "—" },
            { key: "checkIn", label: "Check In", render: (r) => r.checkInTime ? new Date(r.checkInTime as string).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "—" },
            { key: "checkOut", label: "Check Out", render: (r) => r.checkOutTime ? new Date(r.checkOutTime as string).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }) : "—" },
            { key: "hoursWorked", label: "Hours", render: (r) => r.hoursWorked ? `${Number(r.hoursWorked).toFixed(1)}h` : "—" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No attendance records for this date"
        />
      </div>
    
  );
}

// â"€â"€â"€ Shift Schedule â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Shift = { id: string; code: string; name: string; startTime: string; endTime: string; isActive: boolean; branch?: { name: string } };

export function ShiftSchedulePage() {
  const [rows, setRows] = useState<Shift[]>(() => getCachedFirst<ApiEnvelope<Shift[]>>("/hr/shifts")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/shifts"));
  const { opts, optionsError } = useHROptions();
  const [form, setForm] = useState({ code: "", name: "", startTime: "08:00", endTime: "17:00", branchId: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<Shift[]>>("/hr/shifts").then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function deactivate() {
    if (!confirmDeactivateId) return;
    setDeactivating(true);
    await apiFetch(`/hr/shifts/${confirmDeactivateId}`, { method: "DELETE" }).then(() => load()).catch(() => undefined);
    setDeactivating(false);
    setConfirmDeactivateId(null);
  }

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
    
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Shift Schedule</h1>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Add Shift</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div>}
            <form onSubmit={submit} className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium">Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-medium">Start</label><input required type="time" value={form.startTime} onChange={f("startTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium">End</label><input required type="time" value={form.endTime} onChange={f("endTime")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— All Branches —</option>
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
                { key: "isActive", label: "Active", render: (r) => <span className={r.isActive ? "text-green-600 font-medium" : "text-ink/40"}>{r.isActive ? "Active" : "Inactive"}</span> },
                { key: "actions", label: "", render: (r) => r.isActive ? (
                  <button onClick={() => setConfirmDeactivateId(r.id as string)} className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700 hover:bg-orange-200">Deactivate</button>
                ) : null },
              ]}
              rows={rows as Record<string, any>[]}
              loading={loading}
              empty="No shifts defined"
            />
          </div>
        </div>
        <ConfirmModal
          open={!!confirmDeactivateId}
          onClose={() => setConfirmDeactivateId(null)}
          onConfirm={deactivate}
          title="Deactivate Shift"
          message="Deactivate this shift?"
          confirmLabel="Deactivate"
          variant="danger"
          loading={deactivating}
        />
      </div>

  );
}

// â"€â"€â"€ Task Board â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Task = { id: string; title: string; priority: string; status: string; dueDate?: string; taskType?: string; branch?: { name: string }; assignments: Array<{ employee: { fullName: string } }> };

export function TaskBoardPage() {
  const [rows, setRows] = useState<Task[]>(() => getCachedFirst<ApiEnvelope<Task[]>>("/hr/tasks")?.data ?? []);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [moveError, setMoveError] = useState("");
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    apiFetch<ApiEnvelope<Task[]>>(`/hr/tasks?${params}`).then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load."));
  }

  useEffect(() => { load(); }, [status, priority]);

  const columns = ["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];
  const byStatus = (s: string) => rows.filter((r) => r.status === s);

  async function moveTask(taskId: string, newStatus: string) {
    setMoveError("");
    try {
      await apiFetch(`/hr/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      load();
    } catch (err: unknown) {
      setMoveError(err instanceof Error ? err.message : "Failed to move task");
    }
  }

  const nextStatus: Record<string, string> = {
    OPEN: "IN_PROGRESS",
    IN_PROGRESS: "COMPLETED",
    ON_HOLD: "IN_PROGRESS",
    COMPLETED: "OPEN",
  };

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Task Board</h1>
          <Link href="/hr/tasks/create" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Task</Link>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {moveError && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{moveError}</div>}
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
                  <div key={task.id} className="rounded-md bg-white p-3 shadow-sm">
                    <Link href={`/hr/tasks/${task.id}`} className="block hover:text-brand">
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.taskType && <p className="text-xs text-ink/50 mt-0.5">{task.taskType}</p>}
                    </Link>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge status={task.priority} />
                      {task.dueDate && <span className="text-xs text-ink/50">Due {fmt(task.dueDate)}</span>}
                    </div>
                    {task.assignments?.length > 0 && (
                      <p className="mt-1 text-xs text-ink/60">{task.assignments.map((a) => a.employee?.fullName).join(", ")}</p>
                    )}
                    {col !== "CANCELLED" && nextStatus[col] && (
                      <button
                        onClick={() => moveTask(task.id, nextStatus[col])}
                        className="mt-2 w-full rounded border border-line bg-field px-2 py-1 text-xs font-medium text-ink/70 hover:bg-white hover:text-brand"
                      >
                        Move to {nextStatus[col].replace(/_/g, " ")} &rarr;
                      </button>
                    )}
                  </div>
                ))}
                {byStatus(col).length === 0 && <p className="text-xs text-ink/40 text-center py-4">Empty</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    
  );
}

// â"€â"€â"€ Create Task â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function CreateTaskPage() {
  const router = useRouter();
  const { opts, optionsError } = useHROptions();
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Task Type</label><input value={form.taskType} onChange={f("taskType")} placeholder="e.g. Feeding, Cleaning..." className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Priority</label>
                <select value={form.priority} onChange={f("priority")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Due Date</label><input type="date" value={form.dueDate} onChange={f("dueDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Branch</label>
                <select value={form.branchId} onChange={f("branchId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— None —</option>
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
    
  );
}

// â"€â"€â"€ Payroll Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type PayrollRow = { id: string; reference: string; period: string; grossPay: number; netPay: number; status: string; employee?: { fullName: string; code: string }; paymentDate?: string };

type PayrollEstimate = { grossMonthly: number; ssnit: number; paye: number; netPay: number; employerSsnit: number; pensionTier2: number; payeBandsStale?: boolean; payeBandsTaxYear?: number };
type PrefillResult = { basicSalary: number; overtimePay: number; taxDeduction: number; ssnit: number; employerSsnit: number; pensionTier2: number; netPay: number; attendanceSummary: { daysPresent: number; daysAbsent: number; totalHours: number; overtimeHours: number } };

export function PayrollPage() {
  const [rows, setRows] = useState<PayrollRow[]>(() => getCachedFirst<ApiEnvelope<PayrollRow[]>>("/hr/payroll")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/payroll"));
  const { opts, optionsError } = useHROptions();
  const [form, setForm] = useState({ employeeId: "", period: "", periodStart: "", periodEnd: "", basicSalary: "", allowances: "0", deductions: "0", overtimePay: "0", taxDeduction: "0", ssnit: "0", employerSsnit: "0", pensionTier2: "0", paymentMethod: "BANK_TRANSFER", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [payeEst, setPayeEst] = useState<PayrollEstimate | null>(null);
  const [payeLoading, setPayeLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [bulkForm, setBulkForm] = useState({ period: "", periodStart: "", periodEnd: "", branchId: "" });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PayrollRow[]>>("/hr/payroll").then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const fb = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setBulkForm((p) => ({ ...p, [k]: e.target.value }));

  async function runComputePaye() {
    if (!form.basicSalary) return;
    setPayeLoading(true);
    try {
      const params = new URLSearchParams({ basicSalary: form.basicSalary, allowances: form.allowances || "0", deductions: form.deductions || "0" });
      const r = await apiFetch<ApiEnvelope<PayrollEstimate>>(`/hr/payroll/compute?${params}`);
      setPayeEst(r.data);
      if (r.data) {
        setForm((p) => ({ ...p, taxDeduction: r.data!.paye.toFixed(2), ssnit: r.data!.ssnit.toFixed(2), employerSsnit: r.data!.employerSsnit.toFixed(2), pensionTier2: r.data!.pensionTier2.toFixed(2) }));
      }
    } catch { /* ignore */ } finally { setPayeLoading(false); }
  }

  async function prefillFromAttendance() {
    if (!form.employeeId || !form.period) { setError("Select an employee and enter the period (YYYY-MM) first."); return; }
    setPrefillLoading(true); setError("");
    try {
      const r = await apiFetch<ApiEnvelope<PrefillResult>>(`/hr/payroll/prefill?employeeId=${form.employeeId}&period=${form.period}`);
      const d = r.data;
      setForm((p) => ({ ...p, basicSalary: d.basicSalary.toFixed(2), overtimePay: d.overtimePay.toFixed(2), taxDeduction: d.taxDeduction.toFixed(2), ssnit: d.ssnit.toFixed(2), employerSsnit: d.employerSsnit.toFixed(2), pensionTier2: d.pensionTier2.toFixed(2) }));
      setPayeEst({ grossMonthly: d.basicSalary + d.overtimePay, ssnit: d.ssnit, paye: d.taxDeduction, netPay: d.netPay, employerSsnit: d.employerSsnit, pensionTier2: d.pensionTier2 });
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Prefill failed"); }
    finally { setPrefillLoading(false); }
  }

  async function bulkRun(e: React.FormEvent) {
    e.preventDefault(); setBulkSaving(true); setBulkResult("");
    try {
      const r = await apiFetch<ApiEnvelope<{ created: number; skipped: number; errors: string[]; period: string }>>("/hr/payroll/bulk-run", { method: "POST", body: JSON.stringify({ ...bulkForm, branchId: bulkForm.branchId || undefined }) });
      setBulkResult(`Period ${r.data.period}: ${r.data.created} records created, ${r.data.skipped} skipped.${r.data.errors.length ? ` Errors: ${r.data.errors.join("; ")}` : ""}`);
      load();
    } catch (err: unknown) { setBulkResult(err instanceof Error ? err.message : "Bulk run failed"); }
    finally { setBulkSaving(false); }
  }

  const gross = (Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) + (Number(form.overtimePay) || 0) - (Number(form.deductions) || 0);
  const net = gross - (Number(form.taxDeduction) || 0) - (Number(form.ssnit) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/payroll", { method: "POST", body: JSON.stringify({ ...form, basicSalary: Number(form.basicSalary), allowances: Number(form.allowances), deductions: Number(form.deductions), overtimePay: Number(form.overtimePay), taxDeduction: Number(form.taxDeduction), ssnit: Number(form.ssnit), employerSsnit: Number(form.employerSsnit), pensionTier2: Number(form.pensionTier2) }) });
      setShowForm(false); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function approve(id: string) { await apiFetch(`/hr/payroll/${id}/approve`, { method: "PATCH" }).then(() => load()).catch(() => undefined); }
  async function markPaid(id: string) { await apiFetch(`/hr/payroll/${id}/mark-paid`, { method: "PATCH" }).then(() => load()).catch(() => undefined); }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Payroll Records</h1>
          <div className="flex gap-2">
            <button onClick={() => { setShowBulk(p => !p); setBulkResult(""); }} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field">Bulk Run</button>
            <a href={`/api/v1/hr/payroll/bank-export?period=${bulkForm.period || form.period || ""}`} target="_blank" rel="noreferrer" className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field">Export Bank CSV</a>
            <button onClick={() => { setShowForm(p => !p); setError(""); setPayeEst(null); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Payroll"}</button>
          </div>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}

        {showBulk && (
          <form onSubmit={bulkRun} className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-4">
            <p className="font-semibold text-amber-800">Bulk Payroll Run — creates DRAFT records from attendance</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Period (YYYY-MM) *</label>
                <input required value={bulkForm.period} onChange={fb("period")} placeholder="2026-01" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Period Start *</label>
                <input required type="date" value={bulkForm.periodStart} onChange={fb("periodStart")} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Period End *</label>
                <input required type="date" value={bulkForm.periodEnd} onChange={fb("periodEnd")} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Branch (optional)</label>
                <select value={bulkForm.branchId} onChange={fb("branchId")} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">All branches</option>
                  {opts.branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={bulkSaving} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{bulkSaving ? "Running..." : "Run Bulk Payroll"}</button>
            </div>
            {bulkResult && <p className="text-sm text-amber-800">{bulkResult}</p>}
          </form>
        )}

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Payroll Record</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Period (e.g. 2026-01) *</label><input required value={form.period} onChange={f("period")} placeholder="2026-01" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Period Start *</label><input required type="date" value={form.periodStart} onChange={f("periodStart")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Period End *</label><input required type="date" value={form.periodEnd} onChange={f("periodEnd")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2 flex items-center gap-3">
                <button type="button" onClick={prefillFromAttendance} disabled={prefillLoading || !form.employeeId || !form.period} className="rounded-md border border-brand px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">
                  {prefillLoading ? "Loading..." : "Prefill from Attendance"}
                </button>
                <button type="button" onClick={runComputePaye} disabled={payeLoading || !form.basicSalary} className="rounded-md border border-ink/30 px-3 py-2 text-xs font-medium hover:bg-field disabled:opacity-50">
                  {payeLoading ? "Computing..." : "Auto-compute PAYE"}
                </button>
                {payeEst && <span className="text-xs text-ink/60">SSNIT {money(payeEst.ssnit)} · PAYE {money(payeEst.paye)} · Net {money(payeEst.netPay)}</span>}
              </div>
              {payeEst?.payeBandsStale && (
                <div className="col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  PAYE bands last confirmed for tax year {payeEst.payeBandsTaxYear} — verify against the current GRA schedule before relying on this estimate.
                </div>
              )}
              <div><label className="mb-1 block text-xs font-medium">Basic Salary *</label><input required type="number" min={0} step={0.01} value={form.basicSalary} onChange={f("basicSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Overtime Pay</label><input type="number" min={0} step={0.01} value={form.overtimePay} onChange={f("overtimePay")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Allowances</label><input type="number" min={0} step={0.01} value={form.allowances} onChange={f("allowances")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Deductions</label><input type="number" min={0} step={0.01} value={form.deductions} onChange={f("deductions")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Tax (PAYE)</label><input type="number" min={0} step={0.01} value={form.taxDeduction} onChange={f("taxDeduction")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Employee SSNIT (5.5%)</label><input type="number" min={0} step={0.01} value={form.ssnit} onChange={f("ssnit")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Payment Method</label>
                <select value={form.paymentMethod} onChange={f("paymentMethod")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-md bg-field p-3 text-sm">
                <div>Gross Pay: <strong>{money(gross)}</strong> · Net Pay: <strong>{money(net)}</strong></div>
                <div className="text-xs text-ink/60">
                  Employer contributions: SSNIT {money(Number(form.employerSsnit))} + Tier 2 {money(Number(form.pensionTier2))} = {money(Number(form.employerSsnit) + Number(form.pensionTier2))}
                </div>
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
            { key: "employee", label: "Employee", render: (r) => (r.employee as any)?.fullName ?? "—" },
            { key: "period", label: "Period" },
            { key: "grossPay", label: "Gross", render: (r) => money(r.grossPay) },
            { key: "netPay", label: "Net Pay", render: (r) => money(r.netPay) },
            { key: "employerSsnit", label: "Employer SSNIT", render: (r) => <span className="text-xs text-ink/60">{money((r.employerSsnit as number ?? 0) + (r.pensionTier2 as number ?? 0))}</span> },
            { key: "paymentDate", label: "Paid On", render: (r) => fmt(r.paymentDate as string) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            {
              key: "actions", label: "Actions", render: (r) => (
                <div className="flex gap-1 flex-wrap">
                  {r.status === "DRAFT" && <button onClick={() => approve(r.id as string)} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200">Approve</button>}
                  {r.status === "APPROVED" && <button onClick={() => markPaid(r.id as string)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Mark Paid</button>}
                  <a href={`/api/v1/hr/payroll/${r.id}/payslip`} target="_blank" rel="noreferrer" className="rounded border border-line bg-white px-2 py-0.5 text-xs hover:bg-field flex items-center gap-1"><FileText size={10} /> PDF</a>
                  {["APPROVED","PAID"].includes(r.status as string) && (
                    <button onClick={async () => { await apiFetch(`/hr/payroll/${r.id}/email-payslip`, { method: "POST" }).catch(() => undefined); }} className="rounded border border-line bg-white px-2 py-0.5 text-xs hover:bg-field">Email</button>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No payroll records"
        />
      </div>
    
  );
}

// â"€â"€â"€ Training Records â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type TrainingRow = { id: string; title: string; trainer?: string; trainingDate: string; durationHours?: number; outcome: string; employee: { fullName: string; code: string } };

export function TrainingPage() {
  const [rows, setRows] = useState<TrainingRow[]>(() => getCachedFirst<ApiEnvelope<TrainingRow[]>>("/hr/training")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/training"));
  const { opts, optionsError } = useHROptions();
  const [form, setForm] = useState({ employeeId: "", title: "", description: "", trainer: "", trainingDate: "", durationHours: "", outcome: "ONGOING", certificate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<TrainingRow[]>>("/hr/training").then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
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
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Training Records</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Training"}</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Training Record</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  {opts.employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Training Title *</label><input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Trainer</label><input value={form.trainer} onChange={f("trainer")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Description</label><textarea value={form.description} onChange={f("description")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
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
            { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "—" },
            { key: "title", label: "Training" },
            { key: "trainer", label: "Trainer" },
            { key: "trainingDate", label: "Date", render: (r) => fmt(r.trainingDate as string) },
            { key: "durationHours", label: "Hours", render: (r) => r.durationHours ? `${r.durationHours}h` : "—" },
            { key: "outcome", label: "Outcome", render: (r) => <StatusBadge status={r.outcome as string} /> },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No training records"
        />
      </div>
    
  );
}

// â"€â"€â"€ Performance Report â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type PerfRow = { id: string; period: string; overallRating: string; attendanceScore: number; taskCompletionScore: number; qualityScore: number; teamworkScore: number; status: string; employee: { fullName: string; code: string }; reviewer?: { fullName: string } };

export function PerformancePage() {
  const [rows, setRows] = useState<PerfRow[]>(() => getCachedFirst<ApiEnvelope<PerfRow[]>>("/hr/performance")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/performance"));
  const { opts, optionsError } = useHROptions();
  const [form, setForm] = useState({ employeeId: "", period: "", overallRating: "MEETS_EXPECTATIONS", attendanceScore: "0", taskCompletionScore: "0", qualityScore: "0", teamworkScore: "0", comments: "", goals: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PerfRow[]>>("/hr/performance").then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
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

  async function submitPerf(id: string) {
    await apiFetch(`/hr/performance/${id}/submit`, { method: "PATCH" }).then(() => load()).catch(() => undefined);
  }

  async function acknowledge(id: string) {
    await apiFetch(`/hr/performance/${id}/acknowledge`, { method: "PATCH" }).then(() => load()).catch(() => undefined);
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Employee Performance</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Review"}</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Performance Review</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
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
            { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "—" },
            { key: "period", label: "Period" },
            { key: "overallRating", label: "Rating", render: (r) => <StatusBadge status={r.overallRating as string} /> },
            { key: "attendanceScore", label: "Attend.", render: (r) => `${r.attendanceScore}%` },
            { key: "taskCompletionScore", label: "Tasks", render: (r) => `${r.taskCompletionScore}%` },
            { key: "qualityScore", label: "Quality", render: (r) => `${r.qualityScore}%` },
            { key: "reviewer", label: "Reviewer", render: (r) => r.reviewer?.fullName ?? "—" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            {
              key: "actions", label: "", render: (r) => (
                <div className="flex gap-1">
                  {r.status === "DRAFT" && <button onClick={() => submitPerf(r.id as string)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Submit</button>}
                  {r.status === "REVIEWED" && <button onClick={() => acknowledge(r.id as string)} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 hover:bg-green-200">Acknowledge</button>}
                </div>
              ),
            },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No performance records"
        />
      </div>
    
  );
}

// ─── Task Detail ─────────────────────────────────────────────────────────────

type TaskDetail = {
  id: string; title: string; description?: string; taskType?: string; priority: string; status: string; dueDate?: string; notes?: string; updatedAt?: string;
  branch?: { name: string }; farm?: { name: string }; productionSite?: { name: string };
  createdBy?: { fullName: string };
  assignments: Array<{ id: string; status: string; notes?: string; employee: { id: string; fullName: string; code: string } }>;
};

export function TaskDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<TaskDetail | null>(() => getCachedFirst<ApiEnvelope<TaskDetail>>(`/hr/tasks/${id}`)?.data ?? null);
  const [taskLoadError, setTaskLoadError] = useState("");
  const [statusValue, setStatusValue] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState("");

  function load() {
    setTaskLoadError("");
    apiFetch<ApiEnvelope<TaskDetail>>(`/hr/tasks/${id}`).then((r) => {
      setData(r.data);
      setStatusValue(r.data?.status ?? "");
    }).catch((err: unknown) => setTaskLoadError(err instanceof Error ? err.message : "Failed to load task."));
  }

  useEffect(() => { load(); }, [id]);

  async function updateStatus(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusError("");
    try {
      await apiFetch(`/hr/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: statusValue, notes: statusNotes || undefined, expectedUpdatedAt: data?.updatedAt }) });
      load();
      setStatusNotes("");
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Failed to update status");
      if (err instanceof Error && err.message.includes("changed by someone else")) load();
    } finally {
      setSaving(false);
    }
  }

  if (taskLoadError) return (
    
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-sm text-red-600">{taskLoadError}</p>
        <button type="button" onClick={load} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90">Retry</button>
        <Link href="/hr/tasks" className="text-sm text-ink/50 hover:text-ink">← Back to Tasks</Link>
      </div>
    
  );

  if (!data) return <div className="flex items-center justify-center p-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>;

  return (
    
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/hr/tasks" className="text-sm text-ink/60 hover:text-ink">&larr; Task Board</Link>
          <h1 className="text-xl font-bold">{data.title}</h1>
          <StatusBadge status={data.status} />
          <StatusBadge status={data.priority} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-lg border border-line bg-white p-5 space-y-3">
              <h2 className="font-semibold">Task Details</h2>
              {data.description && <p className="text-sm text-ink/80">{data.description}</p>}
              <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
                <dt className="text-ink/60">Type</dt><dd>{data.taskType ?? "—"}</dd>
                <dt className="text-ink/60">Due Date</dt><dd>{fmt(data.dueDate)}</dd>
                <dt className="text-ink/60">Branch</dt><dd>{data.branch?.name ?? "—"}</dd>
                <dt className="text-ink/60">Farm</dt><dd>{data.farm?.name ?? "—"}</dd>
                <dt className="text-ink/60">Production Site</dt><dd>{data.productionSite?.name ?? "—"}</dd>
                <dt className="text-ink/60">Created By</dt><dd>{data.createdBy?.fullName ?? "—"}</dd>
              </dl>
              {data.notes && <p className="text-xs text-ink/60 border-t border-line pt-2">{data.notes}</p>}
            </div>

            <div className="rounded-lg border border-line bg-white p-5 space-y-3">
              <h2 className="font-semibold">Assignments</h2>
              {data.assignments.length === 0 && <p className="text-sm text-ink/50">No employees assigned</p>}
              <ul className="space-y-2">
                {data.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{a.employee.fullName}</p>
                      <p className="text-xs text-ink/50">{a.employee.code}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 space-y-4 h-fit">
            <h2 className="font-semibold">Update Status</h2>
            <form onSubmit={updateStatus} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">New Status</label>
                <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Notes (optional)</label>
                <textarea value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              {statusError && <p className="text-xs text-red-600">{statusError}</p>}
              <button type="submit" disabled={saving || statusValue === data.status} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Update Status"}
              </button>
            </form>
          </div>
        </div>
      </div>
    
  );
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

type LeaveRow = {
  id: string; reference: string; leaveType: string; startDate: string; endDate: string; daysRequested: number;
  status: string; reason?: string; reviewNote?: string; createdAt: string;
  employee?: { fullName: string; code: string };
  reviewer?: { fullName: string };
};

export function LeaveRequestsPage() {
  const [rows, setRows] = useState<LeaveRow[]>(() => getCachedFirst<ApiEnvelope<LeaveRow[]>>("/hr/leave-requests")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/leave-requests"));
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leaveType: "ANNUAL", startDate: "", endDate: "", daysRequested: "1", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  function load() {
    setLoadError("");
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    apiFetch<ApiEnvelope<LeaveRow[]>>(`/hr/leave-requests?${params}`).then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm((p) => {
      const next = { ...p, [k]: val };
      if ((k === "startDate" || k === "endDate") && next.startDate && next.endDate) {
        const diff = Math.round((new Date(next.endDate).getTime() - new Date(next.startDate).getTime()) / 86400000) + 1;
        if (diff > 0) next.daysRequested = String(diff);
      }
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/leave-requests", {
        method: "POST",
        body: JSON.stringify({ ...form, daysRequested: Number(form.daysRequested) }),
      });
      setShowForm(false);
      setForm({ leaveType: "ANNUAL", startDate: "", endDate: "", daysRequested: "1", reason: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSaving(false);
    }
  }

  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    await apiFetch(`/hr/leave-requests/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ decision, reviewNote: reviewNote || undefined }),
    }).then(() => { setReviewingId(null); setReviewNote(""); load(); }).catch(() => undefined);
  }

  async function cancelRequest() {
    if (!confirmCancelId) return;
    setCancelling(true);
    await apiFetch(`/hr/leave-requests/${confirmCancelId}`, { method: "DELETE" }).then(() => load()).catch(() => undefined);
    setCancelling(false);
    setConfirmCancelId(null);
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Leave Requests</h1>
          <button onClick={() => setShowForm((p) => !p)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            {showForm ? "Cancel" : "+ Request Leave"}
          </button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}

        {showForm && (
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">New Leave Request</h2>
            {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Leave Type *</label>
                <select required value={form.leaveType} onChange={f("leaveType")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  {["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "UNPAID"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Days Requested *</label>
                <input required type="number" min={1} value={form.daysRequested} onChange={f("daysRequested")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div><label className="mb-1 block text-xs font-medium">Start Date *</label>
                <input required type="date" value={form.startDate} onChange={f("startDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div><label className="mb-1 block text-xs font-medium">End Date *</label>
                <input required type="date" value={form.endDate} onChange={f("endDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Reason</label>
                <textarea value={form.reason} onChange={f("reason")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" disabled={saving} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Submitting..." : "Submit Request"}</button>
              </div>
            </form>
          </div>
        )}

        {reviewingId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-amber-800">Review Note (optional)</h3>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} placeholder="Add a note for the employee..." className="mb-3 w-full rounded-md border border-line px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => review(reviewingId, "APPROVED")} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">Approve</button>
              <button onClick={() => review(reviewingId, "REJECTED")} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Reject</button>
              <button onClick={() => { setReviewingId(null); setReviewNote(""); }} className="rounded-md border border-line px-4 py-2 text-sm font-medium">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <DataTable
          columns={[
            { key: "reference", label: "Reference" },
            { key: "employee", label: "Employee", render: (r) => r.employee ? `${r.employee.fullName} (${r.employee.code})` : "—" },
            { key: "leaveType", label: "Type", render: (r) => (r.leaveType as string).replace(/_/g, " ") },
            { key: "startDate", label: "From", render: (r) => fmt(r.startDate as string) },
            { key: "endDate", label: "To", render: (r) => fmt(r.endDate as string) },
            { key: "daysRequested", label: "Days" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "reviewer", label: "Reviewed By", render: (r) => r.reviewer?.fullName ?? "—" },
            {
              key: "actions", label: "Actions", render: (r) => (
                <div className="flex gap-1">
                  {r.status === "PENDING" && (
                    <>
                      <button onClick={() => setReviewingId(r.id as string)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Review</button>
                      <button onClick={() => setConfirmCancelId(r.id as string)} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-red-100 hover:text-red-700">Cancel</button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No leave requests"
        />
        <ConfirmModal
          open={!!confirmCancelId}
          onClose={() => setConfirmCancelId(null)}
          onConfirm={cancelRequest}
          title="Cancel Leave Request"
          message="Cancel this leave request?"
          confirmLabel="Cancel Request"
          variant="danger"
          loading={cancelling}
        />
      </div>

  );
}

// ─── Employee Roles Page ─────────────────────────────────────────────────────

type EmployeeRole = { id: string; code: string; name: string; description?: string; isActive: boolean };

export function EmployeeRolesPage() {
  const [rows, setRows] = useState<EmployeeRole[]>(() => getCachedFirst<ApiEnvelope<EmployeeRole[]>>("/hr/employee-roles")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/employee-roles"));
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<EmployeeRole[]>>("/hr/employee-roles").then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); }).catch((err: any) => setLoadError(err?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const ef = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditForm((p) => ({ ...p, [k]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/hr/employee-roles", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "", description: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(role: EmployeeRole) {
    setEditingId(role.id);
    setEditForm({ name: role.name, description: role.description ?? "" });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/hr/employee-roles/${editingId}`, { method: "PUT", body: JSON.stringify(editForm) });
      setEditingId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  }

  return (
    
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Employee Roles</h1>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Add Role</h2>
            <form onSubmit={create} className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium">Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={form.name} onChange={f("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Description</label><textarea value={form.description} onChange={f("description")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Add Role"}</button>
            </form>
          </div>

          <div className="lg:col-span-2">
            {editingId && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-amber-800">Editing Role</h3>
                <form onSubmit={saveEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={editForm.name} onChange={ef("name")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Description</label><input value={editForm.description} onChange={ef("description")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-md border border-line px-4 py-2 text-sm">Cancel</button>
                  </div>
                </form>
              </div>
            )}
            <DataTable
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Role Name" },
                { key: "description", label: "Description", render: (r) => r.description ?? "—" },
                { key: "isActive", label: "Active", render: (r) => <span className={r.isActive ? "text-green-600" : "text-ink/40"}>{r.isActive ? "Yes" : "No"}</span> },
                { key: "actions", label: "", render: (r) => (
                  <button onClick={() => startEdit(r as EmployeeRole)} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200">Edit</button>
                )},
              ]}
              rows={rows as Record<string, any>[]}
              loading={loading}
              empty="No roles defined"
            />
          </div>
        </div>
      </div>
    
  );
}

// ─── Productivity Report ──────────────────────────────────────────────────────

type ProductivityData = {
  period: { from: string; to: string };
  employees: Array<{
    employee: { id: string; code: string; fullName: string; employeeRole?: { name: string }; branch?: { name: string } };
    attendance: { present: number; absent: number; late: number; total: number; rate: string };
    tasks: { completed: number; total: number; rate: string };
  }>;
};

// ─── HR-A: Leave Policies ─────────────────────────────────────────────────────

type LeavePolicy = { id: string; name: string; leaveType: string; daysPerYear: number; carryOverDays: number; isActive: boolean; employeeRole?: { name: string } | null };

export function LeavePoliciesPage() {
  const { opts } = useHROptions();
  const [rows, setRows] = useState<LeavePolicy[]>(() => getCachedFirst<ApiEnvelope<LeavePolicy[]>>("/hr/leave-policies")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/leave-policies"));
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", leaveType: "ANNUAL", daysPerYear: "21", carryOverDays: "0", employeeRoleId: "", isActive: "true" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<LeavePolicy[]>>("/hr/leave-policies")
      .then((r) => { const fresh = r.data ?? []; setRows(prev => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ name: "", leaveType: "ANNUAL", daysPerYear: "21", carryOverDays: "0", employeeRoleId: "", isActive: "true" }); setShowForm(true); setError(""); }
  function openEdit(row: LeavePolicy) { setEditing(row); setForm({ name: row.name, leaveType: row.leaveType, daysPerYear: String(row.daysPerYear), carryOverDays: String(row.carryOverDays), employeeRoleId: "", isActive: String(row.isActive) }); setShowForm(true); setError(""); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) {
        await apiFetch(`/hr/leave-policies/${editing.id}`, { method: "PUT", body: JSON.stringify({ name: form.name, daysPerYear: Number(form.daysPerYear), carryOverDays: Number(form.carryOverDays), isActive: form.isActive === "true" }) });
      } else {
        await apiFetch("/hr/leave-policies", { method: "POST", body: JSON.stringify({ name: form.name, leaveType: form.leaveType, daysPerYear: Number(form.daysPerYear), carryOverDays: Number(form.carryOverDays), employeeRoleId: form.employeeRoleId || undefined }) });
      }
      setShowForm(false); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    await apiFetch(`/hr/leave-policies/${confirmDeleteId}`, { method: "DELETE" }).catch(() => undefined);
    setDeleting(false);
    setConfirmDeleteId(null);
    load();
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Leave Policies</h1>
          <button onClick={openCreate} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90">+ Add Policy</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <form onSubmit={submit} className="rounded-lg border border-line bg-white p-5 space-y-4">
            <p className="font-semibold">{editing ? "Edit Policy" : "New Leave Policy"}</p>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Policy Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={f("name")} placeholder="e.g. Annual Leave — All Staff" className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              </div>
              {!editing && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/70">Leave Type <span className="text-red-500">*</span></label>
                  <select required value={form.leaveType} onChange={f("leaveType")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                    {["ANNUAL","SICK","MATERNITY","PATERNITY","COMPASSIONATE","UNPAID"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Days Per Year <span className="text-red-500">*</span></label>
                <input required type="number" min={1} value={form.daysPerYear} onChange={f("daysPerYear")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Carry-Over Days</label>
                <input type="number" min={0} value={form.carryOverDays} onChange={f("carryOverDays")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              </div>
              {!editing && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/70">Role (leave blank for all roles)</label>
                  <select value={form.employeeRoleId} onChange={f("employeeRoleId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                    <option value="">All roles</option>
                    {opts.employeeRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {editing && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink/70">Status</label>
                  <select value={form.isActive} onChange={f("isActive")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Policy"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">Cancel</button>
            </div>
          </form>
        )}
        <DataTable
          columns={[
            { key: "name", label: "Policy Name" },
            { key: "leaveType", label: "Type", render: (r) => <StatusBadge status={r.leaveType as string} /> },
            { key: "daysPerYear", label: "Days/Year" },
            { key: "carryOverDays", label: "Carry-Over" },
            { key: "role", label: "Role", render: (r) => (r.employeeRole as any)?.name ?? <span className="text-ink/40">All roles</span> },
            { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "CANCELLED"} /> },
            { key: "_actions", label: "", render: (r) => (
              <div className="flex gap-1">
                <button onClick={() => openEdit(r as never)} className="rounded border border-line bg-white px-2 py-1 text-xs hover:bg-field"><Pencil size={12} /></button>
                <button onClick={() => setConfirmDeleteId(r.id as string)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"><Trash2 size={12} /></button>
              </div>
            )},
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No leave policies. Click '+ Add Policy' to create one."
        />
        <ConfirmModal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={remove}
          title="Delete Leave Policy"
          message="Delete this leave policy?"
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
        />
      </div>

  );
}

// ─── HR-A: Leave Balance ──────────────────────────────────────────────────────

type LeaveBalance = { id: string; employeeId: string; leaveType: string; year: number; entitled: number; taken: number; pending: number; remaining: number; carryOver: number; employee?: { fullName: string; code: string } | null };

export function LeaveBalancePage() {
  const { opts } = useHROptions();
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<LeaveBalance[]>(() => getCachedFirst<ApiEnvelope<LeaveBalance[]>>("/hr/leave-balance")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/leave-balance"));
  const [loadError, setLoadError] = useState("");
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [showInit, setShowInit] = useState(false);
  const [initYear, setInitYear] = useState(String(currentYear));
  const [initSaving, setInitSaving] = useState(false);
  const [initResult, setInitResult] = useState("");

  function load() {
    setLoadError("");
    const params = new URLSearchParams({ period: yearFilter });
    if (employeeFilter) params.set("employeeId", employeeFilter);
    apiFetch<ApiEnvelope<LeaveBalance[]>>(`/hr/leave-balance?${params}`)
      .then((r) => { const fresh = r.data ?? []; setRows(prev => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [yearFilter, employeeFilter]);

  async function initializeBalances() {
    setInitSaving(true); setInitResult("");
    try {
      const r = await apiFetch<ApiEnvelope<{ created: number; skipped: number; year: number }>>("/hr/leave-balance/initialize", { method: "POST", body: JSON.stringify({ year: Number(initYear) }) });
      setInitResult(`Done: ${r.data.created} created, ${r.data.skipped} already existed for ${r.data.year}.`);
      load();
    } catch (err: unknown) { setInitResult(err instanceof Error ? err.message : "Failed to initialize"); }
    finally { setInitSaving(false); }
  }

  function remainingColor(remaining: number, entitled: number) {
    if (entitled === 0) return "text-ink/40";
    if (remaining <= 0) return "text-red-600 font-semibold";
    if (remaining <= 5) return "text-amber-600 font-semibold";
    return "text-green-700 font-semibold";
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Leave Balance</h1>
          <button onClick={() => setShowInit(p => !p)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-field">Initialize Balances</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showInit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">Initialize leave balances from active policies</p>
            <p className="text-xs text-amber-700">This creates LeaveBalance records for all active employees based on your current leave policies. Existing records are skipped.</p>
            <div className="flex items-center gap-3">
              <input type="number" value={initYear} onChange={(e) => setInitYear(e.target.value)} min={2020} max={2099} className="w-24 rounded-lg border border-line px-3 py-2 text-sm" />
              <button onClick={initializeBalances} disabled={initSaving} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{initSaving ? "Initializing..." : "Initialize"}</button>
            </div>
            {initResult && <p className="text-sm text-amber-800">{initResult}</p>}
          </div>
        )}
        <div className="flex gap-3">
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {[currentYear + 1, currentYear, currentYear - 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm min-w-[180px]">
            <option value="">All employees</option>
            {opts.employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "employee", label: "Employee", render: (r) => (r.employee as any)?.fullName ?? r.employeeId },
            { key: "code", label: "Code", render: (r) => (r.employee as any)?.code ?? "—" },
            { key: "leaveType", label: "Type", render: (r) => <StatusBadge status={r.leaveType as string} /> },
            { key: "year", label: "Year" },
            { key: "entitled", label: "Entitled" },
            { key: "carryOver", label: "Carry-Over" },
            { key: "taken", label: "Taken" },
            { key: "pending", label: "Pending" },
            { key: "remaining", label: "Remaining", render: (r) => <span className={remainingColor(r.remaining as number, r.entitled as number)}>{r.remaining}</span> },
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty={`No leave balances for ${yearFilter}. Use "Initialize Balances" to set them up.`}
        />
      </div>
    
  );
}

// ─── HR-A: Public Holidays ────────────────────────────────────────────────────

type PublicHoliday = { id: string; name: string; date: string; isRecurring: boolean; year?: number | null };

export function PublicHolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<PublicHoliday[]>(() => getCachedFirst<ApiEnvelope<PublicHoliday[]>>("/hr/public-holidays")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/public-holidays"));
  const [loadError, setLoadError] = useState("");
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", date: "", isRecurring: "true" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PublicHoliday[]>>(`/hr/public-holidays?period=${yearFilter}`)
      .then((r) => { const fresh = r.data ?? []; setRows(prev => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [yearFilter]);

  async function seedGhana() {
    setSeeding(true); setSeedMsg("");
    try {
      const r = await apiFetch<ApiEnvelope<{ created: number; skipped: number; year: number }>>("/hr/public-holidays/seed-ghana", { method: "POST" });
      setSeedMsg(`Seeded ${r.data.created} Ghana public holidays for ${r.data.year} (${r.data.skipped} already existed).`);
      load();
    } catch (err: unknown) { setSeedMsg(err instanceof Error ? err.message : "Seeding failed"); }
    finally { setSeeding(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/public-holidays", { method: "POST", body: JSON.stringify({ name: form.name, date: form.date, isRecurring: form.isRecurring === "true" }) });
      setShowForm(false); setForm({ name: "", date: "", isRecurring: "true" }); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    await apiFetch(`/hr/public-holidays/${confirmDeleteId}`, { method: "DELETE" }).catch(() => undefined);
    setDeleting(false);
    setConfirmDeleteId(null);
    load();
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Public Holidays</h1>
          <div className="flex gap-2">
            <button onClick={seedGhana} disabled={seeding} className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">{seeding ? "Seeding..." : "Seed Ghana Holidays"}</button>
            <button onClick={() => { setShowForm(p => !p); setError(""); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90">+ Add Holiday</button>
          </div>
        </div>
        <HRNav />
        {seedMsg && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{seedMsg}</div>}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <form onSubmit={submit} className="rounded-lg border border-line bg-white p-5 space-y-4">
            <p className="font-semibold">Add Public Holiday</p>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Holiday Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={f("name")} placeholder="e.g. Founders' Day" className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Date <span className="text-red-500">*</span></label>
                <input required type="date" value={form.date} onChange={f("date")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Recurring Annually</label>
                <select value={form.isRecurring} onChange={f("isRecurring")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15">
                  <option value="true">Yes</option>
                  <option value="false">No (one-off)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Holiday"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">Cancel</button>
            </div>
          </form>
        )}
        <div>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <DataTable
          columns={[
            { key: "name", label: "Holiday Name" },
            { key: "date", label: "Date", render: (r) => fmt(r.date as string) },
            { key: "isRecurring", label: "Recurring", render: (r) => r.isRecurring ? <span className="text-green-700 text-xs font-semibold">Annual</span> : <span className="text-ink/50 text-xs">One-off</span> },
            { key: "_actions", label: "", render: (r) => (
              <button onClick={() => setConfirmDeleteId(r.id as string)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"><Trash2 size={12} /></button>
            )},
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No public holidays. Click 'Seed Ghana Holidays' to add Ghana's statutory holidays."
        />
        <ConfirmModal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={remove}
          title="Remove Holiday"
          message="Remove this public holiday?"
          confirmLabel="Remove"
          variant="danger"
          loading={deleting}
        />
      </div>

  );
}

// ─── HR-D: Disciplinary Page ──────────────────────────────────────────────────

type DisciplinaryRecord = { id: string; reference: string; incidentDate: string; category: string; description: string; actionTaken: string; acknowledgedAt?: string | null; employee?: { fullName: string; code: string } | null };

const DISC_CATEGORIES = ["Attendance","Insubordination","Policy Violation","Misconduct","Performance","Safety Breach","Substance Abuse","Other"];

export function DisciplinaryPage() {
  const { opts } = useHROptions();
  const [rows, setRows] = useState<DisciplinaryRecord[]>(() => getCachedFirst<ApiEnvelope<DisciplinaryRecord[]>>("/hr/disciplinary")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/disciplinary"));
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ employeeId: "", incidentDate: "", category: "Attendance", description: "", actionTaken: "", notes: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<DisciplinaryRecord[]>>("/hr/disciplinary")
      .then(r => { const fresh = r.data ?? []; setRows(prev => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/disciplinary", { method: "POST", body: JSON.stringify({ ...form }) });
      setShowForm(false); setForm({ employeeId: "", incidentDate: "", category: "Attendance", description: "", actionTaken: "", notes: "" }); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    await apiFetch(`/hr/disciplinary/${confirmDeleteId}`, { method: "DELETE" }).catch(() => undefined);
    setDeleting(false);
    setConfirmDeleteId(null);
    load();
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Disciplinary Records</h1>
          <button onClick={() => { setShowForm(p => !p); setError(""); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">+ Record Action</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <form onSubmit={submit} className="rounded-lg border border-line bg-white p-5 space-y-4">
            <p className="font-semibold">New Disciplinary Action</p>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  {opts.employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Incident Date *</label>
                <input required type="date" value={form.incidentDate} onChange={f("incidentDate")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Category *</label>
                <select required value={form.category} onChange={f("category")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm">
                  {DISC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Description *</label>
                <textarea required value={form.description} onChange={f("description")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Action Taken *</label>
                <textarea required value={form.actionTaken} onChange={f("actionTaken")} rows={2} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Record Action"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </form>
        )}
        <DataTable
          columns={[
            { key: "reference", label: "Ref" },
            { key: "employee", label: "Employee", render: r => (r.employee as any)?.fullName ?? "—" },
            { key: "incidentDate", label: "Incident Date", render: r => fmt(r.incidentDate as string) },
            { key: "category", label: "Category" },
            { key: "actionTaken", label: "Action Taken", render: r => <span className="line-clamp-1 max-w-xs text-xs">{r.actionTaken as string}</span> },
            { key: "acknowledgedAt", label: "Acknowledged", render: r => r.acknowledgedAt ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-ink/40 text-xs">No</span> },
            { key: "_actions", label: "", render: r => (
              <button onClick={() => setConfirmDeleteId(r.id as string)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"><Trash2 size={12} /></button>
            )},
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No disciplinary records found."
        />
        <ConfirmModal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={remove}
          title="Delete Record"
          message="Delete this disciplinary record?"
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
        />
      </div>

  );
}

// ─── HR-D: Grievances Page ────────────────────────────────────────────────────

type GrievanceRecord = { id: string; reference: string; submittedDate: string; category: string; description: string; status: string; resolution?: string | null; resolvedAt?: string | null; employee?: { fullName: string } | null };

const GRIEVANCE_CATEGORIES = ["Harassment","Unfair Treatment","Safety Concern","Pay Dispute","Work Conditions","Management Issues","Discrimination","Other"];

export function GrievancesPage() {
  const { opts } = useHROptions();
  const [rows, setRows] = useState<GrievanceRecord[]>(() => getCachedFirst<ApiEnvelope<GrievanceRecord[]>>("/hr/grievances")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/grievances"));
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resolveId, setResolveId] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolving, setResolving] = useState(false);
  const [form, setForm] = useState({ employeeId: "", submittedDate: new Date().toISOString().slice(0,10), category: "Harassment", description: "" });
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  function load() {
    setLoadError("");
    const params = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<GrievanceRecord[]>>(`/hr/grievances${params}`)
      .then(r => { const fresh = r.data ?? []; setRows(prev => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/grievances", { method: "POST", body: JSON.stringify({ ...form }) });
      setShowForm(false); setForm({ employeeId: "", submittedDate: new Date().toISOString().slice(0,10), category: "Harassment", description: "" }); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function resolve(id: string) {
    if (!resolution.trim()) return;
    setResolving(true);
    try {
      await apiFetch(`/hr/grievances/${id}/resolve`, { method: "PATCH", body: JSON.stringify({ resolution }) });
      setResolveId(""); setResolution(""); load();
    } catch { /* ignore */ } finally { setResolving(false); }
  }

  async function confirmClose() {
    if (!confirmCloseId) return;
    setClosing(true);
    await apiFetch(`/hr/grievances/${confirmCloseId}/close`, { method: "PATCH" }).catch(() => undefined);
    setClosing(false);
    setConfirmCloseId(null);
    load();
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    await apiFetch(`/hr/grievances/${confirmDeleteId}`, { method: "DELETE" }).catch(() => undefined);
    setDeleting(false);
    setConfirmDeleteId(null);
    load();
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Grievances</h1>
          <button onClick={() => { setShowForm(p => !p); setError(""); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">+ Submit Grievance</button>
        </div>
        <HRNav />
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button type="button" className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-red-50" onClick={load}>Retry</button>
          </div>
        )}
        {showForm && (
          <form onSubmit={submit} className="rounded-lg border border-line bg-white p-5 space-y-4">
            <p className="font-semibold">New Grievance</p>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Employee *</label>
                <select required value={form.employeeId} onChange={f("employeeId")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  {opts.employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Date *</label>
                <input required type="date" value={form.submittedDate} onChange={f("submittedDate")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Category *</label>
                <select required value={form.category} onChange={f("category")} className="w-full min-h-10 rounded-lg border border-line px-3 py-2 text-sm">
                  {GRIEVANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink/70">Description *</label>
                <textarea required value={form.description} onChange={f("description")} rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Submit"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </form>
        )}
        <div className="flex gap-2">
          {["", "OPEN", "RESOLVED", "CLOSED"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-full px-3 py-1 text-xs font-semibold border ${statusFilter === s ? "bg-brand text-white border-brand" : "border-line text-ink/60 hover:bg-field"}`}>{s || "All"}</button>
          ))}
        </div>
        {resolveId && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">Resolve Grievance</p>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe the resolution..." rows={3} className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => resolve(resolveId)} disabled={resolving || !resolution.trim()} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{resolving ? "Resolving..." : "Mark Resolved"}</button>
              <button onClick={() => { setResolveId(""); setResolution(""); }} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}
        <DataTable
          columns={[
            { key: "reference", label: "Ref" },
            { key: "employee", label: "Employee", render: r => (r.employee as any)?.fullName ?? "—" },
            { key: "submittedDate", label: "Date", render: r => fmt(r.submittedDate as string) },
            { key: "category", label: "Category" },
            { key: "description", label: "Description", render: r => <span className="line-clamp-1 max-w-xs text-xs">{r.description as string}</span> },
            { key: "status", label: "Status", render: r => <StatusBadge status={r.status as string} /> },
            { key: "_actions", label: "", render: r => (
              <div className="flex gap-1">
                {r.status === "OPEN" && <button onClick={() => { setResolveId(r.id as string); setResolution(""); }} className="rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100">Resolve</button>}
                {r.status === "RESOLVED" && <button onClick={() => setConfirmCloseId(r.id as string)} className="rounded border border-line px-2 py-1 text-xs hover:bg-field">Close</button>}
                <button onClick={() => setConfirmDeleteId(r.id as string)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"><Trash2 size={12} /></button>
              </div>
            )},
          ]}
          rows={rows as Record<string, any>[]}
          loading={loading}
          empty="No grievances found."
        />
        <ConfirmModal
          open={!!confirmCloseId}
          onClose={() => setConfirmCloseId(null)}
          onConfirm={confirmClose}
          title="Close Grievance"
          message="Close this grievance?"
          confirmLabel="Close"
          variant="danger"
          loading={closing}
        />
        <ConfirmModal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={confirmDelete}
          title="Delete Grievance"
          message="Delete this grievance record?"
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
        />
      </div>

  );
}

export function ProductivityReportPage() {
  const [data, setData] = useState<ProductivityData | null>(() => getCachedFirst<ApiEnvelope<ProductivityData>>("/hr/reports/productivity")?.data ?? null);
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
            <p className="text-sm text-ink/60">Period: {fmt(data.period.from)} — {fmt(data.period.to)} Â· {data.employees.length} employees</p>
            <DataTable
              columns={[
                { key: "employee", label: "Employee", render: (r) => r.employee?.fullName ?? "—" },
                { key: "code", label: "Code", render: (r) => r.employee?.code ?? "—" },
                { key: "role", label: "Role", render: (r) => r.employee?.employeeRole?.name ?? "—" },
                { key: "branch", label: "Branch", render: (r) => r.employee?.branch?.name ?? "—" },
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
    
  );
}

// ─── HR-F: Org Chart ─────────────────────────────────────────────────────────

type OrgNode = { id: string; fullName: string; managerId: string | null; photoUrl?: string; roleTitle?: string; branchName?: string };

function buildTree(nodes: OrgNode[]): OrgNode & { children: any[] } {
  const map = new Map(nodes.map((n) => [n.id, { ...n, children: [] as any[] }]));
  const roots: any[] = [];
  for (const n of map.values()) {
    if (n.managerId && map.has(n.managerId)) {
      map.get(n.managerId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return { id: "root", fullName: "", managerId: null, children: roots };
}

function OrgCard({ node }: { node: OrgNode & { children: any[] } }) {
  const initial = node.fullName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl border border-line bg-surface p-3 shadow-sm w-44 text-center">
        {node.photoUrl
          ? <img src={node.photoUrl} alt={node.fullName} className="w-10 h-10 rounded-full object-cover mx-auto mb-1" />
          : <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-sm font-bold text-brand mx-auto mb-1">{initial}</div>
        }
        <p className="text-xs font-semibold text-ink truncate">{node.fullName}</p>
        {node.roleTitle && <p className="text-[10px] text-ink/60 truncate">{node.roleTitle}</p>}
        {node.branchName && <p className="text-[10px] text-ink/50 truncate">{node.branchName}</p>}
      </div>
      {node.children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-line" />
          <div className="flex gap-6 items-start">
            {node.children.map((child: any) => (
              <OrgCard key={child.id} node={child} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgChartPage() {
  const [nodes, setNodes] = useState<OrgNode[]>(() => getCachedFirst<ApiEnvelope<OrgNode[]>>("/hr/org-chart")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/org-chart"));

  async function load() {
    const r = await apiFetch<ApiEnvelope<OrgNode[]>>("/hr/org-chart");
    setNodes(r.data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const tree = buildTree(nodes);

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Organisation Chart</h1>
          <span className="text-sm text-ink/60">{nodes.length} employees</span>
        </div>
        <HRNav />
        {loading && <p className="text-sm text-ink/50">Loading org chart…</p>}
        {!loading && nodes.length === 0 && <EmptyState icon={Users} title="No active employees found" />}
        {tree.children.length > 0 && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 items-start min-w-max">
              {tree.children.map((root: any) => (
                <OrgCard key={root.id} node={root} />
              ))}
            </div>
          </div>
        )}
      </div>
    
  );
}

// ─── HR-F: Training Catalog ───────────────────────────────────────────────────

type TrainingCourseRow = { id: string; code: string; title: string; category?: string; durationHours?: number; provider?: string; isActive: boolean };

export function TrainingCatalogPage() {
  const [rows, setRows] = useState<TrainingCourseRow[]>(() => getCachedFirst<ApiEnvelope<TrainingCourseRow[]>>("/hr/training-courses")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/training-courses"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", category: "", durationHours: "", provider: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function load() {
    const r = await apiFetch<ApiEnvelope<TrainingCourseRow[]>>("/hr/training-courses");
    const fresh = r.data ?? [];
    setRows(fresh.length === 0 && rows.length > 0 ? rows : fresh);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await apiFetch("/hr/training-courses", { method: "POST", body: JSON.stringify({ ...form, durationHours: form.durationHours ? Number(form.durationHours) : undefined, description: form.description || undefined }) });
      setForm({ code: "", title: "", category: "", durationHours: "", provider: "", description: "" });
      setShowForm(false);
      await load();
    } catch (err: any) { setError(err.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  async function toggleActive(row: TrainingCourseRow) {
    try {
      await apiFetch(`/hr/training-courses/${row.id}`, { method: "PUT", body: JSON.stringify({ isActive: !row.isActive }) });
      await load();
    } catch { /* noop */ }
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Training Catalog</h1>
          <button onClick={() => { setShowForm((p) => !p); setError(""); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Course"}</button>
        </div>
        <HRNav />

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <p className="font-semibold">New Training Course</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium">Code *</label><input required value={form.code} onChange={f("code")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium">Title *</label><input required value={form.title} onChange={f("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Category</label><input value={form.category} onChange={f("category")} placeholder="e.g. Safety" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Duration (hrs)</label><input type="number" step="0.5" min="0" value={form.durationHours} onChange={f("durationHours")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Provider</label><input value={form.provider} onChange={f("provider")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="sm:col-span-3"><label className="mb-1 block text-xs font-medium">Description</label><textarea value={form.description} onChange={f("description")} rows={2} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Course"}</button>
          </form>
        )}

        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "title", label: "Title" },
            { key: "category", label: "Category", render: (r) => r.category ?? "—" },
            { key: "durationHours", label: "Duration (hrs)", render: (r) => r.durationHours ?? "—" },
            { key: "provider", label: "Provider", render: (r) => r.provider ?? "—" },
            { key: "isActive", label: "Status", render: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} /> },
            { key: "actions", label: "", render: (r) => <button onClick={() => toggleActive(r)} className="text-xs text-ink/60 hover:text-ink">{r.isActive ? "Deactivate" : "Activate"}</button> },
          ]}
          rows={rows}
          empty={loading ? "Loading…" : "No training courses yet"}
        />
      </div>
    
  );
}

// ─── HR-G: Salary Bands ───────────────────────────────────────────────────────

type SalaryBandRow = { id: string; grade: string; minSalary: number; midSalary?: number; maxSalary: number; currency: string; effectiveDate: string; employeeRole?: { name: string } };

export function SalaryBandsPage() {
  const { opts } = useHROptions();
  const [rows, setRows] = useState<SalaryBandRow[]>(() => getCachedFirst<ApiEnvelope<SalaryBandRow[]>>("/hr/salary-bands")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/salary-bands"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ grade: "", employeeRoleId: "", minSalary: "", midSalary: "", maxSalary: "", effectiveDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function load() {
    const r = await apiFetch<ApiEnvelope<SalaryBandRow[]>>("/hr/salary-bands");
    const fresh = r.data ?? [];
    setRows(fresh.length === 0 && rows.length > 0 ? rows : fresh);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/salary-bands", { method: "POST", body: JSON.stringify({ ...form, employeeRoleId: form.employeeRoleId || undefined, minSalary: Number(form.minSalary), midSalary: form.midSalary ? Number(form.midSalary) : undefined, maxSalary: Number(form.maxSalary) }) });
      setForm({ grade: "", employeeRoleId: "", minSalary: "", midSalary: "", maxSalary: "", effectiveDate: "", notes: "" });
      setShowForm(false); await load();
    } catch (err: any) { setError(err.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Salary Bands</h1>
          <button onClick={() => { setShowForm((p) => !p); setError(""); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Band"}</button>
        </div>
        <HRNav />

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <p className="font-semibold">New Salary Band</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium">Grade *</label><input required value={form.grade} onChange={f("grade")} placeholder="e.g. L2" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Role</label>
                <select value={form.employeeRoleId} onChange={f("employeeRoleId")} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">— Any Role —</option>
                  {opts.employeeRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-xs font-medium">Effective Date *</label><input required type="date" value={form.effectiveDate} onChange={f("effectiveDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Min Salary (GHS) *</label><input required type="number" min="0" value={form.minSalary} onChange={f("minSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Mid Salary (GHS)</label><input type="number" min="0" value={form.midSalary} onChange={f("midSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Max Salary (GHS) *</label><input required type="number" min="0" value={form.maxSalary} onChange={f("maxSalary")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </form>
        )}

        <DataTable
          columns={[
            { key: "grade", label: "Grade" },
            { key: "role", label: "Role", render: (r) => r.employeeRole?.name ?? "—" },
            { key: "minSalary", label: "Min (GHS)", render: (r) => Number(r.minSalary).toLocaleString() },
            { key: "midSalary", label: "Mid (GHS)", render: (r) => r.midSalary ? Number(r.midSalary).toLocaleString() : "—" },
            { key: "maxSalary", label: "Max (GHS)", render: (r) => Number(r.maxSalary).toLocaleString() },
            { key: "effectiveDate", label: "Effective", render: (r) => r.effectiveDate?.slice(0, 10) },
          ]}
          rows={rows}
          empty={loading ? "Loading…" : "No salary bands yet"}
        />
      </div>
    
  );
}

// ─── HR-G: Recruitment ────────────────────────────────────────────────────────

const APP_STATUSES = ["RECEIVED", "SHORTLISTED", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];
type JobRow = { id: string; reference: string; title: string; status: string; department?: string; closingDate?: string };
type AppRow = { id: string; reference: string; applicantName: string; status: string; jobPostingId: string; interviewDate?: string; jobPosting?: { title: string } };

export function RecruitmentPage() {
  const [jobs, setJobs] = useState<JobRow[]>(() => getCachedFirst<ApiEnvelope<JobRow[]>>("/hr/job-postings")?.data ?? []);
  const [apps, setApps] = useState<AppRow[]>(() => getCachedFirst<ApiEnvelope<AppRow[]>>("/hr/applications")?.data ?? []);
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [jobForm, setJobForm] = useState({ title: "", department: "", description: "", requirements: "", closingDate: "" });
  const [appForm, setAppForm] = useState({ applicantName: "", applicantEmail: "", applicantPhone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmHireId, setConfirmHireId] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);
  const fj = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setJobForm((p) => ({ ...p, [k]: e.target.value }));
  const fa = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setAppForm((p) => ({ ...p, [k]: e.target.value }));

  async function load() {
    const [jr, ar] = await Promise.all([
      apiFetch<ApiEnvelope<JobRow[]>>("/hr/job-postings"),
      apiFetch<ApiEnvelope<AppRow[]>>("/hr/applications"),
    ]);
    setJobs(jr.data ?? []);
    setApps(ar.data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function saveJob(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/hr/job-postings", { method: "POST", body: JSON.stringify({ ...jobForm, closingDate: jobForm.closingDate || undefined }) });
      setJobForm({ title: "", department: "", description: "", requirements: "", closingDate: "" });
      setShowJobForm(false); await load();
    } catch (err: any) { setError(err.message ?? "Error"); }
    finally { setSaving(false); }
  }

  async function saveApp(e: React.FormEvent) {
    e.preventDefault(); if (!selectedJob) return; setSaving(true); setError("");
    try {
      await apiFetch(`/hr/job-postings/${selectedJob}/applications`, { method: "POST", body: JSON.stringify(appForm) });
      setAppForm({ applicantName: "", applicantEmail: "", applicantPhone: "" });
      setShowAppForm(false); await load();
    } catch (err: any) { setError(err.message ?? "Error"); }
    finally { setSaving(false); }
  }

  async function moveStatus(appId: string, status: string) {
    try { await apiFetch(`/hr/applications/${appId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); } catch { /* noop */ }
  }

  async function hire() {
    if (!confirmHireId) return;
    setHiring(true);
    try { await apiFetch(`/hr/applications/${confirmHireId}/hire`, { method: "POST" }); await load(); } catch (err: any) { alert(err.message); }
    finally { setHiring(false); setConfirmHireId(null); }
  }

  const filteredApps = selectedJob ? apps.filter((a) => a.jobPostingId === selectedJob) : apps;

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Recruitment</h1>
          <div className="flex gap-2">
            <button onClick={() => { setShowJobForm((p) => !p); setError(""); }} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field">+ Post Job</button>
            {selectedJob && <button onClick={() => { setShowAppForm((p) => !p); setError(""); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">+ Add Application</button>}
          </div>
        </div>
        <HRNav />
        {error && <p className="text-sm text-red-600">{error}</p>}

        {showJobForm && (
          <form onSubmit={saveJob} className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <p className="font-semibold">New Job Posting</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Job Title *</label><input required value={jobForm.title} onChange={fj("title")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Department</label><input value={jobForm.department} onChange={fj("department")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Closing Date</label><input type="date" value={jobForm.closingDate} onChange={fj("closingDate")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="mb-1 block text-xs font-medium">Description *</label><textarea required value={jobForm.description} onChange={fj("description")} rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Post Job"}</button>
          </form>
        )}

        {showAppForm && selectedJob && (
          <form onSubmit={saveApp} className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <p className="font-semibold">New Application</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><label className="mb-1 block text-xs font-medium">Name *</label><input required value={appForm.applicantName} onChange={fa("applicantName")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Email</label><input type="email" value={appForm.applicantEmail} onChange={fa("applicantEmail")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Phone</label><input value={appForm.applicantPhone} onChange={fa("applicantPhone")} className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            </div>
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Submit"}</button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Job Postings ({jobs.length})</p>
            {jobs.map((j) => (
              <button key={j.id} onClick={() => setSelectedJob(j.id === selectedJob ? "" : j.id)} className={`w-full rounded-lg border p-3 text-left text-sm hover:border-brand/40 transition-colors ${selectedJob === j.id ? "border-brand bg-brand/5" : "border-line bg-surface"}`}>
                <p className="font-medium">{j.title}</p>
                <p className="text-xs text-ink/60">{j.reference} · <StatusBadge status={j.status} /></p>
              </button>
            ))}
            {jobs.length === 0 && <p className="text-sm text-ink/50">No postings</p>}
          </div>

          <div className="lg:col-span-2">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {APP_STATUSES.map((s) => {
                const col = filteredApps.filter((a) => a.status === s);
                return (
                  <div key={s} className="min-w-44 flex-shrink-0 space-y-2">
                    <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide">{s} ({col.length})</p>
                    {col.map((a) => (
                      <div key={a.id} className="rounded-lg border border-line bg-surface p-3 space-y-1">
                        <p className="text-sm font-medium">{a.applicantName}</p>
                        <p className="text-xs text-ink/50">{a.reference}</p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {APP_STATUSES.filter((st) => st !== a.status && st !== "HIRED").map((st) => (
                            <button key={st} onClick={() => moveStatus(a.id, st)} className="rounded px-2 py-0.5 text-[10px] font-medium border border-line hover:bg-field">{st}</button>
                          ))}
                          {a.status !== "HIRED" && <button onClick={() => setConfirmHireId(a.id)} className="rounded px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-300 hover:bg-green-50">Hire</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <ConfirmModal
          open={!!confirmHireId}
          onClose={() => setConfirmHireId(null)}
          onConfirm={hire}
          title="Hire Applicant"
          message="Create an Employee record from this applicant?"
          confirmLabel="Create"
          variant="primary"
          loading={hiring}
        />
      </div>

  );
}

// ─── HR-G: Onboarding ─────────────────────────────────────────────────────────

type OnboardingItem = { id: string; title: string; completedAt?: string; dueDate?: string; sortOrder: number };

export function OnboardingPage() {
  const { opts } = useHROptions();
  const [employeeId, setEmployeeId] = useState("");
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  async function loadItems(eid: string) {
    if (!eid) return;
    setLoading(true);
    const r = await apiFetch<ApiEnvelope<OnboardingItem[]>>(`/hr/employees/${eid}/onboarding`);
    setItems(r.data ?? []);
    setLoading(false);
  }

  function handleEmployeeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setEmployeeId(id);
    void loadItems(id);
  }

  async function applyTemplate() {
    if (!employeeId) return;
    setApplyingTemplate(true);
    try { await apiFetch(`/hr/employees/${employeeId}/onboarding/template`, { method: "POST" }); await loadItems(employeeId); }
    catch { /* noop */ }
    finally { setApplyingTemplate(false); setConfirmTemplate(false); }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault(); if (!newTitle.trim() || !employeeId) return;
    setSaving(true);
    try { await apiFetch(`/hr/employees/${employeeId}/onboarding`, { method: "POST", body: JSON.stringify({ title: newTitle.trim() }) }); setNewTitle(""); await loadItems(employeeId); }
    catch { /* noop */ }
    finally { setSaving(false); }
  }

  async function toggleComplete(item: OnboardingItem) {
    if (item.completedAt) return;
    try { await apiFetch(`/hr/onboarding/${item.id}/complete`, { method: "PATCH" }); await loadItems(employeeId); } catch { /* noop */ }
  }

  const done = items.filter((i) => i.completedAt).length;

  return (
    
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Onboarding Checklists</h1>
        <HRNav />

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-ink/70">Select Employee</label>
            <select value={employeeId} onChange={handleEmployeeChange} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">— Pick an employee —</option>
              {opts.employees.map((e: any) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}
            </select>
          </div>
          {employeeId && <button onClick={() => setConfirmTemplate(true)} disabled={saving} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field disabled:opacity-50">Load Template</button>}
        </div>

        {employeeId && (
          <>
            {items.length > 0 && <div className="text-sm text-ink/70">{done}/{items.length} completed</div>}
            <form onSubmit={addItem} className="flex gap-2">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add checklist item…" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
              <button type="submit" disabled={saving || !newTitle.trim()} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
            </form>

            {loading && <p className="text-sm text-ink/50">Loading…</p>}
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 rounded-lg border p-3 ${item.completedAt ? "border-green-200 bg-green-50" : "border-line bg-surface"}`}>
                  <button onClick={() => toggleComplete(item)} className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${item.completedAt ? "bg-green-500 border-green-500 text-white" : "border-line hover:border-brand"}`}>
                    {item.completedAt && <span className="text-xs">✓</span>}
                  </button>
                  <p className={`flex-1 text-sm ${item.completedAt ? "line-through text-ink/50" : "text-ink"}`}>{item.title}</p>
                  {item.dueDate && <span className="text-xs text-ink/50">Due {item.dueDate.slice(0, 10)}</span>}
                </div>
              ))}
              {!loading && items.length === 0 && (
                <EmptyState icon={ClipboardList} title="No checklist items yet" description='Click "Load Template" to start.' />
              )}
            </div>
          </>
        )}
        <ConfirmModal
          open={confirmTemplate}
          onClose={() => setConfirmTemplate(false)}
          onConfirm={applyTemplate}
          title="Load Template"
          message="Load 10 standard onboarding items?"
          confirmLabel="Load"
          variant="primary"
          loading={applyingTemplate}
        />
      </div>

  );
}

// ─── HR-H: Approval Workflows ─────────────────────────────────────────────────

type ApprovalChainRow = { id: string; entityType: string; minAmount?: number; steps: any[]; isActive: boolean };

export function ApprovalWorkflowPage() {
  const [chains, setChains] = useState<ApprovalChainRow[]>(() => getCachedFirst<ApiEnvelope<ApprovalChainRow[]>>("/hr/approval-chains")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/approval-chains"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entityType: "", minAmount: "", steps: "[{\"role\":\"HR_MANAGE\",\"label\":\"HR Manager\"}]" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function load() {
    const r = await apiFetch<ApiEnvelope<ApprovalChainRow[]>>("/hr/approval-chains");
    setChains(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      let steps: object[];
      try { steps = JSON.parse(form.steps); } catch { setError("Steps must be valid JSON array"); setSaving(false); return; }
      await apiFetch("/hr/approval-chains", { method: "POST", body: JSON.stringify({ entityType: form.entityType, minAmount: form.minAmount ? Number(form.minAmount) : undefined, steps }) });
      setForm({ entityType: "", minAmount: "", steps: "[{\"role\":\"HR_MANAGE\",\"label\":\"HR Manager\"}]" });
      setShowForm(false); await load();
    } catch (err: any) { setError(err.message ?? "Error"); }
    finally { setSaving(false); }
  }

  return (
    
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Approval Workflows</h1>
          <button onClick={() => { setShowForm((p) => !p); setError(""); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Add Chain"}</button>
        </div>
        <HRNav />

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-surface p-5 space-y-4">
            <p className="font-semibold">New Approval Chain</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Entity Type *</label><input required value={form.entityType} onChange={f("entityType")} placeholder="e.g. LEAVE, PAYROLL" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-medium">Min Amount (GHS)</label><input type="number" min="0" value={form.minAmount} onChange={f("minAmount")} placeholder="Optional threshold" className="w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="mb-1 block text-xs font-medium">Steps (JSON array) *</label><textarea required value={form.steps} onChange={f("steps")} rows={3} className="w-full rounded-md border border-line px-3 py-2 text-sm font-mono text-xs" /></div>
            </div>
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </form>
        )}

        {loading && <p className="text-sm text-ink/50">Loading…</p>}
        <div className="space-y-3">
          {chains.map((c) => (
            <div key={c.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold">{c.entityType}</p>
                <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
              </div>
              {c.minAmount && <p className="text-xs text-ink/60 mb-2">Threshold: GHS {Number(c.minAmount).toLocaleString()}</p>}
              <div className="flex gap-2 flex-wrap">
                {(c.steps ?? []).map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">{step.label ?? step.role ?? `Step ${i + 1}`}</span>
                    {i < (c.steps ?? []).length - 1 && <span className="text-ink/30 text-xs">→</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!loading && chains.length === 0 && <EmptyState icon={ClipboardList} title="No approval chains configured yet" />}
        </div>
      </div>
    
  );
}

// ─── HR-H: Compliance Reports ─────────────────────────────────────────────────

type ComplianceReportRow = { id: string; reportType: string; period: string; createdAt: string };

export function ComplianceReportPage() {
  const [reports, setReports] = useState<ComplianceReportRow[]>(() => getCachedFirst<ApiEnvelope<ComplianceReportRow[]>>("/hr/compliance/reports")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/hr/compliance/reports"));
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    const r = await apiFetch<ApiEnvelope<ComplianceReportRow[]>>("/hr/compliance/reports");
    setReports(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function generate(type: "ssnit" | "paye" | "headcount") {
    setGenerating(type); setError(""); setResult(null);
    try {
      const r = await apiFetch<ApiEnvelope<any>>(`/hr/compliance/${type}`, { method: "POST", body: JSON.stringify({ period }) });
      setResult({ type, ...r.data });
      await load();
    } catch (err: any) { setError(err.message ?? "Error generating report"); }
    finally { setGenerating(""); }
  }

  return (
    
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Compliance Reports</h1>
        <HRNav />

        <div className="rounded-lg border border-line bg-surface p-5 space-y-4">
          <p className="font-semibold">Generate Report</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="mb-1 block text-xs font-medium">Period (YYYY-MM)</label>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-01" className="rounded-md border border-line px-3 py-2 text-sm w-40" />
            </div>
            <button onClick={() => generate("ssnit")} disabled={!!generating || !period} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field disabled:opacity-50">{generating === "ssnit" ? "Generating…" : "SSNIT Report"}</button>
            <button onClick={() => generate("paye")} disabled={!!generating || !period} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field disabled:opacity-50">{generating === "paye" ? "Generating…" : "PAYE Report"}</button>
            <button onClick={() => generate("headcount")} disabled={!!generating || !period} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-field disabled:opacity-50">{generating === "headcount" ? "Generating…" : "Headcount Report"}</button>
          </div>

          {result && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm space-y-1">
              <p className="font-semibold text-green-800 capitalize">{result.type} Report Generated — {result.report?.period}</p>
              {result.totalEmployees !== undefined && <p>Employees: <strong>{result.totalEmployees}</strong></p>}
              {result.totalEmployeeSsnit !== undefined && <p>Total Employee SSNIT: <strong>GHS {Number(result.totalEmployeeSsnit).toFixed(2)}</strong></p>}
              {result.totalEmployerSsnit !== undefined && <p>Total Employer SSNIT: <strong>GHS {Number(result.totalEmployerSsnit).toFixed(2)}</strong></p>}
              {result.totalPaye !== undefined && <p>Total PAYE: <strong>GHS {Number(result.totalPaye).toFixed(2)}</strong></p>}
              {result.total !== undefined && <p>Total Headcount: <strong>{result.total}</strong></p>}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Generated Reports ({reports.length})</p>
          <DataTable
            columns={[
              { key: "reportType", label: "Type" },
              { key: "period", label: "Period" },
              { key: "createdAt", label: "Generated", render: (r) => r.createdAt?.slice(0, 16).replace("T", " ") },
            ]}
            rows={reports}
            empty={loading ? "Loading…" : "No reports generated yet"}
          />
        </div>
      </div>
    
  );
}
