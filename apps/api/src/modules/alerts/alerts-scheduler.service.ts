import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { AlertGenerationService } from "./alert-generation.service";

@Injectable()
export class AlertsSchedulerService {
  private readonly logger = new Logger(AlertsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertGeneration: AlertGenerationService
  ) {}

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
