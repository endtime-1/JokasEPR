import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: "password must include uppercase, lowercase, number, and symbol characters"
  })
  password!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  branchIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  farmIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  warehouseIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  productionSiteIds?: string[];
}

