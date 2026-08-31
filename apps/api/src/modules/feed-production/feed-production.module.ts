import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WarehousePurposeModule } from "../../common/services/warehouse-purpose.module";
import { FeedProductionController } from "./feed-production.controller";
import { FeedProductionService } from "./feed-production.service";

@Module({
  imports: [AuditModule, WarehousePurposeModule],
  controllers: [FeedProductionController],
  providers: [FeedProductionService],
  exports: [FeedProductionService]
})
export class FeedProductionModule {}
