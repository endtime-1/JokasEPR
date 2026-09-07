/*
 * ONE-TIME: credit the Jokas Egg store for egg-production records that were
 * saved without an egg product/warehouse (so the count logged but the store
 * never moved). The import's consolidated EGG-XLS-001 batch already covers
 * everything up to --covered-through; this handles the days after.
 *
 *   node packages/db/scripts/credit-uncredited-eggs.mjs                 # dry run
 *   node packages/db/scripts/credit-uncredited-eggs.mjs --commit --i-have-a-backup
 *
 *   --covered-through YYYY-MM-DD   default 2026-09-04 (the import cutoff)
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }

const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const FARM = "ec1cea6b-40d7-4741-abb0-67ef687f251c";
const EGG_STORE = "517cd1de-1b9d-4d26-9e31-ac3fc906bf33";
const COVERED_THROUGH = new Date((opt("covered-through", "2026-09-04")) + "T23:59:59.999Z");
const PER_CRATE = 30;
const money = (n) => Math.round(n * 10000) / 10000;

async function main() {
  console.log(`\n=== CREDIT UNCREDITED EGGS — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===`);
  console.log(`  import batch EGG-XLS-* covers through ${COVERED_THROUGH.toISOString().slice(0, 10)}; crediting egg records after that\n`);

  const eggProd = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, name: true, uomId: true, piecesPerUnit: true } });
  if (!eggProd) throw new Error("no egg product");
  const store = await prisma.warehouse.findFirst({ where: { id: EGG_STORE }, select: { id: true, name: true, branchId: true } });

  // records after the covered window, with eggs, not already backed by a movement
  const recs = await prisma.eggProductionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null, recordDate: { gt: COVERED_THROUGH } },
    select: { id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true, flockBatchId: true },
    orderBy: { recordDate: "asc" },
  });
  const movedIds = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "EggProductionRecord", referenceId: { in: recs.map((r) => r.id) } },
    select: { referenceId: true },
  })).map((m) => m.referenceId));

  const uncredited = recs.filter((r) => !movedIds.has(r.id));
  const byDay = {};
  let totalPieces = 0;
  for (const r of uncredited) {
    const pieces = r.goodEggs + r.crackedEggs + r.dirtyEggs + r.brokenEggs + r.rejectedEggs;
    if (pieces <= 0) continue;
    const k = r.recordDate.toISOString().slice(0, 10);
    byDay[k] = (byDay[k] || 0) + pieces;
    totalPieces += pieces;
  }
  const totalCrates = money(totalPieces / PER_CRATE);

  console.log(`  egg records after window: ${recs.length}   already credited: ${recs.length - uncredited.length}   to credit: ${uncredited.length}`);
  for (const [d, p] of Object.entries(byDay)) console.log(`     ${d}  ${p} eggs = ${money(p / PER_CRATE)} crates`);
  console.log(`\n  => will add ${totalCrates} crates (${totalPieces} eggs) to ${store.name}`);
  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: EGG_STORE, productId: eggProd.id }, select: { id: true, quantityOnHand: true } });
  console.log(`     current on hand: ${item ? Number(item.quantityOnHand) : 0} crates  ->  ${(item ? Number(item.quantityOnHand) : 0) + totalCrates} crates`);

  if (!COMMIT) { console.log("\n  (dry run — nothing written)\n"); await prisma.$disconnect(); return; }
  if (totalCrates <= 0) { console.log("\n  nothing to credit.\n"); await prisma.$disconnect(); return; }

  const it = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: COMPANY, warehouseId: EGG_STORE, productId: eggProd.id } },
    update: { quantityOnHand: { increment: totalCrates }, deletedAt: null, status: "ACTIVE" },
    create: { companyId: COMPANY, branchId: store.branchId, warehouseId: EGG_STORE, farmId: FARM, productId: eggProd.id, uomId: eggProd.uomId, quantityOnHand: totalCrates },
  });
  const firstDay = new Date(Object.keys(byDay).sort()[0] + "T00:00:00.000Z");
  const sb = await prisma.stockBatch.create({ data: {
    companyId: COMPANY, branchId: store.branchId, farmId: FARM, warehouseId: EGG_STORE, productId: eggProd.id,
    inventoryItemId: it.id, uomId: eggProd.uomId, batchNumber: `EGG-XLS-BACKFILL-${firstDay.toISOString().slice(0, 10)}`,
    quantityReceived: totalCrates, quantityRemaining: totalCrates, manufactureDate: firstDay,
  } });
  await prisma.stockMovement.create({ data: {
    companyId: COMPANY, branchId: store.branchId, productId: eggProd.id, inventoryItemId: it.id, stockBatchId: sb.id,
    toWarehouseId: EGG_STORE, warehouseId: EGG_STORE, farmId: FARM, uomId: eggProd.uomId,
    movementType: "PRODUCTION_OUTPUT", quantity: totalCrates, referenceType: "PoultryExcelImport", referenceId: "egg-backfill",
    notes: `Backfill: ${totalPieces} eggs collected ${Object.keys(byDay).join(", ")} that were logged without a product/warehouse`,
    movementDate: firstDay,
  } });
  console.log(`\n  credited ${totalCrates} crates. new on hand: ${Number(it.quantityOnHand)} crates\n  >>> DONE\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
