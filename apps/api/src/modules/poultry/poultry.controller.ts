import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  AddPenDto,
  CreateBirdWeightRecordDto,
  CreateDailyPoultryRecordDto,
  CreateEggProductionRecordDto,
  CreateFeedConsumptionRecordDto,
  CreateFlockBatchDto,
  CreateHealthObservationDto,
  CreateMedicationRecordDto,
  CreateMortalityRecordDto,
  CreatePoultryCostRecordDto,
  CreatePoultryHouseDto,
  CreatePoultryTransferDto,
  CreateVaccinationRecordDto,
  PoultryQueryDto,
  UpdateBatchStatusDto,
  UpdatePoultryRecordDto,
  UpdatePoultryTransferStatusDto
} from "./dto/poultry.dto";
import { PoultryService } from "./poultry.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("poultry")
export class PoultryController {
  constructor(private readonly poultryService: PoultryService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.poultryService.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.poultryService.options(user);
  }

  @Get("farms/:farmId/overview")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  farmOverview(@CurrentUser() user: AuthenticatedUser, @Param("farmId") farmId: string) {
    return this.poultryService.farmOverview(user, farmId);
  }

  // ─── Houses ───────────────────────────────────────────────────────────────

  @Get("houses")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  houses(@CurrentUser() user: AuthenticatedUser, @Query() query: PoultryQueryDto) {
    return this.poultryService.listHouses(user, query);
  }

  @Post("houses")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  createHouse(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePoultryHouseDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createHouse(user, dto, { ipAddress, userAgent });
  }

  // ─── Pens ─────────────────────────────────────────────────────────────────

  @Get("houses/:houseId/pens")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  listPens(@CurrentUser() user: AuthenticatedUser, @Param("houseId") houseId: string) {
    return this.poultryService.listPens(user, houseId);
  }

  @Post("houses/:houseId/pens")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  addPen(@CurrentUser() user: AuthenticatedUser, @Param("houseId") houseId: string, @Body() dto: AddPenDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.addPen(user, houseId, dto, { ipAddress, userAgent });
  }

  // ─── Batches ──────────────────────────────────────────────────────────────

  @Get("flock-batches")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  flockBatches(@CurrentUser() user: AuthenticatedUser, @Query() query: PoultryQueryDto) {
    return this.poultryService.listBatches(user, query);
  }

  @Get("batches")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  batches(@CurrentUser() user: AuthenticatedUser, @Query() query: PoultryQueryDto) {
    return this.poultryService.listBatches(user, query);
  }

  @Get("batches/:id")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  batch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.poultryService.getBatch(user, id);
  }

  @Post("batches")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  createBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFlockBatchDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createBatch(user, dto, { ipAddress, userAgent });
  }

  @Patch("batches/:id/status")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  updateBatchStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateBatchStatusDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.updateBatchStatus(user, id, dto, { ipAddress, userAgent });
  }

  // ─── Records ──────────────────────────────────────────────────────────────

  @Get("records/:type")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  records(@CurrentUser() user: AuthenticatedUser, @Param("type") type: string, @Query() query: PoultryQueryDto) {
    return this.poultryService.listRecords(user, type, query);
  }

  @Get("costs")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  costs(@CurrentUser() user: AuthenticatedUser, @Query() query: PoultryQueryDto) {
    return this.poultryService.listRecords(user, "costs", query);
  }

  @Post("daily-records")
  @RequirePermissions(PERMISSIONS.POULTRY_RECORD)
  createDaily(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDailyPoultryRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createDailyRecord(user, dto, { ipAddress, userAgent });
  }

  @Post("mortality-records")
  @RequirePermissions(PERMISSIONS.POULTRY_RECORD)
  createMortality(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMortalityRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createMortality(user, dto, { ipAddress, userAgent });
  }

  @Post("feed-consumption-records")
  @RequirePermissions(PERMISSIONS.POULTRY_RECORD)
  createFeed(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedConsumptionRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createFeed(user, dto, { ipAddress, userAgent });
  }

  @Post("egg-production-records")
  @RequirePermissions(PERMISSIONS.POULTRY_RECORD)
  createEggs(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEggProductionRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createEggs(user, dto, { ipAddress, userAgent });
  }

  @Post("bird-weight-records")
  @RequirePermissions(PERMISSIONS.POULTRY_RECORD)
  createWeight(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBirdWeightRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createWeight(user, dto, { ipAddress, userAgent });
  }

  @Post("medication-records")
  @RequirePermissions(PERMISSIONS.HEALTH_MANAGE)
  createMedication(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMedicationRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createMedication(user, dto, { ipAddress, userAgent });
  }

  @Post("vaccination-records")
  @RequirePermissions(PERMISSIONS.HEALTH_MANAGE)
  createVaccination(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVaccinationRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createVaccination(user, dto, { ipAddress, userAgent });
  }

  @Post("health-observations")
  @RequirePermissions(PERMISSIONS.HEALTH_MANAGE)
  createHealth(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHealthObservationDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createHealthObservation(user, dto, { ipAddress, userAgent });
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  createTransfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePoultryTransferDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createTransfer(user, dto, { ipAddress, userAgent });
  }

  @Patch("transfers/:id/status")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  updateTransfer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdatePoultryTransferStatusDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.updateTransferStatus(user, id, dto, { ipAddress, userAgent });
  }

  @Post("costs")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createCost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePoultryCostRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.createCost(user, dto, { ipAddress, userAgent });
  }

  @Patch("costs/:id/approve")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  approveCost(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.approveCost(user, id, { ipAddress, userAgent });
  }

  @Patch("records/:type/:id")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  updateRecord(@CurrentUser() user: AuthenticatedUser, @Param("type") type: string, @Param("id") id: string, @Body() dto: UpdatePoultryRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.updateRecord(user, type, id, dto as Record<string, any>, { ipAddress, userAgent });
  }

  @Delete("records/:type/:id")
  @RequirePermissions(PERMISSIONS.POULTRY_MANAGE)
  softDelete(@CurrentUser() user: AuthenticatedUser, @Param("type") type: string, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.poultryService.softDelete(user, type, id, { ipAddress, userAgent });
  }

  @Get("reports/summary.csv")
  @RequirePermissions(PERMISSIONS.POULTRY_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: PoultryQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.poultryService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=poultry-summary.csv");
    response.send(csv);
  }
}
