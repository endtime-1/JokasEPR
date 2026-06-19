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
