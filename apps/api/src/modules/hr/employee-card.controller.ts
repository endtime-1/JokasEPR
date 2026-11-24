import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ScanEmployeeCardDto } from "./dto/employee-card.dto";
import { EmployeeCardService } from "./employee-card.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("hr")
export class EmployeeCardController {
  constructor(private readonly cards: EmployeeCardService) {}

  // The data and QR code for one employee's ID card.
  @Get("employees/:id/id-card")
  @RequirePermissions(PERMISSIONS.HR_READ)
  card(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.cards.getCard(user, id);
  }

  // Cancel the current card and issue a new one (a lost card stops working at once).
  @Post("employees/:id/id-card/reissue")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  reissue(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.cards.reissue(user, id, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
  }

  // A card was scanned at the gate: check in, or check out.
  @Post("attendance/scan")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  scan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanEmployeeCardDto, @Req() req: Request) {
    return this.cards.scan(user, dto.code, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
  }
}
