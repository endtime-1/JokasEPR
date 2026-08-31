import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { WarehousePurposeModule } from "../../common/services/warehouse-purpose.module";
import { PoultryController } from "./poultry.controller";
import { PoultryService } from "./poultry.service";

@Module({
  imports: [AuditModule, WarehousePurposeModule],
  controllers: [PoultryController],
  providers: [PoultryService],
  exports: [PoultryService]
})
export class PoultryModule {}
