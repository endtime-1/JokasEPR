import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WarehousePurposeModule } from "../../common/services/warehouse-purpose.module";
import { SoyaProcessingController } from "./soya-processing.controller";
import { SoyaProcessingService } from "./soya-processing.service";

@Module({
  imports: [AuditModule, WarehousePurposeModule],
  controllers: [SoyaProcessingController],
  providers: [SoyaProcessingService],
  exports: [SoyaProcessingService]
})
export class SoyaProcessingModule {}
