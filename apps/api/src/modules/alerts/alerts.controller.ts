import { Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AlertQueryDto, ForecastQueryDto } from "./dto/alerts.dto";
import { AlertsService } from "./alerts.service";

@Controller("alerts")
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post("generate")
  generate(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.generate(user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    return this.alerts.findAll(user, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.unreadCount(user);
  }

  @Get("forecasts")
  forecasts(@CurrentUser() user: AuthenticatedUser, @Query() query: ForecastQueryDto) {
    return this.alerts.getForecasts(user, query);
  }

  @Get("report.csv")
  @Header("content-type", "text/csv")
  @Header("content-disposition", "attachment; filename=\"ai-alert-report.csv\"")
  report(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) {
    return this.alerts.reportCsv(user, query);
  }

  @Patch(":id/acknowledge")
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.alerts.acknowledge(user, id);
  }

  @Patch(":id/resolve")
  resolve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.alerts.resolve(user, id);
  }
}
