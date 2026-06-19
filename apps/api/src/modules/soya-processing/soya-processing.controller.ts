import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  CreateSoyaBeanIntakeDto,
  CreateSoyaInternalTransferDto,
  CreateSoyaProcessingBatchDto,
  CreateSoyaQualityCheckDto,
  CreateSoyaSaleDto,
  SoyaQueryDto,
  UpdateSoyaQualityStatusDto
} from "./dto/soya-processing.dto";
import { SoyaProcessingService } from "./soya-processing.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("soya-processing")
export class SoyaProcessingController {
  constructor(private readonly soyaService: SoyaProcessingService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.soyaService.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.soyaService.options(user);
  }

  @Get("intakes")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  intakes(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listIntakes(user, query);
  }

  @Post("intakes")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createIntake(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaBeanIntakeDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createIntake(user, dto, { ipAddress, userAgent });
  }

  @Get("batches")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  batches(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listBatches(user, query);
  }

  @Post("batches")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaProcessingBatchDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createBatch(user, dto, { ipAddress, userAgent });
  }

  @Get("oil-stock")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  oilStock(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listOilStock(user, query);
  }

  @Get("cake-stock")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  cakeStock(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listCakeStock(user, query);
  }

  @Get("quality-checks")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  qualityChecks(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listQualityChecks(user, query);
  }

  @Post("quality-checks")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  createQualityCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaQualityCheckDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createQualityCheck(user, dto, { ipAddress, userAgent });
  }

  @Patch("quality-checks/:id/approve")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  approveQualityCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaQualityStatusDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateQualityStatus(user, id, dto, { ipAddress, userAgent });
  }

  @Get("transfers")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  transfers(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listTransfers(user, query);
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createTransfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaInternalTransferDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createTransfer(user, dto, { ipAddress, userAgent });
  }

  @Post("sales")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createSale(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaSaleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createSale(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/summary.csv")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.soyaService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=soya-processing-summary.csv");
    response.send(csv);
  }
}
