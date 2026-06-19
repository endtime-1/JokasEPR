import { Body, Controller, Get, Header, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { QrEntityParamsDto, QrStockMovementDto, ScanQrDto } from "./dto/qr.dto";
import { QrService } from "./qr.service";

@Controller("qr")
@UseGuards(JwtAuthGuard)
export class QrController {
  constructor(private readonly qr: QrService) {}

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
  stockMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: QrStockMovementDto) {
    return this.qr.stockMovementByCode(user, dto);
  }
}
