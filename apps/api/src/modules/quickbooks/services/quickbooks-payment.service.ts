import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

@Injectable()
export class QuickBooksPaymentService {
  private readonly logger = new Logger(QuickBooksPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.PAYMENT_SYNC, triggeredById });
    const payments = await this.prisma.payment.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: "POSTED",
        qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] }
      },
      include: { customer: true, invoice: true }
    });

    let succeeded = 0;
    let failed = 0;
    for (const payment of payments) {
      try {
        await this.syncOne(companyId, payment.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync payment ${payment.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: payments.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: payments.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirstOrThrow({
      where: { id: paymentId, companyId, deletedAt: null },
      include: { customer: true, invoice: true }
    });

    if (payment.status !== "POSTED") return;
    if (!payment.customer.qbCustomerId) throw new Error(`Customer "${payment.customer.name}" not synced to QB`);

    await this.prisma.payment.update({ where: { id: paymentId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const payload: Record<string, unknown> = {
        CustomerRef: { value: payment.customer.qbCustomerId },
        TotalAmt: Number(payment.amount),
        TxnDate: payment.paymentDate.toISOString().split("T")[0]
      };

      if (payment.invoice?.qbInvoiceId) {
        payload.Line = [{ Amount: Number(payment.amount), LinkedTxn: [{ TxnId: payment.invoice.qbInvoiceId, TxnType: "Invoice" }] }];
      }

      let qbId = payment.qbPaymentId;
      if (!qbId) {
        const resp = await this.client.post<{ Payment: { Id: string } }>(companyId, "payment", payload);
        qbId = resp.Payment.Id;
      }

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { qbPaymentId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }
}
