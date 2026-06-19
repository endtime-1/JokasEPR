import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PERMISSIONS } from "@jokas/shared";
import { AuthenticatedUser } from "@jokas/shared";
import { ProcurementService } from "./procurement.service";
import {
  ApprovePurchaseOrderDto,
  ApprovePurchaseRequestDto,
  CreateGRNDto,
  CreatePerformanceRecordDto,
  CreatePriceHistoryDto,
  CreateProcurementPaymentDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestDto,
  CreateSupplierCategoryDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
  ProcurementQueryDto,
  QualityFailGRNDto,
  QualityPassGRNDto,
  RejectPurchaseOrderDto,
  RejectPurchaseRequestDto,
  UpdateSupplierDto,
} from "./dto/procurement.dto";
import { Request } from "express";

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("api/v1/procurement")
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  // ─── Dashboard & Options ───────────────────────────────────────────────────

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.options(user);
  }

  // ─── Supplier Categories ───────────────────────────────────────────────────

  @Get("supplier-categories")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listSupplierCategories(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listSupplierCategories(user, query);
  }

  @Post("supplier-categories")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createSupplierCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierCategoryDto, @Req() req: Request) {
    return this.svc.createSupplierCategory(user, dto, ctx(req));
  }

  // ─── Suppliers ─────────────────────────────────────────────────────────────

  @Get("suppliers")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listSuppliers(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listSuppliers(user, query);
  }

  @Get("suppliers/:id")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  getSupplier(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getSupplier(user, id);
  }

  @Post("suppliers")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createSupplier(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto, @Req() req: Request) {
    return this.svc.createSupplier(user, dto, ctx(req));
  }

  @Put("suppliers/:id")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  updateSupplier(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSupplierDto, @Req() req: Request) {
    return this.svc.updateSupplier(user, id, dto, ctx(req));
  }

  // ─── Purchase Requests ─────────────────────────────────────────────────────

  @Get("purchase-requests")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listPurchaseRequests(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listPurchaseRequests(user, query);
  }

  @Get("purchase-requests/:id")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  getPurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getPurchaseRequest(user, id);
  }

  @Post("purchase-requests")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createPurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseRequestDto, @Req() req: Request) {
    return this.svc.createPurchaseRequest(user, dto, ctx(req));
  }

  @Patch("purchase-requests/:id/submit")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  submitPurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.submitPurchaseRequest(user, id, ctx(req));
  }

  @Patch("purchase-requests/:id/approve")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  approvePurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApprovePurchaseRequestDto, @Req() req: Request) {
    return this.svc.approvePurchaseRequest(user, id, dto, ctx(req));
  }

  @Patch("purchase-requests/:id/reject")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  rejectPurchaseRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectPurchaseRequestDto, @Req() req: Request) {
    return this.svc.rejectPurchaseRequest(user, id, dto, ctx(req));
  }

  // ─── Purchase Orders ────────────────────────────────────────────────────────

  @Get("purchase-orders")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listPurchaseOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listPurchaseOrders(user, query);
  }

  @Get("purchase-orders/:id")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  getPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getPurchaseOrder(user, id);
  }

  @Post("purchase-orders")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseOrderDto, @Req() req: Request) {
    return this.svc.createPurchaseOrder(user, dto, ctx(req));
  }

  @Patch("purchase-orders/:id/approve")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  approvePurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApprovePurchaseOrderDto, @Req() req: Request) {
    return this.svc.approvePurchaseOrder(user, id, dto, ctx(req));
  }

  @Patch("purchase-orders/:id/reject")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  rejectPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectPurchaseOrderDto, @Req() req: Request) {
    return this.svc.rejectPurchaseOrder(user, id, dto, ctx(req));
  }

  @Patch("purchase-orders/:id/send")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  sendPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.sendPurchaseOrder(user, id, ctx(req));
  }

  // ─── Goods Received Notes ───────────────────────────────────────────────────

  @Get("grns")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listGRNs(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listGRNs(user, query);
  }

  @Get("grns/:id")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  getGRN(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getGRN(user, id);
  }

  @Post("grns")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createGRN(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGRNDto, @Req() req: Request) {
    return this.svc.createGRN(user, dto, ctx(req));
  }

  @Patch("grns/:id/quality-pass")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  qualityPassGRN(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: QualityPassGRNDto, @Req() req: Request) {
    return this.svc.qualityPassGRN(user, id, dto, ctx(req));
  }

  @Patch("grns/:id/quality-fail")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  qualityFailGRN(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: QualityFailGRNDto, @Req() req: Request) {
    return this.svc.qualityFailGRN(user, id, dto, ctx(req));
  }

  @Patch("grns/:id/post")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  postGRN(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.postGRN(user, id, ctx(req));
  }

  // ─── Supplier Invoices ──────────────────────────────────────────────────────

  @Get("invoices")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listInvoices(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listInvoices(user, query);
  }

  @Post("invoices")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createInvoice(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierInvoiceDto, @Req() req: Request) {
    return this.svc.createInvoice(user, dto, ctx(req));
  }

  // ─── Payments ───────────────────────────────────────────────────────────────

  @Get("payments")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listPayments(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listPayments(user, query);
  }

  @Post("payments")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProcurementPaymentDto, @Req() req: Request) {
    return this.svc.createPayment(user, dto, ctx(req));
  }

  // ─── Performance Records ────────────────────────────────────────────────────

  @Get("performance")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listPerformance(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listPerformanceRecords(user, query);
  }

  @Post("performance")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createPerformance(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePerformanceRecordDto, @Req() req: Request) {
    return this.svc.createPerformanceRecord(user, dto, ctx(req));
  }

  // ─── Price History ──────────────────────────────────────────────────────────

  @Get("price-history")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_READ)
  listPriceHistory(@CurrentUser() user: AuthenticatedUser, @Query() query: ProcurementQueryDto) {
    return this.svc.listPriceHistory(user, query);
  }

  @Post("price-history")
  @RequirePermissions(PERMISSIONS.PROCUREMENT_MANAGE)
  createPriceHistory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePriceHistoryDto, @Req() req: Request) {
    return this.svc.createPriceHistory(user, dto, ctx(req));
  }
}
