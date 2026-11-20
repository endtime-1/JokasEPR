import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { IncomingQueryDto, MapCustomerDto, UpdateLinkDto } from "./dto/fin-integrations.dto";
import { FinIntegrationsService } from "./fin-integrations.service";

const P = PERMISSIONS;

/** Finance v2: optional links from other modules (every link is OFF by default; links only ever create drafts). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/integrations")
export class FinIntegrationsController {
  constructor(private readonly service: FinIntegrationsService) {}

  @Get() @RequirePermissions(P.FIN_SETTINGS_VIEW)
  async links(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.service.links(u.companyId) };
  }

  @Put("links/:key") @RequirePermissions(P.FIN_SETTINGS_SETTINGS)
  async update(@CurrentUser() u: AuthenticatedUser, @Param("key") key: string, @Body() dto: UpdateLinkDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.service.update(u.companyId, u.id, key, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("sync") @RequirePermissions(P.FIN_SETTINGS_SETTINGS)
  async sync(@CurrentUser() u: AuthenticatedUser) {
    return { data: (await this.service.sync(u.companyId)) ?? { skipped: true } };
  }

  @Post("map-customer") @RequirePermissions(P.FIN_SETTINGS_SETTINGS)
  async mapCustomer(@CurrentUser() u: AuthenticatedUser, @Body() dto: MapCustomerDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: (await this.service.mapCustomer(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua })) ?? { skipped: true } };
  }

  /** The drafts (and problems) the links have produced, for finance to review. */
  @Get("incoming") @RequirePermissions(P.FIN_SALES_VIEW)
  async incoming(@CurrentUser() u: AuthenticatedUser, @Query() q: IncomingQueryDto) {
    const { rows, total, page, take } = await this.service.incoming(u.companyId, q);
    return { data: rows, meta: { total, page, take } };
  }
}
