import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Put, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  AddFeedFormulaIngredientDto,
  CreateFeedFormulaDto,
  CreateFeedFormulaVersionDto,
  CreateFeedInternalTransferDto,
  CreateFeedPackagingRecordDto,
  CreateFeedProductionBatchDto,
  CreateFeedProductionCostDto,
  CreateFeedProductionOrderDto,
  CreateFeedQualityCheckDto,
  CreateIngredientDto,
  FeedProductionQueryDto,
  HiproPredictiveQueryDto,
  RecordExternalFeedSaleDto,
  SimulatePredictiveDto,
  UpdateFeedFormulaDto,
  UpdateFeedFormulaIngredientDto,
  UpdateFeedQualityCheckStatusDto,
  UpdateIngredientDto
} from "./dto/feed-production.dto";
import { FeedProductionService } from "./feed-production.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("feed-production")
export class FeedProductionController {
  constructor(private readonly feedProductionService: FeedProductionService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.feedProductionService.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.feedProductionService.options(user);
  }

  @Get("formulas")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  formulas(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listFormulas(user, query);
  }

  @Post("formulas")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  createFormula(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedFormulaDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createFormula(user, dto, { ipAddress, userAgent });
  }

  @Get("formulas/:id/costing")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  formulaCosting(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.formulaCosting(user, id);
  }

  @Get("formulas/:id/versions")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  formulaVersions(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.listFormulaVersions(user, id);
  }

  @Post("formulas/:id/versions")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  createFormulaVersion(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateFeedFormulaVersionDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createVersion(user, id, dto, { ipAddress, userAgent });
  }

  @Post("formulas/:id/ingredients")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  addIngredient(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: AddFeedFormulaIngredientDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.addIngredient(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("formulas/:id")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  updateFormula(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateFeedFormulaDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.updateFormula(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("formulas/:id/ingredients/:ingredientId")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  updateFormulaIngredient(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("ingredientId") ingredientId: string, @Body() dto: UpdateFeedFormulaIngredientDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.updateFormulaIngredient(user, id, ingredientId, dto, { ipAddress, userAgent });
  }

  @Delete("formulas/:id")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  deleteFormula(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.deleteFormula(user, id, { ipAddress, userAgent });
  }

  @Delete("formulas/:id/ingredients/:ingredientId")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  deleteFormulaIngredient(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("ingredientId") ingredientId: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.deleteFormulaIngredient(user, id, ingredientId, { ipAddress, userAgent });
  }

  @Get("formulas/:id")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  formula(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.getFormula(user, id);
  }

  @Get("orders")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  orders(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listOrders(user, query);
  }

  @Post("orders")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedProductionOrderDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createOrder(user, dto, { ipAddress, userAgent });
  }

  @Patch("orders/:id/approve")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  approveOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.approveOrder(user, id, { ipAddress, userAgent });
  }

  @Get("orders/:id/raw-material-availability")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  orderAvailability(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.orderAvailability(user, id, query.warehouseId ?? "");
  }

  @Get("batches")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  batches(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listBatches(user, query);
  }

  @Post("batches")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedProductionBatchDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createBatch(user, dto, { ipAddress, userAgent });
  }

  @Get("batches/:id/label")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  batchLabel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.batchLabel(user, id);
  }

  @Get("batches/:id")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  batch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.getBatch(user, id);
  }

  @Get("raw-material-usage")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  rawMaterialUsage(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listRawMaterialUsage(user, query);
  }

  @Get("quality-checks")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  qualityChecks(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listQualityChecks(user, query);
  }

  @Post("quality-checks")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  createQualityCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedQualityCheckDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createQualityCheck(user, dto, { ipAddress, userAgent });
  }

  @Patch("quality-checks/:id/approve")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  approveQualityCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateFeedQualityCheckStatusDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.approveQualityCheck(user, id, dto, { ipAddress, userAgent });
  }

  @Get("finished-feed-stock")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  finishedFeedStock(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listFinishedFeedStock(user, query);
  }

  @Get("packaging-records")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  packagingRecords(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listPackagingRecords(user, query);
  }

  @Post("packaging-records")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  createPackagingRecord(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedPackagingRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createPackagingRecord(user, dto, { ipAddress, userAgent });
  }

  @Post("costs")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createProductionCost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedProductionCostDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createProductionCost(user, dto, { ipAddress, userAgent });
  }

  @Get("transfers")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  transfers(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto) {
    return this.feedProductionService.listTransfers(user, query);
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createTransfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedInternalTransferDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.createInternalTransfer(user, dto, { ipAddress, userAgent });
  }

  @Post("external-sales")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  recordExternalSale(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordExternalFeedSaleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.feedProductionService.recordExternalSale(user, dto, { ipAddress, userAgent });
  }

  @Get("hipro-predictive")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  hiproPredictive(@CurrentUser() user: AuthenticatedUser, @Query() query: HiproPredictiveQueryDto) {
    return this.feedProductionService.hiproPredictive(user, query.warehouseId);
  }

  @Post("hipro-predictive/simulate")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  simulatePredictive(@CurrentUser() user: AuthenticatedUser, @Body() dto: SimulatePredictiveDto) {
    return this.feedProductionService.simulatePredictive(user, dto);
  }

  @Get("reports/summary.csv")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedProductionQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.feedProductionService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=feed-production-summary.csv");
    response.send(csv);
  }

  // ── Ingredient (Raw Material) Management ─────────────────────────────────────

  @Get("ingredients")
  @RequirePermissions(PERMISSIONS.FEED_READ)
  listIngredients(@CurrentUser() user: AuthenticatedUser) {
    return this.feedProductionService.listIngredients(user);
  }

  @Post("ingredients")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  createIngredient(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIngredientDto) {
    return this.feedProductionService.createIngredient(user, dto);
  }

  @Put("ingredients/:id")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  updateIngredient(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateIngredientDto) {
    return this.feedProductionService.updateIngredient(user, id, dto);
  }

  @Delete("ingredients/:id")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE)
  deleteIngredient(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.feedProductionService.deleteIngredient(user, id);
  }
}
