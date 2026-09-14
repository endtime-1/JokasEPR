import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EggSalesController } from "./egg-sales.controller";
import { EggSalesService } from "./egg-sales.service";

@Module({
  imports: [AuditModule],
  controllers: [EggSalesController],
  providers: [EggSalesService]
})
export class EggSalesModule {}
