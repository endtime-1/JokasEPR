// Owner request (2026-09-14): fresh slate for both modules before handing
// the system to real marketers/egg-sales staff — every test/prior record in
// Market Planning and Sales, gone from view.
//
// SOFT-DELETE, not a hard DELETE: every table below already uses this
// codebase's universal deletedAt convention, and every list/read query in
// both modules already filters deletedAt: null — so this achieves "marketers
// see a completely empty system" while staying 100% reversible (just set
// deletedAt back to null on the affected rows) if anything here turns out to
// have been wrong. No mysqldump backup needed for that reason, though one
// costs nothing extra if you want the belt-and-suspenders version too.
//
// Deliberately NOT touched, on purpose (not omissions):
//   - EggSale: a separate module by explicit owner request (2026-09-14) —
//     "fully separate... not mixed into Sales' reports."
//   - FeedProductionOrder / FeedProductionBatch: real physical production
//     records created when a MarketTarget was approved — clearing the
//     planning layer shouldn't erase production/stock history that already
//     happened.
//   - SoyaSalesLink: Soya Processing's own direct-sale mechanism, not part
//     of the Sales module.
//   - CustomerPayment: Finance's own record, not Sales'.
//   - SalesOrderItem / SalesQuoteItem / CustomerStatement: no deletedAt
//     column on these at all (SalesOrderItem/SalesQuoteItem are always
//     read scoped to an already-fetched parent, which is now soft-deleted
//     and invisible anyway; CustomerStatement is an append-only ledger with
//     no delete mechanism anywhere else in this codebase either — left as
//     an untouched historical trail).
//
// Dry-run by default:
//   node packages/db/scripts/reset-market-planning-and-sales.mjs
// Apply for real:
//   node packages/db/scripts/reset-market-planning-and-sales.mjs --commit --i-have-a-backup
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit") && args.includes("--i-have-a-backup");

const MARKET_PLANNING_MODELS = [
  "market", "marketTarget", "marketTargetItem", "targetAdjustment",
  "productionPlan", "productionPlanItem",
  "materialRequirementPlan", "materialRequirementItem",
  "inventoryAvailabilityCheck", "procurementRecommendation",
  "productionExecution", "targetVsActualReport",
];

const SALES_MODELS = [
  "customerGroup", "customer", "customerCreditLimit", "priceList",
  "salesOrder", "salesQuote", "invoice", "payment", "receipt",
  "salesReturn", "salesCommission", "prospectVisit",
];

async function softDeleteAll(modelName) {
  const model = prisma[modelName];
  const count = await model.count({ where: { deletedAt: null } });
  if (count === 0) {
    console.log(`  ${modelName}: nothing to clear`);
    return 0;
  }
  if (COMMIT) {
    const result = await model.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
    console.log(`  ${modelName}: soft-deleted ${result.count}`);
  } else {
    console.log(`  ${modelName}: would soft-delete ${count}`);
  }
  return count;
}

async function main() {
  console.log(`${COMMIT ? "COMMIT MODE" : "DRY RUN"}\n`);

  console.log("-- Market Planning --");
  let total = 0;
  for (const m of MARKET_PLANNING_MODELS) total += await softDeleteAll(m);

  console.log("\n-- Sales --");
  for (const m of SALES_MODELS) total += await softDeleteAll(m);

  console.log(`\n${COMMIT ? `Done — ${total} row(s) soft-deleted across both modules.` : `Dry run only (${total} row(s) would be affected) — re-run with --commit --i-have-a-backup to apply.`}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
