import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { AlertGenerationService } from "./alert-generation.service";

@Injectable()
export class AlertsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AlertsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertGeneration: AlertGenerationService
  ) {}

  async onModuleInit() {
    // Run once on startup so the dashboard is populated immediately after a
    // deploy/restart, without waiting up to 4 hours for the first cron tick.
    // generateAll() deduplicates by (category, entityId) per day, so this is safe.
    // Low (DB stability audit, 2026-08-16): generateAlertsForAllCompanies
    // already catches and logs internally, so this outer catch is mostly a
    // backstop for something thrown outside that try — logged now instead
    // of silently swallowed, matching the rest of this file.
    setTimeout(() => this.generateAlertsForAllCompanies().catch((err: unknown) =>
      this.logger.error("Startup alert generation warm-up failed", err instanceof Error ? err.message : err)
    ), 10_000);
  }

  @Cron("0 */4 * * *")
  async generateAlertsForAllCompanies(): Promise<void> {
    this.logger.log("Running scheduled alert generation for all companies");
    try {
      const companies = await this.prisma.company.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true } });
      for (const company of companies) {
        await this.alertGeneration.generateAll(company.id).catch((err: unknown) =>
          this.logger.error(`Alert generation failed for company ${company.id}`, (err as Error).message)
        );
      }
    } catch (err) {
      this.logger.error("Scheduled alert generation error", (err as Error).message);
    }
  }
}
