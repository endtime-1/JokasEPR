import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
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

type RequestContext = { ipAddress?: string; userAgent?: string };

function nextRef(prefix: string, count: number) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

const templateIncludes = {
  parameters: { where: { templateId: undefined }, orderBy: { sortOrder: "asc" as const } },
};

const checkIncludes = {
  template: { select: { id: true, name: true, checkType: true } },
  inspector: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
  results: {
    include: { parameter: { select: { id: true, name: true, paramCode: true, unit: true, minValue: true, maxValue: true, expectedValue: true } } },
  },
  labReports: { where: { deletedAt: null } },
  rejectedBatch: true,
  approvedBatch: { include: { stockBatch: { select: { id: true, batchNumber: true } } } },
  correctiveActions: { where: { deletedAt: null }, include: { assignedTo: { select: { id: true, fullName: true } } } },
};

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  // â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async dashboard(user: AuthenticatedUser) {
    const cid = user.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [
      totalChecks,
      pendingChecks,
      passedChecks,
      failedChecks,
      rejectedBatches,
      approvedBatches,
      openCorrectiveActions,
      overdueActions,
      recentChecks,
    ] = await Promise.all([
      this.prisma.qualityCheck.count({ where: { companyId: cid, deletedAt: null } }),
      this.prisma.qualityCheck.count({ where: { companyId: cid, deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
      this.prisma.qualityCheck.count({ where: { companyId: cid, deletedAt: null, status: "PASSED" } }),
      this.prisma.qualityCheck.count({ where: { companyId: cid, deletedAt: null, status: "FAILED" } }),
      this.prisma.rejectedBatch.count({ where: { companyId: cid, deletedAt: null } }),
      this.prisma.approvedBatch.count({ where: { companyId: cid, deletedAt: null } }),
      this.prisma.correctiveAction.count({ where: { companyId: cid, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      this.prisma.correctiveAction.count({ where: { companyId: cid, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: today } } }),
      this.prisma.qualityCheck.findMany({
        where: { companyId: cid, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { template: { select: { name: true } }, inspector: { select: { fullName: true } } },
      }),
    ]);
    return { totalChecks, pendingChecks, passedChecks, failedChecks, rejectedBatches, approvedBatches, openCorrectiveActions, overdueActions, recentChecks };
  }

  // â”€â”€â”€ Options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async options(user: AuthenticatedUser) {
    const cid = user.companyId;
    const cacheKey = `quality:opts:${cid}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;
    const [templates, branches, farms, warehouses, productionSites, suppliers, users] = await Promise.all([
      this.prisma.qualityCheckTemplate.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, checkType: true } }),
      this.prisma.branch.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true } }),
      this.prisma.farm.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true } }),
      this.prisma.warehouse.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true } }),
      this.prisma.productionSite.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true } }),
      this.prisma.supplier.findMany({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, name: true } }),
      this.prisma.user.findMany({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true } }),
    ]);
    const result = { templates, branches, farms, warehouses, productionSites, suppliers, users };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  // â”€â”€â”€ Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listTemplates(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.checkType) where.checkType = q.checkType;
    if (q.search) where.name = { contains: q.search };
    return this.prisma.qualityCheckTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { parameters: true, checks: true } } },
    });
  }

  async getTemplate(user: AuthenticatedUser, id: string) {
    const t = await this.prisma.qualityCheckTemplate.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { parameters: { orderBy: { sortOrder: "asc" } } },
    });
    if (!t) throw new NotFoundException("Template not found");
    return t;
  }

  async createTemplate(user: AuthenticatedUser, dto: CreateTemplateDto, ctx: RequestContext) {
    const cid = user.companyId;
    const exists = await this.prisma.qualityCheckTemplate.findFirst({ where: { companyId: cid, code: dto.code, deletedAt: null } });
    if (exists) throw new BadRequestException(`Template code ${dto.code} already exists`);

    const template = await this.prisma.qualityCheckTemplate.create({
      data: {
        companyId: cid,
        code: dto.code,
        name: dto.name,
        checkType: dto.checkType,
        description: dto.description,
        isActive: dto.isActive ?? true,
        createdById: user.id,
        parameters: (dto.parameters?.length
          ? {
              create: dto.parameters.map((p, i) => ({
                companyId: cid,
                paramCode: p.paramCode,
                name: p.name,
                paramType: p.paramType ?? "NUMERIC",
                unit: p.unit,
                minValue: p.minValue,
                maxValue: p.maxValue,
                expectedValue: p.expectedValue,
                isRequired: p.isRequired ?? true,
                sortOrder: p.sortOrder ?? i,
                notes: p.notes,
                createdById: user.id,
              })),
            }
          : undefined) as never,
      },
      include: { parameters: true },
    });

    await this.audit.write({ companyId: cid, actorUserId: user.id, action: "CREATE", entityType: "QualityCheckTemplate", entityId: template.id, ...ctx });
    return template;
  }

  async updateTemplate(user: AuthenticatedUser, id: string, dto: UpdateTemplateDto, ctx: RequestContext) {
    const t = await this.prisma.qualityCheckTemplate.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!t) throw new NotFoundException("Template not found");
    const updated = await this.prisma.qualityCheckTemplate.update({
      where: { id },
      data: { ...dto, updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheckTemplate", entityId: id, ...ctx });
    return updated;
  }

  async addParameter(user: AuthenticatedUser, templateId: string, dto: CreateQualityCheckDto & { paramCode: string; name: string }, ctx: RequestContext) {
    const t = await this.prisma.qualityCheckTemplate.findFirst({ where: { id: templateId, companyId: user.companyId, deletedAt: null } });
    if (!t) throw new NotFoundException("Template not found");
    const param = await this.prisma.qualityCheckParameter.create({
      data: { companyId: user.companyId, templateId, ...(dto as unknown as Record<string, unknown>), createdById: user.id } as never,
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "QualityCheckParameter", entityId: param.id, ...ctx });
    return param;
  }

  // â”€â”€â”€ Quality Checks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listChecks(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.checkType) where.checkType = q.checkType;
    if (q.status) where.status = q.status;
    if (q.decision) where.decision = q.decision;
    if (q.branchId) where.branchId = q.branchId;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(q.dateTo + "T23:59:59");
    }
    const page = Math.max(1, parseInt(q.page ?? "1", 10));
    const limit = Math.min(100, parseInt(q.limit ?? "50", 10));
    const [total, items] = await Promise.all([
      this.prisma.qualityCheck.count({ where }),
      this.prisma.qualityCheck.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          template: { select: { id: true, name: true } },
          inspector: { select: { id: true, fullName: true } },
          branch: { select: { id: true, name: true } },
          _count: { select: { results: true, labReports: true, correctiveActions: true } },
        },
      }),
    ]);
    return { total, page, limit, items };
  }

  async getCheck(user: AuthenticatedUser, id: string) {
    const check = await this.prisma.qualityCheck.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: checkIncludes,
    });
    if (!check) throw new NotFoundException("Quality check not found");
    return check;
  }

  async createCheck(user: AuthenticatedUser, dto: CreateQualityCheckDto, ctx: RequestContext) {
    const cid = user.companyId;
    const count = await this.prisma.qualityCheck.count({ where: { companyId: cid } });
    const reference = nextRef("QC", count);

    let totalParameters = 0;
    if (dto.templateId) {
      totalParameters = await this.prisma.qualityCheckParameter.count({ where: { templateId: dto.templateId } });
    }

    const check = await this.prisma.qualityCheck.create({
      data: {
        companyId: cid,
        reference,
        checkType: dto.checkType,
        templateId: dto.templateId,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        batchNumber: dto.batchNumber,
        status: "IN_PROGRESS",
        inspectorId: dto.inspectorId ?? user.id,
        checkedAt: dto.checkedAt ? new Date(dto.checkedAt) : new Date(),
        summary: dto.summary,
        notes: dto.notes,
        branchId: dto.branchId,
        farmId: dto.farmId,
        warehouseId: dto.warehouseId,
        productionSiteId: dto.productionSiteId,
        totalParameters,
        createdById: user.id,
        results: dto.results?.length
          ? {
              create: dto.results.map((r) => ({
                companyId: cid,
                parameterId: r.parameterId,
                actualValue: r.actualValue,
                passed: r.passed ?? false,
                deviation: r.deviation,
                remarks: r.remarks,
              })),
            }
          : undefined,
      },
      include: checkIncludes,
    });

    await this.audit.write({ companyId: cid, actorUserId: user.id, action: "CREATE", entityType: "QualityCheck", entityId: check.id, ...ctx });
    return check;
  }

  async submitResults(user: AuthenticatedUser, id: string, dto: SubmitResultsDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");
    if (check.status === "PASSED" || check.status === "FAILED") throw new BadRequestException("Check already finalised");

    await this.prisma.$transaction(async (tx) => {
      for (const r of dto.results) {
        await tx.qualityInspectionResult.upsert({
          where: { checkId_parameterId: { checkId: id, parameterId: r.parameterId } },
          update: { actualValue: r.actualValue, passed: r.passed ?? false, deviation: r.deviation, remarks: r.remarks },
          create: { companyId: user.companyId, checkId: id, parameterId: r.parameterId, actualValue: r.actualValue, passed: r.passed ?? false, deviation: r.deviation, remarks: r.remarks },
        });
      }
      const allResults = await tx.qualityInspectionResult.findMany({ where: { checkId: id } });
      const passed = allResults.filter((r) => r.passed).length;
      const total = allResults.length;
      const score = total > 0 ? (passed / total) * 100 : 0;
      await tx.qualityCheck.update({
        where: { id },
        data: { passedParameters: passed, totalParameters: total, overallScore: score, summary: dto.summary, notes: dto.notes, updatedById: user.id },
      });
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheck", entityId: id, ...ctx });
    return this.getCheck(user, id);
  }

  async passCheck(user: AuthenticatedUser, id: string, dto: PassCheckDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");
    if (check.status === "PASSED" || check.status === "FAILED") throw new BadRequestException("Check already finalised");

    const updated = await this.prisma.qualityCheck.update({
      where: { id },
      data: {
        status: "PASSED",
        decision: "APPROVED",
        overallScore: dto.overallScore,
        notes: dto.notes,
        approvedById: user.id,
        approvedAt: new Date(),
        updatedById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheck", entityId: id, ...ctx });
    return updated;
  }

  async failCheck(user: AuthenticatedUser, id: string, dto: FailCheckDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");
    if (check.status === "PASSED" || check.status === "FAILED") throw new BadRequestException("Check already finalised");

    const updated = await this.prisma.qualityCheck.update({
      where: { id },
      data: {
        status: "FAILED",
        decision: "REJECTED",
        overallScore: dto.overallScore,
        notes: dto.notes ?? dto.reason,
        approvedById: user.id,
        approvedAt: new Date(),
        updatedById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheck", entityId: id, ...ctx });
    return updated;
  }

  async conditionalPass(user: AuthenticatedUser, id: string, dto: ConditionalPassDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");
    const updated = await this.prisma.qualityCheck.update({
      where: { id },
      data: { status: "CONDITIONALLY_PASSED", decision: "CONDITIONALLY_APPROVED", notes: `Conditions: ${dto.conditions}. ${dto.notes ?? ""}`.trim(), overallScore: dto.overallScore, approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheck", entityId: id, ...ctx });
    return updated;
  }

  // â”€â”€â”€ Batch Approve / Reject / Quarantine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async approveBatch(user: AuthenticatedUser, checkId: string, dto: ApproveBatchDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id: checkId, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");

    const existing = await this.prisma.approvedBatch.findFirst({ where: { checkId } });
    if (existing) throw new BadRequestException("Batch already approved");

    const count = await this.prisma.approvedBatch.count({ where: { companyId: user.companyId } });
    const reference = nextRef("APB", count);

    const batch = await this.prisma.$transaction(async (tx) => {
      const ab = await tx.approvedBatch.create({
        data: {
          companyId: user.companyId,
          reference,
          checkId,
          referenceType: check.referenceType,
          referenceId: check.referenceId,
          batchNumber: check.batchNumber,
          stockBatchId: dto.stockBatchId,
          quantity: dto.quantity,
          unitOfMeasure: dto.unitOfMeasure,
          approvedById: user.id,
          approvalNotes: dto.approvalNotes,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
          createdById: user.id,
        },
      });
      await tx.qualityCheck.update({ where: { id: checkId }, data: { status: "PASSED", decision: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id } });
      return ab;
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "ApprovedBatch", entityId: batch.id, ...ctx });
    return batch;
  }

  async rejectBatch(user: AuthenticatedUser, checkId: string, dto: RejectBatchDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id: checkId, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");

    const existing = await this.prisma.rejectedBatch.findFirst({ where: { checkId } });
    if (existing) throw new BadRequestException("Batch already rejected");

    const count = await this.prisma.rejectedBatch.count({ where: { companyId: user.companyId } });
    const reference = nextRef("RJB", count);

    const batch = await this.prisma.$transaction(async (tx) => {
      const rb = await tx.rejectedBatch.create({
        data: {
          companyId: user.companyId,
          reference,
          checkId,
          referenceType: check.referenceType,
          referenceId: check.referenceId,
          batchNumber: check.batchNumber,
          rejectionReason: dto.rejectionReason,
          disposalMethod: (dto.disposalMethod as never) ?? "QUARANTINE",
          disposalDate: dto.disposalDate ? new Date(dto.disposalDate) : undefined,
          disposalNotes: dto.disposalNotes,
          quantity: dto.quantity,
          unitOfMeasure: dto.unitOfMeasure,
          estimatedValue: dto.estimatedValue,
          supplierId: dto.supplierId,
          createdById: user.id,
        },
      });
      await tx.qualityCheck.update({ where: { id: checkId }, data: { status: "FAILED", decision: "REJECTED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id } });
      return rb;
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "RejectedBatch", entityId: batch.id, ...ctx });
    return batch;
  }

  async quarantineBatch(user: AuthenticatedUser, checkId: string, dto: QuarantineBatchDto, ctx: RequestContext) {
    const check = await this.prisma.qualityCheck.findFirst({ where: { id: checkId, companyId: user.companyId, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");
    const updated = await this.prisma.qualityCheck.update({
      where: { id: checkId },
      data: { decision: "QUARANTINE", notes: `Quarantined: ${dto.reason}. ${dto.notes ?? ""}`.trim(), updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "QualityCheck", entityId: checkId, ...ctx });
    return updated;
  }

  // â”€â”€â”€ Rejected Batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listRejectedBatches(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(q.dateTo + "T23:59:59");
    }
    return this.prisma.rejectedBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        check: { select: { reference: true, checkType: true } },
        supplier: { select: { id: true, name: true, code: true } },
        correctiveActions: { where: { deletedAt: null }, select: { id: true, status: true } },
      },
    });
  }

  // â”€â”€â”€ Approved Batches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listApprovedBatches(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(q.dateTo + "T23:59:59");
    }
    return this.prisma.approvedBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        check: { select: { reference: true, checkType: true } },
        stockBatch: { select: { id: true, batchNumber: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // â”€â”€â”€ Lab Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listLabReports(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.search) where.reportNumber = { contains: q.search };
    return this.prisma.labReportUpload.findMany({
      where,
      orderBy: { reportDate: "desc" },
      include: {
        check: { select: { reference: true, checkType: true, batchNumber: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async createLabReport(user: AuthenticatedUser, dto: CreateLabReportDto, ctx: RequestContext) {
    const cid = user.companyId;
    const check = await this.prisma.qualityCheck.findFirst({ where: { id: dto.checkId, companyId: cid, deletedAt: null } });
    if (!check) throw new NotFoundException("Quality check not found");

    const exists = await this.prisma.labReportUpload.findFirst({ where: { companyId: cid, reportNumber: dto.reportNumber, deletedAt: null } });
    if (exists) throw new BadRequestException(`Report number ${dto.reportNumber} already exists`);

    const report = await this.prisma.labReportUpload.create({
      data: {
        companyId: cid,
        checkId: dto.checkId,
        reportNumber: dto.reportNumber,
        labName: dto.labName,
        reportDate: new Date(dto.reportDate),
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        summary: dto.summary,
        findings: dto.findings,
        recommendations: dto.recommendations,
        uploadedById: user.id,
      },
    });

    await this.audit.write({ companyId: cid, actorUserId: user.id, action: "CREATE", entityType: "LabReportUpload", entityId: report.id, ...ctx });
    return report;
  }

  // â”€â”€â”€ Corrective Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listCorrectiveActions(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(q.dateTo + "T23:59:59");
    }
    return this.prisma.correctiveAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        check: { select: { reference: true, checkType: true } },
        assignedTo: { select: { id: true, fullName: true } },
        verifiedBy: { select: { id: true, fullName: true } },
        rejectedBatch: { select: { reference: true, batchNumber: true } },
      },
    });
  }

  async createCorrectiveAction(user: AuthenticatedUser, dto: CreateCorrectiveActionDto, ctx: RequestContext) {
    const cid = user.companyId;
    const count = await this.prisma.correctiveAction.count({ where: { companyId: cid } });
    const reference = nextRef("CA", count);

    const ca = await this.prisma.correctiveAction.create({
      data: {
        companyId: cid,
        reference,
        checkId: dto.checkId,
        rejectedBatchId: dto.rejectedBatchId,
        title: dto.title,
        description: dto.description,
        rootCause: dto.rootCause,
        preventiveMeasure: dto.preventiveMeasure,
        priority: dto.priority ?? "MEDIUM",
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdById: user.id,
      },
    });

    await this.audit.write({ companyId: cid, actorUserId: user.id, action: "CREATE", entityType: "CorrectiveAction", entityId: ca.id, ...ctx });
    return ca;
  }

  async updateCorrectiveAction(user: AuthenticatedUser, id: string, dto: UpdateCorrectiveActionDto, ctx: RequestContext) {
    const ca = await this.prisma.correctiveAction.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!ca) throw new NotFoundException("Corrective action not found");
    const updated = await this.prisma.correctiveAction.update({
      where: { id },
      data: {
        status: dto.status as never,
        description: dto.description,
        rootCause: dto.rootCause,
        preventiveMeasure: dto.preventiveMeasure,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        updatedById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "CorrectiveAction", entityId: id, ...ctx });
    return updated;
  }

  async resolveCorrectiveAction(user: AuthenticatedUser, id: string, dto: ResolveCorrectiveActionDto, ctx: RequestContext) {
    const ca = await this.prisma.correctiveAction.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!ca) throw new NotFoundException("Corrective action not found");
    if (ca.status === "RESOLVED" || ca.status === "CLOSED") throw new BadRequestException("Already resolved");
    const updated = await this.prisma.correctiveAction.update({
      where: { id },
      data: { status: "RESOLVED", preventiveMeasure: dto.preventiveMeasure, completedAt: new Date(), description: `${ca.description}\n\nResolution: ${dto.resolution}`.trim(), updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "CorrectiveAction", entityId: id, ...ctx });
    return updated;
  }

  async verifyCorrectiveAction(user: AuthenticatedUser, id: string, dto: VerifyCorrectiveActionDto, ctx: RequestContext) {
    const ca = await this.prisma.correctiveAction.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!ca) throw new NotFoundException("Corrective action not found");
    const updated = await this.prisma.correctiveAction.update({
      where: { id },
      data: {
        verifiedById: user.id,
        verifiedAt: new Date(),
        status: dto.close ? "CLOSED" : "RESOLVED",
        closedAt: dto.close ? new Date() : undefined,
        updatedById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "CorrectiveAction", entityId: id, ...ctx });
    return updated;
  }

  // â”€â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async qualityReport(user: AuthenticatedUser, q: QualityQueryDto) {
    const cid = user.companyId;
    const dateFilter: Record<string, unknown> = {};
    if (q.dateFrom) dateFilter.gte = new Date(q.dateFrom);
    if (q.dateTo) dateFilter.lte = new Date(q.dateTo + "T23:59:59");
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

    const [byType, byDecision, failureReasons, corrActStats] = await Promise.all([
      this.prisma.qualityCheck.groupBy({
        by: ["checkType", "status"],
        where: { ...where },
        _count: { _all: true },
      }),
      this.prisma.qualityCheck.groupBy({
        by: ["decision"],
        where: { ...where },
        _count: { _all: true },
      }),
      this.prisma.qualityCheck.findMany({
        where: { ...where, status: "FAILED" },
        select: { reference: true, checkType: true, batchNumber: true, notes: true, createdAt: true, branch: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.correctiveAction.groupBy({
        by: ["status"],
        where: { companyId: cid, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const passRate = (() => {
      const total = byDecision.reduce((s, r) => s + r._count._all, 0);
      const approved = byDecision.find((r) => r.decision === "APPROVED")?._count._all ?? 0;
      return total > 0 ? Number(((approved / total) * 100).toFixed(1)) : 0;
    })();

    return { period: { from: q.dateFrom, to: q.dateTo }, byType, byDecision, passRate, failureReasons, corrActStats };
  }
}


