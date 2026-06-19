import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";
import { QuickBooksCustomerService } from "./quickbooks-customer.service";
import { QuickBooksVendorService } from "./quickbooks-vendor.service";
import { QuickBooksItemService } from "./quickbooks-item.service";
import { QuickBooksInvoiceService } from "./quickbooks-invoice.service";
import { QuickBooksPaymentService } from "./quickbooks-payment.service";
import { QuickBooksBillService } from "./quickbooks-bill.service";
import { QuickBooksExpenseService } from "./quickbooks-expense.service";

export type SyncEntity = "customers" | "vendors" | "items" | "invoices" | "payments" | "bills" | "expenses";

@Injectable()
export class QuickBooksSyncService {
  private readonly logger = new Logger(QuickBooksSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qbLogger: QuickBooksLoggerService,
    private readonly customerSvc: QuickBooksCustomerService,
    private readonly vendorSvc: QuickBooksVendorService,
    private readonly itemSvc: QuickBooksItemService,
    private readonly invoiceSvc: QuickBooksInvoiceService,
    private readonly paymentSvc: QuickBooksPaymentService,
    private readonly billSvc: QuickBooksBillService,
    private readonly expenseSvc: QuickBooksExpenseService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.FULL_SYNC, triggeredById });
    this.logger.log(`Starting full sync for company ${companyId}`);

    try {
      await this.customerSvc.syncAll(companyId, triggeredById);
      await this.vendorSvc.syncAll(companyId, triggeredById);
      await this.itemSvc.syncAll(companyId, triggeredById);
      await this.invoiceSvc.syncAll(companyId, triggeredById);
      await this.paymentSvc.syncAll(companyId, triggeredById);
      await this.billSvc.syncAll(companyId, triggeredById);
      await this.expenseSvc.syncAll(companyId, triggeredById);
      await this.qbLogger.succeed(logId, { recordsProcessed: 1 });
      this.logger.log(`Full sync completed for company ${companyId}`);
    } catch (err) {
      await this.qbLogger.fail(logId, (err as Error).message);
      this.logger.error(`Full sync failed for company ${companyId}: ${(err as Error).message}`);
    }
  }

  async syncEntity(companyId: string, entity: SyncEntity, triggeredById?: string): Promise<void> {
    switch (entity) {
      case "customers": return this.customerSvc.syncAll(companyId, triggeredById);
      case "vendors": return this.vendorSvc.syncAll(companyId, triggeredById);
      case "items": return this.itemSvc.syncAll(companyId, triggeredById);
      case "invoices": return this.invoiceSvc.syncAll(companyId, triggeredById);
      case "payments": return this.paymentSvc.syncAll(companyId, triggeredById);
      case "bills": return this.billSvc.syncAll(companyId, triggeredById);
      case "expenses": return this.expenseSvc.syncAll(companyId, triggeredById);
    }
  }

  async syncRecord(companyId: string, entity: SyncEntity, recordId: string): Promise<void> {
    switch (entity) {
      case "customers": return this.customerSvc.syncOne(companyId, recordId);
      case "vendors": return this.vendorSvc.syncOne(companyId, recordId);
      case "items": return this.itemSvc.syncOne(companyId, recordId);
      case "invoices": return this.invoiceSvc.syncOne(companyId, recordId);
      case "payments": return this.paymentSvc.syncOne(companyId, recordId);
      case "bills": return this.billSvc.syncOne(companyId, recordId);
      case "expenses": return this.expenseSvc.syncOne(companyId, recordId);
    }
  }

  async retryFailedRecord(companyId: string, entityType: string, entityId: string): Promise<void> {
    const entity = entityType.toLowerCase() as SyncEntity;
    await this.syncRecord(companyId, entity, entityId);
  }

  async getStats(companyId: string) {
    const [customers, suppliers, products, invoices, payments, bills, expenses] = await Promise.all([
      this.prisma.customer.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.supplier.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.product.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.invoice.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.payment.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.supplierInvoice.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } }),
      this.prisma.expense.groupBy({ by: ["qbSyncStatus"], where: { companyId, deletedAt: null }, _count: { id: true } })
    ]);

    const toMap = (rows: { qbSyncStatus: QBSyncStatus; _count: { id: number } }[]) =>
      Object.fromEntries(rows.map((r) => [r.qbSyncStatus, r._count.id]));

    return {
      customers: toMap(customers),
      suppliers: toMap(suppliers),
      products: toMap(products),
      invoices: toMap(invoices),
      payments: toMap(payments),
      bills: toMap(bills),
      expenses: toMap(expenses)
    };
  }
}
