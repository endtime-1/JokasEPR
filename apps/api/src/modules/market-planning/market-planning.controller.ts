import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
  CreateMarketTargetDto,
  CreateProductionExecutionDto,
  GenerateProcurementRecommendationsDto,
  MarketPlanningQueryDto
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

  @Get("targets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  targets(@CurrentUser() user: AuthenticatedUser, @Query() query: MarketPlanningQueryDto) {
    return this.marketPlanningService.listTargets(user, query);
  }

  @Post("targets")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  createTarget(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.createTarget(user, dto, { ipAddress, userAgent });
  }

  @Get("targets/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  target(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.marketPlanningService.getTarget(user, id);
  }

  @Patch("targets/:id/submit")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  submitTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.submitTarget(user, id, { ipAddress, userAgent });
  }

  @Patch("targets/:id/approve")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  approveTarget(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveMarketTargetDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.approveTarget(user, id, dto, { ipAddress, userAgent });
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

  @Post("production-plans/:id/mrp")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE, PERMISSIONS.INVENTORY_READ)
  calculateMrp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CalculateMrpDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.marketPlanningService.calculateMrp(user, id, dto, { ipAddress, userAgent });
  }

  @Get("mrp/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  mrp(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.marketPlanningService.getMrp(user, id);
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
