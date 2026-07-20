import { Global, Module } from "@nestjs/common";
import { LookupCacheService } from "./services/lookup-cache.service";
import { PermissionSyncService } from "./services/permission-sync.service";

@Global()
@Module({
  providers: [LookupCacheService, PermissionSyncService],
  exports: [LookupCacheService],
})
export class CacheModule {}
