"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  CheckCircle2,
  Clock,
  Download,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Warehouse,
  Zap
} from "lucide-react";
import { InventoryShell } from "./inventory-shell";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type LowStockRow = {
  id: string;
  sku: string;
  product: string;
  warehouse: string;
  quantityOnHand: number;
  reorderLevel: number;
};

type ExpiryRow = {
  id: string;
  daysToExpiry: number;
  expiryDate: string;
  product: { sku: string; name: string } | null;
  warehouse: { name: string } | null;
  stockBatch: { batchNumber: string; quantityRemaining: string | number } | null;
};

type MovementRow = {
  id: string;
  movementType: string;
  quantity: string | number;
  unitCost: string | number | null;
  movementDate: string;
  product: { sku: string; name: string } | null;
  warehouse: { name: string } | null;
};

type WeekMovement = { date: string; type: string };
type StatRow = { status: string; count: number };

type DashboardData = {
  skuCount: number;
  itemCount: number;
  totalQuantity: number;
  inventoryValue: number;
  lowStockCount: number;
  expiryAlertCount: number;
  pendingApprovals: number;
  movementsToday: number;
  recentMovements: MovementRow[];
  lowStock: LowStockRow[];
  expiryAlerts: ExpiryRow[];
  weekMovements: WeekMovement[];
  adjustmentStats: StatRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, decimals = 0) {
  return (n ?? 0).toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtGhs(n: number | undefined | null) {
  return `GHS ${fmt(n, 2)}`;
}

function buildActivityTrend(raw: WeekMovement[], days = 7) {
  const result: Array<{ label: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      value: raw.filter((m) => String(m.date).slice(0, 10) === dateStr).length
    });
  }
  return result;
}

function movementTypeColor(type: string) {
  const map: Record<string, string> = {
    PURCHASE_RECEIPT: "bg-emerald-100 text-emerald-800",
    OPENING_BALANCE: "bg-blue-100 text-blue-800",
    PRODUCTION_OUTPUT: "bg-teal-100 text-teal-800",
    PRODUCTION_INPUT: "bg-purple-100 text-purple-800",
    ADJUSTMENT_IN: "bg-sky-100 text-sky-800",
    ADJUSTMENT_OUT: "bg-orange-100 text-orange-800",
    SALE_DISPATCH: "bg-pink-100 text-pink-800",
    TRANSFER: "bg-indigo-100 text-indigo-800",
    WASTE: "bg-red-100 text-red-800"
  };
  return map[type] ?? "bg-gray-100 text-gray-700";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type KpiColor = "default" | "green" | "red" | "amber" | "blue" | "purple" | "teal";

function KpiCard({
  label, value, sub, icon: Icon, color = "default", href
}: {
  label: string; value: string; sub?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any; color?: KpiColor; href?: string;
}) {
  const styles: Record<KpiColor, { wrap: string; icon: string; dot: string; val: string }> = {
    default: { wrap: "from-white border-line",           icon: "bg-brand/10 text-brand",         dot: "bg-brand",       val: "text-ink" },
    green:   { wrap: "from-emerald-50 border-emerald-200", icon: "bg-emerald-100 text-emerald-600", dot: "bg-emerald-400", val: "text-emerald-700" },
    red:     { wrap: "from-red-50 border-red-200",       icon: "bg-red-100 text-red-600",        dot: "bg-red-400",     val: "text-red-700" },
    amber:   { wrap: "from-amber-50 border-amber-200",   icon: "bg-amber-100 text-amber-600",    dot: "bg-amber-400",   val: "text-caution" },
    blue:    { wrap: "from-blue-50 border-blue-200",     icon: "bg-blue-100 text-blue-600",      dot: "bg-blue-400",    val: "text-blue-700" },
    purple:  { wrap: "from-purple-50 border-purple-200", icon: "bg-purple-100 text-purple-600",  dot: "bg-purple-400",  val: "text-purple-700" },
    teal:    { wrap: "from-teal-50 border-teal-200",     icon: "bg-teal-100 text-teal-600",      dot: "bg-teal-400",    val: "text-teal-700" }
  };
  const s = styles[color];
  const inner = (
    <article className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b ${s.wrap} to-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft`}>
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm ${s.icon}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <span className={`h-2 w-2 rounded-full ${s.dot} mt-0.5 opacity-70`} />
      </div>
      <strong className={`mt-4 block text-[26px] font-extrabold leading-none tracking-tight ${s.val}`}>
        {value}
      </strong>
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink/50 leading-snug">{label}</p>
      {sub && <p className="mt-1 truncate text-xs text-ink/40">{sub}</p>}
    </article>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function AlertBanners({ data }: { data: DashboardData }) {
  const hasAlerts = data.lowStockCount > 0 || data.expiryAlertCount > 0 || data.pendingApprovals > 0;
  if (!hasAlerts) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 border-l-[3px] border-l-amber-500 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <span className="text-sm font-bold text-amber-800">Inventory attention required</span>
      </div>
      <div className="divide-y divide-amber-50/80">
        {data.pendingApprovals > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{data.pendingApprovals}</span> stock adjustment{data.pendingApprovals > 1 ? "s" : ""} awaiting approval
              </span>
            </div>
            <Link href="/inventory/adjustments" className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        {data.lowStockCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{data.lowStockCount}</span> item{data.lowStockCount > 1 ? "s" : ""} below reorder level
              </span>
            </div>
            <Link href="/inventory/low-stock" className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              View low stock <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        {data.expiryAlertCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-sm text-ink/70">
                <span className="font-bold text-ink">{data.expiryAlertCount}</span> batch{data.expiryAlertCount > 1 ? "es" : ""} expiring within 45 days
              </span>
            </div>
            <Link href="/inventory/expiry-alerts" className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
              View expiry <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const total = points.reduce((s, p) => s + p.value, 0);
  const W = 500, PL = 10, PB = 72, PT = 8;
  const chartW = W - PL - 10;
  const chartH = PB - PT;
  const pts = points.map((p, i) => ({
    x: PL + (i / Math.max(points.length - 1, 1)) * chartW,
    y: PB - (p.value / max) * chartH
  }));
  const ptStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="app-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h4 className="text-sm font-bold text-ink">7-Day Movement Activity</h4>
        <span className="text-xs font-semibold text-ink/40">{total} movements this week</span>
      </div>
      <div className="px-4 pb-3 pt-4">
        <svg viewBox={`0 0 ${W} ${PB + 18}`} className="h-28 w-full" aria-label="Activity trend">
          <defs>
            <linearGradient id="inv-activity-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0.5, 1].map((t) => (
            <line key={t} x1={PL} y1={PB - t * chartH} x2={W - 10} y2={PB - t * chartH}
              stroke="#eadfd2" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          <line x1={PL} y1={PB} x2={W - 10} y2={PB} stroke="#eadfd2" strokeWidth="1.5" />
          {pts.length > 1 && (
            <>
              <polygon points={`${pts[0].x},${PB} ${ptStr} ${pts[pts.length - 1].x},${PB}`} fill="url(#inv-activity-grad)" />
              <polyline points={ptStr} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke="#3b82f6" strokeWidth="2" />)}
            </>
          )}
        </svg>
        <div className="mt-1 flex justify-between">
          {points.map((p, i) => <span key={i} className="text-[10px] text-ink/35">{p.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function AdjustmentStatus({ stats }: { stats: StatRow[] }) {
  const total = stats.reduce((s, r) => s + r.count, 0);
  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      PENDING_APPROVAL: "bg-amber-100 text-amber-800",
      APPROVED: "bg-emerald-100 text-emerald-800",
      REJECTED: "bg-red-100 text-red-700"
    };
    return map[s] ?? "bg-gray-100 text-gray-700";
  };
  return (
    <div className="app-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink">Adjustment Status</h4>
        <Link href="/inventory/adjustments" className="text-xs font-semibold text-brand hover:underline">View all →</Link>
      </div>
      <div className="space-y-3">
        {stats.sort((a, b) => b.count - a.count).map((row) => (
          <div key={row.status} className="flex items-center gap-2">
            <span className={`min-w-[120px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${statusColor(row.status)}`}>
              {row.status.replace(/_/g, " ")}
            </span>
            <div className="flex-1 overflow-hidden rounded-full bg-line" style={{ height: 6 }}>
              <div className="h-full rounded-full bg-brand/50 transition-all duration-700" style={{ width: total > 0 ? `${(row.count / total) * 100}%` : "0%" }} />
            </div>
            <span className="w-6 text-right text-xs font-extrabold text-ink">{row.count}</span>
          </div>
        ))}
        {stats.length === 0 && <p className="text-xs text-ink/40">No adjustments yet</p>}
      </div>
    </div>
  );
}

function LowStockTable({ rows }: { rows: LowStockRow[] }) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Low Stock Items</h3>
          <p className="text-xs text-ink/40">Products below their reorder point</p>
        </div>
        <Link href="/inventory/low-stock" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left">
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">SKU</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Product</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">On Hand</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Reorder At</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink/40">
                  All items are sufficiently stocked.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const stockPct = row.reorderLevel > 0 ? (row.quantityOnHand / row.reorderLevel) * 100 : 0;
              const urgency = stockPct < 25 ? "text-red-700" : "text-amber-700";
              const barColor = stockPct < 25 ? "bg-red-500" : "bg-amber-400";
              return (
                <tr key={row.id} className="transition hover:bg-field/50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{row.sku}</td>
                  <td className="px-4 py-3 font-medium">{row.product}</td>
                  <td className="px-4 py-3 text-xs text-ink/60">{row.warehouse}</td>
                  <td className={`px-4 py-3 text-right text-base font-extrabold ${urgency}`}>{fmt(row.quantityOnHand)}</td>
                  <td className="px-4 py-3 text-right text-ink/55">{fmt(row.reorderLevel)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${Math.min(stockPct, 100)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold ${urgency}`}>{Math.round(stockPct)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExpiryTable({ rows }: { rows: ExpiryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Expiry Alerts</h3>
          <p className="text-xs text-ink/40">Stock batches expiring within 45 days</p>
        </div>
        <Link href="/inventory/expiry-alerts" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left">
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Product</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Batch</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Qty Remaining</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Expiry Date</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Days Left</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const urgent = row.daysToExpiry <= 7;
              const warning = row.daysToExpiry <= 14;
              return (
                <tr key={row.id} className="transition hover:bg-field/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{row.product?.name ?? "—"}</p>
                    <p className="text-xs text-ink/50">{row.product?.sku}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.stockBatch?.batchNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-ink/60">{row.warehouse?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {fmt(Number(row.stockBatch?.quantityRemaining ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(row.expiryDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${urgent ? "bg-red-100 text-red-700" : warning ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`}>
                      {row.daysToExpiry}d
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentMovementsTable({ movements }: { movements: MovementRow[] }) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Recent Movements</h3>
          <p className="text-xs text-ink/40">Latest stock events across all warehouses</p>
        </div>
        <Link href="/inventory/movements" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-field/60 text-left">
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Type</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Product</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Warehouse</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Qty</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-ink/45">Unit Cost</th>
              <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink/40">No movements recorded yet.</td>
              </tr>
            )}
            {movements.map((row) => (
              <tr key={row.id} className="transition hover:bg-field/50">
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${movementTypeColor(row.movementType)}`}>
                    {row.movementType.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold">{row.product?.name ?? "—"}</p>
                  <p className="text-[11px] text-ink/50">{row.product?.sku}</p>
                </td>
                <td className="px-4 py-3 text-xs text-ink/60">{row.warehouse?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(Number(row.quantity))}</td>
                <td className="px-4 py-3 text-right text-xs text-ink/55">
                  {row.unitCost ? fmtGhs(Number(row.unitCost)) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-ink/50">
                  {new Date(row.movementDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { href: "/inventory/stock-in",      label: "Stock In",   icon: Package,      color: "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
    { href: "/inventory/stock-out",     label: "Stock Out",  icon: ShoppingCart, color: "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" },
    { href: "/inventory/transfers",     label: "Transfer",   icon: Truck,        color: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100" },
    { href: "/inventory/adjustments",   label: "Adjustment", icon: CheckCircle2, color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { href: "/inventory/items/create",  label: "New Item",   icon: Box,          color: "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { href: "/inventory/low-stock",     label: "Low Stock",  icon: Zap,          color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
    { href: "/inventory/valuation",     label: "Valuation",  icon: TrendingUp,   color: "text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { href: "/inventory/reports",       label: "Reports",    icon: BarChart3,    color: "text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100" }
  ];
  return (
    <section className="mb-8">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-ink">Quick Entry</h3>
        <p className="text-xs text-ink/40">Jump to any data entry screen</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow ${a.color}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {a.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function InventoryDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<ApiEnvelope<DashboardData>>("/inventory/dashboard");
      setData(response.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const activityTrend = buildActivityTrend(data?.weekMovements ?? []);

  return (
    <InventoryShell>
      {/* Premium hero header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-white via-white to-field shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="max-w-xl">
            <p className="app-kicker flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
              Operations · Inventory
            </p>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-ink">
              Inventory Management
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/55">
              Stock balances, FIFO valuation, movements, low stock, expiry alerts, and approvals
            </p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="app-button-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Loading…" : `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
          </button>
        </div>
      </div>

      {error && <div className="app-alert-warning mb-6">{error}</div>}

      {data && <AlertBanners data={data} />}

      {/* KPI Row 1 */}
      <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Inventory Value" value={fmtGhs(data?.inventoryValue ?? 0)} sub="FIFO basis" icon={TrendingUp} color="blue" href="/inventory/valuation" />
        <KpiCard label="Unique SKUs" value={String(data?.skuCount ?? 0)} sub="Active products tracked" icon={Box} color="teal" href="/inventory/items" />
        <KpiCard label="Inventory Items" value={String(data?.itemCount ?? 0)} sub="Warehouse × product slots" icon={Warehouse} color="purple" href="/inventory/items" />
        <KpiCard label="Total Quantity" value={fmt(data?.totalQuantity ?? 0)} sub="All locations combined" icon={Package} href="/inventory/items" />
      </section>

      {/* KPI Row 2 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Low Stock Items" value={String(data?.lowStockCount ?? 0)} sub="Below reorder level" icon={Zap} color={(data?.lowStockCount ?? 0) > 0 ? "amber" : "green"} href="/inventory/low-stock" />
        <KpiCard label="Expiry Alerts" value={String(data?.expiryAlertCount ?? 0)} sub="Expiring within 45 days" icon={Clock} color={(data?.expiryAlertCount ?? 0) > 0 ? "red" : "green"} href="/inventory/expiry-alerts" />
        <KpiCard label="Pending Approvals" value={String(data?.pendingApprovals ?? 0)} sub="Adjustments awaiting sign-off" icon={CheckCircle2} color={(data?.pendingApprovals ?? 0) > 0 ? "amber" : "green"} href="/inventory/adjustments" />
        <KpiCard label="Movements Today" value={String(data?.movementsToday ?? 0)} sub="Stock events recorded today" icon={Download} color={(data?.movementsToday ?? 0) > 0 ? "blue" : "default"} href="/inventory/movements" />
      </section>

      {/* Activity Chart + Adjustment Status */}
      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityChart points={activityTrend} />
        </div>
        <AdjustmentStatus stats={data?.adjustmentStats ?? []} />
      </section>

      <LowStockTable rows={data?.lowStock ?? []} />
      <ExpiryTable rows={data?.expiryAlerts ?? []} />
      <RecentMovementsTable movements={data?.recentMovements ?? []} />
      <QuickActions />
    </InventoryShell>
  );
}
