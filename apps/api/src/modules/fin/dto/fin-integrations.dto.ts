import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class UpdateLinkDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** null / blank clears it. */
  @IsOptional() @ValidateIf((_, v) => v !== null && v !== "") @IsUUID() defaultTaxCodeId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null && v !== "") @IsUUID() defaultAccountId?: string | null;
  @IsOptional() @IsBoolean() autoCreateContacts?: boolean;
}

export class MapCustomerDto {
  @IsString() @MaxLength(64) sourceCustomerId!: string;
  @IsUUID() contactId!: string;
}

export class IncomingQueryDto {
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}
