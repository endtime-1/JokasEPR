import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

const METHODS = ["CASH", "MOMO", "CARD"] as const;

export class UpdatePosSettingsDto {
  @IsOptional() @IsUUID() momoPaymentAccountId?: string | null;
  @IsOptional() @IsUUID() cardPaymentAccountId?: string | null;
  @IsOptional() @IsUUID() floatSourceAccountId?: string | null;
  @IsOptional() maxDiscountPercent?: string | number;
  /** null / blank = every refund needs a supervisor. */
  @IsOptional() refundApprovalAbove?: string | number | null;
  @IsOptional() @IsString() @MaxLength(300) receiptHeader?: string | null;
  @IsOptional() @IsString() @MaxLength(300) receiptFooter?: string | null;
}

export class CreateRegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  /** A cash payment account (the drawer). */
  @IsUUID() cashAccountId!: string;
}

export class UpdateRegisterDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsUUID() cashAccountId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class OpenSessionDto {
  @IsUUID() registerId!: string;
  @IsOptional() openingFloat?: string | number;
}

export class CloseSessionDto {
  /** What the cashier counted in the drawer. */
  @IsDefined() countedCash!: string | number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class PosLineDto {
  @IsOptional() @IsUUID() itemId?: string;
  /** Needed for an extra charge (no item). */
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsDefined() quantity!: string | number;
  /** Blank = the item's shelf price. A different price needs a supervisor. */
  @IsOptional() unitPrice?: string | number;
  @IsOptional() discountPercent?: string | number;
  @IsOptional() discountAmount?: string | number;
  /** An extra charge such as delivery: no item, no stock. */
  @IsOptional() @IsBoolean() isCharge?: boolean;
}

export class PosPaymentDto {
  @IsEnum(METHODS) method!: (typeof METHODS)[number];
  @IsDefined() amount!: string | number;
  /** For cash: what the customer handed over (change is the excess). */
  @IsOptional() tendered?: string | number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class CreateSaleDto {
  /** Made by the till when the sale starts: pressing Pay twice, or a retry, can never make two sales. */
  @IsString() @MinLength(8) @MaxLength(80) clientKey!: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsString() @MaxLength(160) customerName?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PosLineDto) lines!: PosLineDto[];
  @IsOptional() discountPercent?: string | number;
  @IsOptional() discountAmount?: string | number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => PosPaymentDto) payments!: PosPaymentDto[];
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
  /** A supervisor may let a sale go below zero stock. */
  @IsOptional() @IsBoolean() allowNegativeStock?: boolean;
}

/** A cart to price, without selling it. */
export class QuoteCartDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PosLineDto) lines!: PosLineDto[];
  @IsOptional() discountPercent?: string | number;
  @IsOptional() discountAmount?: string | number;
}

export class RefundLineDto {
  @IsUUID() saleLineId!: string;
  @IsDefined() quantity!: string | number;
}

export class RefundPaymentDto {
  @IsEnum(METHODS) method!: (typeof METHODS)[number];
  /** Blank is allowed when there is a single payment: it then pays the whole refund. */
  @IsOptional() amount?: string | number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class CreateRefundDto {
  @IsString() @MinLength(8) @MaxLength(80) clientKey!: string;
  @IsUUID() saleId!: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  /** Put the goods back into stock. Turn off for damaged goods. */
  @IsOptional() @IsBoolean() restock?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RefundLineDto) lines!: RefundLineDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => RefundPaymentDto) payments!: RefundPaymentDto[];
}

export class PosListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsString() @MaxLength(64) cashierId?: string;
  @IsOptional() @IsString() @MaxLength(40) search?: string;
  @IsOptional() @IsString() @MaxLength(10) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class PosReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(["day", "cashier", "item", "method"]) groupBy?: "day" | "cashier" | "item" | "method";
}
