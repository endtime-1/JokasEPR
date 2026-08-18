/**
 * One-time script: free up FlockBatch codes stuck behind deleted rows.
 *
 * Background: the (companyId, code) unique index on FlockBatch isn't
 * deletedAt-aware. Before the fix in poultry.service.ts (2026-08-18),
 * deleting a batch only set deletedAt — the code stayed in place and
 * permanently blocked reuse, even though the batch was invisible
 * everywhere else. This renames every already-deleted batch's code so
 * the original code becomes available again. Safe to re-run — it only
 * touches rows that are still holding their original code.
 *
 * Run on Hostinger via SSH from the app root:
 *   node scripts/free-stuck-flockbatch-codes.js
 *
 * Requires DATABASE_URL to be set in the environment (already set on Hostinger).
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.flockBatch.findMany({
    where: { deletedAt: { not: null }, code: { not: { contains: "__deleted_" } } },
    select: { id: true, code: true, companyId: true, deletedAt: true },
  });

  if (stuck.length === 0) {
    console.log("No stuck codes found — nothing to do.");
    return;
  }

  console.log(`Found ${stuck.length} deleted batch(es) still holding their original code:\n`);

  for (const batch of stuck) {
    const newCode = `${batch.code}__deleted_${batch.id}`;
    await prisma.flockBatch.update({ where: { id: batch.id }, data: { code: newCode } });
    console.log(`  ${batch.code}  ->  ${newCode}  (company ${batch.companyId}, deleted ${batch.deletedAt.toISOString()})`);
  }

  console.log(`\nDone. ${stuck.length} code(s) freed for reuse.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
