import { QrEntityType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class QrEntityParamsDto {
  @IsEnum(QrEntityType)
  entityType!: QrEntityType;

  @IsUUID()
  entityId!: string;
}

export class ScanQrDto {
  @IsString()
  code!: string;
}

export class QrStockMovementDto {
  @IsString()
  code!: string;

  @IsIn(["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "TRANSFER", "WASTE"])
  movementType!: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "TRANSFER" | "WASTE";

  @IsNumber()
  @Type(() => Number)
  @Min(0.0001)
  @Max(100000000)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  toWarehouseId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
