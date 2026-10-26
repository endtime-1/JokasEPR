import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards, Headers } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateFieldVisitDto, FieldVisitCheckInDto, FieldVisitQueryDto } from "./dto/field-visit.dto";
import { FieldVisitsService } from "./field-visits.service";

// Field-visit proof of presence. Any signed-in user can see and check in to THEIR OWN visits
// (a rep needs no special sales permission); the all-reps view needs sales.read.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("sales/field-visits")
export class FieldVisitsController {
  constructor(private readonly service: FieldVisitsService) {}

  @Get("my")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: FieldVisitQueryDto) {
    return this.service.list(user, query, true);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_READ)
  all(@CurrentUser() user: AuthenticatedUser, @Query() query: FieldVisitQueryDto) {
    return this.service.list(user, query, false);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFieldVisitDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return this.service.create(user, dto, { ipAddress: ip, userAgent: ua });
  }

  @Post(":id/check-in")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: FieldVisitCheckInDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return this.service.checkIn(user, id, dto, { ipAddress: ip, userAgent: ua });
  }

  @Patch(":id/cancel")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return this.service.cancel(user, id, { ipAddress: ip, userAgent: ua });
  }
}
