import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty } from "class-validator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PERMISSIONS, AuthenticatedUser } from "@jokas/shared";
import { DutyRemindersService } from "./duty-reminders.service";

class TriggerReminderDto {
  @IsNotEmpty()
  @IsIn(["MORNING", "EVENING"])
  slot!: "MORNING" | "EVENING";
}

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
  async trigger(@Body() body: TriggerReminderDto) {
    if (body.slot === "MORNING") await this.svc.morningReminder();
    else await this.svc.eveningReminder();
    return { data: { triggered: body.slot } };
  }
}
