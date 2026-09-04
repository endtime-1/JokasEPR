import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AiDataService {
  constructor(private readonly prisma: PrismaService) {}

  // Every query in buildContext() previously filtered only by companyId —
  // a farm/branch-restricted user with the right *permissions* (e.g.
  // poultry.read) got cross-farm/branch data fed into their AI chat,
  // anomaly checks, and report summaries, bypassing the location scoping
  // every direct list/dashboard endpoint enforces. Same "empty array =
  // unrestricted" convention used elsewhere in the codebase.
  private locationScope(user: AuthenticatedUser, dims: { branch?: boolean; farm?: boolean; warehouse?: boolean; site?: boolean }): Record<string, unknown> {
    if (user.hasGlobalAccess) return {};
    const where: Record<string, unknown> = {};
    if (dims.branch && user.branchIds.length > 0) where.branchId = { in: user.branchIds };
    if (dims.farm && user.farmIds.length > 0) where.farmId = { in: user.farmIds };
    if (dims.warehouse && user.warehouseIds.length > 0) where.warehouseId = { in: user.warehouseIds };
    if (dims.site && user.productionSiteIds.length > 0) where.productionSiteId = { in: user.productionSiteIds };
    return where;
  }

  // Turn `groupBy(["<dateField>"])` rows into an ordered "YYYY-MM-DD: ..." list,
  // one line per calendar day from `from` to today, so the model can answer
  // single-day questions ("yesterday", "on the 1st") — not just 7/30-day
  // totals. A day with no records is shown explicitly as "no records".
  private dailyLines(
    from: Date,
    rows: Array<Record<string, unknown>>,
    dateField: string,
    render: (row: Record<string, unknown> | undefined) => string,
  ): string[] {
    const byDay = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = new Date(r[dateField] as Date).toISOString().slice(0, 10);
      byDay.set(key, r);
    }
    const lines: string[] = [];
    const start = new Date(from.toISOString().slice(0, 10));
    const today = new Date(new Date().toISOString().slice(0, 10));
    for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      lines.push(`  ${key}: ${render(byDay.get(key))}`);
    }
    return lines;
  }

  // (2026-08-27) This used to be one long function running up to 19 awaited
  // DB queries strictly one after another — for a user holding every
  // permission, every single AI query paid that full sequential cost before
  // the model was even called. Combined with the model's own response time,
  // total request time could run long enough that a proxy/idle timeout in
  // front of the app cut the connection after headers were sent but before
  // the body finished — the request showed as "successful" (201) with an
  // empty body, and the frontend crashed trying to read .reply from
  // nothing. None of these 8 sections (or the queries within each) depend
  // on another's result, so they now all run concurrently instead — same
  // data, same output text and section order, far less wall-clock time.
  async buildContext(user: AuthenticatedUser): Promise<string> {
    const companyId = user.companyId;
    const since7 = new Date(Date.now() - 7 * 86400000);
    const since14 = new Date(Date.now() - 14 * 86400000);
    const since30 = new Date(Date.now() - 30 * 86400000);
    const has = (p: string) => user.permissions.includes(p);

    const sectionPromises: Promise<string | undefined>[] = [
      has("poultry.read") ? this.poultrySection(user, companyId, since7, since14) : Promise.resolve(undefined),
      has("feed.read") ? this.feedSection(user, companyId, since30, since14) : Promise.resolve(undefined),
      has("soya.read") ? this.soyaSection(user, companyId, since30) : Promise.resolve(undefined),
      has("inventory.read") ? this.inventorySection(user, companyId) : Promise.resolve(undefined),
      has("sales.read") ? this.salesSection(user, companyId, since30) : Promise.resolve(undefined),
      has("finance.read") ? this.financeSection(user, companyId, since30) : Promise.resolve(undefined),
      has("procurement.read") ? this.procurementSection(user, companyId) : Promise.resolve(undefined),
      has("maintenance.read") ? this.maintenanceSection(user, companyId) : Promise.resolve(undefined),
    ];

    const sections = (await Promise.all(sectionPromises)).filter((s): s is string => !!s);

    if (sections.length === 0) {
      return "No business data available for your current permission set.";
    }
    return sections.join("\n\n");
  }

  private async poultrySection(user: AuthenticatedUser, companyId: string, since7: Date, since14: Date): Promise<string> {
    const poultryScope = this.locationScope(user, { branch: true, farm: true });
    const [flocks, eggTotals, mortalityTotals, feedTotals, healthObs, eggDaily, mortalityDaily, feedDaily] = await Promise.all([
      this.prisma.flockBatch.findMany({
        where: { companyId, deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, ...this.locationScope(user, { branch: true, farm: true }) },
        select: {
          id: true, code: true, name: true, birdType: true, openingBirdCount: true, status: true,
          farm: { select: { name: true } },
          poultryHouse: { select: { name: true } }
        },
        take: 20
      }),
      this.prisma.eggProductionRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, deletedAt: null, recordDate: { gte: since7 } },
        _sum: { goodEggs: true, crackedEggs: true, brokenEggs: true }
      }),
      this.prisma.mortalityRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, deletedAt: null, recordDate: { gte: since7 }, isCulling: false },
        _sum: { birdCount: true }
      }),
      this.prisma.feedConsumptionRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, deletedAt: null, recordDate: { gte: since7 } },
        _sum: { quantityKg: true }
      }),
      this.prisma.poultryHealthObservation.findMany({
        where: { companyId, deletedAt: null, observationDate: { gte: since7 }, ...poultryScope },
        select: { severity: true, observation: true, recommendation: true, flockBatch: { select: { name: true } } },
        take: 5,
        orderBy: { observationDate: "desc" }
      }),
      this.prisma.eggProductionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId, deletedAt: null, recordDate: { gte: since14 }, ...poultryScope },
        _sum: { goodEggs: true, crackedEggs: true, brokenEggs: true, dirtyEggs: true, rejectedEggs: true }
      }),
      this.prisma.mortalityRecord.groupBy({
        by: ["recordDate"],
        where: { companyId, deletedAt: null, recordDate: { gte: since14 }, isCulling: false, ...poultryScope },
        _sum: { birdCount: true }
      }),
      this.prisma.feedConsumptionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId, deletedAt: null, recordDate: { gte: since14 }, ...poultryScope },
        _sum: { quantityKg: true }
      })
    ]);

    const eggMap = new Map(eggTotals.map((r) => [r.flockBatchId, r._sum]));
    const mortalityMap = new Map(mortalityTotals.map((r) => [r.flockBatchId, r._sum.birdCount ?? 0]));
    const feedMap = new Map(feedTotals.map((r) => [r.flockBatchId, r._sum.quantityKg ?? 0]));

    const flockLines = flocks.map((f) => {
      const eggs = eggMap.get(f.id);
      const goodEggs = eggs?.goodEggs ?? 0;
      const badEggs = (eggs?.crackedEggs ?? 0) + (eggs?.brokenEggs ?? 0);
      const mortality = mortalityMap.get(f.id) ?? 0;
      const feed = feedMap.get(f.id) ?? 0;
      return `  - ${f.name} (${f.birdType}, ${f.farm.name}, ${f.poultryHouse?.name ?? "multi-house"}): opening=${f.openingBirdCount} birds, 7d eggs=${goodEggs} good/${badEggs} bad, 7d mortality=${mortality}, 7d feed=${feed}kg`;
    });

    const eggDay = new Map(eggDaily.map((r) => [new Date(r.recordDate).toISOString().slice(0, 10), r._sum]));
    const mortDay = new Map(mortalityDaily.map((r) => [new Date(r.recordDate).toISOString().slice(0, 10), Number(r._sum.birdCount ?? 0)]));
    const feedDay = new Map(feedDaily.map((r) => [new Date(r.recordDate).toISOString().slice(0, 10), Number(r._sum.quantityKg ?? 0)]));
    const allDays = new Set<string>([...eggDay.keys(), ...mortDay.keys(), ...feedDay.keys()]);
    const dailyRows = this.dailyLines(since14, [...allDays].map((d) => ({ recordDate: d })), "recordDate", (row) => {
      const d = row ? (row.recordDate as string) : "";
      const e = eggDay.get(d);
      const totalEggs = e ? Number(e.goodEggs ?? 0) + Number(e.crackedEggs ?? 0) + Number(e.brokenEggs ?? 0) + Number(e.dirtyEggs ?? 0) + Number(e.rejectedEggs ?? 0) : 0;
      const goodEggs = e ? Number(e.goodEggs ?? 0) : 0;
      return `eggs=${totalEggs} (${goodEggs} good), deaths=${mortDay.get(d) ?? 0}, feed=${(feedDay.get(d) ?? 0).toFixed(1)}kg`;
    });

    return `POULTRY (last 7 days):\n${flockLines.join("\n")}${healthObs.length ? "\nHealth observations:\n" + healthObs.map((h) => `  - ${h.flockBatch?.name ?? "Unknown batch"} [${h.severity}]: ${h.observation}`).join("\n") : ""}\nPOULTRY DAILY TOTALS (last 14 days, all farms within your access — use these for single-day questions like "yesterday"):\n${dailyRows.join("\n")}`;
  }

  private async feedSection(user: AuthenticatedUser, companyId: string, since30: Date, since14: Date): Promise<string> {
    const feedScope = this.locationScope(user, { branch: true, site: true });
    const [batches, formulas, prodDaily] = await Promise.all([
      this.prisma.feedProductionBatch.findMany({
        where: { companyId, deletedAt: null, createdAt: { gte: since30 }, ...this.locationScope(user, { branch: true, site: true }) },
        select: {
          batchNumber: true, status: true, producedQuantityKg: true,
          productionOrder: { select: { formula: { select: { name: true, feedType: true } } } }
        },
        take: 10,
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.feedFormula.findMany({
        where: { companyId, status: "ACTIVE", deletedAt: null },
        select: {
          name: true, feedType: true,
          versions: {
            where: { status: "ACTIVE" },
            select: { costPer100Kg: true },
            take: 1,
            orderBy: { createdAt: "desc" }
          }
        },
        take: 10
      }),
      this.prisma.feedProductionBatch.groupBy({
        by: ["productionDate"],
        where: { companyId, deletedAt: null, productionDate: { gte: since14 }, ...feedScope },
        _sum: { producedQuantityKg: true, wastageKg: true }
      })
    ]);

    const formulaLines = formulas.map((f) => `  - ${f.name} (${f.feedType}): GHS ${Number(f.versions[0]?.costPer100Kg ?? 0).toFixed(2)}/100kg`);
    const batchLines = batches.map((b) => `  - ${b.batchNumber} [${b.status}]: formula=${b.productionOrder?.formula?.name ?? "unknown"}, output=${Number(b.producedQuantityKg ?? 0).toFixed(2)}kg`);
    const prodDailyRows = this.dailyLines(since14, prodDaily as unknown as Array<Record<string, unknown>>, "productionDate", (row) => {
      if (!row) return "no batches";
      const s = (row as { _sum: { producedQuantityKg: unknown; wastageKg: unknown } })._sum;
      return `produced=${Number(s.producedQuantityKg ?? 0).toFixed(1)}kg, wastage=${Number(s.wastageKg ?? 0).toFixed(1)}kg`;
    });

    return `FEED PRODUCTION (last 30 days):\nActive formulas:\n${formulaLines.join("\n")}\nRecent batches:\n${batchLines.join("\n")}\nFEED PRODUCED PER DAY (last 14 days, mill output — use for single-day questions):\n${prodDailyRows.join("\n")}`;
  }

  private async soyaSection(user: AuthenticatedUser, companyId: string, since30: Date): Promise<string> {
    const soyaBatches = await this.prisma.soyaProcessingBatch.findMany({
      where: { companyId, deletedAt: null, createdAt: { gte: since30 }, ...this.locationScope(user, { branch: true, site: true }) },
      select: {
        batchNumber: true, status: true, beansUsedKg: true,
        oilOutputs: { select: { quantityLitres: true } },
        cakeOutputs: { select: { quantityKg: true } }
      },
      take: 10,
      orderBy: { createdAt: "desc" }
    });

    const soyaLines = soyaBatches.map((b) => {
      const oil = b.oilOutputs.reduce((s, o) => s + Number(o.quantityLitres ?? 0), 0);
      const cake = b.cakeOutputs.reduce((s, o) => s + Number(o.quantityKg ?? 0), 0);
      const beansUsedKg = Number(b.beansUsedKg);
      const yieldPct = beansUsedKg ? ((oil / beansUsedKg) * 100).toFixed(1) : "N/A";
      return `  - ${b.batchNumber} [${b.status}]: input=${beansUsedKg.toFixed(2)}kg, oil=${oil.toFixed(2)}L (yield ${yieldPct}%), cake=${cake.toFixed(2)}kg`;
    });

    return `SOYA PROCESSING (last 30 days):\n${soyaLines.join("\n")}`;
  }

  private async inventorySection(user: AuthenticatedUser, companyId: string): Promise<string> {
    const [lowStock, totalValue] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: "ACTIVE",
          reorderLevel: { gt: 0 },
          quantityOnHand: { gt: 0 },
          ...this.locationScope(user, { branch: true, farm: true, warehouse: true, site: true })
        },
        select: {
          quantityOnHand: true, reorderLevel: true,
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } }
        },
        take: 50
      }),
      this.prisma.inventoryValuation.aggregate({
        where: { companyId, deletedAt: null, ...this.locationScope(user, { branch: true, warehouse: true, site: true }) },
        _sum: { totalValue: true }
      })
    ]);

    const critical = lowStock.filter((i) => Number(i.quantityOnHand) <= Number(i.reorderLevel));
    const criticalLines = critical
      .slice(0, 10)
      .map((i) => `  - ${i.product.name} (${i.warehouse.name}): ${Number(i.quantityOnHand).toFixed(2)} on hand, reorder at ${Number(i.reorderLevel).toFixed(2)}`);

    return `INVENTORY:\nLow/critical stock items (${critical.length} total):\n${criticalLines.join("\n")}\nTotal inventory value: GHS ${Number(totalValue._sum.totalValue ?? 0).toLocaleString()}`;
  }

  private async salesSection(user: AuthenticatedUser, companyId: string, since30: Date): Promise<string> {
    const inactiveThreshold = new Date(Date.now() - 60 * 86400000);
    const [salesStats, topDebtors, stoppedBuying] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { companyId, deletedAt: null, createdAt: { gte: since30 }, status: { not: "CANCELLED" }, ...this.locationScope(user, { branch: true, warehouse: true }) },
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
        _count: { id: true }
      }),
      this.prisma.customer.findMany({
        where: { companyId, deletedAt: null, status: "ACTIVE", ...this.locationScope(user, { branch: true }) },
        select: {
          name: true, code: true,
          creditLimits: { select: { currentBalance: true }, take: 1, orderBy: { createdAt: "desc" } }
        },
        take: 20
      }),
      this.prisma.customer.findMany({
        where: {
          companyId, deletedAt: null, status: "ACTIVE",
          salesOrders: { none: { createdAt: { gte: inactiveThreshold } } },
          ...this.locationScope(user, { branch: true })
        },
        select: { name: true },
        take: 5
      })
    ]);

    const debtorList = topDebtors
      .filter((c) => Number(c.creditLimits[0]?.currentBalance ?? 0) > 0)
      .sort((a, b) => Number(b.creditLimits[0]?.currentBalance ?? 0) - Number(a.creditLimits[0]?.currentBalance ?? 0))
      .slice(0, 5)
      .map((c) => `  - ${c.name}: GHS ${Number(c.creditLimits[0]?.currentBalance ?? 0).toLocaleString()}`);

    return `SALES (last 30 days):\nOrders: ${salesStats._count.id}, Revenue: GHS ${Number(salesStats._sum.totalAmount ?? 0).toLocaleString()}, Collected: GHS ${Number(salesStats._sum.paidAmount ?? 0).toLocaleString()}, Outstanding: GHS ${Number(salesStats._sum.balanceDue ?? 0).toLocaleString()}\nTop debtors:\n${debtorList.join("\n")}${stoppedBuying.length ? `\nCustomers with no orders in 60 days: ${stoppedBuying.map((c) => c.name).join(", ")}` : ""}`;
  }

  private async financeSection(user: AuthenticatedUser, companyId: string, since30: Date): Promise<string> {
    const [revenue, expenses] = await Promise.all([
      this.prisma.revenue.aggregate({
        where: { companyId, deletedAt: null, revenueDate: { gte: since30 }, ...this.locationScope(user, { branch: true }) },
        _sum: { amount: true }
      }),
      this.prisma.expense.aggregate({
        where: { companyId, deletedAt: null, expenseDate: { gte: since30 }, ...this.locationScope(user, { branch: true }) },
        _sum: { amount: true }
      })
    ]);

    const revenueAmount = Number(revenue._sum.amount ?? 0);
    const expenseAmount = Number(expenses._sum.amount ?? 0);
    const grossProfit = revenueAmount - expenseAmount;
    return `FINANCE (last 30 days):\nRevenue: GHS ${revenueAmount.toLocaleString()}, Expenses: GHS ${expenseAmount.toLocaleString()}, Net: GHS ${grossProfit.toLocaleString()}`;
  }

  private async procurementSection(user: AuthenticatedUser, companyId: string): Promise<string> {
    const [pendingPOs, rawMaterials] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
          ...(!user.hasGlobalAccess && user.branchIds.length > 0
            ? { OR: [{ purchaseRequestId: null }, { purchaseRequest: { branchId: null } }, { purchaseRequest: { branchId: { in: user.branchIds } } }] }
            : {})
        },
        _count: { id: true },
        _sum: { totalAmount: true }
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: "ACTIVE",
          product: { type: "RAW_MATERIAL" },
          ...this.locationScope(user, { branch: true, farm: true, warehouse: true, site: true })
        },
        select: {
          quantityOnHand: true, reorderLevel: true,
          product: { select: { name: true } }
        },
        take: 20
      })
    ]);

    const nearZero = rawMaterials
      .filter((r) => Number(r.reorderLevel ?? 0) > 0 && Number(r.quantityOnHand) <= Number(r.reorderLevel) * 1.5)
      .slice(0, 5)
      .map((r) => `  - ${r.product.name}: ${Number(r.quantityOnHand).toFixed(2)} on hand`);

    return `PROCUREMENT:\nPending POs: ${pendingPOs._count.id} (GHS ${Number(pendingPOs._sum.totalAmount ?? 0).toLocaleString()})\nRaw materials near depletion:\n${nearZero.join("\n") || "  None"}`;
  }

  private async maintenanceSection(user: AuthenticatedUser, companyId: string): Promise<string | undefined> {
    const [breakdowns, overdue] = await Promise.all([
      this.prisma.breakdownRecord.findMany({
        where: { companyId, deletedAt: null, status: { in: ["REPORTED", "ASSIGNED", "IN_REPAIR"] }, ...this.locationScope(user, { branch: true, farm: true, warehouse: true, site: true }) },
        select: { severity: true, machine: { select: { name: true } } },
        take: 5
      }),
      this.prisma.maintenanceSchedule.findMany({
        where: { companyId, deletedAt: null, nextDueDate: { lt: new Date() }, status: { not: "CANCELLED" }, ...this.locationScope(user, { branch: true, farm: true, warehouse: true, site: true }) },
        select: { machine: { select: { name: true } }, nextDueDate: true },
        take: 5
      })
    ]);

    if (!breakdowns.length && !overdue.length) return undefined;

    const bdLines = breakdowns.map((b) => `  - ${b.machine?.name ?? "Unassigned asset"} [${b.severity}]`);
    const ovLines = overdue.map((o) => `  - ${o.machine?.name ?? "Unassigned asset"}: due ${o.nextDueDate.toISOString().slice(0, 10)}`);
    return `MAINTENANCE:\nActive breakdowns:\n${bdLines.join("\n") || "  None"}\nOverdue schedules:\n${ovLines.join("\n") || "  None"}`;
  }
}
