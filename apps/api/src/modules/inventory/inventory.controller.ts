import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  ApproveStockDto,
  CreateInventoryItemDto,
  CreateWarehouseLocationDto,
  InventoryQueryDto,
  MobileStockMovementDto,
  RefreshAlertsDto,
  SetReorderLevelDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  StockReservationDto,
  StockTransferDto
} from "./dto/inventory.dto";
import { InventoryService } from "./inventory.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.options(user);
  }

  @Get("products")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  products(@CurrentUser() user: AuthenticatedUser, @Query("type") type?: string) {
    return this.inventoryService.listProducts(user, type);
  }

  @Get("items")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  items(@CurrentUser() user: AuthenticatedUser, @Query() query: InventoryQueryDto) {
    return this.inventoryService.listItems(user, query);
  }

  @Post("items")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInventoryItemDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.createItem(user, dto, { ipAddress, userAgent });
  }

  @Post("stock-movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createStockMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: MobileStockMovementDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.createStockMovement(user, dto, { ipAddress, userAgent });
  }

  @Post("stock-in")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  stockIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockInDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.stockIn(user, dto, { ipAddress, userAgent });
  }

  @Post("stock-out")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  stockOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockOutDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.stockOut(user, dto, { ipAddress, userAgent });
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockTransferDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.transfer(user, dto, { ipAddress, userAgent });
  }

  @Post("adjustments")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  adjustment(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockAdjustmentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.createAdjustment(user, dto, { ipAddress, userAgent });
  }

  @Patch("adjustments/:id/approve")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  approveAdjustment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveStockDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.approveAdjustment(user, id, dto, { ipAddress, userAgent });
  }

  @Post("reservations")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  reserve(@CurrentUser() user: AuthenticatedUser, @Body() dto: StockReservationDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.reserve(user, dto, { ipAddress, userAgent });
  }

  @Post("locations")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWarehouseLocationDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.inventoryService.createLocation(user, dto, { ipAddress, userAgent });
  }

  @Post("reorder-levels")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  setReorderLevel(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetReorderLevelDto) {
    return this.inventoryService.setReorderLevel(user, dto);
  }

  @Get("movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  movements(@CurrentUser() user: AuthenticatedUser, @Query() query: InventoryQueryDto) {
    return this.inventoryService.movements(user, query);
  }

  @Get("low-stock")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  lowStock(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.lowStock(user);
  }

  @Get("expiry-alerts")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  expiryAlerts(@CurrentUser() user: AuthenticatedUser, @Query() query: InventoryQueryDto) {
    return this.inventoryService.expiryAlerts(user, query);
  }

  @Post("expiry-alerts/refresh")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  refreshExpiryAlerts(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshAlertsDto) {
    return this.inventoryService.refreshExpiryAlerts(user, dto);
  }

  @Get("valuation")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  valuation(@CurrentUser() user: AuthenticatedUser, @Query() query: InventoryQueryDto) {
    return this.inventoryService.valuation(user, query);
  }

  @Get("warehouses/:warehouseId")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  warehouseView(@CurrentUser() user: AuthenticatedUser, @Param("warehouseId") warehouseId: string) {
    return this.inventoryService.warehouseView(user, warehouseId);
  }

  @Get("farms/:farmId")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  farmView(@CurrentUser() user: AuthenticatedUser, @Param("farmId") farmId: string) {
    return this.inventoryService.farmView(user, farmId);
  }

  @Get("production-sites/:productionSiteId")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  productionSiteView(@CurrentUser() user: AuthenticatedUser, @Param("productionSiteId") productionSiteId: string) {
    return this.inventoryService.productionSiteView(user, productionSiteId);
  }

  @Get("reports/valuation.csv")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: InventoryQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.inventoryService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=inventory-valuation.csv");
    response.send(csv);
  }
}
