/*
 * Non-destructive: credit the Jokas Egg store for egg production records ON OR
 * AFTER --since that never wrote a StockMovement (the form didn't attach a
 * product/warehouse, or predates the auto-resolve fix). One PRODUCTION_OUTPUT
 * movement per such record, dated to the record, keyed by record id so a
 * re-run skips anything already done. Transfers untouched.
 *
 * IMPORTANT: records BEFORE --since are assumed already credited via
 * rebuild-egg-store-daily.mjs's consolidated per-day movements. Default
 * --since is 2026-09-08 (the day after that rebuild's last covered date).
 *
 *   node packages/db/scripts/credit-uncredited-eggs.mjs                 # dry run
 *   node packages/db/scripts/credit-uncredited-eggs.mjs --since 2026-09-08
 *   node packages/db/scripts/credit-uncredited-eggs.mjs --commit --i-have-a-backup
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
const optv = (name, d) => { const i = A.indexOf("--" + name); return i >= 0 ? A[i + 1] : d; };
const SINCE = new Date(optv("since", "2026-09-08") + "T00:00:00.000Z");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }

const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const FARM = "ec1cea6b-40d7-4741-abb0-67ef687f251c";
const EGG_STORE = "517cd1de-1b9d-4d26-9e31-ac3fc906bf33";
const PER_CRATE = 30;
const n = (v) => Number(v ?? 0);
const round = (x) => Math.round(x * 10000) / 10000;
const eggSum = (r) => n(r.goodEggs) + n(r.crackedEggs) + n(r.dirtyEggs) + n(r.brokenEggs) + n(r.rejectedEggs);

async function main() {
  console.log(`\n=== CREDIT UNCREDITED EGGS (records on/after ${SINCE.toISOString().slice(0, 10)}) — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===\n`);
  const prod = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, uomId: true } });
  const store = await prisma.warehouse.findFirst({ where: { id: EGG_STORE }, select: { branchId: true } });

  const recs = await prisma.eggProductionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null, recordDate: { gte: SINCE } },
    select: { id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true, branchId: true },
    orderBy: { recordDate: "asc" },
  });
  const moved = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "EggProductionRecord", referenceId: { in: recs.map((r) => r.id) }, deletedAt: null },
    select: { referenceId: true },
  })).map((m) => m.referenceId));

  const todo = recs.filter((r) => !moved.has(r.id) && eggSum(r) > 0);
  const byDay = new Map();
  let totalEggs = 0;
  for (const r of todo) {
    const eggs = eggSum(r);
    totalEggs += eggs;
    byDay.set(r.recordDate.toISOString().slice(0, 10), (byDay.get(r.recordDate.toISOString().slice(0, 10)) ?? 0) + eggs);
  }
  console.log(`  uncredited records: ${todo.length}   total ${totalEggs} eggs = ${round(totalEggs / PER_CRATE)} crates`);
  for (const [d, e] of byDay) console.log(`     ${d}  ${e} eggs  (${round(e / PER_CRATE)} crates)`);
  const item0 = await prisma.inventoryItem.findFirst({ where: { warehouseId: EGG_STORE, productId: prod.id }, select: { quantityOnHand: true } });
  console.log(`\n  store on hand: ${n(item0?.quantityOnHand)}  ->  ${round(n(item0?.quantityOnHand) + totalEggs / PER_CRATE)} crates`);

  if (!COMMIT) { console.log("\n  (dry run — nothing written)\n"); await prisma.$disconnect(); return; }
  if (!todo.length) { console.log("\n  nothing to do.\n"); await prisma.$disconnect(); return; }

  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: COMPANY, warehouseId: EGG_STORE, productId: prod.id } },
      update: { quantityOnHand: { increment: round(totalEggs / PER_CRATE) }, deletedAt: null, status: "ACTIVE" },
      create: { companyId: COMPANY, branchId: store.branchId, warehouseId: EGG_STORE, farmId: FARM, productId: prod.id, uomId: prod.uomId, quantityOnHand: round(totalEggs / PER_CRATE) },
    });
    const first = new Date(todo[0].recordDate);
    const sb = await tx.stockBatch.create({ data: {
      companyId: COMPANY, branchId: store.branchId, farmId: FARM, warehouseId: EGG_STORE, productId: prod.id,
      inventoryItemId: item.id, uomId: prod.uomId, batchNumber: `EGG-BACKFILL-${first.toISOString().slice(0, 10)}`,
      quantityReceived: round(totalEggs / PER_CRATE), quantityRemaining: round(totalEggs / PER_CRATE), manufactureDate: first,
    } });
    const rows = todo.map((r) => ({
      companyId: COMPANY, branchId: r.branchId ?? store.branchId, productId: prod.id, inventoryItemId: item.id, stockBatchId: sb.id,
      toWarehouseId: EGG_STORE, warehouseId: EGG_STORE, farmId: FARM, uomId: prod.uomId,
      movementType: "PRODUCTION_OUTPUT", quantity: round(eggSum(r) / PER_CRATE),
      referenceType: "EggProductionRecord", referenceId: r.id,
      notes: `Egg collection credited (backfill) — ${eggSum(r)} eggs`,
      movementDate: r.recordDate,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx.stockMovement.createMany({ data: rows.slice(i, i + 500) });
    console.log(`\n  wrote ${rows.length} movements; store on hand now ${n((await tx.inventoryItem.findUnique({ where: { id: item.id }, select: { quantityOnHand: true } }))?.quantityOnHand)} crates`);
  }, { timeout: 60000 });
  console.log(`  >>> DONE\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
