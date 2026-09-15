// Read-only check after reset-market-planning-and-sales.mjs — counts every
// still-active (deletedAt: null) row across the same tables that script
// touches, so "is this actually clean?" doesn't rely on eyeballing the UI.
// Never writes anything.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

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

async function report(label, models) {
  console.log(`-- ${label} --`);
  let total = 0;
  for (const m of models) {
    const count = await prisma[m].count({ where: { deletedAt: null } });
    total += count;
    console.log(`  ${m}: ${count} active row(s)${count > 0 ? "  <-- not empty" : ""}`);
  }
  return total;
}

async function main() {
  const mpTotal = await report("Market Planning", MARKET_PLANNING_MODELS);
  console.log("");
  const salesTotal = await report("Sales", SALES_MODELS);

  console.log("");
  const eggSales = await prisma.eggSale.count({ where: { deletedAt: null } });
  console.log(`-- Egg Sales (should NOT be zero — this is your real 78-invoice import) --`);
  console.log(`  eggSale: ${eggSales} active row(s)`);

  console.log(`\n${mpTotal === 0 && salesTotal === 0 ? "CLEAN — both modules are empty." : `NOT CLEAN — ${mpTotal + salesTotal} active row(s) remain, see <-- markers above.`}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
