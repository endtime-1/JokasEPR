import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  permissionIds?: string[];
}
