import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { CreateEggSaleDto, EggSalesQueryDto } from "./dto/egg-sales.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

type InventoryItemContext = {
  id: string;
  companyId: string;
  branchId: string;
  farmId: string | null;
  warehouseId: string;
  productionSiteId: string | null;
  productId: string;
  uomId: string;
  quantityOnHand: Prisma.Decimal;
};

function num(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class EggSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Warehouses this could possibly be sold from, plus current on-hand
  // crates — enough context for the form to warn before a sale is even
  // attempted, not just reject it after.
  async options(user: AuthenticatedUser) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        companyId: user.companyId, deletedAt: null, status: "ACTIVE", type: "EGG_STORE",
        ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } })
      },
      select: { id: true, code: true, name: true, branchId: true },
      orderBy: { name: "asc" }
    });
    const product = await this.eggsProduct(user.companyId);
    const items = product
      ? await this.prisma.inventoryItem.findMany({
          where: { companyId: user.companyId, productId: product.id, warehouseId: { in: warehouses.map((w) => w.id) }, deletedAt: null },
          select: { warehouseId: true, quantityOnHand: true }
        })
      : [];
    const onHandByWarehouse = new Map(items.map((i) => [i.warehouseId, num(i.quantityOnHand)]));
    return {
      data: {
        warehouses: warehouses.map((w) => ({ ...w, onHandCrates: onHandByWarehouse.get(w.id) ?? 0 })),
        eggsProductConfigured: !!product,
        piecesPerCrate: product?.piecesPerUnit ?? 30
      }
    };
  }

  async listSales(user: AuthenticatedUser, query: EggSalesQueryDto) {
    const rows = await this.prisma.eggSale.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.startDate || query.endDate
          ? { saleDate: { ...(query.startDate ? { gte: new Date(query.startDate) } : {}), ...(query.endDate ? { lte: new Date(query.endDate) } : {}) } }
          : {}),
        ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { warehouseId: { in: user.warehouseIds } })
      },
      orderBy: { saleDate: "desc" },
      take: 200
    });
    const warehouses = await this.prisma.warehouse.findMany({ where: { id: { in: rows.map((r) => r.warehouseId) } }, select: { id: true, name: true } });
    const whMap = new Map(warehouses.map((w) => [w.id, w.name]));
    return { data: rows.map((r) => ({ ...r, warehouseName: whMap.get(r.warehouseId) ?? r.warehouseId })) };
  }

  async createSale(user: AuthenticatedUser, dto: CreateEggSaleDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, companyId: user.companyId, deletedAt: null } });
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    if (warehouse.type !== "EGG_STORE") {
      throw new BadRequestException(`"${warehouse.name}" isn't an egg store — egg sales can only be recorded from a warehouse of type Egg Store.`);
    }

    const product = await this.eggsProduct(user.companyId);
    if (!product) {
      throw new BadRequestException('No "Eggs" product (SKU "EG") is set up in the catalog yet — add it under Settings → Catalog before recording an egg sale.');
    }
    const piecesPerCrate = product.piecesPerUnit || 30;
    const quantityPieces = dto.unit === "CRATES" ? Math.round(dto.quantity * piecesPerCrate) : Math.round(dto.quantity);
    const quantityCrates = Number((quantityPieces / piecesPerCrate).toFixed(2));
    const totalAmount = Number((quantityCrates * dto.unitPriceCrate).toFixed(4));

    const item = await this.prisma.inventoryItem.findFirst({
      where: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: product.id, deletedAt: null }
    });
    if (!item) throw new BadRequestException(`No egg stock recorded yet in "${warehouse.name}".`);

    let saleNumber = dto.saleNumber?.trim();
    if (saleNumber) {
      const existing = await this.prisma.eggSale.findFirst({ where: { companyId: user.companyId, saleNumber } });
      if (existing) throw new BadRequestException(`Sale number "${saleNumber}" is already in use.`);
    } else {
      saleNumber = await nextRef(this.prisma, user.companyId, "ES");
    }
    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eggSale.create({
        data: {
          companyId: user.companyId,
          branchId: warehouse.branchId,
          warehouseId: dto.warehouseId,
          saleNumber,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          buyerName: dto.buyerName,
          quantityPieces,
          quantityCrates,
          unitPriceCrate: dto.unitPriceCrate,
          totalAmount,
          notes: dto.notes,
          createdById: user.id
        }
      });
      await this.consumeFifoTx(tx, user, item as InventoryItemContext, quantityCrates, "EggSale", created.id, `Egg sale ${saleNumber}${dto.buyerName ? ` to ${dto.buyerName}` : ""}`);
      return created;
    });
    await this.writeAudit(user, "CREATE", sale.id, `Recorded egg sale ${saleNumber} — ${quantityCrates} crate(s) (${quantityPieces} eggs)`, context, warehouse.branchId, dto.warehouseId);
    return { data: sale };
  }

  // Reverses the stock deduction and soft-deletes the record — the correction
  // path for "I entered that wrong," matching how mistaken records get fixed
  // elsewhere in this app (soft-delete + reversing movement, never a hard
  // delete that erases the audit trail). Restores the EXACT stock batches the
  // original sale consumed (found via its own SALE_DISPATCH movements),
  // rather than just bumping quantityOnHand — that would leave the item-level
  // total out of sync with what the batch ledger actually backs, the same
  // class of drift a bare +quantity "return" would create anywhere else in
  // this codebase.
  async voidSale(user: AuthenticatedUser, id: string, context: RequestContext) {
    const sale = await this.prisma.eggSale.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!sale) throw new NotFoundException("Egg sale was not found.");
    this.assertWarehouseAccess(user, sale.warehouseId);

    const dispatches = await this.prisma.stockMovement.findMany({
      where: { companyId: user.companyId, referenceType: "EggSale", referenceId: sale.id, movementType: "SALE_DISPATCH", deletedAt: null }
    });
    if (!dispatches.length) throw new BadRequestException("No stock movement found for this sale to reverse — cannot void safely.");

    await this.prisma.$transaction(async (tx) => {
      const voided = await tx.eggSale.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), updatedById: user.id } });
      if (voided.count === 0) throw new BadRequestException("This sale was already voided.");

      for (const movement of dispatches) {
        if (!movement.stockBatchId || !movement.inventoryItemId) continue;
        await tx.stockBatch.update({ where: { id: movement.stockBatchId }, data: { quantityRemaining: { increment: movement.quantity }, status: "AVAILABLE" } });
        await tx.inventoryItem.update({ where: { id: movement.inventoryItemId }, data: { quantityOnHand: { increment: movement.quantity } } });
        await tx.stockMovement.create({
          data: {
            companyId: user.companyId,
            branchId: movement.branchId,
            productId: movement.productId,
            inventoryItemId: movement.inventoryItemId,
            stockBatchId: movement.stockBatchId,
            toWarehouseId: movement.warehouseId,
            warehouseId: movement.warehouseId,
            farmId: movement.farmId,
            productionSiteId: movement.productionSiteId,
            uomId: movement.uomId,
            movementType: "RETURN_IN",
            quantity: movement.quantity,
            unitCost: movement.unitCost,
            referenceType: "EggSale",
            referenceId: sale.id,
            notes: `Voided egg sale ${sale.saleNumber}`,
            createdById: user.id
          }
        });
      }
    });
    await this.writeAudit(user, "DELETE", id, `Voided egg sale ${sale.saleNumber}`, context, sale.branchId ?? undefined, sale.warehouseId);
    return { data: { id } };
  }

  private async eggsProduct(companyId: string) {
    return this.prisma.product.findFirst({ where: { companyId, deletedAt: null, sku: "EG" }, select: { id: true, piecesPerUnit: true } });
  }

  // Mirrors sales.service.ts's consumeFifoTx (and its sibling in every other
  // module — poultry, market-planning, feed-production, soya-processing,
  // maintenance) — floor-guarded per-lot decrement so two concurrent egg
  // sales can't both succeed against the same last few crates.
  private async consumeFifoTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: InventoryItemContext, quantity: number, referenceType: string, referenceId: string, notes?: string) {
    let remaining = quantity;
    const batches = await tx.stockBatch.findMany({
      where: { companyId: user.companyId, inventoryItemId: item.id, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
    });
    const available = batches.reduce((sum, batch) => sum + num(batch.quantityRemaining), 0);
    if (available < quantity || num(item.quantityOnHand) < quantity) {
      throw new BadRequestException(`Only ${available} crate(s) available — cannot sell ${quantity}.`);
    }
    for (const batch of batches) {
      if (remaining <= 0) break;
      const issue = Math.min(remaining, num(batch.quantityRemaining));
      const batchUpdate = await tx.stockBatch.updateMany({
        where: { id: batch.id, quantityRemaining: { gte: issue } },
        data: { quantityRemaining: { decrement: issue } }
      });
      if (batchUpdate.count === 0) throw new BadRequestException("Stock batch was consumed concurrently by another sale. Please retry.");
      await tx.stockBatch.updateMany({ where: { id: batch.id, quantityRemaining: 0 }, data: { status: "CONSUMED" } });
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: item.branchId,
          productId: item.productId,
          inventoryItemId: item.id,
          stockBatchId: batch.id,
          fromWarehouseId: item.warehouseId,
          warehouseId: item.warehouseId,
          farmId: item.farmId,
          productionSiteId: item.productionSiteId,
          uomId: item.uomId,
          movementType: "SALE_DISPATCH",
          quantity: issue,
          unitCost: batch.unitCost,
          referenceType,
          referenceId,
          notes,
          createdById: user.id
        }
      });
      remaining -= issue;
    }
    if (remaining > 0) throw new BadRequestException("Stock batches on hand cover less than the required quantity — inventory and lot records are out of sync.");
    const itemUpdate = await tx.inventoryItem.updateMany({
      where: { id: item.id, quantityOnHand: { gte: quantity } },
      data: { quantityOnHand: { decrement: quantity }, updatedById: user.id }
    });
    if (itemUpdate.count === 0) throw new BadRequestException("Insufficient stock — possibly consumed concurrently. Please retry.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException("You do not have access to this warehouse.");
    }
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE", entityId: string, summary: string, context: RequestContext, branchId: string | undefined, warehouseId: string) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType: "EggSale", entityId, summary, branchId, warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
