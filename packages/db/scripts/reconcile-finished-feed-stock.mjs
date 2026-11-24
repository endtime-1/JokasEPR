// Brings FinishedFeedStock (per-batch finished feed, what the Feed Mill's
// Finished Feed Inventory page shows) back in line with InventoryItem for feed
// sold through sales orders before releases started deducting it.
//
// For each warehouse + product that has batch rows: if the batch total is MORE
// than the warehouse InventoryItem.quantityOnHand, the excess is taken off the
// batch rows, oldest first (same order the sales release uses). Batch totals
// below inventory are reported but never raised. DRY RUN unless --apply.
//
//   cd /opt/jokas/app && set -a; . ./.env; set +a
//   node packages/db/scripts/reconcile-finished-feed-stock.mjs          # preview
//   node packages/db/scripts/reconcile-finished-feed-stock.mjs --apply  # write
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const n = (v) => Number(v ?? 0);

async function main() {
  const rows = await prisma.finishedFeedStock.findMany({
    where: { deletedAt: null, quantityKg: { gt: 0 } },
    orderBy: { createdAt: "asc" },
    include: { warehouse: { select: { name: true } }, product: { select: { name: true, sku: true } } }
  });
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.companyId}|${r.warehouseId}|${r.productId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let fixed = 0;
  for (const list of groups.values()) {
    const first = list[0];
    const inv = await prisma.inventoryItem.findFirst({
      where: { companyId: first.companyId, warehouseId: first.warehouseId, productId: first.productId, deletedAt: null },
      select: { quantityOnHand: true }
    });
    const onHand = n(inv?.quantityOnHand);
    const batchTotal = list.reduce((s, r) => s + n(r.quantityKg), 0);
    const label = `${first.warehouse.name} · ${first.product.name} (${first.product.sku})`;
    const excess = Number((batchTotal - onHand).toFixed(4));
    if (excess <= 0) {
      console.log(`${excess < 0 ? "BELOW " : "OK    "} ${label}: batches ${batchTotal} · inventory ${onHand}${excess < 0 ? " (not raised)" : ""}`);
      continue;
    }
    console.log(`FIX   ${label}: batches ${batchTotal} · inventory ${onHand} → remove ${excess} kg`);
    let remaining = excess;
    for (const r of list) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, n(r.quantityKg));
      const left = Number((n(r.quantityKg) - take).toFixed(4));
      console.log(`        batch row ${r.id}: ${n(r.quantityKg)} → ${left}`);
      if (apply) {
        await prisma.finishedFeedStock.update({
          where: { id: r.id },
          data: { quantityKg: left, bag50KgCount: Math.max(0, Math.floor(left / 50)) }
        });
      }
      remaining -= take;
    }
    fixed++;
  }
  console.log(`\n${apply ? "APPLIED" : "DRY RUN (nothing written; re-run with --apply)"} — ${fixed} product/warehouse group(s) adjusted.`);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
