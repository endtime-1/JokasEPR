import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  ApproveExpenseDto,
  ApprovePayrollDto,
  CreateAccountDto,
  CreateBankAccountDto,
  CreateBatchProfitabilityDto,
  CreateCustomerPaymentDto,
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreateJournalEntryDto,
  CreatePayrollRecordDto,
  CreatePettyCashTransactionDto,
  CreateRevenueDto,
  CreateSupplierPaymentDto,
  FinanceQueryDto,
  GenerateReportDto,
  RejectExpenseDto
} from "./dto/finance.dto";
import { FinanceService } from "./finance.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("finance")
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Dashboard & Options ───────────────────────────────────────────────────

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.dashboard(user, query);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.options(user);
  }

  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  @Get("accounts")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  accounts(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listAccounts(user, query);
  }

  @Post("accounts")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createAccount(user, dto, { ipAddress, userAgent });
  }

  // ─── Expense Categories ────────────────────────────────────────────────────

  @Get("expense-categories")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  expenseCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listExpenseCategories(user);
  }

  @Post("expense-categories")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createExpenseCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseCategoryDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createExpenseCategory(user, dto, { ipAddress, userAgent });
  }

  // ─── Bank Accounts ─────────────────────────────────────────────────────────

  @Get("bank-accounts")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  bankAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listBankAccounts(user);
  }

  @Post("bank-accounts")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createBankAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankAccountDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createBankAccount(user, dto, { ipAddress, userAgent });
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────

  @Get("expenses")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  expenses(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listExpenses(user, query);
  }

  @Get("expenses/:id")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  expense(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.financeService.getExpense(user, id);
  }

  @Post("expenses")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createExpense(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createExpense(user, dto, { ipAddress, userAgent });
  }

  @Patch("expenses/:id/approve")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  approveExpense(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveExpenseDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.approveExpense(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("expenses/:id/reject")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  rejectExpense(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectExpenseDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.rejectExpense(user, id, dto, { ipAddress, userAgent });
  }

  // ─── Revenue ───────────────────────────────────────────────────────────────

  @Get("revenue")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  revenue(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listRevenue(user, query);
  }

  @Post("revenue")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createRevenue(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRevenueDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createRevenue(user, dto, { ipAddress, userAgent });
  }

  // ─── Supplier Payments ─────────────────────────────────────────────────────

  @Get("supplier-payments")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  supplierPayments(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listSupplierPayments(user, query);
  }

  @Post("supplier-payments")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createSupplierPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierPaymentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createSupplierPayment(user, dto, { ipAddress, userAgent });
  }

  // ─── Customer Payments ─────────────────────────────────────────────────────

  @Get("customer-payments")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  customerPayments(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listCustomerPayments(user, query);
  }

  @Post("customer-payments")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createCustomerPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerPaymentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createCustomerPayment(user, dto, { ipAddress, userAgent });
  }

  // ─── Payroll ───────────────────────────────────────────────────────────────

  @Get("payroll")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  payroll(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listPayroll(user, query);
  }

  @Post("payroll")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createPayroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createPayrollRecord(user, dto, { ipAddress, userAgent });
  }

  @Patch("payroll/:id/approve")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  approvePayroll(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApprovePayrollDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.approvePayroll(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("payroll/:id/mark-paid")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  markPayrollPaid(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.markPayrollPaid(user, id, { ipAddress, userAgent });
  }

  // ─── Petty Cash ────────────────────────────────────────────────────────────

  @Get("petty-cash")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  pettyCash(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listPettyCash(user, query);
  }

  @Post("petty-cash")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createPettyCash(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePettyCashTransactionDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createPettyCashTransaction(user, dto, { ipAddress, userAgent });
  }

  // ─── Journal Entries ───────────────────────────────────────────────────────

  @Get("journal-entries")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  journalEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listJournalEntries(user, query);
  }

  @Post("journal-entries")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createJournalEntry(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJournalEntryDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createJournalEntry(user, dto, { ipAddress, userAgent });
  }

  @Patch("journal-entries/:id/post")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  postJournalEntry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.postJournalEntry(user, id, { ipAddress, userAgent });
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  @Get("reports/profit-loss")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  profitLossReports(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listProfitLossReports(user);
  }

  @Post("reports/profit-loss")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  generateProfitLoss(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateReportDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.generateProfitLoss(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/cash-flow")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  cashFlowReports(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listCashFlowReports(user);
  }

  @Post("reports/cash-flow")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  generateCashFlow(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateReportDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.generateCashFlow(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/product-profitability")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  productProfitability(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listProductProfitability(user);
  }

  @Post("reports/product-profitability")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  generateProductProfitability(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateReportDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.generateProductProfitability(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/batch-profitability")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  batchProfitability(@CurrentUser() user: AuthenticatedUser, @Query() query: FinanceQueryDto) {
    return this.financeService.listBatchProfitability(user, query);
  }

  @Post("reports/batch-profitability")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createBatchProfitability(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBatchProfitabilityDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.financeService.createBatchProfitability(user, dto, { ipAddress, userAgent });
  }

  // ─── Debtors & Creditors ───────────────────────────────────────────────────

  @Get("debtors")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  debtors(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.debtors(user);
  }

  @Get("creditors")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  creditors(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.creditors(user);
  }
}
