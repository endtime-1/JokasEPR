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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

const PAY_METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CARD"] as const;
export type PayMethodDto = (typeof PAY_METHODS)[number];

const bool = () => Transform(({ value }) => value === true || value === "true");

/** One line on a quote, invoice or recurring template. Amounts are decimal strings or numbers. */
export class SalesLineDto {
  @IsString() @MinLength(1) @MaxLength(300) description!: string;
  @IsDefined() quantity!: string | number;
  @IsDefined() unitPrice!: string | number;
  @IsOptional() discountPercent?: string | number | null;
  @IsOptional() @IsUUID() taxCodeId?: string | null;
  /** Income account for this line. Blank = the account that has the "Sales revenue" role. */
  @IsOptional() @IsUUID() accountId?: string | null;
  /** An extra charge such as delivery or service (it is taxed and posted like any other line). */
  @IsOptional() @IsBoolean() isCharge?: boolean;
  /** Reserved for the items step; stored, not yet linked. */
  @IsOptional() @IsUUID() itemId?: string | null;
}

class DocBase {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) terms?: string | null;
}

export class CreateInvoiceDto extends DocBase {
  @IsUUID() contactId!: string;
  @IsDateString() issueDate!: string;
  /** Blank = issue date plus the customer's payment terms. */
  @IsOptional() @IsDateString() dueDate?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines!: SalesLineDto[];
}

export class UpdateInvoiceDto extends DocBase {
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines?: SalesLineDto[];
}

export class CreateQuoteDto extends DocBase {
  @IsUUID() contactId!: string;
  @IsDateString() issueDate!: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines!: SalesLineDto[];
}

export class UpdateQuoteDto extends DocBase {
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines?: SalesLineDto[];
}

export class VoidDto {
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ReceiptAllocationDto {
  @IsUUID() invoiceId!: string;
  @IsDefined() amount!: string | number;
}

export class RecordReceiptDto {
  @IsUUID() contactId!: string;
  @IsDateString() receiptDate!: string;
  @IsEnum(PAY_METHODS) method!: PayMethodDto;
  /** The ledger account the money went into. Give this or paymentAccountId. */
  @IsOptional() @IsUUID() paidToAccountId?: string;
  /** A payment account (cash, bank, mobile money); its linked ledger account is used. */
  @IsOptional() @IsUUID() paymentAccountId?: string;
  /**
   * Total money received. Blank = the sum of the allocations. If it is MORE than the allocations (an overpayment, or no
   * invoices chosen at all), the extra is kept as customer credit that can pay later invoices.
   */
  @IsOptional() amount?: string | number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ReceiptAllocationDto) allocations?: ReceiptAllocationDto[];
}

export class RecordDepositDto {
  @IsUUID() contactId!: string;
  @IsDateString() depositDate!: string;
  @IsDefined() amount!: string | number;
  @IsEnum(PAY_METHODS) method!: PayMethodDto;
  @IsOptional() @IsUUID() paidToAccountId?: string;
  @IsOptional() @IsUUID() paymentAccountId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ApplyDepositDto {
  @IsUUID() invoiceId!: string;
  @IsDefined() amount!: string | number;
  @IsOptional() @IsDateString() date?: string;
}

export class CreditLineDto {
  @IsUUID() invoiceLineId!: string;
  @IsDefined() quantity!: string | number;
}

export class CreateCreditNoteDto {
  @IsUUID() invoiceId!: string;
  @IsDateString() creditDate!: string;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CreditLineDto) lines!: CreditLineDto[];
}

export class RecurringDto extends DocBase {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsUUID() contactId!: string;
  @IsEnum(["WEEKLY", "MONTHLY"]) frequency!: "WEEKLY" | "MONTHLY";
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(365) termsDays?: number;
  @IsOptional() @IsBoolean() autoSend?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SalesLineDto) lines!: SalesLineDto[];
}

export class RecurringStateDto {
  @IsBoolean() active!: boolean;
}

export class SendEmailDto {
  /** Blank = the customer's email address. */
  @IsOptional() @IsEmail() to?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

// ─── queries ─────────────────────────────────────────────────────────────────

export class InvoiceQueryDto {
  /** draft | open | partial | paid | overdue | void | all */
  @IsOptional() @IsEnum(["draft", "open", "partial", "paid", "overdue", "void", "all"]) status?: "draft" | "open" | "partial" | "paid" | "overdue" | "void" | "all";
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class QuoteQueryDto {
  @IsOptional() @IsEnum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "all"]) status?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class DocListQueryDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @bool() @IsBoolean() openOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number;
}

export class StatementQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}
