import { Body, Controller, Delete, Get, Headers, Ip, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { UpdateNotificationConfigDto } from "../notifications/dto/notifications.dto";
import {
  AiSettingsDto,
  BackupSettingsDto,
  CreateBranchSettingDto,
  CreateDepartmentSettingDto,
  CreateExpenseCategorySettingDto,
  CreateFarmSettingDto,
  CreateProductCategorySettingDto,
  CreateProductionSiteSettingDto,
  CreateProductDto,
  CreateUnitOfMeasureSettingDto,
  CreateWarehouseSettingDto,
  DomainListSettingsDto,
  NumberingSettingsDto,
  PoultryPricingSettingsDto,
  ProductListQueryDto,
  TaxSettingsDto,
  UpdateCompanyProfileDto,
  UpdateProductDto,
  UserAccessSettingsDto
} from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

function ctx(ipAddress: string, userAgent?: string) {
  return { ipAddress, userAgent };
}

@Controller("settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.overview(user);
  }

  @Get("company")
  company(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.company(user);
  }

  @Put("company")
  updateCompany(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCompanyProfileDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateCompany(user, dto, ctx(ipAddress, userAgent));
  }

  @Get("master-data")
  masterData(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.masterData(user);
  }

  @Get("options")
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.options(user);
  }

  @Post("branches")
  createBranch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBranchSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createBranch(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("farms")
  createFarm(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFarmSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createFarm(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("warehouses")
  createWarehouse(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWarehouseSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createWarehouse(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("production-sites")
  createProductionSite(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductionSiteSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createProductionSite(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("departments")
  createDepartment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createDepartment(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("units-of-measure")
  createUnitOfMeasure(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitOfMeasureSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createUnitOfMeasure(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("product-categories")
  createProductCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductCategorySettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createProductCategory(user, dto, ctx(ipAddress, userAgent));
  }

  @Post("expense-categories")
  createExpenseCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseCategorySettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createExpenseCategory(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("branches/:id")
  updateBranch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateBranchSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateBranch(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("branches/:id")
  deleteBranch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteBranch(user, id, ctx(ipAddress, userAgent));
  }

  @Put("farms/:id")
  updateFarm(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateFarmSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateFarm(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("farms/:id")
  deleteFarm(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteFarm(user, id, ctx(ipAddress, userAgent));
  }

  @Put("warehouses/:id")
  updateWarehouse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateWarehouseSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateWarehouse(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("warehouses/:id")
  deleteWarehouse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteWarehouse(user, id, ctx(ipAddress, userAgent));
  }

  @Put("production-sites/:id")
  updateProductionSite(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateProductionSiteSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateProductionSite(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("production-sites/:id")
  deleteProductionSite(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteProductionSite(user, id, ctx(ipAddress, userAgent));
  }

  @Put("departments/:id")
  updateDepartment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateDepartmentSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateDepartment(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("departments/:id")
  deleteDepartment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteDepartment(user, id, ctx(ipAddress, userAgent));
  }

  @Put("units-of-measure/:id")
  updateUnitOfMeasure(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateUnitOfMeasureSettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateUnitOfMeasure(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("units-of-measure/:id")
  deleteUnitOfMeasure(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteUnitOfMeasure(user, id, ctx(ipAddress, userAgent));
  }

  @Put("product-categories/:id")
  updateProductCategory(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateProductCategorySettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateProductCategory(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("product-categories/:id")
  deleteProductCategory(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteProductCategory(user, id, ctx(ipAddress, userAgent));
  }

  @Put("expense-categories/:id")
  updateExpenseCategory(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: CreateExpenseCategorySettingDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateExpenseCategory(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("expense-categories/:id")
  deleteExpenseCategory(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteExpenseCategory(user, id, ctx(ipAddress, userAgent));
  }

  @Get("system")
  system(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.settingsMap(user);
  }

  @Put("system/tax")
  updateTax(@CurrentUser() user: AuthenticatedUser, @Body() dto: TaxSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateTax(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/numbering")
  updateNumbering(@CurrentUser() user: AuthenticatedUser, @Body() dto: NumberingSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateNumbering(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/ai")
  updateAi(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateAi(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/backup")
  updateBackup(@CurrentUser() user: AuthenticatedUser, @Body() dto: BackupSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateBackup(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/user-access")
  updateUserAccess(@CurrentUser() user: AuthenticatedUser, @Body() dto: UserAccessSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateUserAccess(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/poultry-types")
  updatePoultryTypes(@CurrentUser() user: AuthenticatedUser, @Body() dto: DomainListSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updatePoultryTypes(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/feed-types")
  updateFeedTypes(@CurrentUser() user: AuthenticatedUser, @Body() dto: DomainListSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateFeedTypes(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("system/poultry-pricing")
  updatePoultryPricing(@CurrentUser() user: AuthenticatedUser, @Body() dto: PoultryPricingSettingsDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updatePoultryPricing(user, dto, ctx(ipAddress, userAgent));
  }

  @Get("notifications")
  notificationConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.notificationConfig(user);
  }

  @Put("notifications")
  updateNotificationConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationConfigDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateNotificationConfig(user, dto, ctx(ipAddress, userAgent));
  }

  @Get("catalog/products")
  listProducts(@CurrentUser() user: AuthenticatedUser, @Query() query: ProductListQueryDto) {
    return this.settings.listProducts(user, query);
  }

  @Post("catalog/products")
  createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.createProduct(user, dto, ctx(ipAddress, userAgent));
  }

  @Put("catalog/products/:id")
  updateProduct(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateProductDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.updateProduct(user, id, dto, ctx(ipAddress, userAgent));
  }

  @Delete("catalog/products/:id")
  deleteProduct(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.settings.deleteProduct(user, id, ctx(ipAddress, userAgent));
  }
}
