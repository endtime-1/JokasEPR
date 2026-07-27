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
    setTimeout(() => this.generateAlertsForAllCompanies().catch(() => undefined), 10_000);
  }

  @Cron("0 */4 * * *")
  async generateAlertsForAllCompanies(): Promise<void> {
    this.logger.log("Running scheduled alert generation for all companies");
    try {
      const companies = await this.prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
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
