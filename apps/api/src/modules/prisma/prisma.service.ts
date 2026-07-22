import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Models that must always be scoped by companyId.
// Public/config tables (Permission, Role, PoultryHouse, Pen, etc.) are excluded.
const TENANT_MODELS = new Set([
  "User", "RefreshToken", "LoginRateLimit", "AuditLog", "Notification",
  "FlockBatch", "BatchPenAllocation", "DailyPoultryRecord", "MortalityRecord",
  "FeedConsumptionRecord", "EggProductionRecord", "BirdWeightRecord",
  "MedicationRecord", "VaccinationRecord", "PoultryTransferRecord",
  "PoultryHealthObservation", "PoultryCostRecord",
  "Employee", "Attendance", "LeaveRequest", "PayrollRecord",
  "SalesOrder", "SalesOrderItem", "Customer",
  "PurchaseOrder", "PurchaseOrderItem", "Supplier",
  "InventoryItem", "InventoryTransaction", "Warehouse",
  "FinanceTransaction", "FinanceAccount",
  "MaintenanceRequest", "MaintenanceLog",
  "QualityCheck", "Alert",
]);

const WRITE_ACTIONS = new Set([
  "findFirst", "findMany", "findUnique",
  "update", "updateMany", "delete", "deleteMany",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    // Warn — but never block — when a write/read on a tenant-scoped model
    // omits companyId. Catches future data-leak bugs during development.
    this.$use(async (params, next) => {
      if (
        params.model &&
        TENANT_MODELS.has(params.model) &&
        WRITE_ACTIONS.has(params.action) &&
        !params.args?.where?.companyId
      ) {
        this.logger.warn(
          `[TENANT] ${params.model}.${params.action} executed without companyId — possible cross-tenant data access`
        );
      }
      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
