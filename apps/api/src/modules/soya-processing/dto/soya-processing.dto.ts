import { SoyaOutputType, SoyaProcessingBatchStatus, SoyaQualityStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class SoyaQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productionBatchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateSoyaBeanIntakeDto {
  @IsUUID()
  productionSiteId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(80)
  receiptNumber!: string;

  @IsString()
  @MaxLength(160)
  supplierName!: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @IsOptional()
  @IsEnum(SoyaQualityStatus)
  qualityStatus?: SoyaQualityStatus;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  purposeOverrideReason?: string;
}

export class CreateSoyaProcessingBatchDto {
  @IsUUID()
  productionSiteId!: string;

  @IsUUID()
  rawWarehouseId!: string;

  @IsUUID()
  oilWarehouseId!: string;

  @IsUUID()
  cakeWarehouseId!: string;

  @IsUUID()
  beanProductId!: string;

  @IsUUID()
  oilProductId!: string;

  @IsUUID()
  cakeProductId!: string;

  @IsOptional()
  @IsUUID()
  intakeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsNumber()
  @Min(0.001)
  beansUsedKg!: number;

  @IsNumber()
  @Min(0)
  oilProducedLitres!: number;

  @IsNumber()
  @Min(0)
  cakeProducedKg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wasteKg?: number;

  @IsOptional()
  @IsDateString()
  processingDate?: string;

  @IsOptional()
  @IsEnum(SoyaProcessingBatchStatus)
  status?: SoyaProcessingBatchStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packagingCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overheadCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedOilSalesValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedCakeSalesValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  purposeOverrideReason?: string;
}

export class CreateSoyaQualityCheckDto {
  @IsUUID()
  productionBatchId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oilPurityPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cakeProteinPercent?: number;

  @IsOptional()
  @IsEnum(SoyaQualityStatus)
  status?: SoyaQualityStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSoyaQualityStatusDto {
  @IsEnum(SoyaQualityStatus)
  status!: SoyaQualityStatus;
}

export class CreateSoyaInternalTransferDto {
  @IsUUID()
  productionBatchId!: string;

  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsOptional()
  @IsUUID()
  toProductionSiteId?: string;

  @IsUUID()
  productId!: string;

  @IsEnum(SoyaOutputType)
  outputType!: SoyaOutputType;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSoyaSaleDto {
  @IsUUID()
  productionBatchId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsEnum(SoyaOutputType)
  outputType!: SoyaOutputType;

  @IsString()
  @MaxLength(160)
  customerName!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

// Deliberately metadata-only. quantityKg/unitCost/totalCost are excluded:
// they already drove a posted InventoryItem increment + StockBatch +
// StockMovement at create time, and a batch may already have been costed
// off this intake's unitCost (see rawBeanCost in the service). Editing them
// here would desync those posted effects; use delete (which reverses the
// posted effect) + re-create instead if a quantity/cost correction is needed.
export class UpdateSoyaBeanIntakeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @IsOptional()
  @IsEnum(SoyaQualityStatus)
  qualityStatus?: SoyaQualityStatus;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Deliberately metadata-only — see UpdateSoyaBeanIntakeDto. beansUsedKg /
// oilProducedLitres / cakeProducedKg / wasteKg and the cost fields already
// drove posted InventoryItem/StockBatch/StockMovement effects on both the
// input and output sides; status is intentionally excluded too since it is
// driven by the quality-check approve/reject workflow (updateQualityStatus)
// and editing it out of band here could desync it from the batch's actual
// quality-check history.
export class UpdateSoyaProcessingBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  processingDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// Deliberately metadata-only — quantity/warehouse fields already drove a
// posted inventory move on both ends; see UpdateSoyaBeanIntakeDto for why.
export class UpdateSoyaInternalTransferDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

// Deliberately metadata-only — quantity/unitPrice/totalAmount already drove
// a posted inventory decrement; see UpdateSoyaBeanIntakeDto for why.
export class UpdateSoyaSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @IsOptional()
  @IsDateString()
  saleDate?: string;
}

// No inventory effect to protect (quality checks never touch stock), but
// still metadata-only for a check that has already been finalized — see the
// finalized guard in updateQualityCheck/deleteQualityCheck.
export class UpdateSoyaQualityCheckDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oilPurityPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cakeProteinPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
