import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EmailService } from "./email.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { SmsService } from "./sms.service";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, SmsService, WhatsAppService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
