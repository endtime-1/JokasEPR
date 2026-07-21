"use client";

import { ChangeEvent, ComponentType, FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowUpRight, ChartBar, CircleCheck, ChevronRight,
  Clock, DollarSign, Download, FileText, Package, Plus,
  RefreshCw, ShoppingCart, TrendingUp, Users, Wallet,
} from "lucide-react";
import { ApiEnvelope, apiFetch, downloadReport, getCached, hasCached } from "../lib/api";
import { AppShell } from "./app-shell";
import { DataTable } from "./data-table";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function money(value: unknown) {
  return `GHS ${Number(value ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function PageHero({ kicker, title, subtitle, actions }: { kicker: string; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
        <div>
          <p className="app-kicker flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            {kicker}
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/55">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap items-start gap-2 pt-1">{actions}</div>}
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
  brand:   { wrap: "from-brand/10",   icon: "bg-brand/15 text-brand",          dot: "bg-brand" },
  indigo:  { wrap: "from-indigo-50",  icon: "bg-indigo-100 text-indigo-600",   dot: "bg-indigo-500" },
};

function KpiCard({ label, value, Icon, color, sub }: { label: string; value: string | number; Icon?: ComponentType<{ className?: string }>; color: KpiColor; sub?: string }) {
  const s = KPI_STYLES[color];
  return (
    <article className={`rounded-2xl border border-line bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card`}>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : <div className="h-10 w-10" />}
        <span className={`mt-1 h-2 w-2 rounded-full ${s.dot}`} />
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</p>
      <strong className="mt-1 block text-[26px] font-extrabold leading-none tracking-tight text-ink">{value}</strong>
      {sub && <p className="mt-1 text-xs text-ink/45">{sub}</p>}
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    PENDING_STOCK_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
    APPROVED:               "bg-blue-100 text-blue-700 border-blue-200",
    FULFILLED:              "bg-emerald-100 text-emerald-700 border-emerald-200",
    CANCELLED:              "bg-gray-100 text-gray-500 border-gray-200",
    DRAFT:                  "bg-gray-100 text-gray-600 border-gray-200",
    ISSUED:                 "bg-blue-100 text-blue-700 border-blue-200",
    PARTIALLY_PAID:         "bg-amber-100 text-amber-800 border-amber-200",
    PAID:                   "bg-emerald-100 text-emerald-700 border-emerald-200",
    OVERDUE:                "bg-red-100 text-red-700 border-red-200",
    RELEASED:               "bg-emerald-100 text-emerald-700 border-emerald-200",
    POSTED:                 "bg-emerald-100 text-emerald-700 border-emerald-200",
    ACTIVE:                 "bg-emerald-100 text-emerald-700 border-emerald-200",
    INACTIVE:               "bg-gray-100 text-gray-500 border-gray-200",
    ON_HOLD:                "bg-red-100 text-red-700 border-red-200",
    CASH:                   "bg-blue-100 text-blue-700 border-blue-200",
    BANK_TRANSFER:          "bg-indigo-100 text-indigo-700 border-indigo-200",
    MOBILE_MONEY:           "bg-purple-100 text-purple-700 border-purple-200",
    CHEQUE:                 "bg-amber-100 text-amber-800 border-amber-200",
    CREDIT_NOTE:            "bg-teal-100 text-teal-700 border-teal-200",
  };
  const c = colours[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const salesNavLinks = [
  { href: "/sales",               label: "Dashboard" },
  { href: "/sales/customers",     label: "Customers" },
  { href: "/sales/orders",        label: "Orders" },
  { href: "/sales/invoices",      label: "Invoices" },
  { href: "/sales/payments",      label: "Payments" },
  { href: "/sales/receipts",      label: "Receipts" },
  { href: "/sales/returns",       label: "Returns" },
  { href: "/sales/debtors",       label: "Debtors" },
  { href: "/sales/delivery-notes",label: "Delivery Notes" },
  { href: "/sales/statements",    label: "Statements" },
  { href: "/sales/reports",       label: "Reports" },
];

function SalesNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-1.5">
      {salesNavLinks.map((n) => {
        const isActive =
          n.href === "/sales"
            ? pathname === "/sales"
            : pathname === n.href || (pathname?.startsWith(n.href + "/") ?? false);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-brand/30 bg-brand text-white"
                : "border-line bg-white text-ink/70 hover:border-brand/20 hover:bg-field hover:text-ink"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

const inputCls = "min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10";
const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45";

function FormLabel({ children }: { children: ReactNode }) {
  return <label className={labelCls}>{children}</label>;
}

// ─── Options ──────────────────────────────────────────────────────────────────

type Opt = { id: string; code?: string; sku?: string; name?: string; invoiceNumber?: string; balanceDue?: string | number; customerId?: string; product?: { sku: string; name: string }; customerGroup?: { code: string; name: string } };

type SalesOptions = {
  branches: Opt[];
  warehouses: Opt[];
  products: Opt[];
  customerGroups: Opt[];
  customers: Opt[];
  priceLists: Opt[];
  invoices: Opt[];
};

function useSalesOptions() {
  const [opts, setOpts] = useState<SalesOptions>({ branches: [], warehouses: [], products: [], customerGroups: [], customers: [], priceLists: [], invoices: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<SalesOptions>>("/sales/options").then((r) => setOpts(r.data ?? { branches: [], warehouses: [], products: [], customerGroups: [], customers: [], priceLists: [], invoices: [] })).catch(() => undefined);
  }, []);
  return opts;
}

function optLabel(o: Opt) {
  const code = o.code ?? o.sku ?? o.invoiceNumber ?? o.product?.sku ?? "";
  const name = o.name ?? o.product?.name ?? o.customerGroup?.name ?? "";
  const bal = o.balanceDue ? ` — ${money(o.balanceDue)}` : "";
  return `${code} ${name}${bal}`.trim();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type DashOrder = { id: string; orderNumber: string; status: string; totalAmount: number; balanceDue: number; orderDate: string; customer?: { name: string }; warehouse?: { name: string } };
type TopRow   = { name?: string; sku?: string; totalQty?: number; totalRevenue?: number; totalAmount?: number; orderCount?: number };

type DashData = {
  salesValue: number;
  paidValue: number;
  outstandingDebt: number;
  returnValue: number;
  pendingStockApprovals: number;
  fulfilledOrders: number;
  recentOrders: DashOrder[];
  topProducts: TopRow[];
  topCustomers: TopRow[];
};

export function SalesDashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      // Sales service double-wraps: controller { data: service { data: {...} } }
      const raw = await apiFetch<{ data: { data: DashData } | DashData }>("/sales/dashboard");
      const inner = (raw.data as { data?: DashData }).data ?? (raw.data as DashData);
      setData(inner);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const salesValue  = Number(data?.salesValue ?? 0);
  const paidValue   = Number(data?.paidValue ?? 0);
  const outstanding = Number(data?.outstandingDebt ?? 0);
  const returnValue = Number(data?.returnValue ?? 0);
  const collectRate = salesValue > 0 ? Math.min((paidValue / salesValue) * 100, 100) : 0;

  const maxProductRev  = Math.max(...(data?.topProducts ?? []).map((p) => Number(p.totalRevenue ?? p.totalAmount ?? 0)), 1);
  const maxCustomerRev = Math.max(...(data?.topCustomers ?? []).map((c) => Number(c.totalAmount ?? c.totalRevenue ?? 0)), 1);

  const today = new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const quickLinks = [
    { href: "/sales/orders/create",  label: "New Order",       Icon: Plus,         cls: "border-brand/20 bg-brand/5 text-brand hover:bg-brand/10" },
    { href: "/sales/customers/create", label: "New Customer",  Icon: Users,        cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { href: "/sales/payments",       label: "Record Payment",  Icon: Wallet,       cls: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
    { href: "/sales/debtors",        label: "View Debtors",    Icon: AlertTriangle,cls: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
    { href: "/sales/invoices",       label: "Invoices",        Icon: FileText,     cls: "border-line bg-white text-ink/70 hover:bg-field" },
    { href: "/sales/reports",        label: "Reports",         Icon: ChartBar,    cls: "border-line bg-white text-ink/70 hover:bg-field" },
  ];

  return (
    <AppShell>
      {/* ── Hero ── */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <p className="app-kicker flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Commercial · Sales
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">Sales Dashboard</h1>
            <p className="mt-1 text-sm text-ink/45">{today}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <button onClick={load} disabled={loading} className="app-button-secondary text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link href="/sales/orders/create" className="app-button-primary">
              <Plus className="h-4 w-4" /> New Order
            </Link>
          </div>
        </div>

        {/* Collection rate strip */}
        {data && salesValue > 0 && (
          <div className="border-t border-line/60 bg-field/40 px-6 py-3">
            <div className="flex items-center justify-between text-xs text-ink/55 mb-1.5">
              <span>Collection rate — {paidValue > 0 ? `${collectRate.toFixed(1)}% of invoiced value collected` : "No collections yet"}</span>
              <span className="font-semibold">{money(paidValue)} / {money(salesValue)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all ${collectRate >= 80 ? "bg-emerald-500" : collectRate >= 50 ? "bg-amber-400" : "bg-red-500"}`}
                style={{ width: `${collectRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <SalesNav />

      {/* ── Alerts ── */}
      {error && <div className="app-alert-warning mb-5">{error}</div>}

      {data && data.pendingStockApprovals > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="flex-1 text-sm font-medium text-ink">
              {data.pendingStockApprovals} order{data.pendingStockApprovals > 1 ? "s" : ""} awaiting storekeeper stock approval
            </p>
            <Link href="/sales/orders" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 transition">
              Review →
            </Link>
          </div>
        </div>
      )}

      {data && outstanding > 0 && (
        <div className="mb-6 rounded-2xl border border-red-200 border-l-[3px] border-l-red-500 bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
            <p className="flex-1 text-sm font-medium text-ink">
              <span className="font-bold">{money(outstanding)}</span> outstanding across customer invoices
            </p>
            <Link href="/sales/debtors" className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition">
              View debtors →
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI cards ── */}
      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sales (Invoiced)"  value={money(salesValue)}   Icon={DollarSign}    color="brand" />
        <KpiCard label="Collected"         value={money(paidValue)}    Icon={CircleCheck}   color="emerald" sub={salesValue > 0 ? `${collectRate.toFixed(1)}% collected` : undefined} />
        <KpiCard label="Outstanding Debt"  value={money(outstanding)}  Icon={AlertTriangle} color={outstanding > 0 ? "red" : "blue"} />
        <KpiCard label="Returns Value"     value={money(returnValue)}  Icon={RefreshCw}     color="amber" />
      </section>

      {/* ── Activity row ── */}
      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className={`flex items-center gap-4 rounded-2xl border p-5 shadow-card ${data && data.pendingStockApprovals > 0 ? "border-amber-200 bg-amber-50/40" : "border-line bg-white"}`}>
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${data && data.pendingStockApprovals > 0 ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Pending Approvals</p>
            <p className="mt-0.5 text-2xl font-extrabold text-ink">{data?.pendingStockApprovals ?? 0}</p>
            <p className="text-xs text-ink/45">orders awaiting stock release</p>
          </div>
          <Link href="/sales/orders?status=PENDING_STOCK_APPROVAL" className="shrink-0">
            <ChevronRight className="h-5 w-5 text-ink/30" />
          </Link>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <Package className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/45">Fulfilled Orders</p>
            <p className="mt-0.5 text-2xl font-extrabold text-ink">{data?.fulfilledOrders ?? 0}</p>
            <p className="text-xs text-ink/45">completed with invoices &amp; delivery notes</p>
          </div>
          <Link href="/sales/orders?status=FULFILLED" className="shrink-0">
            <ChevronRight className="h-5 w-5 text-ink/30" />
          </Link>
        </div>
      </section>

      {/* ── Main panels ── */}
      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Recent orders */}
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand" />
              <h3 className="font-semibold text-ink">Recent Orders</h3>
            </div>
            <Link href="/sales/orders" className="flex items-center gap-0.5 text-xs font-medium text-brand hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="divide-y divide-line">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-9 w-9 animate-pulse rounded-xl bg-line" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-line" />
                    <div className="h-2.5 w-48 animate-pulse rounded bg-line" />
                  </div>
                  <div className="h-3 w-20 animate-pulse rounded bg-line" />
                </div>
              ))}
            </div>
          ) : (data?.recentOrders ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
                <ShoppingCart className="h-7 w-7 text-brand" />
              </div>
              <p className="text-sm font-medium text-ink">No sales orders yet</p>
              <p className="max-w-xs text-xs text-ink/45">Create your first sales order to start tracking revenue and stock releases.</p>
              <Link href="/sales/orders/create" className="app-button-primary mt-1">
                <Plus className="h-4 w-4" /> Create First Order
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {(data?.recentOrders ?? []).map((o) => (
                <div key={o.id} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-field/40">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${o.status === "PENDING_STOCK_APPROVAL" ? "bg-amber-100" : o.status === "FULFILLED" ? "bg-emerald-100" : "bg-brand/10"}`}>
                    <ShoppingCart className={`h-4 w-4 ${o.status === "PENDING_STOCK_APPROVAL" ? "text-amber-600" : o.status === "FULFILLED" ? "text-emerald-600" : "text-brand"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{o.orderNumber}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink/50">
                      {o.customer?.name ?? "—"}
                      {o.warehouse?.name ? ` · ${o.warehouse.name}` : ""}
                      {` · ${fmt(o.orderDate)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink">{money(o.totalAmount)}</p>
                    {Number(o.balanceDue) > 0 && (
                      <p className="text-[11px] text-red-500">Due {money(o.balanceDue)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top products + top customers */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChartBar className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-ink">Top Products</h3>
              </div>
              <Link href="/sales/reports" className="text-xs text-brand hover:underline">See report →</Link>
            </div>
            {(data?.topProducts ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-ink/40">No product sales data</p>
            ) : (
              <div className="space-y-3">
                {(data?.topProducts ?? []).slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-[10px] font-bold text-ink/30">{i + 1}</span>
                    <p className="w-28 shrink-0 truncate text-xs text-ink/70">{p.name ?? p.sku ?? "—"}</p>
                    <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 5 }}>
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(Number(p.totalRevenue ?? p.totalAmount ?? 0) / maxProductRev) * 100}%` }} />
                    </div>
                    <p className="w-16 shrink-0 text-right text-[11px] font-semibold text-ink">{money(p.totalRevenue ?? p.totalAmount ?? 0)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-ink">Top Customers</h3>
              </div>
              <Link href="/sales/customers" className="text-xs text-brand hover:underline">All customers →</Link>
            </div>
            {(data?.topCustomers ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-ink/40">No customer revenue data</p>
            ) : (
              <div className="space-y-3">
                {(data?.topCustomers ?? []).slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-[10px] font-bold text-ink/30">{i + 1}</span>
                    <p className="w-28 shrink-0 truncate text-xs text-ink/70">{c.name ?? "—"}</p>
                    <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 5 }}>
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(Number(c.totalAmount ?? c.totalRevenue ?? 0) / maxCustomerRev) * 100}%` }} />
                    </div>
                    <p className="w-16 shrink-0 text-right text-[11px] font-semibold text-ink">{money(c.totalAmount ?? c.totalRevenue ?? 0)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {quickLinks.map(({ href, label, Icon, cls }) => (
          <Link key={href} href={href} className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold transition ${cls}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        ))}
      </section>
    </AppShell>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────

type Customer = {
  id: string; code: string; name: string; phone?: string; email?: string; status: string;
  branch?: { name: string }; customerGroup?: { name: string };
  creditLimits?: Array<{ creditLimit: number; currentBalance: number }>;
};

export function CustomersPage({ create = false }: { create?: boolean }) {
  const opts = useSalesOptions();
  const router = useRouter();
  const [rows, setRows] = useState<Customer[]>(() => getCached<ApiEnvelope<Customer[]>>("/sales/customers")?.data ?? []);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ branchId: "", customerGroupId: "", code: "", name: "", phone: "", email: "", address: "", creditLimit: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!hasCached("/sales/customers"));

  async function load() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    apiFetch<ApiEnvelope<Customer[]>>(`/sales/customers?${p}`).then((r) => setRows(r.data ?? [])).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, [search]);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/sales/customers", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branchId: form.branchId || opts.branches[0]?.id,
          customerGroupId: form.customerGroupId || undefined,
          creditLimit: form.creditLimit ? Number(form.creditLimit) : 0,
        }),
      });
      router.push("/sales/customers");
    } catch (e2: unknown) { setError(e2 instanceof Error ? e2.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (create) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl">
          <PageHero
            kicker="Commercial · Sales"
            title="New Customer"
            subtitle="Register a new customer account with contact details, group assignment, and credit limit."
            actions={<Link href="/sales/customers" className="app-button-secondary text-xs">← Back</Link>}
          />
          {error && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="rounded-2xl border border-line bg-white p-6 shadow-panel">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><FormLabel>Branch *</FormLabel>
                <select required value={form.branchId || opts.branches[0]?.id || ""} onChange={f("branchId")} className={inputCls}>
                  {opts.branches.map((b) => <option key={b.id} value={b.id}>{b.code} {b.name}</option>)}
                </select>
              </div>
              <div><FormLabel>Customer Group</FormLabel>
                <select value={form.customerGroupId} onChange={f("customerGroupId")} className={inputCls}>
                  <option value="">— None —</option>
                  {opts.customerGroups.map((g) => <option key={g.id} value={g.id}>{g.code} {g.name}</option>)}
                </select>
              </div>
              <div><FormLabel>Code *</FormLabel><input required value={form.code} onChange={f("code")} placeholder="e.g. CUST-001" className={inputCls} /></div>
              <div><FormLabel>Name *</FormLabel><input required value={form.name} onChange={f("name")} className={inputCls} /></div>
              <div><FormLabel>Phone</FormLabel><input value={form.phone} onChange={f("phone")} className={inputCls} /></div>
              <div><FormLabel>Email</FormLabel><input type="email" value={form.email} onChange={f("email")} className={inputCls} /></div>
              <div className="sm:col-span-2"><FormLabel>Address</FormLabel><input value={form.address} onChange={f("address")} className={inputCls} /></div>
              <div><FormLabel>Credit Limit (GHS)</FormLabel><input type="number" min={0} step="0.01" value={form.creditLimit} onChange={f("creditLimit")} className={inputCls} /></div>
            </div>
            <button type="submit" disabled={saving} className="mt-5 app-button-primary disabled:opacity-50">
              {saving ? "Saving…" : "Create Customer"}
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title="Customers"
        subtitle="Customer accounts, credit limits, transaction history, and group classifications."
        actions={<Link href="/sales/customers/create" className="app-button-primary"><Plus className="h-4 w-4" /> New Customer</Link>}
      />
      <SalesNav />

      <div className="mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" className="w-72 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "code",          label: "Code" },
            { key: "name",          label: "Name", render: (r) => <Link href={`/sales/customers/${r.id}`} className="font-medium text-brand hover:underline">{r.name as string}</Link> },
            { key: "group",         label: "Group",   render: (r) => (r.customerGroup as { name: string } | undefined)?.name ?? "—" },
            { key: "branch",        label: "Branch",  render: (r) => (r.branch as { name: string } | undefined)?.name ?? "—" },
            { key: "phone",         label: "Phone",   render: (r) => String(r.phone ?? "—") },
            { key: "email",         label: "Email",   render: (r) => String(r.email ?? "—") },
            { key: "creditLimit",   label: "Credit Limit", render: (r) => { const cl = (r.creditLimits as Array<{ creditLimit: number }> | undefined)?.[0]; return cl ? money(cl.creditLimit) : "—"; } },
            { key: "status",        label: "Status",  render: (r) => <StatusBadge status={r.status as string} /> },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No customers yet"
          loading={loading}
        />
      </div>
    </AppShell>
  );
}

// ─── Customer Details ─────────────────────────────────────────────────────────

type CustomerDetail = Customer & {
  address?: string; email?: string;
  salesOrders: Array<{ id: string; orderNumber: string; status: string; totalAmount: number; balanceDue: number; orderDate: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; totalAmount: number; paidAmount: number; balanceDue: number; invoiceDate: string }>;
  payments: Array<{ id: string; paymentNumber: string; amount: number; method: string; paymentDate: string }>;
  statements: Array<{ id: string; type: string; description: string; amount: number; runningBalance: number; entryDate: string }>;
};

export function CustomerDetailsPage({ id }: { id: string }) {
  const [cust, setCust] = useState<CustomerDetail | null>(null);
  const [tab, setTab] = useState("orders");

  useEffect(() => {
    apiFetch<ApiEnvelope<CustomerDetail>>(`/sales/customers/${id}`)
      .then((r) => setCust(r.data)).catch(() => undefined);
  }, [id]);

  if (!cust) return <AppShell><div className="flex h-64 items-center justify-center text-sm text-ink/45">Loading customer…</div></AppShell>;

  const creditLimit = cust.creditLimits?.[0];
  const utilization = creditLimit && Number(creditLimit.creditLimit) > 0
    ? (Number(creditLimit.currentBalance) / Number(creditLimit.creditLimit)) * 100
    : null;

  const tabs = [
    { key: "orders",     label: `Orders (${cust.salesOrders?.length ?? 0})` },
    { key: "invoices",   label: `Invoices (${cust.invoices?.length ?? 0})` },
    { key: "payments",   label: `Payments (${cust.payments?.length ?? 0})` },
    { key: "statement",  label: `Statement (${cust.statements?.length ?? 0})` },
  ];

  return (
    <AppShell>
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
          <div>
            <p className="app-kicker flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Commercial · Sales · Customer
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{cust.name}</h1>
              <StatusBadge status={cust.status} />
            </div>
            <p className="mt-1 text-sm text-ink/55">
              {cust.code}
              {cust.customerGroup?.name && ` · ${cust.customerGroup.name}`}
              {cust.branch?.name && ` · ${cust.branch.name}`}
              {cust.phone && ` · ${cust.phone}`}
            </p>
          </div>
          <Link href="/sales/customers" className="app-button-secondary text-xs">← Customers</Link>
        </div>

        {creditLimit && (
          <div className="border-t border-line/60 bg-field/40 px-6 py-4">
            <div className="flex items-center justify-between text-xs text-ink/55 mb-1.5">
              <span>Credit utilization</span>
              <span className="font-semibold">{money(creditLimit.currentBalance)} / {money(creditLimit.creditLimit)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all ${(utilization ?? 0) >= 90 ? "bg-red-500" : (utilization ?? 0) >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(utilization ?? 0, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-4 py-2.5 text-sm font-medium transition ${tab === t.key ? "border-b-2 border-brand text-brand" : "text-ink/55 hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <DataTable
            columns={[
              { key: "orderNumber", label: "Order No." },
              { key: "status",      label: "Status",  render: (r) => <StatusBadge status={r.status as string} /> },
              { key: "totalAmount", label: "Total",   render: (r) => money(r.totalAmount) },
              { key: "balanceDue",  label: "Balance", render: (r) => money(r.balanceDue) },
              { key: "orderDate",   label: "Date",    render: (r) => fmt(r.orderDate as string) },
            ]}
            rows={cust.salesOrders as Record<string, unknown>[]}
            empty="No orders"
          />
        </div>
      )}

      {tab === "invoices" && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <DataTable
            columns={[
              { key: "invoiceNumber", label: "Invoice No." },
              { key: "status",        label: "Status",    render: (r) => <StatusBadge status={r.status as string} /> },
              { key: "totalAmount",   label: "Total",     render: (r) => money(r.totalAmount) },
              { key: "paidAmount",    label: "Paid",      render: (r) => money(r.paidAmount) },
              { key: "balanceDue",    label: "Balance",   render: (r) => money(r.balanceDue) },
              { key: "invoiceDate",   label: "Date",      render: (r) => fmt(r.invoiceDate as string) },
            ]}
            rows={cust.invoices as Record<string, unknown>[]}
            empty="No invoices"
          />
        </div>
      )}

      {tab === "payments" && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <DataTable
            columns={[
              { key: "paymentNumber", label: "Payment No." },
              { key: "amount",        label: "Amount",  render: (r) => money(r.amount) },
              { key: "method",        label: "Method",  render: (r) => <StatusBadge status={r.method as string} /> },
              { key: "paymentDate",   label: "Date",    render: (r) => fmt(r.paymentDate as string) },
            ]}
            rows={cust.payments as Record<string, unknown>[]}
            empty="No payments"
          />
        </div>
      )}

      {tab === "statement" && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <DataTable
            columns={[
              { key: "type",           label: "Type",        render: (r) => String(r.type ?? "—").replace(/_/g, " ") },
              { key: "description",    label: "Description" },
              { key: "amount",         label: "Amount",      render: (r) => money(r.amount) },
              { key: "runningBalance", label: "Balance",     render: (r) => money(r.runningBalance) },
              { key: "entryDate",      label: "Date",        render: (r) => fmt(r.entryDate as string) },
            ]}
            rows={cust.statements as Record<string, unknown>[]}
            empty="No statement entries"
          />
        </div>
      )}
    </AppShell>
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

type OrderItem = { productId: string; quantity: string; unitPrice: string; discountAmount: string };

type SalesOrder = {
  id: string; orderNumber: string; status: string; totalAmount: number; balanceDue: number;
  orderDate: string; customer?: { name: string }; warehouse?: { name: string };
  items?: Array<{ product?: { sku: string; name: string }; quantity: number; unitPrice: number; lineTotal: number }>;
};

export function OrdersPage({ create = false }: { create?: boolean }) {
  const opts = useSalesOptions();
  const router = useRouter();
  const [rows, setRows] = useState<SalesOrder[]>(() => getCached<ApiEnvelope<SalesOrder[]>>("/sales/orders")?.data ?? []);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ customerId: "", warehouseId: "", notes: "", discountAmount: "", taxAmount: "" });
  const [items, setItems] = useState<OrderItem[]>([{ productId: "", quantity: "", unitPrice: "", discountAmount: "0" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!hasCached("/sales/orders"));

  async function load() {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    apiFetch<ApiEnvelope<SalesOrder[]>>(`/sales/orders?${p}`).then((r) => setRows(r.data ?? [])).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, [status]);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function updateItem(i: number, k: keyof OrderItem, v: string) {
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  }

  function addItem() { setItems((p) => [...p, { productId: "", quantity: "", unitPrice: "", discountAmount: "0" }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const lineTotal = (it: OrderItem) => (Number(it.quantity) * Number(it.unitPrice)) - Number(it.discountAmount || 0);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const discount = Number(form.discountAmount || 0);
  const tax = Number(form.taxAmount || 0);
  const orderTotal = subtotal - discount + tax;

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const r = await apiFetch<ApiEnvelope<{ id: string }>>("/sales/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId || opts.customers[0]?.id,
          warehouseId: form.warehouseId || opts.warehouses[0]?.id,
          discountAmount: discount,
          taxAmount: tax,
          notes: form.notes,
          items: items.filter((it) => it.productId && it.quantity && it.unitPrice).map((it) => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            discountAmount: Number(it.discountAmount || 0),
          })),
        }),
      });
      router.push("/sales/orders");
      void r;
    } catch (e2: unknown) { setError(e2 instanceof Error ? e2.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function approve(id: string) {
    try {
      await apiFetch(`/sales/orders/${id}/approve-stock-release`, { method: "PATCH" });
      await load();
    } catch (e2: unknown) { setError(e2 instanceof Error ? e2.message : "Approval failed"); }
  }

  if (create) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <PageHero
            kicker="Commercial · Sales"
            title="New Sales Order"
            subtitle="Create a sales order with one or more line items. Stock release requires storekeeper approval."
            actions={<Link href="/sales/orders" className="app-button-secondary text-xs">← Back</Link>}
          />
          {error && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form onSubmit={submit} className="space-y-5">
            <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-ink">Order Details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><FormLabel>Customer *</FormLabel>
                  <select required value={form.customerId || opts.customers[0]?.id || ""} onChange={f("customerId")} className={inputCls}>
                    <option value="">— Select customer —</option>
                    {opts.customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </select>
                </div>
                <div><FormLabel>Warehouse *</FormLabel>
                  <select required value={form.warehouseId || opts.warehouses[0]?.id || ""} onChange={f("warehouseId")} className={inputCls}>
                    <option value="">— Select warehouse —</option>
                    {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>)}
                  </select>
                </div>
                <div><FormLabel>Order Discount (GHS)</FormLabel>
                  <input type="number" min={0} step="0.01" value={form.discountAmount} onChange={f("discountAmount")} className={inputCls} />
                </div>
                <div><FormLabel>Tax Amount (GHS)</FormLabel>
                  <input type="number" min={0} step="0.01" value={form.taxAmount} onChange={f("taxAmount")} className={inputCls} />
                </div>
                <div className="sm:col-span-2"><FormLabel>Notes</FormLabel>
                  <textarea value={form.notes} onChange={f("notes")} rows={2} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Line Items</h2>
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>
              <div className="space-y-3">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_100px_90px_80px_auto] items-end gap-3 rounded-xl bg-field/50 p-3">
                    <div><label className={labelCls}>Product</label>
                      <select value={it.productId} onChange={(e) => updateItem(i, "productId", e.target.value)} className={inputCls}>
                        <option value="">— Select product —</option>
                        {opts.products.map((p) => <option key={p.id} value={p.id}>{p.sku} {p.name}</option>)}
                      </select>
                    </div>
                    <div><label className={labelCls}>Qty</label>
                      <input type="number" min={1} step="1" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={inputCls} />
                    </div>
                    <div><label className={labelCls}>Unit Price</label>
                      <input type="number" min={0} step="0.01" value={it.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} className={inputCls} />
                    </div>
                    <div><label className={labelCls}>Discount</label>
                      <input type="number" min={0} step="0.01" value={it.discountAmount} onChange={(e) => updateItem(i, "discountAmount", e.target.value)} className={inputCls} />
                    </div>
                    <div><label className={labelCls}>Line Total</label>
                      <p className="min-h-10 flex items-center px-1 text-sm font-semibold text-ink">{money(lineTotal(it))}</p>
                    </div>
                    <div className="pb-1">
                      {items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-xs text-red-500 hover:underline">Remove</button>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col items-end gap-1.5 border-t border-line pt-4">
                <div className="flex items-center gap-8 text-sm">
                  <span className="text-ink/55">Subtotal</span>
                  <span className="font-semibold">{money(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center gap-8 text-sm">
                    <span className="text-ink/55">Discount</span>
                    <span className="font-semibold text-red-600">− {money(discount)}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex items-center gap-8 text-sm">
                    <span className="text-ink/55">Tax</span>
                    <span className="font-semibold">+ {money(tax)}</span>
                  </div>
                )}
                <div className="flex items-center gap-8 border-t border-line pt-2 text-base">
                  <span className="font-bold text-ink">Total</span>
                  <span className="text-[18px] font-extrabold text-brand">{money(orderTotal)}</span>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">
              {saving ? "Submitting…" : "Submit Sales Order"}
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  const selectCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title="Sales Orders"
        subtitle="Orders capture commercial intent; storekeepers approve stock release before invoice and delivery note posting."
        actions={<Link href="/sales/orders/create" className="app-button-primary"><Plus className="h-4 w-4" /> New Order</Link>}
      />
      <SalesNav />

      {error && <div className="mb-5 app-alert-warning">{error}</div>}

      <div className="mb-5">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {["PENDING_STOCK_APPROVAL", "APPROVED", "FULFILLED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "orderNumber", label: "Order No." },
            { key: "customer",    label: "Customer",  render: (r) => (r.customer as { name: string } | undefined)?.name ?? "—" },
            { key: "warehouse",   label: "Warehouse", render: (r) => (r.warehouse as { name: string } | undefined)?.name ?? "—" },
            { key: "status",      label: "Status",    render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "totalAmount", label: "Total",     render: (r) => money(r.totalAmount) },
            { key: "balanceDue",  label: "Balance",   render: (r) => money(r.balanceDue) },
            { key: "orderDate",   label: "Date",      render: (r) => fmt(r.orderDate as string) },
            { key: "actions",     label: "",          render: (r) => r.status === "PENDING_STOCK_APPROVAL"
              ? <button onClick={() => void approve(r.id as string)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition">Approve Stock</button>
              : null
            },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No sales orders"
          loading={loading}
        />
      </div>
    </AppShell>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────────

type Payment = { id: string; paymentNumber: string; amount: number; method: string; paymentDate: string; reference?: string; customer?: { name: string }; invoice?: { invoiceNumber: string } };

export function PaymentsPage() {
  const opts = useSalesOptions();
  const [rows, setRows] = useState<Payment[]>(() => getCached<ApiEnvelope<Payment[]>>("/sales/payments")?.data ?? []);
  const [form, setForm] = useState({ customerId: "", invoiceId: "", amount: "", method: "BANK_TRANSFER", reference: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(!hasCached("/sales/payments"));

  async function load() {
    apiFetch<ApiEnvelope<Payment[]>>("/sales/payments").then((r) => setRows(r.data ?? [])).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, []);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const customerInvoices = opts.invoices.filter((inv) => !form.customerId || inv.customerId === form.customerId);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/sales/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId || opts.customers[0]?.id,
          invoiceId: form.invoiceId || undefined,
          amount: Number(form.amount),
          method: form.method,
          reference: form.reference || undefined,
        }),
      });
      setForm({ customerId: "", invoiceId: "", amount: "", method: "BANK_TRANSFER", reference: "" });
      setShowForm(false);
      await load();
    } catch (e2: unknown) { setError(e2 instanceof Error ? e2.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title="Customer Payments"
        subtitle="Post customer collections against invoices. Receipt is auto-generated on payment posting."
        actions={
          <button onClick={() => setShowForm((p) => !p)} className={showForm ? "app-button-secondary" : "app-button-primary"}>
            {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> Record Payment</>}
          </button>
        }
      />
      <SalesNav />

      {showForm && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-5 text-base font-semibold text-ink">New Payment</h2>
          {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><FormLabel>Customer *</FormLabel>
              <select required value={form.customerId} onChange={f("customerId")} className={inputCls}>
                <option value="">— Select customer —</option>
                {opts.customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
            </div>
            <div><FormLabel>Invoice (optional)</FormLabel>
              <select value={form.invoiceId} onChange={f("invoiceId")} className={inputCls}>
                <option value="">— Unallocated —</option>
                {customerInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} — {money(inv.balanceDue)}</option>)}
              </select>
            </div>
            <div><FormLabel>Amount (GHS) *</FormLabel>
              <input required type="number" min={0.01} step="0.01" value={form.amount} onChange={f("amount")} className={inputCls} />
            </div>
            <div><FormLabel>Payment Method</FormLabel>
              <select value={form.method} onChange={f("method")} className={inputCls}>
                {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CREDIT_NOTE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div><FormLabel>Reference / Cheque No.</FormLabel>
              <input value={form.reference} onChange={f("reference")} className={inputCls} />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50 w-full">
                {saving ? "Posting…" : "Post Payment"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "paymentNumber", label: "Payment No." },
            { key: "customer",      label: "Customer",  render: (r) => (r.customer as { name: string } | undefined)?.name ?? "—" },
            { key: "invoice",       label: "Invoice",   render: (r) => (r.invoice as { invoiceNumber: string } | undefined)?.invoiceNumber ?? "—" },
            { key: "amount",        label: "Amount",    render: (r) => money(r.amount) },
            { key: "method",        label: "Method",    render: (r) => <StatusBadge status={r.method as string} /> },
            { key: "reference",     label: "Reference", render: (r) => String(r.reference ?? "—") },
            { key: "paymentDate",   label: "Date",      render: (r) => fmt(r.paymentDate as string) },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No payments recorded"
          loading={loading}
        />
      </div>
    </AppShell>
  );
}

// ─── Returns ──────────────────────────────────────────────────────────────────

type SalesReturn = { id: string; returnNumber?: string; reason: string; totalAmount: number; status: string; createdAt: string; customer?: { name: string }; product?: { name: string } };

export function ReturnsPage() {
  const opts = useSalesOptions();
  const [rows, setRows] = useState<SalesReturn[]>(() => getCached<ApiEnvelope<SalesReturn[]>>("/sales/returns")?.data ?? []);
  const [form, setForm] = useState({ customerId: "", warehouseId: "", productId: "", quantity: "", unitPrice: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(!hasCached("/sales/returns"));

  async function load() {
    apiFetch<ApiEnvelope<SalesReturn[]>>("/sales/returns").then((r) => setRows(r.data ?? [])).catch(() => undefined).finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, []);

  const f = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await apiFetch("/sales/returns", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId || opts.customers[0]?.id,
          warehouseId: form.warehouseId || opts.warehouses[0]?.id,
          productId: form.productId || opts.products[0]?.id,
          quantity: Number(form.quantity),
          unitPrice: Number(form.unitPrice),
          reason: form.reason,
          status: "POSTED",
        }),
      });
      setForm({ customerId: "", warehouseId: "", productId: "", quantity: "", unitPrice: "", reason: "" });
      setShowForm(false);
      await load();
    } catch (e2: unknown) { setError(e2 instanceof Error ? e2.message : "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title="Sales Returns"
        subtitle="Returned stock is posted back to inventory and a credit note is applied to the customer statement."
        actions={
          <button onClick={() => setShowForm((p) => !p)} className={showForm ? "app-button-secondary" : "app-button-primary"}>
            {showForm ? "Cancel" : <><Plus className="h-4 w-4" /> New Return</>}
          </button>
        }
      />
      <SalesNav />

      {showForm && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-panel">
          <h2 className="mb-5 text-base font-semibold text-ink">Post Sales Return</h2>
          {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
            <div><FormLabel>Customer *</FormLabel>
              <select required value={form.customerId} onChange={f("customerId")} className={inputCls}>
                <option value="">— Select —</option>
                {opts.customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
            </div>
            <div><FormLabel>Warehouse *</FormLabel>
              <select required value={form.warehouseId} onChange={f("warehouseId")} className={inputCls}>
                <option value="">— Select —</option>
                {opts.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>)}
              </select>
            </div>
            <div><FormLabel>Product *</FormLabel>
              <select required value={form.productId} onChange={f("productId")} className={inputCls}>
                <option value="">— Select —</option>
                {opts.products.map((p) => <option key={p.id} value={p.id}>{p.sku} {p.name}</option>)}
              </select>
            </div>
            <div><FormLabel>Quantity *</FormLabel>
              <input required type="number" min={1} value={form.quantity} onChange={f("quantity")} className={inputCls} />
            </div>
            <div><FormLabel>Unit Price (GHS) *</FormLabel>
              <input required type="number" min={0} step="0.01" value={form.unitPrice} onChange={f("unitPrice")} className={inputCls} />
            </div>
            <div><FormLabel>Reason *</FormLabel>
              <input required value={form.reason} onChange={f("reason")} className={inputCls} />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" disabled={saving} className="app-button-primary disabled:opacity-50">
                {saving ? "Posting…" : "Post Return"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <DataTable
          columns={[
            { key: "returnNumber",  label: "Return No.",  render: (r) => String(r.returnNumber ?? r.id as string).slice(0, 12) },
            { key: "customer",      label: "Customer",    render: (r) => (r.customer as { name: string } | undefined)?.name ?? "—" },
            { key: "product",       label: "Product",     render: (r) => (r.product as { name: string } | undefined)?.name ?? "—" },
            { key: "reason",        label: "Reason" },
            { key: "totalAmount",   label: "Total",       render: (r) => money(r.totalAmount) },
            { key: "status",        label: "Status",      render: (r) => <StatusBadge status={r.status as string} /> },
            { key: "createdAt",     label: "Date",        render: (r) => fmt(r.createdAt as string) },
          ]}
          rows={rows as Record<string, unknown>[]}
          empty="No sales returns"
          loading={loading}
        />
      </div>
    </AppShell>
  );
}

// ─── Generic List Pages (Invoices / Receipts / Debtors / Statements / Delivery Notes) ──

type ColDef = { key: string; label: string; render?: (r: Record<string, unknown>) => ReactNode };

function colsForEndpoint(endpoint: string): ColDef[] {
  if (endpoint.includes("invoices")) return [
    { key: "invoiceNumber", label: "Invoice No." },
    { key: "customer",      label: "Customer",  render: (r) => (r.customer as { name: string } | undefined)?.name ?? "—" },
    { key: "status",        label: "Status",    render: (r) => <StatusBadge status={r.status as string} /> },
    { key: "totalAmount",   label: "Total",     render: (r) => money(r.totalAmount) },
    { key: "paidAmount",    label: "Paid",      render: (r) => money(r.paidAmount) },
    { key: "balanceDue",    label: "Balance",   render: (r) => money(r.balanceDue) },
    { key: "invoiceDate",   label: "Date",      render: (r) => fmt(r.invoiceDate as string) },
    { key: "dueDate",       label: "Due",       render: (r) => fmt(r.dueDate as string) },
  ];
  if (endpoint.includes("receipts")) return [
    { key: "receiptNumber", label: "Receipt No." },
    { key: "customer",      label: "Customer",  render: (r) => (r.customer as { name: string } | undefined)?.name ?? "—" },
    { key: "amount",        label: "Amount",    render: (r) => money(r.amount) },
    { key: "receiptDate",   label: "Date",      render: (r) => fmt(r.receiptDate as string) },
  ];
  if (endpoint.includes("debtors")) return [
    { key: "customer",       label: "Customer",        render: (r) => (r.customer as { name: string; code: string } | undefined)?.name ?? String(r.customerName ?? "—") },
    { key: "invoiceNumber",  label: "Invoice",         render: (r) => String(r.invoiceNumber ?? "—") },
    { key: "totalAmount",    label: "Invoice Total",   render: (r) => money(r.totalAmount) },
    { key: "paidAmount",     label: "Paid",            render: (r) => money(r.paidAmount) },
    { key: "balanceDue",     label: "Balance Due",     render: (r) => <span className="font-semibold text-red-600">{money(r.balanceDue)}</span> },
    { key: "status",         label: "Status",          render: (r) => <StatusBadge status={r.status as string} /> },
    { key: "dueDate",        label: "Due Date",        render: (r) => fmt(r.dueDate as string) },
  ];
  if (endpoint.includes("statements")) return [
    { key: "customer",       label: "Customer",    render: (r) => (r.customer as { name: string } | undefined)?.name ?? String(r.customerName ?? "—") },
    { key: "type",           label: "Type",        render: (r) => String(r.type ?? "—").replace(/_/g, " ") },
    { key: "description",    label: "Description" },
    { key: "amount",         label: "Amount",      render: (r) => money(r.amount) },
    { key: "runningBalance", label: "Balance",     render: (r) => money(r.runningBalance) },
    { key: "entryDate",      label: "Date",        render: (r) => fmt(r.entryDate as string) },
  ];
  if (endpoint.includes("delivery-notes")) return [
    { key: "deliveryNumber", label: "Delivery No." },
    { key: "salesOrder",     label: "Order",       render: (r) => (r.salesOrder as { orderNumber: string } | undefined)?.orderNumber ?? "—" },
    { key: "warehouse",      label: "Warehouse",   render: (r) => (r.warehouse as { name: string } | undefined)?.name ?? "—" },
    { key: "status",         label: "Status",      render: (r) => <StatusBadge status={r.status as string} /> },
    { key: "createdAt",      label: "Date",        render: (r) => fmt(r.createdAt as string) },
  ];
  return [
    { key: "id",    label: "ID",   render: (r) => String(r.id ?? "").slice(0, 8) },
    { key: "createdAt", label: "Date", render: (r) => fmt(r.createdAt as string) },
  ];
}

export function SalesListPage({ title, endpoint, subtitle }: { title: string; endpoint: string; subtitle: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(endpoint)
      .then((r) => setRows(r.data ?? []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [endpoint]);

  const iconMap: Record<string, ComponentType<{ className?: string }>> = {
    Invoices: FileText,
    Receipts: Wallet,
    "Debtors Report": AlertTriangle,
    "Customer Statements": TrendingUp,
    "Delivery Notes": Package,
  };
  const HeroIcon = iconMap[title] ?? FileText;
  const cols = colsForEndpoint(endpoint);

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title={title}
        subtitle={subtitle}
        actions={
          title === "Invoices"
            ? <Link href="/sales/payments" className="app-button-primary"><Plus className="h-4 w-4" /> Record Payment</Link>
            : undefined
        }
      />
      <SalesNav />

      {title === "Debtors Report" && rows.some((r) => r.status === "OVERDUE") && (
        <div className="mb-5 rounded-2xl border border-red-200 border-l-[3px] border-l-red-500 bg-white p-4 shadow-card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-ink">Some invoices are overdue — follow up with customers to clear outstanding balances.</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {loading
          ? <div className="flex h-40 items-center justify-center text-sm text-ink/45">Loading {title.toLowerCase()}…</div>
          : <DataTable columns={cols} rows={rows} empty={`No ${title.toLowerCase()}`} />
        }
      </div>
    </AppShell>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

type SalesByRow = { name?: string; sku?: string; totalRevenue?: number; totalAmount?: number; totalQty?: number; orderCount?: number };

type ReportData = {
  byProduct: SalesByRow[];
  byCustomer: SalesByRow[];
  byLocation: Array<{ name?: string; branchName?: string; totalAmount?: number }>;
  salesperson: Array<{ name?: string; fullName?: string; totalAmount?: number; orderCount?: number }>;
};

export function SalesReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load(from = dateFrom, to = dateTo) {
    setLoading(true);
    apiFetch<ApiEnvelope<ReportData>>(`/sales/reports?dateFrom=${from}&dateTo=${to}`)
      .then((r) => setData(r.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const maxProduct = Math.max(...(data?.byProduct ?? []).map((r) => Number(r.totalRevenue ?? r.totalAmount ?? 0)), 1);
  const maxCustomer = Math.max(...(data?.byCustomer ?? []).map((r) => Number(r.totalRevenue ?? r.totalAmount ?? 0)), 1);
  const maxLocation = Math.max(...(data?.byLocation ?? []).map((r) => Number(r.totalAmount ?? 0)), 1);
  const maxSalesperson = Math.max(...(data?.salesperson ?? []).map((r) => Number(r.totalAmount ?? 0)), 1);

  const labelCls2 = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink/45";

  function BarList({ rows, valueKey, nameKey, color = "bg-brand" }: { rows: Record<string, unknown>[]; valueKey: string; nameKey: string; color?: string; max?: number }) {
    const max2 = Math.max(...rows.map((r) => Number(r[valueKey] ?? 0)), 1);
    return (
      <div className="space-y-3">
        {rows.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-3">
            <p className="w-36 shrink-0 truncate text-xs text-ink/70">{String(r[nameKey] ?? "—")}</p>
            <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 7 }}>
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(Number(r[valueKey] ?? 0) / max2) * 100}%` }} />
            </div>
            <p className="w-24 shrink-0 text-right text-xs font-semibold text-ink">{money(r[valueKey])}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink/45">No data for period</p>}
      </div>
    );
    void maxProduct; void maxCustomer; void maxLocation; void maxSalesperson; void max2;
  }

  return (
    <AppShell>
      <PageHero
        kicker="Commercial · Sales"
        title="Sales Reports"
        subtitle="Revenue analytics by product, customer, location, and salesperson for any custom date range."
        actions={
          <button onClick={() => downloadReport("/sales/reports/summary.csv", "sales-summary.csv")} className="app-button-secondary">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />
      <SalesNav />

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
        <div>
          <label className={labelCls2}>Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </div>
        <div>
          <label className={labelCls2}>Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-h-10 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
        </div>
        <button onClick={() => load(dateFrom, dateTo)} disabled={loading} className="app-button-primary disabled:opacity-50">
          {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</> : "Generate Report"}
        </button>
      </div>

      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-brand" />
              <h3 className="font-semibold text-ink">Revenue by Product</h3>
            </div>
            <BarList rows={data.byProduct as Record<string, unknown>[]} nameKey="name" valueKey="totalRevenue" color="bg-brand" />
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <h3 className="font-semibold text-ink">Revenue by Customer</h3>
            </div>
            <BarList rows={data.byCustomer as Record<string, unknown>[]} nameKey="name" valueKey="totalAmount" color="bg-emerald-500" />
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-indigo-600" />
              <h3 className="font-semibold text-ink">Revenue by Location</h3>
            </div>
            <BarList rows={data.byLocation as Record<string, unknown>[]} nameKey="name" valueKey="totalAmount" color="bg-indigo-500" />
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <h3 className="font-semibold text-ink">Salesperson Performance</h3>
            </div>
            <BarList rows={data.salesperson as Record<string, unknown>[]} nameKey="fullName" valueKey="totalAmount" color="bg-purple-500" />
          </div>
        </div>
      )}
    </AppShell>
  );
}
