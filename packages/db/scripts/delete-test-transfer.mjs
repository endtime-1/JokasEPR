/*
 * Remove test stock-transfer records by transfer number. Soft-deletes the
 * StockTransfer, its StockMovement rows and the batch it created at the
 * destination, and walks the destination InventoryItem back down by whatever
 * of that batch is still on hand. The SOURCE side is never touched — the egg
 * store was rebuilt from the egg records (rebuild-egg-store-daily.mjs) and is
 * already authoritative.
 *
 *   node packages/db/scripts/delete-test-transfer.mjs                         # dry run, default STR-2026-0002
 *   node packages/db/scripts/delete-test-transfer.mjs STR-2026-0002 STR-2026-0003
 *   node packages/db/scripts/delete-test-transfer.mjs --commit --i-have-a-backup
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }
const NUMS = A.filter((a) => !a.startsWith("--"));
const TARGETS = NUMS.length ? NUMS : ["STR-2026-0002"];
const now = new Date();

async function one(transferNumber) {
  const t = await prisma.stockTransfer.findFirst({
    where: { transferNumber, deletedAt: null },
    include: { product: { select: { sku: true, name: true } }, fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } } },
  });
  if (!t) { console.log(`  ${transferNumber}: not found (already gone?)\n`); return; }

  const moves = await prisma.stockMovement.findMany({ where: { referenceType: "StockTransfer", referenceId: t.id, deletedAt: null }, select: { id: true, quantity: true, warehouseId: true, movementType: true, stockBatchId: true } });
  const destBatch = await prisma.stockBatch.findFirst({ where: { warehouseId: t.toWarehouseId, productId: t.productId, batchNumber: { startsWith: transferNumber }, deletedAt: null } });
  const destItem = await prisma.inventoryItem.findFirst({ where: { warehouseId: t.toWarehouseId, productId: t.productId }, select: { id: true, quantityOnHand: true, deletedAt: true } });
  const backOut = destBatch ? Math.min(Number(destBatch.quantityRemaining), destItem ? Number(destItem.quantityOnHand) : 0) : 0;

  console.log(`  ${transferNumber}  [${t.status}]  ${Number(t.quantity)} ${t.product.sku}  ${t.fromWarehouse.name} -> ${t.toWarehouse.name}  (${t.transferDate.toISOString().slice(0,10)})`);
  console.log(`     movements: ${moves.length}   dest batch: ${destBatch ? `${destBatch.batchNumber} rem ${Number(destBatch.quantityRemaining)}` : "none"}`);
  console.log(`     dest item: ${destItem ? `${Number(destItem.quantityOnHand)} on hand${destItem.deletedAt ? " (retired)" : ""}` : "none"}   -> will decrement by ${backOut}`);
  console.log(`     source (${t.fromWarehouse.name}): NOT touched`);

  if (!COMMIT) { console.log(); return; }

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.updateMany({ where: { id: { in: moves.map((m) => m.id) } }, data: { deletedAt: now } });
    if (destBatch) await tx.stockBatch.update({ where: { id: destBatch.id }, data: { deletedAt: now, quantityRemaining: 0 } });
    if (destItem && !destItem.deletedAt && backOut > 0) {
      await tx.inventoryItem.update({ where: { id: destItem.id }, data: { quantityOnHand: { decrement: backOut } } });
    }
    await tx.transferDiscrepancy.updateMany({ where: { stockTransferId: t.id, deletedAt: null }, data: { deletedAt: now } });
    await tx.stockTransfer.update({ where: { id: t.id }, data: { deletedAt: now, notes: `${t.notes ? t.notes + " | " : ""}Deleted as test data ${now.toISOString().slice(0,10)}` } });
  });
  console.log(`     >>> deleted\n`);
}

async function main() {
  console.log(`\n=== DELETE TEST TRANSFERS ${COMMIT ? "!!! COMMIT !!!" : "(dry run)"} ===\n  targets: ${TARGETS.join(", ")}\n`);
  for (const n of TARGETS) await one(n);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
