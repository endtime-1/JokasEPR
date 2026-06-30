"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  AlertTriangle, BarChart2, Building2, ChevronRight,
  ClipboardList, Clock, DollarSign, FileText, Package, Plus,
  ShoppingCart, Star, Tag, Wallet,
  type LucideIcon,
} from "lucide-react";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(d?: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Design system ───────────────────────────────────────────────────────────

const inputCls =
  "min-h-10 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10 placeholder:text-ink/30";
const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45";

function FormLabel({ children }: { children: React.ReactNode }) {
  return <label className={labelCls}>{children}</label>;
}

function PageHero({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field px-7 py-6 shadow-panel">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 70% 50%, #f58220 0%, transparent 60%)" }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          {kicker && <p className="app-kicker mb-1">{kicker}</p>}
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink/55">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

type KpiColor = "blue" | "emerald" | "amber" | "red" | "purple" | "brand" | "indigo";
const KPI_STYLES: Record<KpiColor, { wrap: string; icon: string; dot: string }> = {
  blue:    { wrap: "from-blue-50",    icon: "bg-blue-100 text-blue-600",       dot: "bg-blue-500" },
  emerald: { wrap: "from-emerald-50", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-500" },
  amber:   { wrap: "from-amber-50",   icon: "bg-amber-100 text-amber-600",     dot: "bg-amber-500" },
  red:     { wrap: "from-red-50",     icon: "bg-red-100 text-red-600",         dot: "bg-red-500" },
  purple:  { wrap: "from-purple-50",  icon: "bg-purple-100 text-purple-600",   dot: "bg-purple-500" },
  brand:   { wrap: "from-orange-50",  icon: "bg-orange-100 text-brand",        dot: "bg-brand" },
  indigo:  { wrap: "from-indigo-50",  icon: "bg-indigo-100 text-indigo-600",   dot: "bg-indigo-500" },
};

function KpiCard({
  label, value, Icon, color = "blue", sub,
}: {
  label: string; value: string | number; Icon: LucideIcon; color?: KpiColor; sub?: string;
}) {
  const s = KPI_STYLES[color];
  return (
    <div className={`rounded-2xl border border-line bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl p-2.5 ${s.icon}`}><Icon className="h-5 w-5" /></div>
        <div className={`mt-1 h-2 w-2 rounded-full ${s.dot}`} />
      </div>
      <p className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
      {sub && <p className="mt-1 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT:              "border-gray-200 bg-gray-50 text-gray-600",
    SUBMITTED:          "border-blue-200 bg-blue-50 text-blue-700",
    APPROVED:           "border-emerald-200 bg-emerald-50 text-emerald-700",
    REJECTED:           "border-red-200 bg-red-50 text-red-700",
    CANCELLED:          "border-red-200 bg-red-50 text-red-700",
    CONVERTED_TO_PO:    "border-purple-200 bg-purple-50 text-purple-700",
    PENDING_APPROVAL:   "border-amber-200 bg-amber-50 text-amber-700",
    SENT_TO_SUPPLIER:   "border-indigo-200 bg-indigo-50 text-indigo-700",
    PARTIALLY_RECEIVED: "border-orange-200 bg-orange-50 text-orange-700",
    FULLY_RECEIVED:     "border-emerald-200 bg-emerald-50 text-emerald-700",
    RECEIVED:           "border-blue-200 bg-blue-50 text-blue-700",
    QUALITY_HOLD:       "border-amber-200 bg-amber-50 text-amber-700",
    QUALITY_PASSED:     "border-emerald-200 bg-emerald-50 text-emerald-700",
    QUALITY_FAILED:     "border-red-200 bg-red-50 text-red-700",
    POSTED:             "border-slate-600 bg-slate-700 text-white",
    ACTIVE:             "border-emerald-200 bg-emerald-50 text-emerald-700",
    INACTIVE:           "border-gray-200 bg-gray-50 text-gray-500",
    BLACKLISTED:        "border-red-300 bg-red-100 text-red-800",
    UNDER_REVIEW:       "border-amber-200 bg-amber-50 text-amber-700",
    PENDING:            "border-amber-200 bg-amber-50 text-amber-700",
    MATCHED:            "border-blue-200 bg-blue-50 text-blue-700",
    PAID:               "border-emerald-200 bg-emerald-50 text-emerald-700",
    DISPUTED:           "border-red-200 bg-red-50 text-red-700",
    OVERDUE:            "border-red-300 bg-red-100 text-red-800",
    EXCELLENT:          "border-emerald-200 bg-emerald-50 text-emerald-700",
    GOOD:               "border-teal-200 bg-teal-50 text-teal-700",
    SATISFACTORY:       "border-blue-200 bg-blue-50 text-blue-700",
    POOR:               "border-orange-200 bg-orange-50 text-orange-700",
    UNACCEPTABLE:       "border-red-200 bg-red-50 text-red-700",
  };
  const cls = map[status] ?? "border-gray-200 bg-gray-50 text-gray-600";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const procurementNavLinks = [
  { href: "/procurement",                     label: "Dashboard",    Icon: BarChart2 },
  { href: "/procurement/suppliers",           label: "Suppliers",    Icon: Building2 },
  { href: "/procurement/supplier-categories", label: "Categories",   Icon: Tag },
  { href: "/procurement/purchase-requests",   label: "Requests",     Icon: ClipboardList },
  { href: "/procurement/purchase-orders",     label: "Orders",       Icon: ShoppingCart },
  { href: "/procurement/grns",                label: "GRNs",         Icon: Package },
  { href: "/procurement/invoices",            label: "Invoices",     Icon: FileText },
  { href: "/procurement/payments",            label: "Payments",     Icon: Wallet },
  { href: "/procurement/performance",         label: "Performance",  Icon: Star },
  { href: "/procurement/price-history",       label: "Price History", Icon: DollarSign },
];

function ProcurementNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1.5">
      {procurementNavLinks.map((n) => {
        const active =
          pathname === n.href ||
          (n.href !== "/procurement" && pathname.startsWith(n.href));
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-line bg-white text-ink/60 hover:border-brand/20 hover:bg-field hover:text-ink"
            }`}
          >
            <n.Icon className="h-3.5 w-3.5" />
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Options hook ─────────────────────────────────────────────────────────────

type ProcurementOptions = {
  branches: { id: string; name: string; code: string }[];
  warehouses: { id: string; name: string; code: string }[];
  suppliers: { id: string; name: string; code: string }[];
  supplierCategories: { id: string; name: string; code: string }[];
  bankAccounts: { id: string; accountName: string; bankName: string }[];
};

function useProcurementOptions() {
  const [opts, setOpts] = useState<ProcurementOptions>({
    branches: [],
    warehouses: [],
    suppliers: [],
    supplierCategories: [],
    bankAccounts: [],
  });
  useEffect(() => {
    apiFetch<ApiEnvelope<ProcurementOptions>>("/procurement/options")
      .then((r) => setOpts(r.data))
      .catch(() => undefined);
  }, []);
  return opts;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type SystemAlert = { id: string; title: string; message: string; severity: string; occurredAt: string };

type DashData = {
  activeSuppliers: number;
  pendingPRs: number;
  pendingPOs: number;
  pendingQualityGRNs: number;
  openInvoiceCount: number;
  openInvoiceBalance: number;
  systemAlerts: SystemAlert[];
  recentPOs: Array<{
    id: string;
    reference: string;
    status: string;
    totalAmount: number;
    orderDate: string;
    supplier: { name: string };
  }>;
  recentGRNs: Array<{
    id: string;
    reference: string;
    status: string;
    receivedDate: string;
    supplier: { name: string };
    warehouse: { name: string };
  }>;
};

export function ProcurementDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    setLoading(true);
    apiFetch<ApiEnvelope<DashData>>("/procurement/dashboard")
      .then((r) => setData(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const quickLinks = [
    { href: "/procurement/purchase-requests/create", label: "New Request",  Icon: ClipboardList, cls: "border-brand/20 bg-brand/5 text-brand hover:bg-brand/10" },
    { href: "/procurement/purchase-orders/create",   label: "New PO",       Icon: ShoppingCart,  cls: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
    { href: "/procurement/grns/create",              label: "Record GRN",   Icon: Package,       cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { href: "/procurement/suppliers/create",         label: "Add Supplier", Icon: Building2,     cls: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { href: "/procurement/invoices",                 label: "Invoices",     Icon: FileText,      cls: "border-line bg-white text-ink/70 hover:bg-field" },
    { href: "/procurement/payments",                 label: "Payments",     Icon: Wallet,        cls: "border-line bg-white text-ink/70 hover:bg-field" },
  ];

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Purchasing & Suppliers"
          subtitle={today}
          actions={
            <Link href="/procurement/purchase-requests/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> New Purchase Request
            </Link>
          }
        />

        <ProcurementNav />

        {data && (data.systemAlerts ?? []).length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white shadow-card">
            <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-bold text-amber-800">
                {data.systemAlerts.length} procurement alert{data.systemAlerts.length > 1 ? "s" : ""} require attention
              </span>
            </div>
            <div className="divide-y divide-amber-50">
              {data.systemAlerts.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <p className="text-sm font-bold text-ink">{a.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink/65">{a.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {data && data.pendingPRs > 0 && (
          <div className="flex items-center justify-between rounded-xl border-l-[3px] border-amber-400 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                <span className="font-bold">{data.pendingPRs}</span> purchase{" "}
                {data.pendingPRs === 1 ? "request" : "requests"} awaiting approval
              </p>
            </div>
            <Link href="/procurement/purchase-requests" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Review
            </Link>
          </div>
        )}

        {data && data.pendingQualityGRNs > 0 && (
          <div className="flex items-center justify-between rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-medium text-red-800">
                <span className="font-bold">{data.pendingQualityGRNs}</span>{" "}
                GRN{data.pendingQualityGRNs !== 1 ? "s" : ""} on quality hold — requires inspection
              </p>
            </div>
            <Link href="/procurement/grns" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Inspect
            </Link>
          </div>
        )}

        {data && data.openInvoiceBalance > 0 && (
          <div className="flex items-center justify-between rounded-xl border-l-[3px] border-indigo-400 bg-indigo-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
              <p className="text-sm font-medium text-indigo-800">
                <span className="font-bold">{money(data.openInvoiceBalance)}</span> in open payables across{" "}
                {data.openInvoiceCount} {data.openInvoiceCount === 1 ? "invoice" : "invoices"}
              </p>
            </div>
            <Link href="/procurement/invoices" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              View
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-line bg-white p-5 shadow-card">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-line" />
                <div className="mt-4 h-7 w-20 animate-pulse rounded bg-line" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-line" />
              </div>
            ))
          ) : data ? (
            <>
              <KpiCard label="Active Suppliers" value={data.activeSuppliers}           Icon={Building2}     color="emerald" />
              <KpiCard label="Pending Requests" value={data.pendingPRs}                Icon={ClipboardList} color="amber"   sub="awaiting approval" />
              <KpiCard label="Pending POs"      value={data.pendingPOs}                Icon={ShoppingCart}  color="blue"    sub="awaiting approval" />
              <KpiCard label="Quality Holds"    value={data.pendingQualityGRNs}        Icon={AlertTriangle} color="red"     sub="GRNs on hold" />
              <KpiCard label="Open Invoices"    value={data.openInvoiceCount}          Icon={FileText}      color="indigo"  />
              <KpiCard label="Payables Due"     value={money(data.openInvoiceBalance)} Icon={Wallet}        color="brand"   />
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {quickLinks.map((ql) => (
            <Link
              key={ql.href}
              href={ql.href}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center text-xs font-semibold transition-colors ${ql.cls}`}
            >
              <ql.Icon className="h-4 w-4" />
              {ql.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Recent Purchase Orders</h2>
              <Link href="/procurement/purchase-orders" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                All POs <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {loading ? (
              <div className="divide-y divide-line">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="h-9 w-9 animate-pulse rounded-xl bg-line" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded bg-line" />
                      <div className="h-2.5 w-40 animate-pulse rounded bg-line" />
                    </div>
                    <div className="h-3 w-16 animate-pulse rounded bg-line" />
                  </div>
                ))}
              </div>
            ) : data?.recentPOs.length ? (
              <div className="divide-y divide-line">
                {data.recentPOs.map((po) => (
                  <div key={po.id} className="flex items-center gap-3 px-5 py-4 hover:bg-field/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{po.reference}</p>
                      <p className="truncate text-xs text-ink/50">
                        {po.supplier?.name} · {fmt(po.orderDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{money(po.totalAmount)}</p>
                      <StatusBadge status={po.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-ink/40">
                <ShoppingCart className="mb-2 h-8 w-8" />
                <p className="text-sm">No purchase orders yet</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Recent GRNs</h2>
              <Link href="/procurement/grns" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                All GRNs <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {loading ? (
              <div className="divide-y divide-line">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div className="h-9 w-9 animate-pulse rounded-xl bg-line" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded bg-line" />
                      <div className="h-2.5 w-40 animate-pulse rounded bg-line" />
                    </div>
                    <div className="h-3 w-16 animate-pulse rounded bg-line" />
                  </div>
                ))}
              </div>
            ) : data?.recentGRNs.length ? (
              <div className="divide-y divide-line">
                {data.recentGRNs.map((grn) => (
                  <div key={grn.id} className="flex items-center gap-3 px-5 py-4 hover:bg-field/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{grn.reference}</p>
                      <p className="truncate text-xs text-ink/50">
                        {grn.supplier?.name} → {grn.warehouse?.name} · {fmt(grn.receivedDate)}
                      </p>
                    </div>
                    <StatusBadge status={grn.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-ink/40">
                <Package className="mb-2 h-8 w-8" />
                <p className="text-sm">No GRNs yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Suppliers List ───────────────────────────────────────────────────────────

type Supplier = {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  status: string;
  rating?: number;
  category?: { name: string };
};

export function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    apiFetch<ApiEnvelope<Supplier[]>>(`/procurement/suppliers${q}`)
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }, [search]);

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Suppliers"
          subtitle="Manage your vendor and supplier directory"
          actions={
            <Link href="/procurement/suppliers/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> Add Supplier
            </Link>
          }
        />
        <ProcurementNav />
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="w-72 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
          />
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "code", label: "Code" },
              {
                key: "name",
                label: "Supplier",
                render: (r) => (
                  <Link href={`/procurement/suppliers/${r.id}`} className="font-semibold text-brand hover:underline">
                    {r.name as string}
                  </Link>
                ),
              },
              { key: "category", label: "Category", render: (r) => (r.category as Supplier["category"])?.name ?? "—" },
              { key: "contactPerson", label: "Contact" },
              { key: "phone", label: "Phone" },
              {
                key: "rating",
                label: "Rating",
                render: (r) => (r.rating ? `${(Number(r.rating) * 100).toFixed(0)}%` : "—"),
              },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No suppliers found"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Create Supplier ─────────────────────────────────────────────────────────

export function CreateSupplierPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({
    code: "", name: "", contactPerson: "", phone: "", email: "",
    address: "", categoryId: "", paymentTerms: "", currency: "GHS",
    taxNumber: "", status: "ACTIVE", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/suppliers", {
        method: "POST",
        body: JSON.stringify({ ...form, categoryId: form.categoryId || undefined }),
      });
      router.push("/procurement/suppliers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Add Supplier"
          subtitle="Register a new vendor or supplier"
          actions={
            <Link href="/procurement/suppliers" className="app-button-secondary">
              Cancel
            </Link>
          }
        />
        <ProcurementNav />
        {error && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Supplier Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Code *</FormLabel>
                <input required value={form.code} onChange={f("code")} className={inputCls} placeholder="e.g. SUP-001" />
              </div>
              <div className="sm:col-span-2">
                <FormLabel>Supplier Name *</FormLabel>
                <input required value={form.name} onChange={f("name")} className={inputCls} placeholder="Full legal name" />
              </div>
              <div>
                <FormLabel>Category</FormLabel>
                <select value={form.categoryId} onChange={f("categoryId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.supplierCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Status</FormLabel>
                <select value={form.status} onChange={f("status")} className={inputCls}>
                  {["ACTIVE", "INACTIVE", "UNDER_REVIEW", "BLACKLISTED"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Currency</FormLabel>
                <select value={form.currency} onChange={f("currency")} className={inputCls}>
                  {["GHS", "USD", "EUR", "GBP"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Contact Person</FormLabel>
                <input value={form.contactPerson} onChange={f("contactPerson")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Phone</FormLabel>
                <input value={form.phone} onChange={f("phone")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Email</FormLabel>
                <input type="email" value={form.email} onChange={f("email")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Tax Number</FormLabel>
                <input value={form.taxNumber} onChange={f("taxNumber")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Terms</FormLabel>
                <input value={form.paymentTerms} onChange={f("paymentTerms")} className={inputCls} placeholder="e.g. Net 30" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Address</FormLabel>
                <input value={form.address} onChange={f("address")} className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Notes</FormLabel>
                <textarea value={form.notes} onChange={f("notes")} rows={3} className={inputCls} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving} className="app-button-primary">
              {saving ? "Saving..." : "Save Supplier"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

// ─── Supplier Categories ─────────────────────────────────────────────────────

type SupplierCategory = { id: string; code: string; name: string; description?: string };

export function SupplierCategoriesPage() {
  const [rows, setRows] = useState<SupplierCategory[]>([]);
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<SupplierCategory[]>>("/procurement/supplier-categories")
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/supplier-categories", { method: "POST", body: JSON.stringify(form) });
      setForm({ code: "", name: "", description: "" });
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
        <PageHero
          kicker="Procurement"
          title="Supplier Categories"
          subtitle="Classify and group your suppliers"
        />
        <ProcurementNav />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">New Category</h2>
            {error && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <FormLabel>Code *</FormLabel>
                <input required value={form.code} onChange={f("code")} className={inputCls} placeholder="e.g. RAW" />
              </div>
              <div>
                <FormLabel>Name *</FormLabel>
                <input required value={form.name} onChange={f("name")} className={inputCls} placeholder="Category name" />
              </div>
              <div>
                <FormLabel>Description</FormLabel>
                <textarea value={form.description} onChange={f("description")} rows={3} className={inputCls} />
              </div>
              <button type="submit" disabled={saving} className="app-button-primary w-full justify-center">
                {saving ? "Saving..." : "Create Category"}
              </button>
            </form>
          </div>
          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <DataTable
              columns={[
                { key: "code", label: "Code" },
                { key: "name", label: "Name" },
                { key: "description", label: "Description" },
              ]}
              rows={rows as Record<string, unknown>[]}
              empty="No categories yet"
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Purchase Requests ────────────────────────────────────────────────────────

type PurchaseRequest = {
  id: string;
  reference: string;
  status: string;
  notes?: string;
  requiredDate?: string;
  createdAt: string;
  branch?: { name: string };
  items?: unknown[];
};

export function PurchaseRequestsPage() {
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<PurchaseRequest[]>>(`/procurement/purchase-requests${q}`)
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function act(id: string, path: string) {
    setBusy(id);
    setActionErr("");
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const statuses = ["", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CONVERTED_TO_PO"];

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Purchase Requests"
          subtitle="Internal requests for new purchases"
          actions={
            <Link href="/procurement/purchase-requests/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> New Request
            </Link>
          }
        />
        <ProcurementNav />
        {actionErr && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {actionErr}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-line bg-white text-ink/60 hover:bg-field"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "reference", label: "Reference" },
              { key: "branch", label: "Branch", render: (r) => (r.branch as PurchaseRequest["branch"])?.name ?? "—" },
              { key: "requiredDate", label: "Required By", render: (r) => fmt(r.requiredDate as string) },
              { key: "createdAt", label: "Created", render: (r) => fmt(r.createdAt as string) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    {r.status === "DRAFT" && (
                      <button
                        onClick={() => act(r.id as string, `/procurement/purchase-requests/${r.id}/submit`)}
                        disabled={busy === r.id}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                      >
                        {busy === r.id ? "…" : "Submit"}
                      </button>
                    )}
                    {r.status === "SUBMITTED" && (
                      <>
                        <button
                          onClick={() => act(r.id as string, `/procurement/purchase-requests/${r.id}/approve`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          {busy === r.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => act(r.id as string, `/procurement/purchase-requests/${r.id}/reject`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No purchase requests yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Create Purchase Request ──────────────────────────────────────────────────

type PRItem = { description: string; quantity: string; unit: string; estimatedUnitPrice: string };

export function CreatePurchaseRequestPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({ branchId: "", requiredDate: "", notes: "" });
  const [items, setItems] = useState<PRItem[]>([{ description: "", quantity: "1", unit: "PCS", estimatedUnitPrice: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof PRItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { description: "", quantity: "1", unit: "PCS", estimatedUnitPrice: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.estimatedUnitPrice || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || undefined,
          requiredDate: form.requiredDate || undefined,
          items: items.map((it) => ({
            description: it.description,
            quantity: Number(it.quantity),
            unit: it.unit,
            estimatedUnitPrice: it.estimatedUnitPrice ? Number(it.estimatedUnitPrice) : undefined,
          })),
        }),
      });
      router.push("/procurement/purchase-requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="New Purchase Request"
          subtitle="Request items or services for procurement"
          actions={<Link href="/procurement/purchase-requests" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {error && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Request Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <FormLabel>Branch</FormLabel>
                <select value={form.branchId} onChange={f("branchId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Required By</FormLabel>
                <input type="date" value={form.requiredDate} onChange={f("requiredDate")} className={inputCls} />
              </div>
              <div className="sm:col-span-3">
                <FormLabel>Notes</FormLabel>
                <textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Items</h2>
              <button type="button" onClick={addItem} className="app-button-secondary py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>
            <div className="divide-y divide-line">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4">
                  <div className="col-span-12 sm:col-span-5">
                    <FormLabel>Description *</FormLabel>
                    <input required value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Qty *</FormLabel>
                    <input required type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Est. Price</FormLabel>
                    <input type="number" min={0} step={0.01} value={it.estimatedUnitPrice} onChange={(e) => setItem(i, "estimatedUnitPrice", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-12 flex items-end sm:col-span-1">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="mb-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2.5 text-red-600 hover:bg-red-100">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-line px-6 py-4">
              <div className="text-right">
                <p className="text-xs text-ink/45 uppercase font-bold tracking-wide">Estimated Total</p>
                <p className="text-xl font-extrabold text-ink">{money(subtotal)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="app-button-primary">
              {saving ? "Saving..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

type PurchaseOrder = {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  expectedDeliveryDate?: string;
  supplier?: { name: string };
};

export function PurchaseOrdersPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<PurchaseOrder[]>>(`/procurement/purchase-orders${q}`)
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function act(id: string, path: string) {
    setBusy(id);
    setActionErr("");
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const statuses = ["", "DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "REJECTED"];

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Purchase Orders"
          subtitle="Formal orders raised to suppliers"
          actions={
            <Link href="/procurement/purchase-orders/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> New PO
            </Link>
          }
        />
        <ProcurementNav />
        {actionErr && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {actionErr}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-line bg-white text-ink/60 hover:bg-field"
              }`}
            >
              {s ? s.replace(/_/g, " ") : "All"}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "reference", label: "Reference" },
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as PurchaseOrder["supplier"])?.name ?? "—" },
              { key: "orderDate", label: "Order Date", render: (r) => fmt(r.orderDate as string) },
              { key: "expectedDeliveryDate", label: "Expected", render: (r) => fmt(r.expectedDeliveryDate as string) },
              { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    {r.status === "PENDING_APPROVAL" && (
                      <>
                        <button
                          onClick={() => act(r.id as string, `/procurement/purchase-orders/${r.id}/approve`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          {busy === r.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => act(r.id as string, `/procurement/purchase-orders/${r.id}/reject`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "APPROVED" && (
                      <button
                        onClick={() => act(r.id as string, `/procurement/purchase-orders/${r.id}/send`)}
                        disabled={busy === r.id}
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                      >
                        {busy === r.id ? "…" : "Send to Supplier"}
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No purchase orders yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Create Purchase Order ────────────────────────────────────────────────────

type POItem = { description: string; quantity: string; unit: string; unitPrice: string; discountAmount: string };

export function CreatePurchaseOrderPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", branchId: "", orderDate: "", expectedDeliveryDate: "",
    paymentTerms: "", notes: "",
  });
  const [items, setItems] = useState<POItem[]>([{ description: "", quantity: "1", unit: "PCS", unitPrice: "", discountAmount: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof POItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { description: "", quantity: "1", unit: "PCS", unitPrice: "", discountAmount: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const lineTotal = (it: POItem) =>
    Number(it.quantity || 0) * Number(it.unitPrice || 0) - Number(it.discountAmount || 0);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          supplierId: form.supplierId || undefined,
          branchId: form.branchId || undefined,
          orderDate: form.orderDate || undefined,
          expectedDeliveryDate: form.expectedDeliveryDate || undefined,
          items: items.map((it) => ({
            description: it.description,
            quantity: Number(it.quantity),
            unit: it.unit,
            unitPrice: Number(it.unitPrice),
            discountAmount: it.discountAmount ? Number(it.discountAmount) : 0,
          })),
        }),
      });
      router.push("/procurement/purchase-orders");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="New Purchase Order"
          subtitle="Create a formal order for a supplier"
          actions={<Link href="/procurement/purchase-orders" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {error && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Order Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <FormLabel>Supplier *</FormLabel>
                <select required value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Branch</FormLabel>
                <select value={form.branchId} onChange={f("branchId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Order Date</FormLabel>
                <input type="date" value={form.orderDate} onChange={f("orderDate")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Expected Delivery</FormLabel>
                <input type="date" value={form.expectedDeliveryDate} onChange={f("expectedDeliveryDate")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Terms</FormLabel>
                <input value={form.paymentTerms} onChange={f("paymentTerms")} placeholder="e.g. Net 30" className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Notes</FormLabel>
                <textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Line Items</h2>
              <button type="button" onClick={addItem} className="app-button-secondary py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="divide-y divide-line">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4">
                  <div className="col-span-12 sm:col-span-4">
                    <FormLabel>Description *</FormLabel>
                    <input required value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Qty *</FormLabel>
                    <input required type="number" min={0.01} step={0.01} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Unit Price *</FormLabel>
                    <input required type="number" min={0} step={0.01} value={it.unitPrice} onChange={(e) => setItem(i, "unitPrice", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <FormLabel>Discount</FormLabel>
                    <input type="number" min={0} step={0.01} value={it.discountAmount} onChange={(e) => setItem(i, "discountAmount", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 flex items-end justify-between sm:col-span-1">
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-ink/40 font-bold">Line</p>
                      <p className="text-sm font-bold text-ink">{money(lineTotal(it))}</p>
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="ml-2 mb-0.5 rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-red-600 hover:bg-red-100">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-line px-6 py-4">
              <div className="text-right">
                <p className="text-xs uppercase font-bold tracking-wide text-ink/45">Order Total</p>
                <p className="text-2xl font-extrabold text-ink">{money(subtotal)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="app-button-primary">
              {saving ? "Saving..." : "Create Purchase Order"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

// ─── GRNs ─────────────────────────────────────────────────────────────────────

type GRN = {
  id: string;
  reference: string;
  status: string;
  receivedDate: string;
  supplier?: { name: string };
  warehouse?: { name: string };
};

export function GRNsPage() {
  const [rows, setRows] = useState<GRN[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<GRN[]>>(`/procurement/grns${q}`)
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function act(id: string, path: string) {
    setBusy(id);
    setActionErr("");
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const statuses = ["", "RECEIVED", "QUALITY_HOLD", "QUALITY_PASSED", "QUALITY_FAILED", "POSTED"];

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Goods Received Notes"
          subtitle="Record and inspect incoming deliveries"
          actions={
            <Link href="/procurement/grns/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> Record GRN
            </Link>
          }
        />
        <ProcurementNav />
        {actionErr && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {actionErr}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-line bg-white text-ink/60 hover:bg-field"
              }`}
            >
              {s ? s.replace(/_/g, " ") : "All"}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "reference", label: "Reference" },
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as GRN["supplier"])?.name ?? "—" },
              { key: "warehouse", label: "Warehouse", render: (r) => (r.warehouse as GRN["warehouse"])?.name ?? "—" },
              { key: "receivedDate", label: "Received", render: (r) => fmt(r.receivedDate as string) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
              {
                key: "actions",
                label: "Quality Actions",
                render: (r) => (
                  <div className="flex gap-1">
                    {(r.status === "RECEIVED" || r.status === "QUALITY_HOLD") && (
                      <>
                        <button
                          onClick={() => act(r.id as string, `/procurement/grns/${r.id}/quality-pass`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          Pass
                        </button>
                        <button
                          onClick={() => act(r.id as string, `/procurement/grns/${r.id}/quality-fail`)}
                          disabled={busy === r.id}
                          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                        >
                          Fail
                        </button>
                      </>
                    )}
                    {r.status === "QUALITY_PASSED" && (
                      <button
                        onClick={() => act(r.id as string, `/procurement/grns/${r.id}/post`)}
                        disabled={busy === r.id}
                        className="rounded-md bg-slate-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                      >
                        {busy === r.id ? "…" : "Post to Inventory"}
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No GRNs yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Create GRN ───────────────────────────────────────────────────────────────

type GRNItem = { description: string; orderedQuantity: string; receivedQuantity: string; unit: string; unitCost: string };
type POOption = { id: string; reference: string };

export function CreateGRNPage() {
  const router = useRouter();
  const opts = useProcurementOptions();
  const [poOptions, setPoOptions] = useState<POOption[]>([]);
  const [form, setForm] = useState({
    supplierId: "", warehouseId: "", purchaseOrderId: "",
    receivedDate: "", notes: "",
  });
  const [items, setItems] = useState<GRNItem[]>([{ description: "", orderedQuantity: "", receivedQuantity: "1", unit: "PCS", unitCost: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ApiEnvelope<POOption[]>>("/procurement/purchase-orders?status=SENT_TO_SUPPLIER")
      .then((r) => setPoOptions(r.data))
      .catch(() => undefined);
  }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof GRNItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { description: "", orderedQuantity: "", receivedQuantity: "1", unit: "PCS", unitCost: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/grns", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          supplierId: form.supplierId || undefined,
          warehouseId: form.warehouseId || undefined,
          purchaseOrderId: form.purchaseOrderId || undefined,
          receivedDate: form.receivedDate || undefined,
          items: items.map((it) => ({
            description: it.description,
            orderedQuantity: it.orderedQuantity ? Number(it.orderedQuantity) : undefined,
            receivedQuantity: Number(it.receivedQuantity),
            unit: it.unit,
            unitCost: it.unitCost ? Number(it.unitCost) : undefined,
          })),
        }),
      });
      router.push("/procurement/grns");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Record GRN"
          subtitle="Log goods received from a supplier"
          actions={<Link href="/procurement/grns" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {error && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Receipt Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Supplier</FormLabel>
                <select value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Warehouse *</FormLabel>
                <select required value={form.warehouseId} onChange={f("warehouseId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Purchase Order</FormLabel>
                <select value={form.purchaseOrderId} onChange={f("purchaseOrderId")} className={inputCls}>
                  <option value="">— None / Manual —</option>
                  {poOptions.map((po) => <option key={po.id} value={po.id}>{po.reference}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Received Date *</FormLabel>
                <input required type="date" value={form.receivedDate} onChange={f("receivedDate")} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <FormLabel>Notes</FormLabel>
                <textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Items Received</h2>
              <button type="button" onClick={addItem} className="app-button-secondary py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>
            <div className="divide-y divide-line">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4">
                  <div className="col-span-12 sm:col-span-4">
                    <FormLabel>Description *</FormLabel>
                    <input required value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Ordered Qty</FormLabel>
                    <input type="number" min={0} step={0.01} value={it.orderedQuantity} onChange={(e) => setItem(i, "orderedQuantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Received Qty *</FormLabel>
                    <input required type="number" min={0.01} step={0.01} value={it.receivedQuantity} onChange={(e) => setItem(i, "receivedQuantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <FormLabel>Unit Cost</FormLabel>
                    <input type="number" min={0} step={0.01} value={it.unitCost} onChange={(e) => setItem(i, "unitCost", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 flex items-end sm:col-span-1">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="mb-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2.5 text-red-600 hover:bg-red-100">
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="app-button-primary">
              {saving ? "Saving..." : "Record GRN"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

// ─── Supplier Invoices ────────────────────────────────────────────────────────

type SupplierInvoice = {
  id: string;
  reference: string;
  invoiceNumber?: string;
  status: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount: number;
  supplier?: { name: string };
};

export function SupplierInvoicesPage() {
  const [rows, setRows] = useState<SupplierInvoice[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const opts = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "",
    totalAmount: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<SupplierInvoice[]>>(`/procurement/invoices${q}`)
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, [statusFilter]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/invoices", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          supplierId: form.supplierId || undefined,
          totalAmount: Number(form.totalAmount),
          invoiceDate: form.invoiceDate || undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      setShowForm(false);
      setForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", totalAmount: "", notes: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const statuses = ["", "PENDING", "MATCHED", "APPROVED", "PAID", "DISPUTED", "OVERDUE"];

  return (
    <AppShell>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Supplier Invoices"
          subtitle="Manage and track payables to suppliers"
          actions={
            <button onClick={() => setShowForm((p) => !p)} className="app-button-primary">
              <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Record Invoice"}
            </button>
          }
        />
        <ProcurementNav />
        {showForm && (
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">New Invoice</h2>
            {error && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Supplier</FormLabel>
                <select value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Invoice Number *</FormLabel>
                <input required value={form.invoiceNumber} onChange={f("invoiceNumber")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Total Amount *</FormLabel>
                <input required type="number" min={0} step={0.01} value={form.totalAmount} onChange={f("totalAmount")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Invoice Date</FormLabel>
                <input type="date" value={form.invoiceDate} onChange={f("invoiceDate")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Due Date</FormLabel>
                <input type="date" value={form.dueDate} onChange={f("dueDate")} className={inputCls} />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={saving} className="app-button-primary w-full justify-center">
                  {saving ? "Saving..." : "Save Invoice"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-line bg-white text-ink/60 hover:bg-field"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "invoiceNumber", label: "Invoice #" },
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as SupplierInvoice["supplier"])?.name ?? "—" },
              { key: "invoiceDate", label: "Date", render: (r) => fmt(r.invoiceDate as string) },
              { key: "dueDate", label: "Due", render: (r) => fmt(r.dueDate as string) },
              { key: "totalAmount", label: "Amount", render: (r) => money(r.totalAmount) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No invoices yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Procurement Payments ─────────────────────────────────────────────────────

type ProcurementPayment = {
  id: string;
  reference: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  supplier?: { name: string };
};

export function ProcurementPaymentsPage() {
  const [rows, setRows] = useState<ProcurementPayment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const opts = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", amount: "", paymentDate: "",
    paymentMethod: "BANK_TRANSFER", bankAccountId: "", reference: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<ProcurementPayment[]>>("/procurement/payments")
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/payments", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          supplierId: form.supplierId || undefined,
          bankAccountId: form.bankAccountId || undefined,
          paymentDate: form.paymentDate || undefined,
        }),
      });
      setShowForm(false);
      setForm({ supplierId: "", amount: "", paymentDate: "", paymentMethod: "BANK_TRANSFER", bankAccountId: "", reference: "", notes: "" });
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
        <PageHero
          kicker="Procurement"
          title="Payments"
          subtitle="Payments made to suppliers"
          actions={
            <button onClick={() => setShowForm((p) => !p)} className="app-button-primary">
              <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Record Payment"}
            </button>
          }
        />
        <ProcurementNav />
        {showForm && (
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">New Payment</h2>
            {error && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Supplier *</FormLabel>
                <select required value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Amount *</FormLabel>
                <input required type="number" min={0.01} step={0.01} value={form.amount} onChange={f("amount")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Date *</FormLabel>
                <input required type="date" value={form.paymentDate} onChange={f("paymentDate")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Method</FormLabel>
                <select value={form.paymentMethod} onChange={f("paymentMethod")} className={inputCls}>
                  {["BANK_TRANSFER", "CHEQUE", "CASH", "MOBILE_MONEY"].map((m) => (
                    <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Bank Account</FormLabel>
                <select value={form.bankAccountId} onChange={f("bankAccountId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.accountName} — {b.bankName}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Reference</FormLabel>
                <input value={form.reference} onChange={f("reference")} className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Notes</FormLabel>
                <textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <button type="submit" disabled={saving} className="app-button-primary">
                  {saving ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "reference", label: "Reference" },
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as ProcurementPayment["supplier"])?.name ?? "—" },
              { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate as string) },
              { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "—").replace(/_/g, " ") },
              { key: "amount", label: "Amount", render: (r) => money(r.amount) },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No payments recorded yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Supplier Performance ─────────────────────────────────────────────────────

type PerformanceRecord = {
  id: string;
  period: string;
  rating: string;
  qualityScore: number;
  onTimeDelivery: boolean;
  totalOrders: number;
  lateDeliveries: number;
  notes?: string;
  supplier: { name: string; code: string };
};

export function SupplierPerformancePage() {
  const [rows, setRows] = useState<PerformanceRecord[]>([]);
  const opts = useProcurementOptions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    supplierId: "", period: "", rating: "GOOD", onTimeDelivery: true,
    qualityScore: "80", priceCompetitiveness: "", responsiveness: "",
    totalOrders: "", lateDeliveries: "", rejectedItems: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<PerformanceRecord[]>>("/procurement/performance")
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked as unknown as string : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/performance", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          qualityScore: Number(form.qualityScore),
          priceCompetitiveness: form.priceCompetitiveness ? Number(form.priceCompetitiveness) : undefined,
          responsiveness: form.responsiveness ? Number(form.responsiveness) : undefined,
          totalOrders: form.totalOrders ? Number(form.totalOrders) : undefined,
          lateDeliveries: form.lateDeliveries ? Number(form.lateDeliveries) : undefined,
          rejectedItems: form.rejectedItems ? Number(form.rejectedItems) : undefined,
        }),
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
        <PageHero
          kicker="Procurement"
          title="Supplier Performance"
          subtitle="Track and rate vendor delivery and quality"
          actions={
            <button onClick={() => setShowForm((p) => !p)} className="app-button-primary">
              <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Add Record"}
            </button>
          }
        />
        <ProcurementNav />
        {showForm && (
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Performance Record</h2>
            {error && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Supplier *</FormLabel>
                <select required value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Period (e.g. 2025-Q1) *</FormLabel>
                <input required value={form.period} onChange={f("period")} placeholder="2025-Q1" className={inputCls} />
              </div>
              <div>
                <FormLabel>Rating *</FormLabel>
                <select required value={form.rating} onChange={f("rating")} className={inputCls}>
                  {["EXCELLENT", "GOOD", "SATISFACTORY", "POOR", "UNACCEPTABLE"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel>Quality Score (0–100) *</FormLabel>
                <input required type="number" min={0} max={100} value={form.qualityScore} onChange={f("qualityScore")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Total Orders</FormLabel>
                <input type="number" min={0} value={form.totalOrders} onChange={f("totalOrders")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Late Deliveries</FormLabel>
                <input type="number" min={0} value={form.lateDeliveries} onChange={f("lateDeliveries")} className={inputCls} />
              </div>
              <div className="flex items-center gap-2.5 pt-6">
                <input
                  type="checkbox"
                  id="onTime"
                  checked={!!form.onTimeDelivery}
                  onChange={(e) => setForm((p) => ({ ...p, onTimeDelivery: e.target.checked }))}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-brand/20"
                />
                <label htmlFor="onTime" className="text-sm font-medium text-ink">On-time delivery</label>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <button type="submit" disabled={saving} className="app-button-primary">
                  {saving ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as PerformanceRecord["supplier"])?.name ?? "—" },
              { key: "period", label: "Period" },
              { key: "rating", label: "Rating", render: (r) => <StatusBadge status={r.rating as string} /> },
              {
                key: "qualityScore",
                label: "Quality Score",
                render: (r) => {
                  const score = Number(r.qualityScore ?? 0);
                  const barColor = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : "bg-red-500";
                  return (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                      </div>
                      <span className="text-xs font-semibold">{score}%</span>
                    </div>
                  );
                },
              },
              { key: "onTimeDelivery", label: "On Time", render: (r) => (r.onTimeDelivery ? "✓ Yes" : "✗ No") },
              { key: "totalOrders", label: "Orders" },
              { key: "lateDeliveries", label: "Late" },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No performance records yet"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─── Price History ────────────────────────────────────────────────────────────

type PriceHistoryRow = {
  id: string;
  productName: string;
  unitPrice: number;
  currency: string;
  effectiveDate: string;
  notes?: string;
  supplier: { name: string; code: string };
};

export function PriceHistoryPage() {
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const opts = useProcurementOptions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierId: "", productName: "", unitPrice: "", currency: "GHS", effectiveDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<ApiEnvelope<PriceHistoryRow[]>>("/procurement/price-history")
      .then((r) => setRows(r.data))
      .catch(() => undefined);
  }
  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/price-history", {
        method: "POST",
        body: JSON.stringify({ ...form, unitPrice: Number(form.unitPrice) }),
      });
      setShowForm(false);
      setForm({ supplierId: "", productName: "", unitPrice: "", currency: "GHS", effectiveDate: "", notes: "" });
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
        <PageHero
          kicker="Procurement"
          title="Price History"
          subtitle="Track supplier pricing over time"
          actions={
            <button onClick={() => setShowForm((p) => !p)} className="app-button-primary">
              <Plus className="h-4 w-4" /> {showForm ? "Cancel" : "Add Price"}
            </button>
          }
        />
        <ProcurementNav />
        {showForm && (
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Record Price</h2>
            {error && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <FormLabel>Supplier *</FormLabel>
                <select required value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Product / Item *</FormLabel>
                <input required value={form.productName} onChange={f("productName")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Unit Price *</FormLabel>
                <input required type="number" min={0} step={0.01} value={form.unitPrice} onChange={f("unitPrice")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Currency</FormLabel>
                <select value={form.currency} onChange={f("currency")} className={inputCls}>
                  {["GHS", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Effective Date *</FormLabel>
                <input required type="date" value={form.effectiveDate} onChange={f("effectiveDate")} className={inputCls} />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={saving} className="app-button-primary w-full justify-center">
                  {saving ? "Saving..." : "Save Price"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <DataTable
            columns={[
              { key: "supplier", label: "Supplier", render: (r) => (r.supplier as PriceHistoryRow["supplier"])?.name ?? "—" },
              { key: "productName", label: "Product" },
              { key: "unitPrice", label: "Unit Price", render: (r) => money(r.unitPrice) },
              { key: "currency", label: "Currency" },
              { key: "effectiveDate", label: "Effective Date", render: (r) => fmt(r.effectiveDate as string) },
              { key: "notes", label: "Notes" },
            ]}
            rows={rows as Record<string, unknown>[]}
            empty="No price history yet"
          />
        </div>
      </div>
    </AppShell>
  );
}
