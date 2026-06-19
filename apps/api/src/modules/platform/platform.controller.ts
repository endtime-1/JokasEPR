import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS, AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { RequireScopeAccess } from "../../common/decorators/scope-access.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ScopeAccessGuard } from "../../common/guards/scope-access.guard";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { CreateFarmDto } from "./dto/create-farm.dto";
import { CreateProductionSiteDto } from "./dto/create-production-site.dto";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { PlatformService } from "./platform.service";

@UseGuards(JwtAuthGuard, PermissionsGuard, ScopeAccessGuard)
@RequirePermissions(PERMISSIONS.PLATFORM_READ)
@Controller("platform")
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.summary(user);
  }

  @Get("branches")
  branches(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listBranches(user);
  }

  @Post("branches")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.createBranch(user, dto, { ipAddress, userAgent });
  }

  @Get("farms")
  farms(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listFarms(user);
  }

  @Post("farms")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @RequireScopeAccess({ branchId: "branchId" })
  createFarm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFarmDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.createFarm(user, dto, { ipAddress, userAgent });
  }

  @Get("production-sites")
  productionSites(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listProductionSites(user);
  }

  @Post("production-sites")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @RequireScopeAccess({ branchId: "branchId" })
  createProductionSite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionSiteDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.createProductionSite(user, dto, { ipAddress, userAgent });
  }

  @Get("warehouses")
  warehouses(@CurrentUser() user: AuthenticatedUser) {
    return this.platformService.listWarehouses(user);
  }

  @Post("warehouses")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @RequireScopeAccess({ branchId: "branchId", farmId: "farmId", productionSiteId: "productionSiteId" })
  createWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWarehouseDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.createWarehouse(user, dto, { ipAddress, userAgent });
  }
}

