import { IsArray, IsOptional, IsUUID } from "class-validator";

export class AssignUserAccessDto {
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
