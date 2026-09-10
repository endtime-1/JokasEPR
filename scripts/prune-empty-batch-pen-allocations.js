/**
 * One-time / occasional script: remove "zombie" BatchPenAllocation rows —
 * a batch still linked to a pen it has no birds left in.
 *
 * Background: BatchPenAllocation.birdCount is only ever incremented (initial
 * allocation + incoming transfers). Outgoing transfers, mortality and pen
 * recounts are applied at READ time everywhere else, and the allocation row
 * is never deleted when a pen is fully vacated. So a batch that had birds
 * transferred into a pen and then straight back out keeps a row there with a
 * positive stored birdCount, and shows as "kept in that house" forever.
 *
 * The read paths were fixed to net these out (poultry.service.ts —
 * getBatch's adjustedAllocations filter, options()'s netAllocations), so
 * this is no longer strictly necessary for correctness — but it physically
 * clears the leftover rows so nothing that reads raw birdCount is misled.
 *
 * NET birds in a pen = stored birdCount
 *                      - non-cancelled outgoing transfers out of that pen
 *                      - pen-scoped mortality
 *                      + pen-scoped recount adjustments
 * A row whose net is <= 0 for an ACTIVE / PLANNED batch is a zombie.
 *
 * Usage (from the app root, DATABASE_URL in the environment):
 *   node scripts/prune-empty-batch-pen-allocations.js            # report only
 *   node scripts/prune-empty-batch-pen-allocations.js --apply    # delete them
 *
 * Safe to re-run. Only ever touches rows that currently net to <= 0.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const allocations = await prisma.batchPenAllocation.findMany({
    where: {
      birdCount: { gt: 0 },
      flockBatch: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] } },
    },
    select: {
      id: true,
      penId: true,
      poultryHouseId: true,
      birdCount: true,
      flockBatchId: true,
      flockBatch: { select: { code: true } },
      pen: { select: { code: true } },
      poultryHouse: { select: { code: true } },
    },
  });

  const zombies = [];
  for (const a of allocations) {
    const [outgoing, mortality, adjustments] = await Promise.all([
      prisma.poultryTransferRecord.aggregate({
        where: { flockBatchId: a.flockBatchId, fromPenId: a.penId, deletedAt: null, status: { not: "CANCELLED" } },
        _sum: { birdCount: true },
      }),
      prisma.mortalityRecord.aggregate({
        where: { flockBatchId: a.flockBatchId, penId: a.penId, deletedAt: null },
        _sum: { birdCount: true },
      }),
      prisma.poultryCountAdjustment.aggregate({
        where: { flockBatchId: a.flockBatchId, penId: a.penId, deletedAt: null },
        _sum: { delta: true },
      }),
    ]);
    const net =
      a.birdCount -
      (outgoing._sum.birdCount ?? 0) -
      (mortality._sum.birdCount ?? 0) +
      (adjustments._sum.delta ?? 0);
    if (net <= 0) zombies.push({ ...a, net });
  }

  if (zombies.length === 0) {
    console.log("No empty (net <= 0) batch/pen allocations found — nothing to do.");
    return;
  }

  console.log(`Found ${zombies.length} empty batch/pen allocation(s):\n`);
  for (const z of zombies) {
    console.log(
      `  batch ${z.flockBatch.code}  ·  house ${z.poultryHouse.code} / pen ${z.pen.code}  ` +
        `·  stored ${z.birdCount}, net ${z.net}`
    );
  }

  if (!APPLY) {
    console.log(`\nReport only. Re-run with --apply to delete these ${zombies.length} row(s).`);
    return;
  }

  const result = await prisma.batchPenAllocation.deleteMany({ where: { id: { in: zombies.map((z) => z.id) } } });
  console.log(`\nDeleted ${result.count} empty allocation row(s).`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
