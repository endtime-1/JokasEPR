/**
 * One-time script: free up unique fields stuck behind deleted rows.
 *
 * Background: several Prisma models use soft-delete (deletedAt) alongside a
 * @@unique([companyId, someField]) constraint. MySQL/Prisma's @@unique isn't
 * deletedAt-aware, so before each model's delete method was fixed (see the
 * git history around 2026-08-18 to 2026-08-20 for poultry.service.ts,
 * identity.service.ts, and the batch of fixes across every other module),
 * soft-deleting a row left its unique field's old value permanently "in
 * use" — recreating a new active row with that same value failed forever
 * with a unique-constraint error, even though the old row was invisible
 * everywhere in the UI.
 *
 * This script renames every already-deleted row's stuck field (for every
 * model/field pair below) so the original value becomes available again.
 * Safe to re-run — it only touches rows that are still holding their
 * original (un-suffixed) value.
 *
 * Run on Hostinger via SSH from the app root:
 *   node scripts/free-stuck-unique-fields.js
 *
 * Requires DATABASE_URL to be set in the environment — over plain SSH
 * (not the Passenger-managed process) load it first:
 *   set -a; source .env; set +a
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// One row per model/field pair guarded by a deletedAt-unaware @@unique
// constraint. `model` is the exact camelCase Prisma client accessor name —
// verified against packages/db/prisma/schema.prisma.
const TARGETS = [
  { model: "employee", field: "code" },
  { model: "supplier", field: "code" },
  { model: "branch", field: "code" },
  { model: "farm", field: "code" },
  { model: "warehouse", field: "code" },
  { model: "productionSite", field: "code" },
  { model: "department", field: "code" },
  { model: "poultryHouse", field: "code" },
  { model: "machine", field: "code" },
  { model: "equipment", field: "code" },
  { model: "customer", field: "code" },
  { model: "customerGroup", field: "code" },
  { model: "warehouseLocation", field: "code" },
  { model: "feedFormula", field: "code" },
  { model: "account", field: "code" },
  { model: "expenseCategory", field: "code" },
  { model: "product", field: "sku" },
  { model: "productCategory", field: "code" },
  { model: "unitOfMeasure", field: "code" },
  { model: "qualityCheckTemplate", field: "code" },
  { model: "role", field: "name" },
  { model: "trainingCourse", field: "code" },
];

async function main() {
  let total = 0;

  for (const { model, field } of TARGETS) {
    const stuck = await prisma[model].findMany({
      where: { deletedAt: { not: null }, [field]: { not: { contains: "__deleted_" } } },
      select: { id: true, [field]: true, companyId: true, deletedAt: true },
    });

    if (stuck.length === 0) {
      console.log(`${model}.${field}: nothing stuck.`);
      continue;
    }

    console.log(`${model}.${field}: ${stuck.length} deleted row(s) still holding their original value:`);
    for (const row of stuck) {
      const oldValue = row[field];
      const newValue = `${oldValue}__deleted_${row.id}`;
      await prisma[model].update({ where: { id: row.id }, data: { [field]: newValue } });
      console.log(`  ${oldValue}  ->  ${newValue}  (company ${row.companyId}, deleted ${row.deletedAt.toISOString()})`);
    }
    total += stuck.length;
  }

  console.log(`\nDone. ${total} field value(s) freed for reuse across ${TARGETS.length} model/field pair(s).`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
