import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

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
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;
}

export class ScopeTreeQueryDto {
  @IsIn(["poultry", "feed", "soya", "inventory", "sales", "procurement", "hr", "maintenance"])
  module!: "poultry" | "feed" | "soya" | "inventory" | "sales" | "procurement" | "hr" | "maintenance";
}

export class DocumentReportQueryDto {
  @IsIn(["poultry", "feed", "soya", "inventory", "sales", "procurement", "hr", "maintenance"])
  module!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scopeType?: string;
}

export class DocumentReportRunDto {
  // Which node in the scope tree the report is being run for.
  @IsString()
  @MaxLength(40)
  scopeType!: string;

  @IsUUID()
  scopeId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ReportExportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(["pdf", "xls", "csv", "html"])
  format?: "pdf" | "xls" | "csv" | "html";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timezone?: string;
}
