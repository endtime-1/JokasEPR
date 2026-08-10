import { Module } from "@nestjs/common";
import { HRModule } from "../hr/hr.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PoultryModule } from "../poultry/poultry.module";
import { FinanceModule } from "../finance/finance.module";
import { MaintenanceModule } from "../maintenance/maintenance.module";
import { QualityModule } from "../quality/quality.module";
import { SalesModule } from "../sales/sales.module";
import { SoyaProcessingModule } from "../soya-processing/soya-processing.module";
import { FeedProductionModule } from "../feed-production/feed-production.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [
    PoultryModule,
    InventoryModule,
    HRModule,
    FinanceModule,
    MaintenanceModule,
    QualityModule,
    SalesModule,
    SoyaProcessingModule,
    FeedProductionModule
  ],
  controllers: [SyncController],
  providers: [SyncService]
})
export class SyncModule {}
