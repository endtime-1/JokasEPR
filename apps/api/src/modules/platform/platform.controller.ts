import { Body, Controller, Delete, Get, Headers, Ip, Param, Post, Put, UseGuards } from "@nestjs/common";
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
import { UpdateBranchDto } from "./dto/update-branch.dto";
import { UpdateFarmDto } from "./dto/update-farm.dto";
import { UpdateProductionSiteDto } from "./dto/update-production-site.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
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

  @Put("branches/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  updateBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateBranchDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.updateBranch(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("branches/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  deleteBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.deleteBranch(user, id, { ipAddress, userAgent });
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

  @Put("farms/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  updateFarm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateFarmDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.updateFarm(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("farms/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  deleteFarm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.deleteFarm(user, id, { ipAddress, userAgent });
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

  @Put("production-sites/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  updateProductionSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductionSiteDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.updateProductionSite(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("production-sites/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  deleteProductionSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.deleteProductionSite(user, id, { ipAddress, userAgent });
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

  @Put("warehouses/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  updateWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateWarehouseDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.updateWarehouse(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("warehouses/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  deleteWarehouse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.platformService.deleteWarehouse(user, id, { ipAddress, userAgent });
  }
}

