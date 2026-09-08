/*
 * Re-apply the source-side deduction for completed/in-transit stock transfers
 * that credited the destination but never drew the source down (the earlier
 * egg-store rebuild wiped Jokas Egg's movements, taking those deductions with
 * it). For each such transfer it consumes the quantity FIFO from the source's
 * stock batches, decrements the source InventoryItem, and writes the missing
 * OUT movement dated to the transfer date. Idempotent — a transfer that
 * already has its source movement is skipped.
 *
 *   node packages/db/scripts/reapply-transfer-source-deductions.mjs                       # dry run, source = Jokas Egg
 *   node packages/db/scripts/reapply-transfer-source-deductions.mjs --from <warehouseId>
 *   node packages/db/scripts/reapply-transfer-source-deductions.mjs --commit --i-have-a-backup
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };
const FROM_WH = opt("from", "517cd1de-1b9d-4d26-9e31-ac3fc906bf33"); // Jokas Egg
const round = (n) => Math.round(n * 10000) / 10000;

async function main() {
  const wh = await prisma.warehouse.findFirst({ where: { id: FROM_WH }, select: { name: true, branchId: true } });
  console.log(`\n=== RE-APPLY TRANSFER SOURCE DEDUCTIONS — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===`);
  console.log(`  source warehouse: ${wh?.name} (${FROM_WH})\n`);

  const transfers = await prisma.stockTransfer.findMany({
    where: { fromWarehouseId: FROM_WH, deletedAt: null, status: { in: ["IN_TRANSIT", "COMPLETED"] } },
    orderBy: { transferDate: "asc" },
    select: { id: true, transferNumber: true, transferDate: true, quantity: true, productId: true, branchId: true, farmId: true, uomId: true, unitCost: true, toWarehouseId: true },
  });

  let totalToApply = 0;
  const todo = [];
  for (const t of transfers) {
    const srcMove = await prisma.stockMovement.findFirst({
      where: { referenceType: "StockTransfer", referenceId: t.id, fromWarehouseId: FROM_WH, deletedAt: null },
      select: { id: true },
    });
    if (srcMove) { console.log(`  ${t.transferNumber}  ${Number(t.quantity)}  — source movement already present, skip`); continue; }
    todo.push(t);
    totalToApply += Number(t.quantity);
    console.log(`  ${t.transferNumber}  ${t.transferDate.toISOString().slice(0, 10)}  ${Number(t.quantity)}  — MISSING source deduction`);
  }

  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: FROM_WH }, select: { id: true, quantityOnHand: true, productId: true } });
  console.log(`\n  transfers needing re-application: ${todo.length}   total qty: ${round(totalToApply)}`);
  console.log(`  source on hand now: ${item ? Number(item.quantityOnHand) : 0}  ->  ${item ? round(Number(item.quantityOnHand) - totalToApply) : "?"}\n`);

  if (!COMMIT) { console.log("  (dry run — nothing written)\n"); await prisma.$disconnect(); return; }

  for (const t of todo) {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.findFirst({ where: { warehouseId: FROM_WH, productId: t.productId, deletedAt: null } });
      if (!inv) throw new Error(`${t.transferNumber}: no source inventory item for product ${t.productId}`);
      let remaining = Number(t.quantity);
      const batches = await tx.stockBatch.findMany({
        where: { inventoryItemId: inv.id, deletedAt: null, quantityRemaining: { gt: 0 }, status: "AVAILABLE" },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      });
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(b.quantityRemaining));
        const upd = await tx.stockBatch.updateMany({ where: { id: b.id, quantityRemaining: { gte: take } }, data: { quantityRemaining: { decrement: take } } });
        if (upd.count === 0) throw new Error(`${t.transferNumber}: batch ${b.batchNumber} raced`);
        await tx.stockMovement.create({ data: {
          companyId: inv.companyId, branchId: t.branchId, productId: t.productId, inventoryItemId: inv.id, stockBatchId: b.id,
          fromWarehouseId: FROM_WH, warehouseId: FROM_WH, farmId: t.farmId, uomId: t.uomId,
          movementType: "TRANSFER", quantity: round(take), unitCost: b.unitCost ?? undefined,
          referenceType: "StockTransfer", referenceId: t.id,
          notes: `Transfer ${t.transferNumber} dispatched (source deduction re-applied)`,
          movementDate: t.transferDate,
        } });
        remaining -= take;
      }
      if (remaining > 0.0001) throw new Error(`${t.transferNumber}: source only had ${Number(t.quantity) - remaining} of ${Number(t.quantity)} — stopped to avoid negative stock`);
      const dec = await tx.inventoryItem.updateMany({ where: { id: inv.id, quantityOnHand: { gte: Number(t.quantity) } }, data: { quantityOnHand: { decrement: Number(t.quantity) } } });
      if (dec.count === 0) throw new Error(`${t.transferNumber}: source on-hand below ${Number(t.quantity)} — stopped`);
      console.log(`  ${t.transferNumber}: -${Number(t.quantity)} applied`);
    }, { timeout: 30000 });
  }
  const after = await prisma.inventoryItem.findFirst({ where: { warehouseId: FROM_WH }, select: { quantityOnHand: true } });
  console.log(`\n  DONE. source on hand: ${after ? Number(after.quantityOnHand) : "?"}\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
