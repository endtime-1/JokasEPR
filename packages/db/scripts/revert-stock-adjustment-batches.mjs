// Reverts specific Stock Adjustment batches by batchNumber (e.g. "ADJ-038BBD7B").
// Undoes exactly what applyAdjustmentTx's increase path did: soft-deletes the
// StockBatch, decrements InventoryItem.quantityOnHand by the same amount, and
// soft-deletes the StockMovement + StockAdjustment rows it created. Refuses to
// touch a batch that's already been partially consumed (quantityRemaining !=
// quantityReceived) — that needs manual review, not a blind revert.
//
// 2026-09-11: owner found six same-day test adjustments totaling 46,520 kg of
// feed (four +50kg + one +46,300kg Mash by Farm Manager/Super Admin, one
// +20kg Concentrate) with no idea where they came from — traced via
// inspect-todays-feed-receipts.mjs to feature-testing right after the Stock
// Adjustment fix went live. Confirmed unwanted; this reverts them.
//
// Dry-run by default:
//   node packages/db/scripts/revert-stock-adjustment-batches.mjs ADJ-038BBD7B ADJ-AE093EC4 ...
// Apply for real:
//   node packages/db/scripts/revert-stock-adjustment-batches.mjs --commit --i-have-a-backup ADJ-038BBD7B ...
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit") && args.includes("--i-have-a-backup");
const batchNumbers = args.filter((a) => !a.startsWith("--"));

const DEFAULT_BATCH_NUMBERS = [
  "ADJ-0F7AAE5D", "ADJ-FADEDD4F", "ADJ-400359F3", "ADJ-E8DDD0EC", // 4x +50kg Mash, Farm Manager
  "ADJ-038BBD7B", // +46,300kg Mash, Super Admin
  "ADJ-AE093EC4", // +20kg Concentrate, Super Admin
];

async function main() {
  const targets = batchNumbers.length ? batchNumbers : DEFAULT_BATCH_NUMBERS;
  console.log(`${COMMIT ? "COMMIT MODE" : "DRY RUN"} — ${targets.length} batch(es)\n`);

  for (const batchNumber of targets) {
    const batch = await prisma.stockBatch.findFirst({
      where: { batchNumber, deletedAt: null },
      include: { inventoryItem: true, product: { select: { name: true } }, warehouse: { select: { name: true } } },
    });
    if (!batch) { console.log(`SKIP  ${batchNumber}: not found (already reverted, or wrong batch number)`); continue; }
    if (Number(batch.quantityRemaining) !== Number(batch.quantityReceived)) {
      console.log(`ABORT ${batchNumber}: remaining=${batch.quantityRemaining} != received=${batch.quantityReceived} — something already consumed part of this batch. Needs manual review, skipping.`);
      continue;
    }

    const movement = await prisma.stockMovement.findFirst({ where: { stockBatchId: batch.id, movementType: "ADJUSTMENT_IN", deletedAt: null } });
    const adjustment = movement?.referenceType === "StockAdjustment" && movement.referenceId
      ? await prisma.stockAdjustment.findUnique({ where: { id: movement.referenceId } })
      : null;

    console.log(`${COMMIT ? "REVERTING" : "would revert"}  ${batchNumber}  ${batch.product.name}  qty=${batch.quantityReceived}  -> ${batch.warehouse.name}  movement=${movement?.id ?? "none"}  adjustment=${adjustment?.id ?? "none"}`);
    if (!COMMIT) continue;

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.stockBatch.update({ where: { id: batch.id }, data: { deletedAt: now, quantityRemaining: 0 } });
      const itemUpdate = await tx.inventoryItem.updateMany({
        where: { id: batch.inventoryItemId, quantityOnHand: { gte: Number(batch.quantityReceived) } },
        data: { quantityOnHand: { decrement: Number(batch.quantityReceived) } },
      });
      if (itemUpdate.count === 0) throw new Error(`InventoryItem ${batch.inventoryItemId} has less on hand than this batch — aborting to avoid going negative. Investigate manually.`);
      if (movement) await tx.stockMovement.update({ where: { id: movement.id }, data: { deletedAt: now } });
      if (adjustment) await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: { deletedAt: now } });
    });
    console.log(`  done.`);
  }
  console.log(COMMIT ? "\nAll targeted batches reverted." : "\nDry run only — re-run with --commit --i-have-a-backup to apply.");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
