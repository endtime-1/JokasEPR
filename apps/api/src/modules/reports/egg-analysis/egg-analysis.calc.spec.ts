import { EggAnalysis, analyseEggs } from "./egg-analysis.calc";
import { D, FARM, HQ, build } from "./egg-analysis.fixture";

describe("egg analysis", () => {
  let a: EggAnalysis;
  beforeEach(() => { a = analyseEggs(build()); });

  it("tells farm stores from sales stores and keeps old test stores out of the chain", () => {
    expect(a.stores.map((s) => [s.name, s.role])).toEqual([["Jokas Egg", "FARM"], ["Egg Store", "SALES"], ["Jokas General", "OTHER"]]);
  });

  it("each store's movements agree with the system's on-hand", () => {
    for (const s of a.stores) expect(s.agrees).toBe(true);
    const farm = a.stores[0];
    // credited 100+300+668/30+858/30+1151/30+1149/30, less reversal 668/30, write-offs 30.5+10, transfers 300
    const credited = 100 + 300 + 858 / 30 + 1151 / 30 + 1149 / 30;
    expect(farm.closing).toBeCloseTo(credited - 40.5 - 300, 3);
    const hq = a.stores[1];
    expect(hq.closing).toBeCloseTo(299 - (150 + 100 + 20.5 + 50) + 50, 3); // received, less sales, sold-then-returned nets to zero
    expect(hq.closing).toBeCloseTo(28.5, 3);
  });

  it("PRODUCTION VS STOCK: the deleted record nets to zero, the edited records are found, and the gap is fully explained", () => {
    const g = a.productionGap;
    const recorded = (3000 + 9000 + 867 + 861 + 830) / 30;
    expect(g.recordedLive).toBeCloseTo(recorded, 3);
    expect(g.deleted).toHaveLength(1);
    expect(g.deleted[0]).toMatchObject({ date: "2026-09-17", house: "Dufie", deletedOn: "2026-09-17" });
    expect(g.deleted[0].net).toBeCloseTo(0, 4);
    expect(g.edited.map((e) => [e.date, e.difference])).toEqual([["2026-10-01", -9], ["2026-10-10", 290], ["2026-11-02", 319]]);
    expect(g.untiedCredits).toMatchObject({ count: 1, crates: 100 });
    expect(g.neverCredited).toMatchObject({ count: 1, crates: 100 }); // the early record is covered by the per-day credit
    expect(g.difference).toBeCloseTo(20, 3); // 600 eggs
    expect(g.explained).toBeCloseTo(g.difference, 3);
    expect(Math.abs(g.unexplained)).toBeLessThan(0.001);
  });

  it("WHERE THE EGGS WENT: not-accounted-for equals written off + lost in transit - uncorrected over-credit, with nothing left over", () => {
    const h = a.headline;
    const recorded = (3000 + 9000 + 867 + 861 + 830) / 30;
    const sold = 150 + 100 + 20.5;
    const held = a.stores[0].closing + a.stores[1].closing;
    expect(h.sold).toBeCloseTo(sold, 4);
    expect(h.notAccountedFor).toBeCloseTo(recorded - sold - held, 3);
    const parts = Object.fromEntries(a.shrinkage.map((s) => [s.label, s.crates]));
    expect(parts["Written off or corrected by approved stock adjustments"]).toBeCloseTo(40.5, 4);
    expect(parts["Lost in transit (received short at the head office)"]).toBeCloseTo(1, 4);
    expect(parts["Less: stock credited for production that the records no longer show (not corrected)"]).toBeCloseTo(-20, 3);
    expect(a.shrinkage.find((s) => s.label.startsWith("Other"))).toBeUndefined();
    expect(h.notAccountedFor).toBeCloseTo(40.5 + 1 - 20, 3);
    expect(h.notAccountedForPercent).toBeCloseTo((21.5 / ((3000 + 9000 + 867 + 861 + 830) / 30)) * 100, 1);
    expect(h.averagePricePerCrate).toBeCloseTo(13525 / 270.5, 2);
    expect(h.estimatedValue).toBeGreaterThan(0);
    // the bridge table adds up to zero: every line, signed, sums to the unaccounted figure's complement
    const lines = a.bridge.filter((b) => !b.label.startsWith("NOT ACCOUNTED"));
    expect(lines.reduce((s, b) => s + b.crates, 0)).toBeCloseTo(h.notAccountedFor, 3);
  });

  it("TRANSFERS: short receipts, discrepancies, and nothing on the way", () => {
    expect(a.transfers.summary).toMatchObject({ sent: 300, received: 299, shortBy: 1, onTheWay: 0, waitingApproval: 0, shortCount: 1 });
    expect(a.transfers.rows.find((t) => t.number === "STR-2")).toMatchObject({ shortBy: 1, from: "Jokas Egg", to: "Egg Store" });
    expect(a.transfers.discrepancies).toHaveLength(1);
  });

  it("transfers still on the way or waiting for approval are reported, not counted as lost", () => {
    const raw = build();
    raw.transfers.push({ id: "t3", number: "STR-3", date: D("2026-11-23"), qty: 50, received: null, status: "IN_TRANSIT", fromId: FARM, toId: HQ }, { id: "t4", number: "STR-4", date: D("2026-11-23"), qty: 30, received: null, status: "PENDING_APPROVAL", fromId: FARM, toId: HQ });
    const b = analyseEggs(raw);
    expect(b.transfers.summary).toMatchObject({ shortBy: 1, onTheWay: 50, waitingApproval: 30 });
    expect(b.findings.some((f) => f.level === "WATCH" && f.title === "Eggs still on the way")).toBe(true);
  });

  it("SALES: by month with value and average price; deleted sales are counted but do not change stock", () => {
    expect(a.sales.total).toEqual({ sales: 3, crates: 270.5, amount: 13525 });
    expect(a.sales.byMonth).toEqual([{ month: "2026-10", sales: 1, crates: 150, amount: 7500, averagePrice: 50 }, { month: "2026-11", sales: 2, crates: 120.5, amount: 6025, averagePrice: 50 }]);
    expect(a.sales.deletedSaleCount).toBe(1);
    expect(a.sales.withoutStockOut).toEqual([]);
  });

  it("flags a sale that never took stock out", () => {
    const raw = build();
    raw.sales.push({ id: "s-nostock", number: "ES-9", warehouseId: HQ, date: D("2026-11-21"), crates: 5, amount: 250, buyer: null });
    const b = analyseEggs(raw);
    expect(b.sales.withoutStockOut).toEqual([{ number: "ES-9", date: "2026-11-21", crates: 5 }]);
    expect(b.findings.some((f) => f.title === "Egg sales that took no stock out")).toBe(true);
  });

  it("ADJUSTMENTS: lists who entered and approved, and flags self-approval", () => {
    expect(a.adjustments.map((x) => [x.number, x.requestedBy, x.approvedBy, x.sameApprover])).toEqual([["ADJ-1", "MD", "MD", true], ["ADJ-2", "Farm manager", "MD", false]]);
    const f = a.findings.find((x) => x.title === "Stock adjustments")!;
    expect(f.level).toBe("WATCH");
    expect(f.detail).toContain("1 of them were approved by the same person");
  });

  it("FINDINGS: plain statements with a level, including the OK ones", () => {
    const titles = a.findings.map((f) => `${f.level}: ${f.title}`);
    expect(titles).toContain("OK: Egg Store: stock agrees with its records");
    expect(titles).toContain("OK: Jokas Egg: stock agrees with its records");
    expect(titles).toContain("OK: Deleted production records");
    expect(titles).toContain("WATCH: Eggs lost in transit");
    expect(titles).toContain("WATCH: Production records edited after their stock was credited");
    expect(a.findings[a.findings.length - 1].title).toBe("Eggs not accounted for");
    const edited = a.findings.find((f) => f.title.startsWith("Production records edited"))!;
    expect(edited.detail).toContain("net 600 eggs");
  });

  it("by month: production, credits, reversals, write-offs, transfers and sales line up", () => {
    const sep = a.months.find((m) => m.month === "2026-09")!;
    expect(sep.recorded).toBeCloseTo(300, 3); // the deleted record is not live
    expect(sep.credited).toBeCloseTo(300 + 668 / 30, 3);
    expect(sep.systemCorrections).toBeCloseTo(668 / 30, 3);
    const nov = a.months.find((m) => m.month === "2026-11")!;
    expect(nov.sentOut).toBe(100);
    expect(nov.received).toBe(99);
    expect(nov.writeOffs).toBe(10);
    expect(nov.soldAmount).toBe(6025);
  });

  it("a date range slices the period and carries the opening balance, so the chain still adds up", () => {
    const b = analyseEggs(build(), { from: D("2026-11-01"), to: D("2026-11-24") });
    const farm = b.stores[0];
    expect(farm.opening).toBeGreaterThan(0);
    expect(farm.closing).toBeCloseTo(a.stores[0].closing, 3);
    expect(b.transfers.rows.map((t) => t.number)).toEqual(["STR-2"]);
    expect(b.period).toEqual({ from: "2026-11-01", to: "2026-11-24" });
    expect(b.shrinkage.find((s) => s.label.startsWith("Other"))).toBeUndefined();
    const r = (3000 + 9000 + 867 + 861 + 830) / 30;
    expect(b.headline.producedPerRecords).toBeCloseTo(830 / 30, 3); // only November's record
    expect(r).toBeGreaterThan(b.headline.producedPerRecords);
  });

  it("a store whose stock does not agree with its movements is called out", () => {
    const raw = build();
    raw.onHand = raw.onHand.map((o) => (o.warehouseId === HQ ? { ...o, qty: o.qty - 3 } : o));
    const b = analyseEggs(raw);
    expect(b.stores.find((s) => s.id === HQ)!.agrees).toBe(false);
    expect(b.findings.some((f) => f.level === "WATCH" && f.title === "Egg Store: stock does NOT agree with its records")).toBe(true);
  });

  it("copes with no eggs at all", () => {
    const b = analyseEggs({ perCrate: 30, today: D("2026-11-24"), warehouses: [], onHand: [], movements: [], records: [], transfers: [], discrepancies: [], sales: [], deletedSaleCount: 0, adjustments: [] });
    expect(b.headline.notAccountedFor).toBe(0);
    expect(b.stores).toEqual([]);
    expect(b.sales.total).toEqual({ sales: 0, crates: 0, amount: 0 });
    expect(b.headline.estimatedValue).toBeNull();
  });
});
