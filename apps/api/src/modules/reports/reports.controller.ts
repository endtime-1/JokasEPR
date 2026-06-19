import { Controller, Get, Headers, Ip, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ReportExportQueryDto, ReportQueryDto } from "./dto/report-query.dto";
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

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  run(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportQueryDto) {
    return this.reportsService.run(id, user, query);
  }

  @Get(":id/export.csv")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  async csv(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "csv", user, query, { ipAddress, userAgent });
    this.send(response, "text/csv", `${id}.csv`, body);
  }

  @Get(":id/export.xls")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  async excel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "xls", user, query, { ipAddress, userAgent });
    this.send(response, "application/vnd.ms-excel", `${id}.xls`, body);
  }

  @Get(":id/export.pdf")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: ReportExportQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const body = await this.reportsService.export(id, "pdf", user, query, { ipAddress, userAgent });
    this.send(response, "application/pdf", `${id}.pdf`, body);
  }

  @Get(":id/print")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
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
