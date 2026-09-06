// READ-ONLY. Dumps the current poultry / farm / egg-store state so the
// Excel import can be built against real IDs. Writes nothing.
//
//   cd /opt/jokas/app
//   set -a; . ./.env; set +a
//   node packages/db/scripts/inspect-poultry-state.mjs
//
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const j = (o) => JSON.stringify(o, null, 1);

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log("=== COMPANIES ===\n" + j(companies));

  const farms = await prisma.farm.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, companyId: true, branchId: true },
  });
  console.log("\n=== FARMS ===\n" + j(farms));

  const houses = await prisma.poultryHouse.findMany({
    where: { deletedAt: null },
    select: {
      id: true, code: true, name: true, farmId: true, companyId: true, branchId: true,
      pens: { where: { deletedAt: null }, select: { id: true, code: true, name: true, penNumber: true, isActive: true, capacity: true }, orderBy: { penNumber: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  console.log("\n=== POULTRY HOUSES (+pens) ===\n" + j(houses));

  const batches = await prisma.flockBatch.findMany({
    where: { deletedAt: null },
    select: {
      id: true, code: true, name: true, birdType: true, openingBirdCount: true,
      startDate: true, status: true, farmId: true, poultryHouseId: true, companyId: true, branchId: true, notes: true,
      _count: {
        select: {
          mortalityRecords: true, eggProductionRecords: true, feedConsumptionRecords: true,
          birdWeightRecords: true, medicationRecords: true, vaccinationRecords: true,
          poultryTransferRecords: true, healthObservations: true, dailyRecords: true,
          costRecords: true, countAdjustments: true, penAllocations: true,
        },
      },
      penAllocations: { select: { penId: true, poultryHouseId: true, birdCount: true } },
    },
    orderBy: { startDate: "asc" },
  });
  console.log("\n=== FLOCK BATCHES (+record counts, +pen allocations) ===\n" + j(batches));

  const warehouses = await prisma.warehouse.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, type: true, farmId: true, productionSiteId: true, status: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  console.log("\n=== WAREHOUSES ===\n" + j(warehouses));

  const eggish = await prisma.product.findMany({
    where: { OR: [{ name: { contains: "egg" } }, { name: { contains: "Egg" } }, { sku: { contains: "EGG" } }] },
    select: { id: true, sku: true, name: true, type: true, uomId: true, piecesPerUnit: true, uom: { select: { code: true, name: true } } },
  });
  console.log("\n=== EGG-ish PRODUCTS ===\n" + j(eggish));

  // sample of existing records in each batch so we can see what "test data" looks like
  for (const b of batches) {
    const [mort, eggs, tr, med] = await Promise.all([
      prisma.mortalityRecord.findMany({ where: { flockBatchId: b.id, deletedAt: null }, select: { recordDate: true, birdCount: true, isCulling: true, poultryHouseId: true, penId: true }, orderBy: { recordDate: "asc" }, take: 5 }),
      prisma.eggProductionRecord.findMany({ where: { flockBatchId: b.id, deletedAt: null }, select: { recordDate: true, goodEggs: true, poultryHouseId: true, penId: true }, orderBy: { recordDate: "asc" }, take: 5 }),
      prisma.poultryTransferRecord.findMany({ where: { flockBatchId: b.id, deletedAt: null }, select: { transferDate: true, birdCount: true, status: true, fromPoultryHouseId: true, toPoultryHouseId: true, isFullBatchRelocation: true }, orderBy: { transferDate: "asc" }, take: 5 }),
      prisma.medicationRecord.findMany({ where: { flockBatchId: b.id, deletedAt: null }, select: { medicationName: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" }, take: 5 }),
    ]);
    console.log(`\n--- batch ${b.code} (${b.name}) sample records ---`);
    console.log("  mortality[:5]  " + j(mort));
    console.log("  eggs[:5]       " + j(eggs));
    console.log("  transfers[:5]  " + j(tr));
    console.log("  medication[:5] " + j(med));

    // any egg stock already credited from this batch?
    const eggMoves = await prisma.stockMovement.findMany({
      where: { referenceType: "EggProductionRecord", referenceId: { in: (await prisma.eggProductionRecord.findMany({ where: { flockBatchId: b.id }, select: { id: true } })).map((r) => r.id) } },
      select: { quantity: true, toWarehouseId: true, createdAt: true },
      take: 5,
    });
    console.log("  egg stockMovements[:5] " + j(eggMoves));
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
