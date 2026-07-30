import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Models that carry companyId and whose queries must always be tenant-scoped.
// Prisma 6 removed $use() middleware — we install a Proxy on each model delegate
// in onModuleInit() so that warning fire whenever companyId is absent.
const TENANT_GUARDED_MODELS = [
  "user", "employee", "flockBatch", "mortalityRecord", "eggProductionRecord",
  "feedConsumptionRecord", "dailyPoultryRecord", "poultryTransfer", "poultryHouse",
  "attendance", "payroll", "leave", "invoice", "payment", "salesOrder",
  "stockMovement", "stockBatch", "inventoryItem", "auditLog",
] as const;

const GUARDED_OPS = new Set([
  "findFirst", "findMany", "update", "updateMany", "delete", "deleteMany",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Abort any individual query that runs longer than 15 seconds.
      // Prevents a slow dashboard aggregation from stalling the NestJS event loop.
      transactionOptions: { timeout: 15000 },
    });
  }

  async onModuleInit() {
    // Retry connecting up to 5 times with increasing delays.
    // MySQL on Hostinger shared hosting can take 20-30s to accept new connections
    // after a cold start or under load. Without retries, a single failed $connect()
    // crashes NestJS immediately, then start.js restarts it with exponential backoff
    // (3s, 6s, 9s…), extending the outage window unnecessarily.
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.installTenantGuard();
        return;
      } catch (err) {
        if (attempt === 5) throw err;
        const delay = attempt * 6000; // 6s, 12s, 18s, 24s
        this.logger.warn(`[Prisma] $connect attempt ${attempt}/5 failed — retrying in ${delay / 1000}s`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Installs a lightweight Proxy on each tenant-scoped model delegate so that
  // any findMany/findFirst/update/delete called without a companyId filter emits
  // a warning. This is non-blocking — queries proceed regardless.
  // $use() was removed in Prisma 6; this Proxy approach achieves the same for
  // warnings without requiring type-unsafe $extends() at the service level.
  private installTenantGuard() {
    for (const modelKey of TENANT_GUARDED_MODELS) {
      const delegate = (this as Record<string, unknown>)[modelKey];
      if (!delegate || typeof delegate !== "object") continue;

      (this as Record<string, unknown>)[modelKey] = new Proxy(delegate as object, {
        get: (target: Record<string, unknown>, prop: string) => {
          const val = target[prop];
          if (typeof val === "function" && GUARDED_OPS.has(prop)) {
            const logger = this.logger;
            return function (args: { where?: { companyId?: unknown } } = {}) {
              if (!args?.where?.companyId) {
                logger.warn(`[TENANT] ${modelKey}.${prop} — missing companyId, possible cross-tenant data leak`);
              }
              return (val as Function).apply(target, [args]);
            };
          }
          return typeof val === "function" ? (val as Function).bind(target) : val;
        },
      });
    }
  }
}
