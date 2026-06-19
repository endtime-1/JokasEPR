import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AiDataService {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(user: AuthenticatedUser): Promise<string> {
    const sections: string[] = [];
    const companyId = user.companyId;
    const since7 = new Date(Date.now() - 7 * 86400000);
    const since30 = new Date(Date.now() - 30 * 86400000);

    const has = (p: string) => user.permissions.includes(p);

    // ── Poultry ──────────────────────────────────────────────
    if (has("poultry.read")) {
      const flocks = await this.prisma.flockBatch.findMany({
        where: { companyId, deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] } },
        select: {
          id: true, code: true, name: true, birdType: true, openingBirdCount: true, status: true,
          farm: { select: { name: true } },
          poultryHouse: { select: { name: true } }
        },
        take: 20
      });

      const eggTotals = await this.prisma.eggProductionRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, recordDate: { gte: since7 } },
        _sum: { goodEggs: true, crackedEggs: true, brokenEggs: true }
      });

      const mortalityTotals = await this.prisma.mortalityRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, recordDate: { gte: since7 }, isCulling: false },
        _sum: { birdCount: true }
      });

      const feedTotals = await this.prisma.feedConsumptionRecord.groupBy({
        by: ["flockBatchId"],
        where: { companyId, recordDate: { gte: since7 } },
        _sum: { quantityKg: true }
      });

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

      const healthObs = await this.prisma.poultryHealthObservation.findMany({
        where: { companyId, observationDate: { gte: since7 } },
        select: { severity: true, observation: true, recommendation: true, flockBatch: { select: { name: true } } },
        take: 5,
        orderBy: { observationDate: "desc" }
      });

      sections.push(`POULTRY (last 7 days):\n${flockLines.join("\n")}${healthObs.length ? "\nHealth observations:\n" + healthObs.map((h) => `  - ${h.flockBatch.name} [${h.severity}]: ${h.observation}`).join("\n") : ""}`);
    }

    // ── Feed Production ───────────────────────────────────────
    if (has("feed.read")) {
      const batches = await this.prisma.feedProductionBatch.findMany({
        where: { companyId, createdAt: { gte: since30 } },
        select: {
          batchNumber: true, status: true, producedQuantityKg: true,
          productionOrder: { select: { formula: { select: { name: true, feedType: true } } } }
        },
        take: 10,
        orderBy: { createdAt: "desc" }
      });

      const formulas = await this.prisma.feedFormula.findMany({
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
      });

      const formulaLines = formulas.map((f) => `  - ${f.name} (${f.feedType}): GHS ${Number(f.versions[0]?.costPer100Kg ?? 0).toFixed(2)}/100kg`);
      const batchLines = batches.map((b) => `  - ${b.batchNumber} [${b.status}]: formula=${b.productionOrder.formula.name}, output=${Number(b.producedQuantityKg).toFixed(2)}kg`);

      sections.push(`FEED PRODUCTION (last 30 days):\nActive formulas:\n${formulaLines.join("\n")}\nRecent batches:\n${batchLines.join("\n")}`);
    }

    // ── Soya Processing ───────────────────────────────────────
    if (has("soya.read")) {
      const soyaBatches = await this.prisma.soyaProcessingBatch.findMany({
        where: { companyId, createdAt: { gte: since30 } },
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

      sections.push(`SOYA PROCESSING (last 30 days):\n${soyaLines.join("\n")}`);
    }

    // ── Inventory ─────────────────────────────────────────────
    if (has("inventory.read")) {
      const lowStock = await this.prisma.inventoryItem.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          reorderLevel: { gt: 0 },
          quantityOnHand: { gt: 0 }
        },
        select: {
          quantityOnHand: true, reorderLevel: true,
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } }
        },
        take: 50
      });

      const critical = lowStock.filter((i) => Number(i.quantityOnHand) <= Number(i.reorderLevel));
      const criticalLines = critical
        .slice(0, 10)
        .map((i) => `  - ${i.product.name} (${i.warehouse.name}): ${Number(i.quantityOnHand).toFixed(2)} on hand, reorder at ${Number(i.reorderLevel).toFixed(2)}`);

      const totalValue = await this.prisma.inventoryValuation.aggregate({
        where: { companyId },
        _sum: { totalValue: true }
      });

      sections.push(`INVENTORY:\nLow/critical stock items (${critical.length} total):\n${criticalLines.join("\n")}\nTotal inventory value: GHS ${Number(totalValue._sum.totalValue ?? 0).toLocaleString()}`);
    }

    // ── Sales ─────────────────────────────────────────────────
    if (has("sales.read")) {
      const salesStats = await this.prisma.salesOrder.aggregate({
        where: { companyId, createdAt: { gte: since30 }, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
        _count: { id: true }
      });

      const topDebtors = await this.prisma.customer.findMany({
        where: { companyId, status: "ACTIVE" },
        select: {
          name: true, code: true,
          creditLimits: { select: { currentBalance: true }, take: 1, orderBy: { createdAt: "desc" } }
        },
        take: 20
      });

      const debtorList = topDebtors
        .filter((c) => Number(c.creditLimits[0]?.currentBalance ?? 0) > 0)
        .sort((a, b) => Number(b.creditLimits[0]?.currentBalance ?? 0) - Number(a.creditLimits[0]?.currentBalance ?? 0))
        .slice(0, 5)
        .map((c) => `  - ${c.name}: GHS ${Number(c.creditLimits[0]?.currentBalance ?? 0).toLocaleString()}`);

      const inactiveThreshold = new Date(Date.now() - 60 * 86400000);
      const stoppedBuying = await this.prisma.customer.findMany({
        where: {
          companyId, status: "ACTIVE",
          salesOrders: { none: { createdAt: { gte: inactiveThreshold } } }
        },
        select: { name: true },
        take: 5
      });

      sections.push(
        `SALES (last 30 days):\nOrders: ${salesStats._count.id}, Revenue: GHS ${Number(salesStats._sum.totalAmount ?? 0).toLocaleString()}, Collected: GHS ${Number(salesStats._sum.paidAmount ?? 0).toLocaleString()}, Outstanding: GHS ${Number(salesStats._sum.balanceDue ?? 0).toLocaleString()}\nTop debtors:\n${debtorList.join("\n")}${stoppedBuying.length ? `\nCustomers with no orders in 60 days: ${stoppedBuying.map((c) => c.name).join(", ")}` : ""}`
      );
    }

    // ── Finance ───────────────────────────────────────────────
    if (has("finance.read")) {
      const revenue = await this.prisma.revenue.aggregate({
        where: { companyId, revenueDate: { gte: since30 } },
        _sum: { amount: true }
      });
      const expenses = await this.prisma.expense.aggregate({
        where: { companyId, expenseDate: { gte: since30 } },
        _sum: { amount: true }
      });

      const revenueAmount = Number(revenue._sum.amount ?? 0);
      const expenseAmount = Number(expenses._sum.amount ?? 0);
      const grossProfit = revenueAmount - expenseAmount;
      sections.push(`FINANCE (last 30 days):\nRevenue: GHS ${revenueAmount.toLocaleString()}, Expenses: GHS ${expenseAmount.toLocaleString()}, Net: GHS ${grossProfit.toLocaleString()}`);
    }

    // ── Procurement ───────────────────────────────────────────
    if (has("procurement.read")) {
      const pendingPOs = await this.prisma.purchaseOrder.aggregate({
        where: { companyId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } },
        _count: { id: true },
        _sum: { totalAmount: true }
      });

      const rawMaterials = await this.prisma.inventoryItem.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          product: { type: "RAW_MATERIAL" }
        },
        select: {
          quantityOnHand: true, reorderLevel: true,
          product: { select: { name: true } }
        },
        take: 20
      });

      const nearZero = rawMaterials
        .filter((r) => Number(r.reorderLevel ?? 0) > 0 && Number(r.quantityOnHand) <= Number(r.reorderLevel) * 1.5)
        .slice(0, 5)
        .map((r) => `  - ${r.product.name}: ${Number(r.quantityOnHand).toFixed(2)} on hand`);

      sections.push(`PROCUREMENT:\nPending POs: ${pendingPOs._count.id} (GHS ${Number(pendingPOs._sum.totalAmount ?? 0).toLocaleString()})\nRaw materials near depletion:\n${nearZero.join("\n") || "  None"}`);
    }

    // ── Maintenance ───────────────────────────────────────────
    if (has("maintenance.read")) {
      const breakdowns = await this.prisma.breakdownRecord.findMany({
        where: { companyId, status: { in: ["REPORTED", "ASSIGNED", "IN_REPAIR"] } },
        select: { severity: true, machine: { select: { name: true } } },
        take: 5
      });

      const overdue = await this.prisma.maintenanceSchedule.findMany({
        where: { companyId, nextDueDate: { lt: new Date() }, status: { not: "CANCELLED" } },
        select: { machine: { select: { name: true } }, nextDueDate: true },
        take: 5
      });

      if (breakdowns.length || overdue.length) {
        const bdLines = breakdowns.map((b) => `  - ${b.machine?.name ?? "Unassigned asset"} [${b.severity}]`);
        const ovLines = overdue.map((o) => `  - ${o.machine?.name ?? "Unassigned asset"}: due ${o.nextDueDate.toISOString().slice(0, 10)}`);
        sections.push(`MAINTENANCE:\nActive breakdowns:\n${bdLines.join("\n") || "  None"}\nOverdue schedules:\n${ovLines.join("\n") || "  None"}`);
      }
    }

    if (sections.length === 0) {
      return "No business data available for your current permission set.";
    }

    return sections.join("\n\n");
  }
}
