import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ApproveStockDto,
  CreateInventoryItemDto,
  CreateWarehouseLocationDto,
  InventoryQueryDto,
  MobileStockMovementDto,
  RefreshAlertsDto,
  SetReorderLevelDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockReservationDto,
  StockTransferDto
} from "./dto/inventory.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [items, movements, lowStock, expiryAlerts, valuation, pendingApprovals, weekMovements, adjustmentStats, movementsToday] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, {}), include: { product: true, warehouse: true } }),
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
        skuCount: new Set(items.map((item) => item.productId)).size,
        itemCount: items.length,
        totalQuantity: this.sum(items, "quantityOnHand"),
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
    const [warehouses, products, farms, productionSites, items] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, branchId: true, farmId: true, productionSiteId: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, sku: true, name: true, type: true, uomId: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) }, select: { id: true, code: true, name: true } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) }, select: { id: true, code: true, name: true } }),
      this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, {}), include: { product: { select: { sku: true, name: true } }, warehouse: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 })
    ]);
    return { data: { warehouses, products, farms, productionSites, items } };
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
    const data = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, query), include: { product: true, warehouse: true, farm: true, productionSite: true, stockBatches: { where: { deletedAt: null }, orderBy: { expiryDate: "asc" } } }, orderBy: { createdAt: "desc" } });
    return { data };
  }

  async createItem(user: AuthenticatedUser, dto: CreateInventoryItemDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const [warehouse, product] = await Promise.all([this.getWarehouse(user.companyId, dto.warehouseId), this.getProduct(user.companyId, dto.productId)]);
    const item = await this.prisma.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: warehouse.id, productId: product.id } },
      update: { reorderLevel: dto.reorderLevel, updatedById: user.id },
      create: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: dto.farmId ?? warehouse.farmId, productionSiteId: dto.productionSiteId ?? warehouse.productionSiteId, productId: product.id, uomId: product.uomId, reorderLevel: dto.reorderLevel, quantityOnHand: dto.openingQuantity ?? 0, createdById: user.id }
    });
    if ((dto.openingQuantity ?? 0) > 0) {
      await this.prisma.stockMovement.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, productId: product.id, inventoryItemId: item.id, toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: item.farmId, productionSiteId: item.productionSiteId, uomId: product.uomId, movementType: "OPENING_BALANCE", quantity: dto.openingQuantity!, referenceType: "InventoryItem", referenceId: item.id, notes: "Opening balance", createdById: user.id } });
    }
    await this.upsertReorder(item.id, dto.reorderLevel, undefined, undefined, user.id);
    await this.writeAudit(user, "CREATE", "InventoryItem", item.id, `Created inventory item for ${product.sku}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data: item };
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
    const transferNumber = await this.nextDocumentNumber(user.companyId, "STR", this.prisma.stockTransfer);
    const data = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({ data: { companyId: user.companyId, branchId: sourceItem.branchId, productId: dto.productId, stockBatchId: dto.stockBatchId, transferNumber, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, fromProductionSiteId: sourceItem.productionSiteId, toProductionSiteId: toWarehouse.productionSiteId, quantity: dto.quantity, barcode: dto.barcode, status: "COMPLETED", requestedById: user.id, approvedById: user.id, approvedAt: new Date(), createdById: user.id } });
      const consumed = await this.consumeFifoTx(tx, user, sourceItem, dto.quantity, "TRANSFER", "StockTransfer", transfer.id, `Transfer ${transferNumber}`);
      const destination = await tx.inventoryItem.upsert({ where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: dto.toWarehouseId, productId: dto.productId } }, update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id }, create: { companyId: user.companyId, branchId: toWarehouse.branchId, warehouseId: toWarehouse.id, farmId: toWarehouse.farmId, productionSiteId: toWarehouse.productionSiteId, productId: dto.productId, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id } });
      await tx.stockBatch.create({ data: { companyId: user.companyId, branchId: toWarehouse.branchId, farmId: toWarehouse.farmId, warehouseId: toWarehouse.id, productionSiteId: toWarehouse.productionSiteId, productId: dto.productId, inventoryItemId: destination.id, uomId: product.uomId, batchNumber: `${transferNumber}-${product.sku}`, quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: consumed.unitCost, createdById: user.id } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: toWarehouse.branchId, productId: dto.productId, inventoryItemId: destination.id, toWarehouseId: dto.toWarehouseId, warehouseId: dto.toWarehouseId, productionSiteId: toWarehouse.productionSiteId, uomId: product.uomId, movementType: "TRANSFER", quantity: dto.quantity, unitCost: consumed.unitCost, referenceType: "StockTransfer", referenceId: transfer.id, notes: `Transfer received ${transferNumber}`, createdById: user.id } });
      return transfer;
    });
    await this.writeAudit(user, "TRANSFER", "StockTransfer", data.id, `Transferred ${product.sku}`, context, { branchId: sourceItem.branchId, warehouseId: sourceItem.warehouseId });
    return { data };
  }

  async createAdjustment(user: AuthenticatedUser, dto: StockAdjustmentDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const item = await this.requireItem(user.companyId, dto.warehouseId, dto.productId);
    const adjustmentNumber = await this.nextDocumentNumber(user.companyId, "ADJ", this.prisma.stockAdjustment);
    const status = dto.approveNow && user.hasGlobalAccess ? "APPROVED" : "PENDING_APPROVAL";
    const adjustment = await this.prisma.stockAdjustment.create({ data: { companyId: user.companyId, branchId: item.branchId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, inventoryItemId: item.id, productId: item.productId, adjustmentNumber, adjustmentType: dto.adjustmentType, quantity: dto.quantity, reason: dto.reason, status, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined, createdById: user.id } });
    await this.prisma.stockApproval.create({ data: { companyId: user.companyId, branchId: item.branchId, approvalNumber: await this.nextDocumentNumber(user.companyId, "SAP", this.prisma.stockApproval), entityType: "StockAdjustment", entityId: adjustment.id, status, requestedById: user.id, approvedById: status === "APPROVED" ? user.id : undefined, approvedAt: status === "APPROVED" ? new Date() : undefined } });
    if (status === "APPROVED") await this.applyAdjustment(user, adjustment.id);
    await this.writeAudit(user, "CREATE", "StockAdjustment", adjustment.id, `Created stock adjustment ${adjustmentNumber}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: adjustment };
  }

  async approveAdjustment(user: AuthenticatedUser, id: string, dto: ApproveStockDto, context: RequestContext) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!adjustment) throw new NotFoundException("Stock adjustment was not found.");
    this.assertWarehouseAccess(user, adjustment.warehouseId);
    if (!user.permissions.includes("inventory.manage")) throw new ForbiddenException("You cannot approve stock adjustments.");
    if (dto.status === "APPROVED") await this.applyAdjustment(user, id);
    const data = await this.prisma.stockAdjustment.update({ where: { id }, data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), updatedById: user.id } });
    await this.prisma.stockApproval.updateMany({ where: { companyId: user.companyId, entityType: "StockAdjustment", entityId: id }, data: { status: dto.status, approvedById: user.id, approvedAt: new Date(), notes: dto.notes } });
    await this.writeAudit(user, dto.status === "APPROVED" ? "APPROVE" : "REJECT", "StockAdjustment", id, `Updated stock adjustment to ${dto.status}`, context, { branchId: adjustment.branchId, warehouseId: adjustment.warehouseId });
    return { data };
  }

  async reserve(user: AuthenticatedUser, dto: StockReservationDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const item = await this.requireItem(user.companyId, dto.warehouseId, dto.productId);
    await this.assertAvailable(user, item, dto.quantity, false);
    const reservation = await this.prisma.stockReservation.create({ data: { companyId: user.companyId, branchId: item.branchId, warehouseId: item.warehouseId, farmId: dto.farmId, productionSiteId: dto.productionSiteId ?? item.productionSiteId, inventoryItemId: item.id, productId: item.productId, reservationNumber: await this.nextDocumentNumber(user.companyId, "RSV", this.prisma.stockReservation), quantity: dto.quantity, requestedById: user.id, purpose: dto.purpose, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "StockReservation", reservation.id, "Reserved stock", context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: reservation };
  }

  async createLocation(user: AuthenticatedUser, dto: CreateWarehouseLocationDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const warehouse = await this.getWarehouse(user.companyId, dto.warehouseId);
    const data = await this.prisma.warehouseLocation.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, parentId: dto.parentId, code: dto.code.toUpperCase(), name: dto.name, barcode: dto.barcode, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "WarehouseLocation", data.id, `Created warehouse location ${data.code}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data };
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
    const batches = await this.prisma.stockBatch.findMany({ where: { companyId: user.companyId, deletedAt: null, expiryDate: { lte: until, gte: new Date() }, quantityRemaining: { gt: 0 }, ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) } });
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

  private async applyAdjustment(user: AuthenticatedUser, id: string) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!adjustment) throw new NotFoundException("Stock adjustment was not found.");
    const item = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id: adjustment.inventoryItemId } });
    if (Number(adjustment.quantity) < 0) await this.assertAvailable(user, item, Math.abs(Number(adjustment.quantity)), false);
    if (Number(adjustment.quantity) >= 0) {
      await this.prisma.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { increment: Number(adjustment.quantity) }, updatedById: user.id } });
      await this.prisma.stockMovement.create({ data: { companyId: user.companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, toWarehouseId: item.warehouseId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, uomId: item.uomId, movementType: "ADJUSTMENT_IN", quantity: Number(adjustment.quantity), unitCost: adjustment.unitCost, referenceType: "StockAdjustment", referenceId: adjustment.id, notes: adjustment.reason, createdById: user.id } });
    } else {
      const movementType = ["DAMAGE", "EXPIRY", "WASTE", "WRITE_OFF"].includes(adjustment.adjustmentType) ? "WASTE" : "ADJUSTMENT_OUT";
      await this.consumeFifo(user, item, Math.abs(Number(adjustment.quantity)), movementType, "StockAdjustment", adjustment.id, adjustment.reason);
    }
  }

  private async consumeFifo(user: AuthenticatedUser, item: { id: string; companyId: string; branchId: string; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string }, quantity: number, movementType: "ADJUSTMENT_OUT" | "SALE_DISPATCH" | "TRANSFER" | "WASTE" | "PRODUCTION_INPUT", referenceType: string, referenceId?: string, notes?: string) {
    return this.prisma.$transaction((tx) => this.consumeFifoTx(tx, user, item, quantity, movementType, referenceType, referenceId, notes));
  }

  private async consumeFifoTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: { id: string; companyId: string; branchId: string; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string }, quantity: number, movementType: "ADJUSTMENT_OUT" | "SALE_DISPATCH" | "TRANSFER" | "WASTE" | "PRODUCTION_INPUT", referenceType: string, referenceId?: string, notes?: string) {
    let remaining = quantity;
    let value = 0;
    const issued: Array<{ batchId: string; quantity: number; unitCost: number }> = [];
    const batches = await tx.stockBatch.findMany({ where: { companyId: user.companyId, inventoryItemId: item.id, deletedAt: null, quantityRemaining: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(batch.quantityRemaining));
      const unitCost = Number(batch.unitCost ?? 0);
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: take } } });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, stockBatchId: batch.id, fromWarehouseId: item.warehouseId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, uomId: item.uomId, movementType, quantity: take, unitCost, referenceType, referenceId, notes, createdById: user.id } });
      issued.push({ batchId: batch.id, quantity: take, unitCost });
      value += take * unitCost;
      remaining -= take;
    }
    if (remaining > 0) throw new BadRequestException("FIFO batches do not contain enough available stock.");
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } });
    return { issued, unitCost: value / Math.max(quantity, 1) };
  }

  private async assertAvailable(user: AuthenticatedUser, item: { id: string; quantityOnHand: Prisma.Decimal | number }, quantity: number, allowNegative?: boolean) {
    if (allowNegative && user.hasGlobalAccess) return;
    const reservations = await this.prisma.stockReservation.findMany({ where: { inventoryItemId: item.id, status: "ACTIVE", deletedAt: null }, select: { quantity: true } });
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

    const movement = await this.prisma.$transaction(async (tx) => {
      const mov = await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: item.branchId,
          productId: item.productId,
          inventoryItemId: item.id,
          warehouseId: item.warehouseId,
          toWarehouseId: isIn ? item.warehouseId : undefined,
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
        data: {
          quantityOnHand: isIn ? { increment: dto.quantity } : { decrement: dto.quantity },
          updatedById: user.id
        }
      });
      return mov;
    });

    await this.writeAudit(user, "CREATE", "StockMovement", movement.id, `Mobile ${dto.movementType} ${item.product.sku}`, context, { branchId: item.branchId, warehouseId: item.warehouseId });
    return { data: movement };
  }

  private async lowStockRows(user: AuthenticatedUser) {
    const items = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, {}), include: { product: true, warehouse: true, stockReorderLevels: true } });
    return items.filter((item) => Number(item.quantityOnHand) <= Number(item.stockReorderLevels[0]?.minimumQuantity ?? item.reorderLevel)).map((item) => ({ id: item.id, sku: item.product.sku, product: item.product.name, warehouse: item.warehouse.name, quantityOnHand: Number(item.quantityOnHand), reorderLevel: Number(item.stockReorderLevels[0]?.minimumQuantity ?? item.reorderLevel) }));
  }

  private async valuationRows(user: AuthenticatedUser, query: InventoryQueryDto) {
    const items = await this.prisma.inventoryItem.findMany({ where: this.itemWhere(user, query), include: { product: true, warehouse: true, stockBatches: { where: { deletedAt: null, quantityRemaining: { gt: 0 } } } } });
    return items.map((item) => {
      const value = item.stockBatches.reduce((sum, batch) => sum + Number(batch.quantityRemaining) * Number(batch.unitCost ?? 0), 0);
      const quantity = Number(item.quantityOnHand);
      return { itemId: item.id, warehouse: item.warehouse.name, sku: item.product.sku, product: item.product.name, quantityOnHand: quantity, unitCost: quantity > 0 ? Number((value / quantity).toFixed(4)) : 0, totalValue: Number(value.toFixed(2)) };
    });
  }

  private itemWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, warehouseId: query.warehouseId, farmId: query.farmId, productionSiteId: query.productionSiteId, productId: query.productId, ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) };
  }

  private movementWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, warehouseId: query.warehouseId, farmId: query.farmId, productionSiteId: query.productionSiteId, productId: query.productId, ...(query.startDate || query.endDate ? { movementDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } } : {}), ...(user.hasGlobalAccess ? {} : { OR: [{ warehouseId: { in: user.warehouseIds } }, { fromWarehouseId: { in: user.warehouseIds } }, { toWarehouseId: { in: user.warehouseIds } }] }) };
  }

  private expiryWhere(user: AuthenticatedUser, query: InventoryQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, productId: query.productId, ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) };
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

  private async nextDocumentNumber(companyId: string, prefix: string, model: { count: (args: { where: { companyId: string } }) => Promise<number> }) {
    const count = await model.count({ where: { companyId } });
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  }

  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "TRANSFER" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string; warehouseId?: string }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
