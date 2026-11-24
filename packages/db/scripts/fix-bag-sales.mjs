// Feed is sold in 50 kg bags but stock is kept in kg; older releases/returns
// moved 1 kg per bag. This takes the missing kg off warehouse stock, stock
// batches and the Feed Mill finished-feed batches. PREVIEW unless --apply.
// Safe to re-run: earlier corrections (ADJUSTMENT_OUT / "BagCorrection") are
// subtracted, and removal is clamped at the stock actually on hand.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient(), apply = process.argv.includes("--apply"), n = (v) => Number(v ?? 0);

const isFeed = async (id) => {
  const x = await p.product.findFirst({ where: { id }, select: { feedForm: true, _count: { select: { feedFormulaFinishedProducts: true } } } });
  return !!x && (!!x.feedForm || x._count.feedFormulaFinishedProducts > 0);
};
const feedCache = new Map();
const feed = async (id) => (feedCache.has(id) ? feedCache.get(id) : (feedCache.set(id, await isFeed(id)), feedCache.get(id)));

const groups = new Map(); // warehouse|product -> { missing, ...ids }
const add = (w, pid, kg, meta) => { const k = w + "|" + pid; const g = groups.get(k) ?? { w, pid, kg: 0, ...meta }; g.kg += kg; groups.set(k, g); };

const orders = await p.salesOrder.findMany({ where: { status: "FULFILLED", deletedAt: null }, include: { items: true } });
for (const o of orders) {
  const mv = await p.stockMovement.findMany({ where: { referenceType: "SalesOrder", referenceId: o.id, movementType: "SALE_DISPATCH" } });
  for (const i of o.items) {
    if (!(await feed(i.productId))) continue;
    const moved = mv.filter((m) => m.productId === i.productId).reduce((s, m) => s + n(m.quantity), 0);
    const missing = n(i.quantity) * 50 - moved;
    if (missing > 0) add(o.warehouseId, i.productId, missing, { branchId: o.branchId });
  }
}
const rets = await p.salesReturn.findMany({ where: { status: "POSTED" } });
for (const r of rets) {
  if (!(await feed(r.productId))) continue;
  const mv = await p.stockMovement.findMany({ where: { referenceType: "SalesReturn", referenceId: r.id, movementType: "RETURN_IN" } });
  const missing = n(r.quantity) * 50 - mv.reduce((s, m) => s + n(m.quantity), 0);
  if (missing > 0) add(r.warehouseId, r.productId, -missing, { branchId: r.branchId });
}

let total = 0;
for (const g of groups.values()) {
  const done = await p.stockMovement.findMany({ where: { referenceType: "BagCorrection", warehouseId: g.w, productId: g.pid } });
  const want = Number((g.kg - done.reduce((s, m) => s + n(m.quantity), 0)).toFixed(4));
  const inv = await p.inventoryItem.findFirst({ where: { warehouseId: g.w, productId: g.pid, deletedAt: null }, include: { product: true } });
  if (!inv || want <= 0) continue;
  const onHand = n(inv.quantityOnHand), take = Math.min(want, onHand);
  console.log(inv.product.name.padEnd(26), "on hand", onHand, "| remove", want, "->", Number((onHand - take).toFixed(4)), want > onHand ? `  (SHORT by ${Number((want - onHand).toFixed(2))} kg — clamped to 0)` : "");
  total++;
  if (!apply || take <= 0) continue;
  await p.$transaction(async (tx) => {
    let rest = take;
    const lots = await tx.stockBatch.findMany({ where: { warehouseId: g.w, productId: g.pid, quantityRemaining: { gt: 0 }, deletedAt: null }, orderBy: { createdAt: "asc" } });
    for (const b of lots) { if (rest <= 0) break; const t = Math.min(rest, n(b.quantityRemaining)); await tx.stockBatch.update({ where: { id: b.id }, data: { quantityRemaining: { decrement: t }, ...(t >= n(b.quantityRemaining) ? { status: "CONSUMED" } : {}) } }); rest -= t; }
    await tx.inventoryItem.update({ where: { id: inv.id }, data: { quantityOnHand: { decrement: take } } });
    rest = take;
    const ff = await tx.finishedFeedStock.findMany({ where: { warehouseId: g.w, productId: g.pid, quantityKg: { gt: 0 }, deletedAt: null }, orderBy: { createdAt: "asc" } });
    for (const r of ff) { if (rest <= 0) break; const t = Math.min(rest, n(r.quantityKg)), left = Number((n(r.quantityKg) - t).toFixed(4)); await tx.finishedFeedStock.update({ where: { id: r.id }, data: { quantityKg: left, bag50KgCount: Math.floor(left / 50) } }); rest -= t; }
    await tx.stockMovement.create({ data: { companyId: inv.companyId, branchId: inv.branchId, productId: g.pid, inventoryItemId: inv.id, warehouseId: g.w, fromWarehouseId: g.w, uomId: inv.uomId, movementType: "ADJUSTMENT_OUT", quantity: take, referenceType: "BagCorrection", notes: "Feed sales were deducted per bag instead of per 50 kg bag" } });
  });
}
console.log(apply ? "APPLIED" : "PREVIEW ONLY (nothing written; add --apply)", "-", total, "product(s)");
await p.$disconnect();
