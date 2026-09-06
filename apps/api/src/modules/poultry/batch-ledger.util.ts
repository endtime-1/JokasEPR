/**
 * Batch ledger reconstruction — the day-by-day "opening → closing" running
 * record the farm keeps in its Excel "Room" sheets, rebuilt from the discrete
 * records the system stores.
 *
 * Pure functions, no DB access — the caller supplies the already-scoped record
 * lists (whole batch, one house, or one pen) and the opening count for that
 * scope. Shared by PoultryService.batchLedger() and the batch-lifecycle report's
 * weekly-summary section.
 */

const DAY_MS = 86_400_000;
const KG_PER_BAG = 50;

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export type LedgerDated = { date: Date | string };

export interface LedgerInput {
  /** Live-bird count for this scope at the batch's start date. */
  openingBirdCount: number;
  startDate: Date | string;
  /** Defaults to now. Ledger runs start → this date inclusive. */
  through?: Date | string;
  mortality: (LedgerDated & { birdCount: number; isCulling: boolean })[];
  transfersIn: (LedgerDated & { birdCount: number })[];
  transfersOut: (LedgerDated & { birdCount: number })[];
  adjustments: (LedgerDated & { delta: number })[];
  eggs: (LedgerDated & { count: number })[];
  feedKg: (LedgerDated & { kg: number })[];
  weights: (LedgerDated & { averageWeightKg: number })[];
}

export interface LedgerDay {
  date: string;
  ageDays: number;
  ageWeeks: number;
  opening: number;
  mortality: number;
  culls: number;
  transferIn: number;
  transferOut: number;
  adjustment: number;
  closing: number;
  cumulativeDeaths: number;
  cumulativeMortalityPct: number;
  eggs: number;
  layPct: number | null;
  feedKg: number;
  feedBags: number;
  weightKg: number | null;
}

export interface LedgerWeek {
  week: number;
  fromDate: string;
  toDate: string;
  opening: number;
  mortality: number;
  culls: number;
  transferIn: number;
  transferOut: number;
  adjustment: number;
  closing: number;
  cumulativeDeaths: number;
  cumulativeMortalityPct: number;
  eggs: number;
  avgLayPct: number | null;
  feedKg: number;
  feedBags: number;
  actualWeightKg: number | null;
  targetWeightKg: number | null;
}

function sumByDay<T extends LedgerDated>(rows: T[], value: (r: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.date);
    m.set(k, (m.get(k) ?? 0) + value(r));
  }
  return m;
}

/** Rebuild the daily opening→closing ledger for one scope. */
export function buildDailyLedger(input: LedgerInput): LedgerDay[] {
  const start = new Date(`${dayKey(input.startDate)}T00:00:00.000Z`);
  const end = new Date(`${dayKey(input.through ?? new Date())}T00:00:00.000Z`);
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));

  const deathsBy = sumByDay(input.mortality.filter((m) => !m.isCulling), (m) => m.birdCount);
  const cullsBy = sumByDay(input.mortality.filter((m) => m.isCulling), (m) => m.birdCount);
  const tInBy = sumByDay(input.transfersIn, (t) => t.birdCount);
  const tOutBy = sumByDay(input.transfersOut, (t) => t.birdCount);
  const adjBy = sumByDay(input.adjustments, (a) => a.delta);
  const eggsBy = sumByDay(input.eggs, (e) => e.count);
  const feedBy = sumByDay(input.feedKg, (f) => f.kg);
  const weightBy = sumByDay(input.weights, (w) => w.averageWeightKg);
  const weightCountBy = sumByDay(input.weights, () => 1);

  const rows: LedgerDay[] = [];
  let opening = input.openingBirdCount;
  let cumDeaths = 0;

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const k = dayKey(d);
    const mortality = deathsBy.get(k) ?? 0;
    const culls = cullsBy.get(k) ?? 0;
    const transferIn = tInBy.get(k) ?? 0;
    const transferOut = tOutBy.get(k) ?? 0;
    const adjustment = adjBy.get(k) ?? 0;
    const closing = Math.max(0, opening - mortality - culls + transferIn - transferOut + adjustment);
    cumDeaths += mortality;
    const eggs = eggsBy.get(k) ?? 0;
    const feedKg = round(feedBy.get(k) ?? 0, 1);
    const wSum = weightBy.get(k);
    const wCount = weightCountBy.get(k) ?? 0;
    const weightKg = wCount > 0 ? round((wSum as number) / wCount, 3) : null;
    // Lay % uses the day's opening hen count (matches the Excel's %PROD'N).
    const layPct = eggs > 0 && opening > 0 ? round((eggs / opening) * 100, 1) : eggs > 0 ? 0 : null;

    rows.push({
      date: k,
      ageDays: i,
      ageWeeks: Math.floor(i / 7) + 1,
      opening,
      mortality,
      culls,
      transferIn,
      transferOut,
      adjustment,
      closing,
      cumulativeDeaths: cumDeaths,
      cumulativeMortalityPct: input.openingBirdCount > 0 ? round((cumDeaths / input.openingBirdCount) * 100, 2) : 0,
      eggs,
      layPct,
      feedKg,
      feedBags: round(feedKg / KG_PER_BAG, 2),
      weightKg,
    });
    opening = closing;
  }
  return rows;
}

/**
 * Roll the daily ledger up to one row per age-week — the farm's "WKL REP" line.
 * `targetWeightKg` is looked up per week by the optional resolver (breed
 * standard); pass `undefined` to leave the column blank.
 */
export function bucketWeekly(
  days: LedgerDay[],
  targetWeightKg?: (week: number) => number | null,
): LedgerWeek[] {
  const byWeek = new Map<number, LedgerDay[]>();
  for (const d of days) {
    if (!byWeek.has(d.ageWeeks)) byWeek.set(d.ageWeeks, []);
    byWeek.get(d.ageWeeks)!.push(d);
  }
  const weeks: LedgerWeek[] = [];
  for (const [week, list] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    const first = list[0];
    const last = list[list.length - 1];
    const sum = (pick: (d: LedgerDay) => number) => list.reduce((s, d) => s + pick(d), 0);
    const layDays = list.filter((d) => d.layPct != null);
    const weightDays = list.filter((d) => d.weightKg != null);
    weeks.push({
      week,
      fromDate: first.date,
      toDate: last.date,
      opening: first.opening,
      mortality: sum((d) => d.mortality),
      culls: sum((d) => d.culls),
      transferIn: sum((d) => d.transferIn),
      transferOut: sum((d) => d.transferOut),
      adjustment: sum((d) => d.adjustment),
      closing: last.closing,
      cumulativeDeaths: last.cumulativeDeaths,
      cumulativeMortalityPct: last.cumulativeMortalityPct,
      eggs: sum((d) => d.eggs),
      avgLayPct: layDays.length ? round(layDays.reduce((s, d) => s + (d.layPct as number), 0) / layDays.length, 1) : null,
      feedKg: round(sum((d) => d.feedKg), 1),
      feedBags: round(sum((d) => d.feedKg) / KG_PER_BAG, 2),
      actualWeightKg: weightDays.length ? weightDays[weightDays.length - 1].weightKg : null,
      targetWeightKg: targetWeightKg ? targetWeightKg(week) : null,
    });
  }
  return weeks;
}
