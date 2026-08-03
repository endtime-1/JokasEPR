import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PERMISSIONS, AuthenticatedUser } from "@jokas/shared";
import { DutyRemindersService } from "./duty-reminders.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("duty-reminders")
export class DutyRemindersController {
  constructor(private readonly svc: DutyRemindersService) {}

  @Get("today")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  getTodayStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getTodayStatus(user.companyId);
  }

  @Post("trigger")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  async trigger(@Body("slot") slot: "MORNING" | "EVENING") {
    if (slot === "MORNING") await this.svc.morningReminder();
    else await this.svc.eveningReminder();
    return { data: { triggered: slot ?? "MORNING" } };
  }
}
