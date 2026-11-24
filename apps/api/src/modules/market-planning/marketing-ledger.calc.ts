// Marketing Ledger — the rules, with no database in sight.
//
// Everything here is a pure function so the numbers a CEO reads can be checked
// by a unit test instead of by trusting a screen. The service loads the data
// (plans, sales orders, who owns which market) and hands it to these functions.
//
// The measures follow standard plan-versus-actual sales reporting:
//   variance            = actual - plan                      (negative = short of plan)
//   attainment %        = actual / plan
//   volume variance     = (actual qty - planned qty) x planned price
//   price variance      = actual value - planned price x actual qty
//     -> volume + price = total variance on every planned line, exactly
//   hit rate (strike)   = planned customers who bought / planned customers
//   plan accuracy       = 1 - sum(|actual - plan|) / plan      (WAPE; penalises misses AND surprises)

/** A line within +/- this percent of plan counts as "on plan"; below it is "short". */
export const LEDGER_TOLERANCE_PCT = 10;

/** A plan is on time when it is first submitted before this many days after its week starts (i.e. by the end of day one). */
export const PLAN_DEADLINE_DAYS = 1;

/** Plans sit consistently this far below (or above) plan before the scorecard calls it a pattern. */
export const BIAS_LOW_PCT = 80;
export const BIAS_HIGH_PCT = 120;
export const BIAS_MIN_WEEKS = 3;

export type AttributionBasis = "PLANNED_CUSTOMER" | "SOLD_BY_MARKETER" | "MARKET_CUSTOMER";
export type LineStatus = "ABOVE_PLAN" | "ON_PLAN" | "SHORT" | "NO_SALE";

const BASIS_RANK: Record<AttributionBasis, number> = { PLANNED_CUSTOMER: 1, SOLD_BY_MARKETER: 2, MARKET_CUSTOMER: 3 };

// ── Rounding ────────────────────────────────────────────────────────────────
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/** a as a percentage of b, one decimal, or null when b is zero (nothing was planned). */
export function pctOf(a: number, b: number): number | null {
  return b > 0 ? round1((a / b) * 100) : null;
}

// ── Weeks (Monday to Sunday, UTC — Ghana does not use daylight saving) ───────
const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** UTC midnight of the Monday of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -sinceMonday);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" (or a full ISO string) to UTC midnight. Returns null when it is not a real date. */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || isoDate(d) !== `${m[1]}-${m[2]}-${m[3]}` ? null : d;
}

export function isMonday(date: Date): boolean {
  return date.getUTCDay() === 1;
}

export type WeekRange = { start: Date; end: Date; endExclusive: Date };
export function weekRange(weekStart: Date): WeekRange {
  return { start: weekStart, end: addDays(weekStart, 6), endExclusive: addDays(weekStart, 7) };
}

/** How much of the week has gone, 0-100, measured in whole days: Monday morning = 0, Sunday evening = 100. */
export function weekElapsedPct(weekStart: Date, now: Date): number {
  const elapsed = (now.getTime() - weekStart.getTime()) / (7 * DAY_MS);
  return Math.round(Math.min(1, Math.max(0, elapsed)) * 100);
}

/** True when the plan was first put forward after the end of the first day of its week. */
export function isLatePlan(weekStart: Date, firstSubmittedAt: Date | null): boolean {
  if (!firstSubmittedAt) return false;
  return firstSubmittedAt.getTime() >= addDays(weekStart, PLAN_DEADLINE_DAYS).getTime();
}

/** The week can be closed once its last day has started. */
export function canCloseWeek(weekStart: Date, now: Date): boolean {
  return now.getTime() >= addDays(weekStart, 6).getTime();
}

// ── Who gets credit for a sale ──────────────────────────────────────────────
export type LedgerOrderItem = { productId: string; quantity: number; value: number };
export type LedgerOrder = {
  id: string;
  orderNumber: string;
  orderDate: Date;
  customerId: string;
  salespersonId: string | null;
  items: LedgerOrderItem[];
};

export type LedgerMarketer = {
  marketerId: string;
  /** Customers named in this marketer's plan for the week (empty when they filed no plan). */
  plannedCustomerIds: Set<string>;
  /** Markets (territories) assigned to this marketer. */
  marketIds: Set<string>;
  /** Tie-breaker only: lower = their plan was put forward first. */
  order: number;
};

export type Attribution = { marketerId: string; basis: AttributionBasis };

/**
 * Decides which marketer each order counts for. Every order counts for at most
 * one marketer, so adding up the marketers never exceeds the company's sales.
 *
 * Strongest claim first:
 *   1. PLANNED_CUSTOMER — the customer is named in the marketer's plan for the week.
 *   2. SOLD_BY_MARKETER — the marketer entered the order themselves.
 *   3. MARKET_CUSTOMER  — the customer belongs to a market assigned to the marketer.
 * A tie between two marketers is settled by: the one who entered the order, then
 * the owner of the customer's market, then whoever put their plan forward first.
 * An order nobody can claim is "unattributed" and is reported as such.
 */
export function attributeOrders(
  orders: LedgerOrder[],
  marketers: LedgerMarketer[],
  customerMarket: Map<string, string | null>
): Map<string, Attribution> {
  const out = new Map<string, Attribution>();
  for (const order of orders) {
    const marketId = customerMarket.get(order.customerId) ?? null;
    let best: { m: LedgerMarketer; basis: AttributionBasis } | null = null;

    for (const m of marketers) {
      let basis: AttributionBasis | null = null;
      if (m.plannedCustomerIds.has(order.customerId)) basis = "PLANNED_CUSTOMER";
      else if (order.salespersonId === m.marketerId) basis = "SOLD_BY_MARKETER";
      else if (marketId && m.marketIds.has(marketId)) basis = "MARKET_CUSTOMER";
      if (!basis) continue;

      if (!best) {
        best = { m, basis };
        continue;
      }
      const rank = BASIS_RANK[basis] - BASIS_RANK[best.basis];
      if (rank !== 0) {
        if (rank < 0) best = { m, basis };
        continue;
      }
      const seller = Number(order.salespersonId === m.marketerId) - Number(order.salespersonId === best.m.marketerId);
      if (seller !== 0) {
        if (seller > 0) best = { m, basis };
        continue;
      }
      const owner = Number(!!marketId && m.marketIds.has(marketId)) - Number(!!marketId && best.m.marketIds.has(marketId));
      if (owner !== 0) {
        if (owner > 0) best = { m, basis };
        continue;
      }
      if (m.order !== best.m.order ? m.order < best.m.order : m.marketerId < best.m.marketerId) best = { m, basis };
    }

    if (best) out.set(order.id, { marketerId: best.m.marketerId, basis: best.basis });
  }
  return out;
}

// ── Plan against actual ─────────────────────────────────────────────────────
export type CreditedOrder = LedgerOrder & { basis: AttributionBasis };

export type LedgerLineInput = {
  id: string;
  customerId: string;
  productId: string;
  plannedQuantity: number;
  plannedUnitPrice: number;
  plannedValue: number;
};

export type LineResult = LedgerLineInput & {
  actualQuantity: number;
  actualValue: number;
  /** Average price actually charged; null when nothing was sold. */
  actualUnitPrice: number | null;
  varianceValue: number;
  /** Sold value / planned value. */
  attainmentPct: number | null;
  volumeVariance: number;
  priceVariance: number;
  status: LineStatus;
};

export type UnplannedRow = {
  customerId: string;
  productId: string;
  quantity: number;
  value: number;
  /** The customer is in the plan, just not for this product. */
  customerWasPlanned: boolean;
  orderNumbers: string[];
};

export type UnitSummary = { unit: string; planned: number; sold: number };

export type LedgerTotals = {
  plannedValue: number;
  /** Everything credited to the marketer this week: planned lines plus unplanned sales. */
  soldValue: number;
  plannedLineSoldValue: number;
  unplannedValue: number;
  /** soldValue - plannedValue. Always equals volume + price + unplanned. */
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
  /** Planned lines that reached at least the tolerance band (on plan or above). */
  linesOnPlan: number;
  orderCount: number;
  units: UnitSummary[];
};

export type PlanLedger = { lines: LineResult[]; unplanned: UnplannedRow[]; totals: LedgerTotals };

export function lineStatus(plannedQuantity: number, actualQuantity: number): LineStatus {
  if (actualQuantity <= 0) return "NO_SALE";
  if (plannedQuantity <= 0) return "ABOVE_PLAN";
  const ratio = actualQuantity / plannedQuantity;
  const tol = LEDGER_TOLERANCE_PCT / 100;
  if (ratio >= 1 + tol) return "ABOVE_PLAN";
  if (ratio >= 1 - tol) return "ON_PLAN";
  return "SHORT";
}

/** One plan line set against what was sold on it. Also used to re-read a closed week from its frozen figures. */
export function evaluateLine(line: LedgerLineInput, soldQuantity: number, soldValue: number): LineResult {
  const actualQuantity = round4(soldQuantity);
  const actualValue = round2(soldValue);
  const varianceValue = round2(actualValue - line.plannedValue);
  const volumeVariance = round2((actualQuantity - line.plannedQuantity) * line.plannedUnitPrice);
  return {
    ...line,
    actualQuantity,
    actualValue,
    actualUnitPrice: actualQuantity > 0 ? round2(actualValue / actualQuantity) : null,
    varianceValue,
    attainmentPct: pctOf(actualValue, line.plannedValue),
    volumeVariance,
    // The remainder, so volume + price equals the variance to the cent.
    priceVariance: round2(varianceValue - volumeVariance),
    status: lineStatus(line.plannedQuantity, actualQuantity)
  };
}

/**
 * Sets a plan's lines against the orders credited to that marketer.
 * `unitOf` gives each product's selling unit ("bag", "crate") for the quantity summary.
 */
export function buildPlanLedger(lines: LedgerLineInput[], credited: CreditedOrder[], unitOf: (productId: string) => string = () => "unit"): PlanLedger {
  const sold = new Map<string, { quantity: number; value: number; orders: Set<string> }>();
  const boughtCustomers = new Set<string>();
  for (const order of credited) {
    boughtCustomers.add(order.customerId);
    for (const item of order.items) {
      const key = `${order.customerId}|${item.productId}`;
      const cur = sold.get(key) ?? { quantity: 0, value: 0, orders: new Set<string>() };
      cur.quantity += item.quantity;
      cur.value += item.value;
      cur.orders.add(order.orderNumber);
      sold.set(key, cur);
    }
  }

  const plannedCustomers = new Set(lines.map((l) => l.customerId));
  const matched = new Set<string>();

  const resultLines: LineResult[] = lines.map((line) => {
    const key = `${line.customerId}|${line.productId}`;
    matched.add(key);
    const s = sold.get(key);
    return evaluateLine(line, s?.quantity ?? 0, s?.value ?? 0);
  });

  const unplanned: UnplannedRow[] = [];
  for (const [key, s] of sold) {
    if (matched.has(key)) continue;
    const [customerId, productId] = key.split("|");
    unplanned.push({
      customerId,
      productId,
      quantity: round4(s.quantity),
      value: round2(s.value),
      customerWasPlanned: plannedCustomers.has(customerId),
      orderNumbers: [...s.orders].sort()
    });
  }
  unplanned.sort((a, b) => b.value - a.value);

  const plannedValue = round2(resultLines.reduce((s, l) => s + l.plannedValue, 0));
  const plannedLineSoldValue = round2(resultLines.reduce((s, l) => s + l.actualValue, 0));
  const unplannedValue = round2(unplanned.reduce((s, u) => s + u.value, 0));
  const soldValue = round2(plannedLineSoldValue + unplannedValue);
  const varianceValue = round2(soldValue - plannedValue);
  const volumeVariance = round2(resultLines.reduce((s, l) => s + l.volumeVariance, 0));
  const priceVariance = round2(varianceValue - unplannedValue - volumeVariance);

  const absError = resultLines.reduce((s, l) => s + Math.abs(l.actualValue - l.plannedValue), 0) + unplannedValue;
  const customersBought = [...plannedCustomers].filter((c) => boughtCustomers.has(c)).length;

  const unitMap = new Map<string, UnitSummary>();
  const bump = (productId: string, planned: number, soldQty: number) => {
    const unit = unitOf(productId);
    const cur = unitMap.get(unit) ?? { unit, planned: 0, sold: 0 };
    cur.planned += planned;
    cur.sold += soldQty;
    unitMap.set(unit, cur);
  };
  for (const l of resultLines) bump(l.productId, l.plannedQuantity, l.actualQuantity);
  for (const u of unplanned) bump(u.productId, 0, u.quantity);

  return {
    lines: resultLines,
    unplanned,
    totals: {
      plannedValue,
      soldValue,
      plannedLineSoldValue,
      unplannedValue,
      varianceValue,
      attainmentPct: pctOf(soldValue, plannedValue),
      volumeVariance,
      priceVariance,
      unplannedVariance: unplannedValue,
      customersPlanned: plannedCustomers.size,
      customersBought,
      hitRatePct: pctOf(customersBought, plannedCustomers.size),
      accuracyPct: plannedValue > 0 ? round1(Math.max(0, 100 - (absError / plannedValue) * 100)) : null,
      linesPlanned: resultLines.length,
      linesOnPlan: resultLines.filter((l) => l.status === "ON_PLAN" || l.status === "ABOVE_PLAN").length,
      orderCount: credited.length,
      units: [...unitMap.values()].map((u) => ({ unit: u.unit, planned: round4(u.planned), sold: round4(u.sold) })).sort((a, b) => a.unit.localeCompare(b.unit))
    }
  };
}

/**
 * Over several weeks: do a marketer's plans keep landing well above what they
 * sell (plans too high), or well below (plans too low)? A direction, not a
 * verdict — it needs a few weeks before it says anything.
 */
export function classifyBias(attainments: number[]): "PLANS_TOO_HIGH" | "PLANS_TOO_LOW" | "BALANCED" | null {
  if (attainments.length < BIAS_MIN_WEEKS) return null;
  const avg = attainments.reduce((s, a) => s + a, 0) / attainments.length;
  if (avg < BIAS_LOW_PCT) return "PLANS_TOO_HIGH";
  if (avg > BIAS_HIGH_PCT) return "PLANS_TOO_LOW";
  return "BALANCED";
}

/** Lines of a closing report that need an explanation: the sale fell more than the tolerance short of plan. */
export function linesNeedingReason(lines: Array<Pick<LineResult, "id" | "status">>): string[] {
  return lines.filter((l) => l.status === "SHORT" || l.status === "NO_SALE").map((l) => l.id);
}
