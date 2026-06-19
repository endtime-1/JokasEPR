import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";
import { QuickBooksMappingService } from "./quickbooks-mapping.service";

@Injectable()
export class QuickBooksExpenseService {
  private readonly logger = new Logger(QuickBooksExpenseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService,
    private readonly mappingService: QuickBooksMappingService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.EXPENSE_SYNC, triggeredById });
    const expenses = await this.prisma.expense.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: "APPROVED",
        qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] }
      },
      include: { category: true }
    });

    let succeeded = 0;
    let failed = 0;
    for (const expense of expenses) {
      try {
        await this.syncOne(companyId, expense.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync expense ${expense.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: expenses.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: expenses.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, expenseId: string): Promise<void> {
    const expense = await this.prisma.expense.findFirstOrThrow({
      where: { id: expenseId, companyId, deletedAt: null },
      include: { category: true }
    });

    if (expense.status !== "APPROVED") return;

    await this.prisma.expense.update({ where: { id: expenseId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const accountRef = await this.mappingService.getQBAccountForCategory(companyId, expense.categoryId);

      const payload = {
        TxnDate: expense.expenseDate.toISOString().split("T")[0],
        PaymentType: expense.paymentMethod === "CASH" ? "Cash" : "Check",
        EntityRef: expense.vendorName ? undefined : undefined,
        Line: [
          {
            Amount: Number(expense.amount),
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: accountRef ?? "1" },
              ...(expense.vendorName && { Description: expense.description })
            }
          }
        ]
      };

      let qbId = expense.qbExpenseId;
      if (!qbId) {
        const resp = await this.client.post<{ Purchase: { Id: string } }>(companyId, "purchase", payload);
        qbId = resp.Purchase.Id;
      }

      await this.prisma.expense.update({
        where: { id: expenseId },
        data: { qbExpenseId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.expense.update({
        where: { id: expenseId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }
}
