import { BirdType, FlockBatchStatus, PoultryCostType, PoultryHealthSeverity, PoultryRecordStatus, PoultryTransferStatus } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from "class-validator";

export class PoultryQueryDto {
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  poultryHouseId?: string;

  @IsOptional()
  @IsUUID()
  flockBatchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreatePoultryHouseDto {
  @IsUUID()
  farmId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(24)
  code!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class CreateFlockBatchDto {
  @IsUUID()
  farmId!: string;

  @IsUUID()
  poultryHouseId!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(BirdType)
  birdType!: BirdType;

  @IsInt()
  @Min(1)
  openingBirdCount!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsEnum(FlockBatchStatus)
  status?: FlockBatchStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

class FlockRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsDateString()
  recordDate!: string;

  @IsOptional()
  @IsEnum(PoultryRecordStatus)
  status?: PoultryRecordStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDailyPoultryRecordDto extends FlockRecordDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  openingBirdCount?: number;

  @IsInt()
  @Min(0)
  mortalityCount!: number;

  @IsInt()
  @Min(0)
  culledCount!: number;

  @IsNumber()
  @Min(0)
  feedConsumedKg!: number;

  @IsInt()
  @Min(0)
  totalEggs!: number;
}

export class CreateMortalityRecordDto extends FlockRecordDto {
  @IsInt()
  @Min(1)
  birdCount!: number;

  @IsOptional()
  @IsBoolean()
  isCulling?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateFeedConsumptionRecordDto extends FlockRecordDto {
  @IsOptional()
  @IsUUID()
  feedProductId?: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costAmount?: number;
}

export class CreateEggProductionRecordDto extends FlockRecordDto {
  @IsInt()
  @Min(0)
  goodEggs!: number;

  @IsInt()
  @Min(0)
  crackedEggs!: number;

  @IsInt()
  @Min(0)
  dirtyEggs!: number;

  @IsInt()
  @Min(0)
  brokenEggs!: number;

  @IsInt()
  @Min(0)
  rejectedEggs!: number;
}

export class CreateBirdWeightRecordDto extends FlockRecordDto {
  @IsInt()
  @Min(1)
  sampleSize!: number;

  @IsNumber()
  @Min(0.001)
  averageWeightKg!: number;
}

export class CreateMedicationRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsString()
  @MaxLength(120)
  medicationName!: string;

  @IsString()
  @MaxLength(120)
  dosage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  withdrawalUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateVaccinationRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsString()
  @MaxLength(120)
  vaccineName!: string;

  @IsString()
  @MaxLength(120)
  dose!: string;

  @IsDateString()
  vaccinationDate!: string;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateHealthObservationDto {
  @IsUUID()
  flockBatchId!: string;

  @IsDateString()
  observationDate!: string;

  @IsEnum(PoultryHealthSeverity)
  severity!: PoultryHealthSeverity;

  @IsString()
  observation!: string;

  @IsOptional()
  @IsDateString()
  vetVisitDate?: string;

  @ValidateIf((value: CreateHealthObservationDto) => Boolean(value.vetVisitDate))
  @IsString()
  veterinarianName?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;
}

export class CreatePoultryTransferDto {
  @IsUUID()
  flockBatchId!: string;

  @IsUUID()
  toFarmId!: string;

  @IsUUID()
  toPoultryHouseId!: string;

  @IsInt()
  @Min(1)
  birdCount!: number;

  @IsDateString()
  transferDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePoultryTransferStatusDto {
  @IsEnum(PoultryTransferStatus)
  status!: PoultryTransferStatus;
}

export class CreatePoultryCostRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsDateString()
  costDate!: string;

  @IsEnum(PoultryCostType)
  costType!: PoultryCostType;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PoultryRecordStatus)
  status?: PoultryRecordStatus;
}
