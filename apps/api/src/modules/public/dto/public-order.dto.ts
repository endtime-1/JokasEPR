import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, IsNumber, Min, IsUUID, MaxLength } from "class-validator";
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

export class PublicOrderLineDto {
  @IsUUID() productId!: string;
  @IsNumber() @Min(1) quantity!: number;
}

export class PlacePublicOrderDto {
  @IsNotEmpty() @IsString() @MaxLength(160) customerName!: string;
  @IsNotEmpty() @IsString() @MaxLength(30) customerPhone!: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsNotEmpty() @IsString() @MaxLength(500) deliveryAddress!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PublicOrderLineDto) lines!: PublicOrderLineDto[];
}
