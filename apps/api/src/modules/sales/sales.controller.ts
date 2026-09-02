import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ConvertSalesQuoteDto, CreateCustomerDto, CreateCustomerGroupDto, CreatePaymentDto, CreatePriceListDto, CreateProspectVisitDto, CreateSalesOrderDto, CreateSalesQuoteDto, CreateSalesReturnDto, DecideSalesQuoteDto, ProspectVisitQueryDto, RaiseShortagePurchaseRequestDto, SalesQueryDto, UpdateCustomerDto, UpdateCustomerGroupDto, UpdatePriceListDto, UpdateSalesOrderDto, UpdateSalesQuoteDto } from "./dto/sales.dto";
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

  @Patch("customer-groups/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updateCustomerGroup(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateCustomerGroupDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.updateCustomerGroup(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("customer-groups/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  deleteCustomerGroup(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.deleteCustomerGroup(user, id, { ipAddress, userAgent });
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

  @Patch("customers/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updateCustomer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateCustomerDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.updateCustomer(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("customers/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  deleteCustomer(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.deleteCustomer(user, id, { ipAddress, userAgent });
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

  @Patch("price-lists/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updatePriceList(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdatePriceListDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.updatePriceList(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("price-lists/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  deletePriceList(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.deletePriceList(user, id, { ipAddress, userAgent });
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

  @Patch("orders/:id/confirm")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  confirmOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.confirmOrder(user, id, { ipAddress, userAgent });
  }

  @Patch("orders/:id/approve-stock-release")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  approveStockRelease(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.approveStockRelease(user, id, { ipAddress, userAgent });
  }

  @Get("orders/:id/shortage")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  orderShortage(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.salesService.orderShortage(user, id);
  }

  @Post("orders/:id/raise-purchase-request")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  raiseShortagePurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RaiseShortagePurchaseRequestDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.raiseShortagePurchaseRequest(user, id, dto, { ipAddress, userAgent });
  }

  @Get("orders/:id")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  order(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.salesService.getOrder(user, id);
  }

  @Patch("orders/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updateOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSalesOrderDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.updateSalesOrder(user, id, dto, { ipAddress, userAgent });
  }

  @Patch("orders/:id/cancel")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.cancelSalesOrder(user, id, { ipAddress, userAgent });
  }

  // ── Proforma / Quotations ────────────────────────────────────────────────

  @Get("quotes")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  quotes(@CurrentUser() user: AuthenticatedUser, @Query() query: SalesQueryDto) {
    return this.salesService.listQuotes(user, query);
  }

  @Post("quotes")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  createQuote(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalesQuoteDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.createQuote(user, dto, { ipAddress, userAgent });
  }

  @Get("quotes/:id")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  quote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.salesService.getQuote(user, id);
  }

  @Get("quotes/:id/proforma.pdf")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  async quotePdf(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Res() response: Response) {
    const { buffer, filename } = await this.salesService.quotePdf(user, id);
    response.setHeader("content-type", "application/pdf");
    response.setHeader("content-disposition", `attachment; filename=${filename}`);
    response.send(buffer);
  }

  @Patch("quotes/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updateQuote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSalesQuoteDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.updateQuote(user, id, dto, { ipAddress, userAgent });
  }

  @Delete("quotes/:id")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  deleteQuote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.deleteQuote(user, id, { ipAddress, userAgent });
  }

  @Patch("quotes/:id/send")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  sendQuote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.sendQuote(user, id, { ipAddress, userAgent });
  }

  @Patch("quotes/:id/decision")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  decideQuote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: DecideSalesQuoteDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.decideQuote(user, id, dto, { ipAddress, userAgent });
  }

  @Post("quotes/:id/convert")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  convertQuote(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ConvertSalesQuoteDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.convertQuoteToOrder(user, id, dto, { ipAddress, userAgent });
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

  @Patch("returns/:id/approve")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  approveReturn(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.approveReturn(user, id, { ipAddress, userAgent });
  }

  @Patch("returns/:id/reject")
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  rejectReturn(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.salesService.rejectReturn(user, id, { ipAddress, userAgent });
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

  // ── Prospect Visits ──────────────────────────────────────────────────────

  @Get("prospect-visits/my")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  myProspectVisits(@CurrentUser() user: AuthenticatedUser, @Query() query: ProspectVisitQueryDto) {
    return this.salesService.myProspectVisits(user, query);
  }

  @Get("prospect-visits")
  @RequirePermissions(PERMISSIONS.SALES_READ)
  listProspectVisits(@CurrentUser() user: AuthenticatedUser, @Query() query: ProspectVisitQueryDto) {
    return this.salesService.listProspectVisits(user, query);
  }

  @Post("prospect-visits")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  logProspectVisit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProspectVisitDto, @Req() req: Request) {
    return this.salesService.logProspectVisit(user, dto, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
  }
}

