import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { QBMappingType } from "@prisma/client";

export class UpsertMappingDto {
  @IsEnum(QBMappingType)
  mappingType!: QBMappingType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  erpEntityId?: string;

  @IsString()
  @MaxLength(200)
  erpEntityName!: string;

  @IsString()
  @MaxLength(100)
  qbEntityId!: string;

  @IsString()
  @MaxLength(200)
  qbEntityName!: string;
}

export class SyncEntityDto {
  @IsIn(["customers", "vendors", "items", "invoices", "payments", "bills", "expenses"])
  entity!: string;

  @IsOptional()
  @IsString()
  recordId?: string;
}

export class WebhookQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class SyncLogsQueryDto {
  @IsOptional()
  @IsString()
  operation?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
