import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

const blank = ({ value }: { value: unknown }) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export class LedgerWeekQueryDto {
  // Any date inside the week; the ledger snaps it to that week's Monday. Defaults to this week.
  @IsOptional() @IsDateString() weekStart?: string;
}

export class LedgerPriceHintQueryDto {
  @IsUUID() customerId!: string;
  @IsUUID() productId!: string;
}

export class LedgerScorecardQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(12) weeks?: number;
}

export class MarketingPlanLineDto {
  @IsUUID() customerId!: string;
  @IsUUID() productId!: string;
  // In the product's own sales unit (bags for feed) — the same unit a sales order line uses.
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(10_000_000) plannedQuantity!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100_000_000) plannedUnitPrice!: number;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CreateMarketingPlanDto {
  // The Monday of the plan's week.
  @IsDateString() weekStart!: string;
  // A manager can plan on behalf of a marketer; a marketer can only plan for themselves.
  @IsOptional() @IsUUID() marketerId?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MarketingPlanLineDto) lines!: MarketingPlanLineDto[];
}

// Replaces the plan's notes and lines wholesale; only a DRAFT can be edited.
export class UpdateMarketingPlanDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MarketingPlanLineDto) lines!: MarketingPlanLineDto[];
}

export class MarketingPlanReasonDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class MarketingPlanLineReasonDto {
  @IsUUID() lineId!: string;
  @IsString() @MaxLength(300) reason!: string;
}

export class CloseMarketingPlanDto {
  @Transform(blank) @IsOptional() @IsString() @MaxLength(1000) closingNote?: string;
  // The marketer's explanation for each line that fell short of plan.
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MarketingPlanLineReasonDto) reasons?: MarketingPlanLineReasonDto[];
}

export class SignOffMarketingPlanDto {
  @Transform(blank) @IsOptional() @IsString() @MaxLength(500) note?: string;
}
