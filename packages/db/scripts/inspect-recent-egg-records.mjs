/*
 * Read-only: the most recent egg-production records and whether each one
 * actually credited a stock movement (i.e. reached the Jokas Egg store).
 *
 *   node packages/db/scripts/inspect-recent-egg-records.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";

async function main() {
  const recs = await prisma.eggProductionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null },
    orderBy: { recordDate: "desc" },
    take: 25,
    select: {
      id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true,
      warehouseId: true, eggProductId: true, status: true, penId: true, poultryHouseId: true, createdAt: true,
    },
  });
  const ids = recs.map((r) => r.id);
  const moved = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "EggProductionRecord", referenceId: { in: ids }, deletedAt: null },
    select: { referenceId: true },
  })).map((m) => m.referenceId));

  console.log(`\n=== last ${recs.length} egg-production records ===\n`);
  for (const r of recs) {
    const pieces = r.goodEggs + r.crackedEggs + r.dirtyEggs + r.brokenEggs + r.rejectedEggs;
    console.log(`  ${r.recordDate.toISOString().slice(0, 10)}  ${String(pieces).padStart(6)} eggs  good=${r.goodEggs}  ${r.status.padEnd(10)}  wh=${r.warehouseId ? "set" : "—  "}  eggProd=${r.eggProductId ? "set" : "—  "}  credited=${moved.has(r.id) ? "YES" : "NO"}   (entered ${r.createdAt.toISOString().slice(0, 16)})`);
  }
  console.log(`\n  "credited=NO" + "wh=—" or "eggProd=—"  => the form didn't attach the store/product, so it logged but never moved stock.`);
  console.log(`  Fix: rebuild-egg-store-daily.mjs recomputes the store from every record regardless.\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
