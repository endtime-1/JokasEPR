// Owner request (2026-09-21): backfill real egg-sale history from a second
// invoice book ("Bookegg.xlsx", gitignored, not committed) covering the
// Akoko Solution Egg Store — 41 invoices, 1,718 crates, GHS 66,390,
// 2026-09-14 through 2026-09-21. Invoice numbers pick up exactly where the
// prior book1 backfill (import-egg-sales-book1.mjs) left off — that run's
// last invoice was #1332 (2026-09-14); this one starts at #1333 the same
// day and the owner confirmed only that one invoice had been recorded for
// 2026-09-14 before this file — so there is no overlap between the two
// batches.
//
// Same approach as import-egg-sales-book1.mjs: mirrors EggSalesService's
// exact logic (consumeFifoTx, same StockMovement shape) rather than a raw
// insert. Each invoice is its own transaction so a mid-run failure stops
// cleanly without rolling back what already succeeded. Idempotent on
// saleNumber (ES-SEPT21-<invoice#>) — safe to re-run after a partial
// failure.
//
// Fix vs. book1: invoice #1341 appears twice in the source book (a main
// sale line + a separate "broken eggs" line under the same invoice number,
// same pattern book1 had for #1326). Book1's script generated an identical
// saleNumber for both, so the idempotency check silently skipped the
// second line on --commit (data loss, not caught until now). This script
// disambiguates repeated invoice numbers by appending -B, -C, ... to the
// saleNumber for the 2nd+ occurrence, so every row is actually recorded.
//
// IMPORTANT — read before running --commit:
//   This assumes the store's current recorded stock has NOT already been
//   reduced for these sales (i.e. this is genuinely backfilling history the
//   system never saw, not replaying sales it already accounted for). If the
//   current on-hand figure already reflects these 1,718 crates leaving,
//   running this will double-deduct. Confirm that before committing.
//
// Dry-run by default:
//   node packages/db/scripts/import-egg-sales-sept21.mjs
// Apply for real:
//   node packages/db/scripts/import-egg-sales-sept21.mjs --commit --i-have-a-backup [--warehouse-code AES] [--created-by <userId>]
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit") && args.includes("--i-have-a-backup");
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const WAREHOUSE_CODE = opt("warehouse-code", null);
const CREATED_BY = opt("created-by", null);

const rows = JSON.parse(readFileSync(join(__dirname, "data/egg-sales-sept21-import.json"), "utf8"));

// Repeated invoice numbers (e.g. a main sale + a separate "broken eggs"
// line under the same invoice) get -B, -C, ... appended so their
// saleNumbers stay unique instead of colliding.
function assignSaleNumbers(rows) {
  const seen = new Map();
  const suffixes = "BCDEFGH";
  return rows.map((row) => {
    const count = seen.get(row.invoiceNum) ?? 0;
    seen.set(row.invoiceNum, count + 1);
    const saleNumber = count === 0
      ? `ES-SEPT21-${row.invoiceNum}`
      : `ES-SEPT21-${row.invoiceNum}-${suffixes[count - 1]}`;
    return { ...row, saleNumber };
  });
}

function num(v) { return Number(v ?? 0); }

async function resolveWarehouse(companyId) {
  if (WAREHOUSE_CODE) {
    const byCode = await prisma.warehouse.findFirst({ where: { companyId, deletedAt: null, code: WAREHOUSE_CODE } });
    if (!byCode) throw new Error(`No warehouse found with code "${WAREHOUSE_CODE}".`);
    return byCode;
  }
  const candidates = await prisma.warehouse.findMany({
    where: { companyId, deletedAt: null, status: "ACTIVE", type: "EGG_STORE", OR: [{ name: { contains: "Akoko" } }, { code: "AES" }] }
  });
  if (candidates.length === 0) throw new Error('No Akoko Solution Egg Store warehouse found — pass --warehouse-code <code> explicitly.');
  if (candidates.length > 1) throw new Error(`Found ${candidates.length} matching warehouses — pass --warehouse-code <code> to disambiguate: ${candidates.map((w) => `${w.name} (${w.code})`).join(", ")}`);
  return candidates[0];
}

async function resolveEggsProduct(companyId) {
  const product = await prisma.product.findFirst({ where: { companyId, deletedAt: null, sku: "EG" }, select: { id: true, piecesPerUnit: true } });
  if (!product) throw new Error('No "Eggs" product (SKU "EG") found — set it up in the catalog first.');
  return product;
}

// Mirrors EggSalesService's private consumeFifoTx exactly.
async function consumeFifoTx(tx, companyId, userId, item, quantity, referenceType, referenceId, notes) {
  let remaining = quantity;
  const batches = await tx.stockBatch.findMany({
    where: { companyId, inventoryItemId: item.id, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
  });
  const available = batches.reduce((sum, b) => sum + num(b.quantityRemaining), 0);
  if (available < quantity) {
    throw new Error(`Only ${available} crate(s) available — cannot backfill ${quantity}.`);
  }
  for (const batch of batches) {
    if (remaining <= 0) break;
    const issue = Math.min(remaining, num(batch.quantityRemaining));
    const batchUpdate = await tx.stockBatch.updateMany({ where: { id: batch.id, quantityRemaining: { gte: issue } }, data: { quantityRemaining: { decrement: issue } } });
    if (batchUpdate.count === 0) throw new Error("Stock batch changed concurrently — aborting this row.");
    await tx.stockBatch.updateMany({ where: { id: batch.id, quantityRemaining: 0 }, data: { status: "CONSUMED" } });
    await tx.stockMovement.create({
      data: {
        companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, stockBatchId: batch.id,
        fromWarehouseId: item.warehouseId, warehouseId: item.warehouseId, farmId: item.farmId, productionSiteId: item.productionSiteId,
        uomId: item.uomId, movementType: "SALE_DISPATCH", quantity: issue, unitCost: batch.unitCost,
        referenceType, referenceId, notes, createdById: userId
      }
    });
    remaining -= issue;
  }
  if (remaining > 0) throw new Error("Stock batches on hand cover less than required — inventory out of sync.");
  const itemUpdate = await tx.inventoryItem.updateMany({ where: { id: item.id, quantityOnHand: { gte: quantity } }, data: { quantityOnHand: { decrement: quantity }, updatedById: userId } });
  if (itemUpdate.count === 0) throw new Error("Insufficient stock — possibly consumed concurrently.");
}

async function main() {
  const withSaleNumbers = assignSaleNumbers(rows);
  console.log(`${COMMIT ? "COMMIT MODE" : "DRY RUN"} — ${withSaleNumbers.length} invoice(s) to import\n`);

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No company found.");
  const warehouse = await resolveWarehouse(company.id);
  const product = await resolveEggsProduct(company.id);
  console.log(`Warehouse: ${warehouse.name} (${warehouse.code ?? warehouse.id})`);
  console.log(`Eggs product: ${product.id} (${product.piecesPerUnit} pieces/crate)\n`);

  const item = await prisma.inventoryItem.findFirst({ where: { companyId: company.id, warehouseId: warehouse.id, productId: product.id, deletedAt: null } });
  if (!item) throw new Error(`No egg stock recorded yet in "${warehouse.name}".`);
  console.log(`Current on-hand: ${item.quantityOnHand} crate(s)`);
  const totalNeeded = withSaleNumbers.reduce((s, r) => s + r.quantityCrates, 0);
  console.log(`This import needs: ${totalNeeded} crate(s) total\n`);
  if (num(item.quantityOnHand) < totalNeeded) {
    console.log(`WARNING: current stock (${item.quantityOnHand}) is less than the total this import needs (${totalNeeded}) — later rows will fail once stock runs out. Investigate before running --commit.\n`);
  }

  let imported = 0, failed = 0;
  for (const row of withSaleNumbers) {
    const quantityPieces = Math.round(row.quantityCrates * (product.piecesPerUnit || 30));
    const totalAmount = Number((row.quantityCrates * row.unitPriceCrate).toFixed(4));
    const notesParts = [`Invoice #${row.invoiceNum}`];
    if (row.memo) notesParts.push(row.memo);
    const notes = notesParts.join(" — ");

    console.log(`${COMMIT ? "IMPORTING" : "would import"}  ${row.saleNumber}  ${row.saleDate}  ${row.buyerName || "(no name)"}  ${row.quantityCrates} ct @ GHS${row.unitPriceCrate} = GHS${totalAmount}`);
    if (!COMMIT) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.eggSale.findFirst({ where: { companyId: company.id, saleNumber: row.saleNumber } });
        if (existing) { console.log(`  [skip] already imported as ${row.saleNumber}`); return; }
        const created = await tx.eggSale.create({
          data: {
            companyId: company.id, branchId: warehouse.branchId, warehouseId: warehouse.id, saleNumber: row.saleNumber,
            saleDate: new Date(`${row.saleDate}T00:00:00.000Z`), buyerName: row.buyerName || undefined,
            quantityPieces, quantityCrates: row.quantityCrates, unitPriceCrate: row.unitPriceCrate, totalAmount, notes,
            createdById: CREATED_BY ?? undefined
          }
        });
        await consumeFifoTx(tx, company.id, CREATED_BY, item, row.quantityCrates, "EggSale", created.id, notes);
      });
      imported++;
    } catch (err) {
      console.log(`  [FAIL] ${row.saleNumber}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${COMMIT ? `Done — ${imported} imported, ${failed} failed.` : "Dry run only — re-run with --commit --i-have-a-backup to apply."}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
