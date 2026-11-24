import {
  CreditedOrder,
  LedgerLineInput,
  LedgerMarketer,
  LedgerOrder,
  addDays,
  attributeOrders,
  buildPlanLedger,
  canCloseWeek,
  classifyBias,
  evaluateLine,
  isLatePlan,
  isMonday,
  isoDate,
  lineStatus,
  linesNeedingReason,
  mondayOf,
  parseDay,
  pctOf,
  weekElapsedPct,
  weekRange
} from "./marketing-ledger.calc";

const MON = new Date("2026-11-09T00:00:00.000Z"); // a Monday

function order(id: string, customerId: string, items: Array<[string, number, number]>, salespersonId: string | null = null): LedgerOrder {
  return { id, orderNumber: `SO-${id}`, orderDate: addDays(MON, 1), customerId, salespersonId, items: items.map(([productId, quantity, value]) => ({ productId, quantity, value })) };
}
const credited = (o: LedgerOrder): CreditedOrder => ({ ...o, basis: "PLANNED_CUSTOMER" });

function line(id: string, customerId: string, productId: string, qty: number, price: number): LedgerLineInput {
  return { id, customerId, productId, plannedQuantity: qty, plannedUnitPrice: price, plannedValue: qty * price };
}

function marketer(marketerId: string, opts: { planned?: string[]; markets?: string[]; order?: number } = {}): LedgerMarketer {
  return { marketerId, plannedCustomerIds: new Set(opts.planned ?? []), marketIds: new Set(opts.markets ?? []), order: opts.order ?? 0 };
}

describe("weeks", () => {
  it("finds the Monday of any day, across a month and year boundary", () => {
    expect(isoDate(mondayOf(new Date("2026-11-12T15:30:00Z")))).toBe("2026-11-09"); // Thursday
    expect(isoDate(mondayOf(new Date("2026-11-15T23:59:00Z")))).toBe("2026-11-09"); // Sunday belongs to the week before
    expect(isoDate(mondayOf(new Date("2026-11-09T00:00:00Z")))).toBe("2026-11-09"); // Monday itself
    expect(isoDate(mondayOf(new Date("2027-01-01T08:00:00Z")))).toBe("2026-12-28"); // New Year's Day, a Friday
  });

  it("parses real dates only", () => {
    expect(isoDate(parseDay("2026-11-09") as Date)).toBe("2026-11-09");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("not a date")).toBeNull();
    expect(isMonday(parseDay("2026-11-09") as Date)).toBe(true);
    expect(isMonday(parseDay("2026-11-10") as Date)).toBe(false);
  });

  it("runs Monday to Sunday", () => {
    const r = weekRange(MON);
    expect(isoDate(r.end)).toBe("2026-11-15");
    expect(isoDate(r.endExclusive)).toBe("2026-11-16");
  });

  it("measures how much of the week has gone", () => {
    expect(weekElapsedPct(MON, new Date("2026-11-09T00:00:00Z"))).toBe(0);
    expect(weekElapsedPct(MON, new Date("2026-11-12T12:00:00Z"))).toBe(50);
    expect(weekElapsedPct(MON, new Date("2026-11-30T00:00:00Z"))).toBe(100);
    expect(weekElapsedPct(MON, new Date("2026-11-01T00:00:00Z"))).toBe(0);
  });

  it("calls a plan late only when it was first submitted after the end of the first day", () => {
    expect(isLatePlan(MON, null)).toBe(false);
    expect(isLatePlan(MON, new Date("2026-11-08T20:00:00Z"))).toBe(false); // the evening before
    expect(isLatePlan(MON, new Date("2026-11-09T23:59:59Z"))).toBe(false); // end of Monday
    expect(isLatePlan(MON, new Date("2026-11-10T00:00:00Z"))).toBe(true); // Tuesday
  });

  it("opens the closing window on the last day of the week", () => {
    expect(canCloseWeek(MON, new Date("2026-11-14T23:00:00Z"))).toBe(false); // Saturday night
    expect(canCloseWeek(MON, new Date("2026-11-15T00:00:00Z"))).toBe(true); // Sunday
    expect(canCloseWeek(MON, new Date("2026-11-20T00:00:00Z"))).toBe(true);
  });
});

describe("lineStatus — the +/-10% band", () => {
  it("classifies against the planned quantity", () => {
    expect(lineStatus(100, 0)).toBe("NO_SALE");
    expect(lineStatus(100, 50)).toBe("SHORT");
    expect(lineStatus(100, 89.9)).toBe("SHORT");
    expect(lineStatus(100, 90)).toBe("ON_PLAN");
    expect(lineStatus(100, 100)).toBe("ON_PLAN");
    expect(lineStatus(100, 109.9)).toBe("ON_PLAN");
    expect(lineStatus(100, 110)).toBe("ABOVE_PLAN");
    expect(lineStatus(100, 300)).toBe("ABOVE_PLAN");
  });
});

describe("attributeOrders — who gets credit for a sale", () => {
  const customerMarket = new Map<string, string | null>([
    ["c-kumasi", "m-kumasi"],
    ["c-accra", "m-accra"],
    ["c-nowhere", null]
  ]);

  it("credits a planned customer to the marketer who planned them, whoever entered the order", () => {
    const orders = [order("1", "c-kumasi", [["p", 10, 100]], "clerk")];
    const result = attributeOrders(orders, [marketer("ama", { planned: ["c-kumasi"] }), marketer("kofi", { markets: ["m-accra"] })], customerMarket);
    expect(result.get("1")).toEqual({ marketerId: "ama", basis: "PLANNED_CUSTOMER" });
  });

  it("credits an order the marketer entered themselves, even for a customer outside their market", () => {
    const orders = [order("1", "c-nowhere", [["p", 10, 100]], "kofi")];
    const result = attributeOrders(orders, [marketer("ama"), marketer("kofi")], customerMarket);
    expect(result.get("1")).toEqual({ marketerId: "kofi", basis: "SOLD_BY_MARKETER" });
  });

  it("credits a customer in a marketer's market when nobody planned them and a clerk entered the order", () => {
    const orders = [order("1", "c-accra", [["p", 10, 100]], "clerk")];
    const result = attributeOrders(orders, [marketer("ama", { markets: ["m-kumasi"] }), marketer("kofi", { markets: ["m-accra"] })], customerMarket);
    expect(result.get("1")).toEqual({ marketerId: "kofi", basis: "MARKET_CUSTOMER" });
  });

  it("leaves an order nobody can claim unattributed, and never credits it twice", () => {
    const orders = [order("1", "c-nowhere", [["p", 10, 100]], "clerk"), order("2", "c-kumasi", [["p", 5, 50]], "clerk")];
    const result = attributeOrders(orders, [marketer("ama", { markets: ["m-kumasi"] }), marketer("kofi", { markets: ["m-kumasi"] })], customerMarket);
    expect(result.has("1")).toBe(false);
    expect(result.size).toBe(1); // order 2 is credited to exactly one of them
  });

  it("lets the stronger claim win: a plan beats entering the order, which beats owning the market", () => {
    // Ama owns the market, Kofi entered the order, Esi planned the customer.
    const orders = [order("1", "c-kumasi", [["p", 10, 100]], "kofi")];
    const all = [marketer("ama", { markets: ["m-kumasi"] }), marketer("kofi"), marketer("esi", { planned: ["c-kumasi"] })];
    expect(attributeOrders(orders, all, customerMarket).get("1")).toEqual({ marketerId: "esi", basis: "PLANNED_CUSTOMER" });
    expect(attributeOrders(orders, all.slice(0, 2), customerMarket).get("1")).toEqual({ marketerId: "kofi", basis: "SOLD_BY_MARKETER" });
    expect(attributeOrders(orders, all.slice(0, 1), customerMarket).get("1")).toEqual({ marketerId: "ama", basis: "MARKET_CUSTOMER" });
  });

  it("settles two marketers who both planned the customer: the seller, then the market owner, then the earlier plan", () => {
    const both = (a: Partial<LedgerMarketer>, b: Partial<LedgerMarketer>) => [
      { ...marketer("ama", { planned: ["c-kumasi"], order: 5 }), ...a },
      { ...marketer("kofi", { planned: ["c-kumasi"], order: 9 }), ...b }
    ];
    // Kofi entered the order -> Kofi, although Ama planned first.
    expect(attributeOrders([order("1", "c-kumasi", [["p", 1, 1]], "kofi")], both({}, {}), customerMarket).get("1")?.marketerId).toBe("kofi");
    // Nobody in particular entered it; Kofi owns the market -> Kofi.
    expect(attributeOrders([order("1", "c-kumasi", [["p", 1, 1]], "clerk")], both({}, { marketIds: new Set(["m-kumasi"]) }), customerMarket).get("1")?.marketerId).toBe("kofi");
    // No other difference -> whoever put their plan forward first.
    expect(attributeOrders([order("1", "c-kumasi", [["p", 1, 1]], "clerk")], both({}, {}), customerMarket).get("1")?.marketerId).toBe("ama");
  });

  it("is independent of the order the marketers are listed in", () => {
    const orders = [order("1", "c-kumasi", [["p", 1, 1]], "clerk")];
    const a = marketer("ama", { planned: ["c-kumasi"], order: 5 });
    const k = marketer("kofi", { planned: ["c-kumasi"], order: 5 });
    expect(attributeOrders(orders, [a, k], customerMarket).get("1")?.marketerId).toBe(attributeOrders(orders, [k, a], customerMarket).get("1")?.marketerId);
  });
});

describe("buildPlanLedger — plan against actual", () => {
  const lines = [line("L1", "c1", "feed", 100, 200), line("L2", "c2", "feed", 50, 200), line("L3", "c3", "feed", 80, 200)];

  it("sets each line against what was sold, and tells hits from misses", () => {
    const sold = [
      credited(order("1", "c1", [["feed", 100, 20000]])), // exactly on plan
      credited(order("2", "c2", [["feed", 20, 4000]])) // short
      // c3 bought nothing
    ];
    const ledger = buildPlanLedger(lines, sold, () => "bag");
    const byId = Object.fromEntries(ledger.lines.map((l) => [l.id, l]));
    expect(byId.L1).toMatchObject({ actualQuantity: 100, actualValue: 20000, status: "ON_PLAN", varianceValue: 0, attainmentPct: 100 });
    expect(byId.L2).toMatchObject({ actualQuantity: 20, actualValue: 4000, status: "SHORT", varianceValue: -6000, attainmentPct: 40 });
    expect(byId.L3).toMatchObject({ actualQuantity: 0, actualValue: 0, status: "NO_SALE", actualUnitPrice: null, varianceValue: -16000 });

    expect(ledger.totals).toMatchObject({
      plannedValue: 46000,
      soldValue: 24000,
      varianceValue: -22000,
      attainmentPct: 52.2,
      customersPlanned: 3,
      customersBought: 2,
      hitRatePct: 66.7,
      linesPlanned: 3,
      linesOnPlan: 1,
      orderCount: 2
    });
    expect(ledger.totals.units).toEqual([{ unit: "bag", planned: 230, sold: 120 }]);
  });

  it("splits the variance into volume, price and unplanned so the parts add up exactly", () => {
    // Plan: 100 bags at 200. Sold 80 bags at 220 (discipline on price, short on volume), plus an unplanned customer.
    const sold = [credited(order("1", "c1", [["feed", 80, 80 * 220]])), credited(order("2", "c9", [["feed", 30, 30 * 210]]))];
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], sold);
    const l = ledger.lines[0];
    expect(l.volumeVariance).toBe(-4000); // (80 - 100) x 200
    expect(l.priceVariance).toBe(1600); // (220 - 200) x 80
    expect(l.varianceValue).toBe(l.volumeVariance + l.priceVariance); // -2400 = 17600 - 20000
    expect(ledger.unplanned).toEqual([{ customerId: "c9", productId: "feed", quantity: 30, value: 6300, customerWasPlanned: false, orderNumbers: ["SO-2"] }]);

    const t = ledger.totals;
    expect(t.plannedValue).toBe(20000);
    expect(t.soldValue).toBe(17600 + 6300);
    expect(t.varianceValue).toBe(3900);
    expect(t.volumeVariance + t.priceVariance + t.unplannedVariance).toBeCloseTo(t.varianceValue, 2);
  });

  it("treats a product sold to a planned customer that was not in the plan as unplanned, and says so", () => {
    const sold = [credited(order("1", "c1", [["feed", 100, 20000], ["premix", 10, 1500]]))];
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], sold);
    expect(ledger.unplanned).toHaveLength(1);
    expect(ledger.unplanned[0]).toMatchObject({ customerId: "c1", productId: "premix", customerWasPlanned: true, value: 1500 });
    expect(ledger.totals.soldValue).toBe(21500);
    expect(ledger.totals.hitRatePct).toBe(100);
  });

  it("adds a customer's sales across several orders in the week", () => {
    const sold = [credited(order("1", "c1", [["feed", 40, 8000]])), credited(order("2", "c1", [["feed", 60, 12000]]))];
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], sold);
    expect(ledger.lines[0]).toMatchObject({ actualQuantity: 100, actualValue: 20000, status: "ON_PLAN" });
    expect(ledger.totals.orderCount).toBe(2);
  });

  it("scores plan accuracy on misses in both directions, so a lucky unplanned sale does not hide a bad plan", () => {
    // Planned 20,000 at c1 but sold nothing there; sold 20,000 to an unplanned customer instead.
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], [credited(order("1", "c9", [["feed", 100, 20000]]))]);
    expect(ledger.totals.attainmentPct).toBe(100); // the money matched...
    expect(ledger.totals.accuracyPct).toBe(0); // ...but the plan was wrong about who would buy
    expect(ledger.totals.hitRatePct).toBe(0);
  });

  it("reports a week with no plan as all-unplanned, with nothing to measure against", () => {
    const ledger = buildPlanLedger([], [credited(order("1", "c1", [["feed", 10, 2000]]))]);
    expect(ledger.lines).toEqual([]);
    expect(ledger.totals).toMatchObject({ plannedValue: 0, soldValue: 2000, unplannedValue: 2000, attainmentPct: null, hitRatePct: null, accuracyPct: null });
  });

  it("copes with a quiet week and a plan with nothing sold", () => {
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], []);
    expect(ledger.totals).toMatchObject({ plannedValue: 20000, soldValue: 0, attainmentPct: 0, hitRatePct: 0, accuracyPct: 0, orderCount: 0 });
  });

  it("keeps cents exact", () => {
    const ledger = buildPlanLedger([line("L1", "c1", "feed", 3, 33.33)], [credited(order("1", "c1", [["feed", 3, 99.99]]))]);
    expect(ledger.lines[0].actualValue).toBe(99.99);
    expect(ledger.totals.soldValue).toBe(99.99);
  });

  it("re-reads a closed line from its frozen figures the same way", () => {
    const live = buildPlanLedger([line("L1", "c1", "feed", 100, 200)], [credited(order("1", "c1", [["feed", 80, 17600]]))]).lines[0];
    expect(evaluateLine(line("L1", "c1", "feed", 100, 200), 80, 17600)).toEqual(live);
  });
});

describe("pctOf / classifyBias / linesNeedingReason", () => {
  it("avoids dividing by zero", () => {
    expect(pctOf(5, 0)).toBeNull();
    expect(pctOf(1, 3)).toBe(33.3);
  });

  it("only calls a bias after enough weeks", () => {
    expect(classifyBias([50, 60])).toBeNull();
    expect(classifyBias([50, 60, 70])).toBe("PLANS_TOO_HIGH");
    expect(classifyBias([130, 150, 120])).toBe("PLANS_TOO_LOW");
    expect(classifyBias([90, 100, 110])).toBe("BALANCED");
  });

  it("asks for a reason on every line that fell short, and no others", () => {
    expect(
      linesNeedingReason([
        { id: "a", status: "ON_PLAN" },
        { id: "b", status: "SHORT" },
        { id: "c", status: "NO_SALE" },
        { id: "d", status: "ABOVE_PLAN" }
      ])
    ).toEqual(["b", "c"]);
  });
});
