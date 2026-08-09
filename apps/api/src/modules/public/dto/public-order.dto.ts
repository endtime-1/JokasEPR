import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, IsNumber, Min, Max, IsUUID, MaxLength, ArrayMinSize, ArrayMaxSize } from "class-validator";
import { Type } from "class-transformer";

export enum PublicOrderStatus {
  PENDING_STOCK_APPROVAL = "PENDING_STOCK_APPROVAL",
  APPROVED = "APPROVED",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
}

export class UpdateOrderStatusDto {
  @IsEnum(PublicOrderStatus)
  status!: PublicOrderStatus;
}

// (M10) Unauthenticated endpoint with no upper bound previously let a single line
// carry an arbitrary quantity — a bot/typo could submit e.g. 10 billion units,
// producing a nonsensical order (or an ugly Decimal-overflow 500) instead of a
// clean validation error. 10,000 comfortably covers any real bulk/wholesale order.
const MAX_LINE_QUANTITY = 10000;

export class PublicOrderLineDto {
  @IsUUID() productId!: string;
  @IsNumber() @Min(1) @Max(MAX_LINE_QUANTITY) quantity!: number;
}

export class PlacePublicOrderDto {
  @IsNotEmpty() @IsString() @MaxLength(160) customerName!: string;
  @IsNotEmpty() @IsString() @MaxLength(30) customerPhone!: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsNotEmpty() @IsString() @MaxLength(500) deliveryAddress!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PublicOrderLineDto) lines!: PublicOrderLineDto[];
}
