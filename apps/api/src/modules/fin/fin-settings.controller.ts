import { Body, Controller, Get, Headers, Ip, Param, Put, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { AuditQueryDto, UpdateFinSettingsDto, UpdateNumberSequenceDto } from "./dto/fin.dto";
import { FinAuditService } from "./fin-audit.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinSettingsService } from "./fin-settings.service";

/** Finance v2 settings: business details, currency, fiscal year, document numbering, audit log. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin")
export class FinSettingsController {
  constructor(
    private readonly settings: FinSettingsService,
    private readonly numbering: FinNumberingService,
    private readonly audit: FinAuditService
  ) {}

  @Get("settings")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_VIEW)
  async get(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.settings.getAll(user.companyId) };
  }

  @Put("settings")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_SETTINGS)
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateFinSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.settings.update(user.companyId, user.id, dto, { ipAddress, userAgent }) };
  }

  @Put("numbering/:docType")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_SETTINGS)
  async updateNumbering(
    @CurrentUser() user: AuthenticatedUser,
    @Param("docType") docType: string,
    @Body() dto: UpdateNumberSequenceDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    await this.numbering.update(user.companyId, user.id, docType, dto, { ipAddress, userAgent });
    return { data: await this.numbering.list(user.companyId) };
  }

  @Get("audit-log")
  @RequirePermissions(PERMISSIONS.FIN_SETTINGS_VIEW)
  async auditLog(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    const { rows, total, page, take } = await this.audit.list(user.companyId, query);
    return { data: rows, meta: { total, page, take } };
  }
}
