import { FinJournalStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

// ─── Settings ────────────────────────────────────────────────────────────────

export class UpdateFinSettingsDto {
  @IsOptional() @IsString() @MaxLength(160) businessName?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) tin?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @MaxLength(80) region?: string | null;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string | null;
  /** data:image/png|jpeg|webp;base64,... (max ~700 KB), or null to remove the logo. */
  @IsOptional() @IsString() @MaxLength(1_000_000) logoDataUrl?: string | null;
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: "currency must be a 3-letter code such as GHS" }) currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) fiscalYearStartMonth?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) fiscalYearStartDay?: number;
}

export class UpdateNumberSequenceDto {
  @IsOptional() @Matches(/^[A-Z0-9-]{1,12}$/, { message: "prefix: 1-12 capital letters, digits or dashes" }) prefix?: string;
  @IsOptional() @IsInt() @Min(3) @Max(8) padding?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999_999_999) nextNumber?: number;
  @IsOptional() @IsBoolean() includeYear?: boolean;
  @IsOptional() @IsBoolean() resetYearly?: boolean;
}

export class AuditQueryDto {
  @IsOptional() @IsString() @MaxLength(40) area?: string;
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() @MaxLength(60) entityId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

// ─── Chart of accounts ───────────────────────────────────────────────────────

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

export class CreateFinAccountDto {
  @IsString() @MinLength(1) @MaxLength(24) @Matches(/^[A-Za-z0-9._-]+$/, { message: "code may only contain letters, digits, dot, dash, underscore" }) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEnum(ACCOUNT_TYPES) type!: (typeof ACCOUNT_TYPES)[number];
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsBoolean() isPostable?: boolean;
  @IsOptional() @IsString() @MaxLength(40) systemRole?: string | null;
  @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
}

export class UpdateFinAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(24) @Matches(/^[A-Za-z0-9._-]+$/) code?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(ACCOUNT_TYPES) type?: (typeof ACCOUNT_TYPES)[number];
  @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsBoolean() isPostable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(40) systemRole?: string | null;
  @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
}

// ─── Journals ────────────────────────────────────────────────────────────────

export class JournalLineDto {
  @IsUUID() accountId!: string;
  /** Amounts are decimal strings or numbers with at most 2 decimals. Exactly one of debit/credit per line. */
  @IsOptional() debit?: string | number;
  @IsOptional() credit?: string | number;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
}

export class CreateJournalDto {
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(3) @MaxLength(240) description!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}

export class UpdateJournalDto {
  @IsOptional() @IsDateString() entryDate?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(240) description?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines?: JournalLineDto[];
}

export class ReverseJournalDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class JournalQueryDto {
  @IsOptional() @IsEnum(["DRAFT", "POSTED", "REVERSED"]) status?: FinJournalStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

// ─── Periods and reports ─────────────────────────────────────────────────────

export class SetPeriodLockDto {
  /** Books are closed through this date (inclusive). null reopens everything. */
  @IsOptional() @IsDateString() lockedThrough?: string | null;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class TrialBalanceQueryDto {
  /** Balances as at this date (inclusive). Required unless from/to are given. */
  @IsOptional() @IsDateString() asOf?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() includeZero?: boolean;
}

export class AccountLedgerQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export class CreateContactDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9._-]{1,30}$/, { message: "code: letters, digits, dot, dash, underscore" }) code?: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsBoolean() isCustomer?: boolean;
  @IsOptional() @IsBoolean() isSupplier?: boolean;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) tin?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @MaxLength(80) region?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  /** Decimal string or number with at most 2 decimals; null clears it. */
  @IsOptional() creditLimit?: string | number | null;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
  /** Set true after the user has seen the "looks like a duplicate" warning. */
  @IsOptional() @IsBoolean() confirmDuplicate?: boolean;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsBoolean() isCustomer?: boolean;
  @IsOptional() @IsBoolean() isSupplier?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string | null;
  @IsOptional() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) tin?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine1?: string | null;
  @IsOptional() @IsString() @MaxLength(160) addressLine2?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @MaxLength(80) region?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() creditLimit?: string | number | null;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(100) externalRef?: string | null;
  @IsOptional() @IsBoolean() confirmDuplicate?: boolean;
}

export class ContactQueryDto {
  @IsOptional() @IsEnum(["customer", "supplier", "all"]) type?: "customer" | "supplier" | "all";
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() activeOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class ImportCsvDto {
  /** The whole CSV file as text. */
  @IsString() @MinLength(1) @MaxLength(2_000_000) csv!: string;
  @IsOptional() @IsString() @MaxLength(200) fileName?: string;
}

// ─── Tax ─────────────────────────────────────────────────────────────────────

export class CreateTaxCodeDto {
  @IsString() @Matches(/^[A-Z0-9_-]{1,20}$/, { message: "code: capital letters, digits, dash, underscore (max 20)" }) code!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsOptional() @IsEnum(["SALES", "PURCHASES", "BOTH"]) appliesTo?: "SALES" | "PURCHASES" | "BOTH";
  @IsOptional() @IsBoolean() isRecoverable?: boolean;
  @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  /** The first rate, in percent (e.g. "15" or "2.5"), and the date it applies from. */
  @IsOptional() ratePercent?: string | number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class UpdateTaxCodeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AddTaxRateDto {
  @IsDefined() ratePercent!: string | number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
