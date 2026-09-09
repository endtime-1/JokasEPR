/*
 * Read-only: prints exactly what the executive dashboard's Poultry egg cards
 * and Inventory store cards are computed from — so we can see why "to date"
 * and "selected period" match, and which warehouse each Inventory card is.
 *
 *   node packages/db/scripts/inspect-dashboard-numbers.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const n = (v) => Number(v ?? 0);
const eggSum = (s) => n(s?.goodEggs) + n(s?.crackedEggs) + n(s?.dirtyEggs) + n(s?.brokenEggs) + n(s?.rejectedEggs);
const F = { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true };

async function main() {
  const now = new Date();
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const monday = new Date(now); monday.setUTCDate(monday.getUTCDate() - mondayOffset); monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6); sunday.setUTCHours(23, 59, 59, 999);
  const d30 = new Date(now); d30.setUTCDate(d30.getUTCDate() - 29); d30.setUTCHours(0, 0, 0, 0);

  console.log(`\n=== EGG PRODUCTION (eggProductionRecord, companyId scoped, no farm filter) ===`);
  const lifetime = await prisma.eggProductionRecord.aggregate({ where: { companyId: COMPANY, deletedAt: null }, _sum: F });
  const week = await prisma.eggProductionRecord.aggregate({ where: { companyId: COMPANY, deletedAt: null, recordDate: { gte: monday, lte: sunday } }, _sum: F });
  const last30 = await prisma.eggProductionRecord.aggregate({ where: { companyId: COMPANY, deletedAt: null, recordDate: { gte: d30, lte: now } }, _sum: F });
  const cnt = await prisma.eggProductionRecord.count({ where: { companyId: COMPANY, deletedAt: null } });
  const range = await prisma.eggProductionRecord.aggregate({ where: { companyId: COMPANY, deletedAt: null }, _min: { recordDate: true }, _max: { recordDate: true } });
  console.log(`  records: ${cnt}   dates ${range._min.recordDate?.toISOString().slice(0,10)} .. ${range._max.recordDate?.toISOString().slice(0,10)}`);
  console.log(`  to date (lifetime):        ${eggSum(lifetime._sum)} eggs`);
  console.log(`  this week (${monday.toISOString().slice(0,10)}..${sunday.toISOString().slice(0,10)}): ${eggSum(week._sum)} eggs`);
  console.log(`  selected period (last 30d, ${d30.toISOString().slice(0,10)}..today): ${eggSum(last30._sum)} eggs`);

  console.log(`\n=== FEED_STORE / EGG_STORE warehouses (what the Inventory section lists) ===`);
  const stores = await prisma.warehouse.findMany({
    where: { companyId: COMPANY, deletedAt: null, status: "ACTIVE", type: { in: ["FEED_STORE", "EGG_STORE"] } },
    select: { id: true, name: true, code: true, type: true, farm: { select: { name: true } }, branch: { select: { name: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  for (const w of stores) {
    const qa = await prisma.inventoryItem.aggregate({ where: { warehouseId: w.id, deletedAt: null }, _sum: { quantityOnHand: true } });
    const items = await prisma.inventoryItem.findMany({ where: { warehouseId: w.id, deletedAt: null }, select: { quantityOnHand: true, product: { select: { sku: true, name: true } } } });
    console.log(`\n  ${w.name}  [${w.code}]  ${w.type}   farm=${w.farm?.name ?? "—"}   branch=${w.branch?.name ?? "—"}`);
    console.log(`     id: ${w.id}`);
    console.log(`     card value = Σ quantityOnHand = ${n(qa._sum.quantityOnHand)}`);
    for (const it of items) console.log(`        ${it.product?.sku ?? "?"} ${it.product?.name ?? ""}: ${n(it.quantityOnHand)}`);
  }
  console.log();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
