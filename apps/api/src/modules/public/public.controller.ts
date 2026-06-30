import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@jokas/shared";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { PublicService } from "./public.service";

@Controller("public")
export class PublicController {
  constructor(private readonly service: PublicService) {}

  /* ── Public storefront endpoints (no auth) ────────────────────────── */

  @Get("products")
  products(@Query("category") category?: string) {
    return this.service.listProducts(category).then((data) => ({ data }));
  }

  @Get("products/:slug")
  product(@Param("slug") slug: string) {
    return this.service.getProduct(slug).then((data) => ({ data }));
  }

  @Post("orders")
  placeOrder(@Body() dto: PlacePublicOrderDto) {
    return this.service.placeOrder(dto).then((data) => ({ data }));
  }

  @Get("orders/:ref")
  orderStatus(@Param("ref") ref: string) {
    return this.service.getOrderStatus(ref).then((data) => ({ data }));
  }

  /* ── Storefront admin endpoints (JWT + SALES_MANAGE required) ────── */

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/products")
  adminProducts(@Query("search") search?: string) {
    return this.service.adminListProducts(search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/products/:id")
  adminUpdateProduct(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.service.adminUpdateProduct(id, body).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/orders")
  adminOrders(@Query("status") status?: string, @Query("search") search?: string) {
    return this.service.adminListOrders(status, search).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Patch("admin/orders/:id/status")
  adminUpdateOrderStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.service.adminUpdateOrderStatus(id, status).then((data) => ({ data }));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  @Get("admin/stats")
  adminStats() {
    return this.service.adminStats().then((data) => ({ data }));
  }
}
