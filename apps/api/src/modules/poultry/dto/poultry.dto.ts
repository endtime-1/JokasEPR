import { BirdType, FlockBatchStatus, PoultryCostType, PoultryHealthSeverity, PoultryRecordStatus, PoultryTransferStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";

export class PoultryQueryDto {
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  poultryHouseId?: string;

  @IsOptional()
  @IsUUID()
  penId?: string;

  @IsOptional()
  @IsUUID()
  flockBatchId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number;
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

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultPenCount?: number;
}

export class AddPenDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

class PenAllocationDto {
  @IsUUID()
  penId!: string;

  @IsInt()
  @Min(1)
  birdCount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePoultryHouseDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class UpdatePenDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

export class UpdateFlockBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(BirdType)
  birdType?: BirdType;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFlockBatchDto {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PenAllocationDto)
  penAllocations!: PenAllocationDto[];
}

class FlockRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsOptional()
  @IsUUID()
  penId?: string;

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

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
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

  @IsOptional()
  @IsUUID()
  eggProductId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
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

  @IsOptional()
  @IsUUID()
  penId?: string;

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

  @IsOptional()
  @IsUUID()
  medicineProductId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityUsed?: number;
}

export class CreateVaccinationRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsOptional()
  @IsUUID()
  penId?: string;

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

  @IsOptional()
  @IsUUID()
  vaccineProductId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityUsed?: number;
}

export class CreateHealthObservationDto {
  @IsUUID()
  flockBatchId!: string;

  @IsOptional()
  @IsUUID()
  penId?: string;

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

  @IsOptional()
  @IsUUID()
  fromPoultryHouseId?: string;

  @IsOptional()
  @IsUUID()
  fromPenId?: string;

  @IsUUID()
  toFarmId!: string;

  @IsUUID()
  toPoultryHouseId!: string;

  @IsOptional()
  @IsUUID()
  toPenId?: string;

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

export class AllocateTransferPenDto {
  @IsUUID()
  penId!: string;
}

export class CreatePoultryCostRecordDto {
  @IsUUID()
  flockBatchId!: string;

  @IsOptional()
  @IsUUID()
  penId?: string;

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

export class UpdateBatchStatusDto {
  @IsEnum(FlockBatchStatus)
  status!: FlockBatchStatus;

  @IsOptional()
  @IsDateString()
  actualCloseDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePoultryRecordDto {
  @IsOptional() @IsInt() @Min(0) mortalityCount?: number;
  @IsOptional() @IsInt() @Min(0) culledCount?: number;
  @IsOptional() @IsNumber() @Min(0) feedConsumedKg?: number;
  @IsOptional() @IsInt() @Min(0) totalEggs?: number;
  @IsOptional() @IsInt() @Min(1) birdCount?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsNumber() @Min(0.001) quantityKg?: number;
  @IsOptional() @IsNumber() @Min(0) costAmount?: number;
  @IsOptional() @IsInt() @Min(0) goodEggs?: number;
  @IsOptional() @IsInt() @Min(0) crackedEggs?: number;
  @IsOptional() @IsInt() @Min(0) dirtyEggs?: number;
  @IsOptional() @IsInt() @Min(0) brokenEggs?: number;
  @IsOptional() @IsInt() @Min(0) rejectedEggs?: number;
  @IsOptional() @IsInt() @Min(1) sampleSize?: number;
  @IsOptional() @IsNumber() @Min(0.001) averageWeightKg?: number;
  @IsOptional() @IsString() notes?: string;
}
