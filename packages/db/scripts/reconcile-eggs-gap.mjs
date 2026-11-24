/*
 * READ-ONLY. Changes nothing.
 * Explains the gap between "eggs recorded in the farm's egg production records" and "eggs credited to the farm egg store":
 *   A. stock credited for a production record that was DELETED later (credit stayed, record gone)
 *   B. stock credited for a record that still exists but whose egg count is different now (edited after crediting)
 *   C. live production records that never credited the store
 *   D. credits that are not tied to a record (the older consolidated per-day credits), day by day
 *   E. every stock-out on the farm egg store (adjustments, write-offs, damage) with date, user and reason,
 *      split into those with an approved adjustment record and those without one.
 * Crates (1 crate = 30 eggs) with eggs in brackets.
 *
 *   cd /opt/jokas/app/packages/db && set -a && . ../../.env && set +a && node scripts/reconcile-eggs-gap.mjs
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const n = (v) => Number(v ?? 0);
const r4 = (x) => Math.round(x * 10000) / 10000;
const day = (d) => (d ? d.toISOString().slice(0, 10) : "");
const prod = await p.product.findFirst({ where: { sku: "EG", deletedAt: null }, select: { id: true, piecesPerUnit: true } });
const PER = prod.piecesPerUnit || 30;
const c = (x) => `${r4(x).toLocaleString("en-GB", { maximumFractionDigits: 4 })} cr (${Math.round(x * PER).toLocaleString("en-GB")} eggs)`;
const head = (t) => console.log(`\n${"=".repeat(8)} ${t} ${"=".repeat(Math.max(3, 74 - t.length))}`);
const eggsOf = (r) => n(r.goodEggs) + n(r.crackedEggs) + n(r.dirtyEggs) + n(r.brokenEggs) + n(r.rejectedEggs);

const recs = await p.eggProductionRecord.findMany({ select: { id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true, deletedAt: true, createdAt: true, updatedAt: true, poultryHouse: { select: { name: true } } } });
const byRec = new Map(recs.map((r) => [r.id, r]));
const mv = await p.stockMovement.findMany({ where: { productId: prod.id, deletedAt: null, movementType: "PRODUCTION_OUTPUT" }, select: { id: true, warehouseId: true, quantity: true, referenceType: true, referenceId: true, notes: true, movementDate: true, createdAt: true } });
const farmWh = [...new Set(mv.map((m) => m.warehouseId))];
const whs = await p.warehouse.findMany({ where: { id: { in: farmWh } }, select: { id: true, name: true } });
console.log(`Farm egg store(s) credited by production: ${whs.map((w) => w.name).join(", ")}`);
const live = recs.filter((r) => !r.deletedAt);
const recorded = live.reduce((s, r) => s + eggsOf(r), 0) / PER;
const credited = mv.reduce((s, m) => s + n(m.quantity), 0);
console.log(`Live production records: ${c(recorded)} | credited to stock: ${c(credited)} | credited minus recorded: ${c(credited - recorded)}`);

const tied = mv.filter((m) => m.referenceType === "EggProductionRecord");
const loose = mv.filter((m) => m.referenceType !== "EggProductionRecord");
const creditedFor = new Map();
for (const m of tied) creditedFor.set(m.referenceId, (creditedFor.get(m.referenceId) ?? 0) + n(m.quantity));

// A ── credit for a record that is gone
head("A. STOCK CREDITED FOR A PRODUCTION RECORD THAT WAS DELETED (or is missing)");
let A = 0; const aRows = [];
for (const [id, q] of creditedFor) { const r = byRec.get(id); if (!r || r.deletedAt) { A += q; aRows.push({ id, q, r }); } }
for (const x of aRows.sort((a, b) => (a.r?.recordDate ?? 0) - (b.r?.recordDate ?? 0)).slice(0, 40)) console.log(`  record dated ${x.r ? day(x.r.recordDate) : "(missing)"}${x.r?.poultryHouse ? " " + x.r.poultryHouse.name : ""}  credited ${c(x.q)}  ${x.r ? "record deleted " + day(x.r.deletedAt) : "record no longer exists"}`);
console.log(`  ${aRows.length} record(s), total credit with no live record: ${c(A)}`);

// B ── credit differs from the record's egg count
head("B. RECORD STILL EXISTS BUT ITS EGG COUNT NO LONGER MATCHES WHAT WAS CREDITED");
let B = 0; const bRows = [];
for (const r of live) { const q = creditedFor.get(r.id); if (q === undefined) continue; const diff = q * PER - eggsOf(r); if (Math.abs(diff) >= 1) { B += q - eggsOf(r) / PER; bRows.push({ r, q, diff }); } }
for (const x of bRows.sort((a, b) => a.r.recordDate - b.r.recordDate).slice(0, 40)) console.log(`  ${day(x.r.recordDate)} ${x.r.poultryHouse?.name ?? ""}  record now ${eggsOf(x.r)} eggs | credited ${Math.round(x.q * PER)} eggs | ${x.diff > 0 ? "credited MORE" : "credited LESS"} by ${Math.abs(Math.round(x.diff))}  (edited ${day(x.r.updatedAt)})`);
console.log(`  ${bRows.length} record(s); net: stock credited ${B >= 0 ? "more" : "less"} than the records by ${c(Math.abs(B))}`);

// C ── record that never credited
head("C. LIVE PRODUCTION RECORDS THAT NEVER CREDITED THE STORE");
let C = 0; const cRows = [];
for (const r of live) if (!creditedFor.has(r.id)) { C += eggsOf(r) / PER; cRows.push(r); }
for (const r of cRows.sort((a, b) => a.recordDate - b.recordDate).slice(0, 40)) console.log(`  ${day(r.recordDate)} ${r.poultryHouse?.name ?? ""}  ${eggsOf(r)} eggs`);
console.log(`  ${cRows.length} record(s) = ${c(C)}   (these are covered by the older per-day credits below if they are before the per-record credits began)`);

// D ── consolidated daily credits (not tied to a record)
head("D. CREDITS NOT TIED TO A RECORD (older per-day credits) vs THAT DAY'S RECORDS");
const looseDays = new Map(), recDays = new Map();
for (const m of loose) { const d = day(m.movementDate); looseDays.set(d, r4((looseDays.get(d) ?? 0) + n(m.quantity))); }
for (const r of live) { const d = day(r.recordDate); recDays.set(d, (recDays.get(d) ?? 0) + eggsOf(r) / PER); }
let D = 0, DR = 0; const dRows = [];
for (const [d, q] of looseDays) { const rec = recDays.get(d) ?? 0; D += q; DR += rec; dRows.push({ d, q, rec, diff: r4(q - rec) }); }
const dDiff = dRows.filter((x) => Math.abs(x.diff) >= 0.04).sort((a, b) => (a.d < b.d ? -1 : 1));
console.log(`  ${loose.length} untied credit(s) on ${looseDays.size} day(s): credited ${c(D)} | those days' records ${c(DR)} | credited minus records ${c(D - DR)}`);
for (const x of dDiff.slice(0, 40)) console.log(`  ${x.d}  credited ${c(x.q)}  records ${c(x.rec)}  difference ${c(x.diff)}`);

// adding it up
head("THE GAP, ADDED UP");
const tiedLive = live.filter((r) => creditedFor.has(r.id)).reduce((s, r) => s + eggsOf(r) / PER, 0);
console.log(`  A  credited for deleted records                  +${c(A)}`);
console.log(`  B  credited more/less than the edited records    ${B >= 0 ? "+" : "-"}${c(Math.abs(B))}`);
console.log(`  C  live records that never credited              -${c(C)}`);
console.log(`  D  untied per-day credits minus their days' records  ${D - DR >= 0 ? "+" : "-"}${c(Math.abs(D - DR))}`);
console.log(`  total explained ${c(A + B - C + (D - DR))}   vs   credited minus recorded ${c(credited - recorded)}`);

// E ── stock taken out of the farm store besides transfers
head("E. EVERYTHING TAKEN OUT OF THE FARM EGG STORE EXCEPT TRANSFERS (adjustments, write-offs, damage)");
const out = await p.stockMovement.findMany({ where: { productId: prod.id, deletedAt: null, warehouseId: { in: farmWh }, movementType: { in: ["ADJUSTMENT_OUT", "WASTE", "ADJUSTMENT_IN", "RETURN_OUT", "RETURN_IN", "PRODUCTION_INPUT"] } }, orderBy: { movementDate: "asc" }, select: { id: true, movementType: true, quantity: true, referenceType: true, referenceId: true, notes: true, movementDate: true, createdAt: true, createdById: true } });
const adjIds = out.filter((m) => m.referenceType === "StockAdjustment").map((m) => m.referenceId);
const adjs = await p.stockAdjustment.findMany({ where: { id: { in: adjIds } }, select: { id: true, adjustmentNumber: true, adjustmentType: true, status: true, reason: true, approvedById: true } });
const adjById = new Map(adjs.map((a) => [a.id, a]));
const users = await p.user.findMany({ where: { id: { in: [...new Set([...out.map((m) => m.createdById), ...adjs.map((a) => a.approvedById)].filter(Boolean))] } }, select: { id: true, fullName: true } });
const who = new Map(users.map((u) => [u.id, u.fullName]));
let withAdj = 0, noAdj = 0;
console.log("  -- with an adjustment record:");
for (const m of out.filter((m) => m.referenceType === "StockAdjustment")) { const a = adjById.get(m.referenceId); const sign = m.movementType.endsWith("_IN") ? "+" : "-"; if (sign === "-") withAdj += n(m.quantity); console.log(`     ${day(m.movementDate)} ${sign}${c(n(m.quantity))}  ${a?.adjustmentNumber ?? "?"} ${a?.adjustmentType ?? ""} [${a?.status ?? ""}] by ${who.get(m.createdById) ?? "?"}, approved by ${who.get(a?.approvedById) ?? "?"}: ${(a?.reason || m.notes || "").slice(0, 90)}`); }
console.log("  -- WITHOUT an adjustment record (entered another way):");
for (const m of out.filter((m) => m.referenceType !== "StockAdjustment")) { const sign = m.movementType.endsWith("_IN") ? "+" : "-"; if (sign === "-") noAdj += n(m.quantity); console.log(`     ${day(m.movementDate)} (recorded ${day(m.createdAt)}) ${sign}${c(n(m.quantity))}  ${m.movementType} ref ${m.referenceType ?? "none"} by ${who.get(m.createdById) ?? "?"}: ${(m.notes || "").slice(0, 110)}`); }
console.log(`  total taken out WITH adjustment records ${c(withAdj)} | WITHOUT ${c(noAdj)}`);
await p.$disconnect();
