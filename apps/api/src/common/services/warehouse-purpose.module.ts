import { Module } from "@nestjs/common";
import { AuditModule } from "../../modules/audit/audit.module";
import { WarehousePurposeService } from "./warehouse-purpose.service";

@Module({
  imports: [AuditModule],
  providers: [WarehousePurposeService],
  exports: [WarehousePurposeService],
})
export class WarehousePurposeModule {}
