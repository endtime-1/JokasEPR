// Owner request (2026-09-21): load the Sept 19 physical stock count at the
// Akoko Solutions feed mill ("September 19 stocks count.xlsx", gitignored,
// not committed) as opening stock for the two newly-split feed warehouses
// (Feed Raw Materials Store + Feed Finished Goods Store) — 12 raw materials
// and 7 finished feed types with counted stock, converted from bags to kg
// using the owner-confirmed bag sizes (mostly 50kg, several at 25kg, salt
// at 100kg — see data/feed-mill-opening-stock-sept19.json for the exact
// per-item conversion). "Sacks" (packaging material) and the "Feed Sold"
// tally (historical, already dispatched) from the same sheet are
// deliberately excluded — neither is warehouse stock.
//
// Mirrors InventoryService.stockIn's exact logic (InventoryItem upsert +
// StockBatch + StockMovement) rather than a raw insert, same as every
// other backfill script here — except tagged StockMovementType
// "OPENING_BALANCE" instead of stockIn's hardcoded "PURCHASE_RECEIPT",
// since this is a physical count establishing a starting balance, not a
// purchase that happened on a specific invoice.
//
// Warehouses are resolved by name (contains "raw" / "finish"), matching
// the same heuristic wired into the web app's order/batch forms
// (guessFeedWarehouseId in feed-production-pages.tsx) — pass
// --raw-warehouse-code / --finished-warehouse-code to override if your
// warehouse names don't contain those words.
//
// Products are resolved by name (case-insensitive, exact then contains).
// A product this script can't find is reported and skipped — it does NOT
// fail the whole run — so check the dry-run output for "NOT FOUND" lines
// before committing; a missing raw material almost certainly means its
// name in the catalog differs from the count sheet's label.
//
// Dry-run by default:
//   node packages/db/scripts/import-feed-mill-opening-stock.mjs
// Apply for real:
//   node packages/db/scripts/import-feed-mill-opening-stock.mjs --commit --i-have-a-backup [--raw-warehouse-code CODE] [--finished-warehouse-code CODE] [--created-by <userId>]
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit") && args.includes("--i-have-a-backup");
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const RAW_WAREHOUSE_CODE = opt("raw-warehouse-code", null);
const FINISHED_WAREHOUSE_CODE = opt("finished-warehouse-code", null);
const CREATED_BY = opt("created-by", null);

const rows = JSON.parse(readFileSync(join(__dirname, "data/feed-mill-opening-stock-sept19.json"), "utf8"));

function norm(s) { return s.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim(); }

async function resolveWarehouse(companyId, keyword, code) {
  if (code) {
    const byCode = await prisma.warehouse.findFirst({ where: { companyId, deletedAt: null, code } });
    if (!byCode) throw new Error(`No warehouse found with code "${code}".`);
    return byCode;
  }
  const candidates = await prisma.warehouse.findMany({ where: { companyId, deletedAt: null, status: "ACTIVE", type: "FEED_STORE" } });
  const matches = candidates.filter((w) => `${w.code ?? ""} ${w.name}`.toLowerCase().includes(keyword));
  if (matches.length === 0) throw new Error(`No FEED_STORE warehouse with "${keyword}" in its name/code found — pass --${keyword === "raw" ? "raw" : "finished"}-warehouse-code explicitly.`);
  if (matches.length > 1) throw new Error(`Found ${matches.length} FEED_STORE warehouses matching "${keyword}" — pass --${keyword === "raw" ? "raw" : "finished"}-warehouse-code to disambiguate: ${matches.map((w) => `${w.name} (${w.code})`).join(", ")}`);
  return matches[0];
}

async function resolveProduct(companyId, productName, category) {
  const target = norm(productName);
  const types = category === "raw" ? ["RAW_MATERIAL", "SEMI_FINISHED"] : ["FINISHED_GOOD"];
  const candidates = await prisma.product.findMany({ where: { companyId, deletedAt: null, type: { in: types } }, select: { id: true, name: true, sku: true, uomId: true } });
  const exact = candidates.find((p) => norm(p.name) === target);
  if (exact) return exact;
  const contains = candidates.filter((p) => norm(p.name).includes(target) || target.includes(norm(p.name)));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) return { AMBIGUOUS: contains };
  return null;
}

async function main() {
  console.log(`${COMMIT ? "COMMIT MODE" : "DRY RUN"} — ${rows.length} item(s) to load\n`);

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No company found.");
  const rawWarehouse = await resolveWarehouse(company.id, "raw", RAW_WAREHOUSE_CODE);
  const finishedWarehouse = await resolveWarehouse(company.id, "finish", FINISHED_WAREHOUSE_CODE);
  console.log(`Raw materials warehouse: ${rawWarehouse.name} (${rawWarehouse.code ?? rawWarehouse.id})`);
  console.log(`Finished goods warehouse: ${finishedWarehouse.name} (${finishedWarehouse.code ?? finishedWarehouse.id})\n`);

  // Two sheet rows can resolve to the SAME catalog product (e.g. "Premix
  // (old)" and "Premix (new)" both being just "Premix" in the catalog).
  // Without disambiguation both would generate the identical batch number
  // and the second row would silently skip as "already loaded" — the same
  // class of bug found in the book1 egg-sales import for a repeated
  // invoice number. Append -B, -C, ... to the batch number for the 2nd+
  // row that lands on a given SKU.
  const skuOccurrences = new Map();
  function batchNumberFor(sku) {
    const count = skuOccurrences.get(sku) ?? 0;
    skuOccurrences.set(sku, count + 1);
    const suffixes = "BCDEFGH";
    return count === 0 ? `OPEN-SEPT19-${sku}`.toUpperCase() : `OPEN-SEPT19-${sku}-${suffixes[count - 1]}`.toUpperCase();
  }

  let ok = 0, notFound = 0, ambiguous = 0, imported = 0, failed = 0;
  for (const row of rows) {
    const warehouse = row.category === "raw" ? rawWarehouse : finishedWarehouse;
    const product = await resolveProduct(company.id, row.productName, row.category);
    const bagInfo = row.bags != null ? `${row.bags} bag(s) @ ${row.bagSizeKg}kg` : "given directly";

    if (!product) {
      console.log(`[NOT FOUND] "${row.productName}" — no matching ${row.category === "raw" ? "raw material" : "finished feed"} product in the catalog. Skipping (${row.quantityKg}kg not loaded).`);
      notFound++;
      continue;
    }
    if (product.AMBIGUOUS) {
      console.log(`[AMBIGUOUS] "${row.productName}" matches ${product.AMBIGUOUS.length} products: ${product.AMBIGUOUS.map((p) => `${p.name} (${p.sku})`).join(", ")} — skipping, resolve manually.`);
      ambiguous++;
      continue;
    }
    ok++;
    const batchNumber = batchNumberFor(product.sku);
    console.log(`${COMMIT ? "LOADING" : "would load"}  ${batchNumber}  ${row.productName} -> ${product.name} (${product.sku})  ${row.quantityKg}kg (${bagInfo})  into ${warehouse.name}`);
    if (!COMMIT) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.stockBatch.findFirst({ where: { companyId: company.id, batchNumber } });
        if (existing) { console.log(`  [skip] already loaded as ${batchNumber}`); return; }
        const item = await tx.inventoryItem.upsert({
          where: { companyId_warehouseId_productId: { companyId: company.id, warehouseId: warehouse.id, productId: product.id } },
          update: { quantityOnHand: { increment: row.quantityKg }, updatedById: CREATED_BY ?? undefined },
          create: { companyId: company.id, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, productId: product.id, uomId: product.uomId, quantityOnHand: row.quantityKg, createdById: CREATED_BY ?? undefined }
        });
        const batch = await tx.stockBatch.create({
          data: { companyId: company.id, branchId: warehouse.branchId, farmId: warehouse.farmId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, productId: product.id, inventoryItemId: item.id, uomId: product.uomId, batchNumber, quantityReceived: row.quantityKg, quantityRemaining: row.quantityKg, createdById: CREATED_BY ?? undefined }
        });
        await tx.stockMovement.create({
          data: {
            companyId: company.id, branchId: warehouse.branchId, productId: product.id, inventoryItemId: item.id, stockBatchId: batch.id,
            toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId,
            uomId: product.uomId, movementType: "OPENING_BALANCE", quantity: row.quantityKg,
            referenceType: "StockBatch", referenceId: batch.id, notes: `Physical stock count, Sept 19 2026 (${bagInfo})`, createdById: CREATED_BY ?? undefined
          }
        });
      });
      imported++;
    } catch (err) {
      console.log(`  [FAIL] ${row.productName}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${ok} resolved, ${notFound} not found, ${ambiguous} ambiguous.`);
  console.log(COMMIT ? `Done — ${imported} loaded, ${failed} failed.` : "Dry run only — re-run with --commit --i-have-a-backup to apply.");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
