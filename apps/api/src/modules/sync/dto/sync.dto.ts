import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class SyncItemDto {
  @IsString()
  @IsNotEmpty()
  localId!: string;

  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsString()
  @IsIn(["POST", "PATCH", "PUT"])
  method!: string;

  @IsString()
  @IsNotEmpty()
  module!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class BatchSyncDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  records!: SyncItemDto[];
}

export class SyncRecordsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

export type SyncItemResult = {
  localId: string;
  status: "synced" | "duplicate" | "failed";
  recordId?: string;
  error?: string;
};
