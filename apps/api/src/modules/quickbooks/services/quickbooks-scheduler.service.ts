import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksSyncService } from "./quickbooks-sync.service";

@Injectable()
export class QuickBooksSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(QuickBooksSchedulerService.name);
  private dailySyncTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: QuickBooksSyncService
  ) {}

  onModuleInit() {
    this.scheduleDailySync();
    this.scheduleRetryFailed();
  }

  private scheduleDailySync() {
    const msUntilNextRun = this.msUntil(2, 0);
    this.dailySyncTimer = setTimeout(() => {
      this.runDailySync();
      // Re-schedule every 24 hours
      this.dailySyncTimer = setInterval(() => this.runDailySync(), 24 * 60 * 60 * 1000);
    }, msUntilNextRun);
    this.logger.log(`Daily sync scheduled in ${Math.round(msUntilNextRun / 60000)} minutes`);
  }

  private scheduleRetryFailed() {
    // Retry failed syncs every hour
    this.retryTimer = setInterval(() => this.runRetryFailed(), 60 * 60 * 1000);
  }

  private async runDailySync(): Promise<void> {
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

  private async runRetryFailed(): Promise<void> {
    this.logger.debug("Running QB failed-sync retry");
    try {
      // Retry customers
      const failedCustomers = await this.prisma.customer.findMany({ where: { qbSyncStatus: "FAILED", deletedAt: null }, take: 20 });
      for (const c of failedCustomers) {
        await this.syncService.syncRecord(c.companyId, "customers", c.id).catch(() => undefined);
      }
      // Retry invoices
      const failedInvoices = await this.prisma.invoice.findMany({ where: { qbSyncStatus: "FAILED", deletedAt: null }, take: 20 });
      for (const inv of failedInvoices) {
        await this.syncService.syncRecord(inv.companyId, "invoices", inv.id).catch(() => undefined);
      }
    } catch (err) {
      this.logger.error("QB retry-failed error", (err as Error).message);
    }
  }

  private msUntil(hour: number, minute: number): number {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }
}
