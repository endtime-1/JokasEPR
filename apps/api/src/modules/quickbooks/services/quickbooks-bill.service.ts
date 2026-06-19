import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus, SupplierInvoiceStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

const SYNCABLE_STATUSES: SupplierInvoiceStatus[] = ["APPROVED", "PAID"];

@Injectable()
export class QuickBooksBillService {
  private readonly logger = new Logger(QuickBooksBillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.BILL_SYNC, triggeredById });
    const bills = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: SYNCABLE_STATUSES },
        qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] }
      },
      include: { supplier: true }
    });

    let succeeded = 0;
    let failed = 0;
    for (const bill of bills) {
      try {
        await this.syncOne(companyId, bill.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync bill ${bill.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: bills.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: bills.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, billId: string): Promise<void> {
    const bill = await this.prisma.supplierInvoice.findFirstOrThrow({
      where: { id: billId, companyId, deletedAt: null },
      include: { supplier: true }
    });

    if (!SYNCABLE_STATUSES.includes(bill.status)) return;
    if (!bill.supplier.qbVendorId) throw new Error(`Vendor "${bill.supplier.name}" not synced to QB`);

    await this.prisma.supplierInvoice.update({ where: { id: billId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const payload = {
        VendorRef: { value: bill.supplier.qbVendorId },
        DocNumber: bill.invoiceNumber,
        TxnDate: bill.invoiceDate.toISOString().split("T")[0],
        DueDate: bill.dueDate?.toISOString().split("T")[0],
        Line: [
          {
            Amount: Number(bill.totalAmount),
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: { AccountRef: { value: "1" } }
          }
        ]
      };

      let qbId = bill.qbBillId;
      if (!qbId) {
        const existing = await this.findQBBillByDocNumber(companyId, bill.invoiceNumber);
        qbId = existing ? existing.Id : await this.createQBBill(companyId, payload);
      }

      await this.prisma.supplierInvoice.update({
        where: { id: billId },
        data: { qbBillId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.supplierInvoice.update({
        where: { id: billId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }

  private async createQBBill(companyId: string, payload: unknown): Promise<string> {
    const resp = await this.client.post<{ Bill: { Id: string } }>(companyId, "bill", payload);
    return resp.Bill.Id;
  }

  private async findQBBillByDocNumber(companyId: string, docNumber: string): Promise<{ Id: string } | null> {
    try {
      const escaped = docNumber.replace(/'/g, "\\'");
      const resp = await this.client.query<{ QueryResponse: { Bill?: Array<{ Id: string }> } }>(companyId, `SELECT Id FROM Bill WHERE DocNumber = '${escaped}'`);
      return resp.QueryResponse.Bill?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
