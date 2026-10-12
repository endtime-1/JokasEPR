/*
 * Read-only: for every PENDING_APPROVAL stock transfer, replay what Approve
 * would do — find the source inventory item the same way the API does, then
 * check whether the AVAILABLE batches *linked to that item* can cover the
 * quantity. Also flags duplicate inventory items for the same warehouse+product
 * (batches hanging off a different item than the one Approve picks would make
 * Approve fail even though the store total looks fine).
 *
 *   set -a; . ./.env; set +a
 *   node packages/db/scripts/inspect-pending-transfers.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const r = (n) => Math.round(Number(n) * 10000) / 10000;

async function main() {
  const pending = await prisma.stockTransfer.findMany({
    where: { status: "PENDING_APPROVAL", deletedAt: null },
    include: { product: { select: { sku: true, name: true } }, fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n${pending.length} pending transfer(s)\n`);
  for (const t of pending) {
    console.log(`=== ${t.transferNumber}  ${t.product.sku}  qty ${r(t.quantity)}   ${t.fromWarehouse.name} -> ${t.toWarehouse.name}`);
    const items = await prisma.inventoryItem.findMany({
      where: { companyId: t.companyId, warehouseId: t.fromWarehouseId, productId: t.productId },
      select: { id: true, quantityOnHand: true, deletedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`  inventory items for this warehouse+product: ${items.length}`);
    for (const it of items) {
      const live = await prisma.stockBatch.findMany({ where: { inventoryItemId: it.id, deletedAt: null, quantityRemaining: { gt: 0 } }, select: { quantityRemaining: true, status: true } });
      const usable = live.filter((b) => b.status === "AVAILABLE").reduce((s, b) => s + Number(b.quantityRemaining), 0);
      const held = live.filter((b) => b.status !== "AVAILABLE").reduce((s, b) => s + Number(b.quantityRemaining), 0);
      console.log(`     item ${it.id.slice(0, 8)}  on hand ${r(it.quantityOnHand)}  usable batches ${r(usable)}  held ${r(held)}  ${it.deletedAt ? "RETIRED" : "ACTIVE"}`);
    }
    const active = items.find((i) => !i.deletedAt);
    if (!active) { console.log("  !! no active item — Approve says 'Inventory item was not found'\n"); continue; }
    const usable = (await prisma.stockBatch.findMany({ where: { inventoryItemId: active.id, deletedAt: null, quantityRemaining: { gt: 0 }, status: "AVAILABLE" }, select: { quantityRemaining: true } })).reduce((s, b) => s + Number(b.quantityRemaining), 0);
    const orphan = await prisma.stockBatch.aggregate({ where: { warehouseId: t.fromWarehouseId, productId: t.productId, deletedAt: null, quantityRemaining: { gt: 0 }, NOT: { inventoryItemId: active.id } }, _sum: { quantityRemaining: true }, _count: true });
    console.log(`  Approve uses item ${active.id.slice(0, 8)}: usable ${r(usable)} vs needed ${r(t.quantity)} -> ${usable + 1e-9 >= Number(t.quantity) ? "OK" : "SHORT by " + r(Number(t.quantity) - usable)}`);
    if (orphan._count) console.log(`  !! ${orphan._count} batch(es) holding ${r(orphan._sum.quantityRemaining ?? 0)} are NOT linked to that item`);
    console.log();
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
