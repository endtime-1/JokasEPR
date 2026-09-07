/*
 * ONE-TIME: soft-delete ALL inventory / feed-production / soya-processing data
 * EXCEPT the current stock in the two farm stores (Jokas Feed + Jokas Egg).
 *
 *   node packages/db/scripts/wipe-inventory-keep-stores.mjs                 # DRY RUN — counts only
 *   node packages/db/scripts/wipe-inventory-keep-stores.mjs --commit --i-have-a-backup
 *
 * Everything is SOFT-deleted (deletedAt = now) — the app filters deletedAt:null
 * everywhere, so it all disappears, and it's fully reversible from the DB.
 * GoodsReceivedItem has no deletedAt → hard-deleted.
 *
 * KEPT: InventoryItem / StockBatch / StockMovement / FeedReceiptRecord scoped to
 * Jokas Feed or Jokas Egg. Poultry records (mortality, eggs, transfers, feed
 * consumption) are NOT touched by this script.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup. Run infra/vps/backup.sh first."); process.exit(1); }

const KEEP = [
  "ae537045-e7ab-4c2d-8ea9-f113d19c3243", // Jokas Feed
  "517cd1de-1b9d-4d26-9e31-ac3fc906bf33", // Jokas Egg
];
const notKeptWh = { notIn: KEEP };
const now = new Date();

// [label, model, where, mode]  mode: "soft" (deletedAt) | "hard" (delete)
const TARGETS = [
  // stock scoped to non-kept warehouses
  ["StockMovement (non-kept wh)", "stockMovement", { deletedAt: null, AND: [{ NOT: { warehouseId: { in: KEEP } } }, { NOT: { fromWarehouseId: { in: KEEP } } }, { NOT: { toWarehouseId: { in: KEEP } } }] }, "soft"],
  ["StockExpiryAlert", "stockExpiryAlert", { deletedAt: null, stockBatch: { warehouseId: notKeptWh } }, "soft"],
  ["StockReservation", "stockReservation", { deletedAt: null, warehouseId: notKeptWh }, "soft"],
  ["StockReservation (via batch)", "stockReservation", { deletedAt: null, stockBatch: { warehouseId: notKeptWh } }, "soft"],
  ["StockAdjustment", "stockAdjustment", { deletedAt: null, inventoryItem: { warehouseId: notKeptWh } }, "soft"],
  ["StockReorderLevel", "stockReorderLevel", { deletedAt: null, inventoryItem: { warehouseId: notKeptWh } }, "soft"],
  ["InventoryValuation", "inventoryValuation", { deletedAt: null, inventoryItem: { warehouseId: notKeptWh } }, "soft"],
  ["ApprovedBatch", "approvedBatch", { deletedAt: null, stockBatch: { warehouseId: notKeptWh } }, "soft"],
  ["StockApproval", "stockApproval", { deletedAt: null }, "soft"],
  ["InventoryAvailabilityCheck", "inventoryAvailabilityCheck", { deletedAt: null }, "soft"],
  ["StockTransfer", "stockTransfer", { deletedAt: null, AND: [{ NOT: { fromWarehouseId: { in: KEEP } } }, { NOT: { toWarehouseId: { in: KEEP } } }] }, "soft"],
  ["StockBatch (non-kept wh)", "stockBatch", { deletedAt: null, warehouseId: notKeptWh }, "soft"],
  ["InventoryItem (non-kept wh)", "inventoryItem", { deletedAt: null, warehouseId: notKeptWh }, "soft"],
  ["FeedReceiptRecord (non-kept wh)", "feedReceiptRecord", { deletedAt: null, warehouseId: notKeptWh }, "soft"],

  // purchase goods-received
  ["GoodsReceivedItem", "goodsReceivedItem", {}, "hard"],
  ["GoodsReceivedNote", "goodsReceivedNote", { deletedAt: null }, "soft"],

  // feed production (mill output)
  ["FeedRawMaterialUsage", "feedRawMaterialUsage", { deletedAt: null }, "soft"],
  ["FeedQualityCheck", "feedQualityCheck", { deletedAt: null }, "soft"],
  ["FeedPackagingRecord", "feedPackagingRecord", { deletedAt: null }, "soft"],
  ["FeedProductionCost", "feedProductionCost", { deletedAt: null }, "soft"],
  ["FeedInternalTransfer", "feedInternalTransfer", { deletedAt: null }, "soft"],
  ["FeedExternalSale", "feedExternalSale", { deletedAt: null }, "soft"],
  ["FinishedFeedStock", "finishedFeedStock", { deletedAt: null }, "soft"],
  ["FeedProductionBatch", "feedProductionBatch", { deletedAt: null }, "soft"],
  ["FeedProductionOrder", "feedProductionOrder", { deletedAt: null }, "soft"],

  // soya processing
  ["SoyaProductionCost", "soyaProductionCost", { deletedAt: null }, "soft"],
  ["SoyaQualityCheck", "soyaQualityCheck", { deletedAt: null }, "soft"],
  ["SoyaWasteRecord", "soyaWasteRecord", { deletedAt: null }, "soft"],
  ["SoyaCakeOutput", "soyaCakeOutput", { deletedAt: null }, "soft"],
  ["SoyaOilOutput", "soyaOilOutput", { deletedAt: null }, "soft"],
  ["SoyaSalesLink", "soyaSalesLink", { deletedAt: null }, "soft"],
  ["SoyaInternalTransfer", "soyaInternalTransfer", { deletedAt: null }, "soft"],
  ["SoyaProcessingBatch", "soyaProcessingBatch", { deletedAt: null }, "soft"],
  ["SoyaBeanIntake", "soyaBeanIntake", { deletedAt: null }, "soft"],
];

async function main() {
  console.log(`\n${"=".repeat(64)}\n  WIPE INVENTORY (keep Jokas Feed + Jokas Egg) — ${COMMIT ? "!!! COMMIT !!!" : "dry run"}\n${"=".repeat(64)}\n`);

  // what survives
  for (const wh of KEEP) {
    const w = await prisma.warehouse.findFirst({ where: { id: wh }, select: { name: true } });
    const items = await prisma.inventoryItem.findMany({ where: { warehouseId: wh, deletedAt: null }, select: { quantityOnHand: true, product: { select: { name: true } } } });
    console.log(`  KEEP — ${w?.name}: ${items.length} items, ` + items.filter((i) => Number(i.quantityOnHand) !== 0).map((i) => `${i.product.name} ${Number(i.quantityOnHand)}`).join(" · "));
  }
  console.log("");

  let softTotal = 0, hardTotal = 0;
  for (const [label, model, where, mode] of TARGETS) {
    const m = prisma[model];
    if (!m) { console.log(`  ${label.padEnd(34)} (model not found — skipped)`); continue; }
    let count;
    try { count = await m.count({ where }); } catch (e) { console.log(`  ${label.padEnd(34)} ERR ${String(e.message).slice(0, 60)}`); continue; }
    console.log(`  ${label.padEnd(34)} ${mode === "hard" ? "delete" : "soft-del"} ${count}`);
    if (!COMMIT || count === 0) { if (mode === "hard") hardTotal += count; else softTotal += count; continue; }
    if (mode === "hard") { const r = await m.deleteMany({ where }); hardTotal += r.count; }
    else { const r = await m.updateMany({ where, data: { deletedAt: now } }); softTotal += r.count; }
  }

  console.log(`\n  ${COMMIT ? "soft-deleted" : "would soft-delete"} ${softTotal} rows · ${COMMIT ? "hard-deleted" : "would hard-delete"} ${hardTotal} rows`);
  if (!COMMIT) console.log("\n  (dry run — nothing written. add --commit --i-have-a-backup)\n");
  else console.log("\n  >>> DONE\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
