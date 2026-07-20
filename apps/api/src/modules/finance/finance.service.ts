import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
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

type RequestContext = { ipAddress?: string; userAgent?: string };

const LARGE_EXPENSE_THRESHOLD = 5000;

function nextRef(prefix: string, count: number) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

function money(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async dashboard(user: AuthenticatedUser, query: FinanceQueryDto) {
    const where = this.dateWhere(user, query);
    const expWhere = { ...where, deletedAt: null };
    const revWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "revenueDate") };
    const supWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };
    const cusWhere = { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") };

    const [expenses, revenues, supplierPayments, customerPayments, pendingExpenses, bankAccounts, recentExpenses, recentRevenue] = await Promise.all([
      this.prisma.expense.aggregate({ where: expWhere, _sum: { amount: true }, _count: true }),
      this.prisma.revenue.aggregate({ where: revWhere, _sum: { amount: true }, _count: true }),
      this.prisma.supplierPayment.aggregate({ where: supWhere, _sum: { amount: true }, _count: true }),
      this.prisma.customerPayment.aggregate({ where: cusWhere, _sum: { amount: true }, _count: true }),
      this.prisma.expense.count({ where: { companyId: user.companyId, deletedAt: null, status: "PENDING_APPROVAL" } }),
      this.prisma.bankAccount.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, accountName: true, bankName: true, currentBalance: true } }),
      this.prisma.expense.findMany({ where: expWhere, orderBy: { createdAt: "desc" }, take: 10, include: { category: { select: { name: true } } } }),
      this.prisma.revenue.findMany({ where: revWhere, orderBy: { createdAt: "desc" }, take: 10 })
    ]);

    const totalRevenue = money(revenues._sum.amount);
    const totalExpenses = money(expenses._sum.amount);

    return {
      data: {
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        totalSupplierPayments: money(supplierPayments._sum.amount),
        totalCustomerPayments: money(customerPayments._sum.amount),
        expenseCount: expenses._count,
        revenueCount: revenues._count,
        pendingApprovals: pendingExpenses,
        bankAccounts,
        recentExpenses,
        recentRevenue
      }
    };
  }

  // ─── Dashboard Chart ───────────────────────────────────────────────────────

  async dashboardChart(user: AuthenticatedUser, months = 6) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const [revenues, expenses, expByCategory] = await Promise.all([
      this.prisma.revenue.findMany({
        where: { companyId: user.companyId, deletedAt: null, revenueDate: { gte: start } },
        select: { revenueDate: true, amount: true }
      }),
      this.prisma.expense.findMany({
        where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start }, status: { not: "REJECTED" } },
        select: { expenseDate: true, amount: true }
      }),
      this.prisma.expense.groupBy({
        by: ["categoryId"],
        where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start }, status: { not: "REJECTED" } },
        _sum: { amount: true }
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

  // ─── Expenses ──────────────────────────────────────────────────────────────

  async listExpenses(user: AuthenticatedUser, query: FinanceQueryDto) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...this.dateBetween(query, "expenseDate")
      },
      include: { category: { select: { name: true, code: true } }, submittedBy: { select: { fullName: true } }, branch: { select: { name: true } } },
      orderBy: { expenseDate: "desc" },
      take: 200
    });
    return { data: expenses };
  }

  async getExpense(user: AuthenticatedUser, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, include: { category: true, submittedBy: { select: { fullName: true, email: true } }, approvedBy: { select: { fullName: true } }, rejectedBy: { select: { fullName: true } }, bankAccount: { select: { accountName: true, bankName: true } } } });
    if (!expense) throw new NotFoundException("Expense not found");
    return { data: expense };
  }

  async createExpense(user: AuthenticatedUser, dto: CreateExpenseDto, ctx: RequestContext) {
    const count = await this.prisma.expense.count({ where: { companyId: user.companyId } });
    const reference = nextRef("EXP", count);
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
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.status !== "PENDING_APPROVAL") throw new BadRequestException("Expense is not pending approval");

    const updated = await this.prisma.expense.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), notes: dto.notes ?? expense.notes, updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "APPROVE", entityType: "Expense", entityId: id, ...ctx });
    return { data: updated };
  }

  async rejectExpense(user: AuthenticatedUser, id: string, dto: RejectExpenseDto, ctx: RequestContext) {
    const expense = await this.prisma.expense.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
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
    const revenues = await this.prisma.revenue.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...this.dateBetween(query, "revenueDate")
      },
      include: { branch: { select: { name: true } } },
      orderBy: { revenueDate: "desc" },
      take: 200
    });
    return { data: revenues };
  }

  async createRevenue(user: AuthenticatedUser, dto: CreateRevenueDto, ctx: RequestContext) {
    const count = await this.prisma.revenue.count({ where: { companyId: user.companyId } });
    const reference = nextRef("REV", count);
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
    const payments = await this.prisma.supplierPayment.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") },
      include: { bankAccount: { select: { accountName: true, bankName: true } } },
      orderBy: { paymentDate: "desc" },
      take: 200
    });
    return { data: payments };
  }

  async createSupplierPayment(user: AuthenticatedUser, dto: CreateSupplierPaymentDto, ctx: RequestContext) {
    const count = await this.prisma.supplierPayment.count({ where: { companyId: user.companyId } });
    const reference = nextRef("SP", count);
    const payment = await this.prisma.supplierPayment.create({
      data: {
        companyId: user.companyId,
        reference,
        supplierName: dto.supplierName,
        amount: dto.amount,
        paymentDate: new Date(dto.paymentDate),
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        purchaseOrderRef: dto.purchaseOrderRef,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "SupplierPayment", entityId: payment.id, ...ctx });
    return { data: payment };
  }

  // ─── Customer Payments ─────────────────────────────────────────────────────

  async listCustomerPayments(user: AuthenticatedUser, query: FinanceQueryDto) {
    const payments = await this.prisma.customerPayment.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...this.dateBetween(query, "paymentDate") },
      include: { bankAccount: { select: { accountName: true, bankName: true } } },
      orderBy: { paymentDate: "desc" },
      take: 200
    });
    return { data: payments };
  }

  async createCustomerPayment(user: AuthenticatedUser, dto: CreateCustomerPaymentDto, ctx: RequestContext) {
    const count = await this.prisma.customerPayment.count({ where: { companyId: user.companyId } });
    const reference = nextRef("CP", count);
    const payment = await this.prisma.customerPayment.create({
      data: {
        companyId: user.companyId,
        reference,
        customerName: dto.customerName,
        amount: dto.amount,
        paymentDate: new Date(dto.paymentDate),
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        invoiceRef: dto.invoiceRef,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "CustomerPayment", entityId: payment.id, ...ctx });
    return { data: payment };
  }

  // ─── Payroll ───────────────────────────────────────────────────────────────

  async listPayroll(user: AuthenticatedUser, query: FinanceQueryDto) {
    const records = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.status ? { status: query.status as never } : {}) },
      include: { branch: { select: { name: true } } },
      orderBy: [{ period: "desc" }, { employeeName: "asc" }],
      take: 200
    });
    return { data: records };
  }

  async createPayrollRecord(user: AuthenticatedUser, dto: CreatePayrollRecordDto, ctx: RequestContext) {
    const count = await this.prisma.payrollRecord.count({ where: { companyId: user.companyId } });
    const reference = nextRef("PAY", count);
    const gross = (dto.basicSalary ?? 0) + (dto.allowances ?? 0) - (dto.deductions ?? 0);
    const net = gross - (dto.taxDeduction ?? 0) - (dto.ssnit ?? 0);

    const record = await this.prisma.payrollRecord.create({
      data: {
        companyId: user.companyId,
        reference,
        period: dto.period,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        employeeName: dto.employeeName,
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
    const record = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!record) throw new NotFoundException("Payroll record not found");
    if (record.status !== "DRAFT") throw new BadRequestException("Only DRAFT records can be approved");

    const updated = await this.prisma.payrollRecord.update({
      where: { id },
      data: { status: "APPROVED", paymentMethod: dto.paymentMethod, paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined, updatedById: user.id }
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "APPROVE", entityType: "PayrollRecord", entityId: id, ...ctx });
    return { data: updated };
  }

  async markPayrollPaid(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const record = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!record) throw new NotFoundException("Payroll record not found");
    if (record.status !== "APPROVED") throw new BadRequestException("Only APPROVED records can be marked as paid");

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "PAID", paymentDate: record.paymentDate ?? new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "PayrollRecord", entityId: id, ...ctx });
    return { data: updated };
  }

  // ─── Petty Cash ────────────────────────────────────────────────────────────

  async listPettyCash(user: AuthenticatedUser, query: FinanceQueryDto) {
    const transactions = await this.prisma.pettyCashTransaction.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...this.dateBetween(query, "transactionDate")
      },
      include: { category: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { transactionDate: "desc" },
      take: 200
    });
    return { data: transactions };
  }

  async createPettyCashTransaction(user: AuthenticatedUser, dto: CreatePettyCashTransactionDto, ctx: RequestContext) {
    const count = await this.prisma.pettyCashTransaction.count({ where: { companyId: user.companyId } });
    const reference = nextRef("PCT", count);

    const last = await this.prisma.pettyCashTransaction.findFirst({
      where: { companyId: user.companyId, deletedAt: null, ...(dto.branchId ? { branchId: dto.branchId } : {}) },
      orderBy: { createdAt: "desc" }
    });

    const lastBalance = last ? Number(last.balance) : 0;
    const balance = dto.type === "FUNDING" || dto.type === "REPLENISHMENT" ? lastBalance + dto.amount : lastBalance - dto.amount;

    if (balance < 0) throw new BadRequestException("Insufficient petty cash balance");

    const tx = await this.prisma.pettyCashTransaction.create({
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
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "PettyCashTransaction", entityId: tx.id, ...ctx });
    return { data: tx };
  }

  // ─── Journal Entries ───────────────────────────────────────────────────────

  async listJournalEntries(user: AuthenticatedUser, query: FinanceQueryDto) {
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...this.dateBetween(query, "entryDate")
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { entryDate: "desc" },
      take: 100
    });
    return { data: entries };
  }

  async createJournalEntry(user: AuthenticatedUser, dto: CreateJournalEntryDto, ctx: RequestContext) {
    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) throw new BadRequestException("Debits must equal credits");

    const count = await this.prisma.journalEntry.count({ where: { companyId: user.companyId } });
    const reference = nextRef("JE", count);

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

    const [revData, expData] = await Promise.all([
      this.prisma.revenue.groupBy({ by: ["source"], where: { companyId: user.companyId, deletedAt: null, revenueDate: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.expense.groupBy({ by: ["categoryId"], where: { companyId: user.companyId, deletedAt: null, expenseDate: { gte: start, lte: end }, status: { notIn: ["REJECTED", "CANCELLED"] } }, _sum: { amount: true } })
    ]);

    const totalRevenue = revData.reduce((s, r) => s + money(r._sum.amount), 0);
    const totalExpenses = expData.reduce((s, e) => s + money(e._sum.amount), 0);
    const grossProfit = totalRevenue - totalExpenses;

    const reportData = { revenueBySource: revData, expenseByCategory: expData };
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

    const results = await Promise.all(
      Object.entries(productMap).map(async ([sku, data]) => {
        const cost = totalCostFromPoultry / productCount;
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
      })
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
      orderBy: { balanceDue: "desc" }
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
}
