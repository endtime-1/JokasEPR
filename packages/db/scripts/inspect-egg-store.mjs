/*
 * Read-only: what the Jokas Egg store actually holds right now — on-hand,
 * every stock batch with its remaining/status, and the last 20 movements so
 * you can see what has been transferred out.
 *
 *   node packages/db/scripts/inspect-egg-store.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const W = "517cd1de-1b9d-4d26-9e31-ac3fc906bf33"; // Jokas Egg

async function main() {
  const prod = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, name: true, piecesPerUnit: true, uom: { select: { name: true } } } });
  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: W, productId: prod.id }, select: { quantityOnHand: true, deletedAt: true } });
  const batches = await prisma.stockBatch.findMany({ where: { warehouseId: W, productId: prod.id, deletedAt: null }, select: { batchNumber: true, quantityReceived: true, quantityRemaining: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const moves = await prisma.stockMovement.findMany({ where: { warehouseId: W, productId: prod.id, deletedAt: null }, select: { movementType: true, quantity: true, fromWarehouseId: true, toWarehouseId: true, notes: true, movementDate: true }, orderBy: { movementDate: "desc" }, take: 20 });

  const unit = prod.uom?.name ?? "unit";
  console.log(`\n=== Jokas Egg — ${prod.name} (1 ${unit} = ${prod.piecesPerUnit} pieces) ===\n`);
  console.log(`  on hand: ${item ? Number(item.quantityOnHand) : 0} ${unit}s${item?.deletedAt ? "  (ITEM RETIRED)" : ""}`);
  const avail = batches.filter((b) => b.status === "AVAILABLE").reduce((s, b) => s + Number(b.quantityRemaining), 0);
  console.log(`  usable stock across AVAILABLE batches: ${avail} ${unit}s   <-- a transfer/sale can't exceed this\n`);
  console.log(`  batches (${batches.length}):`);
  for (const b of batches) console.log(`     ${b.batchNumber.padEnd(26)} recv ${String(Number(b.quantityReceived)).padStart(9)}  remaining ${String(Number(b.quantityRemaining)).padStart(9)}  ${b.status}`);
  console.log(`\n  last 20 movements:`);
  for (const m of moves) {
    const dir = m.fromWarehouseId === W ? "OUT" : "IN ";
    console.log(`     ${m.movementDate.toISOString().slice(0, 10)}  ${dir}  ${String(Number(m.quantity)).padStart(9)}  ${m.movementType.padEnd(17)} ${m.notes ?? ""}`);
  }
  console.log();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
