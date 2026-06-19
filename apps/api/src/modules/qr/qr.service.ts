import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { QrCode, QrEntityType } from "@prisma/client";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { QrStockMovementDto } from "./dto/qr.dto";

type ResolvedEntity = {
  entityType: QrEntityType;
  entityId: string;
  label: string;
  permission: string;
  branchId?: string | null;
  farmId?: string | null;
  warehouseId?: string | null;
  productionSiteId?: string | null;
  details: Record<string, unknown>;
};

const ENTITY_PERMISSIONS: Record<QrEntityType, string> = {
  FEED_PRODUCTION_BATCH: "feed.read",
  SOYA_PROCESSING_BATCH: "soya.read",
  STOCK_BATCH: "inventory.read",
  FLOCK_BATCH: "poultry.read",
  WAREHOUSE_ITEM: "inventory.read",
  SALES_INVOICE: "sales.read",
  DELIVERY_NOTE: "sales.read",
  PURCHASE_ORDER: "procurement.read",
  GOODS_RECEIVED_NOTE: "procurement.read"
};

function decimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async getOrCreate(user: AuthenticatedUser, entityType: QrEntityType, entityId: string) {
    const resolved = await this.resolveEntity(user, entityType, entityId);
    let qr = await this.prisma.qrCode.findFirst({
      where: { companyId: user.companyId, entityType, entityId, deletedAt: null }
    });

    if (!qr) {
      const token = this.createToken();
      qr = await this.prisma.qrCode.create({
        data: {
          companyId: user.companyId,
          branchId: resolved.branchId ?? null,
          farmId: resolved.farmId ?? null,
          warehouseId: resolved.warehouseId ?? null,
          productionSiteId: resolved.productionSiteId ?? null,
          entityType,
          entityId,
          token,
          payload: this.payload(token),
          barcodeValue: this.barcodeValue(token),
          label: resolved.label,
          metadata: resolved.details as any,
          createdById: user.id
        }
      });
      await this.audit.write({
        companyId: user.companyId,
        branchId: qr.branchId ?? undefined,
        farmId: qr.farmId ?? undefined,
        warehouseId: qr.warehouseId ?? undefined,
        productionSiteId: qr.productionSiteId ?? undefined,
        actorUserId: user.id,
        action: "CREATE",
        entityType: "QrCode",
        entityId: qr.id,
        summary: `Generated QR code for ${entityType} ${resolved.label}`
      });
    }

    return { data: await this.formatQr(qr, resolved) };
  }

  async labelSvg(user: AuthenticatedUser, entityType: QrEntityType, entityId: string): Promise<string> {
    const result = await this.getOrCreate(user, entityType, entityId);
    const qr = result.data;
    await this.audit.write({
      companyId: user.companyId,
      branchId: qr.branchId ?? undefined,
      farmId: qr.farmId ?? undefined,
      warehouseId: qr.warehouseId ?? undefined,
      productionSiteId: qr.productionSiteId ?? undefined,
      actorUserId: user.id,
      action: "EXPORT",
      entityType: "QrLabel",
      entityId: qr.id,
      summary: `Printed QR label for ${qr.entityType} ${qr.label}`
    });
    return this.renderLabelSvg(qr);
  }

  async scan(user: AuthenticatedUser, code: string) {
    const normalized = this.extractCode(code);
    const qr = await this.prisma.qrCode.findFirst({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ payload: normalized }, { token: normalized }, { barcodeValue: normalized }]
      }
    });
    if (!qr) throw new NotFoundException("QR code or barcode was not found.");
    if (qr.expiresAt && qr.expiresAt < new Date()) throw new ForbiddenException("QR code has expired.");

    const resolved = await this.resolveEntity(user, qr.entityType, qr.entityId);
    await this.prisma.qrCode.update({ where: { id: qr.id }, data: { lastScannedAt: new Date() } });
    await this.audit.write({
      companyId: user.companyId,
      branchId: qr.branchId ?? undefined,
      farmId: qr.farmId ?? undefined,
      warehouseId: qr.warehouseId ?? undefined,
      productionSiteId: qr.productionSiteId ?? undefined,
      actorUserId: user.id,
      action: "UPDATE",
      entityType: "QrCode",
      entityId: qr.id,
      summary: `Scanned QR/barcode for ${qr.entityType} ${qr.label}`
    });

    return {
      data: {
        ...(await this.formatQr(qr, resolved)),
        scannedAt: new Date().toISOString(),
        details: resolved.details
      }
    };
  }

  async stockMovementByCode(user: AuthenticatedUser, dto: QrStockMovementDto) {
    if (!user.permissions.includes("inventory.manage")) {
      throw new ForbiddenException("You cannot create QR stock movements.");
    }
    const scanned = await this.scan(user, dto.code);
    const qr = scanned.data;
    if (!["STOCK_BATCH", "WAREHOUSE_ITEM"].includes(qr.entityType)) {
      throw new BadRequestException("Only stock batches and warehouse items can create stock movement from QR scan.");
    }

    const stockBatch =
      qr.entityType === "STOCK_BATCH"
        ? await this.prisma.stockBatch.findUnique({ where: { id: qr.entityId } })
        : null;
    const inventoryItem =
      qr.entityType === "WAREHOUSE_ITEM"
        ? await this.prisma.inventoryItem.findUnique({ where: { id: qr.entityId } })
        : stockBatch?.inventoryItemId
          ? await this.prisma.inventoryItem.findUnique({ where: { id: stockBatch.inventoryItemId } })
          : null;

    if (!inventoryItem) throw new BadRequestException("No inventory item is linked to this QR code.");
    if (dto.movementType !== "ADJUSTMENT_IN" && decimal(inventoryItem.quantityOnHand) < dto.quantity) {
      throw new BadRequestException("Insufficient stock for QR stock movement.");
    }

    if (dto.movementType === "TRANSFER" && !dto.toWarehouseId) {
      throw new BadRequestException("Destination warehouse is required for QR transfer.");
    }

    const destinationWarehouse = dto.toWarehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: dto.toWarehouseId, companyId: user.companyId, deletedAt: null } })
      : null;
    if (dto.movementType === "TRANSFER") {
      if (!destinationWarehouse) throw new BadRequestException("Destination warehouse was not found.");
      this.assertLocationAccess(user, {
        entityType: "WAREHOUSE_ITEM",
        entityId: inventoryItem.id,
        label: "Destination warehouse",
        permission: "inventory.read",
        branchId: destinationWarehouse.branchId,
        farmId: destinationWarehouse.farmId,
        warehouseId: destinationWarehouse.id,
        productionSiteId: destinationWarehouse.productionSiteId,
        details: {}
      });
      if (destinationWarehouse.id === inventoryItem.warehouseId) throw new BadRequestException("Destination warehouse must be different.");
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      if (dto.movementType === "TRANSFER" && destinationWarehouse) {
        let destinationItem = await tx.inventoryItem.findUnique({
          where: {
            companyId_warehouseId_productId: {
              companyId: user.companyId,
              warehouseId: destinationWarehouse.id,
              productId: inventoryItem.productId
            }
          }
        });
        if (!destinationItem) {
          destinationItem = await tx.inventoryItem.create({
            data: {
              companyId: user.companyId,
              branchId: destinationWarehouse.branchId,
              farmId: destinationWarehouse.farmId,
              warehouseId: destinationWarehouse.id,
              productionSiteId: destinationWarehouse.productionSiteId,
              productId: inventoryItem.productId,
              uomId: inventoryItem.uomId,
              quantityOnHand: 0,
              createdById: user.id
            }
          });
        }
        await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantityOnHand: { decrement: dto.quantity } } });
        await tx.inventoryItem.update({ where: { id: destinationItem.id }, data: { quantityOnHand: { increment: dto.quantity } } });
        if (stockBatch) {
          await tx.stockBatch.update({ where: { id: stockBatch.id }, data: { quantityRemaining: { decrement: dto.quantity } } });
        }
      } else {
        const signedQty = dto.movementType === "ADJUSTMENT_IN" ? dto.quantity : -dto.quantity;
        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { quantityOnHand: { increment: signedQty } }
        });
        if (stockBatch) {
          await tx.stockBatch.update({
            where: { id: stockBatch.id },
            data: { quantityRemaining: { increment: signedQty } }
          });
        }
      }
      return tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: inventoryItem.branchId,
          productId: inventoryItem.productId,
          inventoryItemId: inventoryItem.id,
          stockBatchId: stockBatch?.id,
          fromWarehouseId: dto.movementType === "ADJUSTMENT_IN" ? null : inventoryItem.warehouseId,
          toWarehouseId: dto.movementType === "TRANSFER" ? dto.toWarehouseId : dto.movementType === "ADJUSTMENT_IN" ? inventoryItem.warehouseId : null,
          warehouseId: inventoryItem.warehouseId,
          farmId: inventoryItem.farmId,
          productionSiteId: inventoryItem.productionSiteId,
          uomId: inventoryItem.uomId,
          movementType: dto.movementType,
          quantity: dto.quantity,
          referenceType: "QrCode",
          referenceId: qr.id,
          notes: dto.notes ?? `QR stock movement from ${qr.label}`,
          createdById: user.id
        }
      });
    });

    await this.audit.write({
      companyId: user.companyId,
      branchId: inventoryItem.branchId,
      farmId: inventoryItem.farmId ?? undefined,
      warehouseId: inventoryItem.warehouseId,
      productionSiteId: inventoryItem.productionSiteId ?? undefined,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "StockMovement",
      entityId: movement.id,
      summary: `Created ${dto.movementType} stock movement from QR scan ${qr.label}`,
      metadata: { qrCodeId: qr.id, quantity: dto.quantity }
    });

    return { data: movement };
  }

  private async formatQr(qr: QrCode, resolved: ResolvedEntity) {
    const qrSvg = await QRCode.toString(qr.payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 180 });
    return {
      id: qr.id,
      entityType: qr.entityType,
      entityId: qr.entityId,
      label: qr.label,
      payload: qr.payload,
      barcodeValue: qr.barcodeValue,
      status: qr.status,
      branchId: qr.branchId,
      farmId: qr.farmId,
      warehouseId: qr.warehouseId,
      productionSiteId: qr.productionSiteId,
      qrSvg,
      barcodeSvg: this.renderCode39(qr.barcodeValue, 360, 78),
      details: resolved.details,
      createdAt: qr.createdAt,
      lastScannedAt: qr.lastScannedAt
    };
  }

  private async resolveEntity(user: AuthenticatedUser, entityType: QrEntityType, entityId: string): Promise<ResolvedEntity> {
    const permission = ENTITY_PERMISSIONS[entityType];
    if (!user.permissions.includes(permission)) throw new ForbiddenException("You cannot access this QR data.");

    let resolved: ResolvedEntity | null = null;
    switch (entityType) {
      case "FEED_PRODUCTION_BATCH": {
        const row = await this.prisma.feedProductionBatch.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { finishedProduct: { select: { name: true, sku: true } }, productionSite: { select: { name: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.batchNumber,
            permission,
            branchId: row.branchId,
            productionSiteId: row.productionSiteId,
            details: {
              batchNumber: row.batchNumber,
              product: row.finishedProduct.name,
              sku: row.finishedProduct.sku,
              quantityKg: decimal(row.producedQuantityKg),
              status: row.status,
              productionSite: row.productionSite.name,
              productionDate: row.productionDate
            }
          };
        }
        break;
      }
      case "SOYA_PROCESSING_BATCH": {
        const row = await this.prisma.soyaProcessingBatch.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { productionSite: { select: { name: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.batchNumber,
            permission,
            branchId: row.branchId,
            productionSiteId: row.productionSiteId,
            details: {
              batchNumber: row.batchNumber,
              beansUsedKg: decimal(row.beansUsedKg),
              status: row.status,
              productionSite: row.productionSite.name,
              processingDate: row.processingDate
            }
          };
        }
        break;
      }
      case "STOCK_BATCH": {
        const row = await this.prisma.stockBatch.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } }, uom: { select: { code: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.batchNumber,
            permission,
            branchId: row.branchId,
            farmId: row.farmId,
            warehouseId: row.warehouseId,
            productionSiteId: row.productionSiteId,
            details: {
              batchNumber: row.batchNumber,
              product: row.product.name,
              sku: row.product.sku,
              quantityRemaining: decimal(row.quantityRemaining),
              uom: row.uom.code,
              warehouse: row.warehouse.name,
              status: row.status,
              expiryDate: row.expiryDate
            }
          };
        }
        break;
      }
      case "WAREHOUSE_ITEM": {
        const row = await this.prisma.inventoryItem.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } }, uom: { select: { code: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: `${row.product.sku} @ ${row.warehouse.name}`,
            permission,
            branchId: row.branchId,
            farmId: row.farmId,
            warehouseId: row.warehouseId,
            productionSiteId: row.productionSiteId,
            details: {
              product: row.product.name,
              sku: row.product.sku,
              quantityOnHand: decimal(row.quantityOnHand),
              reorderLevel: decimal(row.reorderLevel),
              uom: row.uom.code,
              warehouse: row.warehouse.name,
              status: row.status
            }
          };
        }
        break;
      }
      case "FLOCK_BATCH": {
        const row = await this.prisma.flockBatch.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { farm: { select: { name: true } }, poultryHouse: { select: { name: true, code: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.code,
            permission,
            branchId: row.branchId,
            farmId: row.farmId,
            details: {
              code: row.code,
              name: row.name,
              birdType: row.birdType,
              openingBirdCount: row.openingBirdCount,
              status: row.status,
              farm: row.farm.name,
              poultryHouse: `${row.poultryHouse.code} - ${row.poultryHouse.name}`,
              startDate: row.startDate
            }
          };
        }
        break;
      }
      case "SALES_INVOICE": {
        const row = await this.prisma.invoice.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { customer: { select: { name: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.invoiceNumber,
            permission,
            branchId: row.branchId,
            details: {
              invoiceNumber: row.invoiceNumber,
              customer: row.customer.name,
              status: row.status,
              totalAmount: decimal(row.totalAmount),
              balanceDue: decimal(row.balanceDue),
              invoiceDate: row.invoiceDate
            }
          };
        }
        break;
      }
      case "DELIVERY_NOTE": {
        const row = await this.prisma.deliveryNote.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { warehouse: { select: { name: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.deliveryNumber,
            permission,
            branchId: row.branchId,
            warehouseId: row.warehouseId,
            details: {
              deliveryNumber: row.deliveryNumber,
              status: row.status,
              warehouse: row.warehouse.name,
              deliveryDate: row.deliveryDate,
              recipientName: row.recipientName
            }
          };
        }
        break;
      }
      case "PURCHASE_ORDER": {
        const row = await this.prisma.purchaseOrder.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { supplier: { select: { name: true } }, _count: { select: { items: true, grnRecords: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.reference,
            permission,
            details: {
              reference: row.reference,
              supplier: row.supplier.name,
              status: row.status,
              totalAmount: decimal(row.totalAmount),
              itemCount: row._count.items,
              grnCount: row._count.grnRecords,
              orderDate: row.orderDate
            }
          };
        }
        break;
      }
      case "GOODS_RECEIVED_NOTE": {
        const row = await this.prisma.goodsReceivedNote.findFirst({
          where: { id: entityId, companyId: user.companyId, deletedAt: null },
          include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, _count: { select: { items: true } } }
        });
        if (row) {
          resolved = {
            entityType,
            entityId,
            label: row.reference,
            permission,
            branchId: row.branchId,
            warehouseId: row.warehouseId,
            details: {
              reference: row.reference,
              supplier: row.supplier.name,
              warehouse: row.warehouse.name,
              status: row.status,
              itemCount: row._count.items,
              receivedDate: row.receivedDate
            }
          };
        }
        break;
      }
    }

    if (!resolved) throw new NotFoundException("QR entity was not found.");
    this.assertLocationAccess(user, resolved);
    return resolved;
  }

  private assertLocationAccess(user: AuthenticatedUser, entity: ResolvedEntity) {
    if (user.hasGlobalAccess) return;
    if (entity.branchId && !user.branchIds.includes(entity.branchId)) throw new ForbiddenException("You cannot access this branch QR data.");
    if (entity.farmId && !user.farmIds.includes(entity.farmId)) throw new ForbiddenException("You cannot access this farm QR data.");
    if (entity.warehouseId && !user.warehouseIds.includes(entity.warehouseId)) throw new ForbiddenException("You cannot access this warehouse QR data.");
    if (entity.productionSiteId && !user.productionSiteIds.includes(entity.productionSiteId)) throw new ForbiddenException("You cannot access this production site QR data.");
  }

  private createToken(): string {
    return randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toUpperCase();
  }

  private payload(token: string): string {
    return `JOKAS:QR:${token}`;
  }

  private barcodeValue(token: string): string {
    return `JOKAS-${token}`;
  }

  private extractCode(raw: string): string {
    const value = raw.trim();
    if (!value) throw new BadRequestException("QR code value is required.");
    try {
      const url = new URL(value);
      return url.searchParams.get("code") ?? url.searchParams.get("qr") ?? value;
    } catch {
      return value;
    }
  }

  private renderLabelSvg(qr: Awaited<ReturnType<QrService["formatQr"]>>): string {
    const qrInner = qr.qrSvg
      .replace(/<\?xml.*?\?>/g, "")
      .replace(/<!DOCTYPE.*?>/g, "")
      .replace("<svg", '<svg x="24" y="82"');
    const barcodeInner = qr.barcodeSvg.replace("<svg", '<svg x="228" y="122"');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" rx="16" fill="#fff"/>
  <rect x="16" y="16" width="608" height="328" rx="12" fill="#fff" stroke="#111827" stroke-width="2"/>
  <text x="24" y="48" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">Jokas ERP Trace Label</text>
  <text x="24" y="72" font-family="Arial, sans-serif" font-size="13" fill="#6b7280">${xml(qr.entityType.replace(/_/g, " "))}</text>
  ${qrInner}
  <text x="228" y="96" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#111827">${xml(qr.label)}</text>
  <text x="228" y="118" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">Scan QR or barcode to view authorized details</text>
  ${barcodeInner}
  <text x="228" y="232" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${xml(qr.barcodeValue)}</text>
  <text x="24" y="320" font-family="Arial, sans-serif" font-size="11" fill="#6b7280">${xml(qr.payload)}</text>
</svg>`;
  }

  private renderCode39(value: string, width = 360, height = 78): string {
    const patterns: Record<string, string> = {
      "0": "101001101101",
      "1": "110100101011",
      "2": "101100101011",
      "3": "110110010101",
      "4": "101001101011",
      "5": "110100110101",
      "6": "101100110101",
      "7": "101001011011",
      "8": "110100101101",
      "9": "101100101101",
      A: "110101001011",
      B: "101101001011",
      C: "110110100101",
      D: "101011001011",
      E: "110101100101",
      F: "101101100101",
      G: "101010011011",
      H: "110101001101",
      I: "101101001101",
      J: "101011001101",
      K: "110101010011",
      L: "101101010011",
      M: "110110101001",
      N: "101011010011",
      O: "110101101001",
      P: "101101101001",
      Q: "101010110011",
      R: "110101011001",
      S: "101101011001",
      T: "101011011001",
      U: "110010101011",
      V: "100110101011",
      W: "110011010101",
      X: "100101101011",
      Y: "110010110101",
      Z: "100110110101",
      "-": "100101011011",
      ".": "110010101101",
      " ": "100110101101",
      "*": "100101101101",
      "$": "100100100101",
      "/": "100100101001",
      "+": "100101001001",
      "%": "101001001001"
    };
    const safe = `*${value.toUpperCase().replace(/[^A-Z0-9 .$/+%-]/g, "-")}*`;
    const units = safe.split("").flatMap((char) => [...(patterns[char] ?? patterns["-"]), "0"]);
    const moduleWidth = Math.max(1, Math.floor(width / units.length));
    let x = 0;
    const bars = units
      .map((bit) => {
        const w = moduleWidth;
        const rect = bit === "1" ? `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#111827"/>` : "";
        x += w;
        return rect;
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/>${bars}</svg>`;
  }
}
