import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { HRController } from "./hr.controller";
import { HRService } from "./hr.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [HRController],
  providers: [HRService],
  exports: [HRService],
})
export class HRModule {}
