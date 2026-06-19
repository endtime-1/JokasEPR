import { AssetStatus, BreakdownSeverity, BreakdownStatus, DowntimeStatus, EquipmentType, MachineType, MaintenanceCostType, MaintenancePriority, MaintenanceType, MaintenanceWorkflowStatus, TechnicianAssignmentStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from "class-validator";

export class MaintenanceQueryDto {
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
  machineId?: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateMachineDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(MachineType)
  machineType!: MachineType;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  capacity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}

export class CreateEquipmentDto {
  @IsUUID()
  branchId!: string;

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
  machineId?: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(EquipmentType)
  equipmentType!: EquipmentType;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}

export class CreateMaintenanceScheduleDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productionSiteId?: string;

  @ValidateIf((dto) => !dto.equipmentId)
  @IsUUID()
  machineId?: string;

  @ValidateIf((dto) => !dto.machineId)
  @IsUUID()
  equipmentId?: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsEnum(MaintenanceType)
  maintenanceType!: MaintenanceType;

  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @IsInt()
  @Min(1)
  frequencyDays!: number;

  @IsDateString()
  nextDueDate!: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreateMaintenanceRecordDto {
  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  @ValidateIf((dto) => !dto.equipmentId)
  @IsUUID()
  machineId?: string;

  @ValidateIf((dto) => !dto.machineId)
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsDateString()
  maintenanceDate?: string;

  @IsEnum(MaintenanceType)
  maintenanceType!: MaintenanceType;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;
}

export class CreateBreakdownDto {
  @ValidateIf((dto) => !dto.equipmentId)
  @IsUUID()
  machineId?: string;

  @ValidateIf((dto) => !dto.machineId)
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsDateString()
  reportedAt?: string;

  @IsOptional()
  @IsEnum(BreakdownSeverity)
  severity?: BreakdownSeverity;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  rootCause?: string;
}

export class UpdateBreakdownStatusDto {
  @IsEnum(BreakdownStatus)
  status!: BreakdownStatus;

  @IsOptional()
  @IsString()
  resolution?: string;
}

export class CreateSparePartUsageDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  machineId?: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceRecordId?: string;

  @IsOptional()
  @IsUUID()
  breakdownRecordId?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTechnicianAssignmentDto {
  @IsUUID()
  technicianId!: string;

  @IsOptional()
  @IsUUID()
  machineId?: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceRecordId?: string;

  @IsOptional()
  @IsUUID()
  breakdownRecordId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TechnicianAssignmentStatus)
  status?: TechnicianAssignmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDowntimeDto {
  @ValidateIf((dto) => !dto.equipmentId)
  @IsUUID()
  machineId?: string;

  @ValidateIf((dto) => !dto.machineId)
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  breakdownRecordId?: string;

  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsString()
  @MaxLength(240)
  reason!: string;

  @IsOptional()
  @IsEnum(DowntimeStatus)
  status?: DowntimeStatus;
}

export class CreateMaintenanceCostDto {
  @IsOptional()
  @IsUUID()
  machineId?: string;

  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  maintenanceRecordId?: string;

  @IsOptional()
  @IsUUID()
  breakdownRecordId?: string;

  @IsOptional()
  @IsDateString()
  costDate?: string;

  @IsEnum(MaintenanceCostType)
  costType!: MaintenanceCostType;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MaintenanceWorkflowStatus)
  status?: MaintenanceWorkflowStatus;
}

