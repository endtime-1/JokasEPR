import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export enum QCCheckType {
  RAW_MATERIAL = "RAW_MATERIAL",
  FEED_PRODUCTION = "FEED_PRODUCTION",
  SOYA_PROCESSING = "SOYA_PROCESSING",
  FINISHED_GOODS = "FINISHED_GOODS",
  POULTRY_HEALTH = "POULTRY_HEALTH",
  GOODS_RECEIVED = "GOODS_RECEIVED",
}

export enum QCStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  PASSED = "PASSED",
  FAILED = "FAILED",
  CONDITIONALLY_PASSED = "CONDITIONALLY_PASSED",
  CANCELLED = "CANCELLED",
}

export enum BatchDecision {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  QUARANTINE = "QUARANTINE",
  CONDITIONALLY_APPROVED = "CONDITIONALLY_APPROVED",
}

export enum CorrectiveActionStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
  CANCELLED = "CANCELLED",
}

export class QualityQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(QCCheckType) checkType?: QCCheckType;
  @IsOptional() @IsEnum(QCStatus) status?: QCStatus;
  @IsOptional() @IsEnum(BatchDecision) decision?: BatchDecision;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

// â”€â”€â”€ Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class CreateParameterDto {
  @IsString() paramCode!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() paramType?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() minValue?: number;
  @IsOptional() @IsNumber() maxValue?: number;
  @IsOptional() @IsString() expectedValue?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateTemplateDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsEnum(QCCheckType) checkType!: QCCheckType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateParameterDto) parameters?: CreateParameterDto[];
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// â”€â”€â”€ Inspections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class InspectionResultDto {
  @IsUUID() parameterId!: string;
  @IsOptional() @IsString() actualValue?: string;
  @IsOptional() @IsBoolean() passed?: boolean;
  @IsOptional() @IsNumber() deviation?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateQualityCheckDto {
  @IsEnum(QCCheckType) checkType!: QCCheckType;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsUUID() referenceId?: string;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsUUID() inspectorId?: string;
  @IsOptional() @IsDateString() checkedAt?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() productionSiteId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InspectionResultDto) results?: InspectionResultDto[];
}

export class SubmitResultsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => InspectionResultDto) results!: InspectionResultDto[];
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() notes?: string;
}

export class PassCheckDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() overallScore?: number;
}

export class FailCheckDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() overallScore?: number;
}

export class ConditionalPassDto {
  @IsString() conditions!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() overallScore?: number;
}

// â”€â”€â”€ Batch decisions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class ApproveBatchDto {
  @IsOptional() @IsString() approvalNotes?: string;
  @IsOptional() @IsUUID() stockBatchId?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unitOfMeasure?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class RejectBatchDto {
  @IsString() rejectionReason!: string;
  @IsOptional() @IsString() disposalMethod?: string;
  @IsOptional() @IsDateString() disposalDate?: string;
  @IsOptional() @IsString() disposalNotes?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() unitOfMeasure?: string;
  @IsOptional() @IsNumber() estimatedValue?: number;
  @IsOptional() @IsUUID() supplierId?: string;
  // H-BUG-2: lets the caller identify which physical stock lot this
  // rejection applies to, so it can actually be pulled out of the sellable/
  // usable pool (see quality.service.ts's rejectBatch) — mirrors
  // ApproveBatchDto's existing stockBatchId field.
  @IsOptional() @IsUUID() stockBatchId?: string;
}

export class QuarantineBatchDto {
  @IsString() reason!: string;
  @IsOptional() @IsString() notes?: string;
  // H-BUG-2: same purpose as RejectBatchDto.stockBatchId.
  @IsOptional() @IsUUID() stockBatchId?: string;
}

// â”€â”€â”€ Lab reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class CreateLabReportDto {
  @IsUUID() checkId!: string;
  @IsString() reportNumber!: string;
  @IsString() labName!: string;
  @IsDateString() reportDate!: string;
  @IsOptional() @IsString() fileUrl?: string;
  @IsOptional() @IsString() fileType?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() recommendations?: string;
}

// â”€â”€â”€ Corrective actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class CreateCorrectiveActionDto {
  @IsOptional() @IsUUID() checkId?: string;
  @IsOptional() @IsUUID() rejectedBatchId?: string;
  @IsString() title!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() preventiveMeasure?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateCorrectiveActionDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() preventiveMeasure?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ResolveCorrectiveActionDto {
  @IsString() resolution!: string;
  @IsOptional() @IsString() preventiveMeasure?: string;
}

export class VerifyCorrectiveActionDto {
  @IsString() verificationNotes!: string;
  @IsOptional() @IsBoolean() close?: boolean;
}

