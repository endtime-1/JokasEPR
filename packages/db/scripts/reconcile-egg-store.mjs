/*
 * Read-only: reconcile the Jokas Egg store against the egg production records.
 * Shows, per collection day, eggs recorded vs eggs actually credited to the
 * store (via a StockMovement), and the running gap — so we can see which days
 * logged eggs that never reached the store.
 *
 *   node packages/db/scripts/reconcile-egg-store.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const EGG_STORE = "517cd1de-1b9d-4d26-9e31-ac3fc906bf33"; // Jokas Egg
const PER_CRATE = 30;
const n = (v) => Number(v ?? 0);
const eggSum = (r) => n(r.goodEggs) + n(r.crackedEggs) + n(r.dirtyEggs) + n(r.brokenEggs) + n(r.rejectedEggs);
const cr = (eggs) => Math.round((eggs / PER_CRATE) * 1000) / 1000;

async function main() {
  const prod = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true } });

  const recs = await prisma.eggProductionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null },
    select: { id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true },
    orderBy: { recordDate: "asc" },
  });
  // which egg records have a stock movement behind them
  const moved = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "EggProductionRecord", referenceId: { in: recs.map((r) => r.id) }, deletedAt: null },
    select: { referenceId: true },
  })).map((m) => m.referenceId));

  // all IN movements crediting the egg store for the Eggs product (import lump,
  // daily rebuild, per-record credits, backfills)
  const inMoves = await prisma.stockMovement.findMany({
    where: { warehouseId: EGG_STORE, productId: prod.id, deletedAt: null, OR: [{ toWarehouseId: EGG_STORE }, { fromWarehouseId: null }] },
    select: { quantity: true, movementType: true, referenceType: true, fromWarehouseId: true },
  });
  const creditedCrates = inMoves.filter((m) => !m.fromWarehouseId).reduce((s, m) => s + n(m.quantity), 0);
  const outMoves = await prisma.stockMovement.aggregate({
    where: { warehouseId: EGG_STORE, productId: prod.id, deletedAt: null, fromWarehouseId: EGG_STORE },
    _sum: { quantity: true },
  });
  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: EGG_STORE, productId: prod.id }, select: { quantityOnHand: true } });

  const byDay = new Map();
  let recordedEggs = 0, uncreditedEggs = 0, uncreditedCount = 0;
  for (const r of recs) {
    const eggs = eggSum(r);
    recordedEggs += eggs;
    if (!moved.has(r.id)) { uncreditedEggs += eggs; uncreditedCount++; }
    const k = r.recordDate.toISOString().slice(0, 10);
    const d = byDay.get(k) ?? { recorded: 0, credited: 0 };
    d.recorded += eggs;
    if (moved.has(r.id)) d.credited += eggs;
    byDay.set(k, d);
  }

  console.log(`\n=== JOKAS EGG STORE RECONCILIATION ===\n`);
  console.log(`  egg production records: ${recs.length}`);
  console.log(`  eggs recorded (all records):        ${recordedEggs}  (${cr(recordedEggs)} crates)`);
  console.log(`  eggs on records with NO stock move: ${uncreditedEggs}  (${cr(uncreditedEggs)} crates)  across ${uncreditedCount} records`);
  console.log(``);
  console.log(`  store credited-in total (all IN moves):  ${Math.round(creditedCrates * 1000) / 1000} crates`);
  console.log(`  store transferred-out total:             ${Math.round(n(outMoves._sum.quantity) * 1000) / 1000} crates`);
  console.log(`  store on hand now:                       ${n(item?.quantityOnHand)} crates`);
  console.log(`  expected on hand (credited − out):       ${Math.round((creditedCrates - n(outMoves._sum.quantity)) * 1000) / 1000} crates`);
  console.log(``);
  console.log(`  days where recorded > credited:`);
  let shown = 0;
  for (const [day, d] of byDay) {
    if (d.recorded - d.credited > 0.5) {
      console.log(`     ${day}   recorded ${d.recorded}   credited ${d.credited}   gap ${d.recorded - d.credited} eggs`);
      shown++;
    }
  }
  if (!shown) console.log(`     (none — every record has a matching stock movement)`);
  console.log(`\n  => the fix, if there's a gap: credit the ${uncreditedCount} uncredited records per day (non-destructive; leaves transfers alone).\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
