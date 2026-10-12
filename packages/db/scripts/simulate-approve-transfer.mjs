/*
 * Dry run of "Approve" for one pending stock transfer, against the real DB,
 * inside a transaction that is ALWAYS rolled back — nothing is changed.
 * It repeats the API's FIFO consume step by step (same queries, same guards)
 * and prints where it would fail.
 *
 *   set -a; . ./.env; set +a
 *   node packages/db/scripts/simulate-approve-transfer.mjs STR-2026-0048
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const NUM = process.argv[2];
if (!NUM) { console.error("usage: simulate-approve-transfer.mjs <STR-number>"); process.exit(1); }

class Rollback extends Error {}

async function main() {
  const t = await prisma.stockTransfer.findFirst({ where: { transferNumber: NUM, deletedAt: null } });
  if (!t) { console.log(`${NUM}: not found`); return; }
  console.log(`\n${NUM}: status ${t.status}, qty ${Number(t.quantity)}, from ${t.fromWarehouseId}, product ${t.productId}`);
  const item = await prisma.inventoryItem.findFirst({ where: { companyId: t.companyId, warehouseId: t.fromWarehouseId, productId: t.productId, deletedAt: null } });
  if (!item) { console.log("no active source item"); return; }
  console.log(`source item ${item.id}  on hand ${Number(item.quantityOnHand)}\n`);

  try {
    await prisma.$transaction(async (tx) => {
      let remaining = Number(t.quantity);
      const batches = await tx.stockBatch.findMany({ where: { companyId: t.companyId, inventoryItemId: item.id, deletedAt: null, quantityRemaining: { gt: 0 }, status: "AVAILABLE" }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
      console.log(`${batches.length} usable batch(es) found, in FIFO order`);
      let n = 0;
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(b.quantityRemaining));
        const upd = await tx.stockBatch.updateMany({ where: { id: b.id, quantityRemaining: { gte: take } }, data: { quantityRemaining: { decrement: take } } });
        n++;
        if (upd.count === 0) {
          console.log(`  #${n} ${b.batchNumber}: take ${take} of ${Number(b.quantityRemaining)} -> GUARD FAILED (this is the error)`);
          throw new Rollback("guard");
        }
        remaining -= take;
        if (n <= 5 || remaining <= 0) console.log(`  #${n} ${b.batchNumber}: took ${take} (batch had ${Number(b.quantityRemaining)}), still needed ${remaining}`);
      }
      if (remaining > 1e-9) { console.log(`  ran out of batches with ${remaining} still needed -> "not enough stock" error`); throw new Rollback("short"); }
      const upd = await tx.inventoryItem.updateMany({ where: { id: item.id, quantityOnHand: { gte: Number(t.quantity) } }, data: { quantityOnHand: { decrement: Number(t.quantity) } } });
      console.log(`  item on-hand guard: ${upd.count ? "ok" : "FAILED"}`);
      console.log("\nWould SUCCEED (rolling back, nothing changed).");
      throw new Rollback("done");
    });
  } catch (e) {
    if (!(e instanceof Rollback)) console.log("unexpected error:", e);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
