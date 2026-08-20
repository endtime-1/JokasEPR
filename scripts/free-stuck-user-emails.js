/**
 * One-time script: free up User emails stuck behind deleted accounts.
 *
 * Background: the (companyId, email) unique index on User isn't
 * deletedAt-aware. Before the fix in identity.service.ts (2026-08-19),
 * deleting a user only set deletedAt — the email stayed in place and
 * permanently blocked reuse, even though the account was invisible
 * everywhere else. This renames every already-deleted user's email so
 * the original email becomes available again. Safe to re-run — it only
 * touches rows that are still holding their original (un-suffixed) email.
 *
 * Run on Hostinger via SSH from the app root:
 *   node scripts/free-stuck-user-emails.js
 *
 * Requires DATABASE_URL to be set in the environment — over plain SSH
 * (not the Passenger-managed process) load it first:
 *   set -a; source .env; set +a
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.user.findMany({
    where: { deletedAt: { not: null }, email: { not: { contains: "__deleted_" } } },
    select: { id: true, email: true, companyId: true, deletedAt: true },
  });

  if (stuck.length === 0) {
    console.log("No stuck emails found — nothing to do.");
    return;
  }

  console.log(`Found ${stuck.length} deleted user(s) still holding their original email:\n`);

  for (const user of stuck) {
    const newEmail = `${user.email}__deleted_${user.id}`;
    await prisma.user.update({ where: { id: user.id }, data: { email: newEmail } });
    console.log(`  ${user.email}  ->  ${newEmail}  (company ${user.companyId}, deleted ${user.deletedAt.toISOString()})`);
  }

  console.log(`\nDone. ${stuck.length} email(s) freed for reuse.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
