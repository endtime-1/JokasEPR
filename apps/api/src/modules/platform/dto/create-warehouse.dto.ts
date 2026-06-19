import { WarehouseType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateWarehouseDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(24)
  code!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsEnum(WarehouseType)
  type?: WarehouseType;
}

