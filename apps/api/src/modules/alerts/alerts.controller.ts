import { Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { AlertQueryDto, ForecastQueryDto } from "./dto/alerts.dto";
import { AlertsService } from "./alerts.service";

@Controller("alerts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post("generate")
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  generate(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.generate(user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    return this.alerts.findAll(user, query);
  }

  @Get("unread-count")
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.unreadCount(user);
  }

  @Get("forecasts")
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  forecasts(@CurrentUser() user: AuthenticatedUser, @Query() query: ForecastQueryDto) {
    return this.alerts.getForecasts(user, query);
  }

  @Get("report.csv")
  @Header("content-type", "text/csv")
  @Header("content-disposition", "attachment; filename=\"ai-alert-report.csv\"")
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  report(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    return this.alerts.reportCsv(user, query);
  }

  @Patch(":id/acknowledge")
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.alerts.acknowledge(user, id);
  }

  @Patch(":id/resolve")
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.alerts.resolve(user, id);
  }
}
