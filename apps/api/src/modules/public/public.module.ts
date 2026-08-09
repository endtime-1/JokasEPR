import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorefrontBrowseRateLimitGuard, StorefrontOrderRateLimitGuard } from "../../common/guards/storefront-rate-limit.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [PublicController],
  providers: [PublicService, StorefrontOrderRateLimitGuard, StorefrontBrowseRateLimitGuard],
})
export class PublicModule {}
