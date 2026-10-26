import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerCtx, LedgerService } from "./ledger.service";

type SourceResult = { source: string; found: number; alreadyPosted: number; toPost: number; posted: number; blocked: number; failed: number };

/**
 * Posts history that existed before the ledger (invoices, payments, bills, payroll ...) into it.
 * Every event posts at most once (the ledger refuses a second entry for the same event), so this can be
 * run again and again: it only adds what is missing.
 */
@Injectable()
export class LedgerBackfillService {
  private readonly logger = new Logger(LedgerBackfillService.name);

  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async run(ctx: LedgerCtx, commit: boolean) {
    const results: SourceResult[] = [];
    const errors: string[] = [];
    const locked = await this.ledger.lockedThrough(this.prisma, ctx.companyId);

    // Each source: how to list the events, and how to post one.
    const sources: { source: string; load: () => Promise<{ id: string; date: Date }[]>; post: (id: string) => Promise<unknown> }[] = [
      {
        source: "SALES_INVOICE",
        load: async () => (await this.prisma.invoice.findMany({ where: { companyId: ctx.companyId, deletedAt: null, status: { notIn: ["DRAFT", "VOID"] } }, select: { id: true, invoiceDate: true } })).map((r) => ({ id: r.id, date: r.invoiceDate })),
        post: async (id) => {
          const r = await this.prisma.invoice.findUniqueOrThrow({ where: { id }, select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true } });
          return this.ledger.salesInvoice(this.prisma, ctx, r);
        },
      },
      {
        source: "SALES_PAYMENT",
        load: async () => (await this.prisma.payment.findMany({ where: { companyId: ctx.companyId, deletedAt: null, status: "POSTED" }, select: { id: true, paymentDate: true } })).map((r) => ({ id: r.id, date: r.paymentDate })),
        post: async (id) => {
          const r = await this.prisma.payment.findUniqueOrThrow({ where: { id }, select: { id: true, paymentNumber: true, paymentDate: true, amount: true, method: true, invoiceId: true } });
          return this.ledger.customerPayment(this.prisma, ctx, { id: r.id, reference: r.paymentNumber, paymentDate: r.paymentDate, amount: r.amount, method: r.method, invoiceId: r.invoiceId });
        },
      },
      {
        source: "SALES_RETURN",
        load: async () => (await this.prisma.salesReturn.findMany({ where: { companyId: ctx.companyId, deletedAt: null, status: "POSTED" }, select: { id: true, approvedAt: true, createdAt: true } })).map((r) => ({ id: r.id, date: r.approvedAt ?? r.createdAt })),
        post: async (id) => {
          const r = await this.prisma.salesReturn.findUniqueOrThrow({ where: { id }, select: { id: true, totalAmount: true, approvedAt: true, createdAt: true, salesOrderId: true, product: { select: { sku: true } } } });
          // How much of a return reduced a specific invoice was not kept; assume a return tied to a sale reduced its invoice.
          return this.ledger.salesReturn(this.prisma, ctx, { id: r.id, date: r.approvedAt ?? r.createdAt, totalAmount: r.totalAmount, appliedToInvoice: r.salesOrderId ? Number(r.totalAmount) : 0, label: r.product.sku });
        },
      },
      {
        source: "SUPPLIER_INVOICE",
        load: async () => (await this.prisma.supplierInvoice.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, select: { id: true, invoiceDate: true } })).map((r) => ({ id: r.id, date: r.invoiceDate })),
        post: async (id) => {
          const r = await this.prisma.supplierInvoice.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, invoiceDate: true, totalAmount: true } });
          return this.ledger.supplierInvoice(this.prisma, ctx, r);
        },
      },
      {
        source: "PROCUREMENT_PAYMENT",
        load: async () => (await this.prisma.procurementPayment.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, select: { id: true, paymentDate: true } })).map((r) => ({ id: r.id, date: r.paymentDate })),
        post: async (id) => {
          const r = await this.prisma.procurementPayment.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, paymentDate: true, amount: true, paymentMethod: true } });
          return this.ledger.supplierPayment(this.prisma, ctx, { id: r.id, reference: r.reference, paymentDate: r.paymentDate, amount: r.amount, method: r.paymentMethod }, "PROCUREMENT_PAYMENT");
        },
      },
      {
        source: "FIN_SUPPLIER_PAYMENT",
        load: async () => (await this.prisma.supplierPayment.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, select: { id: true, paymentDate: true } })).map((r) => ({ id: r.id, date: r.paymentDate })),
        post: async (id) => {
          const r = await this.prisma.supplierPayment.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, paymentDate: true, amount: true, paymentMethod: true } });
          return this.ledger.supplierPayment(this.prisma, ctx, { id: r.id, reference: r.reference, paymentDate: r.paymentDate, amount: r.amount, method: r.paymentMethod }, "FIN_SUPPLIER_PAYMENT");
        },
      },
      {
        source: "FIN_CUSTOMER_PAYMENT",
        load: async () => (await this.prisma.customerPayment.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, select: { id: true, paymentDate: true } })).map((r) => ({ id: r.id, date: r.paymentDate })),
        post: async (id) => {
          const r = await this.prisma.customerPayment.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, paymentDate: true, amount: true, paymentMethod: true, invoiceId: true } });
          return this.ledger.customerPayment(this.prisma, ctx, { id: r.id, reference: r.reference, paymentDate: r.paymentDate, amount: r.amount, method: r.paymentMethod, invoiceId: r.invoiceId }, "FIN_CUSTOMER_PAYMENT");
        },
      },
      {
        source: "EXPENSE",
        // Procurement payments mirror an Expense row (reference PRC-...); they are already in the books through
        // the supplier bill and payment, so they are left out here to avoid counting them twice.
        load: async () => (await this.prisma.expense.findMany({
          where: { companyId: ctx.companyId, deletedAt: null, NOT: { reference: { startsWith: "PRC-" } }, OR: [{ status: "APPROVED" }, { status: "PENDING", approvalRequired: false }] },
          select: { id: true, expenseDate: true },
        })).map((r) => ({ id: r.id, date: r.expenseDate })),
        post: async (id) => {
          const r = await this.prisma.expense.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, expenseDate: true, amount: true, paymentMethod: true, description: true, category: { select: { accountId: true } } } });
          return this.ledger.expense(this.prisma, ctx, { id: r.id, reference: r.reference, expenseDate: r.expenseDate, amount: r.amount, paymentMethod: r.paymentMethod, accountId: r.category?.accountId, description: r.description });
        },
      },
      {
        source: "PAYROLL_ACCRUAL",
        load: async () => (await this.prisma.payrollRecord.findMany({ where: { companyId: ctx.companyId, deletedAt: null, status: { in: ["APPROVED", "PAID"] } }, select: { id: true, periodEnd: true } })).map((r) => ({ id: r.id, date: r.periodEnd })),
        post: async (id) => {
          const r = await this.prisma.payrollRecord.findUniqueOrThrow({ where: { id } });
          return this.ledger.payrollApproved(this.prisma, ctx, { id: r.id, reference: r.reference, employeeName: r.employeeName, period: r.period, grossPay: r.grossPay, taxDeduction: r.taxDeduction, ssnit: r.ssnit, netPay: r.netPay, date: r.periodEnd });
        },
      },
      {
        source: "PAYROLL_PAYMENT",
        load: async () => (await this.prisma.payrollRecord.findMany({ where: { companyId: ctx.companyId, deletedAt: null, status: "PAID" }, select: { id: true, paymentDate: true, periodEnd: true } })).map((r) => ({ id: r.id, date: r.paymentDate ?? r.periodEnd })),
        post: async (id) => {
          const r = await this.prisma.payrollRecord.findUniqueOrThrow({ where: { id } });
          return this.ledger.payrollPaid(this.prisma, ctx, { id: r.id, reference: r.reference, employeeName: r.employeeName, netPay: r.netPay, paymentDate: r.paymentDate ?? r.periodEnd, paymentMethod: r.paymentMethod });
        },
      },
      {
        source: "PETTY_CASH",
        load: async () => (await this.prisma.pettyCashTransaction.findMany({ where: { companyId: ctx.companyId, deletedAt: null }, select: { id: true, transactionDate: true } })).map((r) => ({ id: r.id, date: r.transactionDate })),
        post: async (id) => {
          const r = await this.prisma.pettyCashTransaction.findUniqueOrThrow({ where: { id }, select: { id: true, reference: true, type: true, amount: true, transactionDate: true, description: true, category: { select: { accountId: true } } } });
          return this.ledger.pettyCash(this.prisma, ctx, { id: r.id, reference: r.reference, type: r.type, amount: r.amount, date: r.transactionDate, accountId: r.category?.accountId, description: r.description });
        },
      },
    ];

    for (const src of sources) {
      const result: SourceResult = { source: src.source, found: 0, alreadyPosted: 0, toPost: 0, posted: 0, blocked: 0, failed: 0 };
      const docs = await src.load();
      result.found = docs.length;
      const done = docs.length
        ? await this.prisma.journalEntry.findMany({ where: { companyId: ctx.companyId, sourceModule: src.source, sourceId: { in: docs.map((d) => d.id) } }, select: { sourceId: true } })
        : [];
      const doneIds = new Set(done.map((d) => d.sourceId));
      const missing = docs.filter((d) => !doneIds.has(d.id));
      result.alreadyPosted = docs.length - missing.length;
      for (const d of missing) {
        // Events dated inside a closed period cannot be added: closing the books means those months are final.
        if (locked && d.date.getTime() <= locked.getTime() + 86400000 - 1) { result.blocked += 1; continue; }
        result.toPost += 1;
        if (!commit) continue;
        try {
          await src.post(d.id);
          result.posted += 1;
        } catch (err) {
          result.failed += 1;
          if (errors.length < 20) errors.push(`${src.source} ${d.id}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
      results.push(result);
    }

    const total = results.reduce((s, r) => s + (commit ? r.posted : r.toPost), 0);
    return { committed: commit, total, sources: results, errors };
  }
}
