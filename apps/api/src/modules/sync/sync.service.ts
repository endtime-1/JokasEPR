import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { AuthenticatedUser, PERMISSIONS, PermissionKey } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PoultryService } from "../poultry/poultry.service";
import { InventoryService } from "../inventory/inventory.service";
import { HRService } from "../hr/hr.service";
import { BatchSyncDto, SyncItemDto, SyncItemResult, SyncRecordsQueryDto } from "./dto/sync.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

const SUPPORTED_ENDPOINTS = [
  "/poultry/daily-records",
  "/poultry/mortality-records",
  "/poultry/egg-production-records",
  "/poultry/feed-consumption-records",
  "/poultry/medication-records",
  "/poultry/vaccination-records",
  "/inventory/stock-movements",
  "/hr/tasks/"
] as const;

// Mirrors the @RequirePermissions on each endpoint's direct REST route
// (poultry.controller.ts, inventory.controller.ts, hr.controller.ts).
// routeToService() below calls straight into service methods, bypassing
// PermissionsGuard entirely — without this map, any authenticated user
// could create poultry/health/inventory records or alter HR tasks via
// /sync/batch regardless of their actual permissions.
const ENDPOINT_PERMISSIONS: Array<{ match: (endpoint: string) => boolean; permission: PermissionKey }> = [
  { match: (ep) => ep.includes("/poultry/daily-records"), permission: PERMISSIONS.POULTRY_RECORD },
  { match: (ep) => ep.includes("/poultry/mortality-records"), permission: PERMISSIONS.POULTRY_RECORD },
  { match: (ep) => ep.includes("/poultry/egg-production-records"), permission: PERMISSIONS.POULTRY_RECORD },
  { match: (ep) => ep.includes("/poultry/feed-consumption-records"), permission: PERMISSIONS.POULTRY_RECORD },
  { match: (ep) => ep.includes("/poultry/medication-records"), permission: PERMISSIONS.HEALTH_MANAGE },
  { match: (ep) => ep.includes("/poultry/vaccination-records"), permission: PERMISSIONS.HEALTH_MANAGE },
  { match: (ep) => ep.includes("/inventory/stock-movements"), permission: PERMISSIONS.INVENTORY_MANAGE },
  { match: (ep) => /\/hr\/tasks\/[a-f0-9-]{36}\/status/i.test(ep), permission: PERMISSIONS.HR_MANAGE }
];

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly poultryService: PoultryService,
    private readonly inventoryService: InventoryService,
    private readonly hrService: HRService
  ) {}

  async batchSync(user: AuthenticatedUser, dto: BatchSyncDto, ctx: RequestContext): Promise<{ data: { results: SyncItemResult[]; synced: number; duplicates: number; failed: number } }> {
    const results: SyncItemResult[] = [];

    for (const item of dto.records) {
      const result = await this.processSyncItem(user, item, ctx);
      results.push(result);
    }

    return {
      data: {
        results,
        synced: results.filter((r) => r.status === "synced").length,
        duplicates: results.filter((r) => r.status === "duplicate").length,
        failed: results.filter((r) => r.status === "failed").length
      }
    };
  }

  private async processSyncItem(user: AuthenticatedUser, item: SyncItemDto, ctx: RequestContext): Promise<SyncItemResult> {
    // Idempotency check — if we've seen this localId before, return the cached result
    const existing = await this.prisma.mobileSyncRecord.findUnique({
      where: { companyId_localId: { companyId: user.companyId, localId: item.localId } }
    });

    if (existing) {
      return {
        localId: item.localId,
        status: existing.status === "FAILED" ? "failed" : "duplicate",
        recordId: existing.recordId ?? undefined,
        error: existing.errorMsg ?? undefined
      };
    }

    try {
      const serviceResult = await this.routeToService(user, item, ctx);
      const recordId = (serviceResult as any)?.data?.id ?? undefined;

      await this.prisma.mobileSyncRecord.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          localId: item.localId,
          module: item.module,
          endpoint: item.endpoint,
          method: item.method,
          recordId: recordId ? String(recordId) : undefined,
          status: "SYNCED",
          payload: item.payload as any
        }
      });

      return { localId: item.localId, status: "synced", recordId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Sync failed for localId=${item.localId} user=${user.id}: ${errorMsg}`);

      await this.prisma.mobileSyncRecord.upsert({
        where: { companyId_localId: { companyId: user.companyId, localId: item.localId } },
        create: {
          companyId: user.companyId,
          userId: user.id,
          localId: item.localId,
          module: item.module,
          endpoint: item.endpoint,
          method: item.method,
          status: "FAILED",
          errorMsg,
          payload: item.payload as any
        },
        update: { status: "FAILED", errorMsg }
      });

      return { localId: item.localId, status: "failed", error: errorMsg };
    }
  }

  private async routeToService(user: AuthenticatedUser, item: SyncItemDto, ctx: RequestContext) {
    const ep = item.endpoint;
    const payload = item.payload as any;

    const rule = ENDPOINT_PERMISSIONS.find((r) => r.match(ep));
    if (rule && !user.hasGlobalAccess && !user.permissions.includes(rule.permission)) {
      throw new ForbiddenException(`Missing permission ${rule.permission} for ${ep}.`);
    }

    if (ep.includes("/poultry/daily-records")) {
      return this.poultryService.createDailyRecord(user, payload, ctx);
    }
    if (ep.includes("/poultry/mortality-records")) {
      return this.poultryService.createMortality(user, payload, ctx);
    }
    if (ep.includes("/poultry/egg-production-records")) {
      return this.poultryService.createEggs(user, payload, ctx);
    }
    if (ep.includes("/poultry/feed-consumption-records")) {
      return this.poultryService.createFeed(user, payload, ctx);
    }
    if (ep.includes("/poultry/medication-records")) {
      return this.poultryService.createMedication(user, payload, ctx);
    }
    if (ep.includes("/poultry/vaccination-records")) {
      return this.poultryService.createVaccination(user, payload, ctx);
    }
    if (ep.includes("/inventory/stock-movements")) {
      return this.inventoryService.createStockMovement(user, payload, ctx);
    }

    // PATCH /hr/tasks/:id/status
    const taskMatch = ep.match(/\/hr\/tasks\/([a-f0-9-]{36})\/status/i);
    if (taskMatch) {
      return this.hrService.updateTaskStatus(user, taskMatch[1], payload, ctx);
    }

    throw new BadRequestException(`Unsupported sync endpoint: ${ep}`);
  }

  // Admin: list mobile sync records for the company
  async listSyncRecords(user: AuthenticatedUser, query: SyncRecordsQueryDto) {
    const where: Record<string, unknown> = { companyId: user.companyId };
    if (query.status) where.status = query.status.toUpperCase();
    if (query.userId) where.userId = query.userId;

    const [records, total] = await Promise.all([
      this.prisma.mobileSyncRecord.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } }
        },
        orderBy: { syncedAt: "desc" },
        take: query.limit ?? 50,
        skip: query.offset ?? 0
      }),
      this.prisma.mobileSyncRecord.count({ where })
    ]);

    return { data: { data: records, total } };
  }

  // Admin: retry a failed sync record (re-process with original payload)
  async retrySyncRecord(user: AuthenticatedUser, localId: string, ctx: RequestContext) {
    const record = await this.prisma.mobileSyncRecord.findUnique({
      where: { companyId_localId: { companyId: user.companyId, localId } }
    });
    if (!record) throw new BadRequestException("Sync record not found.");
    if (record.status !== "FAILED") throw new BadRequestException("Only failed records can be retried.");

    // Delete the failed record so processSyncItem creates a fresh one
    await this.prisma.mobileSyncRecord.delete({
      where: { companyId_localId: { companyId: user.companyId, localId } }
    });

    const item: SyncItemDto = {
      localId: record.localId,
      endpoint: record.endpoint,
      method: record.method,
      module: record.module,
      payload: (record.payload as any) ?? {}
    };

    // Look up the original submitting user for auth context — must still be active
    const submitter = await this.prisma.user.findFirst({
      where: { id: record.userId, deletedAt: null, status: UserStatus.ACTIVE },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        farmAccesses: true,
        warehouseAccesses: true,
        productionSiteAccess: true,
        branchAccesses: true
      }
    });
    if (!submitter) throw new BadRequestException("Submitting user not found.");

    const retryUser: AuthenticatedUser = {
      id: submitter.id,
      companyId: submitter.companyId,
      email: submitter.email,
      fullName: submitter.fullName,
      roles: submitter.roles.map((r: any) => r.role.name),
      permissions: submitter.roles.flatMap((r: any) => r.role.permissions.map((p: any) => p.key)),
      branchIds: submitter.branchAccesses.map((b: any) => b.branchId),
      farmIds: submitter.farmAccesses.map((f: any) => f.farmId),
      warehouseIds: submitter.warehouseAccesses.map((w: any) => w.warehouseId),
      productionSiteIds: submitter.productionSiteAccess.map((ps: any) => ps.productionSiteId),
      hasGlobalAccess: submitter.roles.some((r: any) => r.role.level === "SUPER_ADMIN" || r.role.level === "CEO")
    };

    const result = await this.processSyncItem(retryUser, item, ctx);
    return { data: result };
  }

  // Summary stats for admin dashboard
  async syncStats(user: AuthenticatedUser) {
    const [total, synced, failed, duplicates, recentUsers] = await Promise.all([
      this.prisma.mobileSyncRecord.count({ where: { companyId: user.companyId } }),
      this.prisma.mobileSyncRecord.count({ where: { companyId: user.companyId, status: "SYNCED" } }),
      this.prisma.mobileSyncRecord.count({ where: { companyId: user.companyId, status: "FAILED" } }),
      this.prisma.mobileSyncRecord.count({ where: { companyId: user.companyId, status: "DUPLICATE" } }),
      this.prisma.mobileSyncRecord.findMany({
        where: { companyId: user.companyId },
        distinct: ["userId"],
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { syncedAt: "desc" },
        take: 5
      })
    ]);

    return { data: { total, synced, failed, duplicates, recentUsers: recentUsers.map((r) => ({ userId: r.userId, fullName: (r as any).user.fullName })) } };
  }
}
