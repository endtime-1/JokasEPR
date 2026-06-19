import { MarketTargetPeriod } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class MarketPlanningQueryDto {
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
  @IsEnum(MarketTargetPeriod)
  period?: MarketTargetPeriod;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class MarketTargetItemInputDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  formulaId?: string;

  @IsOptional()
  @IsUUID()
  formulaVersionId?: string;

  @IsNumber()
  @Min(0.0001)
  baseQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(500)
  adjustmentPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  bagSizeKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  adjustmentReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  demandEstimateNotes?: string;
}

export class CreateMarketTargetDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsEnum(MarketTargetPeriod)
  period!: MarketTargetPeriod;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketTargetItemInputDto)
  items!: MarketTargetItemInputDto[];
}

export class AdjustTargetItemDto {
  @IsNumber()
  @Min(-100)
  @Max(500)
  adjustmentPercent!: number;

  @IsString()
  @MaxLength(240)
  reason!: string;
}

export class ApproveMarketTargetDto {
  @IsUUID()
  productionSiteId!: string;

  @IsUUID()
  centralWarehouseId!: string;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CalculateMrpDto {
  @IsOptional()
  @IsUUID()
  centralWarehouseId?: string;
}

export class GenerateProcurementRecommendationsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ConvertRecommendationDto {
  @IsOptional()
  @IsDateString()
  requiredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateProductionExecutionDto {
  @IsUUID()
  productionPlanItemId!: string;

  @IsUUID()
  rawMaterialWarehouseId!: string;

  @IsUUID()
  finishedGoodsWarehouseId!: string;

  @IsNumber()
  @Min(0.0001)
  producedQuantityKg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wastageKg?: number;

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
  @IsString()
  @MaxLength(500)
  notes?: string;
}
