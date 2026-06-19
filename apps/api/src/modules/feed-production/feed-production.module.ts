import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FeedProductionController } from "./feed-production.controller";
import { FeedProductionService } from "./feed-production.service";

@Module({
  imports: [AuditModule],
  controllers: [FeedProductionController],
  providers: [FeedProductionService]
})
export class FeedProductionModule {}
