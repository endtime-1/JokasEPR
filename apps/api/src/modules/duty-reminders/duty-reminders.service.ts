import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/dto/notifications.dto";

@Injectable()
export class DutyRemindersService {
  private readonly logger = new Logger(DutyRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── 10 AM: morning duty reminder ─────────────────────────────────────────
  // Fires every day at 10:00. Checks egg collection, feed record, and
  // mortality record. If a farm hasn't submitted any of these, notify users
  // who have access to that farm.

  @Cron("0 10 * * *", { timeZone: "Africa/Accra" })
  async morningReminder() {
    this.logger.log("Running morning duty reminder check");
    await this.remindForDuties("MORNING", [
      "Egg Collection",
      "Feed Record",
      "Mortality Record",
    ]);
  }

  // ── 6 PM: evening duty reminder ──────────────────────────────────────────
  // Fires every day at 18:00. Checks daily poultry summary.

  @Cron("0 18 * * *", { timeZone: "Africa/Accra" })
  async eveningReminder() {
    this.logger.log("Running evening duty reminder check");
    await this.remindForDuties("EVENING", ["Daily Poultry Summary"]);
  }

  // ── Core logic ────────────────────────────────────────────────────────────

  private async remindForDuties(slot: "MORNING" | "EVENING", dutyNames: string[]) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };

    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      try {
        await this.processCompany(company.id, slot, dutyNames, dateRange);
      } catch (err) {
        this.logger.error(`Duty reminder failed for company ${company.id}: ${err}`);
      }
    }
  }

  private async processCompany(
    companyId: string,
    slot: "MORNING" | "EVENING",
    dutyNames: string[],
    dateRange: { gte: Date; lt: Date },
  ) {
    const allFarms = await this.prisma.farm.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (allFarms.length === 0) return;

    // Determine which farms have any pending duties
    const [eggFarms, feedFarms, mortalityFarms, dailyFarms] = await Promise.all([
      slot === "MORNING"
        ? this.prisma.eggProductionRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } })
        : [],
      slot === "MORNING"
        ? this.prisma.feedConsumptionRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } })
        : [],
      slot === "MORNING"
        ? this.prisma.mortalityRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } })
        : [],
      slot === "EVENING"
        ? this.prisma.dailyPoultryRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } })
        : [],
    ]);

    const eggDone = new Set((eggFarms as { farmId: string }[]).map((r) => r.farmId));
    const feedDone = new Set((feedFarms as { farmId: string }[]).map((r) => r.farmId));
    const mortalityDone = new Set((mortalityFarms as { farmId: string }[]).map((r) => r.farmId));
    const dailyDone = new Set((dailyFarms as { farmId: string }[]).map((r) => r.farmId));

    const pendingFarmIds = allFarms
      .filter((f) => {
        if (slot === "MORNING") {
          return !eggDone.has(f.id) || !feedDone.has(f.id) || !mortalityDone.has(f.id);
        }
        return !dailyDone.has(f.id);
      })
      .map((f) => f.id);

    if (pendingFarmIds.length === 0) return;

    // Find users with access to any pending farm — deduplicated by userId
    const accesses = await this.prisma.userFarmAccess.findMany({
      where: { companyId, farmId: { in: pendingFarmIds } },
      select: { userId: true },
      distinct: ["userId"],
    });

    const title = slot === "MORNING" ? "⏰ Morning duties pending" : "⏰ Evening duty pending";
    const body =
      slot === "MORNING"
        ? `${pendingFarmIds.length} farm${pendingFarmIds.length !== 1 ? "s" : ""} still need today's ${dutyNames.join(", ")}. Please complete before end of day.`
        : `${pendingFarmIds.length} farm${pendingFarmIds.length !== 1 ? "s" : ""} still need today's Daily Poultry Summary. Please complete before end of day.`;

    await Promise.allSettled(
      accesses.map((a) =>
        this.notifications.send({
          companyId,
          userId: a.userId,
          type: NotificationType.TASK_ASSIGNED,
          title,
          body,
          entityType: "DutyReminder",
          metadata: { slot, pendingFarmCount: pendingFarmIds.length, duties: dutyNames },
        }),
      ),
    );

    this.logger.log(`Sent ${slot} reminders to ${accesses.length} users in company ${companyId}`);
  }

  // ── 3 AM: purge expired login rate-limit windows ─────────────────────────
  @Cron("0 3 * * *", { timeZone: "Africa/Accra" })
  async purgeExpiredRateLimitWindows() {
    const { count } = await this.prisma.loginRateLimit.deleteMany({
      where: { windowEnd: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Purged ${count} expired LoginRateLimit row(s)`);
  }
}
