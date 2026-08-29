import { BirdType, FeedReceiptSource, FlockBatchStatus, PoultryCostType, PoultryHealthSeverity, PoultryRecordStatus, PoultryTransferStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";

export enum PoultryRecordType {
  daily = "daily",
  mortality = "mortality",
  feed = "feed",
  eggs = "eggs",
  weights = "weights",
  medications = "medications",
  vaccinations = "vaccinations",
  health = "health",
  transfers = "transfers",
  costs = "costs",
}

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

  // (2026-08-18) capacity?: number with no null option meant there was no
  // valid payload that could ever clear a capacity once set — omitting the
  // field left it untouched (Prisma treats undefined as "don't update"),
  // and any real number just replaced it with another restriction. The
  // only way to actually remove a capacity was to delete the pen/house and
  // recreate it. null now explicitly means "clear the cap"; ValidateIf
  // skips the @IsInt()/@Min(1) checks only for that one value so a real
  // number is still validated normally.
  @IsOptional()
  @ValidateIf((o) => o.capacity !== null)
  @IsInt()
  @Min(1)
  capacity?: number | null;
}

export class UpdatePenDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  // See UpdatePoultryHouseDto.capacity — same fix, same reasoning.
  @IsOptional()
  @ValidateIf((o) => o.capacity !== null)
  @IsInt()
  @Min(1)
  capacity?: number | null;
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

  @IsOptional()
  @IsInt()
  @Min(0)
  mortalityCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  culledCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feedConsumedKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalEggs?: number;

  // H-BUG-2 (2026-08-12): feedConsumedKg/totalEggs can't move real stock
  // without knowing which product and warehouse. Optional, matching
  // createFeed/createEggs's own optional product+warehouse fields — the
  // count is still recorded either way; giving these just also triggers the
  // real stock movement, same as the dedicated Feed/Egg screens' own
  // "deduct from stock (optional)" section.
  @IsOptional()
  @IsUUID()
  feedProductId?: string;

  @IsOptional()
  @IsUUID()
  feedWarehouseId?: string;

  @IsOptional()
  @IsUUID()
  eggProductId?: string;

  @IsOptional()
  @IsUUID()
  eggWarehouseId?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // M-BUG (2026-08-13): only goodEggs could ever become sellable stock —
  // cracked/dirty eggs (commonly sold at a discount as "seconds" on real
  // farms) had no way to be sold through the system at all. Mirrors the
  // goodEggs convention: optional, credited to its own product (a "Grade B
  // / Seconds" SKU) in the same warehouse if given.
  @IsOptional()
  @IsUUID()
  secondsProductId?: string;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class CreateBirdWeightRecordDto extends FlockRecordDto {
  @IsInt()
  @Min(1)
  sampleSize!: number;

  @IsNumber()
  @Min(0.001)
  averageWeightKg!: number;

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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

  // Mobile parity audit (2026-08-17): closes the idempotency gap for mobile
  // offline-queue resends — see sales.dto.ts's CreateSalesOrderDto for the
  // original pattern this mirrors.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
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
  // Daily's mortalityCount/culledCount/feedConsumedKg/totalEggs are
  // deliberately absent — see the CORRECTABLE comment in
  // PoultryService.updateRecord for why those aren't correctable here.
  @IsOptional() @IsInt() @Min(0) openingBirdCount?: number;
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

// ─── Poultry Supervisor: feed received into a farm's feed store ──────────────

export class CreateFeedReceiptDto {
  @IsUUID()
  farmId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  feedProductId!: string;

  @IsDateString()
  receiptDate!: string;

  @IsNumber()
  @Min(0.001)
  quantityKg!: number;

  @IsOptional()
  @IsEnum(FeedReceiptSource)
  sourceType?: FeedReceiptSource;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  supplierName?: string;

  // Set when the feed came from the feed mill (links the receipt to the transfer).
  @IsOptional()
  @IsUUID()
  feedInternalTransferId?: string;

  // Waybill / delivery-note / invoice number for the delivery.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billReference?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @IsOptional()
  @IsEnum(PoultryRecordStatus)
  status?: PoultryRecordStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

// Quantity/warehouse/product are NOT editable — they drove a posted inventory
// credit that a hand-edit would desync. Delete + re-create to fix those.
export class UpdateFeedReceiptDto {
  @IsOptional() @IsDateString() receiptDate?: string;
  @IsOptional() @IsEnum(FeedReceiptSource) sourceType?: FeedReceiptSource;
  @IsOptional() @IsString() @MaxLength(191) supplierName?: string;
  @IsOptional() @IsUUID() feedInternalTransferId?: string;
  @IsOptional() @IsString() @MaxLength(100) billReference?: string;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsNumber() @Min(0) totalCost?: number;
  @IsOptional() @IsString() notes?: string;
}

export class FeedStockQueryDto {
  @IsOptional() @IsUUID() farmId?: string;
  @IsOptional() @IsUUID() feedProductId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
