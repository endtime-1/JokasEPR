/*
 * Deduct feed-consumption records that were logged but never drew stock from
 * the feed store (the form didn't attach a warehouse/product, so the record
 * saved but no movement was written). For each such record it consumes the
 * kg FIFO from the feed store's batches for that product, decrements the
 * InventoryItem, and writes the PRODUCTION_INPUT movement dated to the
 * record. Idempotent — a record that already has its movement is skipped.
 *
 *   node packages/db/scripts/reapply-feed-deductions.mjs                          # dry run, records on/after --since
 *   node packages/db/scripts/reapply-feed-deductions.mjs --since 2026-09-06
 *   node packages/db/scripts/reapply-feed-deductions.mjs --default-product L001   # stamp this feed onto records with no product
 *   node packages/db/scripts/reapply-feed-deductions.mjs --commit --i-have-a-backup
 *
 * Default --since is 2026-09-06. A record whose product has no stock is
 * reported and skipped (the run continues).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const A = process.argv.slice(2);
const COMMIT = A.includes("--commit");
if (COMMIT && !A.includes("--i-have-a-backup")) { console.error("Refusing --commit without --i-have-a-backup."); process.exit(1); }
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };
const SINCE = new Date((opt("since", "2026-09-06")) + "T00:00:00.000Z");
const FEED_STORE = opt("store", "ae537045-e7ab-4c2d-8ea9-f113d19c3243"); // Jokas Feed
const DEFAULT_SKU = opt("default-product", null); // e.g. "L001" — stamped onto no-product records
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const round = (n) => Math.round(n * 10000) / 10000;

async function main() {
  const store = await prisma.warehouse.findFirst({ where: { id: FEED_STORE }, select: { name: true } });
  console.log(`\n=== RE-APPLY FEED DEDUCTIONS — ${COMMIT ? "!!! COMMIT !!!" : "dry run"} ===`);
  console.log(`  feed store: ${store?.name}   records on/after ${SINCE.toISOString().slice(0, 10)}${DEFAULT_SKU ? `   default product for blanks: ${DEFAULT_SKU}` : ""}\n`);

  const products = await prisma.product.findMany({ where: { companyId: COMPANY }, select: { id: true, sku: true, name: true } });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const defaultProd = DEFAULT_SKU ? bySku.get(DEFAULT_SKU) : null;
  if (DEFAULT_SKU && !defaultProd) { console.error(`  no product with SKU ${DEFAULT_SKU}`); process.exit(1); }

  const recs = await prisma.feedConsumptionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null, recordDate: { gte: SINCE } },
    orderBy: { recordDate: "asc" },
    select: { id: true, recordDate: true, quantityKg: true, feedProductId: true },
  });
  const movedIds = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "FeedConsumptionRecord", referenceId: { in: recs.map((r) => r.id) }, deletedAt: null },
    select: { referenceId: true },
  })).map((m) => m.referenceId));

  // current stock per product in the feed store
  const items = await prisma.inventoryItem.findMany({ where: { warehouseId: FEED_STORE, deletedAt: null }, select: { productId: true, quantityOnHand: true } });
  const stock = new Map(items.map((it) => [it.productId, Number(it.quantityOnHand)]));

  const todo = [];
  let noProduct = 0, needStamp = 0;
  const shortfall = new Map();
  for (const r of recs) {
    if (movedIds.has(r.id)) continue;
    let pid = r.feedProductId;
    let stamp = false;
    if (!pid) {
      if (!defaultProd) { noProduct++; console.log(`  ${r.recordDate.toISOString().slice(0, 10)}  ${Number(r.quantityKg)} kg  — NO product (pass --default-product to fix)`); continue; }
      pid = defaultProd.id; stamp = true; needStamp++;
    }
    const p = byId.get(pid);
    const have = stock.get(pid) ?? 0;
    if (have < Number(r.quantityKg)) {
      shortfall.set(p?.sku ?? pid, (shortfall.get(p?.sku ?? pid) ?? 0) + Number(r.quantityKg));
      console.log(`  ${r.recordDate.toISOString().slice(0, 10)}  ${String(Number(r.quantityKg)).padStart(8)} kg  ${p?.sku ?? "?"}  — SKIP, only ${round(have)} kg of that feed in store`);
      continue;
    }
    stock.set(pid, have - Number(r.quantityKg)); // reserve so the dry run is realistic
    todo.push({ ...r, pid, stamp });
    console.log(`  ${r.recordDate.toISOString().slice(0, 10)}  ${String(Number(r.quantityKg)).padStart(8)} kg  ${p?.sku ?? "?"} ${p?.name ?? ""}${stamp ? "  (stamped)" : ""}`);
  }
  const totalKg = todo.reduce((s, r) => s + Number(r.quantityKg), 0);
  console.log(`\n  to deduct: ${todo.length} records = ${round(totalKg)} kg` + (needStamp ? `  (${needStamp} get product ${DEFAULT_SKU})` : "") + (noProduct ? `  · ${noProduct} still have no product` : ""));
  if (shortfall.size) console.log(`  SKIPPED for lack of stock: ` + [...shortfall].map(([s, kg]) => `${s} ${round(kg)}kg`).join(", "));

  if (!COMMIT) { console.log("\n  (dry run — nothing written)\n"); await prisma.$disconnect(); return; }

  let done = 0;
  for (const r of todo) {
    await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { warehouseId: FEED_STORE, productId: r.pid, deletedAt: null }, select: { id: true, companyId: true, branchId: true, farmId: true, productionSiteId: true, uomId: true } });
      if (!item) { console.log(`  ${r.id}: no inventory item — skipped`); return; }
      if (r.stamp) await tx.feedConsumptionRecord.update({ where: { id: r.id }, data: { feedProductId: r.pid, warehouseId: FEED_STORE } });
      let remaining = Number(r.quantityKg);
      const batches = await tx.stockBatch.findMany({ where: { inventoryItemId: item.id, deletedAt: null, quantityRemaining: { gt: 0 }, status: "AVAILABLE" }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(b.quantityRemaining));
        const upd = await tx.stockBatch.updateMany({ where: { id: b.id, quantityRemaining: { gte: take } }, data: { quantityRemaining: { decrement: take } } });
        if (upd.count === 0) throw new Error(`${r.id}: batch raced`);
        await tx.stockMovement.create({ data: {
          companyId: item.companyId, branchId: item.branchId, productId: r.pid, inventoryItemId: item.id, stockBatchId: b.id,
          fromWarehouseId: FEED_STORE, warehouseId: FEED_STORE, farmId: item.farmId ?? undefined, productionSiteId: item.productionSiteId ?? undefined, uomId: item.uomId,
          movementType: "PRODUCTION_INPUT", quantity: round(take),
          referenceType: "FeedConsumptionRecord", referenceId: r.id,
          notes: "Feed consumption (stock deduction re-applied)", movementDate: r.recordDate,
        } });
        remaining -= take;
      }
      if (remaining > 0.0001) throw new Error(`${r.id}: feed store ran short mid-run — stopped`);
      const dec = await tx.inventoryItem.updateMany({ where: { id: item.id, quantityOnHand: { gte: Number(r.quantityKg) } }, data: { quantityOnHand: { decrement: Number(r.quantityKg) } } });
      if (dec.count === 0) throw new Error(`${r.id}: on-hand below ${Number(r.quantityKg)} kg — stopped`);
      done++;
    }, { timeout: 30000 });
  }
  console.log(`\n  DONE — ${done} records deducted, ${round(totalKg)} kg\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
