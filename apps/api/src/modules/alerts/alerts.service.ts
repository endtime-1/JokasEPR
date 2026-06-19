import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AlertGenerationService } from "./alert-generation.service";
import { AlertQueryDto, ForecastQueryDto } from "./dto/alerts.dto";

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly generator: AlertGenerationService
  ) {}

  private requireRead(user: AuthenticatedUser) {
    if (!user.permissions.includes("alerts.read")) {
      throw new ForbiddenException("You do not have permission to view alerts.");
    }
  }

  private requireManage(user: AuthenticatedUser) {
    if (!user.permissions.includes("alerts.manage")) {
      throw new ForbiddenException("You do not have permission to manage alerts.");
    }
  }

  async generate(user: AuthenticatedUser) {
    this.requireManage(user);
    const count = await this.generator.generateAll(user.companyId);
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "AIAlert",
      entityId: user.companyId,
      summary: `Generated ${count} AI alert and forecast signal(s)`
    });
    return { data: { generated: count } };
  }

  async findAll(user: AuthenticatedUser, query: AlertQueryDto) {
    this.requireRead(user);

    const where: any = { companyId: user.companyId };

    // Permission-based data filtering: only show alerts for data the user can access
    const visibleCategories = this.permittedCategories(user);
    if (visibleCategories.length === 0) {
      return { data: [], meta: { total: 0 } };
    }
    where.category = { in: visibleCategories };

    if (query.category) {
      if (!visibleCategories.includes(query.category)) return { data: [], meta: { total: 0 } };
      where.category = query.category;
    } else {
      where.category = { in: visibleCategories };
    }
    if (query.severity) where.severity = query.severity;
    if (query.status) where.status = query.status;
    if (query.farmId) where.farmId = query.farmId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.productionSiteId) where.productionSiteId = query.productionSiteId;

    if (!user.hasGlobalAccess) {
      where.AND = this.locationScope(user);
    }

    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.aiAlert.findMany({
        where,
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
        include: {
          farm: { select: { name: true } },
          branch: { select: { name: true } },
          warehouse: { select: { name: true } },
          productionSite: { select: { name: true } },
          acknowledgedBy: { select: { fullName: true } },
          resolvedBy: { select: { fullName: true } }
        }
      }),
      this.prisma.aiAlert.count({ where })
    ]);

    return { data, meta: { total } };
  }

  async unreadCount(user: AuthenticatedUser) {
    if (!user.permissions.includes("alerts.read")) return { data: { count: 0 } };
    const visibleCategories = this.permittedCategories(user);
    if (!visibleCategories.length) return { data: { count: 0 } };

    const where: any = {
      companyId: user.companyId,
      status: "UNREAD",
      category: { in: visibleCategories }
    };

    if (!user.hasGlobalAccess) {
      where.AND = this.locationScope(user);
    }

    const count = await this.prisma.aiAlert.count({ where });
    return { data: { count } };
  }

  async acknowledge(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const visibleCategories = this.permittedCategories(user);
    if (!visibleCategories.length) throw new NotFoundException("Alert not found.");
    const where: any = { id, companyId: user.companyId, category: { in: visibleCategories } };
    if (!user.hasGlobalAccess) where.AND = this.locationScope(user);
    const alert = await this.prisma.aiAlert.findFirst({
      where
    });
    if (!alert) throw new NotFoundException("Alert not found.");
    if (alert.status !== "UNREAD") {
      return { data: alert };
    }
    const updated = await this.prisma.aiAlert.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id }
    });
    await this.auditAlertAction(user, updated, "UPDATE", "Acknowledged AI alert");
    return { data: updated };
  }

  async resolve(user: AuthenticatedUser, id: string) {
    this.requireManage(user);
    const visibleCategories = this.permittedCategories(user);
    if (!visibleCategories.length) throw new NotFoundException("Alert not found.");
    const where: any = { id, companyId: user.companyId, category: { in: visibleCategories } };
    if (!user.hasGlobalAccess) where.AND = this.locationScope(user);
    const alert = await this.prisma.aiAlert.findFirst({
      where
    });
    if (!alert) throw new NotFoundException("Alert not found.");
    const updated = await this.prisma.aiAlert.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: user.id }
    });
    await this.auditAlertAction(user, updated, "UPDATE", "Resolved AI alert");
    return { data: updated };
  }

  async getForecasts(user: AuthenticatedUser, query: ForecastQueryDto) {
    this.requireRead(user);
    const visibleCategories = this.permittedCategories(user);
    if (!visibleCategories.length) return { data: [] };
    const where: any = { companyId: user.companyId };
    if (query.category) {
      if (!visibleCategories.includes(query.category)) return { data: [] };
      where.category = query.category;
    } else {
      where.category = { in: visibleCategories };
    }
    if (query.entityType) where.entityType = query.entityType;

    const data = await this.prisma.aiForecast.findMany({
      where,
      orderBy: { forecastDate: "asc" },
      take: Math.min(query.limit ?? 50, 200)
    });
    return { data };
  }

  async reportCsv(user: AuthenticatedUser, query: AlertQueryDto) {
    const result = await this.findAll(user, { ...query, limit: 500, offset: 0 });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "EXPORT",
      entityType: "AIAlertReport",
      entityId: "ai-alert-report",
      summary: "Exported AI alert report"
    });
    const rows = result.data;
    const header = ["Created", "Severity", "Status", "Category", "Title", "Location", "Entity", "Message"];
    const body = rows.map((alert: any) => [
      alert.createdAt instanceof Date ? alert.createdAt.toISOString() : String(alert.createdAt ?? ""),
      alert.severity,
      alert.status,
      alert.category,
      alert.title,
      alert.farm?.name ?? alert.warehouse?.name ?? alert.productionSite?.name ?? alert.branch?.name ?? "",
      alert.entityName ?? "",
      alert.message
    ]);
    return [header, ...body].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  private permittedCategories(user: AuthenticatedUser): string[] {
    const has = (p: string) => user.permissions.includes(p);
    const cats: string[] = [];
    if (has("poultry.read")) cats.push("MORTALITY_ANOMALY", "EGG_PRODUCTION_DROP", "FEED_CONSUMPTION_ANOMALY");
    if (has("inventory.read")) cats.push("LOW_STOCK_PREDICTION");
    if (has("feed.read")) cats.push("FEED_DEMAND_FORECAST");
    if (has("sales.read")) cats.push("SALES_FORECAST", "CUSTOMER_REORDER_PREDICTION", "SMART_PRICING", "CUSTOMER_DEBT_RISK");
    if (has("soya.read")) cats.push("SOYA_YIELD_ANOMALY");
    if (has("maintenance.read")) cats.push("MACHINE_MAINTENANCE");
    if (has("procurement.read")) cats.push("SUPPLIER_DELAY_RISK");
    return [...new Set(cats)];
  }

  private locationScope(user: AuthenticatedUser) {
    return [
      { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] },
      { OR: [{ farmId: null }, { farmId: { in: user.farmIds } }] },
      { OR: [{ warehouseId: null }, { warehouseId: { in: user.warehouseIds } }] },
      { OR: [{ productionSiteId: null }, { productionSiteId: { in: user.productionSiteIds } }] }
    ];
  }

  private async auditAlertAction(user: AuthenticatedUser, alert: any, action: "UPDATE", summary: string) {
    await this.audit.write({
      companyId: user.companyId,
      branchId: alert.branchId ?? undefined,
      farmId: alert.farmId ?? undefined,
      warehouseId: alert.warehouseId ?? undefined,
      productionSiteId: alert.productionSiteId ?? undefined,
      actorUserId: user.id,
      action,
      entityType: "AIAlert",
      entityId: alert.id,
      summary,
      metadata: { category: alert.category, severity: alert.severity, status: alert.status }
    });
  }
}
