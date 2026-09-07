/*
 * ONE-TIME: load the QuickBooks feed-invoice export (mill → farm deliveries)
 * into the Jokas Feed store as Feed Receipt records.
 *
 *   node packages/db/scripts/parse-feed-invoices.mjs --src esaso-april-report.xlsx --out feed-import-data.json
 *   node packages/db/scripts/import-feed-receipts.mjs --data feed-import-data.json                 # DRY RUN
 *   node packages/db/scripts/import-feed-receipts.mjs --data feed-import-data.json --commit --i-have-a-backup
 *
 * Wipes EVERYTHING currently in the Jokas Feed store (all feed receipts,
 * stock batches, and on-hand for every product), then creates one
 * FeedReceiptRecord per invoice line — dated to the invoice date, source
 * FEED_MILL, billReference = invoice #, unit + total cost, mill batch in the
 * note — crediting the store's stock in KG (1 bag = kgPerBag from the parse).
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const A = process.argv.slice(2);
const flag = (n) => A.includes("--" + n);
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };

const DATA_PATH = opt("data");
const COMMIT = flag("commit");
if (!DATA_PATH) { console.error("--data <feed-import-data.json> is required"); process.exit(1); }
if (COMMIT && !flag("i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup. Run infra/vps/backup.sh first."); process.exit(1); }

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const EXPECT = {
  company: "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1",
  farm: "ec1cea6b-40d7-4741-abb0-67ef687f251c", // JOKASFARM
  feedStore: "ae537045-e7ab-4c2d-8ea9-f113d19c3243", // Jokas Feed
};
const money = (n) => Math.round(n * 10000) / 10000;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// QB item (mill-batch suffix stripped) -> canonical feed type
const canonical = (name) => {
  const k = norm(name).replace(/\b\d{3} 26\b/g, "").replace(/\b105\b/g, "").trim();
  if (/super chicks? conc/.test(k)) return "Super Chick Concentrate";
  if (/developer conc/.test(k)) return "Developer Concentrate";
  if (/super chicks? mash/.test(k)) return "Super Chick Mash";
  if (/pre starter mash/.test(k)) return "Pre-Starter Mash";
  if (/pre layer mash/.test(k)) return "Pre-Layer Mash";
  if (/developer mash/.test(k)) return "Developer Mash";
  if (/chicks? mash/.test(k)) return "Chicks Mash";
  if (/layer 1 mash|layer mash/.test(k)) return "Layer 1 Mash";
  return name.replace(/\s*\d{3}-26$/, "").trim();
};

// canonical feed type -> system Product SKU. Edit if any is wrong.
const SKU_MAP = {
  "Layer 1 Mash": "L001",              // Layer1 M
  "Developer Mash": "DEV",             // Developer M
  "Chicks Mash": "CS",                 // Chicks Starter M
  "Pre-Layer Mash": "PL",              // Per Layer M
  "Super Chick Mash": "SC",            // Super Chicks M
  "Pre-Starter Mash": "PSM",           // ?? confirm the real SKU
  "Developer Concentrate": "DEVC",     // Developer C
  "Super Chick Concentrate": "SCC",    // Super Chicks C
};

async function main() {
  console.log(`\n${"=".repeat(68)}\n  FEED RECEIPT IMPORT — ${COMMIT ? "!!! COMMIT !!!" : "dry run (no writes)"}`);
  console.log(`  data: ${DATA_PATH}  ${data.firstDate}..${data.lastDate}  ${data.totalLines} lines  ${data.totalBags} bags  ${data.totalKg} kg  GHS ${data.totalAmount}\n${"=".repeat(68)}`);

  const store = await prisma.warehouse.findFirst({ where: { id: EXPECT.feedStore, deletedAt: null }, select: { id: true, name: true, branchId: true } });
  if (!store) throw new Error("Jokas Feed store not found");
  const farm = await prisma.farm.findFirst({ where: { id: EXPECT.farm }, select: { id: true, branchId: true } });
  const adminUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  const CREATED_BY = adminUser?.id ?? null;
  console.log(`  feed store: ${store.name} (${store.id})   createdBy: ${adminUser?.email ?? "(null)"}\n`);

  // ── resolve every SKU ──
  const skus = [...new Set(Object.values(SKU_MAP))];
  const products = await prisma.product.findMany({ where: { companyId: EXPECT.company, sku: { in: skus }, deletedAt: null }, select: { id: true, sku: true, name: true, uomId: true, feedForm: true } });
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));
  const productForCanon = {};
  let missing = 0;

  // aggregate the file's items by canonical type
  const canonAgg = {};
  for (const [shortName, t] of Object.entries(data.items)) {
    const c = canonical(shortName);
    canonAgg[c] = canonAgg[c] || { bags: 0, kg: 0, amount: 0, from: [] };
    canonAgg[c].bags += t.bags; canonAgg[c].kg += t.kg; canonAgg[c].amount += t.amount; canonAgg[c].from.push(shortName);
  }

  console.log("─── PRODUCT MAPPING ───");
  for (const [canon, g] of Object.entries(canonAgg)) {
    const sku = SKU_MAP[canon];
    const p = sku ? bySku[sku] : null;
    productForCanon[canon] = p ?? null;
    if (!p) missing++;
    console.log(`  ${canon.padEnd(24)} ${String(g.bags).padStart(5)} bags / ${String(g.kg).padStart(7)} kg  →  ${p ? `${p.name} (${p.sku})` : `!! SKU "${sku}" NOT FOUND`}`);
    console.log(`       from: ${g.from.join(", ")}`);
  }

  // ── wipe: EVERYTHING in the feed store ──
  const allItems = await prisma.inventoryItem.findMany({ where: { warehouseId: store.id, deletedAt: null }, select: { id: true, quantityOnHand: true, product: { select: { name: true, sku: true } } } });
  const allReceipts = await prisma.feedReceiptRecord.count({ where: { warehouseId: store.id, deletedAt: null } });
  const allBatches = await prisma.stockBatch.count({ where: { warehouseId: store.id, deletedAt: null } });
  console.log("\n─── WIPE (entire Jokas Feed store) ───");
  console.log(`  FeedReceiptRecord rows: ${allReceipts}`);
  console.log(`  StockBatch rows: ${allBatches}`);
  console.log(`  InventoryItems to zero: ${allItems.length}`);
  allItems.forEach((i) => console.log(`     ${i.product.name.padEnd(22)} ${i.product.sku.padEnd(8)} on hand ${Number(i.quantityOnHand)} → 0`));

  console.log("\n─── CREATE ───");
  console.log(`  ${data.lines.length} FeedReceiptRecord rows, ${data.totalKg} kg, GHS ${data.totalAmount}`);
  const byMonth = {};
  for (const l of data.lines) { const m = l.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + l.kg; }
  console.log("  by month (kg): " + Object.entries(byMonth).map(([m, k]) => `${m}:${k}`).join("  "));
  console.log("\n─── RESULT (store will hold) ───");
  for (const [canon, g] of Object.entries(canonAgg)) {
    const p = productForCanon[canon];
    console.log(`  ${(p ? p.name : canon).padEnd(24)} ${g.kg} kg`);
  }

  if (missing) console.log(`\n!! ${missing} product(s) unmapped — fix SKU_MAP in this script (or tell me the real SKU) before committing.`);
  if (!COMMIT) { console.log("\n(dry run — nothing written. add --commit --i-have-a-backup)\n"); await prisma.$disconnect(); return; }
  if (missing) { console.error("\nRefusing to commit with unmapped products."); await prisma.$disconnect(); process.exit(1); }

  // ══════════════ COMMIT ══════════════
  console.log("\n>>> COMMITTING\n");

  // wipe every receipt/batch/movement/on-hand in the store
  const recIds = (await prisma.feedReceiptRecord.findMany({ where: { warehouseId: store.id, deletedAt: null }, select: { id: true } })).map((r) => r.id);
  if (recIds.length) {
    const mv = await prisma.stockMovement.findMany({ where: { referenceType: "FeedReceiptRecord", referenceId: { in: recIds } }, select: { id: true } });
    await prisma.stockMovement.deleteMany({ where: { id: { in: mv.map((m) => m.id) } } });
    await prisma.feedReceiptRecord.updateMany({ where: { id: { in: recIds } }, data: { deletedAt: new Date() } });
  }
  await prisma.stockMovement.deleteMany({ where: { warehouseId: store.id, productId: { in: (await prisma.inventoryItem.findMany({ where: { warehouseId: store.id }, select: { productId: true } })).map((i) => i.productId) } } });
  await prisma.stockBatch.deleteMany({ where: { warehouseId: store.id } });
  await prisma.inventoryItem.updateMany({ where: { warehouseId: store.id }, data: { quantityOnHand: 0 } });
  console.log(`   wiped ${recIds.length} receipts + all stock batches/movements; zeroed ${allItems.length} inventory items`);

  // create receipts + credit inventory (kg)
  let made = 0;
  for (const l of data.lines) {
    const canon = canonical(l.name);
    const product = productForCanon[canon];
    const unitCostPerKg = data.kgPerBag > 0 ? money(l.unitPricePerBag / data.kgPerBag) : null;
    const date = new Date(l.date + "T00:00:00.000Z");
    const rec = await prisma.feedReceiptRecord.create({ data: {
      companyId: EXPECT.company, branchId: farm.branchId, farmId: EXPECT.farm, warehouseId: store.id,
      feedProductId: product.id, receiptDate: date,
      quantityKg: l.kg, sourceType: "FEED_MILL", supplierName: "Jokas Feed Mill",
      billReference: (l.invoiceNo || "").slice(0, 100),
      unitCost: unitCostPerKg, totalCost: money(l.amount),
      notes: `QB import — ${l.qbItem} (${l.bags} bags)`.slice(0, 490),
      status: "APPROVED",
      idempotencyKey: `qbfeed:${l.invoiceNo}:${l.qbItem}:${l.date}`.slice(0, 100),
      createdById: CREATED_BY,
    } });
    const item = await prisma.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: EXPECT.company, warehouseId: store.id, productId: product.id } },
      update: { quantityOnHand: { increment: l.kg } },
      create: { companyId: EXPECT.company, branchId: store.branchId, warehouseId: store.id, farmId: EXPECT.farm, productId: product.id, uomId: product.uomId, quantityOnHand: l.kg, createdById: CREATED_BY },
    });
    const sb = await prisma.stockBatch.create({ data: {
      companyId: EXPECT.company, branchId: store.branchId, farmId: EXPECT.farm, warehouseId: store.id, productId: product.id,
      inventoryItemId: item.id, uomId: product.uomId, batchNumber: `FRC-QB-${l.invoiceNo}-${made}`.slice(0, 60),
      quantityReceived: l.kg, quantityRemaining: l.kg, manufactureDate: date, createdById: CREATED_BY,
    } });
    await prisma.stockMovement.create({ data: {
      companyId: EXPECT.company, branchId: store.branchId, productId: product.id, inventoryItemId: item.id, stockBatchId: sb.id,
      toWarehouseId: store.id, warehouseId: store.id, farmId: EXPECT.farm, uomId: product.uomId,
      movementType: "TRANSFER", quantity: l.kg, referenceType: "FeedReceiptRecord", referenceId: rec.id,
      notes: `QB feed receipt ${l.invoiceNo} — ${product.name}`, movementDate: date, createdById: CREATED_BY,
    } });
    made++;
  }
  console.log(`   created ${made} feed receipts + inventory credits`);

  console.log("\n─── RESULT (Jokas Feed on hand) ───");
  const finalItems = await prisma.inventoryItem.findMany({ where: { warehouseId: store.id, quantityOnHand: { gt: 0 } }, select: { quantityOnHand: true, product: { select: { name: true, sku: true } } } });
  finalItems.forEach((i) => console.log(`  ${i.product.name.padEnd(24)} ${i.product.sku.padEnd(8)} ${Number(i.quantityOnHand)} kg`));
  console.log("\n>>> DONE\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
