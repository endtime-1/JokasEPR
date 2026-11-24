import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { FinIntegrationsService } from "./fin-integrations.service";

/**
 * Pulls newly approved orders into finance as drafts, every 5 minutes. It does nothing for a company until that company has
 * switched the link on. Safe to run twice at once (one draft per order is enforced by the database).
 * FIN_JOBS_DISABLED=1 switches it off, like the other finance jobs.
 */
@Injectable()
export class FinIntegrationsScheduler {
  private readonly logger = new Logger(FinIntegrationsScheduler.name);

  constructor(private readonly integrations: FinIntegrationsService) {}

  @Cron("*/5 * * * *", { timeZone: "Africa/Accra" })
  async pull() {
    if (process.env.FIN_JOBS_DISABLED === "1") return;
    try {
      await this.integrations.syncAll();
    } catch (err) {
      this.logger.error(`Link sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
