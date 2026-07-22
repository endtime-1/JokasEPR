/**
 * One-time script: delete all poultry operational data while keeping
 * PoultryHouse and Pen structure intact.
 *
 * Run on Hostinger via SSH from the app root:
 *   node scripts/clear-poultry-data.js
 *
 * Requires DATABASE_URL to be set in the environment (already set on Hostinger).
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting poultry data clear...\n");

  // Delete all child records in parallel (they reference FlockBatch / Pen but not each other)
  const [
    bpa, daily, mortality, feed, eggs, weight,
    meds, vaccines, transfers, health, costs,
  ] = await Promise.all([
    prisma.batchPenAllocation.deleteMany({}),
    prisma.dailyPoultryRecord.deleteMany({}),
    prisma.mortalityRecord.deleteMany({}),
    prisma.feedConsumptionRecord.deleteMany({}),
    prisma.eggProductionRecord.deleteMany({}),
    prisma.birdWeightRecord.deleteMany({}),
    prisma.medicationRecord.deleteMany({}),
    prisma.vaccinationRecord.deleteMany({}),
    prisma.poultryTransferRecord.deleteMany({}),
    prisma.poultryHealthObservation.deleteMany({}),
    prisma.poultryCostRecord.deleteMany({}),
  ]);

  console.log(`  BatchPenAllocation        deleted: ${bpa.count}`);
  console.log(`  DailyPoultryRecord        deleted: ${daily.count}`);
  console.log(`  MortalityRecord           deleted: ${mortality.count}`);
  console.log(`  FeedConsumptionRecord     deleted: ${feed.count}`);
  console.log(`  EggProductionRecord       deleted: ${eggs.count}`);
  console.log(`  BirdWeightRecord          deleted: ${weight.count}`);
  console.log(`  MedicationRecord          deleted: ${meds.count}`);
  console.log(`  VaccinationRecord         deleted: ${vaccines.count}`);
  console.log(`  PoultryTransferRecord     deleted: ${transfers.count}`);
  console.log(`  PoultryHealthObservation  deleted: ${health.count}`);
  console.log(`  PoultryCostRecord         deleted: ${costs.count}`);

  // Now safe to delete the parent batches
  const batches = await prisma.flockBatch.deleteMany({});
  console.log(`  FlockBatch                deleted: ${batches.count}`);

  console.log("\nDone. Houses and pens are untouched.");
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
