import { Body, Controller, Get, Header, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { QrEntityParamsDto, QrStockMovementDto, ScanQrDto } from "./dto/qr.dto";
import { QrService } from "./qr.service";

@Controller("qr")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QrController {
  constructor(private readonly qr: QrService) {}

  // L-BACK: these three previously required inventory.read at the controller
  // level on top of the domain-specific permission (feed.read, sales.read,
  // procurement.read, etc.) that resolveEntity() already enforces per entity
  // type below — a sales-only user without inventory access couldn't scan a
  // sales-document QR code. The service-level check is the real, correctly-
  // scoped gate; the blanket controller requirement was just redundant and
  // over-restrictive.
  @Get(":entityType/:entityId")
  getOrCreate(@CurrentUser() user: AuthenticatedUser, @Param() params: QrEntityParamsDto) {
    return this.qr.getOrCreate(user, params.entityType, params.entityId);
  }

  @Get(":entityType/:entityId/label.svg")
  @Header("content-type", "image/svg+xml")
  async labelSvg(@CurrentUser() user: AuthenticatedUser, @Param() params: QrEntityParamsDto, @Res() res: Response) {
    const svg = await this.qr.labelSvg(user, params.entityType, params.entityId);
    res.type("image/svg+xml").send(svg);
  }

  @Post("scan")
  scan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanQrDto) {
    return this.qr.scan(user, dto.code);
  }

  @Post("stock-movement")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  stockMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: QrStockMovementDto) {
    return this.qr.stockMovementByCode(user, dto);
  }
}
