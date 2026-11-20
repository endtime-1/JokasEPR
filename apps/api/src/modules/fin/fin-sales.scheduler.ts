import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { FinQuotesService } from "./fin-quotes.service";
import { FinRecurringService } from "./fin-recurring.service";
import { FinReminderService } from "./fin-reminders.service";

/**
 * Daily finance jobs, in Ghana time. The API runs as a single process, and every job is also safe to run twice:
 * recurring runs are unique per (schedule, date), reminders are unique per (invoice, step, channel), and expiry is a plain update.
 * Set FIN_JOBS_DISABLED=1 to switch them all off (for example on a staging copy of the database).
 */
@Injectable()
export class FinSalesScheduler {
  private readonly logger = new Logger(FinSalesScheduler.name);

  constructor(
    private readonly recurring: FinRecurringService,
    private readonly reminders: FinReminderService,
    private readonly quotes: FinQuotesService
  ) {}

  private get disabled() {
    return process.env.FIN_JOBS_DISABLED === "1";
  }

  @Cron("30 5 * * *", { timeZone: "Africa/Accra" })
  async expireQuotes() {
    if (this.disabled) return;
    try {
      const n = await this.quotes.expireDue();
      if (n) this.logger.log(`Expired ${n} quote(s).`);
    } catch (err) {
      this.logger.error(`Quote expiry failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  @Cron("0 6 * * *", { timeZone: "Africa/Accra" })
  async runRecurring() {
    if (this.disabled) return;
    try {
      const r = await this.recurring.runDue();
      if (r.created || r.failed) this.logger.log(`Recurring invoices: ${r.created} created, ${r.sent} sent, ${r.failed} problem(s).`);
    } catch (err) {
      this.logger.error(`Recurring invoices failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  @Cron("0 9 * * *", { timeZone: "Africa/Accra" })
  async sendReminders() {
    if (this.disabled) return;
    try {
      const r = await this.reminders.run();
      if (r.sent || r.failed) this.logger.log(`Overdue reminders: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed.`);
    } catch (err) {
      this.logger.error(`Overdue reminders failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
