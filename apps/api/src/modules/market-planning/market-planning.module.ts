import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MarketPlanningController } from "./market-planning.controller";
import { MarketPlanningService } from "./market-planning.service";
import { MarketingLedgerController } from "./marketing-ledger.controller";
import { MarketingLedgerService } from "./marketing-ledger.service";

@Module({
  imports: [AuditModule],
  controllers: [MarketPlanningController, MarketingLedgerController],
  providers: [MarketPlanningService, MarketingLedgerService]
})
export class MarketPlanningModule {}
