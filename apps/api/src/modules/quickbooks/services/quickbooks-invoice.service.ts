import { Injectable, Logger } from "@nestjs/common";
import { InvoiceStatus, QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

const SYNCABLE_STATUSES: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"];

@Injectable()
export class QuickBooksInvoiceService {
  private readonly logger = new Logger(QuickBooksInvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.INVOICE_SYNC, triggeredById });
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: SYNCABLE_STATUSES },
        qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] }
      },
      include: { customer: true }
    });

    let succeeded = 0;
    let failed = 0;
    for (const invoice of invoices) {
      try {
        await this.syncOne(companyId, invoice.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync invoice ${invoice.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: invoices.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: invoices.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirstOrThrow({
      where: { id: invoiceId, companyId, deletedAt: null },
      include: { customer: true }
    });

    if (!SYNCABLE_STATUSES.includes(invoice.status)) {
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { qbSyncStatus: "SKIPPED" as QBSyncStatus } });
      return;
    }

    if (!invoice.customer.qbCustomerId) {
      throw new Error(`Customer "${invoice.customer.name}" has not been synced to QuickBooks yet`);
    }

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const payload = {
        CustomerRef: { value: invoice.customer.qbCustomerId },
        DocNumber: invoice.invoiceNumber,
        TxnDate: invoice.invoiceDate.toISOString().split("T")[0],
        DueDate: invoice.dueDate?.toISOString().split("T")[0],
        Line: [
          {
            Amount: Number(invoice.totalAmount),
            DetailType: "DescriptionOnly",
            DescriptionOnlyLineDetail: { Description: `Invoice ${invoice.invoiceNumber}` }
          }
        ]
      };

      let qbId = invoice.qbInvoiceId;
      if (qbId) {
        try {
          const existing = await this.client.get<{ Invoice: { Id: string; SyncToken: string } }>(companyId, `invoice/${qbId}`);
          await this.client.post(companyId, "invoice", { ...payload, Id: qbId, SyncToken: existing.Invoice.SyncToken, sparse: true });
        } catch {
          qbId = await this.createQBInvoice(companyId, payload);
        }
      } else {
        const existing = await this.findQBInvoiceByDocNumber(companyId, invoice.invoiceNumber);
        qbId = existing ? existing.Id : await this.createQBInvoice(companyId, payload);
      }

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { qbInvoiceId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }

  private async createQBInvoice(companyId: string, payload: unknown): Promise<string> {
    const resp = await this.client.post<{ Invoice: { Id: string } }>(companyId, "invoice", payload);
    return resp.Invoice.Id;
  }

  private async findQBInvoiceByDocNumber(companyId: string, docNumber: string): Promise<{ Id: string } | null> {
    try {
      const escaped = docNumber.replace(/'/g, "\\'");
      const resp = await this.client.query<{ QueryResponse: { Invoice?: Array<{ Id: string }> } }>(companyId, `SELECT Id FROM Invoice WHERE DocNumber = '${escaped}'`);
      return resp.QueryResponse.Invoice?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
