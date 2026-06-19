import { BankAccountType, BatchType, ExpenseStatus, JournalEntryStatus, JournalEntryType, PaymentMethod, PayrollStatus, PettyCashType, RevenueSource } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

export class FinanceQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// ─── Account ──────────────────────────────────────────────────────────────────

export class CreateAccountDto {
  @IsString()
  @MaxLength(24)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
  type!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;
}

// ─── Expense Category ─────────────────────────────────────────────────────────

export class CreateExpenseCategoryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(24)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}

// ─── Bank Account ─────────────────────────────────────────────────────────────

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(120)
  accountName!: string;

  @IsString()
  @MaxLength(40)
  accountNumber!: string;

  @IsString()
  @MaxLength(120)
  bankName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchName?: string;

  @IsEnum(BankAccountType)
  accountType!: BankAccountType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export class CreateExpenseDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  expenseDate!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptRef?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApproveExpenseDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

export class RejectExpenseDto {
  @IsString()
  @MaxLength(240)
  reason!: string;
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

export class CreateRevenueDto {
  @IsEnum(RevenueSource)
  source!: RevenueSource;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  revenueDate!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceRef?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Supplier Payment ─────────────────────────────────────────────────────────

export class CreateSupplierPaymentDto {
  @IsString()
  @MaxLength(160)
  supplierName!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  purchaseOrderRef?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Customer Payment ─────────────────────────────────────────────────────────

export class CreateCustomerPaymentDto {
  @IsString()
  @MaxLength(160)
  customerName!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceRef?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export class CreatePayrollRecordDto {
  @IsString()
  @MaxLength(10)
  period!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  @MaxLength(160)
  employeeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  employeeCode?: string;

  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  allowances?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxDeduction?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ssnit?: number;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApprovePayrollDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}

// ─── Petty Cash ───────────────────────────────────────────────────────────────

export class CreatePettyCashTransactionDto {
  @IsEnum(PettyCashType)
  type!: PettyCashType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsDateString()
  transactionDate!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  receiptRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Journal Entry ────────────────────────────────────────────────────────────

export class JournalEntryLineDto {
  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsNumber()
  @Min(0)
  debit!: number;

  @IsNumber()
  @Min(0)
  credit!: number;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateJournalEntryDto {
  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(240)
  description!: string;

  @IsEnum(JournalEntryType)
  type!: JournalEntryType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines!: JournalEntryLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export class GenerateReportDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateBatchProfitabilityDto {
  @IsEnum(BatchType)
  batchType!: BatchType;

  @IsString()
  @MaxLength(60)
  batchId!: string;

  @IsString()
  @MaxLength(60)
  batchReference!: string;

  @IsString()
  @MaxLength(120)
  batchName!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsNumber()
  @Min(0)
  totalRevenue!: number;

  @IsNumber()
  @Min(0)
  totalCost!: number;
}
