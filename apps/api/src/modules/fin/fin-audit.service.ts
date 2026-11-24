import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type FinDb = Prisma.TransactionClient;

export type FinAuditInput = {
  companyId: string;
  userId?: string | null;
  area: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string;
  userAgent?: string;
};

export type RequestMeta = { ipAddress?: string; userAgent?: string };

/**
 * The finance audit log. Append-only (the database refuses UPDATE/DELETE).
 * Pass the open transaction as `db` so the audit row and the change it describes
 * commit or roll back together: a finance change with no audit trail cannot exist.
 */
@Injectable()
export class FinAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: FinAuditInput, db?: FinDb) {
    const client = db ?? this.prisma;
    return client.finAuditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        area: input.area,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        ipAddress: input.ipAddress?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 300)
      }
    });
  }

  async list(companyId: string, query: { area?: string; entityType?: string; entityId?: string; page?: number; take?: number }) {
    const take = Math.min(Math.max(1, query.take ?? 50), 200);
    const page = Math.max(1, query.page ?? 1);
    const where: Prisma.FinAuditLogWhereInput = {
      companyId,
      ...(query.area ? { area: query.area } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
      this.prisma.finAuditLog.count({ where })
    ]);
    return { rows, total, page, take };
  }
}
