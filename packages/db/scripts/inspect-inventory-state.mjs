// READ-ONLY. Dumps every warehouse's stock + the records that reference it, so
// a "wipe everything except the Jokas Feed + Jokas Egg stores" can be scoped
// safely. Writes nothing.
//
//   cd /opt/jokas/app && set -a; . ./.env; set +a
//   node packages/db/scripts/inspect-inventory-state.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const n = (v) => Number(v ?? 0);
const safe = async (p) => { try { return await p; } catch { return "?"; } };

const KEEP = new Set([
  "ae537045-e7ab-4c2d-8ea9-f113d19c3243", // Jokas Feed
  "517cd1de-1b9d-4d26-9e31-ac3fc906bf33", // Jokas Egg
]);

async function main() {
  const whs = await prisma.warehouse.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, type: true }, orderBy: { name: "asc" } });

  console.log("=== WAREHOUSES ===");
  for (const w of whs) {
    const keep = KEEP.has(w.id);
    const items = await prisma.inventoryItem.findMany({ where: { warehouseId: w.id, deletedAt: null }, select: { quantityOnHand: true, product: { select: { name: true, sku: true } } } });
    const batches = await safe(prisma.stockBatch.count({ where: { warehouseId: w.id, deletedAt: null } }));
    const moves = await safe(prisma.stockMovement.count({ where: { OR: [{ warehouseId: w.id }, { fromWarehouseId: w.id }, { toWarehouseId: w.id }] } }));
    const adj = await safe(prisma.stockAdjustment.count({ where: { inventoryItem: { warehouseId: w.id } } }));
    const resv = await safe(prisma.stockReservation.count({ where: { warehouseId: w.id } }));
    const stf = await safe(prisma.stockTransfer.count({ where: { OR: [{ fromWarehouseId: w.id }, { toWarehouseId: w.id }] } }));
    const grn = await safe(prisma.goodsReceivedNote.count({ where: { warehouseId: w.id } }));
    const frc = await safe(prisma.feedReceiptRecord.count({ where: { warehouseId: w.id, deletedAt: null } }));
    const fcons = await safe(prisma.feedConsumptionRecord.count({ where: { warehouseId: w.id, deletedAt: null } }));

    console.log(`\n  ${keep ? "[KEEP]  " : "[WIPE]  "}${w.name}  (${w.code} · ${w.type})`);
    console.log(`     ${w.id}`);
    console.log(`     inventory items ${items.length} · stock batches ${batches} · movements ${moves}`);
    console.log(`     adjustments ${adj} · reservations ${resv} · stock transfers ${stf} · GRNs ${grn} · feed receipts ${frc} · feed-consumption pointing here ${fcons}`);
    for (const it of items.filter((x) => n(x.quantityOnHand) !== 0)) {
      console.log(`        ${it.product.name.padEnd(28)} ${(it.product.sku || "").padEnd(12)} ${n(it.quantityOnHand)}`);
    }
  }

  console.log("\n\n=== GLOBAL TOTALS ===");
  console.log(`  inventory items ${await prisma.inventoryItem.count()} · stock batches ${await prisma.stockBatch.count()} · movements ${await prisma.stockMovement.count()}`);
  console.log(`  stock adjustments ${await safe(prisma.stockAdjustment.count())} · reservations ${await safe(prisma.stockReservation.count())} · stock transfers ${await safe(prisma.stockTransfer.count())}`);
  console.log(`  GRNs ${await safe(prisma.goodsReceivedNote.count())} · feed receipts ${await safe(prisma.feedReceiptRecord.count({ where: { deletedAt: null } }))} · feed production batches ${await safe(prisma.feedProductionBatch.count())} · soya processing batches ${await safe(prisma.soyaProcessingBatch.count())}`);
  console.log(`  finished feed stock rows ${await safe(prisma.finishedFeedStock.count())}`);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
