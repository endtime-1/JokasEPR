import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { SalesController } from "./sales.controller";
import { FieldVisitsController } from "./field-visits.controller";
import { FieldVisitsService } from "./field-visits.service";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuditModule, FinanceModule],
  controllers: [SalesController, FieldVisitsController],
  providers: [SalesService, FieldVisitsService],
  exports: [SalesService]
})
export class SalesModule {}

