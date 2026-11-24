import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EggAnalysisController } from "./egg-analysis/egg-analysis.controller";
import { EggAnalysisService } from "./egg-analysis/egg-analysis.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AuditModule],
  controllers: [ReportsController, EggAnalysisController],
  providers: [ReportsService, EggAnalysisService]
})
export class ReportsModule {}

