import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { DutyRemindersService } from "./duty-reminders.service";

@Module({
  imports: [NotificationsModule],
  providers: [DutyRemindersService],
})
export class DutyRemindersModule {}
