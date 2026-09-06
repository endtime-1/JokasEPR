// READ-ONLY post-import check. Writes nothing.
//   cd /opt/jokas/app && set -a; . ./.env; set +a
//   node packages/db/scripts/verify-poultry-import.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";

async function main() {
  for (const code of ["001", "002"]) {
    const b = await prisma.flockBatch.findFirst({ where: { companyId: COMPANY, code }, select: { id: true, name: true, birdType: true, startDate: true, openingBirdCount: true } });
    const [mort, culls, eggAgg, transfers, adj, meds, vaccs, feed, allocs] = await Promise.all([
      prisma.mortalityRecord.aggregate({ where: { flockBatchId: b.id, deletedAt: null, isCulling: false }, _sum: { birdCount: true }, _count: true }),
      prisma.mortalityRecord.aggregate({ where: { flockBatchId: b.id, deletedAt: null, isCulling: true }, _sum: { birdCount: true }, _count: true }),
      prisma.eggProductionRecord.aggregate({ where: { flockBatchId: b.id, deletedAt: null }, _sum: { goodEggs: true }, _count: true }),
      prisma.poultryTransferRecord.count({ where: { flockBatchId: b.id, deletedAt: null } }),
      prisma.poultryCountAdjustment.aggregate({ where: { flockBatchId: b.id, deletedAt: null }, _sum: { delta: true }, _count: true }),
      prisma.medicationRecord.count({ where: { flockBatchId: b.id, deletedAt: null } }),
      prisma.vaccinationRecord.count({ where: { flockBatchId: b.id, deletedAt: null } }),
      prisma.feedConsumptionRecord.aggregate({ where: { flockBatchId: b.id, deletedAt: null }, _sum: { quantityKg: true }, _count: true }),
      prisma.batchPenAllocation.findMany({ where: { flockBatchId: b.id }, select: { penId: true, poultryHouseId: true, birdCount: true } }),
    ]);
    const outByPen = new Map();
    for (const t of await prisma.poultryTransferRecord.findMany({ where: { flockBatchId: b.id, deletedAt: null, status: { not: "CANCELLED" } }, select: { fromPenId: true, birdCount: true } }))
      outByPen.set(t.fromPenId, (outByPen.get(t.fromPenId) || 0) + t.birdCount);
    const mortByPen = new Map();
    for (const m of await prisma.mortalityRecord.groupBy({ by: ["penId"], where: { flockBatchId: b.id, deletedAt: null }, _sum: { birdCount: true } }))
      mortByPen.set(m.penId, m._sum.birdCount || 0);
    const adjByPen = new Map();
    for (const a of await prisma.poultryCountAdjustment.groupBy({ by: ["penId"], where: { flockBatchId: b.id, deletedAt: null }, _sum: { delta: true } }))
      adjByPen.set(a.penId, a._sum.delta || 0);

    let live = 0;
    for (const al of allocs) live += Math.max(0, al.birdCount - (mortByPen.get(al.penId) || 0) - (outByPen.get(al.penId) || 0) + (adjByPen.get(al.penId) || 0));

    console.log(`\n=== ${b.name} (${code}) ===`);
    console.log(`  birdType ${b.birdType}   start ${b.startDate.toISOString().slice(0, 10)}   opening ${b.openingBirdCount}`);
    console.log(`  mortality  ${mort._count} rows / ${mort._sum.birdCount ?? 0} birds`);
    console.log(`  culls      ${culls._count} rows / ${culls._sum.birdCount ?? 0} birds`);
    console.log(`  eggs       ${eggAgg._count} rows / ${eggAgg._sum.goodEggs ?? 0} pieces`);
    console.log(`  transfers  ${transfers}`);
    console.log(`  recount adj ${adj._count} rows / net ${adj._sum.delta ?? 0}`);
    console.log(`  medication ${meds}   vaccination ${vaccs}`);
    console.log(`  feed (KEPT) ${feed._count} rows / ${Number(feed._sum.quantityKg ?? 0)} kg`);
    console.log(`  >>> LIVE BIRDS NOW: ${live}`);
  }

  const eggStore = await prisma.warehouse.findFirst({ where: { type: "EGG_STORE", deletedAt: null }, select: { id: true, name: true } });
  const eggProd = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, uom: { select: { name: true } } } });
  const item = await prisma.inventoryItem.findFirst({ where: { warehouseId: eggStore.id, productId: eggProd.id }, select: { quantityOnHand: true } });
  const sb = await prisma.stockBatch.findMany({ where: { warehouseId: eggStore.id, productId: eggProd.id, deletedAt: null }, select: { batchNumber: true, quantityRemaining: true } });
  console.log(`\n=== ${eggStore.name} ===`);
  console.log(`  on hand: ${Number(item?.quantityOnHand ?? 0)} ${eggProd.uom.name}(s)`);
  sb.forEach((x) => console.log(`  stock batch ${x.batchNumber}: ${Number(x.quantityRemaining)}`));
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
