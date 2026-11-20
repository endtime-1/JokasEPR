import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CloseSessionDto, CreateRefundDto, CreateRegisterDto, CreateSaleDto, OpenSessionDto, PosListQueryDto, PosReportQueryDto, QuoteCartDto, UpdatePosSettingsDto, UpdateRegisterDto } from "./dto/fin-pos.dto";
import { FinItemsService } from "./fin-items.service";
import { FinPosReceiptService } from "./fin-pos-receipt.service";
import { FinPosService, PosPowers, PosUser } from "./fin-pos.service";

const P = PERMISSIONS;

const asUser = (u: AuthenticatedUser): PosUser => ({ id: u.id, fullName: u.fullName || u.email, companyId: u.companyId });
/** A supervisor can override a price, give a big discount, approve a refund, and let a sale go below zero stock. */
const powers = (u: AuthenticatedUser): PosPowers => ({ supervisor: u.hasGlobalAccess || u.permissions.includes(P.FIN_POS_APPROVE) });

/**
 * Finance v2 point of sale. Permissions: view = see sales, tills and reports; create = open and close a till;
 * post = ring up sales; void = refunds; approve = supervisor powers, tills and POS settings.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/pos")
export class FinPosController {
  constructor(private readonly pos: FinPosService, private readonly items: FinItemsService, private readonly receipts: FinPosReceiptService) {}

  // ─── settings and tills ────────────────────────────────────────────────────

  @Get("settings") @RequirePermissions(P.FIN_POS_VIEW)
  async settings(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.pos.settings(u.companyId) };
  }

  @Put("settings") @RequirePermissions(P.FIN_POS_APPROVE)
  async updateSettings(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpdatePosSettingsDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.updateSettings(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("registers") @RequirePermissions(P.FIN_POS_VIEW)
  async registers(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.pos.registers(u.companyId) };
  }

  @Post("registers") @RequirePermissions(P.FIN_POS_APPROVE)
  async createRegister(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateRegisterDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.createRegister(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Patch("registers/:id") @RequirePermissions(P.FIN_POS_APPROVE)
  async updateRegister(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateRegisterDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.updateRegister(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── till sessions ─────────────────────────────────────────────────────────

  @Get("sessions/current") @RequirePermissions(P.FIN_POS_VIEW)
  async current(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.pos.currentSession(u.companyId, u.id) };
  }

  @Get("sessions") @RequirePermissions(P.FIN_POS_VIEW)
  async sessions(@CurrentUser() u: AuthenticatedUser, @Query() q: PosListQueryDto) {
    const { rows, total, page, take } = await this.pos.sessions(u.companyId, q);
    return { data: rows, meta: { total, page, take } };
  }

  @Post("sessions/open") @RequirePermissions(P.FIN_POS_CREATE)
  async open(@CurrentUser() u: AuthenticatedUser, @Body() dto: OpenSessionDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.openSession(u.companyId, asUser(u), dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("sessions/:id") @RequirePermissions(P.FIN_POS_VIEW)
  async session(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.pos.getSession(u.companyId, id) };
  }

  @Post("sessions/:id/close") @RequirePermissions(P.FIN_POS_CREATE)
  async close(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CloseSessionDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.closeSession(u.companyId, asUser(u), id, dto, powers(u), { ipAddress: ip, userAgent: ua }) };
  }

  // ─── the item picker (so a cashier needs no access to the items screens) ───

  @Get("items") @RequirePermissions(P.FIN_POS_POST)
  async itemList(@CurrentUser() u: AuthenticatedUser, @Query("search") search?: string, @Query("category") category?: string) {
    const { rows } = await this.items.list(u.companyId, { search, category, take: 60 });
    return { data: rows };
  }

  /** A barcode scan or a typed code or name: an exact barcode/SKU match wins. */
  @Get("items/lookup") @RequirePermissions(P.FIN_POS_POST)
  async lookup(@CurrentUser() u: AuthenticatedUser, @Query("code") code = "") {
    return { data: await this.items.lookup(u.companyId, code) };
  }

  // ─── sales and refunds ─────────────────────────────────────────────────────

  /** The exact total of a cart (tax, discounts, rounding) and any stock warnings, so the till can show change before payment. */
  @Post("quote") @RequirePermissions(P.FIN_POS_POST)
  async quote(@CurrentUser() u: AuthenticatedUser, @Body() dto: QuoteCartDto) {
    return { data: await this.pos.quote(u.companyId, dto, powers(u)) };
  }

  @Post("sales") @RequirePermissions(P.FIN_POS_POST)
  async sell(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateSaleDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.sell(u.companyId, asUser(u), dto, powers(u), { ipAddress: ip, userAgent: ua }) };
  }

  @Get("sales") @RequirePermissions(P.FIN_POS_VIEW)
  async sales(@CurrentUser() u: AuthenticatedUser, @Query() q: PosListQueryDto) {
    const { rows, total, page, take } = await this.pos.listSales(u.companyId, q);
    return { data: rows, meta: { total, page, take } };
  }

  @Get("sales/:id") @RequirePermissions(P.FIN_POS_VIEW)
  async sale(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.pos.getSale(u.companyId, id) };
  }

  /** The receipt as data (for the screen and the 80 mm print layout). */
  @Get("sales/:id/receipt") @RequirePermissions(P.FIN_POS_VIEW)
  async receipt(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.receipts.data(u.companyId, id) };
  }

  @Get("sales/:id/pdf") @RequirePermissions(P.FIN_POS_VIEW)
  async receiptPdf(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    const r = await this.receipts.pdf(u.companyId, id);
    return new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });
  }

  /** The public link and a WhatsApp link. A phone number can be typed at the till; otherwise the customer's own is used. */
  @Get("sales/:id/share") @RequirePermissions(P.FIN_POS_VIEW)
  async share(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Query("phone") phone?: string) {
    return { data: await this.receipts.share(u.companyId, id, phone) };
  }

  @Post("refunds") @RequirePermissions(P.FIN_POS_VOID)
  async refund(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateRefundDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.pos.refund(u.companyId, asUser(u), dto, powers(u), { ipAddress: ip, userAgent: ua }) };
  }

  // ─── reports ───────────────────────────────────────────────────────────────

  @Get("report") @RequirePermissions(P.FIN_POS_VIEW)
  async report(@CurrentUser() u: AuthenticatedUser, @Query() q: PosReportQueryDto) {
    return { data: await this.pos.report(u.companyId, q) };
  }
}
