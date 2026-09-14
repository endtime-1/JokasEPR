import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  AdjustTargetItemDto,
  ApproveMarketTargetDto,
  CalculateMrpDto,
  ConvertRecommendationDto,
  CreateMarketDto,
  CreateMarketTargetDto,
  CreateProductionExecutionDto,
  GenerateProcurementRecommendationsDto,
  MarketPlanningQueryDto,
  RejectMarketTargetDto,
  UpdateMarketDto,
  UpdateMarketTargetDto
} from "./dto/market-planning.dto";
import { MarketPlanningService } from "./market-planning.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("market-planning")
export class MarketPlanningController {
  constructor(private readonly marketPlanningService: MarketPlanningService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.dashboard(user, query);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.marketPlanningService.options(user);
  }

  @Get("markets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  markets(@CurrentUser() user: AuthenticatedUser) {
    return this.marketPlanningService.listMarkets(user);
  }

  @Get("markets/mine")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  myMarkets(@CurrentUser() user: AuthenticatedUser) {
    return this.marketPlanningService.myMarkets(user);
  }

  @Post("markets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  createMarket(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMarketDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.createMarket(user, dto, { ipAddress, userAgent });
  }

  @Patch("markets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  updateMarket(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateMarketDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.updateMarket(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("markets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  deleteMarket(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.deleteMarket(user, id, { ipAddress, userAgent });
  }

  @Get("targets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  targets(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.listTargets(user, query);
  }

  // A marketer (market-planning.submit, not .manage) can create/edit/submit/
  // delete their own targets — the service layer (resolveMarketForCreate,
  // assertOwnTargetOrManage) does the actual ownership/market enforcement,
  // this gate just says "you're allowed to submit something at all."
  @Post("targets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  createTarget(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.createTarget(user, dto, { ipAddress, userAgent });
  }

  @Get("targets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  target(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.marketPlanningService.getTarget(user, id);
  }

  @Patch("targets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  updateTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.updateTarget(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("targets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  deleteTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.deleteTarget(user, id, { ipAddress, userAgent });
  }

  @Patch("targets/:id/submit")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  submitTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.submitTarget(user, id, { ipAddress, userAgent });
  }

  // Approve/reject stay MANAGE-only — self-approval/self-rejection is
  // blocked in the service regardless (a manager who submitted their own
  // target still needs a different manager to decide it).
  @Patch("targets/:id/approve")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  approveTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.approveTarget(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("targets/:id/reject")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  rejectTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.rejectTarget(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("targets/:targetId/items/:itemId/adjust")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  adjustTargetItem(@CurrentUser() user: AuthenticatedUser, @Param("targetId") targetId: string, @Param("itemId") itemId: string, @Body() dto: AdjustTargetItemDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.adjustTargetItem(user, targetId, itemId, dto, { ipAddress, userAgent });
  }

  @Get("production-plans")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  productionPlans(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.listProductionPlans(user, query);
  }

  @Get("production-plans/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  productionPlan(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.marketPlanningService.getProductionPlan(user, id);
  }

  @Delete("production-plans/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  deleteProductionPlan(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.deleteProductionPlan(user, id, { ipAddress, userAgent });
  }

  @Post("production-plans/:id/mrp")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE, PERMISSIONS.INVENTORY_READ)
  calculateMrp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CalculateMrpDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.calculateMrp(user, id, dto, { ipAddress, userAgent });
  }

  @Get("mrp")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  listMrpRuns(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.listMrpRuns(user, query);
  }

  @Get("mrp/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  mrp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.marketPlanningService.getMrp(user, id);
  }

  @Delete("mrp/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  deleteMrp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.deleteMrp(user, id, { ipAddress, userAgent });
  }

  @Post("mrp/:id/recommendations")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE, PERMISSIONS.PROCUREMENT_READ)
  generateRecommendations(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: GenerateProcurementRecommendationsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.generateProcurementRecommendations(user, id, dto, { ipAddress, userAgent });
  }

  @Get("recommendations")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  recommendations(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.listRecommendations(user, query);
  }

  @Patch("recommendations/:id/cancel")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  cancelRecommendation(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.cancelRecommendation(user, id, { ipAddress, userAgent });
  }

  @Post("recommendations/:id/convert-to-purchase-request")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  convertRecommendation(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ConvertRecommendationDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.convertRecommendationToPurchaseRequest(user, id, dto, { ipAddress, userAgent });
  }

  @Post("executions")
  @RequirePermissions(PERMISSIONS.FEED_MANAGE, PERMISSIONS.INVENTORY_MANAGE)
  createExecution(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductionExecutionDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.createProductionExecution(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/target-vs-actual")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  targetVsActualReport(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.targetVsActualReport(user, query);
  }

  @Get("reports/demand-vs-sales")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  demandVsSalesReport(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.demandVsSalesReport(user, query);
  }
}
