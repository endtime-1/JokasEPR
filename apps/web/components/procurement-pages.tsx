"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useParams } from "next/navigation";
import {
  AlertTriangle, ChartBar, Building2, ChevronRight,
  ClipboardList, Clock, DollarSign, FileText, Package, Pencil, Plus,
  ShoppingCart, Star, Tag, Trash2, Wallet,
  type LucideIcon,
} from "lucide-react";
import { ApiEnvelope, apiFetch, getCached, getCachedFirst, hasCached, invalidateCache } from "../lib/api";
import { DataTable } from "./data-table";
import { ConfirmModal, LockedNote, Modal, StatusBadge } from "./ui";
import { useAuth } from "./auth-context";
import { useApiRecovery } from "../lib/use-api-recovery";

// RejectPurchaseRequestDto/RejectPurchaseOrderDto/QualityFailGRNDto all
// require a non-empty reason/qualityNotes string server-side — used by the
// PR, PO, and GRN list pages below for their respective reject/fail actions.
function RejectReasonModal({
  open, onClose, onConfirm, loading,
  title = "Reject", label = "Reason *", placeholder = "Why is this being rejected?", confirmLabel = "Reject", busyLabel = "Rejecting…",
}: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; loading: boolean;
  title?: string; label?: string; placeholder?: string; confirmLabel?: string; busyLabel?: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-3">
        <div>
          <FormLabel>{label}</FormLabel>
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} placeholder={placeholder} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="app-button-secondary">Cancel</button>
          <button
            type="button"
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
          >
            {loading ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const procurementNavLinks = [
  { href: "/procurement",                     label: "Dashboard",    Icon: ChartBar },
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
  const forceAccept = useRef(false);
  const [opts, setOpts] = useState<ProcurementOptions>(() => getCached<ApiEnvelope<ProcurementOptions>>("/procurement/options")?.data ?? {
    branches: [],
    warehouses: [],
    suppliers: [],
    supplierCategories: [],
    bankAccounts: [],
  });
  const [optionsError, setOptionsError] = useState("");
  const [_procOptKey, _setProcOptKey] = useState(0);
  useEffect(() => {
    const force = forceAccept.current;
    forceAccept.current = false;
    apiFetch<ApiEnvelope<ProcurementOptions>>("/procurement/options")
      .then((r) => {
        const fresh = r.data ?? { branches: [], warehouses: [], suppliers: [], supplierCategories: [], bankAccounts: [] };
        setOpts((prev) => !force && fresh.suppliers.length === 0 && prev.suppliers.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setOptionsError(err?.message ?? "Failed to load options."));
  }, [_procOptKey]);
  useEffect(() => {
    function onRecovered() { _setProcOptKey((k) => k + 1); }
    window.addEventListener("api:recovered", onRecovered);
    return () => window.removeEventListener("api:recovered", onRecovered);
  }, []);
  return { opts, optionsError };
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
  const [data, setData] = useState<DashData | null>(() => getCachedFirst<ApiEnvelope<DashData>>("/procurement/dashboard")?.data ?? null);
  const [loading, setLoading] = useState(!hasCached("/procurement/dashboard"));
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const today = new Date().toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    apiFetch<ApiEnvelope<DashData>>("/procurement/dashboard")
      .then((r) => setData(r.data))
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load dashboard."))
      .finally(() => setLoading(false));
  }, [refresh]);
  useApiRecovery(!data, () => setRefresh((r) => r + 1));

  const quickLinks = [
    { href: "/procurement/purchase-requests/create", label: "New Request",  Icon: ClipboardList, cls: "border-brand/20 bg-brand/5 text-brand hover:bg-brand/10" },
    { href: "/procurement/purchase-orders/create",   label: "New PO",       Icon: ShoppingCart,  cls: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
    { href: "/procurement/grns/create",              label: "Record GRN",   Icon: Package,       cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { href: "/procurement/suppliers/create",         label: "Add Supplier", Icon: Building2,     cls: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { href: "/procurement/invoices",                 label: "Invoices",     Icon: FileText,      cls: "border-line bg-white text-ink/70 hover:bg-field" },
    { href: "/procurement/payments",                 label: "Payments",     Icon: Wallet,        cls: "border-line bg-white text-ink/70 hover:bg-field" },
  ];

  return (
    
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

        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>
        )}

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
  address?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  notes?: string;
  status: string;
  rating?: number;
  categoryId?: string;
  category?: { name: string };
};

const SUPPLIER_EDIT_FORM_DEFAULT = {
  name: "", contactPerson: "", phone: "", email: "", address: "",
  categoryId: "", taxId: "", bankName: "", bankAccount: "",
  paymentTermsDays: "", status: "ACTIVE", leadTimeDays: "", notes: "",
};

export function SuppliersPage() {
  const { profile } = useAuth();
  const { opts } = useProcurementOptions();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("procurement.manage");

  const [rows, setRows] = useState<Supplier[]>(() => getCachedFirst<ApiEnvelope<Supplier[]>>("/procurement/suppliers")?.data ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!hasCached("/procurement/suppliers"));
  const [loadError, setLoadError] = useState("");

  const [editRow, setEditRow] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState(SUPPLIER_EDIT_FORM_DEFAULT);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    apiFetch<ApiEnvelope<Supplier[]>>(`/procurement/suppliers${q}`)
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [search]);
  useApiRecovery(rows.length === 0, load);

  function startEdit(row: Supplier) {
    setEditForm({
      name: row.name,
      contactPerson: row.contactPerson ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      categoryId: row.categoryId ?? "",
      taxId: row.taxId ?? "",
      bankName: row.bankName ?? "",
      bankAccount: row.bankAccount ?? "",
      paymentTermsDays: row.paymentTermsDays?.toString() ?? "",
      status: row.status,
      leadTimeDays: row.leadTimeDays?.toString() ?? "",
      notes: row.notes ?? "",
    });
    setEditError("");
    setEditRow(row);
  }

  const ef = (k: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [k]: e.target.value }));

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/procurement/suppliers/${editRow.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          categoryId: editForm.categoryId || undefined,
          taxId: editForm.taxId || undefined,
          bankName: editForm.bankName || undefined,
          bankAccount: editForm.bankAccount || undefined,
          paymentTermsDays: editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : undefined,
          leadTimeDays: editForm.leadTimeDays ? Number(editForm.leadTimeDays) : undefined,
        }),
      });
      invalidateCache("/procurement/suppliers", true);
      setEditRow(null);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/procurement/suppliers/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/procurement/suppliers", true);
      setDeleteRow(null);
      load();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete supplier.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
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
        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>
        )}
        {deleteError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{deleteError}</div>
        )}
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
              ...(canManage ? [{
                key: "actions",
                label: "Actions",
                render: (r: Record<string, unknown>) => (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(r as unknown as Supplier)}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteError(""); setDeleteRow(r as unknown as Supplier); }}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                ),
              }] : []),
            ]}
            rows={rows as Record<string, unknown>[]}
            loading={loading}
            empty="No suppliers found"
          />
        </div>
      </div>

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title={`Edit ${editRow?.name ?? "Supplier"}`} size="lg">
        <form onSubmit={saveEdit} className="space-y-4">
          {editError && (
            <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{editError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormLabel>Supplier Name *</FormLabel>
              <input required value={editForm.name} onChange={ef("name")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Category</FormLabel>
              <select value={editForm.categoryId} onChange={ef("categoryId")} className={inputCls}>
                <option value="">— Select —</option>
                {opts.supplierCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Status</FormLabel>
              <select value={editForm.status} onChange={ef("status")} className={inputCls}>
                {["ACTIVE", "INACTIVE", "UNDER_REVIEW", "BLACKLISTED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Contact Person</FormLabel>
              <input value={editForm.contactPerson} onChange={ef("contactPerson")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Phone</FormLabel>
              <input value={editForm.phone} onChange={ef("phone")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Email</FormLabel>
              <input type="email" value={editForm.email} onChange={ef("email")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Tax Number</FormLabel>
              <input value={editForm.taxId} onChange={ef("taxId")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Payment Terms (days)</FormLabel>
              <input type="number" min={0} value={editForm.paymentTermsDays} onChange={ef("paymentTermsDays")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Lead Time (days)</FormLabel>
              <input type="number" min={0} value={editForm.leadTimeDays} onChange={ef("leadTimeDays")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Bank Name</FormLabel>
              <input value={editForm.bankName} onChange={ef("bankName")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Bank Account</FormLabel>
              <input value={editForm.bankAccount} onChange={ef("bankAccount")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Address</FormLabel>
              <input value={editForm.address} onChange={ef("address")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Notes</FormLabel>
              <textarea value={editForm.notes} onChange={ef("notes")} rows={2} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button type="submit" disabled={savingEdit} className="app-button-primary">{savingEdit ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete supplier?"
        message={`This will permanently remove "${deleteRow?.name}" (${deleteRow?.code}). This can't be undone.`}
        confirmLabel="Delete supplier"
      />
    </>
  );
}

// ─── Create Supplier ─────────────────────────────────────────────────────────

export function CreateSupplierPage() {
  const router = useRouter();
  const { opts, optionsError } = useProcurementOptions();
  const [form, setForm] = useState({
    code: "", name: "", contactPerson: "", phone: "", email: "",
    address: "", categoryId: "", paymentTermsDays: "", currency: "GHS",
    taxId: "", status: "ACTIVE", notes: "",
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
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId || undefined,
          taxId: form.taxId || undefined,
          paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        }),
      });
      router.push("/procurement/suppliers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    
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
        {optionsError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {optionsError}
          </div>
        )}
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
                <input value={form.taxId} onChange={f("taxId")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Terms (days)</FormLabel>
                <input type="number" min={0} value={form.paymentTermsDays} onChange={f("paymentTermsDays")} className={inputCls} placeholder="e.g. 30" />
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
    
  );
}

// ─── Supplier Details ─────────────────────────────────────────────────────────

type SupplierDetail = {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  paymentTermsDays?: number;
  currency: string;
  status: string;
  leadTimeDays?: number;
  notes?: string;
  categoryId?: string;
  category?: { id: string; name: string };
  purchaseOrders: Array<{ id: string; reference: string; status: string; totalAmount: number; orderDate: string }>;
  performanceRecords: Array<{ id: string; period: string; rating: string; qualityScore: number }>;
  priceHistory: Array<{ id: string; productName: string; unitPrice: number; currency: string; effectiveDate: string }>;
};

export function SupplierDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { opts } = useProcurementOptions();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("procurement.manage");

  const [supplier, setSupplier] = useState<SupplierDetail | null>(() => getCachedFirst<ApiEnvelope<SupplierDetail>>(`/procurement/suppliers/${params.id}`)?.data ?? null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", contactPerson: "", phone: "", email: "", address: "",
    categoryId: "", taxId: "", bankName: "", bankAccount: "",
    paymentTermsDays: "", status: "ACTIVE", leadTimeDays: "", notes: "",
  });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const res = await apiFetch<ApiEnvelope<SupplierDetail>>(`/procurement/suppliers/${params.id}`);
      setSupplier(res.data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load supplier.");
    }
  }
  useEffect(() => { load(); }, [params.id]);
  useApiRecovery(!supplier, load);

  function startEdit() {
    if (!supplier) return;
    setEditForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      categoryId: supplier.categoryId ?? "",
      taxId: supplier.taxId ?? "",
      bankName: supplier.bankName ?? "",
      bankAccount: supplier.bankAccount ?? "",
      paymentTermsDays: supplier.paymentTermsDays?.toString() ?? "",
      status: supplier.status,
      leadTimeDays: supplier.leadTimeDays?.toString() ?? "",
      notes: supplier.notes ?? "",
    });
    setEditError("");
    setEditing(true);
  }

  const f = (k: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [k]: e.target.value }));

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/procurement/suppliers/${params.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          categoryId: editForm.categoryId || undefined,
          taxId: editForm.taxId || undefined,
          bankName: editForm.bankName || undefined,
          bankAccount: editForm.bankAccount || undefined,
          paymentTermsDays: editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : undefined,
          leadTimeDays: editForm.leadTimeDays ? Number(editForm.leadTimeDays) : undefined,
        }),
      });
      invalidateCache("/procurement/suppliers", true);
      setEditing(false);
      await load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/procurement/suppliers/${params.id}`, { method: "DELETE" });
      invalidateCache("/procurement/suppliers", true);
      router.push("/procurement/suppliers");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete supplier.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title={supplier?.name ?? "Supplier"}
          subtitle={supplier?.code}
          actions={
            <>
              <Link href="/procurement/suppliers" className="app-button-secondary">Back</Link>
              {canManage && !editing && (
                <button type="button" onClick={startEdit} className="app-button-secondary">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setConfirmDelete(true); }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </>
          }
        />
        <ProcurementNav />

        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>
        )}
        {deleteError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{deleteError}</div>
        )}

        {editing ? (
          <form onSubmit={saveEdit} className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Edit Supplier</h2>
            {editError && (
              <div className="mb-4 rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{editError}</div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <FormLabel>Supplier Name *</FormLabel>
                <input required value={editForm.name} onChange={f("name")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Category</FormLabel>
                <select value={editForm.categoryId} onChange={f("categoryId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.supplierCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Status</FormLabel>
                <select value={editForm.status} onChange={f("status")} className={inputCls}>
                  {["ACTIVE", "INACTIVE", "UNDER_REVIEW", "BLACKLISTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Contact Person</FormLabel>
                <input value={editForm.contactPerson} onChange={f("contactPerson")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Phone</FormLabel>
                <input value={editForm.phone} onChange={f("phone")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Email</FormLabel>
                <input type="email" value={editForm.email} onChange={f("email")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Tax Number</FormLabel>
                <input value={editForm.taxId} onChange={f("taxId")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Terms (days)</FormLabel>
                <input type="number" min={0} value={editForm.paymentTermsDays} onChange={f("paymentTermsDays")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Lead Time (days)</FormLabel>
                <input type="number" min={0} value={editForm.leadTimeDays} onChange={f("leadTimeDays")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Bank Name</FormLabel>
                <input value={editForm.bankName} onChange={f("bankName")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Bank Account</FormLabel>
                <input value={editForm.bankAccount} onChange={f("bankAccount")} className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Address</FormLabel>
                <input value={editForm.address} onChange={f("address")} className={inputCls} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Notes</FormLabel>
                <textarea value={editForm.notes} onChange={f("notes")} rows={3} className={inputCls} />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={savingEdit} className="app-button-primary">
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="app-button-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Supplier Details</h2>
              {supplier && <StatusBadge status={supplier.status} />}
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Category</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.category?.name ?? "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Contact Person</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.contactPerson || "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Phone</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.phone || "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Email</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.email || "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Tax Number</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.taxId || "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Payment Terms</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.paymentTermsDays != null ? `${supplier.paymentTermsDays} days` : "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Lead Time</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.leadTimeDays != null ? `${supplier.leadTimeDays} days` : "—"}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Bank</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.bankName ? `${supplier.bankName}${supplier.bankAccount ? ` — ${supplier.bankAccount}` : ""}` : "—"}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Address</dt><dd className="mt-0.5 text-sm text-ink">{supplier?.address || "—"}</dd></div>
              {supplier?.notes && (
                <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Notes</dt><dd className="mt-0.5 text-sm text-ink">{supplier.notes}</dd></div>
              )}
            </dl>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-white shadow-panel">
          <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Recent Purchase Orders</h2></div>
          <DataTable
            columns={[
              { key: "reference", label: "Reference", render: (r) => <Link href={`/procurement/purchase-orders/${r.id}`} className="font-semibold text-brand hover:underline">{r.reference as string}</Link> },
              { key: "orderDate", label: "Order Date", render: (r) => fmt(r.orderDate as string) },
              { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
            ]}
            rows={(supplier?.purchaseOrders ?? []) as Record<string, unknown>[]}
            loading={!supplier}
            empty="No purchase orders yet"
          />
        </div>

        {(supplier?.priceHistory?.length ?? 0) > 0 && (
          <div className="rounded-2xl border border-line bg-white shadow-panel">
            <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Price History</h2></div>
            <DataTable
              columns={[
                { key: "productName", label: "Product" },
                { key: "unitPrice", label: "Unit Price", render: (r) => money(r.unitPrice) },
                { key: "effectiveDate", label: "Effective", render: (r) => fmt(r.effectiveDate as string) },
              ]}
              rows={(supplier?.priceHistory ?? []) as Record<string, unknown>[]}
              loading={false}
              empty="No price history"
            />
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete supplier?"
        message={`This will permanently remove "${supplier?.name}" (${supplier?.code}). This can't be undone.`}
        confirmLabel="Delete supplier"
      />
    </>
  );
}

// ─── Supplier Categories ─────────────────────────────────────────────────────

type SupplierCategory = { id: string; code: string; name: string; description?: string };

export function SupplierCategoriesPage() {
  const [rows, setRows] = useState<SupplierCategory[]>(() => getCachedFirst<ApiEnvelope<SupplierCategory[]>>("/procurement/supplier-categories")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/supplier-categories"));
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<SupplierCategory[]>>("/procurement/supplier-categories")
      .then((r) => {
        const fresh = r.data ?? [];
        setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh);
      })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useApiRecovery(rows.length === 0, load);

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
    
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Supplier Categories"
          subtitle="Classify and group your suppliers"
        />
        <ProcurementNav />
        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>
        )}
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
              loading={loading}
              empty="No categories yet"
            />
          </div>
        </div>
      </div>
    
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
  const [rows, setRows] = useState<PurchaseRequest[]>(() => getCachedFirst<ApiEnvelope<PurchaseRequest[]>>("/procurement/purchase-requests")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/purchase-requests"));
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [loadError, setLoadError] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  function load() {
    setLoadError("");
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<PurchaseRequest[]>>(`/procurement/purchase-requests${q}`)
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);
  useApiRecovery(rows.length === 0, load);

  async function confirmReject(reason: string) {
    if (!rejectId) return;
    setRejecting(true);
    setActionErr("");
    try {
      await apiFetch(`/procurement/purchase-requests/${rejectId}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
      setRejectId(null);
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRejecting(false);
    }
  }

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
    <>
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
        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
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
                          onClick={() => setRejectId(r.id as string)}
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
            loading={loading}
            empty="No purchase requests yet"
          />
        </div>
      </div>
      <RejectReasonModal open={!!rejectId} onClose={() => setRejectId(null)} onConfirm={confirmReject} loading={rejecting} />
    </>
  );
}

// ─── Create Purchase Request ──────────────────────────────────────────────────

type PRItem = { productName: string; quantity: string; uomCode: string; estimatedUnitCost: string };

export function CreatePurchaseRequestPage() {
  const router = useRouter();
  const { opts, optionsError } = useProcurementOptions();
  const [form, setForm] = useState({ title: "", branchId: "", requiredDate: "", notes: "" });
  const [items, setItems] = useState<PRItem[]>([{ productName: "", quantity: "1", uomCode: "PCS", estimatedUnitCost: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof PRItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { productName: "", quantity: "1", uomCode: "PCS", estimatedUnitCost: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.estimatedUnitCost || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          branchId: form.branchId || undefined,
          requiredDate: form.requiredDate || undefined,
          notes: form.notes || undefined,
          items: items.map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            uomCode: it.uomCode || undefined,
            estimatedUnitCost: it.estimatedUnitCost ? Number(it.estimatedUnitCost) : undefined,
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
    
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="New Purchase Request"
          subtitle="Request items or services for procurement"
          actions={<Link href="/procurement/purchase-requests" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {optionsError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {optionsError}
          </div>
        )}
        {error && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Request Details</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <FormLabel>Title *</FormLabel>
                <input required value={form.title} onChange={f("title")} className={inputCls} placeholder="e.g. Feed mill Q3 raw materials" maxLength={200} />
              </div>
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
                    <FormLabel>Product Name *</FormLabel>
                    <input required value={it.productName} onChange={(e) => setItem(i, "productName", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Qty *</FormLabel>
                    <input required type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.uomCode} onChange={(e) => setItem(i, "uomCode", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Est. Cost</FormLabel>
                    <input type="number" min={0} step={0.01} value={it.estimatedUnitCost} onChange={(e) => setItem(i, "estimatedUnitCost", e.target.value)} className={inputCls} />
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
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("procurement.manage");

  const [rows, setRows] = useState<PurchaseOrder[]>(() => getCachedFirst<ApiEnvelope<PurchaseOrder[]>>("/procurement/purchase-orders")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/purchase-orders"));
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [loadError, setLoadError] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const [editRow, setEditRow] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState({ expectedDelivery: "", deliveryAddress: "", paymentTermsDays: "", notes: "" });
  const [editItems, setEditItems] = useState<POItem[]>([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteRow, setDeleteRow] = useState<PurchaseOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function load() {
    setLoadError("");
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<PurchaseOrder[]>>(`/procurement/purchase-orders${q}`)
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);
  useApiRecovery(rows.length === 0, load);

  async function confirmReject(reason: string) {
    if (!rejectId) return;
    setRejecting(true);
    setActionErr("");
    try {
      await apiFetch(`/procurement/purchase-orders/${rejectId}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
      setRejectId(null);
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRejecting(false);
    }
  }

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

  // Fetches the full record (list rows don't carry items/deliveryAddress) before opening the edit modal.
  async function startEdit(row: PurchaseOrder) {
    setBusy(row.id);
    setActionErr("");
    try {
      const res = await apiFetch<ApiEnvelope<{ expectedDelivery?: string; deliveryAddress?: string; paymentTermsDays?: number; notes?: string; items: Array<{ productName: string; quantity: number; unitCost: number; uomCode?: string }> }>>(`/procurement/purchase-orders/${row.id}`);
      const full = res.data;
      setEditForm({
        expectedDelivery: full.expectedDelivery?.slice(0, 10) ?? "",
        deliveryAddress: full.deliveryAddress ?? "",
        paymentTermsDays: full.paymentTermsDays?.toString() ?? "",
        notes: full.notes ?? "",
      });
      setEditItems(full.items.map((it) => ({ productName: it.productName, quantity: String(it.quantity), uomCode: it.uomCode ?? "", unitCost: String(it.unitCost) })));
      setEditError("");
      setEditRow(row);
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to load order for editing.");
    } finally {
      setBusy(null);
    }
  }

  const ef = (k: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [k]: e.target.value }));
  function setEditItem(i: number, k: keyof POItem, v: string) {
    setEditItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addEditItem() { setEditItems((p) => [...p, { productName: "", quantity: "1", uomCode: "PCS", unitCost: "" }]); }
  function removeEditItem(i: number) { setEditItems((p) => p.filter((_, idx) => idx !== i)); }
  const editLineTotal = (it: POItem) => Number(it.quantity || 0) * Number(it.unitCost || 0);
  const editSubtotal = editItems.reduce((s, it) => s + editLineTotal(it), 0);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/procurement/purchase-orders/${editRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedDelivery: editForm.expectedDelivery || undefined,
          deliveryAddress: editForm.deliveryAddress || undefined,
          paymentTermsDays: editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : undefined,
          notes: editForm.notes || undefined,
          items: editItems.map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            uomCode: it.uomCode || undefined,
            unitCost: Number(it.unitCost),
          })),
        }),
      });
      invalidateCache("/procurement/purchase-orders", true);
      setEditRow(null);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!deleteRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/procurement/purchase-orders/${deleteRow.id}`, { method: "DELETE" });
      invalidateCache("/procurement/purchase-orders", true);
      setDeleteRow(null);
      load();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete purchase order.");
    } finally {
      setDeleting(false);
    }
  }

  const statuses = ["", "DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "REJECTED"];

  return (
    <>
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
        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
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
              { key: "reference", label: "Reference", render: (r) => <Link href={`/procurement/purchase-orders/${r.id}`} className="font-semibold text-brand hover:underline">{r.reference as string}</Link> },
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
                          onClick={() => setRejectId(r.id as string)}
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
                    {canManage && r.status === "PENDING_APPROVAL" && (
                      <button
                        type="button"
                        onClick={() => startEdit(r as unknown as PurchaseOrder)}
                        disabled={busy === r.id}
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/70 disabled:opacity-50 hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    {canManage && ["PENDING_APPROVAL", "CANCELLED"].includes(r.status as string) && (
                      <button
                        type="button"
                        onClick={() => { setDeleteError(""); setDeleteRow(r as unknown as PurchaseOrder); }}
                        disabled={busy === r.id}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 disabled:opacity-50 hover:bg-red-100"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
            rows={rows as Record<string, unknown>[]}
            loading={loading}
            empty="No purchase orders yet"
          />
        </div>
        {deleteError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{deleteError}</div>
        )}
      </div>
      <RejectReasonModal open={!!rejectId} onClose={() => setRejectId(null)} onConfirm={confirmReject} loading={rejecting} />

      <Modal open={!!editRow} onClose={() => !savingEdit && setEditRow(null)} title={`Edit ${editRow?.reference ?? "Purchase Order"}`} size="lg">
        <form onSubmit={saveEdit} className="space-y-4">
          {editError && (
            <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{editError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FormLabel>Expected Delivery</FormLabel>
              <input type="date" value={editForm.expectedDelivery} onChange={ef("expectedDelivery")} className={inputCls} />
            </div>
            <div>
              <FormLabel>Payment Terms (days)</FormLabel>
              <input type="number" min={0} value={editForm.paymentTermsDays} onChange={ef("paymentTermsDays")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Delivery Address</FormLabel>
              <input value={editForm.deliveryAddress} onChange={ef("deliveryAddress")} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Notes</FormLabel>
              <textarea value={editForm.notes} onChange={ef("notes")} rows={2} className={inputCls} />
            </div>
          </div>

          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink/45">Line Items</h3>
              <button type="button" onClick={addEditItem} className="app-button-secondary py-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </div>
            <div className="divide-y divide-line">
              {editItems.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3">
                  <div className="col-span-12 sm:col-span-5">
                    <FormLabel>Product *</FormLabel>
                    <input required value={it.productName} onChange={(e) => setEditItem(i, "productName", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Qty *</FormLabel>
                    <input required type="number" min={0.01} step={0.01} value={it.quantity} onChange={(e) => setEditItem(i, "quantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.uomCode} onChange={(e) => setEditItem(i, "uomCode", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Cost *</FormLabel>
                    <input required type="number" min={0} step={0.01} value={it.unitCost} onChange={(e) => setEditItem(i, "unitCost", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-12 flex items-end justify-between sm:col-span-2">
                    <p className="text-sm font-bold text-ink">{money(editLineTotal(it))}</p>
                    {editItems.length > 1 && (
                      <button type="button" onClick={() => removeEditItem(i)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-red-600 hover:bg-red-100">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-line px-4 py-3">
              <p className="text-sm font-bold text-ink">Total: {money(editSubtotal)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="app-button-secondary" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancel</button>
            <button type="submit" disabled={savingEdit} className="app-button-primary">{savingEdit ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete purchase order?"
        message={`This will permanently remove "${deleteRow?.reference}". This can't be undone.`}
        confirmLabel="Delete order"
      />
    </>
  );
}

// ─── Create Purchase Order ────────────────────────────────────────────────────

type POItem = { productName: string; quantity: string; uomCode: string; unitCost: string };

export function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { opts, optionsError } = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", expectedDelivery: "",
    paymentTermsDays: "", notes: "",
  });
  const [items, setItems] = useState<POItem[]>([{ productName: "", quantity: "1", uomCode: "PCS", unitCost: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof POItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { productName: "", quantity: "1", uomCode: "PCS", unitCost: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const lineTotal = (it: POItem) => Number(it.quantity || 0) * Number(it.unitCost || 0);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/procurement/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierId: form.supplierId,
          expectedDelivery: form.expectedDelivery || undefined,
          paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
          notes: form.notes || undefined,
          items: items.map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            uomCode: it.uomCode || undefined,
            unitCost: Number(it.unitCost),
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
    
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="New Purchase Order"
          subtitle="Create a formal order for a supplier"
          actions={<Link href="/procurement/purchase-orders" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {optionsError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {optionsError}
          </div>
        )}
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
                <FormLabel>Expected Delivery</FormLabel>
                <input type="date" value={form.expectedDelivery} onChange={f("expectedDelivery")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Payment Terms (days)</FormLabel>
                <input type="number" min={0} value={form.paymentTermsDays} onChange={f("paymentTermsDays")} placeholder="e.g. 30" className={inputCls} />
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
                  <div className="col-span-12 sm:col-span-5">
                    <FormLabel>Product Name *</FormLabel>
                    <input required value={it.productName} onChange={(e) => setItem(i, "productName", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Qty *</FormLabel>
                    <input required type="number" min={0.01} step={0.01} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.uomCode} onChange={(e) => setItem(i, "uomCode", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Unit Cost *</FormLabel>
                    <input required type="number" min={0} step={0.01} value={it.unitCost} onChange={(e) => setItem(i, "unitCost", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 flex items-end justify-between sm:col-span-2">
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

  );
}

// ─── Purchase Order Details ────────────────────────────────────────────────────

const PO_EDITABLE_STATUSES = ["PENDING_APPROVAL"];
const PO_DELETABLE_STATUSES = ["PENDING_APPROVAL", "CANCELLED"];

type PurchaseOrderDetail = {
  id: string;
  reference: string;
  orderDate: string;
  expectedDelivery?: string;
  deliveryAddress?: string;
  status: string;
  subtotal: number;
  totalAmount: number;
  currency: string;
  paymentTermsDays?: number;
  notes?: string;
  rejectionReason?: string;
  supplier: { id: string; name: string; code: string };
  purchaseRequest?: { id: string; reference: string; title: string };
  items: Array<{ id: string; productName: string; quantity: number; unitCost: number; lineTotal: number; uomCode?: string; receivedQty: number }>;
  grnRecords: Array<{ id: string; reference: string; status: string; receivedDate: string }>;
  invoices: Array<{ id: string; reference: string; invoiceNumber: string; status: string; totalAmount: number }>;
  approvals: Array<{ id: string; status: string; comments?: string; createdAt: string; approver?: { fullName: string } }>;
};

export function PurchaseOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const canManage = profile?.hasGlobalAccess || (profile?.permissions ?? []).includes("procurement.manage");

  const [po, setPo] = useState<PurchaseOrderDetail | null>(() => getCachedFirst<ApiEnvelope<PurchaseOrderDetail>>(`/procurement/purchase-orders/${params.id}`)?.data ?? null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ expectedDelivery: "", deliveryAddress: "", paymentTermsDays: "", notes: "" });
  const [editItems, setEditItems] = useState<POItem[]>([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    setLoadError("");
    try {
      const res = await apiFetch<ApiEnvelope<PurchaseOrderDetail>>(`/procurement/purchase-orders/${params.id}`);
      setPo(res.data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load purchase order.");
    }
  }
  useEffect(() => { load(); }, [params.id]);
  useApiRecovery(!po, load);

  function startEdit() {
    if (!po) return;
    setEditForm({
      expectedDelivery: po.expectedDelivery?.slice(0, 10) ?? "",
      deliveryAddress: po.deliveryAddress ?? "",
      paymentTermsDays: po.paymentTermsDays?.toString() ?? "",
      notes: po.notes ?? "",
    });
    setEditItems(po.items.map((it) => ({ productName: it.productName, quantity: String(it.quantity), uomCode: it.uomCode ?? "", unitCost: String(it.unitCost) })));
    setEditError("");
    setEditing(true);
  }

  const f = (k: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm((p) => ({ ...p, [k]: e.target.value }));

  function setEditItem(i: number, k: keyof POItem, v: string) {
    setEditItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addEditItem() { setEditItems((p) => [...p, { productName: "", quantity: "1", uomCode: "PCS", unitCost: "" }]); }
  function removeEditItem(i: number) { setEditItems((p) => p.filter((_, idx) => idx !== i)); }
  const editLineTotal = (it: POItem) => Number(it.quantity || 0) * Number(it.unitCost || 0);
  const editSubtotal = editItems.reduce((s, it) => s + editLineTotal(it), 0);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError("");
    try {
      await apiFetch(`/procurement/purchase-orders/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedDelivery: editForm.expectedDelivery || undefined,
          deliveryAddress: editForm.deliveryAddress || undefined,
          paymentTermsDays: editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : undefined,
          notes: editForm.notes || undefined,
          items: editItems.map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            uomCode: it.uomCode || undefined,
            unitCost: Number(it.unitCost),
          })),
        }),
      });
      invalidateCache("/procurement/purchase-orders", true);
      setEditing(false);
      await load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/procurement/purchase-orders/${params.id}`, { method: "DELETE" });
      invalidateCache("/procurement/purchase-orders", true);
      router.push("/procurement/purchase-orders");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete purchase order.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const canEdit = canManage && !!po && PO_EDITABLE_STATUSES.includes(po.status);
  const canDelete = canManage && !!po && PO_DELETABLE_STATUSES.includes(po.status);

  return (
    <>
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title={po?.reference ?? "Purchase Order"}
          subtitle={po?.supplier?.name}
          actions={
            <>
              <Link href="/procurement/purchase-orders" className="app-button-secondary">Back</Link>
              {canEdit && !editing && (
                <button type="button" onClick={startEdit} className="app-button-secondary">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => { setDeleteError(""); setConfirmDelete(true); }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </>
          }
        />
        <ProcurementNav />

        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>
        )}
        {deleteError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{deleteError}</div>
        )}
        {canManage && po && !canEdit && !canDelete && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50">
            <LockedNote reason="Editing and deleting are only available while an order is pending approval or cancelled." />
            <span>This order is {po.status.replace(/_/g, " ").toLowerCase()} — editing and deleting are no longer available.</span>
          </div>
        )}

        {editing ? (
          <form onSubmit={saveEdit} className="space-y-5">
            {editError && (
              <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{editError}</div>
            )}
            <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
              <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-ink/45">Order Details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <FormLabel>Expected Delivery</FormLabel>
                  <input type="date" value={editForm.expectedDelivery} onChange={f("expectedDelivery")} className={inputCls} />
                </div>
                <div>
                  <FormLabel>Payment Terms (days)</FormLabel>
                  <input type="number" min={0} value={editForm.paymentTermsDays} onChange={f("paymentTermsDays")} className={inputCls} />
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <FormLabel>Delivery Address</FormLabel>
                  <input value={editForm.deliveryAddress} onChange={f("deliveryAddress")} className={inputCls} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <FormLabel>Notes</FormLabel>
                  <textarea value={editForm.notes} onChange={f("notes")} rows={2} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white shadow-panel">
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Line Items</h2>
                <button type="button" onClick={addEditItem} className="app-button-secondary py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </button>
              </div>
              <div className="divide-y divide-line">
                {editItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 px-6 py-4">
                    <div className="col-span-12 sm:col-span-5">
                      <FormLabel>Product Name *</FormLabel>
                      <input required value={it.productName} onChange={(e) => setEditItem(i, "productName", e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <FormLabel>Qty *</FormLabel>
                      <input required type="number" min={0.01} step={0.01} value={it.quantity} onChange={(e) => setEditItem(i, "quantity", e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <FormLabel>Unit</FormLabel>
                      <input value={it.uomCode} onChange={(e) => setEditItem(i, "uomCode", e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <FormLabel>Unit Cost *</FormLabel>
                      <input required type="number" min={0} step={0.01} value={it.unitCost} onChange={(e) => setEditItem(i, "unitCost", e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-6 flex items-end justify-between sm:col-span-2">
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-ink/40 font-bold">Line</p>
                        <p className="text-sm font-bold text-ink">{money(editLineTotal(it))}</p>
                      </div>
                      {editItems.length > 1 && (
                        <button type="button" onClick={() => removeEditItem(i)} className="ml-2 mb-0.5 rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-red-600 hover:bg-red-100">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-line px-6 py-4">
                <div className="text-right">
                  <p className="text-xs uppercase font-bold tracking-wide text-ink/45">Order Total</p>
                  <p className="text-2xl font-extrabold text-ink">{money(editSubtotal)}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={savingEdit} className="app-button-primary">{savingEdit ? "Saving…" : "Save changes"}</button>
              <button type="button" className="app-button-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-white p-6 shadow-panel">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">Order Details</h2>
                {po && <StatusBadge status={po.status} />}
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Supplier</dt><dd className="mt-0.5 text-sm text-ink">{po?.supplier ? <Link href={`/procurement/suppliers/${po.supplier.id}`} className="text-brand hover:underline">{po.supplier.name}</Link> : "—"}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Order Date</dt><dd className="mt-0.5 text-sm text-ink">{fmt(po?.orderDate)}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Expected Delivery</dt><dd className="mt-0.5 text-sm text-ink">{fmt(po?.expectedDelivery)}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Payment Terms</dt><dd className="mt-0.5 text-sm text-ink">{po?.paymentTermsDays != null ? `${po.paymentTermsDays} days` : "—"}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Total</dt><dd className="mt-0.5 text-sm font-bold text-ink">{po ? money(po.totalAmount) : "—"}</dd></div>
                {po?.purchaseRequest && (
                  <div><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Purchase Request</dt><dd className="mt-0.5 text-sm text-ink">{po.purchaseRequest.reference}</dd></div>
                )}
                <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Delivery Address</dt><dd className="mt-0.5 text-sm text-ink">{po?.deliveryAddress || "—"}</dd></div>
                {po?.notes && (
                  <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Notes</dt><dd className="mt-0.5 text-sm text-ink">{po.notes}</dd></div>
                )}
                {po?.rejectionReason && (
                  <div className="sm:col-span-2 lg:col-span-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Rejection Reason</dt><dd className="mt-0.5 text-sm text-red-700">{po.rejectionReason}</dd></div>
                )}
              </dl>
            </div>

            <div className="rounded-2xl border border-line bg-white shadow-panel">
              <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Line Items</h2></div>
              <DataTable
                columns={[
                  { key: "productName", label: "Product" },
                  { key: "quantity", label: "Qty" },
                  { key: "uomCode", label: "Unit" },
                  { key: "unitCost", label: "Unit Cost", render: (r) => money(r.unitCost) },
                  { key: "lineTotal", label: "Line Total", render: (r) => money(r.lineTotal) },
                  { key: "receivedQty", label: "Received" },
                ]}
                rows={(po?.items ?? []) as Record<string, unknown>[]}
                loading={!po}
                empty="No line items"
              />
            </div>

            {(po?.grnRecords?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-line bg-white shadow-panel">
                <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Goods Received</h2></div>
                <DataTable
                  columns={[
                    { key: "reference", label: "Reference" },
                    { key: "receivedDate", label: "Received", render: (r) => fmt(r.receivedDate as string) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                  ]}
                  rows={(po?.grnRecords ?? []) as Record<string, unknown>[]}
                  loading={false}
                  empty="No goods received yet"
                />
              </div>
            )}

            {(po?.invoices?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-line bg-white shadow-panel">
                <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Invoices</h2></div>
                <DataTable
                  columns={[
                    { key: "invoiceNumber", label: "Invoice #" },
                    { key: "totalAmount", label: "Total", render: (r) => money(r.totalAmount) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
                  ]}
                  rows={(po?.invoices ?? []) as Record<string, unknown>[]}
                  loading={false}
                  empty="No invoices yet"
                />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete purchase order?"
        message={`This will permanently remove "${po?.reference}". This can't be undone.`}
        confirmLabel="Delete order"
      />
    </>
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
  const [rows, setRows] = useState<GRN[]>(() => getCachedFirst<ApiEnvelope<GRN[]>>("/procurement/grns")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/grns"));
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [loadError, setLoadError] = useState("");
  const [failId, setFailId] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);

  function load() {
    setLoadError("");
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<GRN[]>>(`/procurement/grns${q}`)
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);
  useApiRecovery(rows.length === 0, load);

  async function confirmFail(qualityNotes: string) {
    if (!failId) return;
    setFailing(true);
    setActionErr("");
    try {
      await apiFetch(`/procurement/grns/${failId}/quality-fail`, { method: "PATCH", body: JSON.stringify({ qualityNotes }) });
      setFailId(null);
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Action failed");
    } finally {
      setFailing(false);
    }
  }

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
    <>
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
        {loadError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {loadError}
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
                          onClick={() => setFailId(r.id as string)}
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
            loading={loading}
            empty="No GRNs yet"
          />
        </div>
      </div>
      <RejectReasonModal
        open={!!failId}
        onClose={() => setFailId(null)}
        onConfirm={confirmFail}
        loading={failing}
        title="Fail Quality Check"
        label="Quality Notes *"
        placeholder="What failed inspection and why?"
        confirmLabel="Fail"
        busyLabel="Failing…"
      />
    </>
  );
}

// ─── Create GRN ───────────────────────────────────────────────────────────────

type GRNItem = { productName: string; orderedQty: string; receivedQty: string; uomCode: string; unitCost: string };
type POOption = { id: string; reference: string };

export function CreateGRNPage() {
  const router = useRouter();
  const { opts, optionsError } = useProcurementOptions();
  const [poOptions, setPoOptions] = useState<POOption[]>([]);
  const [form, setForm] = useState({
    supplierId: "", warehouseId: "", purchaseOrderId: "",
    receivedDate: "", notes: "",
  });
  const [items, setItems] = useState<GRNItem[]>([{ productName: "", orderedQty: "", receivedQty: "1", uomCode: "PCS", unitCost: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadPoOptions(supplierId: string) {
    const p = new URLSearchParams({ status: "SENT_TO_SUPPLIER" });
    if (supplierId) p.set("supplierId", supplierId);
    try {
      const r = await apiFetch<ApiEnvelope<POOption[]>>(`/procurement/purchase-orders?${p}`);
      setPoOptions(r.data ?? []);
      setForm((prev) => (r.data ?? []).some((po) => po.id === prev.purchaseOrderId) ? prev : { ...prev, purchaseOrderId: "" });
    } catch {
      // leave poOptions as-is — useApiRecovery below retries once the API is back
    }
  }

  useEffect(() => {
    void loadPoOptions(form.supplierId);
  }, [form.supplierId]);

  // This had no recovery path at all — a transient failure left the PO
  // dropdown permanently empty (GRN creation unsubmittable) until the user
  // happened to change the supplier filter, re-running this effect.
  useApiRecovery(poOptions.length === 0, () => loadPoOptions(form.supplierId));

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  function setItem(i: number, k: keyof GRNItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }
  function addItem() { setItems((p) => [...p, { productName: "", orderedQty: "", receivedQty: "1", uomCode: "PCS", unitCost: "" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // supplierId is UI-only (not part of CreateGRNDto) — purchaseOrderId is
      // required by the backend, a GRN can't be logged without one.
      await apiFetch("/procurement/grns", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: form.purchaseOrderId,
          warehouseId: form.warehouseId,
          receivedDate: form.receivedDate || undefined,
          notes: form.notes || undefined,
          items: items.map((it) => ({
            productName: it.productName,
            orderedQty: Number(it.orderedQty),
            receivedQty: Number(it.receivedQty),
            uomCode: it.uomCode || undefined,
            unitCost: Number(it.unitCost),
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
    
      <div className="space-y-5">
        <PageHero
          kicker="Procurement"
          title="Record GRN"
          subtitle="Log goods received from a supplier"
          actions={<Link href="/procurement/grns" className="app-button-secondary">Cancel</Link>}
        />
        <ProcurementNav />
        {optionsError && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {optionsError}
          </div>
        )}
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
                <FormLabel>Purchase Order *</FormLabel>
                <select required value={form.purchaseOrderId} onChange={f("purchaseOrderId")} className={inputCls}>
                  <option value="">— Select —</option>
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
                    <FormLabel>Product Name *</FormLabel>
                    <input required value={it.productName} onChange={(e) => setItem(i, "productName", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Ordered Qty *</FormLabel>
                    <input required type="number" min={0} step={0.01} value={it.orderedQty} onChange={(e) => setItem(i, "orderedQty", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <FormLabel>Received Qty *</FormLabel>
                    <input required type="number" min={0.01} step={0.01} value={it.receivedQty} onChange={(e) => setItem(i, "receivedQty", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <FormLabel>Unit</FormLabel>
                    <input value={it.uomCode} onChange={(e) => setItem(i, "uomCode", e.target.value)} className={inputCls} />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <FormLabel>Unit Cost *</FormLabel>
                    <input required type="number" min={0} step={0.01} value={it.unitCost} onChange={(e) => setItem(i, "unitCost", e.target.value)} className={inputCls} />
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
  const [rows, setRows] = useState<SupplierInvoice[]>(() => getCachedFirst<ApiEnvelope<SupplierInvoice[]>>("/procurement/invoices")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/invoices"));
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { opts, optionsError } = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "",
    subtotal: "", taxAmount: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    const q = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<ApiEnvelope<SupplierInvoice[]>>(`/procurement/invoices${q}`)
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [statusFilter]);
  useApiRecovery(rows.length === 0, load);

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
          supplierId: form.supplierId,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate || undefined,
          subtotal: Number(form.subtotal),
          taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
          notes: form.notes || undefined,
        }),
      });
      setShowForm(false);
      setForm({ supplierId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", taxAmount: "", notes: "" });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const statuses = ["", "PENDING", "MATCHED", "APPROVED", "PAID", "DISPUTED", "OVERDUE"];

  return (
    
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
        {(loadError || optionsError) && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError || optionsError}
          </div>
        )}
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
                <FormLabel>Supplier *</FormLabel>
                <select required value={form.supplierId} onChange={f("supplierId")} className={inputCls}>
                  <option value="">— Select —</option>
                  {opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <FormLabel>Invoice Number *</FormLabel>
                <input required value={form.invoiceNumber} onChange={f("invoiceNumber")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Subtotal *</FormLabel>
                <input required type="number" min={0} step={0.01} value={form.subtotal} onChange={f("subtotal")} className={inputCls} />
              </div>
              <div>
                <FormLabel>Tax Amount</FormLabel>
                <input type="number" min={0} step={0.01} value={form.taxAmount} onChange={f("taxAmount")} className={inputCls} placeholder="Optional" />
              </div>
              <div>
                <FormLabel>Invoice Date *</FormLabel>
                <input required type="date" value={form.invoiceDate} onChange={f("invoiceDate")} className={inputCls} />
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
            loading={loading}
            empty="No invoices yet"
          />
        </div>
      </div>
    
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
  const [rows, setRows] = useState<ProcurementPayment[]>(() => getCachedFirst<ApiEnvelope<ProcurementPayment[]>>("/procurement/payments")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/payments"));
  const [showForm, setShowForm] = useState(false);
  const { opts, optionsError } = useProcurementOptions();
  const [form, setForm] = useState({
    supplierId: "", amount: "", paymentDate: "",
    paymentMethod: "BANK_TRANSFER", bankAccountId: "", description: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  // H9: lets a client-side retry (after a timeout, before we know whether the
  // first attempt landed) safely resend the same payment without double-
  // recording it. Regenerated after each successful submit for the next one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<ProcurementPayment[]>>("/procurement/payments")
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useApiRecovery(rows.length === 0, load);

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
          supplierId: form.supplierId,
          amount: Number(form.amount),
          paymentDate: form.paymentDate,
          paymentMethod: form.paymentMethod,
          bankAccountId: form.bankAccountId || undefined,
          description: form.description,
          notes: form.notes || undefined,
          idempotencyKey,
        }),
      });
      setShowForm(false);
      setForm({ supplierId: "", amount: "", paymentDate: "", paymentMethod: "BANK_TRANSFER", bankAccountId: "", description: "", notes: "" });
      setIdempotencyKey(crypto.randomUUID());
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    
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
        {(loadError || optionsError) && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError || optionsError}
          </div>
        )}
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
              <div className="sm:col-span-2 lg:col-span-3">
                <FormLabel>Description *</FormLabel>
                <input required value={form.description} onChange={f("description")} className={inputCls} placeholder="e.g. Payment against invoice INV-2026-0042" maxLength={240} />
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
            loading={loading}
            empty="No payments recorded yet"
          />
        </div>
      </div>
    
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
  const [rows, setRows] = useState<PerformanceRecord[]>(() => getCachedFirst<ApiEnvelope<PerformanceRecord[]>>("/procurement/performance")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/performance"));
  const { opts, optionsError } = useProcurementOptions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    supplierId: "", period: "", rating: "GOOD", onTimeDelivery: true,
    qualityScore: "80", priceCompetitiveness: "", responsiveness: "",
    totalOrders: "", lateDeliveries: "", rejectedItems: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PerformanceRecord[]>>("/procurement/performance")
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useApiRecovery(rows.length === 0, load);

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
        {(loadError || optionsError) && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError || optionsError}
          </div>
        )}
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
            loading={loading}
            empty="No performance records yet"
          />
        </div>
      </div>
    
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
  const [rows, setRows] = useState<PriceHistoryRow[]>(() => getCachedFirst<ApiEnvelope<PriceHistoryRow[]>>("/procurement/price-history")?.data ?? []);
  const [loading, setLoading] = useState(!hasCached("/procurement/price-history"));
  const { opts, optionsError } = useProcurementOptions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierId: "", productName: "", unitPrice: "", currency: "GHS", effectiveDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  function load() {
    setLoadError("");
    apiFetch<ApiEnvelope<PriceHistoryRow[]>>("/procurement/price-history")
      .then((r) => { const fresh = r.data ?? []; setRows((prev) => fresh.length === 0 && prev.length > 0 ? prev : fresh); })
      .catch((err: any) => setLoadError(err?.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  useApiRecovery(rows.length === 0, load);

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
        {(loadError || optionsError) && (
          <div className="rounded-xl border-l-[3px] border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError || optionsError}
          </div>
        )}
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
            loading={loading}
            empty="No price history yet"
          />
        </div>
      </div>
    
  );
}
