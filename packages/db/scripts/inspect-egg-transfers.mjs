/*
 * Read-only: every stock transfer that involves the Eggs product — number,
 * date, quantity as stored, route, status. Use it to see whether the egg
 * store's on-hand has been over-drained by the old pieces-vs-crates form bug.
 *
 *   node packages/db/scripts/inspect-egg-transfers.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const prod = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true } });
  const rows = await prisma.stockTransfer.findMany({
    where: { productId: prod.id, deletedAt: null },
    orderBy: { transferDate: "asc" },
    select: {
      transferNumber: true, transferDate: true, quantity: true, receivedQuantity: true, status: true,
      fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } },
    },
  });
  console.log(`\n=== Egg stock transfers (${rows.length}) ===\n`);
  let total = 0;
  for (const r of rows) {
    total += Number(r.quantity);
    console.log(`  ${r.transferNumber}  ${r.transferDate.toISOString().slice(0, 10)}  qty ${String(Number(r.quantity)).padStart(9)}  ${r.status.padEnd(16)}  ${r.fromWarehouse.name} -> ${r.toWarehouse.name}`);
  }
  console.log(`\n  total quantity moved out per the records: ${total} crates`);
  console.log(`  (egg store received 1702.9 crates in one batch; if these transfers`);
  console.log(`   look 30x too big, they were entered as pieces on the old form)\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
