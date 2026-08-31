import { BadRequestException, Injectable } from "@nestjs/common";
import {
  AuthenticatedUser,
  WarehouseOperation,
  WAREHOUSE_OPERATION_LABELS,
  WAREHOUSE_TYPE_LABELS,
  allowedTypeLabelsForOperation,
  warehouseTypeAllowedForOperation,
} from "@jokas/shared";
import { PrismaService } from "../../modules/prisma/prisma.service";
import { AuditService } from "../../modules/audit/audit.service";

type RequestContext = { ipAddress?: string; userAgent?: string };
type WarehouseLike = { id: string; type: string; name: string; code: string; branchId?: string };

/**
 * Gate inventory operations on warehouse type. A feed-production draw must
 * come from a Feed Store, egg collection must land in an Egg Store, and so on
 * (see @jokas/shared/warehouse-purpose). GENERAL is always allowed.
 *
 * Everything here is a no-op unless the company has turned on
 * `enforceWarehousePurpose` in user-access settings — until then the pickers
 * show every warehouse and nothing is rejected, exactly as before.
 */
@Injectable()
export class WarehousePurposeService {
  private readonly cache = new Map<string, { on: boolean; at: number }>();
  private readonly ttlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async isEnforced(companyId: string): Promise<boolean> {
    const hit = this.cache.get(companyId);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.on;
    const row = await this.prisma.systemSetting.findFirst({
      where: { companyId, key: "user-access.settings", deletedAt: null },
      select: { value: true },
    });
    const on = (row?.value as { enforceWarehousePurpose?: boolean } | null)?.enforceWarehousePurpose === true;
    this.cache.set(companyId, { on, at: Date.now() });
    return on;
  }

  /** Drop from cache after the setting is changed. */
  invalidate(companyId: string) {
    this.cache.delete(companyId);
  }

  /**
   * Throws 400 when enforcement is on and the warehouse type doesn't fit the
   * operation — unless a manager (inventory.manage / global) passed an
   * override reason, which is let through and written to the audit log.
   */
  async assert(
    user: AuthenticatedUser,
    warehouse: WarehouseLike,
    op: WarehouseOperation,
    opts?: { overrideReason?: string; context?: RequestContext },
  ): Promise<void> {
    if (warehouseTypeAllowedForOperation(warehouse.type, op)) return;
    if (!(await this.isEnforced(user.companyId))) return;

    const typeLabel = WAREHOUSE_TYPE_LABELS[warehouse.type as keyof typeof WAREHOUSE_TYPE_LABELS] ?? warehouse.type;
    const opLabel = WAREHOUSE_OPERATION_LABELS[op];
    const canOverride = user.hasGlobalAccess || user.permissions.includes("inventory.manage");
    const reason = opts?.overrideReason?.trim();

    if (canOverride && reason) {
      await this.audit.write({
        companyId: user.companyId,
        actorUserId: user.id,
        action: "UPDATE",
        entityType: "Warehouse",
        entityId: warehouse.id,
        branchId: warehouse.branchId,
        warehouseId: warehouse.id,
        summary: `Warehouse-purpose override — used ${warehouse.code} (${typeLabel}) for ${opLabel}: ${reason}`,
        ...(opts?.context ?? {}),
      });
      return;
    }

    throw new BadRequestException(
      `${warehouse.name} is a ${typeLabel} store — ${opLabel} needs a ${allowedTypeLabelsForOperation(op)} warehouse.` +
        (canOverride ? " Add an override reason to proceed anyway." : ""),
    );
  }

  /** Narrow a warehouse list to the types an operation allows — only when enforcement is on. */
  async filterForOperation<T extends { type: string }>(
    companyId: string,
    warehouses: T[],
    op: WarehouseOperation,
  ): Promise<T[]> {
    if (!(await this.isEnforced(companyId))) return warehouses;
    return warehouses.filter((w) => warehouseTypeAllowedForOperation(w.type, op));
  }
}
