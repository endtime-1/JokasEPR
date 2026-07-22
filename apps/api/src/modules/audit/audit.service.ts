import { Injectable, Logger } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type WriteAuditInput = {
  companyId: string;
  branchId?: string;
  farmId?: string;
  warehouseId?: string;
  productionSiteId?: string;
  actorUserId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  summary?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

type ListAuditOptions = {
  entityType?: string;
  action?: string;
  actorUserId?: string;
  page?: number;
  take?: number;
  /** @deprecated use page + take */
  limit?: number;
  /** @deprecated use page */
  offset?: number;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(input: WriteAuditInput) {
    try {
      return await this.prisma.auditLog.create({ data: { ...input, summary: input.summary ?? "" } });
    } catch (error) {
      this.logger.error(`Failed to write audit log for ${input.entityType}:${input.entityId ?? "n/a"}`, error as Error);
      return null;
    }
  }

  async list(companyId: string, options: ListAuditOptions = {}) {
    const { entityType, action, actorUserId } = options;
    // Support legacy limit/offset params alongside new page/take params.
    const take = Math.min(Math.max(1, options.take ?? options.limit ?? 50), 100);
    const page = options.page ?? 1;
    const skip = options.offset != null ? options.offset : (page - 1) * take;

    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(entityType ? { entityType } : {}),
      ...(action ? { action: action as AuditAction } : {}),
      ...(actorUserId ? { actorUserId } : {})
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return {
      data,
      meta: { total, page, take, totalPages: Math.max(1, Math.ceil(total / take)) }
    };
  }
}
