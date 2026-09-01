import { InventoryItemStatus, RecordStatus, StockAdjustmentType, StockMovementType, StockReservationStatus, StockWorkflowStatus, TransferDiscrepancyResolution } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class InventoryQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateInventoryItemDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsNumber()
  @Min(0)
  reorderLevel!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingQuantity?: number;
}

// Only the fields it makes sense to correct after creation — never
// quantityOnHand, which must only ever change through the existing
// stock-adjustment/consumption/transfer flows (see InventoryService.updateItem).
export class UpdateInventoryItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsEnum(InventoryItemStatus)
  status?: InventoryItemStatus;
}

export class StockInDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(80)
  batchNumber!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockOutDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockTransferDto {
  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  stockBatchId?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Global-access users only: collapses request → approve → receive into one
  // instant transfer (the pre-staged behaviour). Written to the audit log as
  // self-approved.
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}

export class ApproveTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectTransferDto {
  @IsString()
  @MaxLength(500)
  rejectionReason!: string;
}

export class ReceiveTransferDto {
  @IsNumber()
  @Min(0)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ResolveDiscrepancyDto {
  @IsEnum(TransferDiscrepancyResolution)
  resolution!: TransferDiscrepancyResolution;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class TransferQueryDto {
  @IsOptional()
  @IsEnum(StockWorkflowStatus)
  status?: StockWorkflowStatus;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // "incoming" = this warehouse/user is the destination; "outgoing" = source.
  @IsOptional()
  @IsIn(["incoming", "outgoing"])
  direction?: "incoming" | "outgoing";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  take?: number;
}

export class MergeWarehouseDto {
  @IsUUID()
  targetWarehouseId!: string;

  // Required acknowledgement — the source warehouse is retired by this action.
  @IsString()
  @MaxLength(240)
  reason!: string;
}

export class StockAdjustmentDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsEnum(StockAdjustmentType)
  adjustmentType!: StockAdjustmentType;

  @IsNumber()
  quantity!: number;

  @IsString()
  @MaxLength(240)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  approveNow?: boolean;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class StockReservationDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class ReleaseReservationDto {
  @IsOptional()
  @IsIn(["FULFILLED", "CANCELLED"] satisfies StockReservationStatus[])
  status?: "FULFILLED" | "CANCELLED";
}

export class CreateWarehouseLocationDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;
}

export class UpdateWarehouseLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class SetReorderLevelDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @Min(0)
  minimumQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderQuantity?: number;
}

export class ApproveStockDto {
  @IsEnum(StockWorkflowStatus)
  status!: StockWorkflowStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RefreshAlertsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expiryDays?: number;
}

export class MobileStockMovementDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsEnum(StockMovementType)
  movementType!: StockMovementType;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends. Only honored on the "in" movement path — see
  // InventoryService.createStockMovement for why the FIFO "out" path
  // deliberately ignores this field.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
