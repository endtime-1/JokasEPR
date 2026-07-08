"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleArrowDown, CircleArrowUp, BadgeDollarSign, ChartBar, BookOpen, Building2, CircleCheck, DollarSign, FileChartColumn, FileText, Landmark, PiggyBank, TrendingDown, TrendingUp, Users, Wallet, CircleX } from "lucide-react";
import { FinanceShell } from "./finance-shell";
import { DataTable } from "./data-table";
import { FormField } from "./form-field";
import { ApiEnvelope, apiFetch } from "../lib/api";

// ─── Shared Types ────────────────────────────────────────────────────────────

type Option = { id: string; name?: string; code?: string; accountName?: string; bankName?: string; accountType?: string };

type FinanceOptions = {
  branches: Option[];
  bankAccounts: Option[];
  expenseCategories: Option[];
  accounts: Option[];
};

const inputClass = "min-h-11 rounded-md border border-line px-3 text-sm";
const selectClass = "min-h-11 rounded-md border border-line px-3 text-sm bg-white";
const btnPrimary = "inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";
const btnSecondary = "inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-field";

function useFinanceOptions() {
  const [options, setOptions] = useState<FinanceOptions>({ branches: [], bankAccounts: [], expenseCategories: [], accounts: [] });
  useEffect(() => {
    apiFetch<ApiEnvelope<FinanceOptions>>("/finance/options")
      .then((r) => setOptions(r.data))
      .catch(() => undefined);
  }, []);
  return options;
}

function money(v: unknown) {
  return `GHS ${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: unknown) {
  return `${Number(v ?? 0).toFixed(1)}%`;
}

function fmt(d: unknown) {
  if (!d) return "—";
  return new Date(d as string).toLocaleDateString("en-GB");
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    PENDING_APPROVAL: "bg-orange-100 text-orange-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-600",
    DRAFT: "bg-blue-100 text-blue-800",
    POSTED: "bg-green-100 text-green-800",
    REVERSED: "bg-purple-100 text-purple-800",
    PAID: "bg-emerald-100 text-emerald-800",
    FUNDING: "bg-green-100 text-green-800",
    DISBURSEMENT: "bg-red-100 text-red-800",
    REPLENISHMENT: "bg-blue-100 text-blue-800"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g, " ")}</span>;
}

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <article className="rounded-md border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/65">{label}</p>
        <Icon className="h-5 w-5 text-brand/60" aria-hidden />
      </div>
      <strong className="mt-3 block text-2xl font-semibold">{value}</strong>
      {sub && <p className="mt-1 text-xs text-ink/50">{sub}</p>}
    </article>
  );
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

type ChartMonth = { month: string; label: string; revenue: number; expenses: number };

function PnLBarChart({ data }: { data: ChartMonth[] }) {
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 1);
  const H = 140;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${data.length * 64} ${H + 28}`} className="w-full min-w-[320px]" aria-hidden>
        {data.map((d, i) => {
          const rh = Math.round((d.revenue / max) * H);
          const eh = Math.round((d.expenses / max) * H);
          const x = i * 64;
          return (
            <g key={d.month}>
              {/* Revenue bar */}
              <rect x={x + 4} y={H - rh} width={22} height={rh} fill="#16a34a" rx={3} opacity={0.85} />
              {/* Expense bar */}
              <rect x={x + 30} y={H - eh} width={22} height={eh} fill="#f58220" rx={3} opacity={0.85} />
              {/* Label */}
              <text x={x + 32} y={H + 18} textAnchor="middle" fontSize={10} fill="#64748b">{d.label}</text>
            </g>
          );
        })}
        {/* Baseline */}
        <line x1={0} y1={H} x2={data.length * 64} y2={H} stroke="#e2e8f0" strokeWidth={1} />
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 opacity-85" />Revenue</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand opacity-85" />Expenses</span>
      </div>
    </div>
  );
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────

const DONUT_COLORS = ["#f58220", "#16a34a", "#1a2235", "#7c3aed", "#db2777", "#ca8a04"];

type DonutSlice = { name: string; amount: number };

function DonutChart({ data }: { data: DonutSlice[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0) || 1;
  const r = 44;
  const cx = 56;
  const cy = 56;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 112 112" className="h-28 w-28 shrink-0" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={18} />
        {data.map((d, i) => {
          const dash = (d.amount / total) * circ;
          const gap = circ - dash;
          const el = (
            <circle
              key={d.name}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth={18}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-(offset - circ / 4)}
            />
          );
          offset += dash;
          return el;
        })}
        {data.length === 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={18} />}
      </svg>
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="truncate max-w-[120px] text-slate-600">{d.name}</span>
            <span className="ml-auto font-semibold text-slate-800">{pct((d.amount / total) * 100)}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-slate-400">No data</li>}
      </ul>
    </div>
  );
}

// ─── Finance Dashboard ────────────────────────────────────────────────────────

function dashPeriodDates(p: string): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === "last_month") return { startDate: new Date(y, m - 1, 1).toISOString().slice(0, 10), endDate: new Date(y, m, 0).toISOString().slice(0, 10) };
  if (p === "this_quarter") { const q = Math.floor(m / 3); return { startDate: new Date(y, q * 3, 1).toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) }; }
  if (p === "this_year") return { startDate: new Date(y, 0, 1).toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
  return { startDate: new Date(y, m, 1).toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
}

export function FinanceDashboardPage() {
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [chart, setChart] = useState<{ months: ChartMonth[]; expensesByCategory: DonutSlice[] } | null>(null);
  const [debtors, setDebtors] = useState<Record<string, unknown>[]>([]);
  const [period, setPeriod] = useState("this_month");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    const { startDate, endDate } = dashPeriodDates(period);
    setLoading(true);
    Promise.all([
      apiFetch<ApiEnvelope<Record<string, unknown>>>(`/finance/dashboard?startDate=${startDate}&endDate=${endDate}`),
      apiFetch<ApiEnvelope<{ months: ChartMonth[]; expensesByCategory: DonutSlice[] }>>("/finance/dashboard/chart?months=6"),
      apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/debtors")
    ])
      .then(([dashRes, chartRes, debtorsRes]) => {
        setDash(dashRes.data);
        setChart(chartRes.data);
        setDebtors(debtorsRes.data);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [period, refresh]);

  async function handleApprove(id: string) {
    setApproving(id);
    try { await apiFetch(`/finance/expenses/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) }); setRefresh((r) => r + 1); }
    catch { /* noop */ } finally { setApproving(null); }
  }

  async function handleReject(id: string) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    setApproving(id);
    try { await apiFetch(`/finance/expenses/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }); setRefresh((r) => r + 1); }
    catch { /* noop */ } finally { setApproving(null); }
  }

  const bankAccounts = (dash?.bankAccounts as Array<Record<string, unknown>>) ?? [];
  const recentExpenses = (dash?.recentExpenses as Array<Record<string, unknown>>) ?? [];
  const recentRevenue = (dash?.recentRevenue as Array<Record<string, unknown>>) ?? [];
  const pendingExpenses = recentExpenses.filter((e) => e.status === "PENDING_APPROVAL");
  const totalRevenue = Number(dash?.totalRevenue ?? 0);
  const totalExpenses = Number(dash?.totalExpenses ?? 0);
  const netProfit = Number(dash?.netProfit ?? 0);
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const isProfitable = netProfit >= 0;
  const pendingCount = Number(dash?.pendingApprovals ?? 0);

  // Group outstanding invoices by customer for "Who Owes You"
  const debtorGroups: Record<string, { name: string; total: number; count: number }> = {};
  for (const inv of debtors) {
    const name = ((inv.customer as Record<string, unknown>)?.name as string) ?? (inv.customerName as string) ?? "Unknown";
    if (!debtorGroups[name]) debtorGroups[name] = { name, total: 0, count: 0 };
    debtorGroups[name].total += Number(inv.balanceDue ?? 0);
    debtorGroups[name].count += 1;
  }
  const debtorList = Object.values(debtorGroups).sort((a, b) => b.total - a.total).slice(0, 5);
  const totalOwed = debtorList.reduce((s, d) => s + d.total, 0);

  return (
    <FinanceShell title="Business Overview" subtitle="Financial performance at a glance">

      {/* ── Period selector ─────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { value: "this_month", label: "This Month" },
          { value: "last_month", label: "Last Month" },
          { value: "this_quarter", label: "This Quarter" },
          { value: "this_year", label: "This Year" }
        ].map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${period === p.value ? "bg-brand text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"}`}
          >
            {p.label}
          </button>
        ))}
        {loading && <span className="ml-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

        {/* Money In */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Money In</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50">
              <CircleArrowUp className="h-4 w-4 text-emerald-500" />
            </span>
          </div>
          {loading ? <div className="h-8 w-40 animate-pulse rounded-md bg-slate-100" /> : <p className="text-2xl font-bold tracking-tight text-slate-900">{money(totalRevenue)}</p>}
          <p className="mt-1 text-xs text-slate-400">{Number(dash?.revenueCount ?? 0)} transactions</p>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: totalRevenue > 0 ? "100%" : "0%" }} />
          </div>
          <Link href="/finance/revenue" className="mt-2 block text-xs font-semibold text-brand hover:underline">View all revenue →</Link>
        </div>

        {/* Money Out */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Money Out</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50">
              <CircleArrowDown className="h-4 w-4 text-red-400" />
            </span>
          </div>
          {loading ? <div className="h-8 w-40 animate-pulse rounded-md bg-slate-100" /> : <p className="text-2xl font-bold tracking-tight text-slate-900">{money(totalExpenses)}</p>}
          <p className="mt-1 text-xs text-slate-400">{Number(dash?.expenseCount ?? 0)} transactions</p>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-red-300 transition-all" style={{ width: totalRevenue > 0 ? `${Math.min((totalExpenses / totalRevenue) * 100, 100)}%` : "0%" }} />
          </div>
          <Link href="/finance/expenses" className="mt-2 block text-xs font-semibold text-brand hover:underline">View all expenses →</Link>
        </div>

        {/* Net Profit */}
        <div className={`rounded-xl border p-5 shadow-sm ${isProfitable ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <div className="mb-3 flex items-start justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-widest ${isProfitable ? "text-emerald-600" : "text-red-500"}`}>Net Profit</p>
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${isProfitable ? "bg-emerald-100" : "bg-red-100"}`}>
              {isProfitable ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
            </span>
          </div>
          {loading ? <div className="h-8 w-40 animate-pulse rounded-md bg-white/60" /> : <p className={`text-2xl font-bold tracking-tight ${isProfitable ? "text-emerald-700" : "text-red-600"}`}>{money(netProfit)}</p>}
          <p className={`mt-1 text-xs ${isProfitable ? "text-emerald-500" : "text-red-400"}`}>{profitMargin.toFixed(1)}% margin</p>
          <Link href="/finance/reports/profit-loss" className={`mt-5 block text-xs font-semibold hover:underline ${isProfitable ? "text-emerald-700" : "text-red-600"}`}>View P&amp;L report →</Link>
        </div>

        {/* Needs Approval */}
        <div className={`rounded-xl border p-5 shadow-sm ${pendingCount > 0 ? "border-brand/30 bg-field" : "border-slate-200 bg-white"}`}>
          <div className="mb-3 flex items-start justify-between">
            <p className={`text-[11px] font-bold uppercase tracking-widest ${pendingCount > 0 ? "text-brand" : "text-slate-400"}`}>Needs Approval</p>
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${pendingCount > 0 ? "bg-brand/10" : "bg-slate-100"}`}>
              <CircleAlert className={`h-4 w-4 ${pendingCount > 0 ? "text-brand" : "text-slate-300"}`} />
            </span>
          </div>
          {loading ? <div className="h-8 w-16 animate-pulse rounded-md bg-slate-100" /> : <p className={`text-2xl font-bold tracking-tight ${pendingCount > 0 ? "text-brandDark" : "text-slate-900"}`}>{pendingCount}</p>}
          <p className="mt-1 text-xs text-slate-400">Large expenses ≥ GHS 5,000</p>
          <Link href="/finance/expenses?status=PENDING_APPROVAL" className="mt-5 block text-xs font-semibold text-brand hover:underline">Review now →</Link>
        </div>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-4 xl:grid-cols-3">

        {/* P&L bar chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Profit &amp; Loss</h3>
              <p className="text-xs text-slate-400">Last 6 months</p>
            </div>
            <div className="flex items-center gap-4 pt-0.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />Expenses</span>
            </div>
          </div>
          {loading && !chart
            ? <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
            : chart?.months && chart.months.length > 0
              ? <PnLBarChart data={chart.months} />
              : <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <ChartBar className="h-8 w-8 text-slate-200" />No chart data yet
                </div>
          }
        </div>

        {/* Expense donut */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Expenses by Category</h3>
            <p className="text-xs text-slate-400">Last 6 months</p>
          </div>
          {loading && !chart
            ? <div className="flex justify-center"><div className="h-28 w-28 animate-pulse rounded-full bg-slate-100" /></div>
            : <DonutChart data={chart?.expensesByCategory ?? []} />
          }
        </div>
      </div>

      {/* ── Who Owes You + Approval Queue ──────────────────────────────────── */}
      <div className="mb-5 grid gap-4 xl:grid-cols-2">

        {/* Who Owes You */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Who Owes You</h3>
              <p className="text-xs text-slate-400">Outstanding customer receivables</p>
            </div>
            {totalOwed > 0 && !loading && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{money(totalOwed)}</span>
            )}
          </div>
          {loading
            ? <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : debtorList.length === 0
              ? <div className="flex h-28 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <CircleCheck className="h-7 w-7 text-emerald-300" />No outstanding receivables
                </div>
              : <ul className="divide-y divide-slate-50">
                  {debtorList.map((d, i) => (
                    <li key={i} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{d.name}</p>
                          <p className="text-xs text-slate-400">{d.count} invoice{d.count !== 1 ? "s" : ""} outstanding</p>
                        </div>
                      </div>
                      <p className="font-bold text-emerald-700">{money(d.total)}</p>
                    </li>
                  ))}
                </ul>
          }
          <div className="border-t border-slate-50 px-5 py-3">
            <Link href="/finance/customer-payments" className="text-xs font-semibold text-brand hover:underline">Manage receivables →</Link>
          </div>
        </div>

        {/* Approval Queue */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Approval Queue</h3>
              <p className="text-xs text-slate-400">Large expenses pending your review</p>
            </div>
            {pendingExpenses.length > 0 && !loading && (
              <span className="rounded-full bg-field px-3 py-1 text-xs font-bold text-brand">{pendingExpenses.length} pending</span>
            )}
          </div>
          {loading
            ? <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : pendingExpenses.length === 0
              ? <div className="flex h-28 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <CircleCheck className="h-7 w-7 text-brand/30" />All clear — no pending approvals
                </div>
              : <ul className="divide-y divide-slate-50">
                  {pendingExpenses.map((e) => (
                    <li key={e.id as string} className="px-5 py-3.5">
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{e.description as string}</p>
                          <p className="text-xs text-slate-400">
                            {(e.category as Record<string, unknown>)?.name as string ?? "—"} · {e.vendorName as string ?? ""} · {fmt(e.expenseDate)}
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-bold text-slate-900">{money(e.amount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(e.id as string)}
                          disabled={approving === (e.id as string)}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <CircleCheck className="h-3.5 w-3.5" />
                          {approving === (e.id as string) ? "Approving…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleReject(e.id as string)}
                          disabled={!!approving}
                          className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <CircleX className="h-3.5 w-3.5" />Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
          }
          <div className="border-t border-slate-50 px-5 py-3">
            <Link href="/finance/expenses?status=PENDING_APPROVAL" className="text-xs font-semibold text-brand hover:underline">View all pending →</Link>
          </div>
        </div>
      </div>

      {/* ── Bank Accounts ────────────────────────────────────────────────────── */}
      {!loading && bankAccounts.length > 0 && (
        <div className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Bank Accounts</h3>
            <Link href="/finance/bank-accounts" className="text-xs font-semibold text-brand hover:underline">Manage →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bankAccounts.map((a) => (
              <Link
                key={a.id as string}
                href="/finance/bank-accounts"
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/30 hover:shadow-md"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10">
                  <Landmark className="h-5 w-5 text-brand" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{a.accountName as string}</p>
                  <p className="text-xs text-slate-400">{a.bankName as string}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-brand">{money(a.currentBalance)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Current</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Activity ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">

        {/* Recent Expenses */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-800">Recent Expenses</h3>
            <Link href="/finance/expenses" className="text-xs font-semibold text-brand hover:underline">View all</Link>
          </div>
          {loading
            ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : recentExpenses.length === 0
              ? <div className="flex h-20 items-center justify-center text-sm text-slate-400">No expenses recorded.</div>
              : <ul className="divide-y divide-slate-50">
                  {recentExpenses.slice(0, 6).map((e) => (
                    <li key={e.id as string} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{e.description as string}</p>
                        <p className="text-xs text-slate-400">{e.reference as string} · {fmt(e.expenseDate)}</p>
                      </div>
                      <StatusBadge status={e.status as string} />
                      <p className="shrink-0 text-sm font-semibold text-slate-900">{money(e.amount)}</p>
                    </li>
                  ))}
                </ul>
          }
        </div>

        {/* Recent Revenue */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-800">Recent Revenue</h3>
            <Link href="/finance/revenue" className="text-xs font-semibold text-brand hover:underline">View all</Link>
          </div>
          {loading
            ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : recentRevenue.length === 0
              ? <div className="flex h-20 items-center justify-center text-sm text-slate-400">No revenue recorded.</div>
              : <ul className="divide-y divide-slate-50">
                  {recentRevenue.slice(0, 6).map((r) => (
                    <li key={r.id as string} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{r.description as string}</p>
                        <p className="text-xs text-slate-400">{r.reference as string} · {fmt(r.revenueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-700">{money(r.amount)}</p>
                        <p className="text-[10px] text-slate-400">{(r.source as string)?.replace(/_/g, " ")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
          }
        </div>
      </div>
    </FinanceShell>
  );
}

// ─── Expense List ─────────────────────────────────────────────────────────────

export function ExpenseListPage() {
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionErr, setActionErr] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/finance/expenses?${params}`)
      .then((r) => setExpenses(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, [status, startDate, endDate]);

  async function handleApprove(id: string) {
    setActionErr("");
    try {
      await apiFetch(`/finance/expenses/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to approve expense");
    }
  }

  async function handleReject(id: string) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    setActionErr("");
    try {
      await apiFetch(`/finance/expenses/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to reject expense");
    }
  }

  return (
    <FinanceShell title="Expenses" subtitle="All business expenses and approval queue.">
      <div className="mb-4 flex justify-end">
        <Link href="/finance/expenses/create" className={btnPrimary}><BadgeDollarSign className="h-4 w-4" /> Record Expense</Link>
      </div>
      {actionErr && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionErr}</p>}
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {["PENDING", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="From" />
        <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="To" />
      </div>
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "expenseDate", label: "Date", render: (r) => fmt(r.expenseDate) },
          { key: "description", label: "Description" },
          { key: "category", label: "Category", render: (r) => (r.category as Record<string, unknown>)?.name as string },
          { key: "vendorName", label: "Vendor" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) =>
              r.status === "PENDING_APPROVAL" ? (
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(r.id as string)} className="text-xs text-green-700 hover:underline">Approve</button>
                  <button onClick={() => handleReject(r.id as string)} className="text-xs text-red-600 hover:underline">Reject</button>
                </div>
              ) : null
          }
        ]}
        rows={expenses}
        empty="No expenses found."
      />
    </FinanceShell>
  );
}

// ─── Create Expense ───────────────────────────────────────────────────────────

export function CreateExpensePage() {
  const options = useFinanceOptions();
  const [form, setForm] = useState({ categoryId: "", description: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", vendorName: "", receiptRef: "", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.categoryId || !form.amount || !form.description) { setError("Category, amount and description are required."); return; }
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/expenses", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      const ref = res.data.reference as string;
      const status = res.data.status as string;
      setSuccess(`Expense ${ref} recorded. Status: ${status.replace(/_/g, " ")}. ${status === "PENDING_APPROVAL" ? "Large expense — awaiting manager approval." : ""}`);
      setForm((f) => ({ ...f, description: "", amount: "", vendorName: "", receiptRef: "", notes: "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Record Expense" subtitle="Expenses above GHS 5,000 require manager approval.">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4 rounded-md border border-line bg-white p-6 shadow-panel">
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{success}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Category *">
            <select className={selectClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
              <option value="">Select category</option>
              {options.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Expense Date *">
            <input type="date" className={inputClass} value={form.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} required />
          </FormField>
        </div>
        <FormField label="Description *">
          <input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required maxLength={240} />
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Amount (GHS) *">
            <input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required />
          </FormField>
          <FormField label="Payment Method *">
            <select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
              {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CREDIT_NOTE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Vendor Name">
            <input className={inputClass} value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} maxLength={160} />
          </FormField>
          <FormField label="Receipt Reference">
            <input className={inputClass} value={form.receiptRef} onChange={(e) => set("receiptRef", e.target.value)} maxLength={120} />
          </FormField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Branch">
            <select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
              <option value="">All Branches</option>
              {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
          <FormField label="Bank Account">
            <select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}>
              <option value="">Not applicable</option>
              {options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName} — {b.bankName}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Notes">
          <textarea className={inputClass + " min-h-20"} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </FormField>
        {Number(form.amount) >= 5000 && (
          <p className="flex items-center gap-2 rounded-md bg-orange-50 p-3 text-sm text-orange-700">
            <CircleAlert className="h-4 w-4" /> This expense exceeds GHS 5,000 and will require manager approval.
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Expense"}</button>
      </form>
    </FinanceShell>
  );
}

// ─── Revenue Page ─────────────────────────────────────────────────────────────

export function RevenuePage() {
  const options = useFinanceOptions();
  const [revenues, setRevenues] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ source: "PRODUCT_SALES", description: "", amount: "", revenueDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", customerName: "", invoiceRef: "", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/revenue")
      .then((r) => setRevenues(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/revenue", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record revenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Revenue Records" subtitle="Track all income and revenue sources.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><CircleArrowUp className="h-4 w-4" /> {showForm ? "Cancel" : "Record Revenue"}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Revenue Entry</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Source *">
              <select className={selectClass} value={form.source} onChange={(e) => set("source", e.target.value)}>
                {["PRODUCT_SALES", "SERVICE_FEES", "RENTAL_INCOME", "INVESTMENT_INCOME", "OTHER"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Date *">
              <input type="date" className={inputClass} value={form.revenueDate} onChange={(e) => set("revenueDate", e.target.value)} required />
            </FormField>
            <FormField label="Amount (GHS) *">
              <input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required />
            </FormField>
          </div>
          <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Payment Method">
              <select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                {["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Customer Name"><input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} /></FormField>
            <FormField label="Invoice Reference"><input className={inputClass} value={form.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} /></FormField>
            <FormField label="Bank Account">
              <select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}>
                <option value="">None</option>
                {options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}
              </select>
            </FormField>
          </div>
          <div className="mt-4">
            <button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Revenue"}</button>
          </div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "revenueDate", label: "Date", render: (r) => fmt(r.revenueDate) },
          { key: "source", label: "Source", render: (r) => String(r.source).replace(/_/g, " ") },
          { key: "description", label: "Description" },
          { key: "customerName", label: "Customer" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={revenues}
        empty="No revenue records found."
      />
    </FinanceShell>
  );
}

// ─── Customer Payments ────────────────────────────────────────────────────────

export function CustomerPaymentsPage() {
  const options = useFinanceOptions();
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "CASH", description: "", invoiceRef: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/customer-payments")
      .then((r) => setPayments(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/customer-payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Customer Payments" subtitle="Payments received from customers.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Users className="h-4 w-4" /> {showForm ? "Cancel" : "Record Payment"}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Customer Payment</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Customer Name *"><input className={inputClass} value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required /></FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Payment Date *"><input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} required /></FormField>
            <FormField label="Payment Method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>{["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></FormField>
            <FormField label="Invoice Reference"><input className={inputClass} value={form.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Payment"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate) },
          { key: "customerName", label: "Customer" },
          { key: "description", label: "Description" },
          { key: "invoiceRef", label: "Invoice Ref" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={payments}
        empty="No customer payments recorded."
      />
    </FinanceShell>
  );
}

// ─── Supplier Payments ────────────────────────────────────────────────────────

export function SupplierPaymentsPage() {
  const options = useFinanceOptions();
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierName: "", amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "BANK_TRANSFER", description: "", purchaseOrderRef: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/supplier-payments")
      .then((r) => setPayments(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/supplier-payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Supplier Payments" subtitle="Payments made to suppliers and vendors.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Building2 className="h-4 w-4" /> {showForm ? "Cancel" : "Record Payment"}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Supplier Payment</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Supplier Name *"><input className={inputClass} value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} required /></FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Payment Date *"><input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} required /></FormField>
            <FormField label="Payment Method"><select className={selectClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>{["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE"].map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></FormField>
            <FormField label="Purchase Order Ref"><input className={inputClass} value={form.purchaseOrderRef} onChange={(e) => set("purchaseOrderRef", e.target.value)} /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Record Payment"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "paymentDate", label: "Date", render: (r) => fmt(r.paymentDate) },
          { key: "supplierName", label: "Supplier" },
          { key: "description", label: "Description" },
          { key: "purchaseOrderRef", label: "PO Ref" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "paymentMethod", label: "Method", render: (r) => String(r.paymentMethod ?? "").replace(/_/g, " ") }
        ]}
        rows={payments}
        empty="No supplier payments recorded."
      />
    </FinanceShell>
  );
}

// ─── Petty Cash ───────────────────────────────────────────────────────────────

export function PettyCashPage() {
  const options = useFinanceOptions();
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "DISBURSEMENT", amount: "", description: "", transactionDate: new Date().toISOString().slice(0, 10), categoryId: "", branchId: "", receiptRef: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/petty-cash")
      .then((r) => setTransactions(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/petty-cash", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const currentBalance = transactions.length > 0 ? Number(transactions[0].balance ?? 0) : 0;

  return (
    <FinanceShell title="Petty Cash" subtitle={`Current balance: ${money(currentBalance)}`}>
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><PiggyBank className="h-4 w-4" /> {showForm ? "Cancel" : "New Transaction"}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Petty Cash Transaction</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Type *">
              <select className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="FUNDING">Funding (add cash)</option>
                <option value="DISBURSEMENT">Disbursement (pay out)</option>
                <option value="REPLENISHMENT">Replenishment</option>
              </select>
            </FormField>
            <FormField label="Amount (GHS) *"><input type="number" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} min="0.01" step="0.01" required /></FormField>
            <FormField label="Date *"><input type="date" className={inputClass} value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} required /></FormField>
            <FormField label="Category">
              <select className={selectClass} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">None</option>
                {options.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Branch">
              <select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}>
                <option value="">All Branches</option>
                {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>
            <FormField label="Receipt Ref"><input className={inputClass} value={form.receiptRef} onChange={(e) => set("receiptRef", e.target.value)} /></FormField>
          </div>
          <div className="mt-4"><FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} required /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Transaction"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "transactionDate", label: "Date", render: (r) => fmt(r.transactionDate) },
          { key: "type", label: "Type", render: (r) => <StatusBadge status={r.type as string} /> },
          { key: "description", label: "Description" },
          { key: "category", label: "Category", render: (r) => (r.category as Record<string, unknown>)?.name as string },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "balance", label: "Balance", render: (r) => money(r.balance) }
        ]}
        rows={transactions}
        empty="No petty cash transactions."
      />
    </FinanceShell>
  );
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const options = useFinanceOptions();
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ period: new Date().toISOString().slice(0, 7), periodStart: "", periodEnd: "", employeeName: "", employeeCode: "", basicSalary: "", allowances: "0", deductions: "0", taxDeduction: "0", ssnit: "0", branchId: "", bankAccountId: "", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionErr, setActionErr] = useState("");

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/payroll")
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const grossPay = (Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0);
  const netPay = grossPay - (Number(form.taxDeduction) || 0) - (Number(form.ssnit) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/payroll", { method: "POST", body: JSON.stringify({ ...form, basicSalary: Number(form.basicSalary), allowances: Number(form.allowances), deductions: Number(form.deductions), taxDeduction: Number(form.taxDeduction), ssnit: Number(form.ssnit) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setActionErr("");
    try {
      await apiFetch(`/finance/payroll/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to approve payroll record");
    }
  }

  async function handleMarkPaid(id: string) {
    setActionErr("");
    try {
      await apiFetch(`/finance/payroll/${id}/mark-paid`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to mark payroll as paid");
    }
  }

  return (
    <FinanceShell title="Payroll Records" subtitle="Employee salaries, deductions, and payment tracking.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Wallet className="h-4 w-4" /> {showForm ? "Cancel" : "Add Payroll Record"}</button>
      </div>
      {actionErr && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionErr}</p>}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Payroll Record</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Period (YYYY-MM) *"><input className={inputClass} value={form.period} onChange={(e) => set("period", e.target.value)} placeholder="2024-01" required /></FormField>
            <FormField label="Period Start *"><input type="date" className={inputClass} value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} required /></FormField>
            <FormField label="Period End *"><input type="date" className={inputClass} value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} required /></FormField>
            <FormField label="Employee Name *"><input className={inputClass} value={form.employeeName} onChange={(e) => set("employeeName", e.target.value)} required /></FormField>
            <FormField label="Employee Code"><input className={inputClass} value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} /></FormField>
            <FormField label="Branch"><select className={selectClass} value={form.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">None</option>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></FormField>
            <FormField label="Basic Salary (GHS) *"><input type="number" className={inputClass} value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} min="0" step="0.01" required /></FormField>
            <FormField label="Allowances (GHS)"><input type="number" className={inputClass} value={form.allowances} onChange={(e) => set("allowances", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Deductions (GHS)"><input type="number" className={inputClass} value={form.deductions} onChange={(e) => set("deductions", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Tax Deduction (GHS)"><input type="number" className={inputClass} value={form.taxDeduction} onChange={(e) => set("taxDeduction", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="SSNIT (GHS)"><input type="number" className={inputClass} value={form.ssnit} onChange={(e) => set("ssnit", e.target.value)} min="0" step="0.01" /></FormField>
            <FormField label="Bank Account"><select className={selectClass} value={form.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{options.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.accountName}</option>)}</select></FormField>
          </div>
          <div className="mt-4 rounded-md bg-field p-3 text-sm">
            <span className="font-medium">Gross Pay:</span> {money(grossPay)} &nbsp;|&nbsp; <span className="font-medium">Net Pay:</span> {money(netPay)}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Payroll Record"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "period", label: "Period" },
          { key: "employeeName", label: "Employee" },
          { key: "grossPay", label: "Gross", render: (r) => money(r.grossPay) },
          { key: "netPay", label: "Net Pay", render: (r) => money(r.netPay) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) => (
              <div className="flex gap-2">
                {r.status === "DRAFT" && <button onClick={() => handleApprove(r.id as string)} className="text-xs text-brand hover:underline">Approve</button>}
                {r.status === "APPROVED" && <button onClick={() => handleMarkPaid(r.id as string)} className="text-xs text-green-700 hover:underline">Mark Paid</button>}
              </div>
            )
          }
        ]}
        rows={records}
        empty="No payroll records found."
      />
    </FinanceShell>
  );
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const [accounts, setAccounts] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ accountName: "", accountNumber: "", bankName: "", branchName: "", accountType: "CURRENT", openingBalance: "0", notes: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/bank-accounts")
      .then((r) => setAccounts(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/bank-accounts", { method: "POST", body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Bank Accounts" subtitle="Company bank accounts and balances.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><Building2 className="h-4 w-4" /> {showForm ? "Cancel" : "Add Bank Account"}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Bank Account</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Account Name *"><input className={inputClass} value={form.accountName} onChange={(e) => set("accountName", e.target.value)} required /></FormField>
            <FormField label="Account Number *"><input className={inputClass} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} required /></FormField>
            <FormField label="Bank Name *"><input className={inputClass} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} required /></FormField>
            <FormField label="Branch Name"><input className={inputClass} value={form.branchName} onChange={(e) => set("branchName", e.target.value)} /></FormField>
            <FormField label="Account Type">
              <select className={selectClass} value={form.accountType} onChange={(e) => set("accountType", e.target.value)}>
                {["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "MOBILE_MONEY"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </FormField>
            <FormField label="Opening Balance (GHS)"><input type="number" className={inputClass} value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} min="0" step="0.01" /></FormField>
          </div>
          <div className="mt-4"><FormField label="Notes"><textarea className={inputClass + " min-h-16"} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField></div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Account"}</button></div>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id as string} className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{a.accountName as string}</p>
                <p className="text-sm text-ink/60">{a.bankName as string} {a.branchName ? `— ${a.branchName}` : ""}</p>
                <p className="mt-1 text-xs text-ink/50">{String(a.accountType).replace(/_/g, " ")} · {a.accountNumber as string}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${(a.isActive as boolean) ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{(a.isActive as boolean) ? "Active" : "Inactive"}</span>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs text-ink/60">Current Balance</p>
              <strong className="text-2xl font-semibold text-brand">{money(a.currentBalance)}</strong>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink/50">No bank accounts configured.</p>}
      </div>
    </FinanceShell>
  );
}

// ─── Journal Entries ──────────────────────────────────────────────────────────

export function JournalEntriesPage() {
  const options = useFinanceOptions();
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entryDate: new Date().toISOString().slice(0, 10), description: "", type: "STANDARD", notes: "" });
  const [lines, setLines] = useState([{ accountId: "", description: "", debit: "", credit: "", sequence: 1 }]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionErr, setActionErr] = useState("");

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/journal-entries")
      .then((r) => setEntries(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  function addLine() { setLines((l) => [...l, { accountId: "", description: "", debit: "", credit: "", sequence: l.length + 1 }]); }
  function setLine(i: number, k: string, v: string) { setLines((l) => l.map((line, idx) => idx === i ? { ...line, [k]: v } : line)); }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i).map((line, idx) => ({ ...line, sequence: idx + 1 }))); }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!balanced) { setError("Debits must equal credits."); return; }
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/journal-entries", {
        method: "POST",
        body: JSON.stringify({ ...form, lines: lines.map((l) => ({ accountId: l.accountId, description: l.description, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, sequence: l.sequence })) })
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePost(id: string) {
    setActionErr("");
    try {
      await apiFetch(`/finance/journal-entries/${id}/post`, { method: "PATCH", body: JSON.stringify({}) });
      load();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : "Failed to post journal entry");
    }
  }

  return (
    <FinanceShell title="Journal Entries" subtitle="Double-entry bookkeeping journal entries.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><BookOpen className="h-4 w-4" /> {showForm ? "Cancel" : "New Journal Entry"}</button>
      </div>
      {actionErr && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionErr}</p>}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">New Journal Entry</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Entry Date *"><input type="date" className={inputClass} value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} required /></FormField>
            <FormField label="Type"><select className={selectClass} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{["STANDARD", "OPENING", "CLOSING", "ADJUSTMENT", "REVERSAL"].map((t) => <option key={t} value={t}>{t}</option>)}</select></FormField>
            <FormField label="Description *"><input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required /></FormField>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium">Lines</h4>
              <button type="button" onClick={addLine} className={btnSecondary + " text-xs"}>Add Line</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase text-ink/50">{["#", "Account", "Description", "Debit", "Credit", ""].map((h) => <th key={h} className="pb-2 pr-3">{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-2 pr-3 text-ink/50">{i + 1}</td>
                      <td className="py-2 pr-3"><select className={selectClass + " w-48"} value={line.accountId} onChange={(e) => setLine(i, "accountId", e.target.value)} required><option value="">Select account</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></td>
                      <td className="py-2 pr-3"><input className={inputClass + " w-40"} value={line.description} onChange={(e) => setLine(i, "description", e.target.value)} /></td>
                      <td className="py-2 pr-3"><input type="number" className={inputClass + " w-28"} value={line.debit} onChange={(e) => setLine(i, "debit", e.target.value)} min="0" step="0.01" /></td>
                      <td className="py-2 pr-3"><input type="number" className={inputClass + " w-28"} value={line.credit} onChange={(e) => setLine(i, "credit", e.target.value)} min="0" step="0.01" /></td>
                      <td className="py-2"><button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:underline text-xs">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3} className="pt-3 text-right text-sm text-ink/60">Totals</td>
                    <td className={`pt-3 pr-3 ${balanced ? "text-green-700" : "text-red-600"}`}>{money(totalDebit)}</td>
                    <td className={`pt-3 ${balanced ? "text-green-700" : "text-red-600"}`}>{money(totalCredit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {!balanced && <p className="mt-2 text-xs text-red-600">Debits and credits must be equal.</p>}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading || !balanced}>{loading ? "Saving…" : "Save Journal Entry"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "reference", label: "Reference" },
          { key: "entryDate", label: "Date", render: (r) => fmt(r.entryDate) },
          { key: "type", label: "Type" },
          { key: "description", label: "Description" },
          { key: "totalDebit", label: "Debit", render: (r) => money(r.totalDebit) },
          { key: "totalCredit", label: "Credit", render: (r) => money(r.totalCredit) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
          {
            key: "actions", label: "", render: (r) =>
              r.status === "DRAFT" ? <button onClick={() => handlePost(r.id as string)} className="text-xs text-brand hover:underline">Post</button> : null
          }
        ]}
        rows={entries}
        empty="No journal entries."
      />
    </FinanceShell>
  );
}

// ─── Profit & Loss Report ─────────────────────────────────────────────────────

export function ProfitLossReportPage() {
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/profit-loss")
      .then((r) => setReports(r.data))
      .catch(() => undefined);
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/reports/profit-loss", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      setCurrent(res.data);
      apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/profit-loss").then((r) => setReports(r.data)).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Profit & Loss Report" subtitle="Revenue vs expenses for a selected period.">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className={btnPrimary} onClick={generate} disabled={loading}><FileChartColumn className="h-4 w-4" /> {loading ? "Generating…" : "Generate"}</button>
      </div>
      {current && (
        <section className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">{current.title as string}</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Revenue" value={money(current.totalRevenue)} icon={CircleArrowUp} />
            <StatCard label="Total Expenses" value={money(current.totalExpenses)} icon={CircleArrowDown} />
            <StatCard label="Gross Profit" value={money(current.grossProfit)} icon={DollarSign} />
            <StatCard label="Net Profit" value={money(current.netProfit)} icon={CircleCheck} />
          </div>
        </section>
      )}
      <h3 className="mb-3 text-lg font-semibold">Saved Reports</h3>
      <DataTable
        columns={[
          { key: "title", label: "Title" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalExpenses", label: "Expenses", render: (r) => money(r.totalExpenses) },
          { key: "netProfit", label: "Net Profit", render: (r) => <span className={Number(r.netProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.netProfit)}</span> },
          { key: "createdAt", label: "Generated", render: (r) => fmt(r.createdAt) }
        ]}
        rows={reports}
        empty="No P&L reports generated yet."
      />
    </FinanceShell>
  );
}

// ─── Cash Flow Report ─────────────────────────────────────────────────────────

export function CashFlowReportPage() {
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/cash-flow")
      .then((r) => setReports(r.data))
      .catch(() => undefined);
  }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<Record<string, unknown>>>("/finance/reports/cash-flow", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      setCurrent(res.data);
      apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/cash-flow").then((r) => setReports(r.data)).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  const reportData = current?.reportData as Record<string, unknown> | undefined;

  return (
    <FinanceShell title="Cash Flow Report" subtitle="Cash inflows and outflows for a selected period.">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className={btnPrimary} onClick={generate} disabled={loading}><FileText className="h-4 w-4" /> {loading ? "Generating…" : "Generate"}</button>
      </div>
      {current && (
        <section className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">{current.title as string}</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Operating Cash Flow" value={money(current.operatingCashFlow)} icon={DollarSign} />
            <StatCard label="Net Cash Flow" value={money(current.netCashFlow)} icon={CircleArrowUp} />
            <StatCard label="Closing Balance" value={money(current.closingBalance)} icon={Wallet} />
          </div>
          {reportData && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-green-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-green-800">Inflows</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Revenue</span><span className="font-medium">{money(reportData.inflows)}</span></div>
                  <div className="flex justify-between"><span>Customer Payments</span><span className="font-medium">{money(reportData.customerPayments)}</span></div>
                </div>
              </div>
              <div className="rounded-md bg-red-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-red-800">Outflows</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Expenses</span><span className="font-medium">{money(reportData.expenses)}</span></div>
                  <div className="flex justify-between"><span>Supplier Payments</span><span className="font-medium">{money(reportData.supplierPayments)}</span></div>
                  <div className="flex justify-between"><span>Payroll</span><span className="font-medium">{money(reportData.payroll)}</span></div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      <h3 className="mb-3 text-lg font-semibold">Saved Reports</h3>
      <DataTable
        columns={[
          { key: "title", label: "Title" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "operatingCashFlow", label: "Operating CF", render: (r) => money(r.operatingCashFlow) },
          { key: "netCashFlow", label: "Net CF", render: (r) => <span className={Number(r.netCashFlow) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.netCashFlow)}</span> },
          { key: "closingBalance", label: "Closing Balance", render: (r) => money(r.closingBalance) }
        ]}
        rows={reports}
        empty="No cash flow reports yet."
      />
    </FinanceShell>
  );
}

// ─── Product Profitability ────────────────────────────────────────────────────

export function ProductProfitabilityPage() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  function load() {
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>("/finance/reports/product-profitability")
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setLoading(true);
    try {
      await apiFetch("/finance/reports/product-profitability", { method: "POST", body: JSON.stringify({ startDate, endDate }) });
      load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Product Profitability" subtitle="Revenue, cost, and margin by product.">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className={btnPrimary} onClick={generate} disabled={loading}><FileChartColumn className="h-4 w-4" /> {loading ? "Generating…" : "Analyse"}</button>
      </div>
      <DataTable
        columns={[
          { key: "productName", label: "Product" },
          { key: "productCode", label: "Code" },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "unitsSold", label: "Units" },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalCost", label: "Cost", render: (r) => money(r.totalCost) },
          { key: "grossProfit", label: "Gross Profit", render: (r) => <span className={Number(r.grossProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.grossProfit)}</span> },
          { key: "margin", label: "Margin", render: (r) => pct(r.margin) }
        ]}
        rows={records}
        empty="No product profitability records. Click Analyse to generate."
      />
    </FinanceShell>
  );
}

// ─── Batch Profitability ──────────────────────────────────────────────────────

export function BatchProfitabilityPage() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [batchTypeFilter, setBatchTypeFilter] = useState("");
  const [form, setForm] = useState({ batchType: "FLOCK", batchId: "", batchReference: "", batchName: "", periodStart: "", periodEnd: "", totalRevenue: "", totalCost: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function load() {
    const params = batchTypeFilter ? `?status=${batchTypeFilter}` : "";
    apiFetch<ApiEnvelope<Record<string, unknown>[]>>(`/finance/reports/batch-profitability${params}`)
      .then((r) => setRecords(r.data))
      .catch(() => undefined);
  }

  useEffect(() => { load(); }, [batchTypeFilter]);
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/finance/reports/batch-profitability", { method: "POST", body: JSON.stringify({ ...form, totalRevenue: Number(form.totalRevenue), totalCost: Number(form.totalCost) }) });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinanceShell title="Batch Profitability" subtitle="Profitability of flock, feed, and soya processing batches.">
      <div className="mb-4 flex justify-end">
        <button className={btnPrimary} onClick={() => setShowForm(!showForm)}><FileChartColumn className="h-4 w-4" /> {showForm ? "Cancel" : "Record Batch P&L"}</button>
      </div>
      <div className="mb-4 flex gap-3">
        <select className={selectClass} value={batchTypeFilter} onChange={(e) => setBatchTypeFilter(e.target.value)}>
          <option value="">All Batch Types</option>
          <option value="FLOCK">Flock</option>
          <option value="FEED_PRODUCTION">Feed Production</option>
          <option value="SOYA_PROCESSING">Soya Processing</option>
        </select>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-lg font-semibold">Record Batch Profitability</h3>
          {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Batch Type *">
              <select className={selectClass} value={form.batchType} onChange={(e) => set("batchType", e.target.value)}>
                <option value="FLOCK">Flock</option>
                <option value="FEED_PRODUCTION">Feed Production</option>
                <option value="SOYA_PROCESSING">Soya Processing</option>
              </select>
            </FormField>
            <FormField label="Batch Reference *"><input className={inputClass} value={form.batchReference} onChange={(e) => set("batchReference", e.target.value)} required /></FormField>
            <FormField label="Batch Name *"><input className={inputClass} value={form.batchName} onChange={(e) => set("batchName", e.target.value)} required /></FormField>
            <FormField label="Batch ID *"><input className={inputClass} value={form.batchId} onChange={(e) => set("batchId", e.target.value)} required /></FormField>
            <FormField label="Period Start *"><input type="date" className={inputClass} value={form.periodStart} onChange={(e) => set("periodStart", e.target.value)} required /></FormField>
            <FormField label="Period End *"><input type="date" className={inputClass} value={form.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} required /></FormField>
            <FormField label="Total Revenue (GHS) *"><input type="number" className={inputClass} value={form.totalRevenue} onChange={(e) => set("totalRevenue", e.target.value)} min="0" step="0.01" required /></FormField>
            <FormField label="Total Cost (GHS) *"><input type="number" className={inputClass} value={form.totalCost} onChange={(e) => set("totalCost", e.target.value)} min="0" step="0.01" required /></FormField>
            {form.totalRevenue && form.totalCost && (
              <div className="flex flex-col justify-end">
                <p className="text-sm text-ink/60">Gross Profit</p>
                <strong className={`text-xl font-semibold ${Number(form.totalRevenue) - Number(form.totalCost) >= 0 ? "text-green-700" : "text-red-600"}`}>{money(Number(form.totalRevenue) - Number(form.totalCost))}</strong>
              </div>
            )}
          </div>
          <div className="mt-4"><button type="submit" className={btnPrimary} disabled={loading}>{loading ? "Saving…" : "Save Record"}</button></div>
        </form>
      )}
      <DataTable
        columns={[
          { key: "batchReference", label: "Reference" },
          { key: "batchName", label: "Batch Name" },
          { key: "batchType", label: "Type", render: (r) => String(r.batchType).replace(/_/g, " ") },
          { key: "periodStart", label: "From", render: (r) => fmt(r.periodStart) },
          { key: "periodEnd", label: "To", render: (r) => fmt(r.periodEnd) },
          { key: "totalRevenue", label: "Revenue", render: (r) => money(r.totalRevenue) },
          { key: "totalCost", label: "Cost", render: (r) => money(r.totalCost) },
          { key: "grossProfit", label: "Gross Profit", render: (r) => <span className={Number(r.grossProfit) >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(r.grossProfit)}</span> },
          { key: "margin", label: "Margin", render: (r) => pct(r.margin) }
        ]}
        rows={records}
        empty="No batch profitability records."
      />
    </FinanceShell>
  );
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────

type AccountRow = { id: string; code: string; name: string; type: string; description?: string | null };

const ACCOUNT_TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  ASSET:     { label: "Assets",      color: "text-blue-700",   bg: "bg-blue-50"   },
  LIABILITY: { label: "Liabilities", color: "text-red-700",    bg: "bg-red-50"    },
  EQUITY:    { label: "Equity",      color: "text-purple-700", bg: "bg-purple-50" },
  REVENUE:   { label: "Revenue",     color: "text-green-700",  bg: "bg-green-50"  },
  EXPENSE:   { label: "Expenses",    color: "text-orange-700", bg: "bg-orange-50" }
};

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET", description: "" });
  const [formErr, setFormErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      apiFetch<ApiEnvelope<AccountRow[]>>(`/finance/accounts${params}`)
        .then((r) => setAccounts(r.data))
        .catch(() => undefined);
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, refresh]);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormErr("");
    setSubmitting(true);
    try {
      await apiFetch("/finance/accounts", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      setForm({ code: "", name: "", type: "ASSET", description: "" });
      setRefresh((r) => r + 1);
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = (ACCOUNT_TYPES as readonly string[]).reduce<Record<string, AccountRow[]>>((acc, t) => {
    acc[t] = accounts.filter((a) => a.type === t);
    return acc;
  }, {});

  return (
    <FinanceShell title="Chart of Accounts" subtitle="Ledger structure — assets, liabilities, equity, revenue, and expenses.">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          className={inputClass + " flex-1 min-w-48 max-w-sm"}
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-ink/55">{accounts.length} account{accounts.length !== 1 ? "s" : ""}</span>
        <button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>
          <BookOpen className="h-4 w-4" /> {showForm ? "Cancel" : "New Account"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-md border border-line bg-white p-6 shadow-panel">
          <h3 className="mb-4 text-base font-semibold">New Account</h3>
          {formErr && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{formErr}</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Code *">
              <input className={inputClass} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. 1000" maxLength={24} required />
            </FormField>
            <FormField label="Name *">
              <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required />
            </FormField>
            <FormField label="Type *">
              <select className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_META[t].label}</option>)}
              </select>
            </FormField>
            <FormField label="Description">
              <input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={240} />
            </FormField>
          </div>
          <button type="submit" className={btnPrimary + " mt-4"} disabled={submitting}>
            {submitting ? "Saving…" : "Create Account"}
          </button>
        </form>
      )}

      <div className="space-y-5">
        {ACCOUNT_TYPES.map((type) => {
          const rows = grouped[type] ?? [];
          if (rows.length === 0) return null;
          const meta = ACCOUNT_TYPE_META[type];
          return (
            <section key={type}>
              <div className={`mb-2 flex items-center gap-2 rounded-md px-3 py-2 ${meta.bg}`}>
                <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                <span className={`text-xs font-semibold opacity-70 ${meta.color}`}>({rows.length})</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-line bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                      <th className="w-28 px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="hidden px-4 py-2.5 md:table-cell">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/50">
                    {rows.map((a) => (
                      <tr key={a.id} className="transition-colors hover:bg-field/60">
                        <td className="px-4 py-2.5">
                          <code className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${meta.bg} ${meta.color}`}>{a.code}</code>
                        </td>
                        <td className="px-4 py-2.5 font-medium">{a.name}</td>
                        <td className="hidden px-4 py-2.5 text-ink/55 md:table-cell">{a.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {accounts.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line bg-white py-14 text-center">
            <BookOpen className="h-8 w-8 text-brand/40" />
            <p className="text-sm font-medium text-ink/55">No accounts yet. Create your first account above.</p>
            <button className={btnPrimary} onClick={() => setShowForm(true)}>Add first account</button>
          </div>
        )}
      </div>
    </FinanceShell>
  );
}
