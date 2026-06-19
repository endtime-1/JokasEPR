import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateCustomerDto, CreateCustomerGroupDto, CreatePaymentDto, CreatePriceListDto, CreateSalesOrderDto, CreateSalesReturnDto, SalesQueryDto } from "./dto/sales.dto";
import { SalesService } from "./sales.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.dashboard(user, query);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.options(user);
  }

  @Get("customer-groups")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  customerGroups(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listCustomerGroups(user, query);
  }

  @Post("customer-groups")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createCustomerGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerGroupDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createCustomerGroup(user, dto, { ipAddress, userAgent });
  }

  @Get("customers")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  customers(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listCustomers(user, query);
  }

  @Post("customers")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createCustomer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createCustomer(user, dto, { ipAddress, userAgent });
  }

  @Get("customers/:id")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  customer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.salesService.getCustomer(user, id);
  }

  @Get("price-lists")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  priceLists(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listPriceLists(user, query);
  }

  @Post("price-lists")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createPriceList(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePriceListDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createPriceList(user, dto, { ipAddress, userAgent });
  }

  @Get("orders")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  orders(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listOrders(user, query);
  }

  @Post("orders")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalesOrderDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createOrder(user, dto, { ipAddress, userAgent });
  }

  @Patch("orders/:id/approve-stock-release")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  approveStockRelease(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.approveStockRelease(user, id, { ipAddress, userAgent });
  }

  @Get("invoices")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  invoices(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listInvoices(user, query);
  }

  @Get("payments")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  payments(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listPayments(user, query);
  }

  @Post("payments")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createPayment(user, dto, { ipAddress, userAgent });
  }

  @Get("receipts")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  receipts(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listReceipts(user, query);
  }

  @Get("returns")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  returns(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listReturns(user, query);
  }

  @Post("returns")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createReturn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalesReturnDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createReturn(user, dto, { ipAddress, userAgent });
  }

  @Get("debtors")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  debtors(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.debtors(user, query);
  }

  @Get("statements")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  statements(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.statements(user, query);
  }

  @Get("delivery-notes")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  deliveryNotes(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listDeliveryNotes(user, query);
  }

  @Get("reports")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  reports(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.reports(user, query);
  }

  @Get("reports/summary.csv")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  async reportCsv(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.salesService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=sales-summary.csv");
    response.send(csv);
  }
}

