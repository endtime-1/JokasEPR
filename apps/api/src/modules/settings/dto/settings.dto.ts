import { FarmType, ProductionSiteType, ProductStatus, ProductType, WarehouseType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class UpdateCompanyProfileDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  logoUrl?: string;
}

export class CreateBranchSettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsBoolean() isHeadOffice?: boolean;
}

export class CreateFarmSettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsEnum(FarmType) type?: FarmType;
}

export class CreateWarehouseSettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
  @IsOptional() @IsEnum(WarehouseType) type?: WarehouseType;
}

export class CreateProductionSiteSettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsUUID() branchId!: string;
  @IsEnum(ProductionSiteType) type!: ProductionSiteType;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
}

export class CreateDepartmentSettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateUnitOfMeasureSettingDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(16) code!: string;
  @IsString() @MaxLength(16) symbol!: string;
}

export class CreateProductCategorySettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
}

export class CreateExpenseCategorySettingDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsUUID() accountId?: string;
}

export class TaxSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxIdLabel?: string;
}

export class NumberingRuleDto {
  @IsString() @MaxLength(16) prefix!: string;
  @IsOptional() @IsBoolean() includeYear?: boolean;
  @IsOptional() @IsInt() @Min(3) @Max(10) padding?: number;
  @IsOptional() @IsInt() @Min(1) nextNumber?: number;
}

export class NumberingSettingsDto {
  @ValidateNested() @Type(() => NumberingRuleDto) invoice!: NumberingRuleDto;
  @ValidateNested() @Type(() => NumberingRuleDto) productionBatch!: NumberingRuleDto;
  @ValidateNested() @Type(() => NumberingRuleDto) stockMovement!: NumberingRuleDto;
}

export class AiSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(120) defaultModel!: string;
  @IsArray() @IsString({ each: true }) allowedModels!: string[];
  @IsOptional() @IsNumber() @Min(0) monthlyBudgetLimit?: number;
  @IsOptional() @IsBoolean() allowOperationalRecommendations?: boolean;
}

export class BackupSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(30) frequency!: string;
  @IsOptional() @IsString() @MaxLength(20) retentionDays?: string;
  @IsOptional() @IsString() @MaxLength(120) storageTarget?: string;
}

export class UserAccessSettingsDto {
  @IsBoolean() enforceBranchScope!: boolean;
  @IsBoolean() enforceFarmScope!: boolean;
  @IsBoolean() enforceWarehouseScope!: boolean;
  @IsBoolean() enforceProductionSiteScope!: boolean;
  @IsBoolean() requireMfaForAdmins!: boolean;
}

export class DomainListSettingsDto {
  @IsArray()
  @IsString({ each: true })
  values!: string[];
}

export class UpdateSettingGroupDto {
  @IsObject()
  value!: Record<string, unknown>;
}

export class CreateProductDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(48) sku!: string;
  @IsEnum(ProductType) type!: ProductType;
  @IsUUID() uomId!: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(48) sku?: string;
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @IsUUID() uomId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
}

export class ProductListQueryDto {
  @IsOptional() @IsEnum(ProductType) type?: ProductType;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
}
