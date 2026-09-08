/*
 * Read-only: everything about one stock transfer — its status, the movements
 * it created on each side, and the current on-hand + batches of the source
 * and destination inventory items. Use it to see why a transfer credited the
 * destination but didn't draw down the source.
 *
 *   node packages/db/scripts/inspect-transfer.mjs STR-2026-0013
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const NUM = process.argv[2];
if (!NUM) { console.error("usage: inspect-transfer.mjs <STR-number>"); process.exit(1); }

async function side(label, warehouseId, productId) {
  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId, productId }, select: { id: true, quantityOnHand: true, deletedAt: true } });
  const batches = await prisma.stockBatch.findMany({ where: { warehouseId, productId, deletedAt: null }, select: { batchNumber: true, quantityRemaining: true, status: true }, orderBy: { createdAt: "asc" } });
  console.log(`  ${label}: on hand ${item ? Number(item.quantityOnHand) : "(no item)"}${item?.deletedAt ? " RETIRED" : ""}`);
  for (const b of batches) console.log(`     ${b.batchNumber.padEnd(26)} rem ${String(Number(b.quantityRemaining)).padStart(10)}  ${b.status}`);
}

async function main() {
  const t = await prisma.stockTransfer.findFirst({
    where: { transferNumber: NUM },
    include: { product: { select: { sku: true, name: true } }, fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } } },
  });
  if (!t) { console.log(`${NUM}: not found`); await prisma.$disconnect(); return; }
  console.log(`\n=== ${NUM} ===`);
  console.log(`  status ${t.status}   qty ${Number(t.quantity)}   received ${t.receivedQuantity == null ? "-" : Number(t.receivedQuantity)}`);
  console.log(`  ${t.fromWarehouse.name}  ->  ${t.toWarehouse.name}   product ${t.product.sku}`);
  console.log(`  approvedAt ${t.approvedAt ?? "-"}   receivedAt ${t.receivedAt ?? "-"}   deletedAt ${t.deletedAt ?? "-"}`);
  console.log(`  dispatchedLots: ${JSON.stringify(t.dispatchedLots)}`);

  const moves = await prisma.stockMovement.findMany({
    where: { referenceType: "StockTransfer", referenceId: t.id },
    select: { movementType: true, quantity: true, fromWarehouseId: true, toWarehouseId: true, warehouseId: true, deletedAt: true, notes: true, movementDate: true },
    orderBy: { movementDate: "asc" },
  });
  console.log(`\n  movements (${moves.length}):`);
  for (const m of moves) {
    const dir = m.fromWarehouseId ? `OUT of ${m.fromWarehouseId === t.fromWarehouseId ? "SOURCE" : m.fromWarehouseId}` : `IN to ${m.toWarehouseId === t.toWarehouseId ? "DEST" : m.toWarehouseId}`;
    console.log(`     ${m.movementDate.toISOString().slice(0, 10)}  ${m.movementType.padEnd(12)} qty ${String(Number(m.quantity)).padStart(10)}  ${dir}${m.deletedAt ? "  [DELETED]" : ""}   ${m.notes ?? ""}`);
  }
  console.log();
  await side("SOURCE " + t.fromWarehouse.name, t.fromWarehouseId, t.productId);
  await side("DEST   " + t.toWarehouse.name, t.toWarehouseId, t.productId);
  console.log();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
