import { Global, Module } from "@nestjs/common";
import { LookupCacheService } from "./services/lookup-cache.service";

@Global()
@Module({
  providers: [LookupCacheService],
  exports: [LookupCacheService],
})
export class CacheModule {}
