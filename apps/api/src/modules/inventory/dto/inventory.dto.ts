import { StockAdjustmentType, StockMovementType, StockWorkflowStatus } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

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
}
