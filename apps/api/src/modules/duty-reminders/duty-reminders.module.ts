import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { DutyRemindersService } from "./duty-reminders.service";
import { DutyRemindersController } from "./duty-reminders.controller";

@Module({
  imports: [NotificationsModule],
  providers: [DutyRemindersService],
  controllers: [DutyRemindersController],
})
export class DutyRemindersModule {}
