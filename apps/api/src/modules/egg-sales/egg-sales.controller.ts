import { Body, Controller, Delete, Get, Headers, Ip, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateEggSaleDto, EggSalesQueryDto } from "./dto/egg-sales.dto";
import { EggSalesService } from "./egg-sales.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("egg-sales")
export class EggSalesController {
  constructor(private readonly eggSalesService: EggSalesService) {}

  @Get("options")
  @RequirePermissions(PERMISSIONS.EGG_SALES_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.eggSalesService.options(user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.EGG_SALES_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: EggSalesQueryDto) {
    return this.eggSalesService.listSales(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EGG_SALES_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEggSaleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.eggSalesService.createSale(user, dto, { ipAddress, userAgent });
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.EGG_SALES_MANAGE)
  voidSale(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.eggSalesService.voidSale(user, id, { ipAddress, userAgent });
  }
}
