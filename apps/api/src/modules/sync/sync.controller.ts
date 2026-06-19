import { Body, Controller, Get, Headers, Ip, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { BatchSyncDto, SyncRecordsQueryDto } from "./dto/sync.dto";
import { SyncService } from "./sync.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("sync")
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Batch sync — mobile devices POST all queued offline records at once.
   * Returns per-record results with idempotency: duplicates are detected and skipped.
   */
  @Post("batch")
  batchSync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BatchSyncDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.syncService.batchSync(user, dto, { ipAddress, userAgent });
  }

  /**
   * Admin: list all mobile sync records for the company.
   * Supports filtering by status (SYNCED/FAILED/DUPLICATE) and userId.
   */
  @Get("records")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  listRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncRecordsQueryDto
  ) {
    return this.syncService.listSyncRecords(user, query);
  }

  /**
   * Admin: summary stats (total, synced, failed, duplicates).
   */
  @Get("stats")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.syncService.syncStats(user);
  }

  /**
   * Admin: retry a failed sync record by localId.
   */
  @Post("records/:localId/retry")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("localId") localId: string,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.syncService.retrySyncRecord(user, localId, { ipAddress, userAgent });
  }
}
