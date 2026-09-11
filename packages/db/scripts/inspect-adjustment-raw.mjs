// READ-ONLY. Prints the exact stored fields of a StockAdjustment (and the
// StockMovement it produced) by batchNumber, to see what was actually
// submitted (signed quantity, adjustmentType, reason) vs what the user
// remembers selecting.
//
//   node packages/db/scripts/inspect-adjustment-raw.mjs ADJ-038BBD7B
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const batchNumber = process.argv[2];
  if (!batchNumber) { console.error("usage: node inspect-adjustment-raw.mjs <batchNumber>"); process.exit(1); }
  const batch = await prisma.stockBatch.findFirst({ where: { batchNumber } });
  if (!batch) { console.log("batch not found"); return; }
  const movement = await prisma.stockMovement.findFirst({ where: { stockBatchId: batch.id, movementType: "ADJUSTMENT_IN" } });
  const adjustment = movement?.referenceId ? await prisma.stockAdjustment.findUnique({ where: { id: movement.referenceId } }) : null;
  console.log("StockBatch:", { id: batch.id, batchNumber: batch.batchNumber, quantityReceived: batch.quantityReceived.toString(), createdAt: batch.createdAt });
  console.log("StockMovement:", movement ? { id: movement.id, quantity: movement.quantity.toString(), movementType: movement.movementType, notes: movement.notes, createdAt: movement.createdAt } : null);
  console.log("StockAdjustment:", adjustment ? {
    id: adjustment.id, adjustmentNumber: adjustment.adjustmentNumber, adjustmentType: adjustment.adjustmentType,
    quantity: adjustment.quantity.toString(), reason: adjustment.reason, status: adjustment.status,
    requestedById: adjustment.requestedById, approvedById: adjustment.approvedById,
    createdAt: adjustment.createdAt, approvedAt: adjustment.approvedAt,
  } : null);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
