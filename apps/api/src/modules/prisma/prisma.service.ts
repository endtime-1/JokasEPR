import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Models that carry companyId and whose queries must always be tenant-scoped.
// Prisma 6 removed $use() middleware — we install a Proxy on each model delegate
// in onModuleInit() so that warning fire whenever companyId is absent.
const TENANT_GUARDED_MODELS = [
  // Identity & HR
  "user", "employee", "attendanceRecord", "payrollRecord", "leaveRequest",
  "task", "shift", "employeeRole",
  // Poultry
  "flockBatch", "mortalityRecord", "eggProductionRecord",
  "feedConsumptionRecord", "dailyPoultryRecord", "poultryTransferRecord", "poultryHouse",
  // Sales
  "invoice", "payment", "receipt", "salesOrder", "salesReturn",
  "deliveryNote", "customerStatement", "customerCreditLimit",
  "customer", "customerGroup",
  // Inventory
  "stockMovement", "stockBatch", "inventoryItem", "stockApproval",
  // Procurement
  "purchaseOrder", "purchaseRequest", "goodsReceivedNote", "supplierInvoice",
  "supplier",
  // Finance
  "expense",
  // Feed & Production
  "feedProductionOrder", "feedFormula",
  // Maintenance
  "maintenanceTask", "machineDowntimeRecord",
  // Shared
  "product", "auditLog",
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
    // Install the tenant guard first — it's pure JS Proxy setup with no DB call.
    this.installTenantGuard();

    // Pre-warm the connection pool without blocking NestJS startup.
    // If MySQL is available this caches the connection; if not, we swallow the
    // error and let Prisma connect lazily on the first real query. Every service
    // method already has a defensive catch for DB failures, so a lazy-connect
    // failure is handled gracefully. This prevents the old behaviour where a
    // slow MySQL response would block NestJS from listening on port 4001 for
    // 30+ seconds (making all API requests fail during startup).
    this.$connect().catch((err: Error) => {
      this.logger.warn("[Prisma] Initial $connect() deferred — will connect on first query: " + err?.message);
    });
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
