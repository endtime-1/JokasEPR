import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { AlertGenerationService } from "./alert-generation.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertGenerationService],
  exports: [AlertsService]
})
export class AlertsModule {}
