import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { NotificationQueryDto, UpdateNotificationConfigDto, UpdatePreferencesDto } from "./dto/notifications.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: NotificationQueryDto) {
    return this.notifications.findAll(user, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notifications.markRead(user, id);
  }

  @Patch("mark-all-read")
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }

  @Get("preferences")
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user);
  }

  @Put("preferences")
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.notifications.updatePreferences(user, dto);
  }

  @Get("config")
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getConfig(user);
  }

  @Put("config")
  updateConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationConfigDto) {
    return this.notifications.updateConfig(user, dto);
  }
}
