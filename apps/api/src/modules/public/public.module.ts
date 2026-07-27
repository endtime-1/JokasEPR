import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorefrontBrowseRateLimitGuard, StorefrontOrderRateLimitGuard } from "../../common/guards/storefront-rate-limit.guard";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [ConfigModule],
  controllers: [PublicController],
  providers: [PublicService, StorefrontOrderRateLimitGuard, StorefrontBrowseRateLimitGuard],
})
export class PublicModule {}
