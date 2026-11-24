import { RawEggData, RawMovement, isIn } from "./egg-analysis.calc";

/**
 * A small farm with the same shapes of trouble the real egg stores showed: a production record deleted after crediting
 * (and automatically reversed), records edited after crediting (stock not corrected), early per-day credits with no record
 * link, two transfers received short, approved write-offs (one approved by the person who entered it), and deleted sales.
 */
export const FARM = "w-farm", HQ = "w-hq", OLD = "w-old";
export const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
let n = 0;
const mv = (over: Partial<RawMovement> & Pick<RawMovement, "warehouseId" | "type" | "qty" | "date">): RawMovement => ({ id: `m${++n}`, fromWarehouseId: null, toWarehouseId: null, referenceType: null, referenceId: null, notes: null, ...over });

export function build(): RawEggData {
  n = 0;
  const movements: RawMovement[] = [];
  // early per-day credit, not tied to a record: 3000 eggs = 100 crates
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 100, date: D("2026-08-10") }));
  // an ordinary record, credited exactly: 9000 eggs = 300 crates
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 300, date: D("2026-09-01"), referenceType: "EggProductionRecord", referenceId: "r-ok" }));
  // a record deleted the same day: credited 668 eggs, reversed
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 668 / 30, date: D("2026-09-17"), referenceType: "EggProductionRecord", referenceId: "r-del" }));
  movements.push(mv({ warehouseId: FARM, type: "ADJUSTMENT_OUT", qty: 668 / 30, date: D("2026-09-17"), referenceType: "EggProductionRecord", referenceId: "r-del", notes: "Reversal — record deleted" }));
  // edited records: credited 858 (now 867), 1151 (now 861), 1149 (now 830)
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 858 / 30, date: D("2026-10-01"), referenceType: "EggProductionRecord", referenceId: "r-e1" }));
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 1151 / 30, date: D("2026-10-10"), referenceType: "EggProductionRecord", referenceId: "r-e2" }));
  movements.push(mv({ warehouseId: FARM, type: "PRODUCTION_OUTPUT", qty: 1149 / 30, date: D("2026-11-02"), referenceType: "EggProductionRecord", referenceId: "r-e3" }));
  // approved write-offs on the farm store
  movements.push(mv({ warehouseId: FARM, type: "ADJUSTMENT_OUT", qty: 30.5, date: D("2026-10-12"), referenceType: "StockAdjustment", referenceId: "a1" }));
  movements.push(mv({ warehouseId: FARM, type: "WASTE", qty: 10, date: D("2026-11-04"), referenceType: "StockAdjustment", referenceId: "a2" }));
  // transfers: 200 received in full, 100 received as 99
  movements.push(mv({ warehouseId: FARM, type: "TRANSFER", qty: 200, date: D("2026-10-15"), fromWarehouseId: FARM, toWarehouseId: HQ }));
  movements.push(mv({ warehouseId: HQ, type: "TRANSFER", qty: 200, date: D("2026-10-15"), fromWarehouseId: FARM, toWarehouseId: HQ }));
  movements.push(mv({ warehouseId: FARM, type: "TRANSFER", qty: 100, date: D("2026-11-16"), fromWarehouseId: FARM, toWarehouseId: HQ }));
  movements.push(mv({ warehouseId: HQ, type: "TRANSFER", qty: 99, date: D("2026-11-16"), fromWarehouseId: FARM, toWarehouseId: HQ }));
  // sales at the head office: three sales, plus a deleted sale whose stock was returned
  movements.push(mv({ warehouseId: HQ, type: "SALE_DISPATCH", qty: 150, date: D("2026-10-20"), referenceType: "EggSale", referenceId: "s1" }));
  movements.push(mv({ warehouseId: HQ, type: "SALE_DISPATCH", qty: 100, date: D("2026-11-01"), referenceType: "EggSale", referenceId: "s2" }));
  movements.push(mv({ warehouseId: HQ, type: "SALE_DISPATCH", qty: 20.5, date: D("2026-11-20"), referenceType: "EggSale", referenceId: "s3" }));
  movements.push(mv({ warehouseId: HQ, type: "SALE_DISPATCH", qty: 50, date: D("2026-11-05"), referenceType: "EggSale", referenceId: "s-gone" }));
  movements.push(mv({ warehouseId: HQ, type: "RETURN_IN", qty: 50, date: D("2026-11-06"), referenceType: "EggSale", referenceId: "s-gone" }));
  // an old test store that is not part of the chain
  movements.push(mv({ warehouseId: OLD, type: "PURCHASE_RECEIPT", qty: 5, date: D("2026-09-20") }));
  movements.push(mv({ warehouseId: OLD, type: "ADJUSTMENT_OUT", qty: 5, date: D("2026-09-21") }));

  const onHand = [FARM, HQ, OLD].map((w) => ({ warehouseId: w, qty: movements.filter((m) => m.warehouseId === w).reduce((s, m) => s + (isIn(m, w) ? m.qty : -m.qty), 0) }));
  return {
    perCrate: 30, today: D("2026-11-24"),
    warehouses: [{ id: FARM, name: "Jokas Egg", type: "EGG_STORE", farm: "JOKASFARM", retired: false }, { id: HQ, name: "Egg Store", type: "EGG_STORE", farm: "Akoko", retired: false }, { id: OLD, name: "Jokas General", type: "GENERAL", farm: null, retired: true }],
    onHand, movements,
    records: [
      { id: "r-early", date: D("2026-08-10"), eggs: 3000, deletedAt: null, updatedAt: D("2026-08-10"), house: "Adubofour" },
      { id: "r-ok", date: D("2026-09-01"), eggs: 9000, deletedAt: null, updatedAt: D("2026-09-01"), house: "Dufie" },
      { id: "r-del", date: D("2026-09-17"), eggs: 668, deletedAt: D("2026-09-17"), updatedAt: D("2026-09-17"), house: "Dufie" },
      { id: "r-e1", date: D("2026-10-01"), eggs: 867, deletedAt: null, updatedAt: D("2026-10-05"), house: "Dufie" },
      { id: "r-e2", date: D("2026-10-10"), eggs: 861, deletedAt: null, updatedAt: D("2026-10-11"), house: "Dufie" },
      { id: "r-e3", date: D("2026-11-02"), eggs: 830, deletedAt: null, updatedAt: D("2026-11-02"), house: "Dufie" }
    ],
    transfers: [
      { id: "t1", number: "STR-1", date: D("2026-10-15"), qty: 200, received: 200, status: "COMPLETED", fromId: FARM, toId: HQ },
      { id: "t2", number: "STR-2", date: D("2026-11-16"), qty: 100, received: 99, status: "COMPLETED", fromId: FARM, toId: HQ }
    ],
    discrepancies: [{ transferNumber: "STR-2", expected: 100, received: 99, difference: 1, status: "RESOLVED", resolution: "SOURCE_MISCOUNT", reason: "Short receipt" }],
    sales: [
      { id: "s1", number: "ES-1", warehouseId: HQ, date: D("2026-10-20"), crates: 150, amount: 7500, buyer: "A" },
      { id: "s2", number: "ES-2", warehouseId: HQ, date: D("2026-11-01"), crates: 100, amount: 5000, buyer: "B" },
      { id: "s3", number: "ES-3", warehouseId: HQ, date: D("2026-11-20"), crates: 20.5, amount: 1025, buyer: "C" }
    ],
    deletedSaleCount: 1,
    adjustments: [
      { id: "a1", number: "ADJ-1", warehouseId: FARM, type: "COUNT_CORRECTION", qty: 30.5, status: "APPROVED", reason: "double entries", createdAt: D("2026-10-12"), requestedById: "u-md", approvedById: "u-md", requestedBy: "MD", approvedBy: "MD" },
      { id: "a2", number: "ADJ-2", warehouseId: FARM, type: "WRITE_OFF", qty: 10, status: "APPROVED", reason: "Double entry", createdAt: D("2026-11-04"), requestedById: "u-fm", approvedById: "u-md", requestedBy: "Farm manager", approvedBy: "MD" }
    ]
  };
}
