"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleCheckBig, Download, Pencil, Plus, Printer, SendHorizontal, Trash2, Undo2 } from "lucide-react";
import { ApiEnvelope, apiFetch, downloadRowsAsCsv } from "../lib/api";
import { useApiRecovery } from "../lib/use-api-recovery";
import { useAuth } from "./auth-context";
import { Badge, ConfirmModal, Modal, PageHeader, Spinner, StatusBadge } from "./ui";

// ── Types: what the Marketing Ledger API returns ─────────────────────────────────
type Unit = { unit: string; planned: number; sold: number };
type Totals = {
  plannedValue: number;
  soldValue: number;
  plannedLineSoldValue: number;
  unplannedValue: number;
  varianceValue: number;
  attainmentPct: number | null;
  volumeVariance: number;
  priceVariance: number;
  unplannedVariance: number;
  customersPlanned: number;
  customersBought: number;
  hitRatePct: number | null;
  accuracyPct: number | null;
  linesPlanned: number;
  linesOnPlan: number;
  orderCount: number;
  units: Unit[];
};
type Flag = "NO_PLAN" | "NOT_SUBMITTED" | "AWAITING_APPROVAL" | "LATE_PLAN" | "REVISED" | "READY_TO_CLOSE" | "AWAITING_SIGN_OFF" | "SALES_CHANGED_AFTER_CLOSE";
type PlanStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CLOSED";
type PlanSummary = {
  id: string;
  planNumber: string;
  weekStart: string;
  weekEnd: string;
  status: PlanStatus;
  notes: string | null;
  revision: number;
  marketerId: string;
  marketerName: string;
  createdByName: string | null;
  firstSubmittedAt: string | null;
  submittedAt: string | null;
  late: boolean;
  deadline: string;
  approvedAt: string | null;
  approvedByName: string | null;
  returnedAt: string | null;
  returnedByName: string | null;
  returnReason: string | null;
  closedAt: string | null;
  closedByName: string | null;
  closingNote: string | null;
  signedOffAt: string | null;
  signedOffByName: string | null;
  signOffNote: string | null;
  lineCount: number;
};
type WeekRow = { marketerId: string; marketerName: string; markets: string[]; plan: PlanSummary | null; totals: Totals; liveSoldValue: number | null; driftValue: number | null; flags: Flag[] };
type WeekData = {
  week: { start: string; end: string; elapsedPct: number; isCurrent: boolean; isOver: boolean; previous: string; next: string };
  scope: "ALL" | "OWN";
  summary: null | { marketers: number; plansFiled: number; plansClosed: number; plannedValue: number; soldValue: number; varianceValue: number; attainmentPct: number | null; totalSalesValue: number | null; totalOrders: number | null; unattributedValue: number | null };
  rows: WeekRow[];
  unattributed: null | { value: number; orders: number; customers: Array<{ customerId: string; name: string; value: number }> };
};
type LineStatus = "ABOVE_PLAN" | "ON_PLAN" | "SHORT" | "NO_SALE";
type DetailLine = {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  plannedQuantity: number;
  plannedUnitPrice: number;
  plannedValue: number;
  actualQuantity: number;
  actualValue: number;
  actualUnitPrice: number | null;
  varianceValue: number;
  attainmentPct: number | null;
  volumeVariance: number;
  priceVariance: number;
  status: LineStatus;
  note: string | null;
  missReason: string | null;
};
type Basis = "PLANNED_CUSTOMER" | "SOLD_BY_MARKETER" | "MARKET_CUSTOMER";
type PlanDetail = {
  plan: PlanSummary;
  week: { start: string; end: string; elapsedPct: number; canCloseNow: boolean };
  lines: DetailLine[];
  unplanned: Array<{ customerId: string; customerName: string; productId: string; productName: string; unit: string; quantity: number; value: number; customerWasPlanned: boolean; orderNumbers: string[] }>;
  totals: Totals;
  live: null | { soldValue: number; driftValue: number };
  orders: Array<{ id: string; orderNumber: string; orderDate: string; customerId: string; customerName: string; value: number; basis: Basis }>;
  needReason: string[];
  actions: { canEdit: boolean; canSubmit: boolean; canDelete: boolean; canApprove: boolean; canReturn: boolean; canClose: boolean; mustExplain: boolean; canSignOff: boolean };
};
type Options = {
  canManage: boolean;
  canSubmit: boolean;
  canViewAll: boolean;
  me: { id: string; fullName: string };
  marketers: Array<{ id: string; fullName: string }>;
  myMarkets: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; code: string; name: string; marketId: string | null }>;
  products: Array<{ id: string; sku: string; name: string; unit: string }>;
};
type Scorecard = {
  weeks: string[];
  scope: "ALL" | "OWN";
  rows: Array<{
    marketerId: string;
    marketerName: string;
    cells: Array<null | { weekStart: string; planId: string; status: PlanStatus; late: boolean; plannedValue: number; soldValue: number | null; attainmentPct: number | null; accuracyPct: number | null; hitRatePct: number | null; counts: boolean }>;
    summary: { weeks: number; plansFiled: number; onTime: number; closed: number; avgAttainmentPct: number | null; avgAccuracyPct: number | null; avgHitRatePct: number | null; bias: "PLANS_TOO_HIGH" | "PLANS_TOO_LOW" | "BALANCED" | null };
  }>;
};

// ── Formatting ───────────────────────────────────────────────────────────────────
const nf0 = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ghs = (n: number | null | undefined) => `GHS ${nf0.format(n ?? 0)}`;
const ghs2 = (n: number | null | undefined) => `GHS ${nf2.format(n ?? 0)}`;
const qty = (n: number) => nf1.format(n);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${nf1.format(n)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf0.format(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "text-emerald-700" : n < 0 ? "text-red-700" : "text-ink/60");

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function mondayOf(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return iso(c);
}
const thisMonday = () => mondayOf(new Date());
const addDaysIso = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const isMondayIso = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00`).getDay() === 1;
const dayFmt = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", opts);
const weekLabel = (start: string, end: string) => `${dayFmt(start, { day: "numeric", month: "short" })} – ${dayFmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
const stamp = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const FLAGS: Record<Flag, { label: string; variant: "danger" | "warning" | "info"; hint: string }> = {
  NO_PLAN: { label: "No plan filed", variant: "danger", hint: "The week has started and this marketer has not filed a plan." },
  NOT_SUBMITTED: { label: "Draft not submitted", variant: "warning", hint: "A plan was started but never sent for approval." },
  AWAITING_APPROVAL: { label: "Awaiting approval", variant: "info", hint: "Submitted; a manager still has to approve it." },
  LATE_PLAN: { label: "Plan came in late", variant: "warning", hint: "First submitted after the end of the first day of the week." },
  REVISED: { label: "Changed after approval", variant: "warning", hint: "A manager sent this plan back after approving it, so it was revised." },
  READY_TO_CLOSE: { label: "Ready to close", variant: "info", hint: "The week is ending; the report can be filed." },
  AWAITING_SIGN_OFF: { label: "Awaiting sign-off", variant: "info", hint: "Closed, but a manager has not signed it off yet." },
  SALES_CHANGED_AFTER_CLOSE: { label: "Sales changed since close", variant: "danger", hint: "Orders for this week were added, removed or edited after the report was filed." }
};
const LINE_STATUS: Record<LineStatus, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
  ABOVE_PLAN: { label: "Above plan", variant: "info" },
  ON_PLAN: { label: "On plan", variant: "success" },
  SHORT: { label: "Short", variant: "warning" },
  NO_SALE: { label: "No sale", variant: "danger" }
};
const BASIS: Record<Basis, string> = { PLANNED_CUSTOMER: "Customer in the plan", SOLD_BY_MARKETER: "Order entered by the marketer", MARKET_CUSTOMER: "Customer in the marketer's market" };

function FlagChips({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <span className="text-xs text-ink/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} title={FLAGS[f].hint}>
          <Badge variant={FLAGS[f].variant}>{FLAGS[f].label}</Badge>
        </span>
      ))}
    </div>
  );
}

function Attainment({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink/40">nothing planned</span>;
  const colour = value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${nf1.format(value)} percent of plan`}>
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold tabular-nums">{pct(value)}</span>
    </div>
  );
}

function Stat({ label, value, sub, valueClass = "" }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="app-stat-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink/55">{sub}</p>}
    </div>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="app-alert-error mb-4" role="alert">
      <span className="flex-1">{message}</span>
      {onClose && (
        <button type="button" className="text-xs font-semibold underline" onClick={onClose}>
          Dismiss
        </button>
      )}
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink/55";
const thR = `${th} text-right`;
const td = "px-3 py-2.5 align-top text-sm";
const tdR = `${td} text-right tabular-nums`;

// ════════════════════════════════════════════════════════════════════════════════
// The weekly ledger — one row per marketer
// ════════════════════════════════════════════════════════════════════════════════
export function LedgerWeekPage({ initialWeek }: { initialWeek?: string }) {
  const router = useRouter();
  const { profile } = useAuth();
  // The week lives in the address (?week=2026-11-09) so a link always opens the same page of the ledger.
  const week = initialWeek && isMondayIso(initialWeek) ? initialWeek : thisMonday();
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUnattributed, setShowUnattributed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<WeekData>>(`/market-planning/ledger/week?weekStart=${week}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the ledger.");
    } finally {
      setLoading(false);
    }
  }, [week]);
  useEffect(() => {
    void load();
  }, [load]);
  useApiRecovery(!data, () => void load());

  function go(next: string) {
    router.replace(`/market-planning/ledger?week=${next}`);
  }

  const canSubmit = !!profile && (profile.hasGlobalAccess || profile.permissions.includes("market-planning.submit"));
  const canManage = !!profile && (profile.hasGlobalAccess || profile.permissions.includes("market-planning.manage"));
  const mine = data?.rows.find((r) => r.marketerId === profile?.id);
  const s = data?.summary;
  const wk = data?.week;

  function exportCsv() {
    if (!data) return;
    downloadRowsAsCsv(
      `marketing-ledger-${week}`,
      [
        { key: "marketer", label: "Marketer" },
        { key: "plan", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "planned", label: "Planned (GHS)" },
        { key: "sold", label: "Sold (GHS)" },
        { key: "unplanned", label: "Of which unplanned (GHS)" },
        { key: "variance", label: "Variance (GHS)" },
        { key: "attainment", label: "Attainment %" },
        { key: "customers", label: "Customers planned" },
        { key: "bought", label: "Customers who bought" },
        { key: "flags", label: "Notes" }
      ],
      data.rows,
      (r, key) => {
        const row = r as WeekRow;
        switch (key) {
          case "marketer": return row.marketerName;
          case "plan": return row.plan?.planNumber ?? "";
          case "status": return row.plan?.status ?? "NO PLAN";
          case "planned": return row.totals.plannedValue;
          case "sold": return row.totals.soldValue;
          case "unplanned": return row.totals.unplannedValue;
          case "variance": return row.totals.varianceValue;
          case "attainment": return row.totals.attainmentPct ?? "";
          case "customers": return row.totals.customersPlanned;
          case "bought": return row.totals.customersBought;
          default: return row.flags.map((f) => FLAGS[f].label).join("; ");
        }
      }
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Marketing ledger"
        title={data?.scope === "OWN" ? "My weekly plan" : "Weekly ledger"}
        description="Each marketer's plan for the week — which customers, how much — set against the sales that were actually recorded."
        actions={
          <div className="flex flex-wrap gap-2" data-no-print="">
            {canSubmit && mine && !mine.plan && (
              <Link className="app-button-primary" href={`/market-planning/ledger/new?week=${week}`}>
                <Plus className="h-4 w-4" aria-hidden /> Plan my week
              </Link>
            )}
            <button type="button" className="app-button-secondary" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4" aria-hidden /> Export
            </button>
            <button type="button" className="app-button-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" data-no-print="">
        <button type="button" className="app-button-secondary" onClick={() => go(addDaysIso(week, -7))} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-[210px] rounded-lg border border-line bg-surface px-4 py-2 text-center text-sm font-semibold">
          Week of {wk ? weekLabel(wk.start, wk.end) : weekLabel(week, addDaysIso(week, 6))}
        </div>
        <button type="button" className="app-button-secondary" onClick={() => go(addDaysIso(week, 7))} aria-label="Next week">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        {week !== thisMonday() && (
          <button type="button" className="app-button-secondary" onClick={() => go(thisMonday())}>
            This week
          </button>
        )}
        {wk?.isCurrent && (
          <span className="text-xs text-ink/60">
            {wk.elapsedPct}% of the week has gone — compare with how much of the plan is sold.
          </span>
        )}
      </div>

      <ErrorBanner message={error} />

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Planned" value={ghs(s.plannedValue)} sub={`${s.plansFiled} of ${s.marketers} marketers filed a plan`} />
          <Stat label="Sold" value={ghs(s.soldValue)} sub="credited to marketers this week" />
          <Stat label="Variance" value={`${signed(s.varianceValue)}`} valueClass={tone(s.varianceValue)} sub="sold minus planned, GHS" />
          <Stat label="Attainment" value={pct(s.attainmentPct)} sub="sold as a share of plan" />
          <Stat label="Weeks closed" value={`${s.plansClosed} / ${s.marketers}`} sub="reports filed for this week" />
        </div>
      )}

      {data?.unattributed && s && s.totalSalesValue !== null && (
        <div className="app-card mb-5 p-4 text-sm">
          <p>
            <b>Reconciliation.</b> Sales recorded this week: <b>{ghs(s.totalSalesValue)}</b> across {s.totalOrders} order(s). Credited to marketers: <b>{ghs((s.totalSalesValue ?? 0) - (s.unattributedValue ?? 0))}</b>. Not credited to any marketer:{" "}
            <b className={data.unattributed.value > 0 ? "text-amber-700" : ""}>{ghs(data.unattributed.value)}</b>
            {data.unattributed.orders > 0 && (
              <>
                {" "}
                ({data.unattributed.orders} order(s)){" "}
                <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setShowUnattributed((v) => !v)} data-no-print="">
                  {showUnattributed ? "hide" : "who?"}
                </button>
              </>
            )}
            .
          </p>
          {showUnattributed && (
            <ul className="mt-2 list-disc pl-5 text-ink/70">
              {data.unattributed.customers.map((c) => (
                <li key={c.customerId}>
                  {c.name} — {ghs(c.value)}
                </li>
              ))}
              <li className="list-none pl-0 text-xs text-ink/50">These customers are in nobody&apos;s plan or market and the order was not entered by a marketer. Assign them to a market to have the sales counted.</li>
            </ul>
          )}
        </div>
      )}

      <div className="app-card overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead className="border-b border-line bg-field">
            <tr>
              <th className={th}>Marketer</th>
              <th className={th}>Plan</th>
              <th className={th}>Customers</th>
              <th className={thR}>Planned</th>
              <th className={thR}>Sold</th>
              <th className={thR}>Variance</th>
              <th className={th}>Attainment</th>
              <th className={th}>Needs attention</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-ink/50">
                  <Spinner /> Loading the ledger…
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.marketerId} className="border-b border-line last:border-0">
                <td className={td}>
                  <p className="font-semibold">{r.marketerName}</p>
                  {r.markets.length > 0 && <p className="text-xs text-ink/50">{r.markets.join(", ")}</p>}
                </td>
                <td className={td}>
                  {r.plan ? (
                    <div className="space-y-1">
                      <Link className="font-semibold text-brand hover:underline" href={`/market-planning/ledger/${r.plan.id}`}>
                        {r.plan.planNumber}
                      </Link>
                      <div>
                        <StatusBadge status={r.plan.status} />
                      </div>
                      {r.plan.status === "CLOSED" && r.plan.signedOffAt && <p className="text-xs text-ink/50">Signed off by {r.plan.signedOffByName}</p>}
                    </div>
                  ) : r.marketerId === profile?.id && canSubmit ? (
                    <Link className="font-semibold text-brand hover:underline" href={`/market-planning/ledger/new?week=${week}`}>
                      Start this week&apos;s plan
                    </Link>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs text-ink/50">No plan</span>
                      {canManage && (
                        <div>
                          <Link className="text-xs font-semibold text-brand hover:underline" href={`/market-planning/ledger/new?week=${week}&marketer=${r.marketerId}`}>
                            Plan for them
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className={td}>
                  {r.totals.customersPlanned > 0 ? (
                    <>
                      <p className="tabular-nums">
                        {r.totals.customersBought} of {r.totals.customersPlanned} bought
                      </p>
                      <p className="text-xs text-ink/50">{pct(r.totals.hitRatePct)} hit rate</p>
                    </>
                  ) : (
                    <span className="text-xs text-ink/40">—</span>
                  )}
                </td>
                <td className={tdR}>{r.plan ? ghs(r.totals.plannedValue) : "—"}</td>
                <td className={tdR}>
                  <p className="font-semibold">{ghs(r.totals.soldValue)}</p>
                  {r.totals.unplannedValue > 0 && <p className="text-xs font-normal text-ink/50">{ghs(r.totals.unplannedValue)} not in the plan</p>}
                </td>
                <td className={`${tdR} ${r.plan ? tone(r.totals.varianceValue) : "text-ink/40"}`}>{r.plan ? signed(r.totals.varianceValue) : "—"}</td>
                <td className={td}>
                  <Attainment value={r.totals.attainmentPct} />
                </td>
                <td className={td}>
                  <FlagChips flags={r.flags} />
                  {r.driftValue !== null && Math.abs(r.driftValue) >= 1 && <p className="mt-1 text-xs text-red-700">Now shows {ghs(r.liveSoldValue)} ({signed(r.driftValue)})</p>}
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-ink/50">
                  No marketers to show for this week. Give someone the Marketer role, or assign them a market, and they will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="mt-5 text-sm text-ink/70">
        <summary className="cursor-pointer font-semibold text-ink">How the numbers are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b>Sold</b> is every order of the week that was not cancelled (pending, approved and delivered), valued at the order&apos;s line totals. Egg sales are recorded separately and are not included.
          </li>
          <li>
            An order is credited to <b>one</b> marketer: first the one whose plan names the customer; otherwise the marketer who entered the order; otherwise the owner of the customer&apos;s market. Anything left is shown above as not credited.
          </li>
          <li>
            <b>Hit rate</b> is the share of planned customers who bought anything. <b>Attainment</b> is sold ÷ planned. A line within 10% of its planned quantity counts as on plan.
          </li>
          <li>
            Once a week is <b>closed</b> its figures are frozen. If orders for that week change afterwards, the ledger shows what the sales records say now beside what was reported.
          </li>
        </ul>
      </details>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// One page of the ledger: a marketer's week, plan against actual
// ════════════════════════════════════════════════════════════════════════════════
type Dialog = null | "submit" | "approve" | "delete" | "return" | "close" | "signoff";

export function LedgerPlanPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<PlanDetail>>(`/market-planning/ledger/plans/${params.id}`);
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this plan.");
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useApiRecovery(!detail, () => void load());

  function open(d: Dialog) {
    setActionError("");
    setText("");
    setReasons({});
    setDialog(d);
  }

  async function run(path: string, method: "PATCH" | "DELETE", body?: unknown, after?: () => void) {
    setBusy(true);
    setActionError("");
    try {
      await apiFetch(`/market-planning/ledger/plans/${params.id}${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setDialog(null);
      if (after) after();
      else await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div>
        <Link className="text-sm font-semibold text-brand hover:underline" href="/market-planning/ledger">
          ← Weekly ledger
        </Link>
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!detail) {
    return (
      <p className="py-10 text-center text-sm text-ink/50">
        <Spinner /> Loading…
      </p>
    );
  }

  const { plan, totals, actions } = detail;
  const closed = plan.status === "CLOSED";
  const flagsHere: Flag[] = [];
  if (plan.late) flagsHere.push("LATE_PLAN");
  if (plan.revision > 0) flagsHere.push("REVISED");
  if (detail.live && Math.abs(detail.live.driftValue) >= 1) flagsHere.push("SALES_CHANGED_AFTER_CLOSE");
  const shortLines = detail.lines.filter((l) => detail.needReason.includes(l.id));

  return (
    <div>
      <div className="mb-2" data-no-print="">
        <Link className="text-sm font-semibold text-brand hover:underline" href={`/market-planning/ledger?week=${plan.weekStart}`}>
          ← Weekly ledger
        </Link>
      </div>
      <PageHeader
        kicker={`${plan.planNumber} · ${weekLabel(plan.weekStart, plan.weekEnd)}`}
        title={`${plan.marketerName}'s week`}
        description={plan.notes ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2" data-no-print="">
            <StatusBadge status={plan.status} />
            {actions.canEdit && (
              <Link className="app-button-secondary" href={`/market-planning/ledger/${plan.id}/edit`}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Link>
            )}
            {actions.canSubmit && (
              <button type="button" className="app-button-primary" onClick={() => open("submit")}>
                <SendHorizontal className="h-4 w-4" aria-hidden /> Submit for approval
              </button>
            )}
            {actions.canApprove && (
              <button type="button" className="app-button-primary" onClick={() => open("approve")}>
                <CircleCheckBig className="h-4 w-4" aria-hidden /> Approve
              </button>
            )}
            {actions.canReturn && (
              <button type="button" className="app-button-secondary" onClick={() => open("return")}>
                <Undo2 className="h-4 w-4" aria-hidden /> Send back
              </button>
            )}
            {actions.canClose && (
              <button type="button" className="app-button-primary" onClick={() => open("close")}>
                <CircleCheckBig className="h-4 w-4" aria-hidden /> Close the week
              </button>
            )}
            {actions.canSignOff && (
              <button type="button" className="app-button-primary" onClick={() => open("signoff")}>
                <CircleCheckBig className="h-4 w-4" aria-hidden /> Sign off
              </button>
            )}
            {actions.canDelete && (
              <button type="button" className="app-button-secondary text-red-700" onClick={() => open("delete")}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </button>
            )}
            <button type="button" className="app-button-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </button>
          </div>
        }
      />

      {flagsHere.length > 0 && (
        <div className="mb-4">
          <FlagChips flags={flagsHere} />
        </div>
      )}
      {plan.status === "DRAFT" && plan.returnReason && (
        <div className="app-alert-warning mb-4">
          <span>
            <b>Sent back{plan.returnedByName ? ` by ${plan.returnedByName}` : ""}:</b> {plan.returnReason}
          </span>
        </div>
      )}
      {detail.live && Math.abs(detail.live.driftValue) >= 1 && (
        <div className="app-alert-warning mb-4">
          <span>
            This week was closed reporting <b>{ghs2(totals.soldValue)}</b> sold. The sales records now show <b>{ghs2(detail.live.soldValue)}</b> ({signed(detail.live.driftValue)}): orders for this week were added, removed or edited after it was closed. The report below is what was filed.
          </span>
        </div>
      )}
      <ErrorBanner message={error} />

      {/* Timeline: when each step happened, and by whom */}
      <ol className="app-card mb-5 grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <TimelineStep label="Plan started" when={plan.createdByName ? `by ${plan.createdByName}` : ""} done />
        <TimelineStep
          label="Submitted"
          when={plan.firstSubmittedAt ? `${stamp(plan.firstSubmittedAt)}${plan.late ? " · late" : " · on time"}` : "not yet"}
          done={!!plan.firstSubmittedAt}
          warn={plan.late}
          note={plan.firstSubmittedAt ? undefined : `due by ${stamp(plan.deadline)}`}
        />
        <TimelineStep label="Approved" when={plan.approvedAt ? `${stamp(plan.approvedAt)} · ${plan.approvedByName}` : "not yet"} done={!!plan.approvedAt} note={plan.revision > 0 ? `revised ${plan.revision}×` : undefined} />
        <TimelineStep label="Week closed" when={plan.closedAt ? `${stamp(plan.closedAt)} · ${plan.closedByName}` : "not yet"} done={closed} />
        <TimelineStep label="Signed off" when={plan.signedOffAt ? `${stamp(plan.signedOffAt)} · ${plan.signedOffByName}` : "not yet"} done={!!plan.signedOffAt} note={plan.signOffNote ?? undefined} />
      </ol>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Planned" value={ghs(totals.plannedValue)} sub={totals.units.map((u) => `${qty(u.planned)} ${u.unit}`).join(" · ") || undefined} />
        <Stat label="Sold" value={ghs(totals.soldValue)} sub={totals.units.map((u) => `${qty(u.sold)} ${u.unit}`).join(" · ") || undefined} />
        <Stat label="Variance" value={signed(totals.varianceValue)} valueClass={tone(totals.varianceValue)} sub="sold minus planned, GHS" />
        <Stat label="Attainment" value={pct(totals.attainmentPct)} sub={!closed && detail.week.elapsedPct < 100 ? `${detail.week.elapsedPct}% of the week gone` : "sold ÷ planned"} />
        <Stat label="Hit rate" value={pct(totals.hitRatePct)} sub={`${totals.customersBought} of ${totals.customersPlanned} planned customers bought`} />
        <Stat label="Plan accuracy" value={pct(totals.accuracyPct)} sub="100% = sold exactly what and where planned" />
      </div>

      <section className="app-card mb-5 p-4">
        <h3 className="mb-2 text-sm font-bold">Why the sales differ from the plan</h3>
        <table className="w-full max-w-xl text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-ink/70">Volume: sold more or less than planned, at the planned price</td>
              <td className={`py-1 text-right font-semibold tabular-nums ${tone(totals.volumeVariance)}`}>{signed(totals.volumeVariance)}</td>
            </tr>
            <tr>
              <td className="py-1 text-ink/70">Price: sold at a higher or lower price than planned</td>
              <td className={`py-1 text-right font-semibold tabular-nums ${tone(totals.priceVariance)}`}>{signed(totals.priceVariance)}</td>
            </tr>
            <tr>
              <td className="py-1 text-ink/70">Sales that were not in the plan</td>
              <td className={`py-1 text-right font-semibold tabular-nums ${tone(totals.unplannedVariance)}`}>{signed(totals.unplannedVariance)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-1 font-semibold">Total variance (GHS)</td>
              <td className={`py-1 text-right font-bold tabular-nums ${tone(totals.varianceValue)}`}>{signed(totals.varianceValue)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="app-card mb-5 overflow-x-auto">
        <h3 className="px-4 pt-4 text-sm font-bold">Planned customers</h3>
        <table className="mt-2 w-full min-w-[980px]">
          <thead className="border-y border-line bg-field">
            <tr>
              <th className={th}>Customer</th>
              <th className={th}>Product</th>
              <th className={thR}>Planned</th>
              <th className={thR}>Sold</th>
              <th className={thR}>Planned GHS</th>
              <th className={thR}>Sold GHS</th>
              <th className={thR}>Variance</th>
              <th className={th}>Result</th>
              <th className={th}>{closed ? "Explanation" : "Note"}</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className={td}>
                  <p className="font-semibold">{l.customerName}</p>
                  <p className="text-xs text-ink/50">{l.customerCode}</p>
                </td>
                <td className={td}>{l.productName}</td>
                <td className={tdR}>
                  {qty(l.plannedQuantity)} {l.unit}
                  <p className="text-xs text-ink/50">@ {nf2.format(l.plannedUnitPrice)}</p>
                </td>
                <td className={tdR}>
                  {qty(l.actualQuantity)} {l.unit}
                  {l.actualUnitPrice !== null && <p className="text-xs text-ink/50">@ {nf2.format(l.actualUnitPrice)}</p>}
                </td>
                <td className={tdR}>{ghs(l.plannedValue)}</td>
                <td className={tdR}>{ghs(l.actualValue)}</td>
                <td className={`${tdR} ${tone(l.varianceValue)}`}>
                  {signed(l.varianceValue)}
                  <p className="text-xs font-normal text-ink/50">{pct(l.attainmentPct)}</p>
                </td>
                <td className={td}>
                  <Badge variant={LINE_STATUS[l.status].variant}>{LINE_STATUS[l.status].label}</Badge>
                </td>
                <td className={`${td} max-w-[260px] text-ink/70`}>{closed ? l.missReason ?? <span className="text-ink/35">—</span> : l.note ?? <span className="text-ink/35">—</span>}</td>
              </tr>
            ))}
            {detail.lines.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-ink/50">
                  No customers on this plan yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {detail.unplanned.length > 0 && (
        <section className="app-card mb-5 overflow-x-auto">
          <h3 className="px-4 pt-4 text-sm font-bold">Sold, but not in the plan</h3>
          <p className="px-4 text-xs text-ink/55">These sales are credited to {plan.marketerName} and count in Sold above, but the plan did not name them.</p>
          <table className="mt-2 w-full min-w-[640px]">
            <thead className="border-y border-line bg-field">
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Product</th>
                <th className={thR}>Sold</th>
                <th className={thR}>Value</th>
                <th className={th}>Orders</th>
              </tr>
            </thead>
            <tbody>
              {detail.unplanned.map((u) => (
                <tr key={`${u.customerId}-${u.productId}`} className="border-b border-line last:border-0">
                  <td className={td}>
                    {u.customerName}
                    {u.customerWasPlanned && <p className="text-xs text-ink/50">planned customer, different product</p>}
                  </td>
                  <td className={td}>{u.productName}</td>
                  <td className={tdR}>
                    {qty(u.quantity)} {u.unit}
                  </td>
                  <td className={tdR}>{ghs(u.value)}</td>
                  <td className={`${td} text-xs text-ink/60`}>{u.orderNumbers.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {closed && plan.closingNote && (
        <section className="app-card mb-5 p-4">
          <h3 className="text-sm font-bold">Closing note from {plan.closedByName}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink/75">{plan.closingNote}</p>
        </section>
      )}

      <details className="app-card mb-5 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Orders counted for this week ({detail.orders.length})</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="border-y border-line bg-field">
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Date</th>
                <th className={th}>Customer</th>
                <th className={thR}>Value</th>
                <th className={th}>Counted because</th>
              </tr>
            </thead>
            <tbody>
              {detail.orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <Link className="font-semibold text-brand hover:underline" href={`/sales/orders`}>
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className={td}>{new Date(o.orderDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td className={td}>{o.customerName}</td>
                  <td className={tdR}>{ghs2(o.value)}</td>
                  <td className={`${td} text-xs text-ink/60`}>{BASIS[o.basis]}</td>
                </tr>
              ))}
              {detail.orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink/50">
                    No orders have been credited to this marketer for the week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      {/* ── Dialogs ── */}
      <ConfirmModal
        open={dialog === "submit"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("/submit", "PATCH")}
        title="Submit this plan?"
        message="A manager will review it. Once submitted you can no longer change it unless the manager sends it back. A plan put forward after the end of the first day of the week shows as late."
        confirmLabel="Submit"
        variant="primary"
        loading={busy}
      />
      <ConfirmModal
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("/approve", "PATCH")}
        title="Approve this plan?"
        message={`This locks ${plan.marketerName}'s plan as the baseline the week will be measured against. If it has to change afterwards you can send it back, but it will show on the ledger as revised.`}
        confirmLabel="Approve"
        variant="primary"
        loading={busy}
      />
      <ConfirmModal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("", "DELETE", undefined, () => router.replace(`/market-planning/ledger?week=${plan.weekStart}`))}
        title="Delete this draft?"
        message={`This removes the draft plan ${plan.planNumber}. It can't be undone.`}
        confirmLabel="Delete"
        loading={busy}
      />

      <Modal open={dialog === "return"} onClose={() => setDialog(null)} title="Send this plan back">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("/return", "PATCH", { reason: text.trim() });
          }}
          className="space-y-3"
        >
          <p className="text-sm text-ink/70">
            The plan goes back to draft so {plan.marketerName} can change it. {plan.status === "APPROVED" && <b>It was already approved, so this will show on the ledger as a revision.</b>}
          </p>
          <label className="block text-sm font-semibold">
            Reason
            <textarea className="app-control mt-1 w-full py-2" rows={3} required minLength={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <ErrorBanner message={actionError} />
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button-secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="app-button-primary" disabled={busy || text.trim().length < 3}>
              {busy && <Spinner size="xs" />} Send back
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "close"} onClose={() => setDialog(null)} title="Close the week" size="lg">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("/close", "PATCH", {
              closingNote: text.trim() || undefined,
              reasons: Object.entries(reasons)
                .filter(([, r]) => r.trim())
                .map(([lineId, reason]) => ({ lineId, reason: reason.trim() }))
            });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-ink/70">
            This files the week&apos;s report: the plan is set against the sales recorded so far (<b>{ghs2(totals.soldValue)}</b> against <b>{ghs2(totals.plannedValue)}</b> planned) and the figures are frozen.
          </p>
          {shortLines.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {actions.mustExplain ? "Say briefly why each of these fell short of plan." : "These fell short of plan. An explanation is optional when you close it for the marketer."}
              </p>
              {shortLines.map((l) => (
                <label key={l.id} className="block text-sm">
                  <span className="font-semibold">
                    {l.customerName} — {l.productName}
                  </span>
                  <span className="ml-2 text-xs text-ink/55">
                    planned {qty(l.plannedQuantity)} {l.unit}, sold {qty(l.actualQuantity)}
                  </span>
                  <input
                    className="app-control mt-1 w-full"
                    required={actions.mustExplain}
                    maxLength={300}
                    placeholder="e.g. Customer postponed the order to next week"
                    value={reasons[l.id] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
          <label className="block text-sm font-semibold">
            Anything else management should know (optional)
            <textarea className="app-control mt-1 w-full py-2" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <ErrorBanner message={actionError} />
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button-secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="app-button-primary" disabled={busy}>
              {busy && <Spinner size="xs" />} Close the week
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "signoff"} onClose={() => setDialog(null)} title="Sign off this week">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run("/sign-off", "PATCH", { note: text.trim() || undefined });
          }}
          className="space-y-3"
        >
          <p className="text-sm text-ink/70">Signing off records that you have reviewed {plan.marketerName}&apos;s week: what was planned, what was sold and the explanations given.</p>
          <label className="block text-sm font-semibold">
            Comment (optional)
            <textarea className="app-control mt-1 w-full py-2" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <ErrorBanner message={actionError} />
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button-secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="app-button-primary" disabled={busy}>
              {busy && <Spinner size="xs" />} Sign off
            </button>
          </div>
        </form>
      </Modal>

      {actionError && !dialog && <ErrorBanner message={actionError} onClose={() => setActionError("")} />}
    </div>
  );
}

function TimelineStep({ label, when, done, warn, note }: { label: string; when: string; done?: boolean; warn?: boolean; note?: string }) {
  return (
    <li className="flex gap-2">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${done ? (warn ? "bg-amber-500" : "bg-emerald-500") : "bg-line"}`} aria-hidden />
      <div>
        <p className="font-semibold">{label}</p>
        <p className={`text-xs ${warn ? "text-amber-700" : "text-ink/60"}`}>{when}</p>
        {note && <p className="text-xs text-ink/50">{note}</p>}
      </div>
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Writing a plan: new, or editing a draft
// ════════════════════════════════════════════════════════════════════════════════
type FormLine = { key: string; customerId: string; customerName: string; productId: string; qty: string; price: string; priceTouched: boolean; note: string };
let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

export function LedgerPlanFormPage({ editing = false, initialWeek, initialMarketer }: { editing?: boolean; initialWeek?: string; initialMarketer?: string }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [opts, setOpts] = useState<Options | null>(null);
  const [weekStart, setWeekStart] = useState(initialWeek && isMondayIso(initialWeek) ? initialWeek : thisMonday());
  const [marketerId, setMarketerId] = useState(initialMarketer ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [loadedPlan, setLoadedPlan] = useState<PlanDetail | null>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<Options>>("/market-planning/ledger/options")
      .then((r) => setOpts(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the form."));
  }, []);

  useEffect(() => {
    if (!editing) return;
    apiFetch<ApiEnvelope<PlanDetail>>(`/market-planning/ledger/plans/${params.id}`)
      .then((r) => {
        const d = r.data;
        setLoadedPlan(d);
        setWeekStart(d.plan.weekStart);
        setMarketerId(d.plan.marketerId);
        setNotes(d.plan.notes ?? "");
        setLines(d.lines.map((l) => ({ key: newKey(), customerId: l.customerId, customerName: l.customerName, productId: l.productId, qty: String(l.plannedQuantity), price: String(l.plannedUnitPrice), priceTouched: true, note: l.note ?? "" })));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this plan."));
  }, [editing, params.id]);

  // Who the plan is for must always be someone in the list: a manager who is not themselves a
  // marketer (the CEO, say) starts on the first marketer rather than on a blank that would
  // silently save the plan under their own name.
  useEffect(() => {
    if (!opts || editing) return;
    const ids = new Set(opts.marketers.map((m) => m.id));
    setMarketerId((cur) => (cur && ids.has(cur) ? cur : ids.has(opts.me.id) ? opts.me.id : opts.marketers[0]?.id ?? ""));
  }, [opts, editing]);

  const unitOf = useMemo(() => new Map((opts?.products ?? []).map((p) => [p.id, p.unit])), [opts]);
  const weeks = useMemo(() => {
    const now = thisMonday();
    const back = opts?.canManage ? 8 : 0;
    const list = Array.from({ length: back + 5 }, (_, i) => addDaysIso(now, (i - back) * 7));
    // An existing plan's week may be older than the list reaches.
    return list.includes(weekStart) ? list : [weekStart, ...list];
  }, [opts?.canManage, weekStart]);

  const me = opts?.me.id ?? "";
  const planningFor = marketerId || me;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !opts) return [];
    return opts.customers.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, 8);
  }, [search, opts]);

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const customerCount = new Set(lines.map((l) => l.customerId)).size;

  async function hint(key: string, customerId: string, productId: string) {
    if (!customerId || !productId) return;
    try {
      const r = await apiFetch<ApiEnvelope<{ unitPrice: number; source: string }>>(`/market-planning/ledger/price-hint?customerId=${customerId}&productId=${productId}`, { quiet: true });
      if (r.data.unitPrice > 0) setLines((ls) => ls.map((l) => (l.key === key && !l.priceTouched ? { ...l, price: String(r.data.unitPrice) } : l)));
    } catch {
      /* a missing hint just leaves the price for the marketer to type */
    }
  }

  function addCustomer(c: { id: string; name: string }) {
    const productId = lines.length ? lines[lines.length - 1].productId : opts?.products.length === 1 ? opts.products[0].id : "";
    const line: FormLine = { key: newKey(), customerId: c.id, customerName: c.name, productId, qty: "", price: "", priceTouched: false, note: "" };
    setLines((ls) => [...ls, line]);
    setSearch("");
    void hint(line.key, c.id, productId);
  }

  function addMyMarket() {
    if (!opts) return;
    const mine = new Set(opts.myMarkets.map((m) => m.id));
    const have = new Set(lines.map((l) => l.customerId));
    const productId = lines.length ? lines[lines.length - 1].productId : "";
    const fresh = opts.customers.filter((c) => c.marketId && mine.has(c.marketId) && !have.has(c.id));
    setLines((ls) => [...ls, ...fresh.map((c) => ({ key: newKey(), customerId: c.id, customerName: c.name, productId, qty: "", price: "", priceTouched: false, note: "" }))]);
  }

  function patch(key: string, change: Partial<FormLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function validate(): string {
    if (!lines.length) return "Add at least one customer.";
    const seen = new Set<string>();
    for (const l of lines) {
      if (!l.productId) return `Choose a product for ${l.customerName}.`;
      if (!(Number(l.qty) > 0)) return `Enter how much ${l.customerName} is expected to buy.`;
      if (l.price === "" || Number(l.price) < 0) return `Enter the price for ${l.customerName}.`;
      const k = `${l.customerId}|${l.productId}`;
      if (seen.has(k)) return `${l.customerName} appears twice for the same product — combine them.`;
      seen.add(k);
    }
    return "";
  }

  async function save(andSubmit: boolean) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(andSubmit ? "submit" : "draft");
    const payloadLines = lines.map((l) => ({ customerId: l.customerId, productId: l.productId, plannedQuantity: Number(l.qty), plannedUnitPrice: Number(l.price), ...(l.note.trim() ? { note: l.note.trim() } : {}) }));
    try {
      let id = params?.id;
      if (editing) {
        await apiFetch(`/market-planning/ledger/plans/${id}`, { method: "PATCH", body: JSON.stringify({ notes, lines: payloadLines }) });
      } else {
        const res = await apiFetch<ApiEnvelope<{ id: string }>>("/market-planning/ledger/plans", {
          method: "POST",
          body: JSON.stringify({ weekStart, ...(marketerId && marketerId !== me ? { marketerId } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), lines: payloadLines })
        });
        id = res.data.id;
      }
      if (andSubmit) await apiFetch(`/market-planning/ledger/plans/${id}/submit`, { method: "PATCH" });
      router.push(`/market-planning/ledger/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plan.");
      setSaving("");
    }
  }

  if (opts && !opts.canSubmit) {
    return <ErrorBanner message="Your account can view the ledger but not write plans. Ask a manager to give you the Marketer role." />;
  }

  return (
    <div>
      <div className="mb-2">
        <Link className="text-sm font-semibold text-brand hover:underline" href={`/market-planning/ledger?week=${weekStart}`}>
          ← Weekly ledger
        </Link>
      </div>
      <PageHeader
        kicker="Marketing ledger"
        title={editing ? "Edit weekly plan" : "Plan the week"}
        description="List the customers you expect to sell to this week and how much. When the week ends, your plan is set against the sales actually recorded."
      />
      <ErrorBanner message={error} onClose={() => setError("")} />
      {editing && loadedPlan?.plan.returnReason && (
        <div className="app-alert-warning mb-4">
          <span>
            <b>Sent back{loadedPlan.plan.returnedByName ? ` by ${loadedPlan.plan.returnedByName}` : ""}:</b> {loadedPlan.plan.returnReason}
          </span>
        </div>
      )}

      <div className="app-card mb-5 grid gap-4 p-4 sm:grid-cols-3">
        <label className="text-sm font-semibold">
          Week
          <select className="app-control mt-1 w-full" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} disabled={editing}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w, addDaysIso(w, 6))}
                {w === thisMonday() ? " (this week)" : ""}
              </option>
            ))}
          </select>
          {!editing && weekStart === thisMonday() && new Date().getDay() !== 1 && new Date().getDay() !== 0 && <span className="mt-1 block text-xs font-normal text-amber-700">The first day of this week has passed, so this plan will show as late.</span>}
        </label>
        {opts?.canManage && opts.marketers.length > 0 && (
          <label className="text-sm font-semibold">
            Marketer
            <select className="app-control mt-1 w-full" value={planningFor} onChange={(e) => setMarketerId(e.target.value)} disabled={editing}>
              {opts.marketers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                  {m.id === me ? " (me)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm font-semibold sm:col-span-1">
          Notes (optional)
          <input className="app-control mt-1 w-full" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Focus on layer farms around Ejura" />
        </label>
      </div>

      <section className="app-card mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <label className="text-sm font-semibold" htmlFor="customer-search">
              Add a customer
            </label>
            <input id="customer-search" className="app-control mt-1 w-full" placeholder="Type a customer's name or code…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface shadow-modal" role="listbox">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-field" onClick={() => addCustomer(c)}>
                      <span>{c.name}</span>
                      <span className="text-xs text-ink/50">{c.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {search.trim() && opts && matches.length === 0 && <p className="mt-1 text-xs text-ink/55">No active customer matches. New customers are added under Sales → Customers first.</p>}
          </div>
          {opts && opts.myMarkets.length > 0 && planningFor === me && (
            <button type="button" className="app-button-secondary" onClick={addMyMarket}>
              <Plus className="h-4 w-4" aria-hidden /> Add all customers in {opts.myMarkets.map((m) => m.name).join(", ")}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-y border-line bg-field">
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Product</th>
                <th className={thR}>Expected quantity</th>
                <th className={thR}>Price each (GHS)</th>
                <th className={thR}>Value</th>
                <th className={th}>Note</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-line last:border-0">
                  <td className={`${td} font-semibold`}>{l.customerName}</td>
                  <td className={td}>
                    <select
                      className="app-control w-full min-w-[160px]"
                      value={l.productId}
                      aria-label={`Product for ${l.customerName}`}
                      onChange={(e) => {
                        patch(l.key, { productId: e.target.value });
                        void hint(l.key, l.customerId, e.target.value);
                      }}
                    >
                      <option value="">Choose…</option>
                      {opts?.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <div className="flex items-center justify-end gap-1">
                      <input className="app-control w-24 text-right" type="number" min="0" step="any" inputMode="decimal" value={l.qty} aria-label={`Quantity for ${l.customerName}`} onChange={(e) => patch(l.key, { qty: e.target.value })} />
                      <span className="w-10 text-xs text-ink/55">{unitOf.get(l.productId) ?? ""}</span>
                    </div>
                  </td>
                  <td className={td}>
                    <input className="app-control ml-auto block w-28 text-right" type="number" min="0" step="0.01" inputMode="decimal" value={l.price} aria-label={`Price for ${l.customerName}`} onChange={(e) => patch(l.key, { price: e.target.value, priceTouched: true })} />
                  </td>
                  <td className={`${tdR} font-semibold`}>{ghs((Number(l.qty) || 0) * (Number(l.price) || 0))}</td>
                  <td className={td}>
                    <input className="app-control w-full min-w-[140px]" maxLength={300} value={l.note} aria-label={`Note for ${l.customerName}`} onChange={(e) => patch(l.key, { note: e.target.value })} />
                  </td>
                  <td className={td}>
                    <button type="button" className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label={`Remove ${l.customerName}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-ink/50">
                    No customers yet. Search above and pick the customers you plan to sell to.
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-line">
                  <td className={`${td} font-semibold`} colSpan={4}>
                    {customerCount} customer(s), {lines.length} line(s)
                  </td>
                  <td className={`${tdR} font-bold`}>{ghs(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-xs text-ink/55">The price is filled in from what that customer last paid (or the price list). Change it if you expect a different price. Quantities are in the product&apos;s selling unit — bags for feed.</p>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Link className="app-button-secondary" href={`/market-planning/ledger?week=${weekStart}`}>
          Cancel
        </Link>
        <button type="button" className="app-button-secondary" onClick={() => void save(false)} disabled={!!saving}>
          {saving === "draft" && <Spinner size="xs" />} Save as draft
        </button>
        <button type="button" className="app-button-primary" onClick={() => void save(true)} disabled={!!saving}>
          {saving === "submit" ? <Spinner size="xs" /> : <SendHorizontal className="h-4 w-4" aria-hidden />} Save and submit for approval
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Scorecard: each marketer across recent weeks
// ════════════════════════════════════════════════════════════════════════════════
const BIAS: Record<NonNullable<Scorecard["rows"][number]["summary"]["bias"]>, { label: string; variant: "warning" | "info" | "success"; hint: string }> = {
  PLANS_TOO_HIGH: { label: "Plans run high", variant: "warning", hint: "Over the finished weeks, sales averaged under 80% of plan." },
  PLANS_TOO_LOW: { label: "Plans run low", variant: "info", hint: "Over the finished weeks, sales averaged over 120% of plan." },
  BALANCED: { label: "Plans realistic", variant: "success", hint: "Sales averaged within 80–120% of plan." }
};

export function LedgerScorecardPage() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<Scorecard | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<Scorecard>>(`/market-planning/ledger/scorecard?weeks=${weeks}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the scorecard.");
    }
  }, [weeks]);
  useEffect(() => {
    void load();
  }, [load]);
  useApiRecovery(!data, () => void load());

  return (
    <div>
      <PageHeader
        kicker="Marketing ledger"
        title="Scorecard"
        description="How each marketer has done against their plans over recent weeks. A direction to talk about, not a verdict: it only counts weeks that have finished."
        actions={
          <label className="flex items-center gap-2 text-sm font-semibold" data-no-print="">
            Weeks
            <select className="app-control" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[4, 8, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <ErrorBanner message={error} />
      <div className="app-card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-line bg-field">
            <tr>
              <th className={th}>Marketer</th>
              {data?.weeks.map((w) => (
                <th key={w} className={`${thR} whitespace-nowrap`} title={weekLabel(w, addDaysIso(w, 6))}>
                  {dayFmt(w, { day: "numeric", month: "short" })}
                </th>
              ))}
              <th className={thR}>Avg attainment</th>
              <th className={thR}>Plan accuracy</th>
              <th className={thR}>Hit rate</th>
              <th className={th}>Filed on time</th>
              <th className={th}>Pattern</th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-ink/50">
                  <Spinner /> Loading…
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.marketerId} className="border-b border-line last:border-0">
                <td className={`${td} font-semibold`}>{r.marketerName}</td>
                {r.cells.map((c, i) => (
                  <td key={data.weeks[i]} className={`${tdR} whitespace-nowrap`}>
                    {c ? (
                      <Link
                        href={`/market-planning/ledger/${c.planId}`}
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold hover:underline ${c.attainmentPct === null ? "bg-line/60 text-ink/60" : c.attainmentPct >= 90 ? "bg-emerald-50 text-emerald-700" : c.attainmentPct >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                        title={`${c.status.toLowerCase()} · planned ${ghs(c.plannedValue)}${c.soldValue !== null ? ` · sold ${ghs(c.soldValue)}` : ""}${c.late ? " · plan was late" : ""}${c.counts ? "" : " · not counted yet"}`}
                      >
                        {c.attainmentPct !== null ? pct(c.attainmentPct) : c.status === "DRAFT" ? "draft" : "—"}
                        {c.late ? " ⏱" : ""}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink/30" title="No plan filed">
                        –
                      </span>
                    )}
                  </td>
                ))}
                <td className={`${tdR} font-semibold`}>{pct(r.summary.avgAttainmentPct)}</td>
                <td className={tdR}>{pct(r.summary.avgAccuracyPct)}</td>
                <td className={tdR}>{pct(r.summary.avgHitRatePct)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.summary.onTime} of {r.summary.weeks}
                  <p className="text-xs text-ink/50">{r.summary.plansFiled} filed · {r.summary.closed} closed</p>
                </td>
                <td className={td}>
                  {r.summary.bias ? (
                    <span title={BIAS[r.summary.bias].hint}>
                      <Badge variant={BIAS[r.summary.bias].variant}>{BIAS[r.summary.bias].label}</Badge>
                    </span>
                  ) : (
                    <span className="text-xs text-ink/40" title="Needs at least three finished weeks">
                      too early
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-ink/50">
                  No marketers or plans to show yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink/55">
        Each figure is sold ÷ planned for that week (green 90% and over, amber 70–90%, red under 70%); ⏱ marks a plan that came in after the first day of the week; “–” is a week with no plan. Plan accuracy is 100% only when the sales matched the plan customer by customer. Averages count finished weeks only.
      </p>
    </div>
  );
}
