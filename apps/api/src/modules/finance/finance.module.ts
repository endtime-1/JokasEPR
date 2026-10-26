import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { LedgerService } from "./ledger.service";
import { LedgerBackfillService } from "./ledger-backfill.service";

@Module({
  imports: [AuditModule],
  controllers: [FinanceController],
  providers: [FinanceService, LedgerService, LedgerBackfillService],
  exports: [FinanceService, LedgerService]
})
export class FinanceModule {}
