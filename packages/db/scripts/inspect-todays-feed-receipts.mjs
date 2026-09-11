// READ-ONLY. Shows every FeedReceiptRecord (feed-store stock-in) created
// today, plus the matching StockMovement/StockBatch rows, so a receipt the
// owner doesn't recognize can be traced to who/what created it and why.
//
//   cd /opt/jokas/app && set -a; . ./.env; set +a
//   node packages/db/scripts/inspect-todays-feed-receipts.mjs [--since=YYYY-MM-DD]
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const n = (v) => Math.round(Number(v ?? 0) * 10000) / 10000;

const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const since = sinceArg ? new Date(sinceArg.split("=")[1] + "T00:00:00.000Z") : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

async function main() {
  console.log(`\n=== FeedReceiptRecord created since ${since.toISOString()} ===\n`);
  const receipts = await prisma.feedReceiptRecord.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      feedProduct: { select: { name: true, sku: true, feedForm: true } },
      warehouse: { select: { name: true, code: true, type: true } },
      feedInternalTransfer: { select: { id: true, status: true } },
    },
  });
  if (receipts.length === 0) console.log("  (none)");
  let total = 0;
  for (const r of receipts) {
    total += Number(r.quantityKg);
    console.log(
      `  [${r.createdAt.toISOString()}] ${r.feedProduct.name} (${r.feedProduct.feedForm ?? "-"})  ` +
        `${n(r.quantityKg)} kg -> ${r.warehouse.name}\n` +
        `      sourceType=${r.sourceType}  supplier=${r.supplierName ?? "-"}  billRef=${r.billReference ?? "-"}\n` +
        `      createdById=${r.createdById ?? "-"}  status=${r.status}  feedInternalTransferId=${r.feedInternalTransferId ?? "-"}\n` +
        `      notes=${r.notes ?? "-"}`
    );
  }
  console.log(`\n  TOTAL: ${n(total)} kg across ${receipts.length} receipt(s)`);

  const creatorIds = [...new Set(receipts.map((r) => r.createdById).filter(Boolean))];
  if (creatorIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, fullName: true, email: true } });
    console.log("\n=== Creators ===");
    for (const u of users) console.log(`  ${u.id}  ${u.fullName}  <${u.email}>`);
  }

  console.log(`\n=== StockMovement rows referencing FeedReceiptRecord, created since ${since.toISOString()} ===\n`);
  const movements = await prisma.stockMovement.findMany({
    where: { referenceType: "FeedReceiptRecord", createdAt: { gte: since }, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { product: { select: { name: true } }, toWarehouse: { select: { name: true } } },
  });
  if (movements.length === 0) console.log("  (none)");
  for (const m of movements) {
    console.log(`  [${m.createdAt.toISOString()}] ${m.movementType}  ${m.product.name}  ${n(m.quantity)} kg  -> ${m.toWarehouse?.name ?? "-"}  refId=${m.referenceId}`);
  }

  console.log(`\n=== StockBatch rows created since ${since.toISOString()} for feed products ===\n`);
  const batches = await prisma.stockBatch.findMany({
    where: { createdAt: { gte: since }, deletedAt: null, product: { feedForm: { not: null } } },
    orderBy: { createdAt: "asc" },
    include: { product: { select: { name: true, feedForm: true } }, warehouse: { select: { name: true } } },
  });
  if (batches.length === 0) console.log("  (none)");
  for (const b of batches) {
    console.log(`  [${b.createdAt.toISOString()}] batch=${b.batchNumber}  ${b.product.name} (${b.product.feedForm})  received=${n(b.quantityReceived)}  remaining=${n(b.quantityRemaining)}  -> ${b.warehouse.name}  createdById=${b.createdById ?? "-"}`);
  }

  const batchCreatorIds = [...new Set(batches.map((b) => b.createdById).filter(Boolean))];
  if (batchCreatorIds.length) {
    const users = await prisma.user.findMany({ where: { id: { in: batchCreatorIds } }, select: { id: true, fullName: true, email: true, roles: { select: { role: { select: { name: true } } } } } });
    console.log("\n=== StockBatch creators ===");
    for (const u of users) console.log(`  ${u.id}  ${u.fullName}  <${u.email}>  roles=${u.roles.map((r) => r.role.name).join(",") || "-"}`);
  }
  console.log();
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
