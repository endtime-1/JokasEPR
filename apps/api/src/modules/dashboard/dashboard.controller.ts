import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { DashboardService } from "./dashboard.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.PLATFORM_READ)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.summary(user);
  }

  @Get("options")
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.options(user);
  }

  @Get("executive")
  executive(@CurrentUser() user: AuthenticatedUser, @Query() query: DashboardQueryDto) {
    return this.dashboardService.executive(user, query);
  }

  @Get("my-duties")
  myDuties(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.myDuties(user);
  }

  @Get("farm-operations-today")
  farmOperationsToday(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.farmOperationsToday(user);
  }
}
