import { BusinessUnit } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";

export class DashboardQueryDto {
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
  @IsEnum(BusinessUnit)
  businessUnit?: BusinessUnit;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // The calendar day the "today"-labeled cards (eggs/mortality/feed
  // consumed) snapshot — independent of startDate/endDate, which only
  // drive the trend charts and the other rollup KPIs. Defaults to today.
  @IsOptional()
  @IsDateString()
  day?: string;
}
