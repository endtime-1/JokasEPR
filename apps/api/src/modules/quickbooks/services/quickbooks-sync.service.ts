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

  // C5: none of the three trigger paths into this service (the 2am full-sync
  // cron, the 4-hourly failed-retry cron, and the user-facing "Sync Now"
  // button, which is literal fire-and-forget with nothing stopping repeated
  // clicks) coordinated with each other at all, and no qbXxxId column is
  // unique at the DB layer — two overlapping syncs for the same company
  // could both see a record as "not yet synced" and both create it in
  // QuickBooks, producing a real duplicate financial record. A per-company
  // lock (same atomic-create-wins pattern used by the rate-limit guards and
  // the duty-reminders cron lock) makes only one sync able to run for a
  // given company at a time; a call that loses the race no-ops instead of
  // proceeding.
  private async acquireSyncLock(companyId: string, ttlMs = 10 * 60_000): Promise<boolean> {
    const key = `qb-sync-lock:${companyId}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + ttlMs);
    try {
      await this.prisma.loginRateLimit.create({ data: { key, attempts: 1, windowEnd } });
      return true;
    } catch {
      const reclaimed = await this.prisma.loginRateLimit
        .updateMany({ where: { key, windowEnd: { lte: now } }, data: { windowEnd } })
        .catch(() => ({ count: 0 }));
      return reclaimed.count > 0;
    }
  }

  private async releaseSyncLock(companyId: string): Promise<void> {
    await this.prisma.loginRateLimit.deleteMany({ where: { key: `qb-sync-lock:${companyId}` } }).catch(() => undefined);
  }

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    if (!(await this.acquireSyncLock(companyId))) {
      this.logger.warn(`Skipped full sync for company ${companyId} — another sync is already in progress`);
      return;
    }

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
    } finally {
      await this.releaseSyncLock(companyId);
    }
  }

  private static readonly ENTITY_OPERATIONS: Record<SyncEntity, QBSyncOperation> = {
    customers: QBSyncOperation.CUSTOMER_SYNC,
    vendors: QBSyncOperation.VENDOR_SYNC,
    items: QBSyncOperation.ITEM_SYNC,
    invoices: QBSyncOperation.INVOICE_SYNC,
    payments: QBSyncOperation.PAYMENT_SYNC,
    bills: QBSyncOperation.BILL_SYNC,
    expenses: QBSyncOperation.EXPENSE_SYNC
  };

  // High (DB stability audit, 2026-08-16): this used to have no catch block
  // at all — the controller's "Sync Now" button fires it via
  // `setImmediate(...).catch(() => undefined)`, so any failure here (QB API
  // down, token expired, a single bad record) vanished with zero
  // operator-visible trace, while its sibling syncAll three lines away
  // correctly logged to quickBooksSyncLog. Now mirrors syncAll exactly: the
  // same connection-active check, a real log row, and the failure recorded
  // before it's swallowed upstream.
  async syncEntity(companyId: string, entity: SyncEntity, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    if (!(await this.acquireSyncLock(companyId))) {
      this.logger.warn(`Skipped ${entity} sync for company ${companyId} — another sync is already in progress`);
      return;
    }

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QuickBooksSyncService.ENTITY_OPERATIONS[entity], triggeredById, entityType: entity });
    try {
      switch (entity) {
        case "customers": await this.customerSvc.syncAll(companyId, triggeredById); break;
        case "vendors": await this.vendorSvc.syncAll(companyId, triggeredById); break;
        case "items": await this.itemSvc.syncAll(companyId, triggeredById); break;
        case "invoices": await this.invoiceSvc.syncAll(companyId, triggeredById); break;
        case "payments": await this.paymentSvc.syncAll(companyId, triggeredById); break;
        case "bills": await this.billSvc.syncAll(companyId, triggeredById); break;
        case "expenses": await this.expenseSvc.syncAll(companyId, triggeredById); break;
      }
      await this.qbLogger.succeed(logId, { recordsProcessed: 1 });
    } catch (err) {
      await this.qbLogger.fail(logId, (err as Error).message);
      this.logger.error(`${entity} sync failed for company ${companyId}: ${(err as Error).message}`);
    } finally {
      await this.releaseSyncLock(companyId);
    }
  }

  async syncRecord(companyId: string, entity: SyncEntity, recordId: string): Promise<void> {
    if (!(await this.acquireSyncLock(companyId))) {
      this.logger.warn(`Skipped ${entity} record sync for company ${companyId} — another sync is already in progress`);
      return;
    }
    try {
      switch (entity) {
        case "customers": return await this.customerSvc.syncOne(companyId, recordId);
        case "vendors": return await this.vendorSvc.syncOne(companyId, recordId);
        case "items": return await this.itemSvc.syncOne(companyId, recordId);
        case "invoices": return await this.invoiceSvc.syncOne(companyId, recordId);
        case "payments": return await this.paymentSvc.syncOne(companyId, recordId);
        case "bills": return await this.billSvc.syncOne(companyId, recordId);
        case "expenses": return await this.expenseSvc.syncOne(companyId, recordId);
      }
    } finally {
      await this.releaseSyncLock(companyId);
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
