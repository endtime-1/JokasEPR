// READ-ONLY. Dumps feed products, the farm feed store(s), and what's currently
// recorded as feed received / consumed / on hand — so the QuickBooks feed
// import can be built against real product IDs. Writes nothing.
//
//   cd /opt/jokas/app && set -a; . ./.env; set +a
//   node packages/db/scripts/inspect-feed-state.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const j = (o) => JSON.stringify(o, null, 1);
const n = (v) => Number(v ?? 0);

async function main() {
  const feedStores = await prisma.warehouse.findMany({
    where: { type: "FEED_STORE", deletedAt: null },
    select: { id: true, code: true, name: true, farmId: true, productionSiteId: true, status: true },
  });
  console.log("=== FEED_STORE WAREHOUSES ===\n" + j(feedStores));

  const feedProducts = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, type: true, status: true, feedForm: true, deletedAt: true, uom: { select: { code: true, name: true } } },
    orderBy: { name: "asc" },
  });
  console.log(`\n=== ALL PRODUCTS (${feedProducts.length}) ===`);
  for (const p of feedProducts) {
    console.log(`  ${(p.name || "").padEnd(28)} sku=${(p.sku || "").padEnd(14)} ${p.type.padEnd(13)} form=${p.feedForm ?? "-"}  ${p.deletedAt ? "DELETED" : p.status}`);
  }

  for (const w of feedStores) {
    const items = await prisma.inventoryItem.findMany({
      where: { warehouseId: w.id, deletedAt: null },
      select: { productId: true, quantityOnHand: true, product: { select: { name: true, sku: true } } },
    });
    console.log(`\n=== ${w.name} — inventory on hand ===\n` + j(items.map((i) => ({ product: i.product.name, sku: i.product.sku, onHand: n(i.quantityOnHand) }))));
  }

  const rcpt = await prisma.feedReceiptRecord.groupBy({
    by: ["feedProductId", "warehouseId"], where: { deletedAt: null }, _sum: { quantityKg: true, totalCost: true }, _count: true,
  });
  console.log("\n=== FeedReceiptRecord totals (by product/warehouse) ===");
  for (const r of rcpt) {
    const p = await prisma.product.findFirst({ where: { id: r.feedProductId }, select: { name: true } });
    console.log(`  ${(p?.name ?? r.feedProductId).padEnd(40)} wh=${r.warehouseId}  ${r._count} rows  ${n(r._sum.quantityKg)} kg  GHS ${n(r._sum.totalCost)}`);
  }

  const cons = await prisma.feedConsumptionRecord.groupBy({
    by: ["flockBatchId"], where: { deletedAt: null }, _sum: { quantityKg: true }, _count: true,
  });
  console.log("\n=== FeedConsumptionRecord totals (by batch) ===");
  for (const r of cons) {
    const b = await prisma.flockBatch.findFirst({ where: { id: r.flockBatchId }, select: { code: true, name: true } });
    console.log(`  ${(b ? `${b.code} ${b.name}` : r.flockBatchId).padEnd(30)} ${r._count} rows  ${n(r._sum.quantityKg)} kg`);
  }

  const uoms = await prisma.unitOfMeasure.findMany({ select: { id: true, code: true, name: true } });
  console.log("\n=== UNITS OF MEASURE ===\n" + j(uoms));
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
