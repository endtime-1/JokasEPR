import { Body, Controller, Delete, Get, Headers, Ip, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  AccountLedgerQueryDto,
  CreateFinAccountDto,
  CreateJournalDto,
  JournalQueryDto,
  ReverseJournalDto,
  SetPeriodLockDto,
  TrialBalanceQueryDto,
  UpdateFinAccountDto,
  UpdateJournalDto
} from "./dto/fin.dto";
import { FinAccountsService } from "./fin-accounts.service";
import { FinLedgerService } from "./fin-ledger.service";
import { FinReportsService } from "./fin-reports.service";

/** Finance v2 accounting: chart of accounts, journals, period lock, trial balance. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("fin/accounting")
export class FinAccountingController {
  constructor(
    private readonly accounts: FinAccountsService,
    private readonly ledger: FinLedgerService,
    private readonly reports: FinReportsService
  ) {}

  // ─── Chart of accounts ─────────────────────────────────────────────────────

  @Get("accounts")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.accounts.list(user.companyId) };
  }

  @Get("roles")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async roles(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.accounts.roles(user.companyId) };
  }

  @Post("accounts")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_SETTINGS)
  async createAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinAccountDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.accounts.create(user.companyId, user.id, dto, { ipAddress, userAgent }) };
  }

  @Post("accounts/apply-template")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_SETTINGS)
  async applyTemplate(@CurrentUser() user: AuthenticatedUser, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.accounts.applyTemplate(user.companyId, user.id, { ipAddress, userAgent }) };
  }

  @Patch("accounts/:id")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_SETTINGS)
  async updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateFinAccountDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return { data: await this.accounts.update(user.companyId, user.id, id, dto, { ipAddress, userAgent }) };
  }

  // ─── Journals ──────────────────────────────────────────────────────────────

  @Get("journals")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async listJournals(@CurrentUser() user: AuthenticatedUser, @Query() query: JournalQueryDto) {
    const { rows, total, page, take } = await this.ledger.listEntries(user.companyId, query);
    return { data: rows, meta: { total, page, take } };
  }

  @Get("journals/:id")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async getJournal(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.ledger.getEntry(user.companyId, id) };
  }

  @Post("journals")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_CREATE)
  async createJournal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJournalDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.ledger.createDraft(user.companyId, user.id, dto, { ipAddress, userAgent }) };
  }

  @Patch("journals/:id")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_CREATE)
  async updateJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return { data: await this.ledger.updateDraft(user.companyId, user.id, id, dto, { ipAddress, userAgent }) };
  }

  @Delete("journals/:id")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_CREATE)
  async deleteJournal(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.ledger.deleteDraft(user.companyId, user.id, id, { ipAddress, userAgent }) };
  }

  @Post("journals/:id/post")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_POST)
  async postJournal(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.ledger.postDraft(user.companyId, user.id, id, { ipAddress, userAgent }) };
  }

  @Post("journals/:id/reverse")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VOID)
  async reverseJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReverseJournalDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    const reversal = await this.ledger.reverse(user.companyId, user.id, id, dto.reason, { ipAddress, userAgent });
    return { data: await this.ledger.getEntry(user.companyId, reversal.id) };
  }

  // ─── Periods ───────────────────────────────────────────────────────────────

  @Get("periods")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async periods(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.ledger.periodStatus(user.companyId) };
  }

  @Post("periods/lock")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_SETTINGS)
  async setLock(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPeriodLockDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return { data: await this.ledger.setLock(user.companyId, user.id, dto.lockedThrough ?? null, dto.reason, { ipAddress, userAgent }) };
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  @Get("reports/trial-balance")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async trialBalance(@CurrentUser() user: AuthenticatedUser, @Query() query: TrialBalanceQueryDto) {
    return { data: await this.reports.trialBalance(user.companyId, query) };
  }

  @Get("reports/account-ledger/:accountId")
  @RequirePermissions(PERMISSIONS.FIN_ACCOUNTING_VIEW)
  async accountLedger(@CurrentUser() user: AuthenticatedUser, @Param("accountId", ParseUUIDPipe) accountId: string, @Query() query: AccountLedgerQueryDto) {
    return { data: await this.reports.accountLedger(user.companyId, accountId, query) };
  }
}
