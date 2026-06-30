import { IsEmail, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, IsNumber, Min, IsUUID } from "class-validator";
import { Type } from "class-transformer";

export class PublicOrderLineDto {
  @IsUUID() productId!: string;
  @IsNumber() @Min(1) quantity!: number;
}

export class PlacePublicOrderDto {
  @IsNotEmpty() @IsString() customerName!: string;
  @IsNotEmpty() @IsString() customerPhone!: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsNotEmpty() @IsString() deliveryAddress!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PublicOrderLineDto) lines!: PublicOrderLineDto[];
}
