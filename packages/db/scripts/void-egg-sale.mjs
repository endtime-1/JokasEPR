// Owner request (2026-09-21): invoice #1370 (ES-SEPT21-1370, imported by
// import-egg-sales-sept21.mjs) was confirmed to be an entry error and needs
// to be voided — not part of the real Sept 14-21 batch. Voiding it frees up
// its 40 crates, which the still-pending invoice #1371 (ES-SEPT21-1371,
// failed on insufficient stock during the sept21 import) needs.
//
// Mirrors EggSalesService.voidSale exactly (soft-delete + reversing
// RETURN_IN stock movement per original SALE_DISPATCH), rather than a raw
// delete, for the same reason the import scripts mirror createSale's logic.
//
// Dry-run by default:
//   node packages/db/scripts/void-egg-sale.mjs --sale-number ES-SEPT21-1370
// Apply for real:
//   node packages/db/scripts/void-egg-sale.mjs --sale-number ES-SEPT21-1370 --commit --i-have-a-backup [--created-by <userId>]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit") && args.includes("--i-have-a-backup");
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const SALE_NUMBER = opt("sale-number", null);
const CREATED_BY = opt("created-by", null);

if (!SALE_NUMBER) {
  console.error("Usage: node void-egg-sale.mjs --sale-number <ES-...> [--commit --i-have-a-backup] [--created-by <userId>]");
  process.exit(1);
}

async function main() {
  console.log(`${COMMIT ? "COMMIT MODE" : "DRY RUN"} — voiding sale "${SALE_NUMBER}"\n`);

  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No company found.");

  const sale = await prisma.eggSale.findFirst({ where: { companyId: company.id, saleNumber: SALE_NUMBER, deletedAt: null } });
  if (!sale) throw new Error(`No active egg sale found with saleNumber "${SALE_NUMBER}" (already voided, or never existed).`);

  const dispatches = await prisma.stockMovement.findMany({
    where: { companyId: company.id, referenceType: "EggSale", referenceId: sale.id, movementType: "SALE_DISPATCH", deletedAt: null }
  });
  if (!dispatches.length) throw new Error("No stock movement found for this sale to reverse — cannot void safely.");

  console.log(`Sale: ${sale.saleNumber}  ${sale.saleDate.toISOString().slice(0, 10)}  ${sale.buyerName || "(no name)"}  ${sale.quantityCrates} ct @ GHS${sale.unitPriceCrate} = GHS${sale.totalAmount}`);
  console.log(`Stock movements to reverse: ${dispatches.length} (total ${dispatches.reduce((s, d) => s + Number(d.quantity), 0)} crate(s) returning to stock)\n`);

  if (!COMMIT) {
    console.log("Dry run only — re-run with --commit --i-have-a-backup to apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const voided = await tx.eggSale.updateMany({ where: { id: sale.id, deletedAt: null }, data: { deletedAt: new Date(), updatedById: CREATED_BY ?? undefined } });
    if (voided.count === 0) throw new Error("This sale was already voided.");

    for (const movement of dispatches) {
      if (!movement.stockBatchId || !movement.inventoryItemId) continue;
      await tx.stockBatch.update({ where: { id: movement.stockBatchId }, data: { quantityRemaining: { increment: movement.quantity }, status: "AVAILABLE" } });
      await tx.inventoryItem.update({ where: { id: movement.inventoryItemId }, data: { quantityOnHand: { increment: movement.quantity } } });
      await tx.stockMovement.create({
        data: {
          companyId: company.id,
          branchId: movement.branchId,
          productId: movement.productId,
          inventoryItemId: movement.inventoryItemId,
          stockBatchId: movement.stockBatchId,
          toWarehouseId: movement.warehouseId,
          warehouseId: movement.warehouseId,
          farmId: movement.farmId,
          productionSiteId: movement.productionSiteId,
          uomId: movement.uomId,
          movementType: "RETURN_IN",
          quantity: movement.quantity,
          unitCost: movement.unitCost,
          referenceType: "EggSale",
          referenceId: sale.id,
          notes: `Voided egg sale ${sale.saleNumber} — entered in error`,
          createdById: CREATED_BY ?? undefined
        }
      });
    }
  });

  console.log(`Done — ${sale.saleNumber} voided, ${dispatches.reduce((s, d) => s + Number(d.quantity), 0)} crate(s) returned to stock.`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
