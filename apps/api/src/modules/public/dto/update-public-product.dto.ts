import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdatePublicProductDto {
  @IsOptional() @IsBoolean()       isPublic?: boolean;
  @IsOptional() @IsString() @MaxLength(200)  publicSlug?: string;
  @IsOptional() @IsString() @MaxLength(2000) publicDescription?: string;
  @IsOptional() @IsString() @MaxLength(100)  storefrontCategory?: string;
  @IsOptional() @IsNumber()  @Min(0)         minOrderQty?: number;
  @IsOptional() @IsString() @MaxLength(50)   unitLabel?: string;
  @IsOptional() @IsNumber()  @Min(0)         unitPrice?: number;
}
