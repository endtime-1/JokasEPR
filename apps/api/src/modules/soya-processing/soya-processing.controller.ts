import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
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
  UpdateSoyaBeanIntakeDto,
  UpdateSoyaInternalTransferDto,
  UpdateSoyaProcessingBatchDto,
  UpdateSoyaQualityCheckDto,
  UpdateSoyaQualityStatusDto,
  UpdateSoyaSaleDto
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

  @Get("intakes/:id")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  intake(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.soyaService.getIntake(user, id);
  }

  @Post("intakes")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createIntake(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaBeanIntakeDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createIntake(user, dto, { ipAddress, userAgent });
  }

  @Patch("intakes/:id")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  updateIntake(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaBeanIntakeDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateIntake(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("intakes/:id")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  deleteIntake(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.deleteIntake(user, id, { ipAddress, userAgent });
  }

  @Get("batches")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  batches(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listBatches(user, query);
  }

  @Get("batches/:id")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  batch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.soyaService.getBatch(user, id);
  }

  @Post("batches")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaProcessingBatchDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createBatch(user, dto, { ipAddress, userAgent });
  }

  @Patch("batches/:id")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  updateBatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaProcessingBatchDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateBatch(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("batches/:id")
  @RequirePermissions(PERMISSIONS.SOYA_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  deleteBatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.deleteBatch(user, id, { ipAddress, userAgent });
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

  @Patch("quality-checks/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  updateQualityCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaQualityCheckDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateQualityCheck(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("quality-checks/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  deleteQualityCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.deleteQualityCheck(user, id, { ipAddress, userAgent });
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

  @Patch("transfers/:id")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  updateTransfer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaInternalTransferDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateTransfer(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("transfers/:id")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  deleteTransfer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.deleteTransfer(user, id, { ipAddress, userAgent });
  }

  @Get("sales")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  sales(@CurrentUser() user: AuthenticatedUser, @Query() query: SoyaQueryDto) {
    return this.soyaService.listSales(user, query);
  }

  @Get("sales/:id")
  @RequirePermissions(PERMISSIONS.SOYA_READ)
  getSale(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.soyaService.findSale(user, id);
  }

  @Post("sales")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createSale(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSoyaSaleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.createSale(user, dto, { ipAddress, userAgent });
  }

  @Patch("sales/:id")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  updateSale(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSoyaSaleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.updateSale(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("sales/:id")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  deleteSale(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.soyaService.deleteSale(user, id, { ipAddress, userAgent });
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
