import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { AlertGenerationService } from "./alert-generation.service";
import { AlertsSchedulerService } from "./alerts-scheduler.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertGenerationService, AlertsSchedulerService],
  exports: [AlertsService]
})
export class AlertsModule {}
