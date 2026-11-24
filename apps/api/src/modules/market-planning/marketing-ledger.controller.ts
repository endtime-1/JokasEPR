import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  CloseMarketingPlanDto,
  CreateMarketingPlanDto,
  LedgerPriceHintQueryDto,
  LedgerScorecardQueryDto,
  LedgerWeekQueryDto,
  MarketingPlanReasonDto,
  SignOffMarketingPlanDto,
  UpdateMarketingPlanDto
} from "./dto/marketing-ledger.dto";
import { MarketingLedgerService } from "./marketing-ledger.service";

// The Marketing Ledger: each marketer's weekly customer plan set against the sales actually
// made. The gate on each route only says "you may take part at all"; who may see or act on
// WHICH plan (own page vs everyone's, approve vs write) is enforced in the service.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("market-planning/ledger")
export class MarketingLedgerController {
  constructor(private readonly ledger: MarketingLedgerService) {}

  @Get("options")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.ledger.options(user);
  }

  @Get("price-hint")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  priceHint(@CurrentUser() user: AuthenticatedUser, @Query() query: LedgerPriceHintQueryDto) {
    return this.ledger.priceHint(user, query);
  }

  @Get("week")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  week(@CurrentUser() user: AuthenticatedUser, @Query() query: LedgerWeekQueryDto) {
    return this.ledger.week(user, query);
  }

  @Get("scorecard")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  scorecard(@CurrentUser() user: AuthenticatedUser, @Query() query: LedgerScorecardQueryDto) {
    return this.ledger.scorecard(user, query);
  }

  @Get("plans/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_READ)
  plan(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.ledger.getPlan(user, id);
  }

  @Post("plans")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMarketingPlanDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.createPlan(user, dto, { ipAddress, userAgent });
  }

  @Patch("plans/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateMarketingPlanDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.updatePlan(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("plans/:id")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.deletePlan(user, id, { ipAddress, userAgent });
  }

  @Patch("plans/:id/submit")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  submit(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.submitPlan(user, id, { ipAddress, userAgent });
  }

  // Approve / send back / sign off stay MANAGE-only, and nobody can act on their own plan.
  @Patch("plans/:id/approve")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  approve(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.approvePlan(user, id, { ipAddress, userAgent });
  }

  @Patch("plans/:id/return")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  returnToDraft(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: MarketingPlanReasonDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.returnPlan(user, id, dto, { ipAddress, userAgent });
  }

  // The marketer files their own week-end report; a manager may close it for them.
  @Patch("plans/:id/close")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_SUBMIT)
  close(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CloseMarketingPlanDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.closePlan(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("plans/:id/sign-off")
  @RequirePermissions(PERMISSIONS.MARKET_PLANNING_MANAGE)
  signOff(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SignOffMarketingPlanDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.ledger.signOffPlan(user, id, dto, { ipAddress, userAgent });
  }
}
