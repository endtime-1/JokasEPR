import { Controller, Get, Headers, Ip, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { DocumentReportQueryDto, DocumentReportRunDto, ReportExportQueryDto, ReportQueryDto, ScopeTreeQueryDto } from "./dto/report-query.dto";
import { ReportsService } from "./reports.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  catalog(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.catalog(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.options(user);
  }

  // ── Report navigator: scope tree + document reports ──────────────────────
  // Declared before @Get(":id") so "scope-tree" / "documents" aren't captured
  // as a report id.
  @Get("scope-tree")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  scopeTree(@CurrentUser() user: AuthenticatedUser, @Query() query: ScopeTreeQueryDto) {
    return this.reportsService.scopeTree(user, query.module);
  }

  @Get("documents")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  documentCatalog(@CurrentUser() user: AuthenticatedUser, @Query() query: DocumentReportQueryDto) {
    return this.reportsService.documentCatalog(user, query.module, query.scopeType);
  }

  @Get("documents/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  runDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: DocumentReportRunDto) {
    return this.reportsService.runDocument(id, user, query);
  }

  @Get("documents/:id/export.pdf")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async documentPdf(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: DocumentReportRunDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.exportDocument(id, "pdf", user, query, { ipAddress, userAgent });
    this.send(response, "application/pdf", `${id}.pdf`, body);
  }

  @Get("documents/:id/export.csv")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async documentCsv(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: DocumentReportRunDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.exportDocument(id, "csv", user, query, { ipAddress, userAgent });
    this.send(response, "text/csv", `${id}.csv`, body);
  }

  // Medium (DB stability audit, 2026-08-16): this comment previously said
  // "capped at 5-10" — deploy.yml patches DATABASE_URL to
  // connection_limit=10&pool_timeout=30 on every deploy, and start.js only
  // appends its own connection_limit=5&pool_timeout=20 fallback when those
  // substrings are absent from the existing value, so in the normal deploy
  // path the resolved limit is 10, not a 5-10 range. That resolution rests
  // on Passenger auto-loading .env into process.env before start.js runs,
  // which isn't independently confirmable from repo evidence alone — worth
  // a live spot-check if this ever needs re-verifying. Reports run heavy
  // aggregation queries against that pool — a burst of requests here can
  // starve every other endpoint of a connection. The global guard allows
  // 300/60s per IP, far too loose for this specific cost profile.
  @Get(":id")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  run(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportQueryDto) {
    return this.reportsService.run(id, user, query);
  }

  @Get(":id/export.csv")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async csv(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "csv", user, query, { ipAddress, userAgent });
    this.send(response, "text/csv", `${id}.csv`, body);
  }

  @Get(":id/export.xls")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async excel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "xls", user, query, { ipAddress, userAgent });
    this.send(response, "application/vnd.ms-excel", `${id}.xls`, body);
  }

  @Get(":id/export.pdf")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "pdf", user, query, { ipAddress, userAgent });
    this.send(response, "application/pdf", `${id}.pdf`, body);
  }

  @Get(":id/print")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async print(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "html", user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.send(body);
  }

  private send(response: Response, contentType: string, filename: string, body: string | Buffer) {
    const safeFilename = filename.replace(/[^a-z0-9.\-_]/gi, "_").slice(0, 128);
    response.setHeader("content-type", contentType);
    response.setHeader("content-disposition", `attachment; filename="${safeFilename}"`);
    response.send(body);
  }
}
