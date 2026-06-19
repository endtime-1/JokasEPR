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
  limit?: number;
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
    const { entityType, action, actorUserId, limit = 50, offset = 0 } = options;
    const take = Math.min(Math.max(1, limit), 200);

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
        skip: offset
      }),
      this.prisma.auditLog.count({ where })
    ]);

    return { data: { data, total } };
  }
}
