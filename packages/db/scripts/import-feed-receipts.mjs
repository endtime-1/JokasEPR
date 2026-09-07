/*
 * ONE-TIME: load the QuickBooks feed-invoice export (mill → farm deliveries)
 * into the Jokas Feed store as Feed Receipt records.
 *
 *   node packages/db/scripts/parse-feed-invoices.mjs --src esaso-april-report.xlsx --out feed-import-data.json
 *   node packages/db/scripts/import-feed-receipts.mjs --data feed-import-data.json                 # DRY RUN
 *   node packages/db/scripts/import-feed-receipts.mjs --data feed-import-data.json --commit --i-have-a-backup
 *
 * Flags:
 *   --data <path>          required — output of parse-feed-invoices.mjs
 *   --commit               actually write (default: dry run)
 *   --i-have-a-backup      required with --commit
 *   --create-missing       create any feed product that doesn't already exist
 *                          (FINISHED_GOOD, feedForm MASH/CONCENTRATE, uom kg)
 *   --wipe-all             wipe every feed InventoryItem/StockBatch/receipt in
 *                          the store, not just the products in this file
 *
 * Model: each invoice line -> one FeedReceiptRecord (sourceType FEED_MILL,
 * billReference = invoice #, unitCost per kg, totalCost) crediting the store's
 * stock in KG (feed inventory is kg-denominated; 1 bag = kgPerBag from parse).
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const A = process.argv.slice(2);
const flag = (n) => A.includes("--" + n);
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };

const DATA_PATH = opt("data");
const COMMIT = flag("commit");
const CREATE_MISSING = flag("create-missing");
const WIPE_ALL = flag("wipe-all");
if (!DATA_PATH) { console.error("--data <feed-import-data.json> is required"); process.exit(1); }
if (COMMIT && !flag("i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup. Run infra/vps/backup.sh first."); process.exit(1); }

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const EXPECT = {
  company: "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1",
  farm: "ec1cea6b-40d7-4741-abb0-67ef687f251c", // JOKASFARM
};
const money = (n) => Math.round(n * 10000) / 10000;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// QB item (batch suffix stripped) -> canonical system product name.
// The 001-26 / 002-26 / 006-26 suffix is a mill production batch, not a product.
const canonical = (name) => {
  const k = norm(name).replace(/\b\d{3} 26\b/g, "").replace(/\b105\b/g, "").trim();
  if (/super chicks? conc/.test(k)) return { name: "Super Chick Concentrate", feedForm: "CONCENTRATE" };
  if (/developer conc/.test(k)) return { name: "Developer Concentrate", feedForm: "CONCENTRATE" };
  if (/super chicks? mash/.test(k)) return { name: "Super Chick Mash", feedForm: "MASH" };
  if (/pre starter mash/.test(k)) return { name: "Pre-Starter Mash", feedForm: "MASH" };
  if (/pre layer mash/.test(k)) return { name: "Pre-Layer Mash", feedForm: "MASH" };
  if (/developer mash/.test(k)) return { name: "Developer Mash", feedForm: "MASH" };
  if (/chicks? mash/.test(k)) return { name: "Chick Mash", feedForm: "MASH" };
  if (/layer 1 mash|layer mash/.test(k)) return { name: "Layer Mash", feedForm: "MASH" };
  return { name: name.replace(/\s*\d{3}-26$/, "").trim(), feedForm: /conc/i.test(name) ? "CONCENTRATE" : "MASH" };
};

async function resolveProduct(canon, allProducts) {
  const target = norm(canon.name);
  // exact-ish match on existing products
  let hit = allProducts.find((p) => norm(p.name) === target)
    || allProducts.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name)));
  return hit ?? null;
}

async function main() {
  console.log(`\n${"=".repeat(68)}\n  FEED RECEIPT IMPORT — ${COMMIT ? "!!! COMMIT !!!" : "dry run (no writes)"}`);
  console.log(`  data: ${DATA_PATH}  ${data.firstDate}..${data.lastDate}  ${data.totalLines} lines  ${data.totalBags} bags  ${data.totalKg} kg  GHS ${data.totalAmount}\n${"=".repeat(68)}`);

  const store = await prisma.warehouse.findFirst({ where: { companyId: EXPECT.company, type: "FEED_STORE", farmId: EXPECT.farm, deletedAt: null }, select: { id: true, code: true, name: true, branchId: true } });
  if (!store) throw new Error("no FEED_STORE warehouse on JOKASFARM");
  const farm = await prisma.farm.findFirst({ where: { id: EXPECT.farm }, select: { id: true, branchId: true } });
  const adminUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  const CREATED_BY = adminUser?.id ?? null;
  const kgUom = await prisma.unitOfMeasure.findFirst({ where: { OR: [{ code: "kg" }, { code: "KG" }, { name: { contains: "ilogram" } }] }, select: { id: true, code: true, name: true } });
  console.log(`  feed store: ${store.name} (${store.id})`);
  console.log(`  createdBy: ${adminUser?.email ?? "(null)"}   kg uom: ${kgUom ? `${kgUom.code}/${kgUom.name}` : "!! NOT FOUND"}\n`);

  const allProducts = await prisma.product.findMany({ where: { companyId: EXPECT.company, deletedAt: null }, select: { id: true, name: true, sku: true, type: true, feedForm: true, uomId: true, branchId: true } });

  // ── map the file's items to products ──
  const itemMap = {}; // qb short name -> { canon, product|null, willCreate }
  const canonSeen = new Map();
  for (const [shortName, t] of Object.entries(data.items)) {
    const canon = canonical(shortName);
    if (!canonSeen.has(canon.name)) canonSeen.set(canon.name, { canon, bags: 0, kg: 0, amount: 0, qbItems: [] });
    const g = canonSeen.get(canon.name);
    g.bags += t.bags; g.kg += t.kg; g.amount += t.amount; g.qbItems.push(shortName);
    itemMap[shortName] = { canonName: canon.name };
  }

  console.log("─── PRODUCT MAPPING ───");
  const productByCanon = {};
  let missing = 0;
  for (const [canonName, g] of canonSeen) {
    const p = await resolveProduct(g.canon, allProducts);
    productByCanon[canonName] = p;
    const status = p ? `→ ${p.name} (${p.sku})` : (CREATE_MISSING ? "→ WILL CREATE" : "→ !! NO MATCH");
    if (!p && !CREATE_MISSING) missing++;
    console.log(`  ${canonName.padEnd(26)} [${g.canon.feedForm}]  ${String(g.bags).padStart(5)} bags / ${String(g.kg).padStart(7)} kg   ${status}`);
    console.log(`       from: ${g.qbItems.join(", ")}`);
  }

  // ── wipe scope ──
  const wipeProductIds = WIPE_ALL ? null : Object.values(productByCanon).filter(Boolean).map((p) => p.id);
  const rcptWhere = { farmId: EXPECT.farm, warehouseId: store.id, deletedAt: null, ...(WIPE_ALL ? {} : { feedProductId: { in: wipeProductIds ?? [] } }) };
  const existingReceipts = await prisma.feedReceiptRecord.findMany({ where: rcptWhere, select: { id: true, feedProductId: true, quantityKg: true } });
  const invWhere = { warehouseId: store.id, deletedAt: null, ...(WIPE_ALL ? {} : { productId: { in: wipeProductIds ?? [] } }) };
  const existingItems = await prisma.inventoryItem.findMany({ where: invWhere, select: { id: true, productId: true, quantityOnHand: true, product: { select: { name: true } } } });

  console.log("\n─── WIPE (feed store) ───");
  console.log(`  FeedReceiptRecord rows: ${existingReceipts.length}${WIPE_ALL ? " (ALL feed products)" : " (mapped feed products only)"}`);
  console.log(`  InventoryItems to reset: ${existingItems.length}`);
  existingItems.forEach((i) => console.log(`     ${i.product.name.padEnd(26)} on hand ${Number(i.quantityOnHand)} → 0`));

  console.log("\n─── CREATE ───");
  console.log(`  ${data.lines.length} FeedReceiptRecord rows (sourceType FEED_MILL, billReference = invoice #), total ${data.totalKg} kg, GHS ${data.totalAmount}`);
  const byMonth = {};
  for (const l of data.lines) { const m = l.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + l.kg; }
  console.log("  by month (kg): " + Object.entries(byMonth).map(([m, k]) => `${m}:${k}`).join("  "));

  if (missing) { console.log(`\n!! ${missing} feed product(s) have no match. Re-run with --create-missing, or create them in the app first.`); }
  if (!kgUom && CREATE_MISSING) console.log("\n!! no 'kg' unit of measure found — needed to create products.");

  if (!COMMIT) { console.log("\n(dry run — nothing written. add --commit --i-have-a-backup)\n"); await prisma.$disconnect(); return; }
  if (missing) { console.error("\nRefusing to commit with unmapped products."); await prisma.$disconnect(); process.exit(1); }

  // ══════════════ COMMIT ══════════════
  console.log("\n>>> COMMITTING\n");

  // create missing products
  for (const [canonName, g] of canonSeen) {
    if (productByCanon[canonName]) continue;
    if (!kgUom) throw new Error("cannot create products without a kg uom");
    const sku = "FEED-" + canonName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+$/,"");
    const p = await prisma.product.create({ data: {
      companyId: EXPECT.company, branchId: store.branchId, name: canonName, sku,
      type: "FINISHED_GOOD", feedForm: g.canon.feedForm, uomId: kgUom.id, status: "ACTIVE", createdById: CREATED_BY,
    } });
    productByCanon[canonName] = p;
    console.log(`   created product ${canonName} (${sku})`);
  }

  // wipe
  const rcptIds = existingReceipts.map((r) => r.id);
  if (rcptIds.length) {
    const sm = await prisma.stockMovement.findMany({ where: { referenceType: "FeedReceiptRecord", referenceId: { in: rcptIds } }, select: { id: true, stockBatchId: true } });
    await prisma.stockMovement.deleteMany({ where: { id: { in: sm.map((m) => m.id) } } });
    const sbIds = sm.map((m) => m.stockBatchId).filter(Boolean);
    if (sbIds.length) await prisma.stockBatch.deleteMany({ where: { id: { in: sbIds } } });
    await prisma.feedReceiptRecord.updateMany({ where: { id: { in: rcptIds } }, data: { deletedAt: new Date() } });
    console.log(`   wiped ${rcptIds.length} feed receipts + ${sm.length} movements + ${sbIds.length} batches`);
  }
  for (const it of existingItems) {
    await prisma.inventoryItem.update({ where: { id: it.id }, data: { quantityOnHand: 0 } });
  }
  console.log(`   reset ${existingItems.length} inventory items to 0`);

  // create receipts + credit inventory (kg)
  let made = 0;
  for (const l of data.lines) {
    const canonName = canonical(l.name).name;
    const product = productByCanon[canonName];
    const unitCostPerKg = data.kgPerBag > 0 ? money(l.unitPricePerBag / data.kgPerBag) : null;
    const rec = await prisma.feedReceiptRecord.create({ data: {
      companyId: EXPECT.company, branchId: farm.branchId, farmId: EXPECT.farm, warehouseId: store.id,
      feedProductId: product.id, receiptDate: new Date(l.date + "T00:00:00.000Z"),
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
      quantityReceived: l.kg, quantityRemaining: l.kg, manufactureDate: new Date(l.date + "T00:00:00.000Z"), createdById: CREATED_BY,
    } });
    await prisma.stockMovement.create({ data: {
      companyId: EXPECT.company, branchId: store.branchId, productId: product.id, inventoryItemId: item.id, stockBatchId: sb.id,
      toWarehouseId: store.id, warehouseId: store.id, farmId: EXPECT.farm, uomId: product.uomId,
      movementType: "TRANSFER", quantity: l.kg, referenceType: "FeedReceiptRecord", referenceId: rec.id,
      notes: `QB feed receipt ${l.invoiceNo} — ${canonName}`, movementDate: new Date(l.date + "T00:00:00.000Z"), createdById: CREATED_BY,
    } });
    made++;
  }
  console.log(`   created ${made} feed receipts + inventory credits`);

  console.log("\n─── RESULT (Jokas Feed on hand) ───");
  for (const [canonName, p] of Object.entries(productByCanon)) {
    const it = await prisma.inventoryItem.findFirst({ where: { warehouseId: store.id, productId: p.id }, select: { quantityOnHand: true } });
    console.log(`  ${canonName.padEnd(26)} ${Number(it?.quantityOnHand ?? 0)} kg`);
  }
  console.log("\n>>> DONE\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
