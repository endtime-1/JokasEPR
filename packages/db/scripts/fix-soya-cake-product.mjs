/*
 * Moves soya CAKE that was recorded under the wrong product (Hipro Soya) to the
 * right one (Local Soya) — the record, its stock lot, its stock-movement history
 * and the on-hand totals of BOTH products, all in one transaction.
 *
 * Found on 2026-10-20: 8 processing batches (SPB-2026-0018..0026, 51,700 kg) had
 * their cake output typed as "Hipro Soya" instead of "Local Soya".
 *
 * DRY RUN by default. Nothing changes until you add --commit.
 *
 *   cd /opt/jokas/app && set -a; . ./.env; set +a
 *   node packages/db/scripts/fix-soya-cake-product.mjs --since 2026-10-19
 *   node packages/db/scripts/fix-soya-cake-product.mjs --since 2026-10-19 --commit
 *
 * Options:  --from "Hipro Soya"   --to "Local Soya"   --since YYYY-MM-DD
 *           --batches SPB-2026-0018,SPB-2026-0019   (instead of --since)
 *
 * Safe to re-run: records already moved no longer match, so nothing is done twice.
 * It refuses to run if any of the lots was already used, sold or transferred.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
const COMMIT = argv.includes("--commit");
const FROM_NAME = arg("--from") ?? "Hipro Soya";
const TO_NAME = arg("--to") ?? "Local Soya";
const SINCE = arg("--since");
const BATCHES = arg("--batches")?.split(",").map((s) => s.trim()).filter(Boolean);
const n = (x) => Math.round(Number(x) * 10000) / 10000;

async function main() {
  console.log(`\n${"=".repeat(74)}\n  MOVE SOYA CAKE: "${FROM_NAME}" -> "${TO_NAME}"   ${COMMIT ? "!!! COMMIT !!!" : "(dry run, nothing changes)"}\n${"=".repeat(74)}`);
  if (!SINCE && !BATCHES) { console.error(`\n  Give --since YYYY-MM-DD or --batches SPB-...,SPB-... so only the intended records are touched.\n`); process.exit(1); }

  const from = await prisma.product.findFirst({ where: { name: FROM_NAME, deletedAt: null }, select: { id: true, name: true, uomId: true, sku: true } });
  const to = await prisma.product.findFirst({ where: { name: TO_NAME, deletedAt: null }, select: { id: true, name: true, uomId: true, sku: true } });
  if (!from || !to) { console.error(`\n  Product not found (from: ${!!from}, to: ${!!to}).\n`); process.exit(1); }
  if (from.uomId !== to.uomId) { console.error(`\n  The two products use different units of measure; refusing to move stock between them.\n`); process.exit(1); }
  console.log(`\n  from: ${from.name} (${from.sku})   to: ${to.name} (${to.sku})`);

  const outputs = await prisma.soyaCakeOutput.findMany({
    where: {
      deletedAt: null,
      productId: from.id,
      ...(BATCHES ? { productionBatch: { batchNumber: { in: BATCHES } } } : { createdAt: { gte: new Date(`${SINCE}T00:00:00Z`) } }),
    },
    include: { productionBatch: { select: { id: true, batchNumber: true } }, warehouse: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!outputs.length) { console.log(`\n  Nothing to move: no cake outputs recorded as "${from.name}" for that selection.\n`); return; }

  // ---- check every lot is still whole, and build the plan ----
  const plan = [];
  let problems = 0;
  console.log(`\n  ${outputs.length} cake output(s) found:\n`);
  for (const o of outputs) {
    const batchNumber = `${o.productionBatch.batchNumber}-CAKE`;
    const lot = await prisma.stockBatch.findFirst({ where: { companyId: o.companyId, warehouseId: o.warehouseId, productId: from.id, batchNumber, deletedAt: null } });
    const moves = await prisma.stockMovement.findMany({ where: { companyId: o.companyId, referenceType: "SoyaProcessingBatch", referenceId: o.productionBatch.id, productId: from.id, warehouseId: o.warehouseId, deletedAt: null } });
    const other = await prisma.stockMovement.count({ where: { stockBatchId: lot?.id ?? "none", deletedAt: null, NOT: { referenceId: o.productionBatch.id } } });
    const whole = lot && n(lot.quantityRemaining) === n(lot.quantityReceived) && n(lot.quantityReceived) === n(o.quantityKg);
    console.log(`    ${o.productionBatch.batchNumber.padEnd(15)} ${String(n(o.quantityKg)).padStart(9)} kg   ${o.warehouse.name.padEnd(12)} lot ${lot ? `${n(lot.quantityRemaining)}/${n(lot.quantityReceived)}` : "MISSING"}  movements ${moves.length}  ${whole && !other ? "OK" : "!! NOT CLEAN"}`);
    if (!whole || other) { problems++; continue; }
    plan.push({ o, lot, moves });
  }
  if (problems) { console.error(`\n  ${problems} output(s) are not clean (lot missing, partly used, or has other movements). Nothing was changed. Send me this output.\n`); process.exit(1); }

  const total = plan.reduce((s, p) => s + Number(p.o.quantityKg), 0);
  console.log(`\n  Total to move: ${n(total)} kg from ${from.name} to ${to.name}.`);

  if (!COMMIT) { console.log(`\n  Dry run only. Nothing was changed. Re-run with --commit to apply.\n`); return; }

  await prisma.$transaction(async (tx) => {
    for (const { o, lot, moves } of plan) {
      const qty = Number(o.quantityKg);
      const fromItem = await tx.inventoryItem.findFirst({ where: { companyId: o.companyId, warehouseId: o.warehouseId, productId: from.id } });
      if (!fromItem || Number(fromItem.quantityOnHand) < qty - 1e-9) throw new Error(`${from.name} on hand is lower than ${qty} for ${o.productionBatch.batchNumber}; aborting.`);
      let toItem = await tx.inventoryItem.findFirst({ where: { companyId: o.companyId, warehouseId: o.warehouseId, productId: to.id } });
      if (toItem) toItem = await tx.inventoryItem.update({ where: { id: toItem.id }, data: { deletedAt: null, quantityOnHand: { increment: qty } } });
      else toItem = await tx.inventoryItem.create({ data: { companyId: o.companyId, branchId: fromItem.branchId, warehouseId: o.warehouseId, productionSiteId: fromItem.productionSiteId, productId: to.id, uomId: to.uomId, quantityOnHand: qty } });
      await tx.inventoryItem.update({ where: { id: fromItem.id }, data: { quantityOnHand: { decrement: qty } } });
      await tx.stockBatch.update({ where: { id: lot.id }, data: { productId: to.id, inventoryItemId: toItem.id } });
      for (const m of moves) await tx.stockMovement.update({ where: { id: m.id }, data: { productId: to.id, inventoryItemId: toItem.id } });
      await tx.soyaCakeOutput.update({ where: { id: o.id }, data: { productId: to.id } });
      console.log(`  moved     ${o.productionBatch.batchNumber}  ${n(qty)} kg`);
    }
  }, { timeout: 60000 });

  // ---- prove it ----
  const warehouses = [...new Set(plan.map((p) => p.o.warehouseId))];
  for (const w of warehouses) {
    for (const prod of [from, to]) {
      const it = await prisma.inventoryItem.findFirst({ where: { warehouseId: w, productId: prod.id }, select: { id: true, quantityOnHand: true } });
      const lots = it ? await prisma.stockBatch.aggregate({ where: { inventoryItemId: it.id, deletedAt: null, quantityRemaining: { gt: 0 } }, _sum: { quantityRemaining: true } }) : null;
      console.log(`  after:    ${prod.name.padEnd(12)} on hand ${String(n(it?.quantityOnHand ?? 0)).padStart(10)}   lots ${String(n(lots?._sum.quantityRemaining ?? 0)).padStart(10)}`);
    }
  }
  console.log(`\n  Done.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
