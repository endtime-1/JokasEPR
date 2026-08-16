import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { ExpenseStatus, PayrollStatus, JournalEntryStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { nextRef } from "../../common/next-ref";
import { roundMoney } from "../../common/utils/money";
import { validateEnumFilter } from "../../common/utils/validate-enum-filter";
import { createLimiter } from "../../common/concurrency-limit";
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
  RejectExpenseDto,
  UpdateAccountDto,
  UpdateBankAccountDto,
  UpdateExpenseCategoryDto
} from "./dto/finance.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

const LARGE_EXPENSE_THRESHOLD = 5000;


function money(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class FinanceService {
  // Medium (DB stability audit, 2026-08-16): productProfitabilityReport
  // creates one ProductProfitability row per distinct SKU sold in the
  // period via an uncapped Promise.all — a company with a large catalog
  // fans out into that many simultaneous writes from one request. Caps it
  // to a bounded number in flight at once instead.
  private readonly profitabilityWriteLimit = createLimiter(8);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async dashboard(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = this.dateWhere(user, query);
    // (M8) Rejected/cancelled expenses never became real spend and shouldn't
    // drag down net profit — matches the status filter already used by the
    // P&L report generator (generateReport, below) so the two never disagree.
    const expWhere = { ...where, deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] as ("REJECTED" | "CANCELLED")[] } };
    const revWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "revenueDate") };
    const supWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };
    const cusWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };
    // C-BACK (2026-08-15): PayrollRecord is the single source of truth for
    // payroll cash cost (see the comment on hr.service.ts's markPayrollPaid)
    // — folded into totalExpenses/netProfit here the same way
    // generateCashFlow already sums it, so net profit doesn't overstate
    // itself by whatever payroll was paid through Finance's own screen.
    const payWhere = { companyId: user.companyId, deletedAt: null, status: "PAID" as const, ...this.dateBetween(query, "paymentDate") };

    const [expenses, revenues, supplierPayments, customerPayments, payrolls, pendingExpenses, bankAccounts, recentExpenses, recentRevenue, accountsPayable] = await Promise.all([
      this.prisma.expense.aggregate({ where: expWhere, _sum: { amount: true }, _count: true }),
      this.prisma.revenue.aggregate({ where: revWhere, _sum: { amount: true }, _count: true }),
      this.prisma.supplierPayment.aggregate({ where: supWhere, _sum: { amount: true }, _count: true }),
      this.prisma.customerPayment.aggregate({ where: cusWhere, _sum: { amount: true }, _count: true }),
      this.prisma.payrollRecord.aggregate({ where: payWhere, _sum: { netPay: true }, _count: true }),
      this.prisma.expense.count({ where: { companyId: user.companyId, deletedAt: null, status: "PENDING_APPROVAL" } }),
      this.prisma.bankAccount.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, accountName: true, bankName: true, currentBalance: true } }),
      this.prisma.expense.findMany({ where: expWhere, orderBy: { createdAt: "desc" }, take: 10, include: { category: { select: { name: true } } } }),
      this.prisma.revenue.findMany({ where: revWhere, orderBy: { createdAt: "desc" }, take: 10 }),
      // M-BUG (2026-08-13): the real record of "we owe this supplier this
      // much" lives entirely in Procurement's SupplierInvoice and was never
      // read by Finance — an expense only appears here once it's actually
      // paid, so "what do we currently owe our suppliers" was silently
      // missing every invoice still outstanding. Same status set Procurement's
      // own dashboard already uses for "open" invoices.
      this.prisma.supplierInvoice.aggregate({
        where: { companyId: user.companyId, deletedAt: null, status: { in: ["PENDING", "MATCHED", "APPROVED", "OVERDUE"] } },
        _sum: { balanceDue: true },
        _count: true
      })
    ]);

    const totalRevenue = money(revenues._sum.amount);
    const totalPayroll = money(payrolls._sum.netPay);
    const totalExpenses = money(expenses._sum.amount) + totalPayroll;

    return {
      data: {
        totalRevenue,
        totalExpenses,
        totalPayroll,
        netProfit: totalRevenue - totalExpenses,
        totalSupplierPayments: money(supplierPayments._sum.amount),
        totalCustomerPayments: money(customerPayments._sum.amount),
        expenseCount: expenses._count,
        revenueCount: revenues._count,
        pendingApprovals: pendingExpenses,
        bankAccounts: bankAccounts.map((a) => ({ ...a, currentBalance: Number(a.currentBalance) })),
        recentExpenses,
        recentRevenue,
        accountsPayable: money(accountsPayable._sum.balanceDue),
        accountsPayableCount: accountsPayable._count
      }
    };
  }

  // ─── Dashboard Chart ───────────────────────────────────────────────────────

  async dashboardChart(user: AuthenticatedUser, months = 6) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const [revenues, expenses, expByCategory, payrolls] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { companyId: user.companyId, deletedAt: null, revenueDate: { gte: start } },
        select: { revenueDate: true, amount: true }
      }),
      this.prisma.expense.findMany({
        where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start }, status: { notIn: ["REJECTED", "CANCELLED"] } },
        select: { expenseDate: true, amount: true }
      }),
      this.prisma.expense.groupBy({
        by: ["categoryId"],
        where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start }, status: { notIn: ["REJECTED", "CANCELLED"] } },
        _sum: { amount: true }
      }),
      // C-BACK (2026-08-15): PayrollRecord is the single source of truth for
      // payroll cost (see dashboard() above) — folded into the monthly
      // expense trend the same way, so a month with payroll paid through
      // Finance doesn't show an artificially low expense total.
      this.prisma.payrollRecord.findMany({
        where: { companyId: user.companyId, deletedAt: null, status: "PAID", paymentDate: { gte: start } },
        select: { paymentDate: true, netPay: true }
      })
    ]);

    const buckets: { month: string; label: string; revenue: number; expenses: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      buckets.push({ month: key, label, revenue: 0, expenses: 0 });
    }

    for (const r of revenues) {
      const d = new Date(r.revenueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.find((x) => x.month === key);
      if (b) b.revenue += Number(r.amount);
    }
    for (const e of expenses) {
      const d = new Date(e.expenseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.find((x) => x.month === key);
      if (b) b.expenses += Number(e.amount);
    }
    for (const p of payrolls) {
      if (!p.paymentDate) continue;
      const d = new Date(p.paymentDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.find((x) => x.month === key);
      if (b) b.expenses += Number(p.netPay);
    }

    const catIds = expByCategory.map((e) => e.categoryId).filter(Boolean) as string[];
    const categories = catIds.length
      ? await this.prisma.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : [];

    const donut = expByCategory
      .map((e) => ({ name: categories.find((c) => c.id === e.categoryId)?.name ?? "Uncategorized", amount: Number(e._sum.amount ?? 0) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    return { data: { months: buckets, expensesByCategory: donut } };
  }

  // ─── Options ───────────────────────────────────────────────────────────────

  async options(user: AuthenticatedUser) {
    const cacheKey = `finance:opts:${user.companyId}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;
    const [branches, bankAccounts, expenseCategories, accounts] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.bankAccount.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, accountName: true, bankName: true, accountType: true }, orderBy: { accountName: "asc" } }),
      this.prisma.expenseCategory.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.account.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: "asc" } })
    ]);
    const result = { data: { branches, bankAccounts, expenseCategories, accounts } };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  async listAccounts(user: AuthenticatedUser, query: FinanceQueryDto) {
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.type ? { type: query.type as never } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] } : {})
      },
      orderBy: { code: "asc" }
    });
    return { data: accounts };
  }

  async createAccount(user: AuthenticatedUser, dto: CreateAccountDto, ctx: RequestContext) {
    const account = await this.prisma.account.create({
      data: {
        companyId: user.companyId,
        code: dto.code.toUpperCase().trim(),
        name: dto.name,
        type: dto.type as never,
        parentId: dto.parentId,
        description: dto.description,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "Account", entityId: account.id, ...ctx });
    return { data: account };
  }

  async updateAccount(user: AuthenticatedUser, id: string, dto: UpdateAccountDto, ctx: RequestContext) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Account not found");
    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "Account", entityId: id, ...ctx });
    return { data: updated };
  }

  // Chart-of-accounts entries are pure config, but they can still be
  // referenced by posted journal history, child accounts in the hierarchy,
  // or expense categories — deleting out from under any of those would
  // orphan the reference, so each is checked before the soft-delete lands.
  async deleteAccount(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const account = await this.prisma.account.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Account not found");
    const [journalLines, childAccounts, expenseCategories] = await Promise.all([
      this.prisma.journalEntryLine.count({ where: { accountId: id } }),
      this.prisma.account.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.expenseCategory.count({ where: { accountId: id, deletedAt: null } })
    ]);
    if (journalLines > 0) throw new BadRequestException("Cannot delete an account referenced by existing journal entries.");
    if (childAccounts > 0) throw new BadRequestException("Cannot delete an account that has child accounts.");
    if (expenseCategories > 0) throw new BadRequestException("Cannot delete an account referenced by expense categories.");
    await this.prisma.account.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "Account", entityId: id, ...ctx });
    return { data: { ok: true } };
  }

  // ─── Expense Categories ────────────────────────────────────────────────────

  async listExpenseCategories(user: AuthenticatedUser) {
    const categories = await this.prisma.expenseCategory.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { name: "asc" }
    });
    return { data: categories };
  }

  async createExpenseCategory(user: AuthenticatedUser, dto: CreateExpenseCategoryDto, ctx: RequestContext) {
    const category = await this.prisma.expenseCategory.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        code: dto.code.toUpperCase().trim(),
        description: dto.description,
        accountId: dto.accountId,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "ExpenseCategory", entityId: category.id, ...ctx });
    return { data: category };
  }

  async updateExpenseCategory(user: AuthenticatedUser, id: string, dto: UpdateExpenseCategoryDto, ctx: RequestContext) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!category) throw new NotFoundException("Expense category not found");
    const updated = await this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "ExpenseCategory", entityId: id, ...ctx });
    return { data: updated };
  }

  async deleteExpenseCategory(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!category) throw new NotFoundException("Expense category not found");
    const [expenses, pettyCash] = await Promise.all([
      this.prisma.expense.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.pettyCashTransaction.count({ where: { categoryId: id, deletedAt: null } })
    ]);
    if (expenses > 0 || pettyCash > 0) throw new BadRequestException("Cannot delete an expense category referenced by existing expenses or petty cash transactions.");
    await this.prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "ExpenseCategory", entityId: id, ...ctx });
    return { data: { ok: true } };
  }

  // ─── Bank Accounts ─────────────────────────────────────────────────────────

  async listBankAccounts(user: AuthenticatedUser) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { accountName: "asc" }
    });
    return { data: accounts };
  }

  async createBankAccount(user: AuthenticatedUser, dto: CreateBankAccountDto, ctx: RequestContext) {
    const account = await this.prisma.bankAccount.create({
      data: {
        companyId: user.companyId,
        accountName: dto.accountName,
        accountNumber: dto.accountNumber,
        bankName: dto.bankName,
        branchName: dto.branchName,
        accountType: dto.accountType,
        openingBalance: dto.openingBalance ?? 0,
        currentBalance: dto.openingBalance ?? 0,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "BankAccount", entityId: account.id, ...ctx });
    return { data: account };
  }

  async updateBankAccount(user: AuthenticatedUser, id: string, dto: UpdateBankAccountDto, ctx: RequestContext) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Bank account not found");
    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(dto.accountName !== undefined && { accountName: dto.accountName }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.branchName !== undefined && { branchName: dto.branchName }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "BankAccount", entityId: id, ...ctx });
    return { data: updated };
  }

  // A bank account referenced by any existing expense/revenue/payment/payroll
  // transaction is reconciliation history, not config — deleting it would
  // orphan those references, so it's blocked rather than soft-deleted.
  async deleteBankAccount(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!account) throw new NotFoundException("Bank account not found");
    const [expenses, revenues, supplierPayments, customerPayments, payroll] = await Promise.all([
      this.prisma.expense.count({ where: { bankAccountId: id, deletedAt: null } }),
      this.prisma.revenue.count({ where: { bankAccountId: id, deletedAt: null } }),
      this.prisma.supplierPayment.count({ where: { bankAccountId: id, deletedAt: null } }),
      this.prisma.customerPayment.count({ where: { bankAccountId: id, deletedAt: null } }),
      this.prisma.payrollRecord.count({ where: { bankAccountId: id, deletedAt: null } })
    ]);
    if (expenses + revenues + supplierPayments + customerPayments + payroll > 0) {
      throw new BadRequestException("Cannot delete a bank account referenced by existing transactions.");
    }
    await this.prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "DELETE", entityType: "BankAccount", entityId: id, ...ctx });
    return { data: { ok: true } };
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────

  async listExpenses(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = {
      companyId: user.companyId,
      deletedAt: null,
      ...this.branchScope(user),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(ExpenseStatus)) as never } : {}),
      ...this.dateBetween(query, "expenseDate")
    };
    const { take, skip, page, pageSize } = this.pageArgs(query);
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: { select: { name: true, code: true } }, submittedBy: { select: { fullName: true } }, branch: { select: { name: true } } },
        orderBy: { expenseDate: "desc" },
        take,
        skip
      }),
      this.prisma.expense.count({ where })
    ]);
    return { data: expenses, meta: { total, page, pageSize } };
  }

  async getExpense(user: AuthenticatedUser, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, ...this.branchScope(user) }, include: { category: true, submittedBy: { select: { fullName: true, email: true } }, approvedBy: { select: { fullName: true } }, rejectedBy: { select: { fullName: true } }, bankAccount: { select: { accountName: true, bankName: true } } } });
    if (!expense) throw new NotFoundException("Expense not found");
    return { data: expense };
  }

  async createExpense(user: AuthenticatedUser, dto: CreateExpenseDto, ctx: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const reference = await nextRef(this.prisma, user.companyId, "EXP");
    const requiresApproval = dto.amount >= LARGE_EXPENSE_THRESHOLD;
    const status = requiresApproval ? "PENDING_APPROVAL" : "PENDING";

    const expense = await this.prisma.expense.create({
      data: {
        companyId: user.companyId,
        reference,
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        paymentMethod: dto.paymentMethod,
        vendorName: dto.vendorName,
        receiptRef: dto.receiptRef,
        notes: dto.notes,
        branchId: dto.branchId,
        bankAccountId: dto.bankAccountId,
        status: status as never,
        approvalRequired: requiresApproval,
        submittedById: user.id,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "Expense", entityId: expense.id, ...ctx });
    return { data: expense };
  }

  async approveExpense(user: AuthenticatedUser, id: string, dto: ApproveExpenseDto, ctx: RequestContext) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, ...this.branchScope(user) } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.status !== "PENDING_APPROVAL") throw new BadRequestException("Expense is not pending approval");
    if (expense.submittedById === user.id) throw new ForbiddenException("You cannot approve an expense you submitted yourself.");

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), notes: dto.notes ?? expense.notes, updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "APPROVE", entityType: "Expense", entityId: id, ...ctx });
    return { data: updated };
  }

  async rejectExpense(user: AuthenticatedUser, id: string, dto: RejectExpenseDto, ctx: RequestContext) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, ...this.branchScope(user) } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.status !== "PENDING_APPROVAL") throw new BadRequestException("Expense is not pending approval");

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: "REJECTED", rejectedById: user.id, rejectedAt: new Date(), rejectionReason: dto.reason, updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "REJECT", entityType: "Expense", entityId: id, ...ctx });
    return { data: updated };
  }

  // ─── Revenue ───────────────────────────────────────────────────────────────

  async listRevenue(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = {
      companyId: user.companyId,
      deletedAt: null,
      ...this.branchScope(user),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...this.dateBetween(query, "revenueDate")
    };
    const { take, skip, page, pageSize } = this.pageArgs(query);
    const [revenues, total] = await Promise.all([
      this.prisma.revenue.findMany({ where, include: { branch: { select: { name: true } } }, orderBy: { revenueDate: "desc" }, take, skip }),
      this.prisma.revenue.count({ where })
    ]);
    return { data: revenues, meta: { total, page, pageSize } };
  }

  async createRevenue(user: AuthenticatedUser, dto: CreateRevenueDto, ctx: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const reference = await nextRef(this.prisma, user.companyId, "REV");
    const revenue = await this.prisma.revenue.create({
      data: {
        companyId: user.companyId,
        reference,
        source: dto.source,
        description: dto.description,
        amount: dto.amount,
        revenueDate: new Date(dto.revenueDate),
        paymentMethod: dto.paymentMethod,
        customerName: dto.customerName,
        invoiceRef: dto.invoiceRef,
        branchId: dto.branchId,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "Revenue", entityId: revenue.id, ...ctx });
    return { data: revenue };
  }

  // ─── Supplier Payments ─────────────────────────────────────────────────────

  async listSupplierPayments(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };
    const { take, skip, page, pageSize } = this.pageArgs(query);
    const [payments, total] = await Promise.all([
      this.prisma.supplierPayment.findMany({ where, include: { bankAccount: { select: { accountName: true, bankName: true } } }, orderBy: { paymentDate: "desc" }, take, skip }),
      this.prisma.supplierPayment.count({ where })
    ]);
    return { data: payments, meta: { total, page, pageSize } };
  }

  async createSupplierPayment(user: AuthenticatedUser, dto: CreateSupplierPaymentDto, ctx: RequestContext) {
    // L-BUG (2026-08-13): unlike CustomerPayment/Payment/ProcurementPayment,
    // this had no idempotency support at all — a client retry after a
    // dropped response (network timeout, double-click) could record the
    // same supplier payment twice with nothing to recognize the resend.
    if (dto.idempotencyKey) {
      const existing = await this.findSupplierPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const reference = await nextRef(this.prisma, user.companyId, "SP");

    // M-BUG (2026-08-13): this used to just record a free-text payment with
    // zero connection to the real Supplier/SupplierInvoice records in
    // Procurement — a payment entered here never reduced what was actually
    // owed, risking the same payment being entered twice (once "for real"
    // in Procurement, once here). When a real invoice is linked, apply the
    // exact same floor-guarded decrement procurement.service.ts's own
    // createPayment uses, so recording through either screen has one
    // consistent effect on the real AP balance.
    const invoice = dto.invoiceId
      ? await this.prisma.supplierInvoice.findFirst({ where: { id: dto.invoiceId, companyId: user.companyId, deletedAt: null } })
      : null;
    if (dto.invoiceId && !invoice) throw new NotFoundException("Supplier invoice was not found.");
    if (invoice && Number(invoice.balanceDue) <= 0) throw new BadRequestException("Invoice has no outstanding balance.");

    let payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.supplierPayment.create({
          data: {
            companyId: user.companyId,
            reference,
            supplierName: dto.supplierName,
            supplierId: dto.supplierId,
            invoiceId: dto.invoiceId,
            amount: dto.amount,
            paymentDate: new Date(dto.paymentDate),
            paymentMethod: dto.paymentMethod,
            description: dto.description,
            purchaseOrderRef: dto.purchaseOrderRef,
            bankAccountId: dto.bankAccountId,
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
            createdById: user.id
          }
        });

        if (invoice) {
          const decremented = await tx.supplierInvoice.updateMany({
            where: { id: invoice.id, balanceDue: { gte: dto.amount } },
            data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id }
          });
          if (decremented.count === 0) {
            throw new BadRequestException(`Payment of ${dto.amount} exceeds the outstanding balance on this invoice.`);
          }
          const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: { status: Number(refreshed.balanceDue) <= 0 ? "PAID" : "MATCHED" }
          });
        }

        return row;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findSupplierPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "SupplierPayment", entityId: payment.id, ...ctx });
    return { data: payment };
  }

  private async findSupplierPaymentByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.supplierPayment.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  // ─── Customer Payments ─────────────────────────────────────────────────────

  async listCustomerPayments(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };
    const { take, skip, page, pageSize } = this.pageArgs(query);
    const [payments, total] = await Promise.all([
      this.prisma.customerPayment.findMany({ where, include: { bankAccount: { select: { accountName: true, bankName: true } } }, orderBy: { paymentDate: "desc" }, take, skip }),
      this.prisma.customerPayment.count({ where })
    ]);
    return { data: payments, meta: { total, page, pageSize } };
  }

  async createCustomerPayment(user: AuthenticatedUser, dto: CreateCustomerPaymentDto, ctx: RequestContext) {
    // Mirrors the sales-module payment idempotency pattern: a mobile
    // offline-queue resend or a web retry after a dropped response carries
    // the same idempotencyKey, so a resend replays the original record
    // instead of recording a second real payment.
    if (dto.idempotencyKey) {
      const existing = await this.findCustomerPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const reference = await nextRef(this.prisma, user.companyId, "CP");

    // Medium (DB stability audit, 2026-08-16): this used to just record a
    // free-text payment with zero connection to the real Invoice records in
    // Sales — a payment entered here never reduced what was actually owed,
    // risking the same payment being entered twice (once "for real" via
    // Sales' own recordPayment, once here). When a real invoice is linked,
    // apply the exact same floor-guarded decrement (and linked-SalesOrder
    // update) sales.service.ts's own recordPayment uses, so recording
    // through either screen has one consistent effect on the real AR
    // balance. Mirrors the equivalent SupplierPayment/SupplierInvoice fix
    // above.
    const invoice = dto.invoiceId
      ? await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, companyId: user.companyId, deletedAt: null } })
      : null;
    if (dto.invoiceId && !invoice) throw new NotFoundException("Invoice was not found.");
    if (invoice && Number(invoice.balanceDue) <= 0) throw new BadRequestException("Invoice has no outstanding balance.");
    if (invoice && dto.amount > Number(invoice.balanceDue)) throw new BadRequestException("Payment amount cannot exceed invoice balance.");

    let payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.customerPayment.create({
          data: {
            companyId: user.companyId,
            reference,
            customerName: dto.customerName,
            amount: dto.amount,
            paymentDate: new Date(dto.paymentDate),
            paymentMethod: dto.paymentMethod,
            description: dto.description,
            invoiceRef: dto.invoiceRef,
            invoiceId: dto.invoiceId,
            bankAccountId: dto.bankAccountId,
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
            createdById: user.id
          }
        });

        if (invoice) {
          const decremented = await tx.invoice.updateMany({
            where: { id: invoice.id, balanceDue: { gte: dto.amount } },
            data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id }
          });
          if (decremented.count === 0) {
            throw new BadRequestException(`Payment of ${dto.amount} exceeds the outstanding balance on this invoice.`);
          }
          const refreshed = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: Number(refreshed.balanceDue) <= 0 ? "PAID" : "PARTIALLY_PAID" }
          });
          if (invoice.salesOrderId) {
            await tx.salesOrder.update({ where: { id: invoice.salesOrderId }, data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id } });
          }
        }

        return row;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findCustomerPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "CustomerPayment", entityId: payment.id, ...ctx });
    return { data: payment };
  }

  private async findCustomerPaymentByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.customerPayment.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  // ─── Payroll ───────────────────────────────────────────────────────────────

  async listPayroll(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = { companyId: user.companyId, deletedAt: null, ...this.branchScope(user), ...(query.status ? { status: validateEnumFilter(query.status, Object.values(PayrollStatus)) as never } : {}) };
    const { take, skip, page, pageSize } = this.pageArgs(query, 100);
    const [records, total] = await Promise.all([
      this.prisma.payrollRecord.findMany({ where, include: { branch: { select: { name: true } } }, orderBy: [{ period: "desc" }, { employeeName: "asc" }], take, skip }),
      this.prisma.payrollRecord.count({ where })
    ]);
    return { data: records, meta: { total, page, pageSize } };
  }

  async createPayrollRecord(user: AuthenticatedUser, dto: CreatePayrollRecordDto, ctx: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const employeeName = dto.employeeName.trim();

    // H-BACK-1: this endpoint and HR's own POST /hr/payroll both create
    // PayrollRecord rows with no awareness of each other — a Finance-
    // permission user (who may not hold HR_MANAGE at all) could create a
    // second payroll entry for a person/period HR already processed, with
    // nothing stopping it, and both could independently be approved and
    // paid. Mirrors the duplicate-period guard hr.service.ts's own
    // createPayrollRecord already has (M17) — matched on employeeName
    // rather than employeeId since this path takes free-text name entry
    // and has no real Employee link, but the underlying risk (two payroll
    // rows for the same person/period) is identical either way this table
    // gets written to.
    const duplicate = await this.prisma.payrollRecord.findFirst({
      where: { companyId: user.companyId, period: dto.period, employeeName, deletedAt: null }
    });
    if (duplicate) {
      throw new BadRequestException(`A payroll record already exists for ${employeeName} for period ${dto.period}.`);
    }

    const reference = await nextRef(this.prisma, user.companyId, "PAY");
    // H-BACK-8: plain JS float arithmetic on currency without a rounding
    // step is the standard source of drift (e.g. 19.999999999998 landing in
    // a fixed-precision decimal column). roundMoney() matches the pattern
    // hr.service.ts's own payroll paths already use.
    const gross = roundMoney((dto.basicSalary ?? 0) + (dto.allowances ?? 0) - (dto.deductions ?? 0));
    const net = roundMoney(gross - (dto.taxDeduction ?? 0) - (dto.ssnit ?? 0));
    if (net < 0) throw new BadRequestException("Net pay cannot be negative — check deductions/tax against gross pay.");

    const record = await this.prisma.payrollRecord.create({
      data: {
        companyId: user.companyId,
        reference,
        period: dto.period,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        employeeName,
        employeeCode: dto.employeeCode,
        basicSalary: dto.basicSalary,
        allowances: dto.allowances ?? 0,
        deductions: dto.deductions ?? 0,
        grossPay: gross,
        taxDeduction: dto.taxDeduction ?? 0,
        ssnit: dto.ssnit ?? 0,
        netPay: net,
        branchId: dto.branchId,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "PayrollRecord", entityId: record.id, ...ctx });
    return { data: record };
  }

  async approvePayroll(user: AuthenticatedUser, id: string, dto: ApprovePayrollDto, ctx: RequestContext) {
    const record = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, ...this.branchScope(user) } });
    if (!record) throw new NotFoundException("Payroll record not found");
    if (record.status !== "DRAFT") throw new BadRequestException("Only DRAFT records can be approved");
    if (record.createdById === user.id) throw new ForbiddenException("You cannot approve a payroll record you created yourself.");

    const updated = await this.prisma.payrollRecord.update({
      where: { id },
      data: { status: "APPROVED", paymentMethod: dto.paymentMethod, paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined, updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "APPROVE", entityType: "PayrollRecord", entityId: id, ...ctx });
    return { data: updated };
  }

  async markPayrollPaid(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const record = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null, ...this.branchScope(user) } });
    if (!record) throw new NotFoundException("Payroll record not found");
    if (record.status !== "APPROVED") throw new BadRequestException("Only APPROVED records can be marked as paid");

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "PAID", paymentDate: record.paymentDate ?? new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "PayrollRecord", entityId: id, ...ctx });
    return { data: updated };
  }

  // ─── Petty Cash ────────────────────────────────────────────────────────────

  async listPettyCash(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = {
      companyId: user.companyId,
      deletedAt: null,
      ...this.branchScope(user),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...this.dateBetween(query, "transactionDate")
    };
    const { take, skip, page, pageSize } = this.pageArgs(query);
    const [transactions, total] = await Promise.all([
      this.prisma.pettyCashTransaction.findMany({ where, include: { category: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { transactionDate: "desc" }, take, skip }),
      this.prisma.pettyCashTransaction.count({ where })
    ]);
    return { data: transactions, meta: { total, page, pageSize } };
  }

  async createPettyCashTransaction(user: AuthenticatedUser, dto: CreatePettyCashTransactionDto, ctx: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const reference = await nextRef(this.prisma, user.companyId, "PCT");

    // The running balance is derived from the *previous* transaction's
    // balance, read outside any lock — two concurrent requests could both
    // read the same stale balance and both commit, corrupting the running
    // total and allowing more cash to be disbursed than actually exists.
    // There's no single row to lock here (it's "read the latest, then
    // insert"), so Serializable isolation is the right tool: MySQL will
    // abort one of two conflicting concurrent transactions with a
    // serialization failure instead of letting both silently succeed.
    const tx = await this.prisma.$transaction(
      async (trx) => {
        const last = await trx.pettyCashTransaction.findFirst({
          where: { companyId: user.companyId, deletedAt: null, ...(dto.branchId ? { branchId: dto.branchId } : {}) },
          orderBy: { createdAt: "desc" }
        });

        const lastBalance = last ? Number(last.balance) : 0;
        const balance = dto.type === "FUNDING" || dto.type === "REPLENISHMENT" ? lastBalance + dto.amount : lastBalance - dto.amount;

        if (balance < 0) throw new BadRequestException("Insufficient petty cash balance");

        return trx.pettyCashTransaction.create({
          data: {
            companyId: user.companyId,
            reference,
            type: dto.type,
            amount: dto.amount,
            description: dto.description,
            transactionDate: new Date(dto.transactionDate),
            categoryId: dto.categoryId,
            branchId: dto.branchId,
            receiptRef: dto.receiptRef,
            balance,
            notes: dto.notes,
            requestedById: user.id,
            createdById: user.id
          }
        });
      },
      { isolationLevel: "Serializable" }
    );
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "PettyCashTransaction", entityId: tx.id, ...ctx });
    return { data: tx };
  }

  // ─── Journal Entries ───────────────────────────────────────────────────────

  async listJournalEntries(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = {
      companyId: user.companyId,
      deletedAt: null,
      ...(query.status ? { status: validateEnumFilter(query.status, Object.values(JournalEntryStatus)) as never } : {}),
      ...this.dateBetween(query, "entryDate")
    };
    const { take, skip, page, pageSize } = this.pageArgs(query, 50);
    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, include: { lines: { include: { account: { select: { code: true, name: true } } } } }, orderBy: { entryDate: "desc" }, take, skip }),
      this.prisma.journalEntry.count({ where })
    ]);
    return { data: entries, meta: { total, page, pageSize } };
  }

  async createJournalEntry(user: AuthenticatedUser, dto: CreateJournalEntryDto, ctx: RequestContext) {
    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new BadRequestException("Debits must equal credits");

    const reference = await nextRef(this.prisma, user.companyId, "JE");

    const entry = await this.prisma.journalEntry.create({
      data: {
        companyId: user.companyId,
        reference,
        entryDate: new Date(dto.entryDate),
        description: dto.description,
        type: dto.type,
        totalDebit,
        totalCredit,
        sourceModule: dto.sourceModule,
        sourceId: dto.sourceId,
        notes: dto.notes,
        createdById: user.id,
        lines: {
          create: dto.lines.map((l) => ({
            accountId: l.accountId,
            description: l.description,
            debit: l.debit,
            credit: l.credit,
            sequence: l.sequence
          }))
        }
      },
      include: { lines: true }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "JournalEntry", entityId: entry.id, ...ctx });
    return { data: entry };
  }

  async postJournalEntry(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!entry) throw new NotFoundException("Journal entry not found");
    if (entry.status !== "DRAFT") throw new BadRequestException("Only DRAFT entries can be posted");

    const updated = await this.prisma.journalEntry.update({ where: { id }, data: { status: "POSTED", postedById: user.id, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "APPROVE", entityType: "JournalEntry", entityId: id, ...ctx });
    return { data: updated };
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  async generateProfitLoss(user: AuthenticatedUser, dto: GenerateReportDto, ctx: RequestContext) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    const [revData, expData, payrollData] = await Promise.all([
      this.prisma.revenue.groupBy({ by: ["source"], where: { companyId: user.companyId, deletedAt: null, revenueDate: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.expense.groupBy({ by: ["categoryId"], where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start, lte: end }, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { amount: true } }),
      // C-BACK (2026-08-15): PayrollRecord is the single source of truth for
      // payroll cost (see dashboard() above) — folded into totalExpenses the
      // same way, so P&L doesn't overstate net profit by whatever payroll
      // was paid through Finance's own screen.
      this.prisma.payrollRecord.aggregate({ where: { companyId: user.companyId, deletedAt: null, status: "PAID", paymentDate: { gte: start, lte: end } }, _sum: { netPay: true } })
    ]);

    const totalRevenue = revData.reduce((s, r) => s + money(r._sum.amount), 0);
    const totalPayroll = money(payrollData._sum.netPay);
    const totalExpenses = expData.reduce((s, e) => s + money(e._sum.amount), 0) + totalPayroll;
    const grossProfit = totalRevenue - totalExpenses;

    const reportData = { revenueBySource: revData, expenseByCategory: expData, payroll: totalPayroll };
    const title = dto.title ?? `P&L ${dto.startDate} to ${dto.endDate}`;

    const report = await this.prisma.profitLossReport.create({
      data: {
        companyId: user.companyId,
        title,
        periodStart: start,
        periodEnd: end,
        totalRevenue,
        totalExpenses,
        grossProfit,
        netProfit: grossProfit,
        reportData,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "ProfitLossReport", entityId: report.id, ...ctx });
    return { data: { ...report, reportData } };
  }

  async listProfitLossReports(user: AuthenticatedUser) {
    const reports = await this.prisma.profitLossReport.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
    return { data: reports };
  }

  async generateCashFlow(user: AuthenticatedUser, dto: GenerateReportDto, ctx: RequestContext) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    const [revenues, expenses, supplierPayments, customerPayments, payrolls] = await Promise.all([
      this.prisma.revenue.aggregate({ where: { companyId: user.companyId, deletedAt: null, revenueDate: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start, lte: end }, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { amount: true } }),
      this.prisma.supplierPayment.aggregate({ where: { companyId: user.companyId, deletedAt: null, paymentDate: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.customerPayment.aggregate({ where: { companyId: user.companyId, deletedAt: null, paymentDate: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.payrollRecord.aggregate({ where: { companyId: user.companyId, deletedAt: null, status: "PAID", paymentDate: { gte: start, lte: end } }, _sum: { netPay: true } })
    ]);

    const inflows = money(revenues._sum.amount) + money(customerPayments._sum.amount);
    const outflows = money(expenses._sum.amount) + money(supplierPayments._sum.amount) + money(payrolls._sum.netPay);
    const operatingCashFlow = inflows - outflows;
    const netCashFlow = operatingCashFlow;

    const bankAccounts = await this.prisma.bankAccount.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { currentBalance: true } });
    const closingBalance = bankAccounts.reduce((s, a) => s + money(a.currentBalance), 0);

    const reportData = { inflows: money(revenues._sum.amount), customerPayments: money(customerPayments._sum.amount), expenses: money(expenses._sum.amount), supplierPayments: money(supplierPayments._sum.amount), payroll: money(payrolls._sum.netPay) };
    const title = dto.title ?? `Cash Flow ${dto.startDate} to ${dto.endDate}`;

    const report = await this.prisma.cashFlowReport.create({
      data: {
        companyId: user.companyId,
        title,
        periodStart: start,
        periodEnd: end,
        openingBalance: 0,
        closingBalance,
        operatingCashFlow,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netCashFlow,
        reportData,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "CashFlowReport", entityId: report.id, ...ctx });
    return { data: { ...report, reportData } };
  }

  async listCashFlowReports(user: AuthenticatedUser) {
    const reports = await this.prisma.cashFlowReport.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
    return { data: reports };
  }

  async generateProductProfitability(user: AuthenticatedUser, dto: GenerateReportDto, ctx: RequestContext) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    // Cap the date range to 366 days to prevent unbounded memory usage
    const MAX_DAYS = 366;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs > MAX_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Date range cannot exceed 12 months.");
    }

    const [salesData, costData] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId: user.companyId, deletedAt: null, invoiceDate: { gte: start, lte: end }, status: { notIn: ["DRAFT", "VOID"] } } }) as unknown as Promise<Array<{ items?: Array<{ product?: { sku: string; name: string }; lineTotal?: unknown; quantity?: unknown }> }>>,
      (this.prisma.poultryCostRecord.groupBy as unknown as (a: object) => Promise<Array<{ _sum: { totalCost?: unknown } }>>)({ by: ["type"], where: { companyId: user.companyId, deletedAt: null, recordDate: { gte: start, lte: end } }, _sum: { totalCost: true } })
    ]);

    const productMap: Record<string, { name: string; revenue: number; units: number }> = {};
    for (const inv of salesData) {
      for (const item of inv.items ?? []) {
        const key = item.product?.sku ?? "OTHER";
        if (!productMap[key]) productMap[key] = { name: item.product?.name ?? "Other", revenue: 0, units: 0 };
        productMap[key].revenue += Number(item.lineTotal ?? 0);
        productMap[key].units += Number(item.quantity ?? 0);
      }
    }

    const totalCostFromPoultry = costData.reduce((s, c) => s + money((c._sum as { totalCost?: unknown }).totalCost), 0);
    const productCount = Object.keys(productMap).length || 1;
    // L8: previously split the whole period's cost evenly across every
    // product regardless of its actual revenue or volume share, so a
    // low-volume product looked exactly as costly as the flagship one —
    // the resulting margins were close to meaningless for real decisions.
    // Allocate proportionally to each product's share of total revenue
    // instead, falling back to an even split only when there's no revenue
    // at all to weight by.
    const totalRevenue = Object.values(productMap).reduce((s, p) => s + p.revenue, 0);

    const results = await Promise.all(
      Object.entries(productMap).map(([sku, data]) => this.profitabilityWriteLimit.run(async () => {
        const cost = totalRevenue > 0
          ? totalCostFromPoultry * (data.revenue / totalRevenue)
          : totalCostFromPoultry / productCount;
        const profit = data.revenue - cost;
        const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
        const rec = await this.prisma.productProfitability.create({
          data: {
            companyId: user.companyId,
            productName: data.name,
            productCode: sku,
            periodStart: start,
            periodEnd: end,
            totalRevenue: data.revenue,
            totalCost: cost,
            grossProfit: profit,
            margin,
            unitsSold: data.units,
            createdById: user.id
          }
        });
        return rec;
      }))
    );

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "ProductProfitability", entityId: user.companyId, ...ctx });
    return { data: results };
  }

  async listProductProfitability(user: AuthenticatedUser) {
    const records = await this.prisma.productProfitability.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
    return { data: records };
  }

  async createBatchProfitability(user: AuthenticatedUser, dto: CreateBatchProfitabilityDto, ctx: RequestContext) {
    const grossProfit = dto.totalRevenue - dto.totalCost;
    const margin = dto.totalRevenue > 0 ? (grossProfit / dto.totalRevenue) * 100 : 0;
    const record = await this.prisma.batchProfitability.create({
      data: {
        companyId: user.companyId,
        batchType: dto.batchType,
        batchId: dto.batchId,
        batchReference: dto.batchReference,
        batchName: dto.batchName,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        totalRevenue: dto.totalRevenue,
        totalCost: dto.totalCost,
        grossProfit,
        margin,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "BatchProfitability", entityId: record.id, ...ctx });
    return { data: record };
  }

  async listBatchProfitability(user: AuthenticatedUser, query: FinanceQueryDto) {
    const records = await this.prisma.batchProfitability.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.status ? { batchType: query.status as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return { data: records };
  }

  // ─── Debtors & Creditors ───────────────────────────────────────────────────

  async debtors(user: AuthenticatedUser) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: { select: { name: true, code: true } } },
      orderBy: { balanceDue: "desc" },
      take: 500,
    });
    return { data: invoices };
  }

  async creditors(user: AuthenticatedUser) {
    const payments = await this.prisma.supplierPayment.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { paymentDate: "desc" },
      take: 100
    });
    return { data: payments };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // This module had NO branch scoping at all — every method filtered only by
  // companyId, so a branch-restricted finance user could read/approve/reject
  // any other branch's expenses, payroll, or revenue by ID. Only
  // Expense/Revenue/PayrollRecord/PettyCashTransaction actually have a
  // (nullable) branchId field; unassigned records stay visible to everyone
  // in scope, matching the OR-null-or-allowed convention used elsewhere
  // (e.g. quality.service.ts, alerts.service.ts).
  private branchScope(user: AuthenticatedUser): Record<string, unknown> {
    if (user.hasGlobalAccess || user.branchIds.length === 0) return {};
    return { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] };
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId?: string | null) {
    if (!branchId || user.hasGlobalAccess) return;
    if (!user.branchIds.includes(branchId)) throw new ForbiddenException("You do not have access to this branch.");
  }

  private dateWhere(user: AuthenticatedUser, query: FinanceQueryDto) {
    return {
      companyId: user.companyId,
      ...this.dateBetween(query, "expenseDate")
    };
  }

  private dateBetween(query: FinanceQueryDto, field: string) {
    if (!query.startDate && !query.endDate) return {};
    const result: Record<string, unknown> = {};
    result[field] = {
      ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
      ...(query.endDate ? { lte: new Date(query.endDate) } : {})
    };
    return result;
  }

  private pageArgs(query: FinanceQueryDto, defaultSize = 50) {
    const pageSize = Math.min(query.pageSize ?? defaultSize, 200);
    const page = Math.max(query.page ?? 1, 1);
    return { take: pageSize, skip: (page - 1) * pageSize, page, pageSize };
  }
}
