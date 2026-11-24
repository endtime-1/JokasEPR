/**
 * Stock card (product ledger) — for ONE product in ONE store: every receipt and
 * every issue in date order, with the balance left after each line.
 *
 * Pure functions, no DB access. The caller supplies the product's stock
 * movements for the store and the store's current quantity on hand.
 *
 * The card is anchored to the REAL stock on hand: the last balance always equals
 * what the store holds now. Anything the movement records do not explain
 * (stock that was there before records began, or changed without a movement) is
 * shown openly as the "brought forward" figure instead of being hidden.
 */

const IN_TYPES = new Set(["OPENING_BALANCE", "PURCHASE_RECEIPT", "PRODUCTION_OUTPUT", "ADJUSTMENT_IN", "RETURN_IN"]);

const LABELS: Record<string, [string, string]> = {
  // type: [label when it adds stock, label when it removes stock]
  OPENING_BALANCE: ["Opening balance", "Opening balance"],
  PURCHASE_RECEIPT: ["Received (purchase)", "Received (purchase)"],
  PRODUCTION_INPUT: ["Used in production", "Used in production"],
  PRODUCTION_OUTPUT: ["Produced", "Produced"],
  SALE_DISPATCH: ["Sold", "Sold"],
  TRANSFER: ["Transfer in", "Transfer out"],
  ADJUSTMENT_IN: ["Stock adjustment (added)", "Stock adjustment (added)"],
  ADJUSTMENT_OUT: ["Stock adjustment (removed)", "Stock adjustment (removed)"],
  WASTE: ["Waste / write-off", "Waste / write-off"],
  RETURN_IN: ["Customer return", "Customer return"],
  RETURN_OUT: ["Returned to supplier", "Returned to supplier"],
};

// A clearer wording when we know what the stock was actually used for (the
// movement type alone says "production input" even for feed given to birds).
const REFERENCE_LABELS: Record<string, string> = {
  "FeedConsumptionRecord|OUT": "Fed to birds",
  "FeedConsumptionRecord|IN": "Feed correction (given back)",
  "MedicationRecord|OUT": "Used as medication",
  "VaccinationRecord|OUT": "Used as vaccine",
  "FeedReceiptRecord|IN": "Feed received on the farm",
  "EggSale|OUT": "Sold (eggs)",
  "SparePartUsage|OUT": "Used for maintenance",
};

export interface CardMovement {
  id: string;
  movementDate: Date | string;
  createdAt: Date | string;
  movementType: string;
  quantity: number;
  warehouseId: string | null;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  lot: string | null;
  by: string | null;
}

export interface CardLine {
  date: string;
  type: string;
  label: string;
  direction: "IN" | "OUT";
  in: number;
  out: number;
  balance: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  lots: string[];
  by: string | null;
  /** Recorded for the audit trail but it did not change the stock (e.g. a transfer shortfall write-off). */
  infoOnly: boolean;
}

export interface StockCard {
  lines: CardLine[];
  summary: {
    onHand: number;
    /** Stock the movement records do not explain: on hand now minus everything the records add up to. */
    broughtForward: number;
    /** Balance at the start of the chosen period. */
    opening: number;
    totalIn: number;
    totalOut: number;
    /** Balance at the end of the chosen period (equals stock on hand when no end date is chosen). */
    closing: number;
    /** True when the records do not fully explain the stock on hand. */
    hasUnexplained: boolean;
  };
}

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

export function directionFor(m: { movementType: string; toWarehouseId: string | null }, warehouseId: string): "IN" | "OUT" {
  if (m.movementType === "TRANSFER") return m.toWarehouseId === warehouseId ? "IN" : "OUT";
  return IN_TYPES.has(m.movementType) ? "IN" : "OUT";
}

export function buildStockCard(input: {
  warehouseId: string;
  onHand: number;
  movements: CardMovement[];
  /** Inclusive YYYY-MM-DD bounds for the lines to show. */
  from?: string | null;
  to?: string | null;
}): StockCard {
  const sorted = [...input.movements].sort(
    (a, b) => new Date(a.movementDate).getTime() - new Date(b.movementDate).getTime() || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // One line per business event: a sale or production batch is written as one
  // movement per stock lot, so same-document movements are added together.
  type Group = { first: CardMovement; dir: "IN" | "OUT"; qty: number; lots: Set<string>; infoOnly: boolean; day: string };
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const m of sorted) {
    const dir = directionFor(m, input.warehouseId);
    const day = dayKey(m.movementDate);
    const key = m.referenceId ? `${m.movementType}|${m.referenceType}|${m.referenceId}|${day}|${dir}` : `single|${m.id}`;
    let g = index.get(key);
    if (!g) {
      g = { first: m, dir, qty: 0, lots: new Set(), infoOnly: m.movementType === "WASTE" && m.referenceType === "TransferDiscrepancy", day };
      index.set(key, g);
      groups.push(g);
    }
    g.qty += Number(m.quantity);
    if (m.lot) g.lots.add(m.lot);
  }

  const signed = (g: Group) => (g.infoOnly ? 0 : g.dir === "IN" ? g.qty : -g.qty);
  const net = groups.reduce((s, g) => s + signed(g), 0);
  const broughtForward = round(input.onHand - net);

  const from = input.from || null;
  const to = input.to || null;
  let running = broughtForward;
  for (const g of groups) if (from && g.day < from) running += signed(g);
  const opening = round(running);

  const lines: CardLine[] = [];
  let totalIn = 0;
  let totalOut = 0;
  for (const g of groups) {
    if (from && g.day < from) continue;
    if (to && g.day > to) continue;
    running += signed(g);
    if (!g.infoOnly) (g.dir === "IN" ? (totalIn += g.qty) : (totalOut += g.qty));
    const [inLabel, outLabel] = LABELS[g.first.movementType] ?? [g.first.movementType, g.first.movementType];
    lines.push({
      date: new Date(g.first.movementDate).toISOString(),
      type: g.first.movementType,
      label: REFERENCE_LABELS[`${g.first.referenceType}|${g.dir}`] ?? (g.dir === "IN" ? inLabel : outLabel),
      direction: g.dir,
      in: g.dir === "IN" ? round(g.qty) : 0,
      out: g.dir === "OUT" ? round(g.qty) : 0,
      balance: round(running),
      referenceType: g.first.referenceType,
      referenceId: g.first.referenceId,
      notes: g.first.notes,
      lots: [...g.lots],
      by: g.first.by,
      infoOnly: g.infoOnly,
    });
  }

  return {
    lines,
    summary: {
      onHand: round(input.onHand),
      broughtForward,
      opening,
      totalIn: round(totalIn),
      totalOut: round(totalOut),
      closing: round(running),
      hasUnexplained: Math.abs(broughtForward) > 0.0001,
    },
  };
}
