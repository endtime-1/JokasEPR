import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/dto/notifications.dto";
import { startOfTodayAccra } from "../../common/utils/timezone";

@Injectable()
export class DutyRemindersService {
  private readonly logger = new Logger(DutyRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // L2: every job below runs on a single PM2 instance today, so this is
  // currently harmless — but nothing stopped two instances from both firing
  // the same job and double-sending reminder/vaccination/withdrawal
  // notifications if this app is ever scaled horizontally. Piggybacks on
  // the existing unique-keyed LoginRateLimit table as a lightweight
  // distributed lock (same atomic-create-wins pattern as the rate limit
  // guards) rather than adding a new table/migration for a defense-in-depth
  // fix. A stale lock (crashed instance) self-heals after ttlMs since every
  // job here runs at most once a day.
  private async acquireCronLock(name: string, ttlMs = 15 * 60_000): Promise<boolean> {
    const key = `cron-lock:${name}`;
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

  // ── 10 AM: morning duty reminder ─────────────────────────────────────────
  // Fires every day at 10:00. Checks egg collection, feed record, and
  // mortality record. If a farm hasn't submitted any of these, notify users
  // who have access to that farm.

  @Cron("0 10 * * *", { timeZone: "Africa/Accra" })
  async morningReminder(companyId?: string) {
    // H16: companyId is only ever passed by the manual /duty-reminders/trigger
    // endpoint (see below) — the scheduled cron always calls this with no
    // argument, which still means "every company," as before. A distinct
    // lock key for the scoped case keeps a manual single-tenant trigger from
    // contending with (or blocking) the global scheduled run's lock.
    if (!(await this.acquireCronLock(companyId ? `morningReminder:${companyId}` : "morningReminder"))) return;
    this.logger.log(`Running morning duty reminder check${companyId ? ` for company ${companyId}` : ""}`);
    await this.remindForDuties("MORNING", [
      "Egg Collection",
      "Feed Record",
      "Mortality Record",
    ], companyId);
  }

  // ── 6 PM: evening duty reminder ──────────────────────────────────────────
  // Fires every day at 18:00. Checks daily poultry summary.

  @Cron("0 18 * * *", { timeZone: "Africa/Accra" })
  async eveningReminder(companyId?: string) {
    if (!(await this.acquireCronLock(companyId ? `eveningReminder:${companyId}` : "eveningReminder"))) return;
    this.logger.log(`Running evening duty reminder check${companyId ? ` for company ${companyId}` : ""}`);
    await this.remindForDuties("EVENING", ["Daily Poultry Summary"], companyId);
  }

  // ── Core logic ────────────────────────────────────────────────────────────

  private async remindForDuties(slot: "MORNING" | "EVENING", dutyNames: string[], companyId?: string) {
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight — this cron is about "today" for Ghana staff, not wherever the host's TZ happens to be
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const dateRange = { gte: todayStart, lt: todayEnd };

    // H16: /duty-reminders/trigger only ever required PLATFORM_MANAGE — a
    // normal per-company admin permission — but this used to always query
    // every company in the deployment regardless of who called it, letting
    // any tenant's admin trigger notification spam and processing load
    // against every OTHER tenant too. companyId (passed only by the manual
    // trigger path) scopes this to the caller's own company; the scheduled
    // cron omits it and still processes every company, as intended.
    let companies: { id: string; name: string }[];
    try {
      companies = await this.prisma.company.findMany({
        where: { deletedAt: null, ...(companyId ? { id: companyId } : {}) },
        select: { id: true, name: true },
      });
    } catch (err) {
      this.logger.warn(`remindForDuties (${slot}): skipped — DB unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

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
    if (!(await this.acquireCronLock("purgeExpiredRateLimitWindows"))) return;
    try {
      const { count } = await this.prisma.loginRateLimit.deleteMany({
        where: { windowEnd: { lt: new Date() } },
      });
      if (count > 0) this.logger.log(`Purged ${count} expired LoginRateLimit row(s)`);
    } catch (err) {
      this.logger.warn("purgeExpiredRateLimitWindows: skipped — " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── 3:30 AM: transition expired stock reservations to EXPIRED status ──────
  @Cron("30 3 * * *", { timeZone: "Africa/Accra" })
  async expireStockReservations() {
    if (!(await this.acquireCronLock("expireStockReservations"))) return;
    try {
      const { count } = await this.prisma.stockReservation.updateMany({
        where: { status: "ACTIVE", expiresAt: { lt: new Date() }, deletedAt: null },
        data: { status: "EXPIRED" },
      });
      if (count > 0) this.logger.log(`Expired ${count} stock reservation(s)`);
    } catch (err) {
      this.logger.warn("expireStockReservations: skipped — " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── 8 AM on 1st of month: alert HR managers about certificates expiring within 30 days ─
  @Cron("0 8 1 * *", { timeZone: "Africa/Accra" })
  async certificateExpiryAlert() {
    if (!(await this.acquireCronLock("certificateExpiryAlert"))) return;
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 3_600_000);
      const expiring = await this.prisma.trainingRecord.findMany({
        where: { certificateExpiry: { gte: now, lte: in30 }, deletedAt: null },
        include: { employee: { select: { companyId: true, fullName: true } } },
      });

      const byCompany = new Map<string, string[]>();
      for (const rec of expiring) {
        const cid = (rec as any).employee?.companyId;
        if (!cid) continue;
        const list = byCompany.get(cid) ?? [];
        list.push(`${(rec as any).employee.fullName} — ${rec.title}`);
        byCompany.set(cid, list);
      }

      // H26: this loop used to share the outer try/catch with the query
      // above — one company's broadcast throwing (a transient DB deadlock,
      // a user deleted mid-loop) silently killed every remaining company's
      // alert for that run, with only one warning log line and no way to
      // tell "sent" from "skipped." Isolated per-company now, matching how
      // remindForDuties()/processCompany() already isolate failures above.
      let notified = 0;
      for (const [companyId, names] of byCompany) {
        const body = `${names.length} certificate(s) expiring within 30 days:\n${names.slice(0, 10).join("\n")}${names.length > 10 ? `\n…and ${names.length - 10} more` : ""}`;
        try {
          await this.notifications.broadcast(companyId, "HR_MANAGE", {
            type: "DOCUMENT_EXPIRY_ALERT" as never,
            title: "Certificate Expiry Alert",
            body,
            entityType: "TrainingRecord",
          });
          notified++;
        } catch (err) {
          this.logger.error(`certificateExpiryAlert: failed to notify company ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (expiring.length > 0) this.logger.log(`certificateExpiryAlert: notified ${notified}/${byCompany.size} company/ies for ${expiring.length} certificate(s)`);
    } catch (err) {
      this.logger.warn("certificateExpiryAlert: skipped — " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── Public: today's duty status per farm ─────────────────────────────────
  async getTodayStatus(companyId: string) {
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight
    const dateRange = { gte: todayStart, lt: new Date(todayStart.getTime() + 86_400_000) };

    const [farms, eggs, feed, mortality, daily] = await Promise.all([
      this.prisma.farm.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.eggProductionRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.feedConsumptionRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.mortalityRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
      this.prisma.dailyPoultryRecord.findMany({ where: { companyId, recordDate: dateRange }, distinct: ["farmId"], select: { farmId: true } }),
    ]);

    const eggDone = new Set(eggs.map((r) => r.farmId));
    const feedDone = new Set(feed.map((r) => r.farmId));
    const mortalityDone = new Set(mortality.map((r) => r.farmId));
    const dailyDone = new Set(daily.map((r) => r.farmId));

    const statuses = farms.map((f) => ({
      farmId: f.id,
      farmName: f.name,
      morning: {
        eggCollection: eggDone.has(f.id),
        feedRecord: feedDone.has(f.id),
        mortalityRecord: mortalityDone.has(f.id),
        complete: eggDone.has(f.id) && feedDone.has(f.id) && mortalityDone.has(f.id),
      },
      evening: {
        dailySummary: dailyDone.has(f.id),
        complete: dailyDone.has(f.id),
      },
    }));

    const pending = statuses.filter((s) => !s.morning.complete || !s.evening.complete).length;
    return { data: { date: todayStart.toISOString().slice(0, 10), farms: statuses, pendingFarms: pending, totalFarms: farms.length } };
  }

  // ── 7 AM daily: vaccination due-date reminders ───────────────────────────
  // Finds VaccinationRecords with nextDueDate within 7 days and notifies
  // POULTRY_MANAGE users per company.
  @Cron("0 7 * * *", { timeZone: "Africa/Accra" })
  async vaccinationDueDateReminder() {
    if (!(await this.acquireCronLock("vaccinationDueDateReminder"))) return;
    try {
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 24 * 3_600_000);
      const due = await this.prisma.vaccinationRecord.findMany({
        where: { nextDueDate: { gte: now, lte: in7 }, deletedAt: null },
        include: { flockBatch: { select: { companyId: true, code: true, name: true } } },
      });

      const byCompany = new Map<string, { batchCode: string; vaccineName: string; dueDate: Date }[]>();
      for (const rec of due) {
        const cid = rec.flockBatch?.companyId;
        if (!cid) continue;
        const list = byCompany.get(cid) ?? [];
        list.push({ batchCode: rec.flockBatch!.code, vaccineName: rec.vaccineName, dueDate: rec.nextDueDate! });
        byCompany.set(cid, list);
      }

      // H26: isolated per-company — see certificateExpiryAlert above for why.
      let notified = 0;
      for (const [companyId, items] of byCompany) {
        const body = `${items.length} vaccination(s) due within 7 days:\n` +
          items.slice(0, 10).map((i) => `${i.batchCode} — ${i.vaccineName} (due ${i.dueDate.toISOString().slice(0, 10)})`).join("\n") +
          (items.length > 10 ? `\n…and ${items.length - 10} more` : "");
        try {
          await this.notifications.broadcast(companyId, "POULTRY_MANAGE", {
            type: NotificationType.VACCINATION_REMINDER,
            title: "Vaccination Due Soon",
            body,
            entityType: "VaccinationRecord",
          });
          notified++;
        } catch (err) {
          this.logger.error(`vaccinationDueDateReminder: failed to notify company ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (due.length > 0) this.logger.log(`vaccinationDueDateReminder: notified ${notified}/${byCompany.size} company/ies for ${due.length} record(s)`);
    } catch (err) {
      this.logger.warn("vaccinationDueDateReminder: skipped — " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── 7 AM daily: medication withdrawal period alert ───────────────────────
  // Finds MedicationRecords where withdrawalUntil is in the future (birds
  // still under withdrawal — cannot be sold/slaughtered). Notifies
  // POULTRY_MANAGE users per company.
  @Cron("0 7 * * *", { timeZone: "Africa/Accra" })
  async withdrawalPeriodAlert() {
    if (!(await this.acquireCronLock("withdrawalPeriodAlert"))) return;
    try {
      const now = new Date();
      const in3 = new Date(now.getTime() + 3 * 24 * 3_600_000);
      // Alert for records where withdrawal ends within 3 days OR is already active today
      const active = await this.prisma.medicationRecord.findMany({
        where: { withdrawalUntil: { gte: now, lte: in3 }, deletedAt: null },
        include: { flockBatch: { select: { companyId: true, code: true, name: true } } },
      });

      const byCompany = new Map<string, { batchCode: string; medicationName: string; until: Date }[]>();
      for (const rec of active) {
        const cid = rec.flockBatch?.companyId;
        if (!cid) continue;
        const list = byCompany.get(cid) ?? [];
        list.push({ batchCode: rec.flockBatch!.code, medicationName: rec.medicationName, until: rec.withdrawalUntil! });
        byCompany.set(cid, list);
      }

      // H26: isolated per-company — see certificateExpiryAlert above for why.
      let notified = 0;
      for (const [companyId, items] of byCompany) {
        const body = `${items.length} batch(es) still under medication withdrawal (do not sell/slaughter):\n` +
          items.slice(0, 10).map((i) => `${i.batchCode} — ${i.medicationName} (withdrawal ends ${i.until.toISOString().slice(0, 10)})`).join("\n") +
          (items.length > 10 ? `\n…and ${items.length - 10} more` : "");
        try {
          await this.notifications.broadcast(companyId, "POULTRY_MANAGE", {
            type: NotificationType.MEDICATION_REMINDER,
            title: "⚠️ Withdrawal Period Active",
            body,
            entityType: "MedicationRecord",
          });
          notified++;
        } catch (err) {
          this.logger.error(`withdrawalPeriodAlert: failed to notify company ${companyId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (active.length > 0) this.logger.log(`withdrawalPeriodAlert: notified ${notified}/${byCompany.size} company/ies for ${active.length} record(s)`);
    } catch (err) {
      this.logger.warn("withdrawalPeriodAlert: skipped — " + (err instanceof Error ? err.message : String(err)));
    }
  }
}
