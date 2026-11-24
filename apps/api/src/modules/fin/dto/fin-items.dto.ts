import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsDefined, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

const bool = (v: unknown) => v === true || v === "true";

export class OpeningStockDto {
  /** Up to 3 decimals. */
  @IsDefined() quantity!: string | number;
  /** Cost per unit, up to 4 decimals. */
  @IsDefined() unitCost!: string | number;
  @IsOptional() @IsDateString() date?: string;
}

export class CreateItemDto {
  @IsString() @Matches(/^[A-Za-z0-9._\-/ ]{1,60}$/, { message: "sku: letters, digits, space and . _ - / only" }) sku!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(80) barcode?: string | null;
  @IsOptional() @IsEnum(["GOODS", "SERVICE"]) kind?: "GOODS" | "SERVICE";
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string | null;
  @IsOptional() sellPrice?: string | number;
  @IsOptional() @IsBoolean() priceIncludesTax?: boolean;
  @IsOptional() @IsUUID() taxCodeId?: string | null;
  @IsOptional() @IsUUID() incomeAccountId?: string | null;
  @IsOptional() @IsUUID() cogsAccountId?: string | null;
  @IsOptional() @IsUUID() inventoryAccountId?: string | null;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() reorderLevel?: string | number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
  @IsOptional() @ValidateNested() @Type(() => OpeningStockDto) openingStock?: OpeningStockDto;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(80) barcode?: string | null;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string | null;
  @IsOptional() sellPrice?: string | number;
  @IsOptional() @IsBoolean() priceIncludesTax?: boolean;
  @IsOptional() @IsUUID() taxCodeId?: string | null;
  @IsOptional() @IsUUID() incomeAccountId?: string | null;
  @IsOptional() @IsUUID() cogsAccountId?: string | null;
  @IsOptional() @IsUUID() inventoryAccountId?: string | null;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() reorderLevel?: string | number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
}

export class AdjustStockDto {
  @IsUUID() itemId!: string;
  @IsDateString() date!: string;
  /** Plus puts stock in, minus takes it out. Give this OR newQuantity. */
  @IsOptional() quantityChange?: string | number;
  /** What a stock count found; the movement is the difference. */
  @IsOptional() newQuantity?: string | number;
  /** Needed when stock goes up from zero; otherwise the current average cost is used. */
  @IsOptional() unitCost?: string | number;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ItemListQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() lowStock?: boolean;
  @IsOptional() @IsString() activeOnly?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class MovementQueryDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(20) type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class ValuationQueryDto {
  @IsOptional() @IsDateString() asOf?: string;
  @IsOptional() @IsString() includeZero?: string;
}

export class ImportItemsDto {
  @IsString() @MaxLength(3_000_000) csv!: string;
  /** The date opening stock is booked on. Blank = today. */
  @IsOptional() @IsDateString() openingDate?: string;
  @IsOptional() @IsBoolean() skipBadRows?: boolean;
}

export { bool };
