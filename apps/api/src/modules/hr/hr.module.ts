import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { HRController } from "./hr.controller";
import { HRService } from "./hr.service";
import { EmployeeCardController } from "./employee-card.controller";
import { EmployeeCardService } from "./employee-card.service";

@Module({
  imports: [AuditModule, NotificationsModule, FinanceModule],
  controllers: [HRController, EmployeeCardController],
  providers: [HRService, EmployeeCardService],
  exports: [HRService],
})
export class HRModule {}
