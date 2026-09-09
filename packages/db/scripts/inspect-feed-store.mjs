/*
 * Read-only: the Jokas Feed store, per product — on-hand vs the sum of its
 * AVAILABLE stock batches (a mismatch = drift), plus a count of feed
 * consumption records that never deducted stock.
 *
 *   node packages/db/scripts/inspect-feed-store.mjs
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const W = "ae537045-e7ab-4c2d-8ea9-f113d19c3243"; // Jokas Feed
const COMPANY = "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const n = (x) => Math.round(Number(x) * 10000) / 10000;

async function main() {
  const items = await prisma.inventoryItem.findMany({
    where: { warehouseId: W, deletedAt: null },
    select: { id: true, quantityOnHand: true, product: { select: { sku: true, name: true } } },
  });
  console.log(`\n=== Jokas Feed store — ${items.length} products ===\n`);
  console.log(`  ${"SKU".padEnd(8)} ${"product".padEnd(22)} ${"on hand".padStart(12)} ${"batch sum".padStart(12)}  drift`);
  for (const it of items) {
    const batches = await prisma.stockBatch.findMany({ where: { inventoryItemId: it.id, deletedAt: null, status: "AVAILABLE" }, select: { quantityRemaining: true } });
    const sum = batches.reduce((s, b) => s + Number(b.quantityRemaining), 0);
    const drift = n(Number(it.quantityOnHand) - sum);
    console.log(`  ${(it.product?.sku ?? "?").padEnd(8)} ${(it.product?.name ?? "?").slice(0, 22).padEnd(22)} ${String(n(it.quantityOnHand)).padStart(12)} ${String(n(sum)).padStart(12)}  ${drift === 0 ? "ok" : (drift > 0 ? "+" : "") + drift}`);
  }

  const recs = await prisma.feedConsumptionRecord.findMany({
    where: { companyId: COMPANY, deletedAt: null },
    select: { id: true, recordDate: true, quantityKg: true, feedProductId: true },
    orderBy: { recordDate: "desc" },
    take: 500,
  });
  const moved = new Set((await prisma.stockMovement.findMany({
    where: { referenceType: "FeedConsumptionRecord", referenceId: { in: recs.map((r) => r.id) }, deletedAt: null },
    select: { referenceId: true },
  })).map((m) => m.referenceId));
  let noProd = 0, uncredited = 0, uncreditedKg = 0;
  const byDay = new Map();
  for (const r of recs) {
    if (!r.feedProductId) noProd++;
    if (!moved.has(r.id)) { uncredited++; uncreditedKg += Number(r.quantityKg); }
    const k = r.recordDate.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) || 0) + Number(r.quantityKg));
  }
  console.log(`\n  feed consumption records (last ${recs.length}): ${noProd} have NO product,  ${uncredited} never deducted stock (${n(uncreditedKg)} kg)`);
  console.log(`\n  kg logged per day (recent):`);
  for (const [d, kg] of [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)) console.log(`     ${d}  ${n(kg)} kg`);
  console.log();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
