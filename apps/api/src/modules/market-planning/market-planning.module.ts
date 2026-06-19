import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MarketPlanningController } from "./market-planning.controller";
import { MarketPlanningService } from "./market-planning.service";

@Module({
  imports: [AuditModule],
  controllers: [MarketPlanningController],
  providers: [MarketPlanningService]
})
export class MarketPlanningModule {}
