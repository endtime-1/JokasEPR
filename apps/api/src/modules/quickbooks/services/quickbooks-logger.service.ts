import { Injectable } from "@nestjs/common";
import { QBSyncOperation, QBSyncResult } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface SyncLogContext {
  companyId: string;
  connectionId: string;
  operation: QBSyncOperation;
  triggeredById?: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class QuickBooksLoggerService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(ctx: SyncLogContext): Promise<string> {
    const log = await this.prisma.quickBooksSyncLog.create({
      data: {
        companyId: ctx.companyId,
        connectionId: ctx.connectionId,
        operation: ctx.operation,
        result: QBSyncResult.SUCCESS,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        triggeredById: ctx.triggeredById,
        startedAt: new Date()
      }
    });
    return log.id;
  }

  async succeed(logId: string, opts?: { qbEntityId?: string; recordsProcessed?: number; recordsSucceeded?: number; details?: unknown }): Promise<void> {
    const now = new Date();
    const log = await this.prisma.quickBooksSyncLog.findUnique({ where: { id: logId }, select: { startedAt: true } });
    await this.prisma.quickBooksSyncLog.update({
      where: { id: logId },
      data: {
        result: QBSyncResult.SUCCESS,
        qbEntityId: opts?.qbEntityId,
        recordsProcessed: opts?.recordsProcessed ?? 1,
        recordsSucceeded: opts?.recordsSucceeded ?? 1,
        recordsFailed: 0,
        details: opts?.details ? (opts.details as object) : undefined,
        completedAt: now,
        durationMs: log ? now.getTime() - log.startedAt.getTime() : undefined
      }
    });
  }

  async fail(logId: string, errorMessage: string, opts?: { recordsProcessed?: number; recordsFailed?: number; details?: unknown }): Promise<void> {
    const now = new Date();
    const log = await this.prisma.quickBooksSyncLog.findUnique({ where: { id: logId }, select: { startedAt: true } });
    await this.prisma.quickBooksSyncLog.update({
      where: { id: logId },
      data: {
        result: QBSyncResult.FAILED,
        recordsProcessed: opts?.recordsProcessed ?? 1,
        recordsSucceeded: 0,
        recordsFailed: opts?.recordsFailed ?? 1,
        errorMessage: errorMessage.slice(0, 5000),
        completedAt: now,
        durationMs: log ? now.getTime() - log.startedAt.getTime() : undefined
      }
    });
  }

  async partial(logId: string, opts: { recordsProcessed: number; recordsSucceeded: number; recordsFailed: number; details?: unknown }): Promise<void> {
    const now = new Date();
    const log = await this.prisma.quickBooksSyncLog.findUnique({ where: { id: logId }, select: { startedAt: true } });
    await this.prisma.quickBooksSyncLog.update({
      where: { id: logId },
      data: {
        result: QBSyncResult.PARTIAL,
        ...opts,
        details: opts.details ? (opts.details as object) : undefined,
        completedAt: now,
        durationMs: log ? now.getTime() - log.startedAt.getTime() : undefined
      }
    });
  }

  async getConnection(companyId: string) {
    return this.prisma.quickBooksConnection.findUnique({ where: { companyId } });
  }
}
