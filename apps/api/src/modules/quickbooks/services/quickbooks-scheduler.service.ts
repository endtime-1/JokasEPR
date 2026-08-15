import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksSyncService } from "./quickbooks-sync.service";

@Injectable()
export class QuickBooksSchedulerService {
  private readonly logger = new Logger(QuickBooksSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: QuickBooksSyncService
  ) {}

  @Cron("0 2 * * *")
  async runDailySync(): Promise<void> {
    this.logger.log("Running scheduled daily QuickBooks sync");
    try {
      const activeConnections = await this.prisma.quickBooksConnection.findMany({ where: { isActive: true } });
      for (const conn of activeConnections) {
        await this.syncService.syncAll(conn.companyId).catch((err: unknown) =>
          this.logger.error(`Scheduled sync failed for company ${conn.companyId}`, (err as Error).message)
        );
      }
    } catch (err) {
      this.logger.error("Scheduled daily sync error", (err as Error).message);
    }
  }

  @Cron("0 */4 * * *")
  async runRetryFailed(): Promise<void> {
    this.logger.debug("Running QB failed-sync retry");
    try {
      // L-BACK: the retry cap used to be a single take:20 across every
      // company sharing this Nest instance — one company's backlog of
      // failed syncs could starve every other company's retries. Scope the
      // cap per active connection instead, same iteration shape
      // runDailySync above already uses.
      const activeConnections = await this.prisma.quickBooksConnection.findMany({ where: { isActive: true } });
      for (const conn of activeConnections) {
        const failedCustomers = await this.prisma.customer.findMany({ where: { companyId: conn.companyId, qbSyncStatus: "FAILED", deletedAt: null }, take: 20 });
        for (const c of failedCustomers) {
          await this.syncService.syncRecord(c.companyId, "customers", c.id).catch((err: unknown) =>
            this.logger.warn(`QB retry customer ${c.id}: ${(err as Error).message}`)
          );
        }
        const failedInvoices = await this.prisma.invoice.findMany({ where: { companyId: conn.companyId, qbSyncStatus: "FAILED", deletedAt: null }, take: 20 });
        for (const inv of failedInvoices) {
          await this.syncService.syncRecord(inv.companyId, "invoices", inv.id).catch((err: unknown) =>
            this.logger.warn(`QB retry invoice ${inv.id}: ${(err as Error).message}`)
          );
        }
      }
    } catch (err) {
      this.logger.error("QB retry-failed error", (err as Error).message);
    }
  }
}
