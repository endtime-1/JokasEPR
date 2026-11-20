import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsDefined, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

const PAY_METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CARD"] as const;
const ACCOUNT_TYPES = ["CASH", "BANK", "MOBILE_MONEY", "PROVIDER"] as const;
const bool = () => Transform(({ value }) => value === true || value === "true");

// ─── payment accounts ────────────────────────────────────────────────────────

export class CreatePaymentAccountDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEnum(ACCOUNT_TYPES) type!: (typeof ACCOUNT_TYPES)[number];
  /** MTN_MOMO, TELECEL_CASH, AT_MONEY or OTHER (mobile money only). */
  @IsOptional() @IsEnum(["MTN_MOMO", "TELECEL_CASH", "AT_MONEY", "OTHER"]) provider?: "MTN_MOMO" | "TELECEL_CASH" | "AT_MONEY" | "OTHER";
  @IsOptional() @IsString() @MaxLength(100) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) accountNumber?: string | null;
  /** Use an existing asset account from the chart... */
  @IsOptional() @IsUUID() ledgerAccountId?: string;
  /** ...or let the system create one under "Cash and Bank". */
  @IsOptional() @IsBoolean() createLedgerAccount?: boolean;
  @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
  /** Ledger movements before this date count as already reconciled (the opening position). */
  @IsOptional() @IsDateString() reconcileFrom?: string | null;
}

export class UpdatePaymentAccountDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) accountNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
  @IsOptional() @IsDateString() reconcileFrom?: string | null;
}

// ─── direct payments and transfers ───────────────────────────────────────────

export class MakePaymentDto {
  @IsString() @MinLength(2) @MaxLength(160) payeeName!: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsDateString() paymentDate!: string;
  @IsDefined() amount!: string | number;
  @IsEnum(PAY_METHODS) method!: (typeof PAY_METHODS)[number];
  /** The payment account the money leaves. */
  @IsUUID() paidFromPaymentAccountId!: string;
  /** The ledger account the money is charged to (an expense, or another account). */
  @IsUUID() debitAccountId!: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateTransferDto {
  @IsDateString() transferDate!: string;
  @IsUUID() fromPaymentAccountId!: string;
  @IsUUID() toPaymentAccountId!: string;
  @IsDefined() amount!: string | number;
  /** Optional charge, taken from the source account on top of the amount. */
  @IsOptional() chargeAmount?: string | number;
  /** Ledger account for the charge. Blank = the account with the "Bank and transfer charges" role. */
  @IsOptional() @IsUUID() chargeAccountId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class BankingListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() paymentAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

// ─── online payments ─────────────────────────────────────────────────────────

export class CreateCheckoutDto {
  /** Blank = the whole balance. Customers may pay part of an invoice. */
  @IsOptional() amount?: string | number;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
}

// ─── statement import and reconciliation ─────────────────────────────────────

export class ColumnMappingDto {
  /** 0-based column numbers in the file. */
  @IsInt() @Min(0) @Max(60) date!: number;
  @IsInt() @Min(0) @Max(60) description!: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) reference?: number;
  /** One signed amount column (money in positive, out negative)... */
  @IsOptional() @IsInt() @Min(0) @Max(60) amount?: number;
  /** ...or separate money-in and money-out columns. */
  @IsOptional() @IsInt() @Min(0) @Max(60) moneyIn?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) moneyOut?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) balance?: number;
  /** day-first (31/12/2026), month-first (12/31/2026) or year-first (2026-12-31). Blank = detect. */
  @IsOptional() @IsEnum(["DMY", "MDY", "YMD"]) dateOrder?: "DMY" | "MDY" | "YMD";
  @IsOptional() @IsBoolean() hasHeader?: boolean;
}

export class ImportStatementDto {
  @IsUUID() paymentAccountId!: string;
  @IsOptional() @IsString() @MaxLength(200) fileName?: string;
  /** CSV text... */
  @IsOptional() @IsString() @MaxLength(3_000_000) csv?: string;
  /** ...or an Excel file as base64. */
  @IsOptional() @IsString() @MaxLength(4_000_000) fileBase64?: string;
  @ValidateNested() @Type(() => ColumnMappingDto) mapping!: ColumnMappingDto;
  @IsOptional() closingBalance?: string | number;
  /** Import the lines that can be read and leave out the ones that cannot (otherwise any bad line stops the import). */
  @IsOptional() @IsBoolean() skipBadRows?: boolean;
}

export class PeekStatementDto {
  @IsOptional() @IsString() @MaxLength(3_000_000) csv?: string;
  @IsOptional() @IsString() @MaxLength(4_000_000) fileBase64?: string;
}

export class MatchLineDto {
  @IsUUID() journalLineId!: string;
}

export class CreateFromLineDto {
  /** The ledger account for the other side (bank charges, interest income, a customer deposit account...). */
  @IsUUID() counterAccountId!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
}

export class ReconQueryDto {
  @IsUUID() paymentAccountId!: string;
  @IsOptional() @IsEnum(["UNMATCHED", "MATCHED", "IGNORED", "all"]) status?: "UNMATCHED" | "MATCHED" | "IGNORED" | "all";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
}

export class ReconReportQueryDto {
  @IsUUID() paymentAccountId!: string;
  @IsDateString() asOf!: string;
  @IsDefined() statementBalance!: string | number;
}

export class CloseReconDto {
  @IsUUID() paymentAccountId!: string;
  @IsDateString() statementDate!: string;
  @IsDefined() statementBalance!: string | number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ReopenReconDto {
  @IsUUID() paymentAccountId!: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  /** Reopen from this date: everything on or after it can be changed again. Blank = reopen everything. */
  @IsOptional() @IsDateString() reconciledThrough?: string | null;
}

export class IgnoreLineDto {
  @IsOptional() @bool() @IsBoolean() ignore?: boolean;
}
