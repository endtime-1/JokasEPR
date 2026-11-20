import { Body, Controller, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  BankingListQueryDto, CloseReconDto, CreateFromLineDto, CreatePaymentAccountDto, CreateTransferDto, IgnoreLineDto, ImportStatementDto, MakePaymentDto, MatchLineDto,
  PeekStatementDto, ReconQueryDto, ReconReportQueryDto, ReopenReconDto, UpdatePaymentAccountDto
} from "./dto/fin-banking.dto";
import { VoidDto } from "./dto/fin-sales.dto";
import { FinBankPaymentsService } from "./fin-bank-payments.service";
import { FinOnlinePaymentsService } from "./fin-online-payments.service";
import { FinPaymentAccountsService } from "./fin-payment-accounts.service";
import { FinReconciliationService } from "./fin-reconciliation.service";

const P = PERMISSIONS;

/** Finance v2 banking: payment accounts, direct payments, transfers, online payments, statement import and reconciliation. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/banking")
export class FinBankingController {
  constructor(
    private readonly accounts: FinPaymentAccountsService,
    private readonly bank: FinBankPaymentsService,
    private readonly online: FinOnlinePaymentsService,
    private readonly recon: FinReconciliationService
  ) {}

  // ─── payment accounts ──────────────────────────────────────────────────────

  @Get("accounts") @RequirePermissions(P.FIN_BANKING_VIEW)
  async listAccounts(@CurrentUser() u: AuthenticatedUser) {
    return { data: await this.accounts.list(u.companyId) };
  }

  @Post("accounts") @RequirePermissions(P.FIN_BANKING_CREATE)
  async createAccount(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreatePaymentAccountDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.accounts.create(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Patch("accounts/:id") @RequirePermissions(P.FIN_BANKING_CREATE)
  async updateAccount(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentAccountDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.accounts.update(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── direct payments ───────────────────────────────────────────────────────

  @Get("payments") @RequirePermissions(P.FIN_BANKING_VIEW)
  async listPayments(@CurrentUser() u: AuthenticatedUser, @Query() q: BankingListQueryDto) {
    const { rows, total, page, take, totals } = await this.bank.listPayments(u.companyId, q);
    return { data: rows, meta: { total, page, take, totals } };
  }

  @Post("payments") @RequirePermissions(P.FIN_BANKING_POST)
  async makePayment(@CurrentUser() u: AuthenticatedUser, @Body() dto: MakePaymentDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.bank.makePayment(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("payments/:id/void") @RequirePermissions(P.FIN_BANKING_VOID)
  async voidPayment(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.bank.voidPayment(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── transfers ─────────────────────────────────────────────────────────────

  @Get("transfers") @RequirePermissions(P.FIN_BANKING_VIEW)
  async listTransfers(@CurrentUser() u: AuthenticatedUser, @Query() q: BankingListQueryDto) {
    const { rows, total, page, take } = await this.bank.listTransfers(u.companyId, q);
    return { data: rows, meta: { total, page, take } };
  }

  @Post("transfers") @RequirePermissions(P.FIN_BANKING_POST)
  async transfer(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateTransferDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.bank.transfer(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("transfers/:id/void") @RequirePermissions(P.FIN_BANKING_VOID)
  async voidTransfer(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: VoidDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.bank.voidTransfer(u.companyId, u.id, id, dto.reason, { ipAddress: ip, userAgent: ua }) };
  }

  // ─── online payments ───────────────────────────────────────────────────────

  @Get("online/config") @RequirePermissions(P.FIN_BANKING_VIEW)
  onlineConfig() {
    return { data: this.online.config() };
  }

  @Get("online") @RequirePermissions(P.FIN_BANKING_VIEW)
  async listOnline(@CurrentUser() u: AuthenticatedUser, @Query("status") status?: string, @Query("page") page?: string) {
    const { rows, total, take, totals } = await this.online.list(u.companyId, { status, page: page ? Number(page) : 1 });
    return { data: rows, meta: { total, take, totals } };
  }

  @Post("online/:id/retry") @RequirePermissions(P.FIN_BANKING_POST)
  async retryOnline(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.online.retry(u.companyId, id) };
  }

  // ─── statement import and reconciliation ───────────────────────────────────

  @Post("reconciliation/peek") @RequirePermissions(P.FIN_BANKING_CREATE)
  async peek(@Body() dto: PeekStatementDto) {
    return { data: await this.recon.peek(dto) };
  }

  @Post("reconciliation/import/preview") @RequirePermissions(P.FIN_BANKING_CREATE)
  async previewImport(@CurrentUser() u: AuthenticatedUser, @Body() dto: ImportStatementDto) {
    return { data: await this.recon.previewImport(u.companyId, dto) };
  }

  @Post("reconciliation/import") @RequirePermissions(P.FIN_BANKING_CREATE)
  async commitImport(@CurrentUser() u: AuthenticatedUser, @Body() dto: ImportStatementDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.commitImport(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("reconciliation/auto-match") @RequirePermissions(P.FIN_BANKING_CREATE)
  async autoMatch(@CurrentUser() u: AuthenticatedUser, @Body() dto: { paymentAccountId: string }, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.autoMatch(u.companyId, u.id, dto.paymentAccountId, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("reconciliation/lines") @RequirePermissions(P.FIN_BANKING_VIEW)
  async lines(@CurrentUser() u: AuthenticatedUser, @Query() q: ReconQueryDto) {
    const { rows, total, page, take, counts } = await this.recon.listLines(u.companyId, q);
    return { data: rows, meta: { total, page, take, counts } };
  }

  @Get("reconciliation/ledger") @RequirePermissions(P.FIN_BANKING_VIEW)
  async ledgerCandidates(@CurrentUser() u: AuthenticatedUser, @Query("paymentAccountId", ParseUUIDPipe) paymentAccountId: string) {
    return { data: await this.recon.ledgerCandidates(u.companyId, paymentAccountId) };
  }

  @Get("reconciliation/lines/:id/suggestions") @RequirePermissions(P.FIN_BANKING_VIEW)
  async suggestions(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.recon.suggestions(u.companyId, id) };
  }

  @Post("reconciliation/lines/:id/match") @RequirePermissions(P.FIN_BANKING_CREATE)
  async match(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: MatchLineDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.match(u.companyId, u.id, id, dto.journalLineId, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("reconciliation/lines/:id/unmatch") @RequirePermissions(P.FIN_BANKING_CREATE)
  async unmatch(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.unmatch(u.companyId, u.id, id, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("reconciliation/lines/:id/ignore") @RequirePermissions(P.FIN_BANKING_CREATE)
  async ignore(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: IgnoreLineDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.setIgnored(u.companyId, u.id, id, dto.ignore !== false, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("reconciliation/lines/:id/create-transaction") @RequirePermissions(P.FIN_BANKING_POST)
  async createFromLine(@CurrentUser() u: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateFromLineDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.createFromLine(u.companyId, u.id, id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Get("reconciliation/report") @RequirePermissions(P.FIN_BANKING_VIEW)
  async report(@CurrentUser() u: AuthenticatedUser, @Query() q: ReconReportQueryDto) {
    return { data: await this.recon.report(u.companyId, q.paymentAccountId, q.asOf, q.statementBalance) };
  }

  @Get("reconciliation/history") @RequirePermissions(P.FIN_BANKING_VIEW)
  async history(@CurrentUser() u: AuthenticatedUser, @Query("paymentAccountId", ParseUUIDPipe) paymentAccountId: string) {
    return { data: await this.recon.history(u.companyId, paymentAccountId) };
  }

  @Post("reconciliation/close") @RequirePermissions(P.FIN_BANKING_APPROVE)
  async close(@CurrentUser() u: AuthenticatedUser, @Body() dto: CloseReconDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.close(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }

  @Post("reconciliation/reopen") @RequirePermissions(P.FIN_BANKING_APPROVE)
  async reopen(@CurrentUser() u: AuthenticatedUser, @Body() dto: ReopenReconDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return { data: await this.recon.reopen(u.companyId, u.id, dto, { ipAddress: ip, userAgent: ua }) };
  }
}
