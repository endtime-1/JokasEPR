/*
 * Rebuild the Jokas Egg store's stock so its Activity log reads as a
 * day-by-day collection record (one "in" movement per day), instead of the
 * single lump the import created. Idempotent — safe to re-run.
 *
 *   node packages/db/scripts/rebuild-egg-store-daily.mjs                 # dry run
 *   node packages/db/scripts/rebuild-egg-store-daily.mjs --commit --i-have-a-backup
 *
 * Source of truth: every non-deleted EggProductionRecord (all pens, all
 * batches). Crates = total pieces / 30. Keeps ONE stock batch; replaces every
 * movement with one PRODUCTION_OUTPUT per collection day.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }

const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const FARM = "ec1cea6b-40d7-4741-abb0-67ef687f251c";
const EGG_STORE = "517cd1de-1b9d-4d26-9e31-ac3fc906bf33";
const PER_CRATE = 30;
const money = (n) => Math.round(n * 10000) / 10000;

async function main() {
  console.log(`\n=== REBUILD JOKAS EGG STORE (daily) — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===\n`);
  const prod = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, name: true, uomId: true } });
  const store = await prisma.warehouse.findFirst({ where: { id: EGG_STORE }, select: { id: true, name: true, branchId: true } });

  const recs = await prisma.eggProductionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null },
    select: { recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true },
    orderBy: { recordDate: "asc" },
  });
  const byDay = new Map();
  for (const r of recs) {
    const pieces = r.goodEggs + r.crackedEggs + r.dirtyEggs + r.brokenEggs + r.rejectedEggs;
    if (pieces <= 0) continue;
    const k = r.recordDate.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) || 0) + pieces);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const totalPieces = days.reduce((s, [, p]) => s + p, 0);
  const totalCrates = money(totalPieces / PER_CRATE);

  console.log(`  egg-production records: ${recs.length}   collection days: ${days.length}`);
  console.log(`  first ${days[0]?.[0]}  last ${days[days.length - 1]?.[0]}`);
  console.log(`  total: ${totalPieces} eggs = ${totalCrates} crates`);
  console.log(`\n  sample days:`);
  for (const [d, p] of [...days.slice(0, 3), ...days.slice(-3)]) console.log(`     ${d}  ${p} eggs  ${money(p / PER_CRATE)} crates`);

  const curItem = await prisma.inventoryItem.findFirst({ where: { warehouseId: EGG_STORE, productId: prod.id }, select: { id: true, quantityOnHand: true } });
  const curMoves = await prisma.stockMovement.count({ where: { warehouseId: EGG_STORE, productId: prod.id } });
  console.log(`\n  current: on hand ${curItem ? Number(curItem.quantityOnHand) : 0} crates, ${curMoves} movement rows  →  ${totalCrates} crates, ${days.length} daily movements`);

  if (!COMMIT) { console.log("\n  (dry run — nothing written)\n"); await prisma.$disconnect(); return; }

  const item = await prisma.inventoryItem.upsert({
    where: { companyId_warehouseId_productId: { companyId: COMPANY, warehouseId: EGG_STORE, productId: prod.id } },
    update: { quantityOnHand: totalCrates, deletedAt: null, status: "ACTIVE" },
    create: { companyId: COMPANY, branchId: store.branchId, warehouseId: EGG_STORE, farmId: FARM, productId: prod.id, uomId: prod.uomId, quantityOnHand: totalCrates },
  });
  // one stock batch holding the lot
  await prisma.stockMovement.deleteMany({ where: { warehouseId: EGG_STORE, productId: prod.id } });
  await prisma.stockBatch.deleteMany({ where: { warehouseId: EGG_STORE, productId: prod.id } });
  const first = new Date(days[0][0] + "T00:00:00.000Z");
  const sb = await prisma.stockBatch.create({ data: {
    companyId: COMPANY, branchId: store.branchId, farmId: FARM, warehouseId: EGG_STORE, productId: prod.id,
    inventoryItemId: item.id, uomId: prod.uomId, batchNumber: "EGG-COLLECTED",
    quantityReceived: totalCrates, quantityRemaining: totalCrates, manufactureDate: first,
  } });
  // one movement per collection day
  const rows = days.map(([d, pieces]) => ({
    companyId: COMPANY, branchId: store.branchId, productId: prod.id, inventoryItemId: item.id, stockBatchId: sb.id,
    toWarehouseId: EGG_STORE, warehouseId: EGG_STORE, farmId: FARM, uomId: prod.uomId,
    movementType: "PRODUCTION_OUTPUT", quantity: money(pieces / PER_CRATE),
    referenceType: "EggProductionDaily", referenceId: d,
    notes: `Eggs collected ${d}: ${pieces} eggs (${money(pieces / PER_CRATE)} crates)`,
    movementDate: new Date(d + "T12:00:00.000Z"),
  }));
  for (let i = 0; i < rows.length; i += 500) await prisma.stockMovement.createMany({ data: rows.slice(i, i + 500) });
  console.log(`\n  wrote ${rows.length} daily movements; on hand = ${totalCrates} crates\n  >>> DONE\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
