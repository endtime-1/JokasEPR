import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { nextRef } from "../../common/next-ref";
import { startOfTodayAccra } from "../../common/utils/timezone";
import {
  ApproveStockDto,
  CreateInventoryItemDto,
  CreateWarehouseLocationDto,
  InventoryQueryDto,
  MobileStockMovementDto,
  RefreshAlertsDto,
  ReleaseReservationDto,
  SetReorderLevelDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockReservationDto,
  StockTransferDto,
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
    const [skuGroups, itemCount, totalQty, movements, lowStock, expiryAlerts, valuation, pendingApprovals, weekMovements, adjustmentStats, movementsToday] = await Promise.all([
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
      this.prisma.stockMovement.count({ where: { ...this.movementWhere(user, {}), movementDate: { gte: todayStart } } })
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
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, sku: true, name: true, type: true, uomId: true }, orderBy: { name: "asc" } }),
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
    const data = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, query), include: { product: true, warehouse: true, farm: true, productionSite: true, stockBatches: { where: { deletedAt: null }, orderBy: { expiryDate: "asc" }, take: 10 } }, orderBy: { createdAt: "desc" }, take: 200 });
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

  async transfer(user: AuthenticatedUser, dto: StockTransferDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.fromWarehouseId);
    this.assertWarehouseAccess(user, dto.toWarehouseId);
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException("Source and destination warehouses must be different.");
    const [sourceItem, toWarehouse, product] = await Promise.all([this.requireItem(user.companyId, dto.fromWarehouseId, dto.productId), this.getWarehouse(user.companyId, dto.toWarehouseId), this.getProduct(user.companyId, dto.productId)]);
    await this.assertAvailable(user, sourceItem, dto.quantity, false);
    const transferNumber = await nextRef(this.prisma, user.companyId, "STR");
    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
        const transfer = await tx.stockTransfer.create({ data: { companyId: user.companyId, branchId: sourceItem.branchId, productId: dto.productId, stockBatchId: dto.stockBatchId, transferNumber, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, fromProductionSiteId: sourceItem.productionSiteId, toProductionSiteId: toWarehouse.productionSiteId, quantity: dto.quantity, barcode: dto.barcode, status: "COMPLETED", requestedById: user.id, approvedById: user.id, approvedAt: new Date(), createdById: user.id } });
        const consumed = await this.consumeFifoTx(tx, user, sourceItem, dto.quantity, "TRANSFER", "StockTransfer", transfer.id, `Transfer ${transferNumber}`);
        const destination = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.toWarehouseId, productId: dto.productId } }, update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }, create: { companyId: user.companyId, branchId: toWarehouse.branchId, warehouseId: toWarehouse.id, farmId: toWarehouse.farmId, productionSiteId: toWarehouse.productionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id } });
        await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: toWarehouse.branchId, farmId: toWarehouse.farmId, warehouseId: toWarehouse.id, productionSiteId: toWarehouse.productionSiteId, productId: dto.productId, inventoryItemId: destination.id, uomId: product.uomId, batchNumber: `${transferNumber}-${product.sku}`, quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: consumed.unitCost, createdById: user.id } });
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: toWarehouse.branchId, productId: dto.productId, inventoryItemId: destination.id, toWarehouseId: dto.toWarehouseId, warehouseId: dto.toWarehouseId, productionSiteId: toWarehouse.productionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, unitCost: consumed.unitCost, referenceType: "StockTransfer", referenceId: transfer.id, notes: `Transfer received ${transferNumber}`, createdById: user.id } });
        return transfer;
      });
    } catch (err: any) {
      if (err?.code === "P2002") throw new ConflictException("A concurrent transfer was processed at the same time. Please try again.");
      throw err;
    }
    await this.writeAudit(user, "TRANSFER", "StockTransfer", data.id, `Transferred ${product.sku}`, context, { branchId: sourceItem.branchId, warehouseId: sourceItem.warehouseId });
    return { data };
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
    const status = dto.approveNow && user.hasGlobalAccess ? "APPROVED" : "PENDING_APPROVAL";
    const adjustment = await this.prisma.$transaction(async (tx) => {
      const adjustmentNumber = await nextRef(tx, user.companyId, "ADJ");
      const created = await tx.stockAdjustment.create({ data: { companyId: user.companyId, branchId: item.branchId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, inventoryItemId: item.id, productId: item.productId, adjustmentNumber, adjustmentType: dto.adjustmentType, quantity: dto.quantity, reason: dto.reason, status, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined, createdById: user.id } });
      await tx.stockApproval.create({ data: { companyId: user.companyId, branchId: item.branchId, approvalNumber: await nextRef(tx, user.companyId, "SAP"), entityType: "StockAdjustment", entityId: created.id, status, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined } });
      if (status === "APPROVED") await this.applyAdjustmentTx(tx, user, created, item);
      return created;
    });
    await this.writeAudit(user, "CREATE", "StockAdjustment", adjustment.id, `Created stock adjustment ${adjustment.adjustmentNumber}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: adjustment };
  }

  async approveAdjustment(user: AuthenticatedUser, id: string, dto: ApproveStockDto, context: RequestContext) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!adjustment) throw new NotFoundException("Stock adjustment was not found.");
    this.assertWarehouseAccess(user, adjustment.warehouseId);
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot approve stock adjustments.");
    if (adjustment.status !== "PENDING_APPROVAL") throw new BadRequestException(`Adjustment is already ${adjustment.status.toLowerCase().replace(/_/g, " ")}. Only pending adjustments can be processed.`);
    if (dto.status === "APPROVED") await this.applyAdjustment(user, id);
    const data = await this.prisma.stockAdjustment.update({ where: { id }, data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), updatedById: user.id } });
    await this.prisma.stockApproval.updateMany({ where: { companyId: user.companyId, entityType: "StockAdjustment", entityId: id }, data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), notes: dto.notes } });
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
    await this.prisma.warehouseLocation.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
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
    return { data: await this.prisma.stockMovement.findMany({ where: this.movementWhere(user, query), include: { product: true, warehouse: true, fromWarehouse: true, toWarehouse: true, stockBatch: true }, orderBy: { movementDate: "desc" }, take: 300 }) };
  }

  async lowStock(user: AuthenticatedUser) {
    return { data: await this.lowStockRows(user) };
  }

  async expiryAlerts(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { data: await this.prisma.stockExpiryAlert.findMany({ where: this.expiryWhere(user, query), include: { product: true, warehouse: true, stockBatch: true }, orderBy: { expiryDate: "asc" }, take: 200 }) };
  }

  async valuation(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { data: await this.valuationRows(user, query) };
  }

  async warehouseView(user: AuthenticatedUser, warehouseId: string) {
    this.assertWarehouseAccess(user, warehouseId);
    return this.listItems(user, { warehouseId });
  }

  async farmView(user: AuthenticatedUser, farmId: string) {
    if (!user.hasGlobalAccess && !user.farmIds.includes(farmId)) throw new ForbiddenException("You do not have access to this farm.");
    return this.listItems(user, { farmId });
  }

  async productionSiteView(user: AuthenticatedUser, productionSiteId: string) {
    if (!user.hasGlobalAccess && !user.productionSiteIds.includes(productionSiteId)) throw new ForbiddenException("You do not have access to this production site.");
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

  // Called outside any existing transaction (from approveAdjustment) — fetches
  // its own rows and opens its own transaction around the shared tx-based core.
  private async applyAdjustment(user: AuthenticatedUser, id: string) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!adjustment) throw new NotFoundException("Stock adjustment was not found.");
    const item = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id: adjustment.inventoryItemId } });
    await this.prisma.$transaction((tx) => this.applyAdjustmentTx(tx, user, adjustment, item));
  }

  // Shared core, callable either standalone (applyAdjustment above) or nested
  // inside an already-open transaction (createAdjustment) so the adjustment
  // row's own creation/approval and the actual stock movement either both
  // commit or both roll back together — see the (C1 follow-up) note on
  // createAdjustment for why that matters.
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
    return this.prisma.$transaction((tx) => this.consumeFifoTx(tx, user, item, quantity, movementType, referenceType, referenceId, notes));
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

    // "In" movements previously incremented quantityOnHand with no StockBatch
    // created at all — same desync, plus no cost-basis/lot tracking for
    // stock that entered this way. Mirrors stockIn()'s pattern elsewhere.
    const result = await this.prisma.$transaction(async (tx) => {
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
          createdById: user.id
        }
      });
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }
      });
      return { batch, movement: mov };
    });

    await this.writeAudit(user, "CREATE", "StockMovement", result.movement.id, `Mobile ${dto.movementType} ${item.product.sku}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: result.movement };
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

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }


  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
