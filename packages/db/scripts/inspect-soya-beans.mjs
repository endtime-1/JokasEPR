/*
 * READ-ONLY. Shows which soya BEAN product each recent soya intake and processing
 * batch was recorded under, and the stock behind them — so a mistaken pick (HiPro
 * instead of local soya) can be seen and corrected precisely.
 *
 *   set -a; . ./.env; set +a
 *   node packages/db/scripts/inspect-soya-beans.mjs            # last 3 days
 *   node packages/db/scripts/inspect-soya-beans.mjs --days 7
 *
 * It changes nothing.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 3 : 3;
const since = new Date(Date.now() - DAYS * 86400000);
const n = (x) => Math.round(Number(x) * 10000) / 10000;
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");
const pad = (s, w) => String(s ?? "").slice(0, w).padEnd(w);

async function main() {
  console.log(`\n${"=".repeat(78)}\n  SOYA BEAN PRODUCT CHECK (read-only), records from the last ${DAYS} day(s)\n${"=".repeat(78)}`);

  const products = await prisma.product.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: "soy" } }, { sku: { contains: "soy" } }, { name: { contains: "hipro" } }, { name: { contains: "hi-pro" } }] },
    select: { id: true, sku: true, name: true, type: true, status: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n  Soya-related products in the catalog:\n`);
  for (const p of products) console.log(`    ${pad(p.id, 36)}  ${pad(p.sku, 12)} ${pad(p.name, 30)} ${p.type}/${p.status}`);

  const items = await prisma.inventoryItem.findMany({
    where: { productId: { in: products.map((p) => p.id) }, deletedAt: null },
    select: { id: true, quantityOnHand: true, product: { select: { name: true } }, warehouse: { select: { name: true } } },
  });
  console.log(`\n  Stock on hand per product and store:\n`);
  for (const it of items) {
    const batches = await prisma.stockBatch.findMany({ where: { inventoryItemId: it.id, deletedAt: null, quantityRemaining: { gt: 0 } }, select: { quantityRemaining: true } });
    const sum = batches.reduce((s, b) => s + Number(b.quantityRemaining), 0);
    console.log(`    ${pad(it.product.name, 28)} @ ${pad(it.warehouse.name, 22)} on hand ${String(n(it.quantityOnHand)).padStart(12)}   lots ${String(n(sum)).padStart(12)}${n(it.quantityOnHand) === n(sum) ? "" : "   <-- differ"}`);
  }

  const intakes = await prisma.soyaBeanIntake.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    include: { product: { select: { name: true } }, warehouse: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  BEAN INTAKES (${intakes.length}):\n`);
  console.log(`    ${pad("receipt", 16)} ${pad("product it was recorded as", 26)} ${pad("store", 18)} ${"kg".padStart(10)}  ${pad("supplier", 18)} created`);
  for (const i of intakes) {
    const lot = await prisma.stockBatch.findFirst({ where: { companyId: i.companyId, productId: i.productId, batchNumber: i.receiptNumber.toUpperCase(), deletedAt: null }, select: { quantityReceived: true, quantityRemaining: true } });
    console.log(`    ${pad(i.receiptNumber, 16)} ${pad(i.product.name, 26)} ${pad(i.warehouse.name, 18)} ${String(n(i.quantityKg)).padStart(10)}  ${pad(i.supplierName, 18)} ${d(i.createdAt)}${lot ? `   lot left ${n(lot.quantityRemaining)}/${n(lot.quantityReceived)}` : "   (no lot found)"}`);
  }

  const batches = await prisma.soyaProcessingBatch.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    include: { beanProduct: { select: { name: true } }, intake: { select: { receiptNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  PROCESSING BATCHES (${batches.length}):\n`);
  console.log(`    ${pad("batch", 16)} ${pad("beans used (product)", 26)} ${"kg used".padStart(10)}  ${pad("intake", 16)} ${pad("status", 10)} created`);
  for (const b of batches) console.log(`    ${pad(b.batchNumber, 16)} ${pad(b.beanProduct.name, 26)} ${String(n(b.beansUsedKg)).padStart(10)}  ${pad(b.intake?.receiptNumber ?? "-", 16)} ${pad(b.status, 10)} ${d(b.createdAt)}`);

  // ---- what each batch PRODUCED, and under which product (the likely place for the mix-up) ----
  const cakes = await prisma.soyaCakeOutput.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    include: { product: { select: { name: true } }, warehouse: { select: { name: true } }, productionBatch: { select: { batchNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  CAKE OUTPUTS (${cakes.length}) - the product the cake was recorded as:\n`);
  console.log(`    ${pad("batch", 16)} ${pad("cake recorded as", 22)} ${pad("store", 20)} ${"kg".padStart(10)}  lot left / received`);
  for (const c of cakes) {
    const lot = await prisma.stockBatch.findFirst({ where: { companyId: c.companyId, batchNumber: `${c.productionBatch.batchNumber}-CAKE`, deletedAt: null }, select: { quantityReceived: true, quantityRemaining: true, product: { select: { name: true } } } });
    console.log(`    ${pad(c.productionBatch.batchNumber, 16)} ${pad(c.product.name, 22)} ${pad(c.warehouse.name, 20)} ${String(n(c.quantityKg)).padStart(10)}  ${lot ? `${n(lot.quantityRemaining)} / ${n(lot.quantityReceived)} (lot product: ${lot.product.name})` : "(no lot found)"}`);
  }

  const oils = await prisma.soyaOilOutput.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    include: { product: { select: { name: true } }, warehouse: { select: { name: true } }, productionBatch: { select: { batchNumber: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  OIL OUTPUTS (${oils.length}):\n`);
  for (const o of oils) console.log(`    ${pad(o.productionBatch.batchNumber, 16)} ${pad(o.product.name, 22)} ${pad(o.warehouse.name, 20)} ${String(n(o.quantityLitres)).padStart(10)} L`);

  const transfers = await prisma.soyaInternalTransfer.findMany({
    where: { deletedAt: null, createdAt: { gte: since } },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n  SOYA TRANSFERS (${transfers.length}) - cake/oil moved between stores:\n`);
  for (const t of transfers) console.log(`    ${pad(t.outputType, 6)} ${pad(t.product.name, 22)} ${String(n(t.quantity)).padStart(10)}   ${pad(t.status, 10)} ${d(t.createdAt)}`);

  // ---- everything that has ever touched Hipro Soya in a cake store ----
  const hipro = products.find((p) => /hi-?pro/i.test(p.name));
  if (hipro) {
    const cakeStores = await prisma.warehouse.findMany({ where: { name: { contains: "cake" }, deletedAt: null }, select: { id: true, name: true } });
    for (const w of cakeStores) {
      const moves = await prisma.stockMovement.groupBy({ by: ["movementType"], where: { productId: hipro.id, deletedAt: null, OR: [{ warehouseId: w.id }, { toWarehouseId: w.id }, { fromWarehouseId: w.id }] }, _sum: { quantity: true }, _count: true });
      console.log(`\n  Movements of "${hipro.name}" touching ${w.name} (all time):`);
      for (const m of moves) console.log(`    ${pad(m.movementType, 22)} ${String(m._count).padStart(4)} movements   ${String(n(m._sum.quantity)).padStart(12)} kg`);
    }
  }

  console.log(`\n  Nothing was changed.\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
