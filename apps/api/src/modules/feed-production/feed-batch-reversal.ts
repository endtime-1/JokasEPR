import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

// Undoing posted feed production — shared by FeedProductionService (delete a
// batch / an order) and MarketPlanningService (delete an execution, a
// production plan or an approved target, which cascade down to the Feed Mill
// orders and batches they opened). Plain functions rather than a service so
// Market Planning can use them without a module dependency on Feed Mill.

type Db = Prisma.TransactionClient;
type Actor = { id: string; companyId: string };

// Pre-flight, outside the transaction, so the user gets a clear reason. A
// batch whose feed was dispatched to a farm or sold externally has records
// (and, for a sale, an invoice) built on top of it that a stock reversal
// alone can't unwind — those have to be removed first. The finished-goods
// floor guards inside reverseFeedBatchTx catch everything else that moved
// the feed on (sales orders, stock transfers, adjustments).
export async function assertFeedBatchReversible(db: Db, companyId: string, batch: { id: string; batchNumber: string }) {
  const [transfers, sales] = await Promise.all([
    db.feedInternalTransfer.count({ where: { companyId, productionBatchId: batch.id, deletedAt: null } }),
    db.feedExternalSale.count({ where: { companyId, productionBatchId: batch.id, deletedAt: null } })
  ]);
  if (transfers > 0 || sales > 0) {
    throw new BadRequestException(`Batch ${batch.batchNumber} has already been dispatched (farm transfer or external sale) — delete those records first, then try again.`);
  }
}

export async function assertFeedOrdersReversible(db: Db, companyId: string, orderIds: string[]) {
  if (!orderIds.length) return;
  const batches = await db.feedProductionBatch.findMany({
    where: { companyId, productionOrderId: { in: orderIds }, deletedAt: null },
    select: { id: true, batchNumber: true }
  });
  for (const batch of batches) await assertFeedBatchReversible(db, companyId, batch);
}

// Undoes everything posting one batch did:
//  - raw materials: each PRODUCTION_INPUT movement's quantity goes back on
//    the inventory row it came off, and back onto the exact lot it was
//    drawn from (movement.stockBatchId). Batches posted before lots were
//    recorded (or whose lot has since been deleted) fall back to refilling
//    the store's most recent lots with room; anything left over becomes a
//    return lot so lot totals stay equal to on-hand.
//  - finished feed: the batch's own lot and the on-hand quantity come back
//    out, both floor-guarded — if any of it has been sold or moved the
//    whole transaction rolls back.
//  - the batch's stock movements are retired (not reversed) so the
//    warehouse log shows it as gone, matching the soya delete behaviour.
//  - usage, cost, finished-stock and QC rows are soft-deleted, as is the
//    Market Planning execution that posted it (if any); linked production
//    plan progress is rolled back.
// The caller is responsible for the order's own status afterwards.
export async function reverseFeedBatchTx(tx: Db, user: Actor, id: string) {
  const batch = await tx.feedProductionBatch.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
  if (!batch) return;
  const now = new Date();
  const produced = Number(batch.producedQuantityKg);
  // Batches posted from the Feed Mill log their movements against the
  // batch; batches posted from Market Planning's Production Execution log
  // them against the execution record instead.
  const executionId = batch.productionExecutionId ?? null;
  const movementRefs: Prisma.StockMovementWhereInput[] = [{ referenceType: "FeedProductionBatch", referenceId: id }];
  if (executionId) movementRefs.push({ referenceType: "ProductionExecution", referenceId: executionId });

  const inputs = await tx.stockMovement.findMany({
    where: { companyId: user.companyId, OR: movementRefs, movementType: "PRODUCTION_INPUT", deletedAt: null }
  });
  for (const input of inputs) {
    const qty = Number(input.quantity);
    if (qty <= 0 || !input.fromWarehouseId || !input.inventoryItemId) continue;
    let toReturn = qty;
    if (input.stockBatchId) {
      const lot = await tx.stockBatch.findFirst({ where: { id: input.stockBatchId, deletedAt: null }, select: { id: true } });
      if (lot) {
        await tx.stockBatch.update({ where: { id: lot.id }, data: { quantityRemaining: { increment: qty } } });
        toReturn = 0;
      }
    }
    const lots = toReturn <= 0 ? [] : await tx.stockBatch.findMany({
      where: { companyId: user.companyId, warehouseId: input.fromWarehouseId, productId: input.productId, status: "AVAILABLE", deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    for (const lot of lots) {
      if (toReturn <= 0) break;
      const room = Number(lot.quantityReceived) - Number(lot.quantityRemaining);
      if (room <= 0) continue;
      const add = Math.min(room, toReturn);
      await tx.stockBatch.update({ where: { id: lot.id }, data: { quantityRemaining: { increment: add } } });
      toReturn -= add;
    }
    if (toReturn > 0.0001) {
      await tx.stockBatch.create({
        data: {
          companyId: user.companyId,
          branchId: input.branchId,
          warehouseId: input.fromWarehouseId,
          productId: input.productId,
          inventoryItemId: input.inventoryItemId,
          uomId: input.uomId,
          batchNumber: `${batch.batchNumber}-RETURN-${id.slice(0, 8)}`,
          quantityReceived: toReturn,
          quantityRemaining: toReturn,
          unitCost: input.unitCost ?? 0,
          createdById: user.id
        } as Prisma.StockBatchUncheckedCreateInput
      });
    }
    await tx.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: { deletedAt: null, quantityOnHand: { increment: qty }, updatedById: user.id }
    });
  }

  const outputs = await tx.stockMovement.findMany({
    where: { companyId: user.companyId, OR: movementRefs, movementType: "PRODUCTION_OUTPUT", deletedAt: null }
  });
  const soldMsg = `Cannot delete batch ${batch.batchNumber} — some of its finished feed has already been sold, transferred or used, so taking it back out of stock would drive inventory negative.`;
  for (const output of outputs) {
    const qty = Number(output.quantity);
    if (output.stockBatchId) {
      const lotUpdate = await tx.stockBatch.updateMany({
        where: { id: output.stockBatchId, quantityRemaining: { gte: qty } },
        data: { quantityRemaining: { decrement: qty }, deletedAt: now, batchNumber: `${batch.batchNumber}__DELETED_${id}` }
      });
      if (lotUpdate.count === 0) throw new BadRequestException(soldMsg);
    }
    const invUpdate = output.inventoryItemId
      ? await tx.inventoryItem.updateMany({ where: { id: output.inventoryItemId, quantityOnHand: { gte: qty } }, data: { quantityOnHand: { decrement: qty }, updatedById: user.id } })
      : { count: 0 };
    if (invUpdate.count === 0) throw new BadRequestException(soldMsg);
  }

  await tx.stockMovement.updateMany({ where: { companyId: user.companyId, OR: movementRefs, deletedAt: null }, data: { deletedAt: now } });
  await tx.feedRawMaterialUsage.updateMany({ where: { companyId: user.companyId, productionBatchId: id, deletedAt: null }, data: { deletedAt: now } });
  await tx.finishedFeedStock.updateMany({ where: { companyId: user.companyId, productionBatchId: id, deletedAt: null }, data: { deletedAt: now } });
  await tx.feedProductionCost.updateMany({ where: { companyId: user.companyId, productionBatchId: id, deletedAt: null }, data: { deletedAt: now } });
  await tx.feedQualityCheck.updateMany({ where: { companyId: user.companyId, productionBatchId: id, deletedAt: null }, data: { deletedAt: now } });
  if (executionId) await tx.productionExecution.updateMany({ where: { id: executionId, deletedAt: null }, data: { deletedAt: now } });

  const order = await tx.feedProductionOrder.findUnique({ where: { id: batch.productionOrderId }, select: { productionPlanItemId: true } });
  if (order?.productionPlanItemId) {
    const planItem = await tx.productionPlanItem.findUnique({
      where: { id: order.productionPlanItemId },
      select: { id: true, productionPlanId: true, plannedQuantityKg: true, producedQuantityKg: true }
    });
    if (planItem) {
      const newProducedKg = Math.max(0, Number(planItem.producedQuantityKg) - produced);
      await tx.productionPlanItem.update({
        where: { id: planItem.id },
        data: { producedQuantityKg: newProducedKg, status: newProducedKg >= Number(planItem.plannedQuantityKg) ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id }
      });
      const open = await tx.productionPlanItem.count({
        where: { companyId: user.companyId, productionPlanId: planItem.productionPlanId, deletedAt: null, status: { not: "COMPLETED" } }
      });
      await tx.productionPlan.update({ where: { id: planItem.productionPlanId }, data: { status: open === 0 ? "COMPLETED" : "IN_PROGRESS", updatedById: user.id } });
    }
  }

  // Free the batch number so the run can be re-posted under the same
  // number, and drop the idempotency key so a re-post isn't swallowed.
  await tx.feedProductionBatch.update({
    where: { id },
    data: { batchNumber: `${batch.batchNumber}__deleted_${id}`, idempotencyKey: null, deletedAt: now, updatedById: user.id }
  });
}

// Reverses every live batch on an order, then soft-deletes the order.
// Returns how many batches were reversed.
export async function deleteFeedOrderTx(tx: Db, user: Actor, orderId: string) {
  await tx.$queryRaw`SELECT id FROM FeedProductionOrder WHERE id = ${orderId} FOR UPDATE`;
  const batches = await tx.feedProductionBatch.findMany({
    where: { companyId: user.companyId, productionOrderId: orderId, deletedAt: null },
    select: { id: true }
  });
  for (const batch of batches) await reverseFeedBatchTx(tx, user, batch.id);
  await tx.feedProductionOrder.update({ where: { id: orderId }, data: { deletedAt: new Date(), updatedById: user.id } });
  return batches.length;
}

// After a batch is removed, put the order back in the status that matches
// what is still produced against it (APPROVED → can be re-run).
export async function refreshFeedOrderStatusTx(tx: Db, user: Actor, orderId: string) {
  const remaining = await tx.feedProductionBatch.aggregate({
    where: { companyId: user.companyId, productionOrderId: orderId, deletedAt: null },
    _sum: { producedQuantityKg: true }
  });
  const remainingKg = Number(remaining._sum.producedQuantityKg ?? 0);
  const order = await tx.feedProductionOrder.findUnique({ where: { id: orderId }, select: { status: true, plannedQuantityKg: true, deletedAt: true } });
  if (!order || order.deletedAt || order.status === "CANCELLED") return;
  const status = remainingKg <= 0 ? "APPROVED" : remainingKg >= Number(order.plannedQuantityKg) ? "COMPLETED" : "IN_PROGRESS";
  await tx.feedProductionOrder.update({ where: { id: orderId }, data: { status, updatedById: user.id } });
}
