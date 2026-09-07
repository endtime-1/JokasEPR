/*
 * ONE-TIME: strip the Jokas Egg store back to just the poultry-import batch(es).
 * The store had pre-existing test stock; the Excel import added EGG-XLS-001 on
 * top. This soft-deletes every OTHER stock batch of the Eggs product in that
 * store, drops their movements/alerts/reservations, and recomputes on-hand.
 *
 *   node packages/db/scripts/clean-egg-store.mjs               # dry run
 *   node packages/db/scripts/clean-egg-store.mjs --commit --i-have-a-backup
 *
 * Keeps: any StockBatch whose batchNumber starts with "EGG-XLS".
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup. Run infra/vps/backup.sh first."); process.exit(1); }

const KEEP_PREFIX = "EGG-XLS";
const num = (v) => Number(v ?? 0);

async function main() {
  console.log(`\n=== CLEAN JOKAS EGG STORE — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===\n`);
  const store = await prisma.warehouse.findFirst({ where: { type: "EGG_STORE", deletedAt: null }, select: { id: true, name: true, companyId: true } });
  if (!store) throw new Error("no EGG_STORE warehouse");
  const product = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, name: true, piecesPerUnit: true, uom: { select: { name: true } } } });
  if (!product) throw new Error('no egg product (sku "EG")');
  console.log(`store: ${store.name} (${store.id})`);
  console.log(`product: ${product.name}  unit: ${product.uom?.name}  piecesPerUnit: ${product.piecesPerUnit}`);
  // A crate is 30 eggs. With piecesPerUnit=1 the daily Egg Collection screen
  // (which submits a piece count) would credit pieces AS crates. Fix it so the
  // whole system treats 30 eggs = 1 crate consistently going forward.
  const EGGS_PER_CRATE = 30;
  const fixPiecesPerUnit = /crate/i.test(product.uom?.name ?? "") && product.piecesPerUnit !== EGGS_PER_CRATE;
  if (fixPiecesPerUnit) console.log(`  → will set piecesPerUnit = ${EGGS_PER_CRATE} (unit is "crate")`);
  console.log("");

  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: store.id, productId: product.id }, select: { id: true, quantityOnHand: true } });
  console.log(`InventoryItem on hand now: ${item ? num(item.quantityOnHand) : "(none)"}\n`);

  const batches = await prisma.stockBatch.findMany({
    where: { warehouseId: store.id, productId: product.id },
    select: { id: true, batchNumber: true, quantityReceived: true, quantityRemaining: true, status: true, deletedAt: true, createdAt: true, manufactureDate: true },
    orderBy: { createdAt: "asc" },
  });
  const keep = batches.filter((b) => b.batchNumber?.startsWith(KEEP_PREFIX) && !b.deletedAt);
  const drop = batches.filter((b) => !(b.batchNumber?.startsWith(KEEP_PREFIX)) && !b.deletedAt);

  console.log(`STOCK BATCHES (${batches.length} total, ${keep.length} keep, ${drop.length} to remove):`);
  for (const b of batches) {
    const tag = b.deletedAt ? "already-deleted" : b.batchNumber?.startsWith(KEEP_PREFIX) ? "KEEP" : "REMOVE";
    console.log(`  [${tag.padEnd(15)}] ${String(b.batchNumber).padEnd(20)} recv ${num(b.quantityReceived)}  remain ${num(b.quantityRemaining)}  status ${b.status}  ${b.createdAt.toISOString().slice(0, 10)}`);
  }

  const dropIds = drop.map((b) => b.id);
  const [moves, alerts, resv] = await Promise.all([
    prisma.stockMovement.count({ where: { OR: [{ stockBatchId: { in: dropIds } }, { productId: product.id, warehouseId: store.id, stockBatchId: null }] } }),
    dropIds.length ? prisma.stockExpiryAlert.count({ where: { stockBatchId: { in: dropIds } } }) : 0,
    dropIds.length ? prisma.stockReservation.count({ where: { stockBatchId: { in: dropIds } } }) : 0,
  ]);
  // movements for this product+store with NO stock batch (the old pre-FIFO credits)
  const orphanMoves = await prisma.stockMovement.findMany({
    where: { productId: product.id, warehouseId: store.id, stockBatchId: null, deletedAt: null },
    select: { id: true, movementType: true, quantity: true, referenceType: true, notes: true, createdAt: true },
    orderBy: { createdAt: "asc" }, take: 20,
  });
  console.log(`\nStockMovements tied to removed batches or with no batch: ${moves}`);
  orphanMoves.forEach((m) => console.log(`  (no batch) ${m.movementType}  qty ${num(m.quantity)}  ${m.referenceType ?? ""}  ${m.createdAt.toISOString().slice(0, 10)}  ${m.notes ?? ""}`));
  console.log(`StockExpiryAlerts on removed batches: ${alerts}`);
  console.log(`StockReservations on removed batches: ${resv}`);

  const survivingRemain = keep.reduce((s, b) => s + num(b.quantityRemaining), 0);
  const asPieces = Math.round(survivingRemain * EGGS_PER_CRATE);
  console.log(`\n=> after cleanup the Jokas Egg store holds the farm's cumulative egg production:`);
  console.log(`   ${survivingRemain} ${product.uom?.name}(s)  ≈ ${asPieces} eggs  (from ${keep.map((b) => b.batchNumber).join(", ") || "nothing"})`);

  if (!COMMIT) { console.log("\n(dry run — nothing written)\n"); await prisma.$disconnect(); return; }

  console.log("\n>>> COMMITTING\n");
  if (dropIds.length) {
    const a = await prisma.stockExpiryAlert.deleteMany({ where: { stockBatchId: { in: dropIds } } });
    const r = await prisma.stockReservation.deleteMany({ where: { stockBatchId: { in: dropIds } } });
    const mv = await prisma.stockMovement.deleteMany({ where: { stockBatchId: { in: dropIds } } });
    console.log(`  deleted expiry alerts ${a.count}, reservations ${r.count}, movements ${mv.count}`);
    const sb = await prisma.stockBatch.updateMany({ where: { id: { in: dropIds } }, data: { deletedAt: new Date(), status: "CONSUMED", quantityRemaining: 0 } });
    console.log(`  soft-deleted stock batches ${sb.count}`);
  }
  // remove old batch-less credit movements for this product+store too
  const om = await prisma.stockMovement.deleteMany({ where: { productId: product.id, warehouseId: store.id, stockBatchId: null } });
  console.log(`  deleted batch-less movements ${om.count}`);

  if (item) {
    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: survivingRemain } });
    console.log(`  set InventoryItem.quantityOnHand = ${survivingRemain}`);
  }
  if (fixPiecesPerUnit) {
    await prisma.product.update({ where: { id: product.id }, data: { piecesPerUnit: EGGS_PER_CRATE } });
    console.log(`  set ${product.name}.piecesPerUnit = ${EGGS_PER_CRATE}`);
  }
  console.log("\n>>> DONE\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
