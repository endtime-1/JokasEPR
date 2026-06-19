import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { QualityController } from "./quality.controller";
import { QualityService } from "./quality.service";

@Module({
  imports: [AuditModule],
  controllers: [QualityController],
  providers: [QualityService],
})
export class QualityModule {}
