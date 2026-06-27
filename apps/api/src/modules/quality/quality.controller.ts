import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { Request } from "express";
import {
  ApproveBatchDto,
  ConditionalPassDto,
  CreateCorrectiveActionDto,
  CreateLabReportDto,
  CreateQualityCheckDto,
  CreateTemplateDto,
  FailCheckDto,
  PassCheckDto,
  QualityQueryDto,
  QuarantineBatchDto,
  RejectBatchDto,
  ResolveCorrectiveActionDto,
  SubmitResultsDto,
  UpdateCorrectiveActionDto,
  UpdateTemplateDto,
  VerifyCorrectiveActionDto,
} from "./dto/quality.dto";
import { QualityService } from "./quality.service";

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] as string };
}

@Controller("quality")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QualityController {
  constructor(private readonly svc: QualityService) {}

  // ─── Dashboard & Options ───────────────────────────────────────────────────

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async dashboard(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.svc.dashboard(user) };
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async options(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.svc.options(user) };
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  @Get("templates")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listTemplates(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listTemplates(user, q) };
  }

  @Get("templates/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async getTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { data: await this.svc.getTemplate(user, id) };
  }

  @Post("templates")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto, @Req() req: Request) {
    return { data: await this.svc.createTemplate(user, dto, ctx(req)) };
  }

  @Patch("templates/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateTemplateDto, @Req() req: Request) {
    return { data: await this.svc.updateTemplate(user, id, dto, ctx(req)) };
  }

  // ─── Quality Checks ────────────────────────────────────────────────────────

  @Get("checks")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listChecks(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listChecks(user, q) };
  }

  @Get("checks/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async getCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { data: await this.svc.getCheck(user, id) };
  }

  @Post("checks")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async createCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQualityCheckDto, @Req() req: Request) {
    return { data: await this.svc.createCheck(user, dto, ctx(req)) };
  }

  @Post("checks/:id/results")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async submitResults(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SubmitResultsDto, @Req() req: Request) {
    return { data: await this.svc.submitResults(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/pass")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async passCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: PassCheckDto, @Req() req: Request) {
    return { data: await this.svc.passCheck(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/fail")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async failCheck(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: FailCheckDto, @Req() req: Request) {
    return { data: await this.svc.failCheck(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/conditional-pass")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async conditionalPass(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ConditionalPassDto, @Req() req: Request) {
    return { data: await this.svc.conditionalPass(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/approve-batch")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async approveBatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ApproveBatchDto, @Req() req: Request) {
    return { data: await this.svc.approveBatch(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/reject-batch")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async rejectBatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectBatchDto, @Req() req: Request) {
    return { data: await this.svc.rejectBatch(user, id, dto, ctx(req)) };
  }

  @Patch("checks/:id/quarantine")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async quarantineBatch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: QuarantineBatchDto, @Req() req: Request) {
    return { data: await this.svc.quarantineBatch(user, id, dto, ctx(req)) };
  }

  // ─── Rejected Batches ─────────────────────────────────────────────────────

  @Get("rejected-batches")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listRejectedBatches(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listRejectedBatches(user, q) };
  }

  // ─── Approved Batches ─────────────────────────────────────────────────────

  @Get("approved-batches")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listApprovedBatches(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listApprovedBatches(user, q) };
  }

  // ─── Lab Reports ──────────────────────────────────────────────────────────

  @Get("lab-reports")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listLabReports(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listLabReports(user, q) };
  }

  @Post("lab-reports")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async createLabReport(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLabReportDto, @Req() req: Request) {
    return { data: await this.svc.createLabReport(user, dto, ctx(req)) };
  }

  // ─── Corrective Actions ───────────────────────────────────────────────────

  @Get("corrective-actions")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async listCorrectiveActions(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.listCorrectiveActions(user, q) };
  }

  @Post("corrective-actions")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async createCorrectiveAction(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCorrectiveActionDto, @Req() req: Request) {
    return { data: await this.svc.createCorrectiveAction(user, dto, ctx(req)) };
  }

  @Patch("corrective-actions/:id")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async updateCorrectiveAction(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateCorrectiveActionDto, @Req() req: Request) {
    return { data: await this.svc.updateCorrectiveAction(user, id, dto, ctx(req)) };
  }

  @Patch("corrective-actions/:id/resolve")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async resolveCorrectiveAction(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveCorrectiveActionDto, @Req() req: Request) {
    return { data: await this.svc.resolveCorrectiveAction(user, id, dto, ctx(req)) };
  }

  @Patch("corrective-actions/:id/verify")
  @RequirePermissions(PERMISSIONS.QUALITY_MANAGE)
  async verifyCorrectiveAction(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: VerifyCorrectiveActionDto, @Req() req: Request) {
    return { data: await this.svc.verifyCorrectiveAction(user, id, dto, ctx(req)) };
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  @Get("reports")
  @RequirePermissions(PERMISSIONS.QUALITY_READ)
  async qualityReport(@CurrentUser() user: AuthenticatedUser, @Query() q: QualityQueryDto) {
    return { data: await this.svc.qualityReport(user, q) };
  }
}
