import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { nextRef } from "../../common/next-ref";
import { startOfTodayAccra } from "../../common/utils/timezone";
import { withDbRetry } from "../../common/db-retry";
import {
  ApproveStockDto,
  ApproveTransferDto,
  CreateInventoryItemDto,
  CreateWarehouseLocationDto,
  InventoryQueryDto,
  MergeWarehouseDto,
  MobileStockMovementDto,
  ReceiveTransferDto,
  RefreshAlertsDto,
  RejectTransferDto,
  ReleaseReservationDto,
  ResolveDiscrepancyDto,
  SetReorderLevelDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockReservationDto,
  StockTransferDto,
  TransferQueryDto,
  UpdateInventoryItemDto,
  UpdateWarehouseLocationDto
} from "./dto/inventory.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight
    const [skuGroups, itemCount, totalQty, movements, lowStock, expiryAlerts, valuation, pendingApprovals, weekMovements, adjustmentStats, movementsToday, transfersPendingApproval, transfersInTransit, transferDiscrepancies] = await Promise.all([
      this.prisma.inventoryItem.groupBy({ by: ["productId"], where: this.itemWhere(user, {}) }),
      this.prisma.inventoryItem.count({ where: this.itemWhere(user, {}) }),
      this.prisma.inventoryItem.aggregate({ where: this.itemWhere(user, {}), _sum: { quantityOnHand: true } }),
      this.prisma.stockMovement.findMany({ where: this.movementWhere(user, {}), orderBy: { movementDate: "desc" }, take: 10, include: { product: { select: { sku: true, name: true } }, warehouse: { select: { name: true } } } }),
      this.lowStockRows(user),
      this.prisma.stockExpiryAlert.findMany({ where: this.expiryWhere(user, {}), include: { product: { select: { sku: true, name: true } }, warehouse: { select: { name: true } }, stockBatch: { select: { batchNumber: true, quantityRemaining: true } } }, orderBy: { expiryDate: "asc" }, take: 10 }),
      this.valuationRows(user, {}),
      this.prisma.stockApproval.count({ where: { companyId: user.companyId, status: "PENDING_APPROVAL", deletedAt: null } }),
      this.prisma.stockMovement.findMany({ where: { ...this.movementWhere(user, {}), movementDate: { gte: sevenDaysAgo } }, select: { movementDate: true, movementType: true }, orderBy: { movementDate: "asc" } }),
      this.prisma.stockAdjustment.groupBy({ by: ["status"], where: { companyId: user.companyId, deletedAt: null }, _count: { status: true } }),
      this.prisma.stockMovement.count({ where: { ...this.movementWhere(user, {}), movementDate: { gte: todayStart } } }),
      this.prisma.stockTransfer.count({ where: { companyId: user.companyId, deletedAt: null, status: "PENDING_APPROVAL" } }),
      this.prisma.stockTransfer.count({ where: { companyId: user.companyId, deletedAt: null, status: "IN_TRANSIT" } }),
      this.prisma.transferDiscrepancy.count({ where: { companyId: user.companyId, deletedAt: null, status: "PENDING_REVIEW" } })
    ]);
    return {
      data: {
        skuCount: skuGroups.length,
        itemCount,
        totalQuantity: Number(totalQty._sum.quantityOnHand ?? 0),
        inventoryValue: valuation.reduce((sum, row) => sum + row.totalValue, 0),
        lowStockCount: lowStock.length,
        expiryAlertCount: expiryAlerts.length,
        pendingApprovals,
        transfersPendingApproval,
        transfersInTransit,
        transferDiscrepancies,
        movementsToday,
        recentMovements: movements,
        lowStock: lowStock.slice(0, 8),
        expiryAlerts,
        weekMovements: weekMovements.map((m) => ({ date: m.movementDate, type: m.movementType })),
        adjustmentStats: adjustmentStats.map((r) => ({ status: r.status, count: r._count.status }))
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const cacheKey = `inventory:opts:${user.companyId}:${user.hasGlobalAccess ? "g" : user.id}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;
    const [warehouses, products, farms, productionSites, items] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, branchId: true, farmId: true, productionSiteId: true, code: true, name: true }, orderBy: { name: "asc" } }),
      // uom/piecesPerUnit: Stock In/Out/Transfer needs to know each product's
      // actual unit — without it the form has no way to tell a kg-based feed
      // product from a crate-based one (30 eggs = 1 crate) and showed the
      // same "Bags (50kg)" helper for every product regardless.
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, sku: true, name: true, type: true, uomId: true, piecesPerUnit: true, uom: { select: { symbol: true, name: true } } }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { id: { in: user.farmIds } }) }, select: { id: true, code: true, name: true } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.productionSiteIds.length === 0 ? {} : { id: { in: user.productionSiteIds } }) }, select: { id: true, code: true, name: true } }),
      this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, {}), include: { product: { select: { sku: true, name: true } }, warehouse: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 })
    ]);
    const result = { data: { warehouses, products, farms, productionSites, items } };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  async listProducts(user: AuthenticatedUser, type?: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(type ? { type: type as any } : {}) },
      select: {
        id: true,
        name: true,
        sku: true,
        priceLists: {
          where: { companyId: user.companyId, status: "ACTIVE" },
          select: { unitPrice: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });
    const data = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unitPrice: p.priceLists[0]?.unitPrice ?? null,
    }));
    return { data };
  }

  async listItems(user: AuthenticatedUser, query: InventoryQueryDto) {
    // product.uom is needed here (not just the product's own scalar columns,
    // which `product: true` already covers) so the Items table can show
    // quantityOnHand/reorderLevel in the product's real unit — see
    // formatQtyForProduct on the frontend.
    const data = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, query), include: { product: { include: { uom: { select: { symbol: true, name: true } } } }, warehouse: true, farm: true, productionSite: true, stockBatches: { where: { deletedAt: null }, orderBy: { expiryDate: "asc" }, take: 10 } }, orderBy: { createdAt: "desc" }, take: 200 });
    return { data };
  }

  async createItem(user: AuthenticatedUser, dto: CreateInventoryItemDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const [warehouse, product] = await Promise.all([this.getWarehouse(user.companyId, dto.warehouseId), this.getProduct(user.companyId, dto.productId)]);
    const existingItem = await this.prisma.inventoryItem.findUnique({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: warehouse.id, productId: product.id } } });
    // The item row (carrying quantityOnHand directly) and its opening-balance
    // StockMovement/StockBatch trail used to be three unguarded calls — a
    // failure between them (e.g. a batchNumber collision) could leave an
    // InventoryItem with a non-zero quantityOnHand and no batch/movement
    // record to account for it. One transaction means either all three land
    // or none do.
    const item = await this.prisma.$transaction(async (tx) => {
      const created = existingItem
        ? await tx.inventoryItem.update({ where: { id: existingItem.id }, data: { reorderLevel: dto.reorderLevel, updatedById: user.id } })
        : await tx.inventoryItem.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: dto.farmId ?? warehouse.farmId, productionSiteId: dto.productionSiteId ?? warehouse.productionSiteId, productId: product.id, uomId: product.uomId, reorderLevel: dto.reorderLevel, quantityOnHand: dto.openingQuantity ?? 0, createdById: user.id } });
      if (!existingItem && (dto.openingQuantity ?? 0) > 0) {
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, productId: product.id, inventoryItemId: created.id, toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: created.farmId, productionSiteId: created.productionSiteId, uomId: product.uomId, movementType: "OPENING_BALANCE", quantity: dto.openingQuantity!, referenceType: "InventoryItem", referenceId: created.id, notes: "Opening balance", createdById: user.id } });
        await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, farmId: created.farmId ?? null, warehouseId: warehouse.id, productionSiteId: created.productionSiteId ?? null, productId: product.id, inventoryItemId: created.id, uomId: product.uomId, batchNumber: `OB-${created.id.substring(0, 8).toUpperCase()}`, quantityReceived: dto.openingQuantity!, quantityRemaining: dto.openingQuantity!, unitCost: 0, createdById: user.id } });
      }
      return created;
    });
    await this.upsertReorder(item.id, dto.reorderLevel, undefined, undefined, user.id);
    await this.writeAudit(user, "CREATE", "InventoryItem", item.id, `Created inventory item for ${product.sku}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data: item };
  }

  // Only metadata (reorderLevel, status) is editable here — quantityOnHand is
  // deliberately excluded from UpdateInventoryItemDto so it can never be set
  // directly via this generic PATCH; it must only ever move through
  // stockIn/stockOut/transfer/createAdjustment's own guarded FIFO paths.
  async updateItem(user: AuthenticatedUser, id: string, dto: UpdateInventoryItemDto, context: RequestContext) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!item) throw new NotFoundException("Inventory item was not found.");
    this.assertWarehouseAccess(user, item.warehouseId);
    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        ...(dto.status !== undefined && { status: dto.status }),
        updatedById: user.id
      }
    });
    if (dto.reorderLevel !== undefined) await this.upsertReorder(item.id, dto.reorderLevel, undefined, undefined, user.id);
    await this.writeAudit(user, "UPDATE", "InventoryItem", id, "Updated inventory item", context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: updated };
  }

  // Blocked while the item still carries stock — a non-zero quantityOnHand
  // or a live (undepleted, non-deleted) StockBatch means real inventory is
  // still tracked against this row; deleting it would silently orphan that
  // stock from any FIFO consumer.
  async deleteItem(user: AuthenticatedUser, id: string, context: RequestContext) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!item) throw new NotFoundException("Inventory item was not found.");
    this.assertWarehouseAccess(user, item.warehouseId);
    if (Number(item.quantityOnHand) !== 0) throw new BadRequestException("Cannot delete an inventory item with non-zero quantity on hand.");
    const liveBatch = await this.prisma.stockBatch.findFirst({ where: { inventoryItemId: id, deletedAt: null, quantityRemaining: { gt: 0 } } });
    if (liveBatch) throw new BadRequestException("Cannot delete an inventory item that still has live stock batches.");
    await this.prisma.inventoryItem.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "InventoryItem", id, "Deleted inventory item", context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: { ok: true } };
  }

  async stockIn(user: AuthenticatedUser, dto: StockInDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const [warehouse, product] = await Promise.all([this.getWarehouse(user.companyId, dto.warehouseId), this.getProduct(user.companyId, dto.productId)]);
    const data = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: warehouse.id, productId: product.id } },
        update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id },
        create: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, productId: product.id, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id }
      });
      const batch = await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, farmId: warehouse.farmId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, productId: product.id, inventoryItemId: item.id, uomId: product.uomId, batchNumber: dto.batchNumber.toUpperCase(), quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: dto.unitCost, manufactureDate: dto.manufactureDate ? new Date(dto.manufactureDate) : undefined, expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined, createdById: user.id } });
      const movement = await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, productId: product.id, inventoryItemId: item.id, stockBatchId: batch.id, toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, uomId: product.uomId, movementType: "PURCHASE_RECEIPT", quantity: dto.quantity, unitCost: dto.unitCost, referenceType: "StockBatch", referenceId: batch.id, notes: dto.notes, createdById: user.id } });
      return { item, batch, movement };
    });
    await this.createValuation(data.item.id, dto.unitCost);
    await this.refreshExpiryAlerts(user, { expiryDays: 45 });
    await this.writeAudit(user, "CREATE", "StockMovement", data.movement.id, `Stock in ${product.sku}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async stockOut(user: AuthenticatedUser, dto: StockOutDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const item = await this.requireItem(user.companyId, dto.warehouseId, dto.productId);
    await this.assertAvailable(user, item, dto.quantity, dto.allowNegativeStock);
    const product = await this.getProduct(user.companyId, dto.productId);
    const movementType = dto.movementType ?? "ADJUSTMENT_OUT";
    if (!["ADJUSTMENT_OUT", "SALE_DISPATCH", "PRODUCTION_INPUT", "WASTE"].includes(movementType)) {
      throw new BadRequestException("Stock-out movement type must remove stock from inventory.");
    }
    const issued = await this.consumeFifo(user, item, dto.quantity, movementType as "ADJUSTMENT_OUT" | "SALE_DISPATCH" | "PRODUCTION_INPUT" | "WASTE", "StockOut", undefined, dto.notes);
    await this.writeAudit(user, "CREATE", "StockMovement", item.id, `Stock out ${product.sku}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: { itemId: item.id, issued } };
  }

  // ─── Staged stock transfers ──────────────────────────────────────────────
  // request → approve (stock leaves source, held IN_TRANSIT) → receive
  // (destination confirms actual qty; a mismatch opens a TransferDiscrepancy).
  // A global-access user may pass autoApprove:true to collapse the whole chain
  // into one instant move (the pre-staged behaviour).

  async transfer(user: AuthenticatedUser, dto: StockTransferDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.assertWarehouseAccess(user, dto.toWarehouseId);
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException("Source and destination warehouses must be different.");
    const [sourceItem, toWarehouse, product] = await Promise.all([this.requireItem(user.companyId, dto.fromWarehouseId, dto.productId), this.getWarehouse(user.companyId, dto.toWarehouseId), this.getProduct(user.companyId, dto.productId)]);
    await this.assertAvailable(user, sourceItem, dto.quantity, false);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend carrying
    // the same idempotencyKey replays the original transfer, not a second one.
    if (dto.idempotencyKey) {
      const existing = await this.findStockTransferByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const instant = dto.autoApprove === true && user.hasGlobalAccess;
    const transferNumber = await nextRef(this.prisma, user.companyId, "STR");
    let data;
    try {
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
        const transfer = await tx.stockTransfer.create({ data: {
          companyId: user.companyId, branchId: sourceItem.branchId, productId: dto.productId, stockBatchId: dto.stockBatchId,
          transferNumber, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId,
          fromProductionSiteId: sourceItem.productionSiteId, toProductionSiteId: toWarehouse.productionSiteId,
          quantity: dto.quantity, barcode: dto.barcode, notes: dto.notes,
          status: instant ? "COMPLETED" : "PENDING_APPROVAL",
          idempotencyKey: dto.idempotencyKey, requestedById: user.id, createdById: user.id,
          ...(instant ? { approvedById: user.id, approvedAt: new Date(), receivedById: user.id, receivedAt: new Date(), receivedQuantity: dto.quantity } : {}),
        } });
        if (instant) {
          const consumed = await this.consumeFifoTx(tx, user, sourceItem, dto.quantity, "TRANSFER", "StockTransfer", transfer.id, `Transfer ${transferNumber}`);
          await tx.stockTransfer.update({ where: { id: transfer.id }, data: { dispatchedLots: consumed.issued as unknown as Prisma.InputJsonValue, unitCost: consumed.unitCost } });
          await this.creditTransferDestinationTx(tx, user, { toWarehouse, product, quantity: dto.quantity, unitCost: consumed.unitCost, transferId: transfer.id, transferNumber });
        }
        return transfer;
      }), { label: "InventoryService.transfer" });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (dto.idempotencyKey && code === "P2002") {
        const existing = await this.findStockTransferByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      if (code === "P2002") throw new ConflictException("A concurrent transfer was processed at the same time. Please try again.");
      throw err;
    }
    await this.writeAudit(user, instant ? "TRANSFER" : "CREATE", "StockTransfer", data.id, instant ? `Transferred ${product.sku} (auto-approved)` : `Requested transfer of ${product.sku}`, context, { branchId: sourceItem.branchId, warehouseId: sourceItem.warehouseId });
    return { data };
  }

  async approveTransfer(user: AuthenticatedUser, id: string, dto: ApproveTransferDto, context: RequestContext) {
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot approve stock transfers.");
    const transfer = await this.prisma.stockTransfer.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) throw new NotFoundException("Stock transfer was not found.");
    this.assertWarehouseAccess(user, transfer.fromWarehouseId);
    if (transfer.status !== "PENDING_APPROVAL") throw new BadRequestException(`This transfer is ${transfer.status.toLowerCase().replace(/_/g, " ")} — only pending transfers can be approved.`);
    if (transfer.requestedById === user.id && !user.hasGlobalAccess) throw new ForbiddenException("A transfer must be approved by someone other than the person who requested it.");
    const sourceItem = await this.requireItem(user.companyId, transfer.fromWarehouseId, transfer.productId);

    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // Claim the row first — a guarded updateMany so two concurrent approvals
      // can't both consume the source stock.
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "IN_TRANSIT", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
      });
      if (claimed.count === 0) throw new BadRequestException("This transfer has already been processed.");
      const consumed = await this.consumeFifoTx(tx, user, sourceItem, Number(transfer.quantity), "TRANSFER", "StockTransfer", id, `Transfer ${transfer.transferNumber} dispatched`);
      await tx.stockTransfer.update({ where: { id }, data: { dispatchedLots: consumed.issued as unknown as Prisma.InputJsonValue, unitCost: consumed.unitCost, ...(dto.notes ? { notes: dto.notes } : {}) } });
      return tx.stockTransfer.findUniqueOrThrow({ where: { id } });
    }), { label: "InventoryService.approveTransfer" });

    await this.writeAudit(user, "APPROVE", "StockTransfer", id, `Approved transfer ${transfer.transferNumber} — dispatched, in transit`, context, { branchId: transfer.branchId, warehouseId: transfer.fromWarehouseId });
    return { data };
  }

  async rejectTransfer(user: AuthenticatedUser, id: string, dto: RejectTransferDto, context: RequestContext) {
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot reject stock transfers.");
    const transfer = await this.prisma.stockTransfer.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) throw new NotFoundException("Stock transfer was not found.");
    this.assertWarehouseAccess(user, transfer.fromWarehouseId);
    if (transfer.status !== "PENDING_APPROVAL") throw new BadRequestException(`This transfer is ${transfer.status.toLowerCase().replace(/_/g, " ")} — only pending transfers can be rejected.`);
    const claimed = await this.prisma.stockTransfer.updateMany({
      where: { companyId: user.companyId, id, status: "PENDING_APPROVAL" },
      data: { status: "REJECTED", rejectionReason: dto.rejectionReason, approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
    });
    if (claimed.count === 0) throw new BadRequestException("This transfer has already been processed.");
    await this.writeAudit(user, "REJECT", "StockTransfer", id, `Rejected transfer ${transfer.transferNumber}`, context, { branchId: transfer.branchId, warehouseId: transfer.fromWarehouseId });
    return { data: await this.prisma.stockTransfer.findUniqueOrThrow({ where: { id } }) };
  }

  async receiveTransfer(user: AuthenticatedUser, id: string, dto: ReceiveTransferDto, context: RequestContext) {
    const transfer = await this.prisma.stockTransfer.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) throw new NotFoundException("Stock transfer was not found.");
    this.assertWarehouseAccess(user, transfer.toWarehouseId);
    if (transfer.status !== "IN_TRANSIT") throw new BadRequestException(`This transfer is ${transfer.status.toLowerCase().replace(/_/g, " ")} — only in-transit transfers can be received.`);
    const dispatched = Number(transfer.quantity);
    if (dto.receivedQuantity > dispatched * 1.5) throw new BadRequestException(`Received quantity (${dto.receivedQuantity}) is far more than was dispatched (${dispatched}). Re-check the count.`);
    const [toWarehouse, product] = await Promise.all([this.getWarehouse(user.companyId, transfer.toWarehouseId), this.getProduct(user.companyId, transfer.productId)]);
    const unitCost = Number(transfer.unitCost ?? 0);
    const difference = Math.round((dispatched - dto.receivedQuantity) * 10000) / 10000;

    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, status: "IN_TRANSIT" },
        data: { status: "COMPLETED", receivedById: user.id, receivedAt: new Date(), receivedQuantity: dto.receivedQuantity, updatedById: user.id, ...(dto.notes ? { notes: dto.notes } : {}) },
      });
      if (claimed.count === 0) throw new BadRequestException("This transfer has already been received.");
      if (dto.receivedQuantity > 0) {
        await this.creditTransferDestinationTx(tx, user, { toWarehouse, product, quantity: dto.receivedQuantity, unitCost, transferId: id, transferNumber: transfer.transferNumber });
      }
      if (difference !== 0) {
        await tx.transferDiscrepancy.create({ data: {
          companyId: user.companyId, branchId: transfer.branchId, stockTransferId: id,
          expectedQuantity: dispatched, receivedQuantity: dto.receivedQuantity, differenceQuantity: difference,
          reason: difference > 0 ? "Short receipt" : "Over receipt", reportedById: user.id,
        } });
      }
      return tx.stockTransfer.findUniqueOrThrow({ where: { id } });
    }), { label: "InventoryService.receiveTransfer" });

    await this.writeAudit(user, "TRANSFER", "StockTransfer", id, `Received transfer ${transfer.transferNumber} — ${dto.receivedQuantity} of ${dispatched}${difference !== 0 ? " (discrepancy logged)" : ""}`, context, { branchId: transfer.branchId, warehouseId: transfer.toWarehouseId });
    return { data };
  }

  async cancelTransfer(user: AuthenticatedUser, id: string, context: RequestContext) {
    const transfer = await this.prisma.stockTransfer.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) throw new NotFoundException("Stock transfer was not found.");
    this.assertWarehouseAccess(user, transfer.fromWarehouseId);
    if (!["DRAFT", "PENDING_APPROVAL"].includes(transfer.status)) throw new BadRequestException("Only a draft or pending transfer can be cancelled — once stock is in transit it must be received.");
    const claimed = await this.prisma.stockTransfer.updateMany({
      where: { companyId: user.companyId, id, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      data: { status: "CANCELLED", updatedById: user.id },
    });
    if (claimed.count === 0) throw new BadRequestException("This transfer can no longer be cancelled.");
    await this.writeAudit(user, "REJECT", "StockTransfer", id, `Cancelled transfer ${transfer.transferNumber}`, context, { branchId: transfer.branchId, warehouseId: transfer.fromWarehouseId });
    return { data: await this.prisma.stockTransfer.findUniqueOrThrow({ where: { id } }) };
  }

  async listTransfers(user: AuthenticatedUser, query: TransferQueryDto) {
    const scope: Prisma.StockTransferWhereInput = { companyId: user.companyId, deletedAt: null };
    if (query.status) scope.status = query.status;
    const whId = query.warehouseId;
    if (query.direction === "incoming") scope.toWarehouseId = whId ?? undefined;
    else if (query.direction === "outgoing") scope.fromWarehouseId = whId ?? undefined;
    else if (whId) scope.OR = [{ fromWarehouseId: whId }, { toWarehouseId: whId }];
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0) {
      scope.AND = [{ OR: [{ fromWarehouseId: { in: user.warehouseIds } }, { toWarehouseId: { in: user.warehouseIds } }] }];
    }
    const data = await this.prisma.stockTransfer.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: Math.min(query.take ?? 100, 300),
      include: {
        product: { select: { sku: true, name: true } },
        fromWarehouse: { select: { code: true, name: true, branch: { select: { name: true } } } },
        toWarehouse: { select: { code: true, name: true, branch: { select: { name: true } } } },
        discrepancies: { where: { deletedAt: null }, select: { id: true, status: true, differenceQuantity: true } },
      },
    });
    return { data };
  }

  async listDiscrepancies(user: AuthenticatedUser) {
    const data = await this.prisma.transferDiscrepancy.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        stockTransfer: {
          select: {
            transferNumber: true, quantity: true, transferDate: true,
            product: { select: { sku: true, name: true } },
            fromWarehouse: { select: { code: true, name: true } },
            toWarehouse: { select: { code: true, name: true } },
          },
        },
      },
    });
    return { data };
  }

  async resolveDiscrepancy(user: AuthenticatedUser, id: string, dto: ResolveDiscrepancyDto, context: RequestContext) {
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot resolve transfer discrepancies.");
    const disc = await this.prisma.transferDiscrepancy.findFirst({ where: { companyId: user.companyId, id, deletedAt: null }, include: { stockTransfer: true } });
    if (!disc) throw new NotFoundException("Discrepancy was not found.");
    if (disc.status !== "PENDING_REVIEW") throw new BadRequestException("This discrepancy has already been resolved.");
    const diff = Number(disc.differenceQuantity); // >0 short, <0 over
    const transfer = disc.stockTransfer;

    if ((dto.resolution === "WRITE_OFF" || dto.resolution === "RECOVERED") && diff <= 0) {
      throw new BadRequestException("Write-off and recovered only apply to a shortfall. Use 'source miscount' for an over-receipt.");
    }
    const [toWarehouse, product] = await Promise.all([this.getWarehouse(user.companyId, transfer.toWarehouseId), this.getProduct(user.companyId, transfer.productId)]);

    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transferDiscrepancy.updateMany({
        where: { id, status: "PENDING_REVIEW" },
        data: { status: "RESOLVED", resolution: dto.resolution, resolvedById: user.id, resolvedAt: new Date(), ...(dto.notes ? { notes: dto.notes } : {}) },
      });
      if (claimed.count === 0) throw new BadRequestException("This discrepancy has already been resolved.");
      if (dto.resolution === "WRITE_OFF") {
        // The shortfall is a real loss — record it as a WASTE movement against
        // the source. Stock is already gone (consumed at approval); this is a
        // ledger entry so the loss is attributed, not an InventoryItem change.
        await tx.stockMovement.create({ data: {
          companyId: user.companyId, branchId: transfer.branchId, productId: transfer.productId,
          fromWarehouseId: transfer.fromWarehouseId, warehouseId: transfer.fromWarehouseId,
          uomId: product.uomId, movementType: "WASTE", quantity: diff, unitCost: Number(transfer.unitCost ?? 0),
          referenceType: "TransferDiscrepancy", referenceId: id, notes: `Transfer ${transfer.transferNumber} shortfall written off`, createdById: user.id,
        } });
      } else if (dto.resolution === "RECOVERED") {
        // The missing units turned up — credit them to the destination too.
        await this.creditTransferDestinationTx(tx, user, { toWarehouse, product, quantity: diff, unitCost: Number(transfer.unitCost ?? 0), transferId: transfer.id, transferNumber: `${transfer.transferNumber}-REC` });
      }
      // SOURCE_MISCOUNT: no stock effect — a separate stock count corrects the
      // source; this just records the explanation.
      return tx.transferDiscrepancy.findUniqueOrThrow({ where: { id } });
    }), { label: "InventoryService.resolveDiscrepancy" });

    await this.writeAudit(user, "APPROVE", "TransferDiscrepancy", id, `Resolved transfer discrepancy (${dto.resolution.toLowerCase().replace(/_/g, " ")})`, context, { branchId: transfer.branchId, warehouseId: transfer.toWarehouseId });
    return { data };
  }

  // Shared destination credit: upsert the InventoryItem, open a lot, write the
  // TRANSFER-in movement. Used by the instant path, receiveTransfer, and a
  // RECOVERED discrepancy resolution.
  private async creditTransferDestinationTx(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    p: { toWarehouse: { id: string; branchId: string; farmId: string | null; productionSiteId: string | null }; product: { id: string; sku: string; uomId: string }; quantity: number; unitCost: number; transferId: string; transferNumber: string }
  ) {
    const destination = await tx.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: p.toWarehouse.id, productId: p.product.id } },
      update: { quantityOnHand: { increment: p.quantity }, updatedById: user.id },
      create: { companyId: user.companyId, branchId: p.toWarehouse.branchId, warehouseId: p.toWarehouse.id, farmId: p.toWarehouse.farmId, productionSiteId: p.toWarehouse.productionSiteId, productId: p.product.id, uomId: p.product.uomId, quantityOnHand: p.quantity, createdById: user.id },
    });
    await tx.stockBatch.create({ data: {
      companyId: user.companyId, branchId: p.toWarehouse.branchId, farmId: p.toWarehouse.farmId, warehouseId: p.toWarehouse.id, productionSiteId: p.toWarehouse.productionSiteId,
      productId: p.product.id, inventoryItemId: destination.id, uomId: p.product.uomId,
      batchNumber: `${p.transferNumber}-${p.product.sku}`.slice(0, 60), quantityReceived: p.quantity, quantityRemaining: p.quantity, unitCost: p.unitCost, createdById: user.id,
    } });
    await tx.stockMovement.create({ data: {
      companyId: user.companyId, branchId: p.toWarehouse.branchId, productId: p.product.id, inventoryItemId: destination.id,
      toWarehouseId: p.toWarehouse.id, warehouseId: p.toWarehouse.id, productionSiteId: p.toWarehouse.productionSiteId,
      uomId: p.product.uomId, movementType: "TRANSFER", quantity: p.quantity, unitCost: p.unitCost,
      referenceType: "StockTransfer", referenceId: p.transferId, notes: `Transfer received ${p.transferNumber}`, createdById: user.id,
    } });
  }

  private async findStockTransferByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.stockTransfer.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  // (C1 follow-up) previously created the StockAdjustment row and its
  // StockApproval row — both already marked APPROVED when approveNow is set —
  // as two unguarded calls, THEN called applyAdjustment() separately. If
  // applyAdjustment threw (e.g. a negative adjustment exceeding available
  // stock), both rows had already committed as "APPROVED" with no actual
  // stock movement behind them — a phantom-approved audit trail permanently
  // disagreeing with reality. Wrapping the whole thing in one transaction
  // means a failed apply rolls back the creation too, so an adjustment only
  // ever exists in the DB as APPROVED if the stock genuinely moved.
  async createAdjustment(user: AuthenticatedUser, dto: StockAdjustmentDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const item = await this.requireItem(user.companyId, dto.warehouseId, dto.productId);
    // Mobile parity audit (2026-08-17): mirrors the sales/finance
    // idempotencyKey pattern — a mobile offline-queue resend carrying the
    // same idempotencyKey replays the original adjustment instead of
    // creating a second one.
    if (dto.idempotencyKey) {
      const existing = await this.findStockAdjustmentByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const status = dto.approveNow && user.hasGlobalAccess ? "APPROVED" : "PENDING_APPROVAL";
    let adjustment;
    try {
      adjustment = await this.prisma.$transaction(async (tx) => {
        const adjustmentNumber = await nextRef(tx, user.companyId, "ADJ");
        const created = await tx.stockAdjustment.create({ data: { companyId: user.companyId, branchId: item.branchId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, inventoryItemId: item.id, productId: item.productId, adjustmentNumber, adjustmentType: dto.adjustmentType, quantity: dto.quantity, reason: dto.reason, status, idempotencyKey: dto.idempotencyKey, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined, createdById: user.id } });
        await tx.stockApproval.create({ data: { companyId: user.companyId, branchId: item.branchId, approvalNumber: await nextRef(tx, user.companyId, "SAP"), entityType: "StockAdjustment", entityId: created.id, status, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined } });
        if (status === "APPROVED") await this.applyAdjustmentTx(tx, user, created, item);
        return created;
      });
    } catch (err: unknown) {
      // Same race-window reasoning as createOrder/createCustomerPayment's own
      // P2002 handling — the pre-check above isn't atomic, so the unique
      // (companyId, idempotencyKey) index is the real, race-safe arbiter.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findStockAdjustmentByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "StockAdjustment", adjustment.id, `Created stock adjustment ${adjustment.adjustmentNumber}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: adjustment };
  }

  private async findStockAdjustmentByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.stockAdjustment.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  async approveAdjustment(user: AuthenticatedUser, id: string, dto: ApproveStockDto, context: RequestContext) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!adjustment) throw new NotFoundException("Stock adjustment was not found.");
    this.assertWarehouseAccess(user, adjustment.warehouseId);
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot approve stock adjustments.");
    // Fast-fail UX check only — the real guard is the status-guarded
    // updateMany inside the transaction below.
    if (adjustment.status !== "PENDING_APPROVAL") throw new BadRequestException(`Adjustment is already ${adjustment.status.toLowerCase().replace(/_/g, " ")}. Only pending adjustments can be processed.`);
    const item = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id: adjustment.inventoryItemId } });

    const data = await this.prisma.$transaction(async (tx) => {
      // C2 (DB stability audit, 2026-08-16): status used to be checked by a
      // plain read above, then applyAdjustment() ran in its OWN separate
      // transaction, unconditionally — two concurrent approve calls on the
      // same PENDING_APPROVAL adjustment both passed the check and both
      // applied the stock effect (e.g. a +500kg stock-count correction
      // applied twice, inflating on-hand quantity by 500kg that was never
      // physically received). Claiming the row via a guarded updateMany
      // first, and running the actual stock effect inside the SAME
      // transaction as that claim, closes the race and keeps the two
      // effects atomic with each other (same fix shape as approveReturn).
      const claimed = await tx.stockAdjustment.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
      });
      if (claimed.count === 0) {
        throw new BadRequestException("This adjustment has already been processed.");
      }
      if (dto.status === "APPROVED") await this.applyAdjustmentTx(tx, user, adjustment, item);
      await tx.stockApproval.updateMany({ where: { companyId: user.companyId, entityType: "StockAdjustment", entityId: id }, data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), notes: dto.notes } });
      return tx.stockAdjustment.findUniqueOrThrow({ where: { id } });
    });

    await this.writeAudit(user, dto.status === "APPROVED" ? "APPROVE" : "REJECT", "StockAdjustment", id, `Updated stock adjustment to ${dto.status}`, context, { branchId: adjustment.branchId, warehouseId: adjustment.warehouseId });
    return { data };
  }

  async reserve(user: AuthenticatedUser, dto: StockReservationDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const item = await this.requireItem(user.companyId, dto.warehouseId, dto.productId);
    const reservationNumber = await nextRef(this.prisma, user.companyId, "RSV");
    const reservation = await this.prisma.$transaction(async (tx) => {
      // H1: assertAvailable's "sum active reservations, compare to quantityOnHand"
      // check and the reservation insert used to be two unguarded steps — two
      // concurrent reserve() calls for the same item could both read the same
      // available snapshot and both insert, jointly over-reserving beyond real
      // stock. Locking the InventoryItem row for the transaction's lifetime
      // serializes concurrent reserve() calls on the same item: the second
      // waits for the first to commit, then its own sum-of-reservations read
      // includes the first reservation.
      await tx.$queryRaw`SELECT id FROM InventoryItem WHERE id = ${item.id} FOR UPDATE`;
      await this.assertAvailable(user, item, dto.quantity, false, tx);
      return tx.stockReservation.create({ data: { companyId: user.companyId, branchId: item.branchId, warehouseId: item.warehouseId, farmId: dto.farmId, productionSiteId: dto.productionSiteId ?? item.productionSiteId, inventoryItemId: item.id, productId: item.productId, reservationNumber, quantity: dto.quantity, requestedById: user.id, purpose: dto.purpose, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined, createdById: user.id } });
    });
    await this.writeAudit(user, "CREATE", "StockReservation", reservation.id, "Reserved stock", context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: reservation };
  }

  // M3: previously nothing ever transitioned a reservation out of ACTIVE
  // except the expiry cron (duty-reminders.service.ts) — a reservation with
  // no expiresAt stayed ACTIVE forever, permanently subtracting from
  // availability even after the reserved stock actually shipped. This gives
  // callers (sales fulfillment, manual cleanup) an explicit way to close one out.
  async releaseReservation(user: AuthenticatedUser, id: string, dto: ReleaseReservationDto, context: RequestContext) {
    const reservation = await this.prisma.stockReservation.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!reservation) throw new NotFoundException("Stock reservation was not found.");
    this.assertWarehouseAccess(user, reservation.warehouseId);
    if (reservation.status !== "ACTIVE") throw new BadRequestException(`Reservation is already ${reservation.status.toLowerCase()}.`);
    const status = dto.status ?? "FULFILLED";
    const data = await this.prisma.stockReservation.update({ where: { id }, data: { status, updatedById: user.id } });
    await this.writeAudit(user, status === "CANCELLED" ? "REJECT" : "APPROVE", "StockReservation", id, `Marked reservation ${status.toLowerCase()}`, context, { branchId: reservation.branchId, warehouseId: reservation.warehouseId });
    return { data };
  }

  async listLocations(user: AuthenticatedUser, query: InventoryQueryDto) {
    const andConditions: object[] = [];
    if (query.warehouseId) andConditions.push({ warehouseId: query.warehouseId });
    // Same empty-IN() guard as itemWhere: an empty warehouseIds array means
    // "no explicit assignment" -> fall through to company-level visibility.
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0) {
      andConditions.push({ warehouseId: { in: user.warehouseIds } });
    }
    const data = await this.prisma.warehouseLocation.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(andConditions.length > 0 ? { AND: andConditions } : {}) },
      include: { warehouse: { select: { code: true, name: true } } },
      orderBy: { code: "asc" },
      take: 200
    });
    return { data };
  }

  async createLocation(user: AuthenticatedUser, dto: CreateWarehouseLocationDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const warehouse = await this.getWarehouse(user.companyId, dto.warehouseId);
    const data = await this.prisma.warehouseLocation.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, parentId: dto.parentId, code: dto.code.toUpperCase(), name: dto.name, barcode: dto.barcode, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "WarehouseLocation", data.id, `Created warehouse location ${data.code}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async updateLocation(user: AuthenticatedUser, id: string, dto: UpdateWarehouseLocationDto, context: RequestContext) {
    const location = await this.prisma.warehouseLocation.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!location) throw new NotFoundException("Warehouse location was not found.");
    this.assertWarehouseAccess(user, location.warehouseId);
    const updated = await this.prisma.warehouseLocation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.status !== undefined && { status: dto.status }),
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "WarehouseLocation", id, `Updated warehouse location ${location.code}`, context, { branchId: location.branchId, warehouseId: location.warehouseId });
    return { data: updated };
  }

  // WarehouseLocation has no direct relation to StockBatch/InventoryItem in
  // this schema (it's a hierarchical bin/shelf label, not a stock ledger row)
  // — the real dependent-record risk here is orphaning child locations that
  // point back at this one via parentId, so that's what's guarded.
  async deleteLocation(user: AuthenticatedUser, id: string, context: RequestContext) {
    const location = await this.prisma.warehouseLocation.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!location) throw new NotFoundException("Warehouse location was not found.");
    this.assertWarehouseAccess(user, location.warehouseId);
    const childCount = await this.prisma.warehouseLocation.count({ where: { parentId: id, deletedAt: null } });
    if (childCount > 0) throw new BadRequestException("Cannot delete a warehouse location that has child locations.");
    // @@unique([companyId, warehouseId, code]) isn't deletedAt-aware —
    // without rewriting the code here, deleting a location and recreating
    // one with the same code fails the create with a unique-constraint error.
    await this.prisma.warehouseLocation.update({ where: { id }, data: { code: `${location.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "WarehouseLocation", id, `Deleted warehouse location ${location.code}`, context, { branchId: location.branchId, warehouseId: location.warehouseId });
    return { data: { ok: true } };
  }

  async setReorderLevel(user: AuthenticatedUser, dto: SetReorderLevelDto) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { companyId: user.companyId, id: dto.inventoryItemId, deletedAt: null } });
    if (!item) throw new NotFoundException("Inventory item was not found.");
    this.assertWarehouseAccess(user, item.warehouseId);
    const data = await this.upsertReorder(item.id, dto.minimumQuantity, dto.maximumQuantity, dto.reorderQuantity, user.id);
    await this.prisma.inventoryItem.update({ where: { id: item.id }, data: { reorderLevel: dto.minimumQuantity, updatedById: user.id } });
    return { data };
  }

  async movements(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { data: await this.prisma.stockMovement.findMany({ where: this.movementWhere(user, query), include: { product: { include: { uom: { select: { symbol: true, name: true } } } }, warehouse: true, fromWarehouse: true, toWarehouse: true, stockBatch: true }, orderBy: { movementDate: "desc" }, take: 300 }) };
  }

  async lowStock(user: AuthenticatedUser) {
    return { data: await this.lowStockRows(user) };
  }

  async expiryAlerts(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { data: await this.prisma.stockExpiryAlert.findMany({ where: this.expiryWhere(user, query), include: { product: { include: { uom: { select: { symbol: true, name: true } } } }, warehouse: true, stockBatch: true }, orderBy: { expiryDate: "asc" }, take: 200 }) };
  }

  async valuation(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { data: await this.valuationRows(user, query) };
  }

  async warehouseView(user: AuthenticatedUser, warehouseId: string) {
    this.assertWarehouseAccess(user, warehouseId);
    return this.listItems(user, { warehouseId });
  }

  async farmView(user: AuthenticatedUser, farmId: string) {
    if (!user.hasGlobalAccess && user.farmIds.length > 0 && !user.farmIds.includes(farmId)) throw new ForbiddenException("You do not have access to this farm.");
    return this.listItems(user, { farmId });
  }

  async productionSiteView(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && user.productionSiteIds.length > 0 && !user.productionSiteIds.includes(productionSiteId)) throw new ForbiddenException("You do not have access to this production site.");
    return this.listItems(user, { productionSiteId });
  }

  async refreshExpiryAlerts(user: AuthenticatedUser, dto: RefreshAlertsDto) {
    const days = dto.expiryDays ?? 45;
    const until = new Date();
    until.setDate(until.getDate() + days);
    const batches = await this.prisma.stockBatch.findMany({ where: { companyId: user.companyId, deletedAt: null, expiryDate: { lte: until, gte: new Date() }, quantityRemaining: { gt: 0 }, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { warehouseId: { in: user.warehouseIds } }) } });
    for (const batch of batches) {
      const daysToExpiry = Math.ceil(((batch.expiryDate as Date).getTime() - Date.now()) / 86400000);
      await this.prisma.stockExpiryAlert.upsert({ where: { companyId_stockBatchId: { companyId: user.companyId, stockBatchId: batch.id } }, update: { daysToExpiry, expiryDate: batch.expiryDate as Date, status: "ACTIVE" }, create: { companyId: user.companyId, branchId: batch.branchId, warehouseId: batch.warehouseId, productionSiteId: batch.productionSiteId, inventoryItemId: batch.inventoryItemId, stockBatchId: batch.id, productId: batch.productId, expiryDate: batch.expiryDate as Date, daysToExpiry } });
    }
    return { data: { refreshed: batches.length } };
  }

  async reportCsv(user: AuthenticatedUser, query: InventoryQueryDto, context: RequestContext) {
    const rows = await this.valuationRows(user, query);
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "inventory.valuation", summary: "Exported inventory valuation report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return [["warehouse", "sku", "product", "quantity", "unit_cost", "total_value"], ...rows.map((row) => [row.warehouse, row.sku, row.product, String(row.quantityOnHand), String(row.unitCost), String(row.totalValue)])].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  // Shared core, called from within an already-open transaction (either
  // createAdjustment or approveAdjustment) so the adjustment row's own
  // creation/approval and the actual stock movement either both commit or
  // both roll back together — see the (C1 follow-up) note on createAdjustment
  // for why that matters.
  private async applyAdjustmentTx(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    adjustment: { id: string; quantity: Prisma.Decimal | number; unitCost: Prisma.Decimal | number | null; reason: string | null; adjustmentType: string },
    item: { id: string; companyId: string; branchId: string; farmId: string | null; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string; quantityOnHand: Prisma.Decimal | number }
  ) {
    if (Number(adjustment.quantity) < 0) await this.assertAvailable(user, item, Math.abs(Number(adjustment.quantity)), false, tx);
    if (Number(adjustment.quantity) >= 0) {
      // Previously incremented quantityOnHand with no StockBatch created —
      // same desync as the mobile stock-movement "in" path, and left the
      // added quantity with no cost basis for FIFO consumption or valuation.
      const qty = Number(adjustment.quantity);
      const batch = await tx.stockBatch.create({
        data: {
          companyId: user.companyId,
          branchId: item.branchId,
          farmId: item.farmId,
          warehouseId: item.warehouseId,
          productionSiteId: item.productionSiteId,
          productId: item.productId,
          inventoryItemId: item.id,
          uomId: item.uomId,
          batchNumber: `ADJ-${adjustment.id.slice(0, 8).toUpperCase()}`,
          quantityReceived: qty,
          quantityRemaining: qty,
          unitCost: adjustment.unitCost,
          createdById: user.id
        }
      });
      await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { increment: qty }, updatedById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, stockBatchId: batch.id, toWarehouseId: item.warehouseId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, uomId: item.uomId, movementType: "ADJUSTMENT_IN", quantity: qty, unitCost: adjustment.unitCost, referenceType: "StockAdjustment", referenceId: adjustment.id, notes: adjustment.reason, createdById: user.id } });
    } else {
      const movementType = ["DAMAGE", "EXPIRY", "WASTE", "WRITE_OFF"].includes(adjustment.adjustmentType) ? "WASTE" : "ADJUSTMENT_OUT";
      await this.consumeFifoTx(tx, user, item, Math.abs(Number(adjustment.quantity)), movementType, "StockAdjustment", adjustment.id, adjustment.reason ?? undefined);
    }
  }

  private async consumeFifo(user: AuthenticatedUser, item: { id: string; companyId: string; branchId: string; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string }, quantity: number, movementType: "ADJUSTMENT_OUT" | "SALE_DISPATCH" | "TRANSFER" | "WASTE" | "PRODUCTION_INPUT" | "RETURN_OUT", referenceType: string, referenceId?: string, notes?: string) {
    // High (DB stability audit, 2026-08-16): this locks StockBatch then
    // InventoryItem, the opposite order used by Poultry/Soya/Market-Planning/
    // Feed-Production for the same tables — retry on Prisma's deadlock code
    // (P2034) instead of surfacing it as a hard failure.
    return withDbRetry(
      () => this.prisma.$transaction((tx) => this.consumeFifoTx(tx, user, item, quantity, movementType, referenceType, referenceId, notes)),
      { label: "InventoryService.consumeFifo" }
    );
  }

  private async consumeFifoTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: { id: string; companyId: string; branchId: string; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string }, quantity: number, movementType: "ADJUSTMENT_OUT" | "SALE_DISPATCH" | "TRANSFER" | "WASTE" | "PRODUCTION_INPUT" | "RETURN_OUT", referenceType: string, referenceId?: string, notes?: string) {
    let remaining = quantity;
    let value = 0;
    const issued: Array<{ batchId: string; quantity: number; unitCost: number }> = [];
    // H-BUG-2: status: "AVAILABLE" excludes lots Quality has rejected or
    // quarantined — see quality.service.ts's approve/reject/quarantineBatch.
    const batches = await tx.stockBatch.findMany({ where: { companyId: user.companyId, inventoryItemId: item.id, deletedAt: null, quantityRemaining: { gt: 0 }, status: "AVAILABLE" }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(batch.quantityRemaining));
      const unitCost = Number(batch.unitCost ?? 0);
      // Protected decrement: WHERE quantityRemaining >= take uses a current-read lock in InnoDB,
      // preventing a concurrent transaction's stale snapshot from driving the column negative.
      const batchUpdate = await tx.stockBatch.updateMany({ where: { id: batch.id, quantityRemaining: { gte: take } }, data: { quantityRemaining: { decrement: take } } });
      if (batchUpdate.count === 0) throw new BadRequestException("FIFO batches do not contain enough available stock.");
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, stockBatchId: batch.id, fromWarehouseId: item.warehouseId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, uomId: item.uomId, movementType, quantity: take, unitCost, referenceType, referenceId, notes, createdById: user.id } });
      issued.push({ batchId: batch.id, quantity: take, unitCost });
      value += take * unitCost;
      remaining -= take;
    }
    if (remaining > 0) throw new BadRequestException("FIFO batches do not contain enough available stock.");
    const itemUpdate = await tx.inventoryItem.updateMany({ where: { id: item.id, quantityOnHand: { gte: quantity } }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } });
    if (itemUpdate.count === 0) throw new BadRequestException("Insufficient stock — possibly consumed concurrently. Please retry.");
    return { issued, unitCost: value / Math.max(quantity, 1) };
  }

  private async assertAvailable(user: AuthenticatedUser, item: { id: string; quantityOnHand: Prisma.Decimal | number }, quantity: number, allowNegative?: boolean, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    if (allowNegative && user.hasGlobalAccess) return;
    const reservations = await client.stockReservation.findMany({ where: { inventoryItemId: item.id, status: "ACTIVE", deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { quantity: true } });
    const available = Number(item.quantityOnHand) - this.sum(reservations, "quantity");
    if (available < quantity) throw new BadRequestException(`Insufficient available stock. Available: ${available}, requested: ${quantity}.`);
  }

  private async upsertReorder(inventoryItemId: string, minimumQuantity: number, maximumQuantity?: number, reorderQuantity?: number, userId?: string) {
    const item = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
    return this.prisma.stockReorderLevel.upsert({ where: { companyId_warehouseId_productId: { companyId: item.companyId, warehouseId: item.warehouseId, productId: item.productId } }, update: { minimumQuantity, maximumQuantity, reorderQuantity, updatedById: userId }, create: { companyId: item.companyId, branchId: item.branchId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, inventoryItemId: item.id, productId: item.productId, minimumQuantity, maximumQuantity, reorderQuantity, createdById: userId } });
  }

  private async createValuation(inventoryItemId: string, unitCost: number) {
    const item = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
    return this.prisma.inventoryValuation.create({ data: { companyId: item.companyId, branchId: item.branchId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, inventoryItemId: item.id, productId: item.productId, quantityOnHand: item.quantityOnHand, unitCost, totalValue: Number(item.quantityOnHand) * unitCost, method: "FIFO" } });
  }

  async createStockMovement(user: AuthenticatedUser, dto: MobileStockMovementDto, context: RequestContext) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { companyId: user.companyId, id: dto.inventoryItemId, deletedAt: null },
      include: { product: { select: { id: true, sku: true, uomId: true } } }
    });
    if (!item) throw new NotFoundException("Inventory item was not found.");
    this.assertWarehouseAccess(user, item.warehouseId);

    const inTypes = ["OPENING_BALANCE", "PURCHASE_RECEIPT", "PRODUCTION_OUTPUT", "ADJUSTMENT_IN", "RETURN_IN"];
    const isIn = inTypes.includes(dto.movementType as string);
    const isOut = !isIn;

    // Mobile parity audit (2026-08-17): idempotencyKey deliberately NOT
    // applied to the FIFO "out" path — see StockMovement's schema comment.
    // Relies on MobileSyncRecord's own dedup instead.
    if (isOut) {
      await this.assertAvailable(user, item, dto.quantity, false);
      // Previously a plain, unguarded decrement with no StockBatch consumed —
      // desyncing quantityOnHand from sum(StockBatch.quantityRemaining) and
      // allowing negative stock under concurrency. consumeFifoTx (used by
      // stockOut elsewhere in this file) does the guarded FIFO consumption
      // and creates its own per-batch movement rows.
      const issued = await this.prisma.$transaction((tx) =>
        this.consumeFifoTx(tx, user, item, dto.quantity, dto.movementType as "PRODUCTION_INPUT" | "SALE_DISPATCH" | "TRANSFER" | "ADJUSTMENT_OUT" | "WASTE" | "RETURN_OUT", "MobileStockMovement", undefined, dto.notes)
      );
      await this.writeAudit(user, "CREATE", "StockMovement", item.id, `Mobile ${dto.movementType} ${item.product.sku}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
      return { data: { itemId: item.id, issued } };
    }

    // Mobile parity audit (2026-08-17): mirrors the sales/finance
    // idempotencyKey pattern — only the "in" path, which creates exactly one
    // StockMovement row per call, is safe to dedup this way.
    if (dto.idempotencyKey) {
      const existing = await this.findStockMovementByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }

    // "In" movements previously incremented quantityOnHand with no StockBatch
    // created at all — same desync, plus no cost-basis/lot tracking for
    // stock that entered this way. Mirrors stockIn()'s pattern elsewhere.
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const batch = await tx.stockBatch.create({
          data: {
            companyId: user.companyId,
            branchId: item.branchId,
            farmId: item.farmId,
            warehouseId: item.warehouseId,
            productionSiteId: item.productionSiteId,
            productId: item.productId,
            inventoryItemId: item.id,
            uomId: item.uomId,
            batchNumber: `MOB-${Date.now().toString(36).toUpperCase()}`,
            quantityReceived: dto.quantity,
            quantityRemaining: dto.quantity,
            unitCost: dto.unitCost,
            createdById: user.id
          }
        });
        const mov = await tx.stockMovement.create({
          data: {
            companyId: user.companyId,
            branchId: item.branchId,
            productId: item.productId,
            inventoryItemId: item.id,
            stockBatchId: batch.id,
            warehouseId: item.warehouseId,
            toWarehouseId: item.warehouseId,
            farmId: item.farmId,
            productionSiteId: item.productionSiteId,
            uomId: item.uomId,
            movementType: dto.movementType,
            quantity: dto.quantity,
            unitCost: dto.unitCost,
            movementDate: new Date(),
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
            createdById: user.id
          }
        });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }
        });
        return { batch, movement: mov };
      });
    } catch (err: unknown) {
      // Same race-window reasoning as createOrder/createCustomerPayment's own
      // P2002 handling — the pre-check above isn't atomic, so the unique
      // (companyId, idempotencyKey) index is the real, race-safe arbiter.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findStockMovementByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }

    await this.writeAudit(user, "CREATE", "StockMovement", result.movement.id, `Mobile ${dto.movementType} ${item.product.sku}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: result.movement };
  }

  private async findStockMovementByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.stockMovement.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async lowStockRows(user: AuthenticatedUser) {
    const items = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, {}), include: { product: true, warehouse: true, stockReorderLevels: true }, orderBy: { quantityOnHand: "asc" }, take: 50 });
    return items.filter((item) => Number(item.quantityOnHand) <= Number(item.stockReorderLevels[0]?.minimumQuantity ?? item.reorderLevel)).map((item) => ({ id: item.id, sku: item.product.sku, product: item.product.name, warehouse: item.warehouse.name, quantityOnHand: Number(item.quantityOnHand), reorderLevel: Number(item.stockReorderLevels[0]?.minimumQuantity ?? item.reorderLevel) }));
  }

  private async valuationRows(user: AuthenticatedUser, query: InventoryQueryDto) {
    const items = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, query), include: { product: true, warehouse: true, stockBatches: { where: { deletedAt: null, quantityRemaining: { gt: 0 } } } }, orderBy: { updatedAt: "desc" }, take: 200 });
    return items.map((item) => {
      const value = item.stockBatches.reduce((sum, batch) => sum + Number(batch.quantityRemaining) * Number(batch.unitCost ?? 0), 0);
      const quantity = Number(item.quantityOnHand);
      return { itemId: item.id, warehouse: item.warehouse.name, sku: item.product.sku, product: item.product.name, quantityOnHand: quantity, unitCost: quantity > 0 ? Number((value / quantity).toFixed(4)) : 0, totalValue: Number(value.toFixed(2)) };
    });
  }

  private itemWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    const andConditions: object[] = [];
    if (query.warehouseId) andConditions.push({ warehouseId: query.warehouseId });
    // Only apply warehouse scope when the user has explicit assignments.
    // An empty warehouseIds array means "no warehouse access configured" → fall through
    // to company-level visibility rather than an impossible IN () clause.
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0) {
      andConditions.push({ warehouseId: { in: user.warehouseIds } });
    }
    return {
      companyId: user.companyId,
      deletedAt: null,
      branchId: query.branchId || undefined,
      farmId: query.farmId || undefined,
      productionSiteId: query.productionSiteId || undefined,
      productId: query.productId || undefined,
      ...(andConditions.length ? { AND: andConditions } : {})
    };
  }

  private movementWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    const warehouseScope = !user.hasGlobalAccess && user.warehouseIds.length > 0
      ? { OR: [{ warehouseId: { in: user.warehouseIds } }, { fromWarehouseId: { in: user.warehouseIds } }, { toWarehouseId: { in: user.warehouseIds } }] }
      : {};
    return {
      companyId: user.companyId,
      deletedAt: null,
      branchId: query.branchId || undefined,
      warehouseId: query.warehouseId || undefined,
      farmId: query.farmId || undefined,
      productionSiteId: query.productionSiteId || undefined,
      productId: query.productId || undefined,
      ...(query.startDate || query.endDate ? { movementDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } } : {}),
      ...warehouseScope,
    };
  }

  private expiryWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    const andConditions: object[] = [];
    if (query.warehouseId) andConditions.push({ warehouseId: query.warehouseId });
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0) {
      andConditions.push({ warehouseId: { in: user.warehouseIds } });
    }
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, productionSiteId: query.productionSiteId || undefined, productId: query.productId || undefined, ...(andConditions.length ? { AND: andConditions } : {}) };
  }

  private async requireItem(companyId: string, warehouseId: string, productId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null } });
    if (!item) throw new NotFoundException("Inventory item was not found.");
    return item;
  }

  private async getWarehouse(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { companyId, id: warehouseId, deletedAt: null } });
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    return warehouse;
  }

  private async getProduct(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { companyId, id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException("Product was not found.");
    return product;
  }

  // (2026-08-26) Missing the same "empty array means unrestricted" check
  // every other scope guard in this codebase uses — a user with no explicit
  // warehouse restrictions (the normal, common case) was blocked from every
  // warehouse-scoped write (Stock In, Stock Out, transfers, adjustments...)
  // because an empty array can never .includes() anything.
  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }


  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }

  // ─── Warehouse de-duplication ───────────────────────────────────────────
  // Shows, per branch, where more than one warehouse shares a type (usually
  // GENERAL) so the manager can see the duplication and merge it away.
  async warehouseOverlap(user: AuthenticatedUser) {
    const scope = !user.hasGlobalAccess && user.warehouseIds.length > 0 ? { id: { in: user.warehouseIds } } : {};
    const [warehouses, itemGroups] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { companyId: user.companyId, deletedAt: null, ...scope },
        select: { id: true, code: true, name: true, type: true, branchId: true, farmId: true, productionSiteId: true, branch: { select: { name: true } } },
        orderBy: [{ branchId: "asc" }, { name: "asc" }],
      }),
      this.prisma.inventoryItem.groupBy({
        by: ["warehouseId"],
        where: { companyId: user.companyId, deletedAt: null },
        _count: { _all: true },
        _sum: { quantityOnHand: true },
      }),
    ]);
    const stats = new Map(itemGroups.map((g) => [g.warehouseId, g]));
    const rows = warehouses.map((w) => ({
      id: w.id, code: w.code, name: w.name, type: w.type, branchId: w.branchId,
      branchName: w.branch?.name ?? "",
      hasParent: !!(w.farmId || w.productionSiteId),
      itemCount: stats.get(w.id)?._count._all ?? 0,
      quantityOnHand: Number(stats.get(w.id)?._sum.quantityOnHand ?? 0),
    }));
    const byBranch = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!byBranch.has(r.branchId)) byBranch.set(r.branchId, []);
      byBranch.get(r.branchId)!.push(r);
    }
    const groups = [...byBranch.values()].map((whs) => {
      const counts = new Map<string, number>();
      for (const w of whs) counts.set(w.type, (counts.get(w.type) ?? 0) + 1);
      const duplicatedTypes = [...counts.entries()].filter(([, n]) => n > 1).map(([t]) => t);
      return {
        branchId: whs[0].branchId,
        branchName: whs[0].branchName,
        warehouses: whs,
        duplicatedTypes,
        hasOverlap: duplicatedTypes.length > 0,
      };
    });
    return { data: groups.sort((a, b) => Number(b.hasOverlap) - Number(a.hasOverlap) || a.branchName.localeCompare(b.branchName)) };
  }

  // Move every stock record from `sourceId` into `targetWarehouseId` and retire
  // the source. Refuses if the source still carries operational records this
  // tool doesn't relocate (feed/soya/sales/machines) — those must be reassigned
  // first — or an in-flight transfer / active reservation.
  async mergeWarehouse(user: AuthenticatedUser, sourceId: string, dto: MergeWarehouseDto, context: RequestContext) {
    if (!user.hasGlobalAccess && !user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot merge warehouses.");
    if (sourceId === dto.targetWarehouseId) throw new BadRequestException("Source and target must be different warehouses.");
    const [source, target] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: sourceId, companyId: user.companyId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.targetWarehouseId, companyId: user.companyId, deletedAt: null } }),
    ]);
    if (!source || !target) throw new NotFoundException("Warehouse not found.");
    this.assertWarehouseAccess(user, sourceId);
    this.assertWarehouseAccess(user, dto.targetWarehouseId);
    if (source.branchId !== target.branchId) throw new BadRequestException("Those warehouses are in different branches — merging would move stock between branches. Use a stock transfer instead.");

    const [openTransfers, activeReservations, feedCons, feedRcpt, finFeed, soyaIn, soyaOil, soyaCake, salesOrders, deliveryNotes, grns, machines, equipment] = await Promise.all([
      this.prisma.stockTransfer.count({ where: { companyId: user.companyId, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] }, OR: [{ fromWarehouseId: sourceId }, { toWarehouseId: sourceId }] } }),
      this.prisma.stockReservation.count({ where: { companyId: user.companyId, warehouseId: sourceId, status: "ACTIVE" } }),
      this.prisma.feedConsumptionRecord.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
      this.prisma.feedReceiptRecord.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
      this.prisma.finishedFeedStock.count({ where: { companyId: user.companyId, warehouseId: sourceId } }),
      this.prisma.soyaBeanIntake.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
      this.prisma.soyaOilOutput.count({ where: { companyId: user.companyId, warehouseId: sourceId } }),
      this.prisma.soyaCakeOutput.count({ where: { companyId: user.companyId, warehouseId: sourceId } }),
      this.prisma.salesOrder.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
      this.prisma.deliveryNote.count({ where: { companyId: user.companyId, warehouseId: sourceId } }),
      this.prisma.goodsReceivedNote.count({ where: { companyId: user.companyId, warehouseId: sourceId } }),
      this.prisma.machine.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
      this.prisma.equipment.count({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } }),
    ]);
    const blockers: string[] = [];
    if (openTransfers) blockers.push(`${openTransfers} in-flight transfer(s)`);
    if (activeReservations) blockers.push(`${activeReservations} active reservation(s)`);
    if (feedCons) blockers.push(`${feedCons} feed-consumption record(s)`);
    if (feedRcpt) blockers.push(`${feedRcpt} feed-receipt record(s)`);
    if (finFeed) blockers.push(`${finFeed} finished-feed stock record(s)`);
    if (soyaIn + soyaOil + soyaCake) blockers.push(`${soyaIn + soyaOil + soyaCake} soya record(s)`);
    if (salesOrders) blockers.push(`${salesOrders} sales order(s)`);
    if (deliveryNotes) blockers.push(`${deliveryNotes} delivery note(s)`);
    if (grns) blockers.push(`${grns} goods-received note(s)`);
    if (machines + equipment) blockers.push(`${machines + equipment} machine/equipment record(s)`);
    if (blockers.length) {
      throw new BadRequestException(`"${source.name}" can't be merged yet — it still has ${blockers.join(", ")}. Reassign or close those first, then merge.`);
    }

    const result = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const srcItems = await tx.inventoryItem.findMany({ where: { companyId: user.companyId, warehouseId: sourceId, deletedAt: null } });
      let mergedItems = 0;
      let movedItems = 0;
      for (const it of srcItems) {
        const dup = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: target.id, productId: it.productId, deletedAt: null } });
        if (dup) {
          await tx.inventoryItem.update({ where: { id: dup.id }, data: { quantityOnHand: { increment: it.quantityOnHand }, updatedById: user.id } });
          await tx.stockBatch.updateMany({ where: { inventoryItemId: it.id }, data: { inventoryItemId: dup.id, warehouseId: target.id, branchId: target.branchId } });
          await tx.stockMovement.updateMany({ where: { inventoryItemId: it.id }, data: { inventoryItemId: dup.id } });
          await tx.inventoryItem.update({ where: { id: it.id }, data: { quantityOnHand: 0, deletedAt: new Date(), updatedById: user.id } });
          mergedItems++;
        } else {
          await tx.inventoryItem.update({ where: { id: it.id }, data: { warehouseId: target.id, branchId: target.branchId, farmId: target.farmId, productionSiteId: target.productionSiteId, updatedById: user.id } });
          movedItems++;
        }
      }
      const b = await tx.stockBatch.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id, branchId: target.branchId } });
      const m1 = await tx.stockMovement.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      const m2 = await tx.stockMovement.updateMany({ where: { companyId: user.companyId, fromWarehouseId: sourceId }, data: { fromWarehouseId: target.id } });
      const m3 = await tx.stockMovement.updateMany({ where: { companyId: user.companyId, toWarehouseId: sourceId }, data: { toWarehouseId: target.id } });
      await tx.stockReorderLevel.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      await tx.stockExpiryAlert.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      await tx.stockAdjustment.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      await tx.stockReservation.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      await tx.warehouseLocation.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      await tx.inventoryValuation.updateMany({ where: { companyId: user.companyId, warehouseId: sourceId }, data: { warehouseId: target.id } });
      // UserWarehouseAccess PK is [userId, warehouseId] — drop where the user
      // already has the target, otherwise re-point.
      const access = await tx.userWarehouseAccess.findMany({ where: { warehouseId: sourceId } });
      for (const a of access) {
        const dup = await tx.userWarehouseAccess.findUnique({ where: { userId_warehouseId: { userId: a.userId, warehouseId: target.id } } });
        if (dup) await tx.userWarehouseAccess.delete({ where: { userId_warehouseId: { userId: a.userId, warehouseId: sourceId } } });
        else await tx.userWarehouseAccess.update({ where: { userId_warehouseId: { userId: a.userId, warehouseId: sourceId } }, data: { warehouseId: target.id } });
      }
      await tx.warehouse.update({ where: { id: sourceId }, data: { deletedAt: new Date(), code: `${source.code}__merged_${sourceId}`.slice(0, 60), updatedById: user.id } });
      return { movedItems, mergedItems, movedBatches: b.count, movedMovements: m1.count + m2.count + m3.count };
    }), { label: "InventoryService.mergeWarehouse" });

    await this.writeAudit(user, "DELETE", "Warehouse", sourceId, `Merged warehouse ${source.code} into ${target.code} — ${dto.reason}`, context, { branchId: source.branchId, warehouseId: target.id });
    return { data: { source: source.code, target: target.code, ...result } };
  }
}
