import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SoyaProcessingController } from "./soya-processing.controller";
import { SoyaProcessingService } from "./soya-processing.service";

@Module({
  imports: [AuditModule],
  controllers: [SoyaProcessingController],
  providers: [SoyaProcessingService],
  exports: [SoyaProcessingService]
})
export class SoyaProcessingModule {}
