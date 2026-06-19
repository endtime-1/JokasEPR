import { Body, Controller, Delete, Get, Headers, Param, Post, Query, RawBodyRequest, Req, Res, UseGuards } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { QBMappingType, QBWebhookStatus } from "@prisma/client";
import { QuickBooksOAuthService } from "./services/quickbooks-oauth.service";
import { QuickBooksSyncService, SyncEntity } from "./services/quickbooks-sync.service";
import { QuickBooksLoggerService } from "./services/quickbooks-logger.service";
import { QuickBooksWebhookService } from "./services/quickbooks-webhook.service";
import { QuickBooksMappingService } from "./services/quickbooks-mapping.service";
import { PrismaService } from "../prisma/prisma.service";
import { SyncLogsQueryDto, UpsertMappingDto, WebhookQueryDto } from "./dto/quickbooks.dto";

@Controller("quickbooks")
export class QuickBooksController {
  constructor(
    private readonly oauthSvc: QuickBooksOAuthService,
    private readonly syncSvc: QuickBooksSyncService,
    private readonly loggerSvc: QuickBooksLoggerService,
    private readonly webhookSvc: QuickBooksWebhookService,
    private readonly mappingSvc: QuickBooksMappingService,
    private readonly prisma: PrismaService
  ) {}

  // ─── OAuth ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Post("oauth/initiate")
  initiateOAuth(@CurrentUser() user: AuthenticatedUser) {
    const url = this.oauthSvc.getAuthorizationUrl(user.companyId, user.id);
    return { authorizationUrl: url };
  }

  @Get("oauth/callback")
  async oauthCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("realmId") realmId: string,
    @Res() res: Response
  ) {
    const { redirectUrl } = await this.oauthSvc.handleCallback(code, state, realmId);
    return res.redirect(redirectUrl);
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_READ)
  @Get("status")
  async status(@CurrentUser() user: AuthenticatedUser) {
    const conn = await this.prisma.quickBooksConnection.findUnique({
      where: { companyId: user.companyId },
      select: { id: true, realmId: true, environment: true, connectedAt: true, disconnectedAt: true, isActive: true }
    });
    const stats = conn?.isActive ? await this.syncSvc.getStats(user.companyId) : null;
    return { connection: conn, stats };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Delete("disconnect")
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    await this.oauthSvc.disconnect(user.companyId);
    return { message: "Disconnected from QuickBooks" };
  }

  // ─── Sync ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Post("sync")
  async triggerFullSync(@CurrentUser() user: AuthenticatedUser) {
    // Fire and forget — full sync runs in background
    setImmediate(() => this.syncSvc.syncAll(user.companyId, user.id).catch(() => undefined));
    return { message: "Full sync started" };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Post("sync/:entity")
  async triggerEntitySync(@Param("entity") entity: string, @CurrentUser() user: AuthenticatedUser) {
    setImmediate(() => this.syncSvc.syncEntity(user.companyId, entity as SyncEntity, user.id).catch(() => undefined));
    return { message: `${entity} sync started` };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Post("sync/:entity/:id")
  async syncRecord(@Param("entity") entity: string, @Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.syncSvc.syncRecord(user.companyId, entity as SyncEntity, id);
    return { message: "Record synced" };
  }

  // ─── Sync Logs ────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_READ)
  @Get("logs")
  async getLogs(@CurrentUser() user: AuthenticatedUser, @Query() query: SyncLogsQueryDto) {
    const conn = await this.prisma.quickBooksConnection.findUnique({ where: { companyId: user.companyId } });
    if (!conn) return { data: [] };

    const limit = Math.min(Number(query.limit ?? 50), 200);
    const logs = await this.prisma.quickBooksSyncLog.findMany({
      where: {
        companyId: user.companyId,
        ...(query.operation && { operation: query.operation as never }),
        ...(query.result && { result: query.result as never })
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { triggeredBy: { select: { fullName: true } } }
    });
    return { data: logs };
  }

  // ─── Mapping ────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_READ)
  @Get("mappings")
  async getMappings(@CurrentUser() user: AuthenticatedUser, @Query("type") type?: string) {
    const data = await this.mappingSvc.getMappings(user.companyId, type as QBMappingType | undefined);
    return { data };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Post("mappings")
  async upsertMapping(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertMappingDto) {
    const conn = await this.prisma.quickBooksConnection.findUniqueOrThrow({ where: { companyId: user.companyId } });
    const data = await this.mappingSvc.upsertMapping(
      user.companyId,
      conn.id,
      dto.mappingType,
      dto.erpEntityId ?? null,
      dto.erpEntityName,
      dto.qbEntityId,
      dto.qbEntityName
    );
    return { data };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_READ)
  @Get("accounts")
  async getQBAccounts(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.mappingSvc.listQBAccounts(user.companyId);
    return { data };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_MANAGE)
  @Delete("mappings/:id")
  async deleteMapping(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.mappingSvc.deleteMapping(id, user.companyId);
    return { message: "Mapping deleted" };
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────

  @Post("webhook")
  async receiveWebhook(@Req() req: RawBodyRequest<Request>, @Headers("intuit-signature") signature: string) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    await this.webhookSvc.processPayload(rawBody, signature ?? "");
    return { received: true };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.QUICKBOOKS_READ)
  @Get("webhook-events")
  async getWebhookEvents(@CurrentUser() user: AuthenticatedUser, @Query() query: WebhookQueryDto) {
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const data = await this.webhookSvc.getWebhookEvents(user.companyId, query.status as QBWebhookStatus | undefined, limit);
    return { data };
  }
}
