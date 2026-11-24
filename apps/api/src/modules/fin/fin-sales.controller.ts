import { Body, Controller, Delete, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  ApplyDepositDto, CreateCreditNoteDto, CreateInvoiceDto, CreateQuoteDto, DocListQueryDto, InvoiceQueryDto, QuoteQueryDto, RecordDepositDto, RecordReceiptDto,
  RecurringDto, RecurringStateDto, SendEmailDto, StatementQueryDto, UpdateInvoiceDto, UpdateQuoteDto, VoidDto
} from "./dto/fin-sales.dto";
import { FinCreditNotesService } from "./fin-credit-notes.service";
import { FinCustomerPaymentsService } from "./fin-customer-payments.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinQuotesService } from "./fin-quotes.service";
import { FinRecurringService } from "./fin-recurring.service";
import { FinSalesShareService } from "./fin-sales-share.service";
import { FinStatementService } from "./fin-statement.service";

const P = PERMISSIONS;

const pdf = (r: { buffer: Buffer; filename: string }) => new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });

/** Finance v2 sales: quotes, invoices, receipts, deposits, credit notes, recurring invoices, statements. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/sales")
export class FinSalesController {
  constructor(
    private readonly invoices: FinInvoicesService,
    private readonly quotes: FinQuotesService,
    private readonly payments: FinCustomerPaymentsService,
    private readonly creditNotes: FinCreditNotesService,
    private readonly recurring: FinRecurringService,
    private readonly statements: FinStatementService,
    private readonly share: FinSalesShareService
  ) {}

  // ─── invoices ──────────────────────────────────────────────────────────────

  @Get("invoices") @RequirePermissions(P.FIN_SALES_VIEW)
  async listInvoices(@CurrentUser() u: AuthenticatedUser, @Query() q: InvoiceQueryDto) {
    const { rows, total, page, take, totals } = await this.invoices.list(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Get("invoices/:id") @RequirePermissions(P.FIN_SALES_VIEW)
  async getInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.invoices.get(u.companyId, id) };
  }

  @Post("invoices") @RequirePermissions(P.FIN_SALES_CREATE)
  async createInvoice(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateInvoiceDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.invoices.createDraft(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Patch("invoices/:id") @RequirePermissions(P.FIN_SALES_CREATE)
  async updateInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.invoices.updateDraft(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Delete("invoices/:id") @RequirePermissions(P.FIN_SALES_CREATE)
  async deleteInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.invoices.deleteDraft(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua }) };
  }

  /** Issues the invoice and posts it to the ledger. */
  @Post("invoices/:id/send") @RequirePermissions(P.FIN_SALES_POST)
  async sendInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    await this.invoices.send(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua });
    return { data: await this.invoices.get(u.companyId, id) };
  }

  @Post("invoices/:id/void") @RequirePermissions(P.FIN_SALES_VOID)
  async voidInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.invoices.voidInvoice(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("invoices/:id/pdf") @RequirePermissions(P.FIN_SALES_VIEW)
  async invoicePdf(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return pdf(await this.share.invoicePdf(u.companyId, id));
  }

  @Get("invoices/:id/share") @RequirePermissions(P.FIN_SALES_VIEW)
  async invoiceShare(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.share.invoiceShare(u.companyId, id) };
  }

  @Post("invoices/:id/email") @RequirePermissions(P.FIN_SALES_POST)
  async emailInvoice(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendEmailDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.share.emailInvoice(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  /** Issue a new public link (the old one stops working), or switch the link off or on. */
  @Post("invoices/:id/link/:action") @RequirePermissions(P.FIN_SALES_POST)
  async invoiceLink(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Param("action") action: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    const a = action === "disable" || action === "enable" ? action : "regenerate";
    await this.invoices.setLink(u.companyId, u.id, id, a, { ipAddress: ip, userAgent: ua });
    return { data: await this.share.invoiceShare(u.companyId, id) };
  }

  // ─── quotes ────────────────────────────────────────────────────────────────

  @Get("quotes") @RequirePermissions(P.FIN_SALES_VIEW)
  async listQuotes(@CurrentUser() u: AuthenticatedUser, @Query() q: QuoteQueryDto) {
    const { rows, total, page, take, totals } = await this.quotes.list(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Get("quotes/:id") @RequirePermissions(P.FIN_SALES_VIEW)
  async getQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.quotes.get(u.companyId, id) };
  }

  @Post("quotes") @RequirePermissions(P.FIN_SALES_CREATE)
  async createQuote(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateQuoteDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.create(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Patch("quotes/:id") @RequirePermissions(P.FIN_SALES_CREATE)
  async updateQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.update(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Delete("quotes/:id") @RequirePermissions(P.FIN_SALES_CREATE)
  async deleteQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.remove(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("quotes/:id/send") @RequirePermissions(P.FIN_SALES_CREATE)
  async sendQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.send(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("quotes/:id/accept") @RequirePermissions(P.FIN_SALES_CREATE)
  async acceptQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.respond(u.companyId, u.id, id, "ACCEPTED", { ipAddress: ip, userAgent: ua }) };
  }

  @Post("quotes/:id/decline") @RequirePermissions(P.FIN_SALES_CREATE)
  async declineQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.respond(u.companyId, u.id, id, "DECLINED", { ipAddress: ip, userAgent: ua }) };
  }

  @Post("quotes/:id/convert") @RequirePermissions(P.FIN_SALES_CREATE)
  async convertQuote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.quotes.convertToInvoice(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── receipts ──────────────────────────────────────────────────────────────

  @Get("receipts") @RequirePermissions(P.FIN_SALES_VIEW)
  async listReceipts(@CurrentUser() u: AuthenticatedUser, @Query() q: DocListQueryDto) {
    const { rows, total, page, take, totals } = await this.payments.listReceipts(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Get("receipts/:id") @RequirePermissions(P.FIN_SALES_VIEW)
  async getReceipt(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.payments.getReceipt(u.companyId, id) };
  }

  @Post("receipts") @RequirePermissions(P.FIN_SALES_POST)
  async recordReceipt(@CurrentUser() u: AuthenticatedUser, @Body() dto: RecordReceiptDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.payments.recordReceipt(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("receipts/:id/pdf") @RequirePermissions(P.FIN_SALES_VIEW)
  async receiptPdf(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return pdf(await this.share.receiptPdf(u.companyId, id));
  }

  @Get("receipts/:id/share") @RequirePermissions(P.FIN_SALES_VIEW)
  async receiptShare(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.share.receiptShare(u.companyId, id) };
  }

  @Post("receipts/:id/email") @RequirePermissions(P.FIN_SALES_POST)
  async emailReceipt(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendEmailDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.share.emailReceipt(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("receipts/:id/void") @RequirePermissions(P.FIN_SALES_VOID)
  async voidReceipt(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.payments.voidReceipt(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── deposits ──────────────────────────────────────────────────────────────

  @Get("deposits") @RequirePermissions(P.FIN_SALES_VIEW)
  async listDeposits(@CurrentUser() u: AuthenticatedUser, @Query() q: DocListQueryDto) {
    const { rows, total, page, take, totals } = await this.payments.listDeposits(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Get("deposits/:id") @RequirePermissions(P.FIN_SALES_VIEW)
  async getDeposit(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.payments.getDeposit(u.companyId, id) };
  }

  @Post("deposits") @RequirePermissions(P.FIN_SALES_POST)
  async recordDeposit(@CurrentUser() u: AuthenticatedUser, @Body() dto: RecordDepositDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.payments.recordDeposit(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("deposits/:id/apply") @RequirePermissions(P.FIN_SALES_POST)
  async applyDeposit(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ApplyDepositDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.payments.applyDeposit(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("deposits/:id/void") @RequirePermissions(P.FIN_SALES_VOID)
  async voidDeposit(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.payments.voidDeposit(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── credit notes ──────────────────────────────────────────────────────────

  @Get("credit-notes") @RequirePermissions(P.FIN_SALES_VIEW)
  async listCreditNotes(@CurrentUser() u: AuthenticatedUser, @Query() q: DocListQueryDto) {
    const { rows, total, page, take, totals } = await this.creditNotes.list(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Get("credit-notes/:id") @RequirePermissions(P.FIN_SALES_VIEW)
  async getCreditNote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.creditNotes.get(u.companyId, id) };
  }

  @Post("credit-notes") @RequirePermissions(P.FIN_SALES_POST)
  async createCreditNote(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateCreditNoteDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.creditNotes.create(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("credit-notes/:id/void") @RequirePermissions(P.FIN_SALES_VOID)
  async voidCreditNote(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.creditNotes.voidCreditNote(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── recurring ─────────────────────────────────────────────────────────────

  @Get("recurring") @RequirePermissions(P.FIN_SALES_VIEW)
  async listRecurring(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.recurring.list(u.companyId) };
  }

  @Post("recurring") @RequirePermissions(P.FIN_SALES_CREATE)
  async createRecurring(@CurrentUser() u: AuthenticatedUser, @Body() dto: RecurringDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recurring.create(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("recurring/:id/state") @RequirePermissions(P.FIN_SALES_CREATE)
  async recurringState(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RecurringStateDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recurring.setActive(u.companyId, u.id, id, dto.active, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── statements ────────────────────────────────────────────────────────────

  @Get("statements/:contactId") @RequirePermissions(P.FIN_SALES_VIEW)
  async statement(@CurrentUser() u: AuthenticatedUser, @Param("contactId", ParseUUIDPipe) contactId: string, @Query() q: StatementQueryDto) {
    return { data: await this.statements.build(u.companyId, contactId, q.from, q.to) };
  }

  @Get("statements/:contactId/pdf") @RequirePermissions(P.FIN_SALES_VIEW)
  async statementPdf(@CurrentUser() u: AuthenticatedUser, @Param("contactId", ParseUUIDPipe) contactId: string, @Query() q: StatementQueryDto) {
    return pdf(await this.share.statementPdf(u.companyId, contactId, q.from, q.to));
  }

  @Get("statements/:contactId/share") @RequirePermissions(P.FIN_SALES_VIEW)
  async statementShare(@CurrentUser() u: AuthenticatedUser, @Param("contactId", ParseUUIDPipe) contactId: string, @Query() q: StatementQueryDto) {
    return { data: await this.share.statementShare(u.companyId, contactId, q.from, q.to) };
  }

  @Post("statements/:contactId/email") @RequirePermissions(P.FIN_SALES_POST)
  async emailStatement(@CurrentUser() u: AuthenticatedUser, @Param("contactId", ParseUUIDPipe) contactId: string, @Query() q: StatementQueryDto, @Body() dto: SendEmailDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.share.emailStatement(u.companyId, u.id, contactId, q.from, q.to, dto, { ipAddress: ip, userAgent: ua }) };
  }
}
