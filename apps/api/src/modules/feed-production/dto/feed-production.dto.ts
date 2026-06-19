import {
  FeedFormulaStatus,
  FeedProductionOrderStatus,
  FeedQualityCheckStatus,
  FeedType
} from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

export class FeedProductionQueryDto {
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
  formulaId?: string;

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

export class FeedFormulaIngredientInputDto {
  @IsUUID()
  ingredientId!: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateFeedFormulaDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsUUID()
  finishedProductId!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(FeedType)
  feedType!: FeedType;

  @IsNumber()
  @Min(0.001)
  targetBatchKg!: number;

  @IsOptional()
  @IsEnum(FeedFormulaStatus)
  status?: FeedFormulaStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedFormulaIngredientInputDto)
  ingredients?: FeedFormulaIngredientInputDto[];
}

export class AddFeedFormulaIngredientDto extends FeedFormulaIngredientInputDto {}

export class CreateFeedFormulaVersionDto {
  @IsOptional()
  @IsEnum(FeedFormulaStatus)
  status?: FeedFormulaStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFeedProductionOrderDto {
  @IsUUID()
  productionSiteId!: string;

  @IsUUID()
  formulaId!: string;

  @IsNumber()
  @Min(0.001)
  plannedQuantityKg!: number;

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @IsUUID()
  rawMaterialWarehouseId?: string;

  @IsOptional()
  @IsEnum(FeedProductionOrderStatus)
  status?: FeedProductionOrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFeedProductionBatchDto {
  @IsUUID()
  productionOrderId!: string;

  @IsUUID()
  rawMaterialWarehouseId!: string;

  @IsUUID()
  finishedWarehouseId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  batchNumber?: string;

  @IsNumber()
  @Min(0.001)
  producedQuantityKg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wastageKg?: number;

  @IsOptional()
  @IsDateString()
  productionDate?: string;

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
  expectedSalesValue?: number;
}

export class CreateFeedQualityCheckDto {
  @IsUUID()
  productionBatchId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  moisturePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinPercent?: number;

  @IsOptional()
  @IsString()
  textureNotes?: string;

  @IsOptional()
  @IsEnum(FeedQualityCheckStatus)
  status?: FeedQualityCheckStatus;
}

export class UpdateFeedQualityCheckStatusDto {
  @IsEnum(FeedQualityCheckStatus)
  status!: FeedQualityCheckStatus;
}

export class CreateFeedPackagingRecordDto {
  @IsUUID()
  productionBatchId!: string;

  @IsNumber()
  @Min(0.001)
  packageSizeKg!: number;

  @IsInt()
  @Min(1)
  packageCount!: number;

  @IsOptional()
  @IsDateString()
  packagedAt?: string;
}

export class CreateFeedProductionCostDto {
  @IsUUID()
  productionBatchId!: string;

  @IsNumber()
  @Min(0)
  laborCost!: number;

  @IsNumber()
  @Min(0)
  packagingCost!: number;

  @IsNumber()
  @Min(0)
  overheadCost!: number;

  @IsNumber()
  @Min(0)
  expectedSalesValue!: number;
}

export class CreateFeedInternalTransferDto {
  @IsUUID()
  productionBatchId!: string;

  @IsUUID()
  fromWarehouseId!: string;

  @IsUUID()
  toFarmId!: string;

  @IsOptional()
  @IsUUID()
  toPoultryHouseId?: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordExternalFeedSaleDto {
  @IsUUID()
  productionBatchId!: string;

  @IsUUID()
  fromWarehouseId!: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;
}
