import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { Transform } from "class-transformer";

export class AlertQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number;
}

export class ForecastQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
