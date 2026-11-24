// Whole-house entry for the poultry Egg, Feed and Mortality record screens.
//
// Pick a house and every pen in it appears as its own small form, so a whole house is recorded in one go
// instead of one pen at a time. This file holds the plain logic: which pens to show, what to send for each,
// and how to total what is already recorded. The screen itself is components/poultry-house-entry.tsx.
//
// Nothing here changes how a record is checked or saved. Every pen is sent, one record at a time, to the same
// create endpoint the single-pen form uses, so all the existing rules (live-bird limits, one batch per pen,
// stock deduction, audit trail) apply exactly as before. A pen the server turns down does not stop the others.

/** 1 crate of eggs = 30 eggs (the same figure the single-pen egg form and lib/units.ts use). */
export const EGGS_PER_CRATE = 30;
/** Feed is bagged in 50 kg sacks; stock is kept in kg (same as lib/units.ts). */
export const KG_PER_BAG = 50;

export type HouseEntryType = "eggs" | "feed" | "mortality";

/** The record screens that get the whole-house form. */
export const HOUSE_ENTRY_TYPES: readonly string[] = ["eggs", "feed", "mortality"];

/** Only laying flocks produce eggs (the server enforces the same rule). */
export const LAYING_BIRD_TYPES: readonly string[] = ["LAYERS", "BREEDERS"];

/** More bags than this in one pen at once is almost certainly kilograms typed into the bags box, so it is not accepted here. */
export const FEED_BAGS_CHECK = 60;

/** How many records the screen's list loads at a time (must match the page's own `take`). */
export const RECORDS_PAGE_SIZE = 200;

const MAX_COUNT = 1_000_000;
const MAX_AMOUNT = 1_000_000;

// ─── Pens ──────────────────────────────────────────────────────────────────────

export type HouseEntryPen = { id: string; code: string; name?: string; penNumber: number; poultryHouseId: string };
export type HouseEntryBatch = { id: string; code?: string; name: string; birdType: string; farmId?: string };
export type HouseEntryAllocation = { flockBatchId: string; poultryHouseId: string; penId: string };

/** The part of the poultry options this form needs. */
export type HouseEntryOptions = {
  pens: HouseEntryPen[];
  batches: HouseEntryBatch[];
  allocations: HouseEntryAllocation[];
};

export type PenBatch = { id: string; code: string; name: string; birdType: string; farmId?: string };

export type PenRow = {
  penId: string;
  penNumber: number;
  penCode: string;
  penName: string;
  /** Batches that currently hold birds in this pen. Normally exactly one; none means the pen is empty. */
  batches: PenBatch[];
};

/**
 * Every pen of the house, in pen order, with the batch that holds birds in it.
 * The options' placement list already leaves out pens a batch has fully moved out of, and batches that are closed.
 * When a batch is chosen, only the pens holding that batch are listed.
 */
export function buildPenRows(options: HouseEntryOptions, houseId: string, batchFilterId = ""): PenRow[] {
  const batchById = new Map(options.batches.map((b) => [b.id, b] as const));
  const rows = options.pens
    .filter((p) => p.poultryHouseId === houseId)
    .slice()
    .sort((a, b) => a.penNumber - b.penNumber)
    .map((pen): PenRow => {
      const seen = new Set<string>();
      const batches: PenBatch[] = [];
      for (const a of options.allocations) {
        if (a.penId !== pen.id || seen.has(a.flockBatchId)) continue;
        if (batchFilterId && a.flockBatchId !== batchFilterId) continue;
        const b = batchById.get(a.flockBatchId);
        if (!b) continue;
        seen.add(b.id);
        batches.push({ id: b.id, code: b.code ?? b.name, name: b.name, birdType: b.birdType, farmId: b.farmId });
      }
      return { penId: pen.id, penNumber: pen.penNumber, penCode: pen.code, penName: pen.name ?? "", batches };
    });
  return batchFilterId ? rows.filter((r) => r.batches.length > 0) : rows;
}

// ─── Fields ────────────────────────────────────────────────────────────────────

export type FieldKind = "int" | "decimal" | "text";
export type FieldDef = { key: string; label: string; kind: FieldKind };

/** What is typed for each pen, per record type. `crates` is only a helper that fills in the good-egg count. */
export const HOUSE_FIELDS: Record<HouseEntryType, FieldDef[]> = {
  eggs: [
    { key: "crates", label: `Crates (1 = ${EGGS_PER_CRATE} eggs)`, kind: "decimal" },
    { key: "goodEggs", label: "Good (pieces)", kind: "int" },
    { key: "crackedEggs", label: "Cracked (pieces)", kind: "int" },
    { key: "dirtyEggs", label: "Dirty (pieces)", kind: "int" },
    { key: "brokenEggs", label: "Broken (pieces)", kind: "int" },
    { key: "rejectedEggs", label: "Rejected (pieces)", kind: "int" }
  ],
  feed: [
    { key: "bags", label: `Bags (${KG_PER_BAG} kg each)`, kind: "decimal" },
    { key: "costAmount", label: "Cost (GHS, optional)", kind: "decimal" }
  ],
  mortality: [
    { key: "deaths", label: "Deaths", kind: "int" },
    { key: "culls", label: "Deliberate culls", kind: "int" },
    { key: "reason", label: "Reason (optional)", kind: "text" }
  ]
};

/** The egg boxes most pens never use; on a phone they sit behind a toggle so five pens do not make a very long page. */
export const EXTRA_EGG_FIELDS: readonly string[] = ["crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs"];

/** Typing crates fills the good-egg count (1 crate = 30 eggs), the same helper the single-pen egg form has. */
export function cratesToEggs(crates: string): string {
  const s = crates.trim();
  if (s === "") return "";
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Math.round(n * EGGS_PER_CRATE));
}

export type Parsed = { value: number; error?: string };

/** A whole number, blank counts as 0. */
export function parseWhole(raw: string | undefined, label: string): Parsed {
  const s = (raw ?? "").trim();
  if (s === "") return { value: 0 };
  if (!/^\d+$/.test(s)) return { value: 0, error: `${label}: use whole numbers only` };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > MAX_COUNT) return { value: 0, error: `${label}: that number is too large` };
  return { value: n };
}

/** A number that may have decimals (bags, money), blank counts as 0. */
export function parseAmount(raw: string | undefined, label: string): Parsed {
  const s = (raw ?? "").trim();
  if (s === "") return { value: 0 };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { value: 0, error: `${label}: enter a number` };
  const n = Number(s);
  if (!Number.isFinite(n) || n > MAX_AMOUNT) return { value: 0, error: `${label}: that number is too large` };
  return { value: n };
}

// ─── Formatting ────────────────────────────────────────────────────────────────

const numberFormat = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 });
export const fmtNum = (n: number) => numberFormat.format(n);

/** 1,834 eggs as "61 crates + 4 (1,834 eggs)". */
export function eggsText(pieces: number): string {
  const crates = Math.floor(pieces / EGGS_PER_CRATE);
  const loose = pieces % EGGS_PER_CRATE;
  const total = `${fmtNum(pieces)} ${pieces === 1 ? "egg" : "eggs"}`;
  if (crates === 0) return total;
  const cr = `${fmtNum(crates)} ${crates === 1 ? "crate" : "crates"}`;
  return loose ? `${cr} + ${loose} (${total})` : `${cr} (${total})`;
}

export function feedText(kg: number): string {
  const bags = kg / KG_PER_BAG;
  return `${fmtNum(bags)} ${bags === 1 ? "bag" : "bags"} (${fmtNum(kg)} kg)`;
}

// ─── What to send ──────────────────────────────────────────────────────────────

export type SavePart = {
  /** Stable per pen and kind, used to keep one idempotency key per attempt. */
  id: string;
  penId: string;
  kind: "eggs" | "feed" | "deaths" | "culls";
  label: string;
  /** Short wording for the "saved" line. */
  summary: string;
  /** The request body, without the idempotency key. */
  payload: Record<string, unknown>;
};

export type RowPlan = {
  parts: SavePart[];
  /** Why this pen cannot be saved as typed. A pen with an error is skipped, the others still save. */
  error?: string;
  /** For the live total under the boxes. */
  eggPieces?: number;
  feedKg?: number;
};

export type PlanContext = {
  recordDate: string;
  /** Egg store (eggs) or feed store (feed). */
  warehouseId?: string;
  /** Egg product (eggs) or feed product (feed). */
  productId?: string;
  secondsProductId?: string;
};

type Base = { flockBatchId: string; penId: string; recordDate: string };

const EGG_FIELDS = [
  ["goodEggs", "Good"],
  ["crackedEggs", "Cracked"],
  ["dirtyEggs", "Dirty"],
  ["brokenEggs", "Broken"],
  ["rejectedEggs", "Rejected"]
] as const;

function planEggs(row: PenRow, base: Base, input: Record<string, string>, ctx: PlanContext): RowPlan {
  const counts: Record<string, number> = {};
  for (const [key, label] of EGG_FIELDS) {
    const p = parseWhole(input[key], label);
    if (p.error) return { parts: [], error: p.error };
    counts[key] = p.value;
  }
  const pieces = EGG_FIELDS.reduce((sum, [key]) => sum + counts[key], 0);
  if (pieces === 0) return { parts: [] };
  const payload: Record<string, unknown> = {
    ...base,
    goodEggs: counts.goodEggs,
    crackedEggs: counts.crackedEggs,
    dirtyEggs: counts.dirtyEggs,
    brokenEggs: counts.brokenEggs,
    rejectedEggs: counts.rejectedEggs,
    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
    ...(ctx.productId ? { eggProductId: ctx.productId } : {}),
    ...(ctx.secondsProductId ? { secondsProductId: ctx.secondsProductId } : {})
  };
  return {
    parts: [{ id: `${row.penId}:eggs`, penId: row.penId, kind: "eggs", label: "Eggs", summary: eggsText(pieces), payload }],
    eggPieces: pieces
  };
}

function planFeed(row: PenRow, base: Base, input: Record<string, string>, ctx: PlanContext): RowPlan {
  const bags = parseAmount(input.bags, "Bags");
  if (bags.error) return { parts: [], error: bags.error };
  const cost = parseAmount(input.costAmount, "Cost");
  if (cost.error) return { parts: [], error: cost.error };
  const bagsTyped = (input.bags ?? "").trim() !== "";
  const costTyped = (input.costAmount ?? "").trim() !== "";
  if (!bagsTyped && !costTyped) return { parts: [] };
  const kg = Math.round(bags.value * KG_PER_BAG * 1000) / 1000;
  if (kg < 0.001) return { parts: [], error: "Bags: enter how many bags this pen was given" };
  // Feed stock is kept in kg and fed out of 50 kg bags; kg typed into the bags box is the classic slip.
  // A real amount this large for one pen can still be recorded on its own with the single-pen form.
  if (bags.value > FEED_BAGS_CHECK) {
    return {
      parts: [],
      feedKg: kg,
      error: `${fmtNum(bags.value)} bags is ${fmtNum(kg)} kg, which looks like kg typed into the bags box. If it is right, record this pen on its own (choose it in the Pen box).`
    };
  }
  const payload: Record<string, unknown> = {
    ...base,
    quantityKg: kg,
    ...(ctx.productId ? { feedProductId: ctx.productId } : {}),
    ...(ctx.warehouseId ? { warehouseId: ctx.warehouseId } : {}),
    ...(costTyped ? { costAmount: cost.value } : {})
  };
  return {
    parts: [{ id: `${row.penId}:feed`, penId: row.penId, kind: "feed", label: "Feed", summary: feedText(kg), payload }],
    feedKg: kg
  };
}

function planMortality(row: PenRow, base: Base, input: Record<string, string>): RowPlan {
  const deaths = parseWhole(input.deaths, "Deaths");
  if (deaths.error) return { parts: [], error: deaths.error };
  const culls = parseWhole(input.culls, "Culls");
  if (culls.error) return { parts: [], error: culls.error };
  const reason = (input.reason ?? "").trim();
  if (deaths.value === 0 && culls.value === 0) {
    return reason ? { parts: [], error: "Enter how many birds died or were culled, or clear the reason" } : { parts: [] };
  }
  const reasonPart = reason ? { reason } : {};
  const parts: SavePart[] = [];
  if (deaths.value > 0) {
    parts.push({
      id: `${row.penId}:deaths`,
      penId: row.penId,
      kind: "deaths",
      label: "Deaths",
      summary: `${fmtNum(deaths.value)} ${deaths.value === 1 ? "death" : "deaths"}`,
      payload: { ...base, birdCount: deaths.value, isCulling: false, ...reasonPart }
    });
  }
  if (culls.value > 0) {
    parts.push({
      id: `${row.penId}:culls`,
      penId: row.penId,
      kind: "culls",
      label: "Culls",
      summary: `${fmtNum(culls.value)} ${culls.value === 1 ? "cull" : "culls"}`,
      payload: { ...base, birdCount: culls.value, isCulling: true, ...reasonPart }
    });
  }
  return { parts };
}

/** Turns what was typed for one pen into the record(s) to save. An untouched pen gives no parts and no error. */
export function planRow(type: HouseEntryType, row: PenRow, batch: PenBatch, input: Record<string, string>, ctx: PlanContext): RowPlan {
  const base: Base = { flockBatchId: batch.id, penId: row.penId, recordDate: ctx.recordDate };
  if (type === "eggs") return planEggs(row, base, input, ctx);
  if (type === "feed") return planFeed(row, base, input, ctx);
  return planMortality(row, base, input);
}

/** Which typed fields a saved part used up, so they can be cleared once it is saved. */
export function fieldsUsedBy(part: SavePart): string[] {
  if (part.kind === "eggs") return ["crates", "goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs"];
  if (part.kind === "feed") return ["bags", "costAmount"];
  if (part.kind === "deaths") return ["deaths"];
  return ["culls"];
}

// ─── What is already recorded ──────────────────────────────────────────────────

const num = (v: unknown): number => Number(v) || 0;

/** Whether the loaded list can be trusted to hold every record of that date (it is newest first, capped). */
export function recordsCoverDate(records: Record<string, unknown>[], date: string, pageSize = RECORDS_PAGE_SIZE): boolean {
  if (records.length < pageSize) return true;
  let oldest = "9999-99-99";
  for (const r of records) {
    const d = String(r.recordDate ?? "").slice(0, 10);
    if (d && d < oldest) oldest = d;
  }
  return date > oldest;
}

export type Recorded = { text: string; amount: number };

/** What this pen already has recorded on the date, from the records the screen has loaded. */
export function recordedFor(type: HouseEntryType, records: Record<string, unknown>[], penId: string, date: string): Recorded | null {
  let eggs = 0;
  let kg = 0;
  let deaths = 0;
  let culls = 0;
  let found = 0;
  for (const r of records) {
    if (r.penId !== penId) continue;
    if (String(r.recordDate ?? "").slice(0, 10) !== date) continue;
    if (r.status === "REJECTED") continue;
    found++;
    if (type === "eggs") eggs += num(r.goodEggs) + num(r.crackedEggs) + num(r.dirtyEggs) + num(r.brokenEggs) + num(r.rejectedEggs);
    else if (type === "feed") kg += num(r.quantityKg);
    else if (r.isCulling) culls += num(r.birdCount);
    else deaths += num(r.birdCount);
  }
  if (!found) return null;
  if (type === "eggs") return { text: eggsText(eggs), amount: eggs };
  if (type === "feed") return { text: feedText(kg), amount: kg };
  const bits = [deaths ? `${fmtNum(deaths)} dead` : "", culls ? `${fmtNum(culls)} culled` : ""].filter(Boolean);
  return { text: bits.join(", ") || "none", amount: deaths + culls };
}

// ─── Saving ────────────────────────────────────────────────────────────────────

/** True when the failure is about reaching the server, so the pens still waiting should not be tried. */
export function isConnectionProblem(message: string): boolean {
  return /not reachable|failed to fetch|network|timed out|load failed|session expired/i.test(message);
}

/** A random id for one save attempt, so that sending the same pen twice can never record it twice. */
export function newKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
