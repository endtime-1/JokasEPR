/*
 * READ-ONLY egg reconciliation. Changes nothing.
 * Follows the eggs from the farm to the head office and out again:
 *   1. produced on the farm (egg production records) vs credited to stock
 *   2. every egg store: what the stock movements say it should hold vs what the system shows
 *   3. every egg transfer (sent / still on the way / received / received short) and its discrepancies
 *   4. egg sales vs the stock taken out for them
 *   5. stock adjustments (pending and approved)
 * Quantities are CRATES (1 crate = the Eggs product's piecesPerUnit, normally 30 eggs), with eggs in brackets.
 *
 *   cd /opt/jokas/app/packages/db && set -a && . ../../.env && set +a && node scripts/reconcile-eggs.mjs
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const n = (v) => Number(v ?? 0);
const r4 = (x) => Math.round(x * 10000) / 10000;
const day = (d) => (d ? d.toISOString().slice(0, 10) : "");
const prod = await p.product.findFirst({ where: { sku: "EG", deletedAt: null }, select: { id: true, name: true, piecesPerUnit: true, uom: { select: { name: true } } } });
if (!prod) { console.log("No product with SKU EG was found."); process.exit(1); }
const PER = prod.piecesPerUnit || 30;
const c = (x) => `${r4(x).toLocaleString("en-GB", { maximumFractionDigits: 4 })} cr (${Math.round(x * PER).toLocaleString("en-GB")} eggs)`;
const head = (t) => console.log(`\n${"=".repeat(8)} ${t} ${"=".repeat(Math.max(3, 70 - t.length))}`);
const OUT_TYPES = ["SALE_DISPATCH", "ADJUSTMENT_OUT", "WASTE", "PRODUCTION_INPUT", "RETURN_OUT"];
console.log(`Product: ${prod.name} | unit: ${prod.uom?.name} | 1 unit = ${PER} eggs`);

// 1 ── farm production vs stock credited ───────────────────────────────────────
head("1. PRODUCED ON THE FARM vs CREDITED TO STOCK (by month)");
const recs = await p.eggProductionRecord.findMany({ where: { deletedAt: null }, select: { recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true } });
const prodOut = await p.stockMovement.findMany({ where: { productId: prod.id, deletedAt: null, movementType: "PRODUCTION_OUTPUT" }, select: { movementDate: true, quantity: true } });
const months = new Map();
const bucket = (m) => months.get(m) ?? months.set(m, { eggs: 0, good: 0, credited: 0 }).get(m);
for (const x of recs) { const b = bucket(day(x.recordDate).slice(0, 7)); b.eggs += n(x.goodEggs) + n(x.crackedEggs) + n(x.dirtyEggs) + n(x.brokenEggs) + n(x.rejectedEggs); b.good += n(x.goodEggs); }
for (const m of prodOut) bucket(day(m.movementDate).slice(0, 7)).credited += n(m.quantity);
let totE = 0, totC = 0;
for (const [m, b] of [...months].sort()) {
  const recorded = b.eggs / PER;
  totE += recorded; totC += b.credited;
  const diff = r4(recorded - b.credited);
  console.log(`  ${m}  recorded ${c(recorded)} [good ${Math.round(b.good)}]  credited ${c(b.credited)}  ${Math.abs(diff) < 0.05 ? "OK" : `DIFFERENCE ${c(diff)}`}`);
}
console.log(`  TOTAL recorded ${c(totE)} | credited to stock ${c(totC)} | not credited ${c(totE - totC)}`);

// 2 ── each egg store ──────────────────────────────────────────────────────────
head("2. EVERY EGG STORE: movements vs system on-hand");
const items = await p.inventoryItem.findMany({ where: { productId: prod.id }, include: { warehouse: { select: { id: true, name: true, type: true, farm: { select: { name: true } }, branch: { select: { name: true } } } } } });
const names = new Map(items.map((i) => [i.warehouseId, i.warehouse.name]));
const allWh = await p.warehouse.findMany({ select: { id: true, name: true } });
for (const w of allWh) names.set(w.id, names.get(w.id) ?? w.name);
const summary = [];
for (const it of items) {
  const W = it.warehouseId;
  const mv = await p.stockMovement.findMany({ where: { productId: prod.id, warehouseId: W, deletedAt: null }, select: { movementType: true, quantity: true, fromWarehouseId: true, toWarehouseId: true, referenceType: true } });
  const by = new Map();
  let inn = 0, out = 0;
  for (const m of mv) {
    const isOut = m.movementType === "TRANSFER" ? m.toWarehouseId !== W : OUT_TYPES.includes(m.movementType); // the same rule the Warehouse screen uses
    const k = `${isOut ? "OUT" : "IN "} ${m.movementType}`;
    by.set(k, r4((by.get(k) ?? 0) + n(m.quantity)));
    if (isOut) out += n(m.quantity); else inn += n(m.quantity);
  }
  const batches = await p.stockBatch.findMany({ where: { warehouseId: W, productId: prod.id, deletedAt: null }, select: { quantityRemaining: true, status: true } });
  const usable = batches.filter((b) => b.status === "AVAILABLE").reduce((s, b) => s + n(b.quantityRemaining), 0);
  const allRem = batches.reduce((s, b) => s + n(b.quantityRemaining), 0);
  const expected = r4(inn - out), onHand = n(it.quantityOnHand);
  console.log(`\n  ${it.warehouse.name}  [${it.warehouse.type}${it.warehouse.farm ? ", farm " + it.warehouse.farm.name : ""}${it.deletedAt ? ", RETIRED" : ""}]`);
  for (const [k, v] of [...by].sort()) console.log(`      ${k.padEnd(28)} ${c(v)}`);
  console.log(`      movements say it should hold   ${c(expected)}`);
  console.log(`      system on-hand                 ${c(onHand)}`);
  console.log(`      usable batches (AVAILABLE)     ${c(usable)}   [all batches ${c(allRem)}]`);
  const d = r4(expected - onHand);
  console.log(`      ${Math.abs(d) < 0.05 ? "movements agree with on-hand" : `!!! on-hand is ${c(Math.abs(d))} ${d > 0 ? "LOWER" : "HIGHER"} than the movements explain`}`);
  summary.push({ name: it.warehouse.name, W, expected, onHand, usable });
}

// 3 ── transfers ───────────────────────────────────────────────────────────────
head("3. EGG TRANSFERS");
const tr = await p.stockTransfer.findMany({ where: { productId: prod.id, deletedAt: null }, orderBy: { transferDate: "asc" }, select: { id: true, transferNumber: true, transferDate: true, quantity: true, receivedQuantity: true, status: true, fromWarehouseId: true, toWarehouseId: true, rejectionReason: true } });
const routes = new Map();
for (const t of tr) {
  const key = `${names.get(t.fromWarehouseId)} -> ${names.get(t.toWarehouseId)}`;
  const r = routes.get(key) ?? { sent: 0, received: 0, onTheWay: 0, pending: 0, short: 0, rows: [] };
  const q = n(t.quantity), got = t.receivedQuantity === null ? null : n(t.receivedQuantity);
  if (["APPROVED", "IN_TRANSIT"].includes(t.status)) r.onTheWay += q;
  if (["PENDING_APPROVAL", "DRAFT"].includes(t.status)) r.pending += q;
  if (t.status === "COMPLETED") { r.sent += q; r.received += got ?? q; if (got !== null && got < q) r.short += q - got; }
  r.rows.push(t); routes.set(key, r);
}
for (const [route, r] of routes) {
  console.log(`\n  ${route}`);
  console.log(`      completed: sent ${c(r.sent)} | received ${c(r.received)} | received SHORT by ${c(r.short)}`);
  console.log(`      still on the way (approved/in transit): ${c(r.onTheWay)} | waiting for approval: ${c(r.pending)}`);
  for (const t of r.rows.slice(-8)) console.log(`        ${t.transferNumber}  ${day(t.transferDate)}  sent ${String(n(t.quantity)).padStart(9)}  got ${t.receivedQuantity === null ? "-".padStart(9) : String(n(t.receivedQuantity)).padStart(9)}  ${t.status}${n(t.quantity) > 3000 ? "   <-- looks like EGGS entered as crates" : ""}`);
}
const disc = await p.transferDiscrepancy.findMany({ where: { deletedAt: null, stockTransferId: { in: tr.map((t) => t.id) } }, select: { expectedQuantity: true, receivedQuantity: true, differenceQuantity: true, status: true, resolution: true, reason: true, stockTransfer: { select: { transferNumber: true } } } });
console.log(`\n  Transfer discrepancies (received less/more than sent): ${disc.length}`);
for (const d of disc) console.log(`      ${d.stockTransfer.transferNumber}  expected ${n(d.expectedQuantity)}  received ${n(d.receivedQuantity)}  difference ${n(d.differenceQuantity)}  ${d.status}${d.resolution ? " / " + d.resolution : ""}  ${(d.reason || "").slice(0, 60)}`);

// 4 ── egg sales ───────────────────────────────────────────────────────────────
head("4. EGG SALES vs STOCK TAKEN OUT");
const sales = await p.eggSale.findMany({ where: { deletedAt: null }, select: { id: true, warehouseId: true, saleNumber: true, saleDate: true, quantityPieces: true, quantityCrates: true } });
const saleMoves = await p.stockMovement.findMany({ where: { productId: prod.id, deletedAt: null, referenceType: "EggSale" }, select: { referenceId: true, quantity: true } });
const movedFor = new Map();
for (const m of saleMoves) movedFor.set(m.referenceId, (movedFor.get(m.referenceId) ?? 0) + n(m.quantity));
const perWh = new Map();
for (const s of sales) { const w = perWh.get(s.warehouseId) ?? { cnt: 0, crates: 0, taken: 0, noMove: [], mismatch: [] }; w.cnt++; w.crates += n(s.quantityCrates); w.taken += movedFor.get(s.id) ?? 0; if (!movedFor.has(s.id)) w.noMove.push(s); else if (Math.abs((movedFor.get(s.id) ?? 0) - n(s.quantityCrates)) > 0.05) w.mismatch.push(s); perWh.set(s.warehouseId, w); }
for (const [W, w] of perWh) {
  console.log(`\n  ${names.get(W)}: ${w.cnt} sale(s) = ${c(w.crates)} | stock taken out for them ${c(w.taken)}`);
  if (Math.abs(w.crates - w.taken) > 0.05) console.log(`      !!! difference ${c(w.crates - w.taken)}`);
  for (const s of w.noMove.slice(0, 10)) console.log(`      sale ${s.saleNumber} (${day(s.saleDate)}, ${n(s.quantityCrates)} cr) took NO stock out`);
  for (const s of w.mismatch.slice(0, 10)) console.log(`      sale ${s.saleNumber} (${day(s.saleDate)}): sold ${n(s.quantityCrates)} cr but stock out ${movedFor.get(s.id)}`);
}
const orphan = [...movedFor.keys()].filter((id) => !sales.some((s) => s.id === id));
if (orphan.length) console.log(`\n  stock taken out for ${orphan.length} egg sale(s) that no longer exist`);
const other = await p.stockMovement.groupBy({ by: ["warehouseId", "referenceType"], where: { productId: prod.id, deletedAt: null, movementType: "SALE_DISPATCH" }, _sum: { quantity: true }, _count: true });
console.log("\n  all egg stock taken out as SALE_DISPATCH, by source:");
for (const o of other) console.log(`      ${String(names.get(o.warehouseId)).padEnd(22)} ${String(o.referenceType).padEnd(14)} ${o._count} movement(s)  ${c(n(o._sum.quantity))}`);

// 5 ── adjustments ─────────────────────────────────────────────────────────────
head("5. STOCK ADJUSTMENTS");
const adj = await p.stockAdjustment.findMany({ where: { productId: prod.id, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { adjustmentNumber: true, warehouseId: true, adjustmentType: true, quantity: true, status: true, reason: true, createdAt: true } });
const ag = new Map();
for (const a of adj) { const k = `${names.get(a.warehouseId)} | ${a.adjustmentType} | ${a.status}`; const g = ag.get(k) ?? { cnt: 0, q: 0 }; g.cnt++; g.q += n(a.quantity); ag.set(k, g); }
for (const [k, g] of [...ag].sort()) console.log(`  ${k.padEnd(60)} ${String(g.cnt).padStart(3)} record(s)  ${c(g.q)}`);
console.log("\n  most recent adjustments:");
for (const a of adj.slice(-12)) console.log(`      ${day(a.createdAt)} ${a.adjustmentNumber} ${names.get(a.warehouseId)} ${a.adjustmentType} ${n(a.quantity)} [${a.status}] ${(a.reason || "").slice(0, 70)}`);

// the answer
head("SUMMARY: WHERE COULD EGGS BE MISSING?");
for (const s of summary) {
  const gap = r4(s.expected - s.onHand);
  console.log(`  ${s.name.padEnd(24)} should hold ${c(s.expected)} | shows ${c(s.onHand)} | ${Math.abs(gap) < 0.05 ? "consistent" : "NOT consistent (" + c(gap) + ")"}`);
}
for (const [route, r] of routes) if (r.short > 0.01 || r.onTheWay > 0.01) console.log(`  ${route}: ${r.short > 0.01 ? "received short by " + c(r.short) + "; " : ""}${r.onTheWay > 0.01 ? c(r.onTheWay) + " not yet received" : ""}`);
console.log(`  Farm production not credited to any store: ${c(totE - totC)}`);
await p.$disconnect();
