/**
 * Document reports — the rich, multi-section "leaf" reports (a poultry batch
 * lifecycle, a feed production batch, a warehouse stock card…). Unlike the flat
 * table reports in reports.service.ts, a document report returns an ordered
 * list of typed sections that the web renders as charts / tables / timelines
 * and the API can render to PDF.
 *
 * Each definition declares the scope-tree node type it runs against
 * (`scopeType`) and a `run()` that assembles the sections.
 */
import { PermissionKey } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "@jokas/shared";

export type ReportSection =
  | { type: "header"; fields: { label: string; value: string }[] }
  | { type: "kpis"; items: { label: string; value: string; tone?: "good" | "warning" | "critical" | "neutral" }[] }
  | {
      type: "line-chart";
      title: string;
      xKey: string;
      series: { name: string; key: string; color?: string }[];
      data: Record<string, string | number>[];
    }
  | {
      type: "bar-chart";
      title: string;
      xKey: string;
      series: { name: string; key: string; color?: string }[];
      data: Record<string, string | number>[];
    }
  | { type: "table"; title: string; columns: { key: string; label: string; type?: "text" | "number" | "money" | "date" | "percent" }[]; rows: Record<string, unknown>[] }
  | { type: "timeline"; title: string; events: { date: string; label: string; kind: string }[] }
  | { type: "narrative"; text: string };

export type DocumentReport = {
  id: string;
  title: string;
  subtitle: string;
  scope: { type: string; id: string; label: string };
  generatedAt: string;
  sections: ReportSection[];
};

export type DocumentReportContext = {
  prisma: PrismaService;
  user: AuthenticatedUser;
  scopeType: string;
  scopeId: string;
  range?: { start?: Date; end?: Date };
};

export type DocumentReportDefinition = {
  id: string;
  module: "poultry" | "feed" | "soya" | "inventory" | "sales" | "procurement" | "hr" | "maintenance";
  label: string;
  description: string;
  /** Scope-tree node type this report runs against. */
  scopeType: string;
  permission: PermissionKey;
  run: (ctx: DocumentReportContext) => Promise<{ subtitle: string; scopeLabel: string; sections: ReportSection[] }>;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

// ── Poultry: batch lifecycle ───────────────────────────────────────────────
const poultryBatchLifecycle: DocumentReportDefinition = {
  id: "poultry.batch-lifecycle",
  module: "poultry",
  label: "Batch lifecycle",
  description: "The full life of one flock — birds, mortality, production, feed, cost and events.",
  scopeType: "batch",
  permission: "poultry.read",
  async run({ prisma, user, scopeId }) {
    const batch = await prisma.flockBatch.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      include: {
        farm: { select: { name: true, code: true } },
        poultryHouse: { select: { name: true, code: true } },
        dailyRecords: { where: { deletedAt: null }, orderBy: { recordDate: "asc" } },
        mortalityRecords: { where: { deletedAt: null }, orderBy: { recordDate: "asc" } },
        feedConsumptionRecords: { where: { deletedAt: null }, orderBy: { recordDate: "asc" } },
        eggProductionRecords: { where: { deletedAt: null }, orderBy: { recordDate: "asc" } },
        birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "asc" } },
        medicationRecords: { where: { deletedAt: null }, orderBy: { startDate: "asc" } },
        vaccinationRecords: { where: { deletedAt: null }, orderBy: { vaccinationDate: "asc" } },
        healthObservations: { where: { deletedAt: null }, orderBy: { observationDate: "asc" } },
        poultryTransferRecords: { where: { deletedAt: null }, orderBy: { transferDate: "asc" } },
        costRecords: { where: { deletedAt: null }, orderBy: { costDate: "asc" } },
      },
    });
    if (!batch) throw new Error("Flock batch was not found.");

    const placed = num(batch.openingBirdCount);
    const totalDeaths = batch.mortalityRecords.filter((m) => !m.isCulling).reduce((s, m) => s + num(m.birdCount), 0);
    const totalCulls = batch.mortalityRecords.filter((m) => m.isCulling).reduce((s, m) => s + num(m.birdCount), 0);
    const netTransfers = batch.poultryTransferRecords.reduce((s, t) => {
      const inbound = t.toFarmId === batch.farmId;
      return s + (inbound ? num(t.birdCount) : -num(t.birdCount));
    }, 0);
    const alive = Math.max(placed - totalDeaths - totalCulls + netTransfers, 0);
    const mortalityPct = placed > 0 ? round((totalDeaths / placed) * 100, 2) : 0;

    const totalFeedKg = batch.feedConsumptionRecords.reduce((s, f) => s + num(f.quantityKg), 0);
    const eggTotals = batch.eggProductionRecords.reduce(
      (a, e) => ({
        good: a.good + num(e.goodEggs),
        other: a.other + num(e.crackedEggs) + num(e.dirtyEggs) + num(e.brokenEggs) + num(e.rejectedEggs),
      }),
      { good: 0, other: 0 },
    );
    const totalEggs = eggTotals.good + eggTotals.other;
    const totalCost = batch.costRecords.reduce((s, c) => s + num(c.amount), 0);
    const isLayer = ["LAYERS", "BREEDERS"].includes(batch.birdType);
    // FCR only meaningful for meat birds — kg feed per kg liveweight gain.
    const latestWeight = batch.birdWeightRecords.at(-1);
    const liveWeightKg = latestWeight ? num(latestWeight.averageWeightKg) * alive : 0;
    const fcr = !isLayer && liveWeightKg > 0 ? round(totalFeedKg / liveWeightKg, 2) : null;

    const ageWeeks = round((Date.now() - new Date(batch.startDate).getTime()) / (7 * 86400000), 1);

    // ── daily series ──
    const days = new Map<string, { date: string; deaths: number; eggs: number; feed: number }>();
    const touch = (d: Date | string) => {
      const k = dayKey(d);
      if (!days.has(k)) days.set(k, { date: k, deaths: 0, eggs: 0, feed: 0 });
      return days.get(k)!;
    };
    for (const m of batch.mortalityRecords) if (!m.isCulling) touch(m.recordDate).deaths += num(m.birdCount);
    for (const e of batch.eggProductionRecords) {
      const row = touch(e.recordDate);
      row.eggs += num(e.goodEggs) + num(e.crackedEggs) + num(e.dirtyEggs) + num(e.brokenEggs) + num(e.rejectedEggs);
    }
    for (const f of batch.feedConsumptionRecords) touch(f.recordDate).feed += num(f.quantityKg);

    const ordered = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    let cumDeaths = 0;
    let cumFeed = 0;
    const birdCurve = ordered.map((d) => {
      cumDeaths += d.deaths;
      return { date: d.date, alive: Math.max(placed - cumDeaths, 0), cumulativeMortality: cumDeaths };
    });
    const mortalityCurve = ordered.map((d) => {
      const prior = birdCurve.find((b) => b.date === d.date)?.cumulativeMortality ?? 0;
      return { date: d.date, daily: d.deaths, cumulative: prior };
    });
    const eggCurve = ordered.filter((d) => d.eggs > 0).map((d) => ({ date: d.date, eggs: d.eggs }));
    const feedCurve = ordered.filter((d) => d.feed > 0).map((d) => {
      cumFeed += d.feed;
      return { date: d.date, daily: round(d.feed, 1), cumulative: round(cumFeed, 1) };
    });

    const events = [
      ...batch.poultryTransferRecords.map((t) => ({ date: dayKey(t.transferDate), label: `Transfer — ${num(t.birdCount)} birds`, kind: "transfer" })),
      ...batch.medicationRecords.map((m) => ({ date: dayKey(m.startDate), label: `Medication — ${m.medicationName}`, kind: "medication" })),
      ...batch.vaccinationRecords.map((v) => ({ date: dayKey(v.vaccinationDate), label: `Vaccination — ${v.vaccineName}`, kind: "vaccination" })),
      ...batch.healthObservations.map((h) => ({ date: dayKey(h.observationDate), label: `Health (${h.severity}) — ${h.observation}`.slice(0, 120), kind: "health" })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const costByType = new Map<string, number>();
    for (const c of batch.costRecords) costByType.set(c.costType, (costByType.get(c.costType) ?? 0) + num(c.amount));

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Batch", value: `${batch.code} — ${batch.name}` },
          { label: "Farm / House", value: `${batch.farm?.name ?? "—"} / ${batch.poultryHouse?.name ?? "multi-house"}` },
          { label: "Bird type", value: batch.birdType },
          { label: "Placed → alive", value: `${placed.toLocaleString()} → ${alive.toLocaleString()}` },
          { label: "Age", value: `${ageWeeks} weeks` },
          { label: "Status", value: batch.status },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Live birds", value: alive.toLocaleString(), tone: "neutral" },
          { label: "Mortality", value: `${mortalityPct}%`, tone: mortalityPct > 5 ? "critical" : "good" },
          { label: "Culls", value: totalCulls.toLocaleString(), tone: "neutral" },
          { label: isLayer ? "Eggs to date" : "Feed conversion", value: isLayer ? totalEggs.toLocaleString() : fcr != null ? `${fcr}` : "—", tone: "neutral" },
          { label: "Feed used", value: `${round(totalFeedKg, 0).toLocaleString()} kg`, tone: "neutral" },
          { label: "Cost to date", value: `GHS ${round(totalCost, 0).toLocaleString()}`, tone: "warning" },
          { label: "Cost / bird placed", value: `GHS ${placed > 0 ? round(totalCost / placed, 2) : 0}`, tone: "neutral" },
        ],
      },
      {
        type: "line-chart",
        title: "Bird survival",
        xKey: "date",
        series: [
          { name: "Alive", key: "alive", color: "#2F6F6A" },
          { name: "Cumulative mortality", key: "cumulativeMortality", color: "#9A4526" },
        ],
        data: birdCurve,
      },
      {
        type: "line-chart",
        title: "Mortality — daily & cumulative",
        xKey: "date",
        series: [
          { name: "Daily", key: "daily", color: "#9A4526" },
          { name: "Cumulative", key: "cumulative", color: "#C08A2E" },
        ],
        data: mortalityCurve,
      },
      isLayer
        ? { type: "line-chart" as const, title: "Egg production per day", xKey: "date", series: [{ name: "Eggs", key: "eggs", color: "#3C6E9F" }], data: eggCurve }
        : {
            type: "line-chart" as const,
            title: "Average weight",
            xKey: "date",
            series: [{ name: "kg", key: "kg", color: "#3C6E9F" }],
            data: batch.birdWeightRecords.map((w) => ({ date: dayKey(w.recordDate), kg: round(num(w.averageWeightKg), 3) })),
          },
      {
        type: "line-chart",
        title: "Feed — daily & cumulative (kg)",
        xKey: "date",
        series: [
          { name: "Daily", key: "daily", color: "#3C6E9F" },
          { name: "Cumulative", key: "cumulative", color: "#2F6F6A" },
        ],
        data: feedCurve,
      },
      {
        type: "table",
        title: "Cost breakdown",
        columns: [
          { key: "type", label: "Cost type", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows: [...costByType.entries()].map(([type, amount]) => ({ type: type.replace(/_/g, " "), amount: round(amount, 2) })),
      },
      { type: "timeline", title: "Events", events },
      {
        type: "narrative",
        text: buildNarrative({ mortalityPct, isLayer, totalEggs, alive, placed, fcr, ageWeeks }),
      },
    ];

    return {
      subtitle: `${batch.farm?.name ?? ""} · ${batch.birdType} · placed ${dayKey(batch.startDate)}`,
      scopeLabel: `${batch.code} — ${batch.name}`,
      sections,
    };
  },
};

function buildNarrative(p: { mortalityPct: number; isLayer: boolean; totalEggs: number; alive: number; placed: number; fcr: number | null; ageWeeks: number }): string {
  const parts: string[] = [];
  const survival = p.placed > 0 ? round((p.alive / p.placed) * 100, 1) : 0;
  parts.push(`${survival}% of birds placed are still alive after ${p.ageWeeks} weeks (mortality ${p.mortalityPct}%).`);
  if (p.mortalityPct > 5) parts.push("Mortality is above the 5% watch line — review the mortality and health sections.");
  if (p.isLayer) parts.push(`${p.totalEggs.toLocaleString()} eggs collected to date.`);
  else if (p.fcr != null) parts.push(`Feed conversion is ${p.fcr} kg feed per kg liveweight.`);
  return parts.join(" ");
}

// ── Feed Mill: production batch ────────────────────────────────────────────
const feedProductionBatch: DocumentReportDefinition = {
  id: "feed.production-batch",
  module: "feed",
  label: "Feed batch",
  description: "One feed run — formula vs actual, raw-material draw, yield, cost per kg and quality.",
  scopeType: "feedBatch",
  permission: "feed.read",
  async run({ prisma, user, scopeId }) {
    const batch = await prisma.feedProductionBatch.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      include: {
        productionSite: { select: { name: true, code: true } },
        finishedProduct: { select: { name: true, sku: true } },
        productionOrder: { select: { plannedQuantityKg: true, formula: { select: { name: true, code: true } } } },
        rawMaterialUsages: { where: { deletedAt: null }, include: { rawMaterial: { select: { name: true, sku: true } } } },
        qualityChecks: { orderBy: { checkedAt: "asc" } },
        finishedFeedStocks: { include: { warehouse: { select: { name: true, code: true } } } },
        internalTransfers: { include: { toFarm: { select: { name: true } }, toPoultryHouse: { select: { name: true } } } },
        costs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!batch) throw new Error("Feed production batch was not found.");

    const produced = num(batch.producedQuantityKg);
    const wastage = num(batch.wastageKg);
    const planned = num(batch.productionOrder?.plannedQuantityKg);
    const rmCost = batch.rawMaterialUsages.reduce((s, u) => s + num(u.quantityKg) * num(u.unitCost), 0);
    const cost = batch.costs[0];
    const totalCost = cost
      ? num(cost.rawMaterialCost) + num(cost.laborCost) + num(cost.packagingCost) + num(cost.overheadCost)
      : rmCost;
    const costPerKg = produced > 0 ? round(totalCost / produced, 3) : 0;
    const wastagePct = produced + wastage > 0 ? round((wastage / (produced + wastage)) * 100, 2) : 0;

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Batch", value: batch.batchNumber },
          { label: "Site", value: batch.productionSite?.name ?? "—" },
          { label: "Product", value: batch.finishedProduct ? `${batch.finishedProduct.name} (${batch.finishedProduct.sku})` : "—" },
          { label: "Formula", value: batch.productionOrder?.formula?.name ?? "—" },
          { label: "Produced", value: `${round(produced, 0).toLocaleString()} kg` },
          { label: "Date / status", value: `${dayKey(batch.productionDate)} · ${batch.status}` },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Produced", value: `${round(produced, 0).toLocaleString()} kg`, tone: "neutral" },
          { label: "Planned", value: planned > 0 ? `${round(planned, 0).toLocaleString()} kg` : "—", tone: "neutral" },
          { label: "Wastage", value: `${wastagePct}%`, tone: wastagePct > 3 ? "warning" : "good" },
          { label: "Total cost", value: `GHS ${round(totalCost, 0).toLocaleString()}`, tone: "warning" },
          { label: "Cost / kg", value: `GHS ${costPerKg}`, tone: "neutral" },
        ],
      },
      {
        type: "table",
        title: "Raw materials used",
        columns: [
          { key: "material", label: "Material", type: "text" },
          { key: "quantityKg", label: "Qty (kg)", type: "number" },
          { key: "unitCost", label: "Unit cost", type: "money" },
          { key: "lineCost", label: "Line cost", type: "money" },
        ],
        rows: batch.rawMaterialUsages.map((u) => ({
          material: u.rawMaterial ? `${u.rawMaterial.name} (${u.rawMaterial.sku})` : "—",
          quantityKg: round(num(u.quantityKg), 2),
          unitCost: round(num(u.unitCost), 2),
          lineCost: round(num(u.quantityKg) * num(u.unitCost), 2),
        })),
      },
      {
        type: "bar-chart",
        title: "Cost breakdown",
        xKey: "part",
        series: [{ name: "GHS", key: "amount", color: "#9A4526" }],
        data: cost
          ? [
              { part: "Raw material", amount: round(num(cost.rawMaterialCost), 2) },
              { part: "Labour", amount: round(num(cost.laborCost), 2) },
              { part: "Packaging", amount: round(num(cost.packagingCost), 2) },
              { part: "Overhead", amount: round(num(cost.overheadCost), 2) },
            ]
          : [{ part: "Raw material", amount: round(rmCost, 2) }],
      },
      {
        type: "table",
        title: "Quality checks",
        columns: [
          { key: "date", label: "Checked", type: "date" },
          { key: "moisture", label: "Moisture %", type: "percent" },
          { key: "protein", label: "Protein %", type: "percent" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: batch.qualityChecks.map((q) => ({
          date: dayKey(q.checkedAt),
          moisture: q.moisturePercent != null ? round(num(q.moisturePercent), 2) : "",
          protein: q.proteinPercent != null ? round(num(q.proteinPercent), 2) : "",
          status: q.status,
        })),
      },
      {
        type: "table",
        title: "Where it went",
        columns: [
          { key: "dest", label: "Destination", type: "text" },
          { key: "qty", label: "Qty (kg)", type: "number" },
        ],
        rows: [
          ...batch.finishedFeedStocks.map((f) => ({ dest: `Warehouse — ${f.warehouse?.name ?? "—"}`, qty: round(num(f.quantityKg), 1) })),
          ...batch.internalTransfers.map((t) => ({ dest: `Farm — ${t.toFarm?.name ?? t.toPoultryHouse?.name ?? "—"}`, qty: round(num(t.quantityKg), 1) })),
        ],
      },
      {
        type: "narrative",
        text: `${round(produced, 0).toLocaleString()} kg produced${planned > 0 ? ` against ${round(planned, 0).toLocaleString()} kg planned` : ""} at GHS ${costPerKg}/kg. Wastage ${wastagePct}%.`,
      },
    ];
    return {
      subtitle: `${batch.productionSite?.name ?? ""} · ${dayKey(batch.productionDate)}`,
      scopeLabel: batch.batchNumber,
      sections,
    };
  },
};

// ── Soya: processing batch ────────────────────────────────────────────────
const soyaProcessingBatch: DocumentReportDefinition = {
  id: "soya.processing-batch",
  module: "soya",
  label: "Processing batch",
  description: "One crush — beans in vs oil and cake out, extraction rate, waste, cost and quality.",
  scopeType: "soyaBatch",
  permission: "soya.read",
  async run({ prisma, user, scopeId }) {
    const batch = await prisma.soyaProcessingBatch.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      include: {
        productionSite: { select: { name: true, code: true } },
        oilOutputs: { include: { product: { select: { name: true } }, warehouse: { select: { name: true } } } },
        cakeOutputs: { include: { product: { select: { name: true } }, warehouse: { select: { name: true } } } },
        wasteRecords: true,
        qualityChecks: { orderBy: { checkedAt: "asc" } },
      },
    });
    if (!batch) throw new Error("Soya processing batch was not found.");

    const beans = num(batch.beansUsedKg);
    const oil = batch.oilOutputs.reduce((s, o) => s + num(o.quantityLitres), 0);
    const cake = batch.cakeOutputs.reduce((s, c) => s + num(c.quantityKg), 0);
    const waste = batch.wasteRecords.reduce((s, w) => s + num(w.quantityKg), 0);
    const oilCost = batch.oilOutputs.reduce((s, o) => s + num(o.quantityLitres) * num(o.unitCost), 0);
    const cakeCost = batch.cakeOutputs.reduce((s, c) => s + num(c.quantityKg) * num(c.unitCost), 0);
    const oilYield = beans > 0 ? round((oil / beans) * 100, 2) : 0;
    const cakeYield = beans > 0 ? round((cake / beans) * 100, 2) : 0;

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Batch", value: batch.batchNumber },
          { label: "Site", value: batch.productionSite?.name ?? "—" },
          { label: "Beans used", value: `${round(beans, 0).toLocaleString()} kg` },
          { label: "Date / status", value: `${dayKey(batch.processingDate)} · ${batch.status}` },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Beans in", value: `${round(beans, 0).toLocaleString()} kg`, tone: "neutral" },
          { label: "Oil out", value: `${round(oil, 0).toLocaleString()} L`, tone: "good" },
          { label: "Cake out", value: `${round(cake, 0).toLocaleString()} kg`, tone: "good" },
          { label: "Oil yield", value: `${oilYield}%`, tone: "neutral" },
          { label: "Cake yield", value: `${cakeYield}%`, tone: "neutral" },
          { label: "Waste", value: `${round(waste, 0).toLocaleString()} kg`, tone: waste > beans * 0.05 ? "warning" : "good" },
        ],
      },
      {
        type: "bar-chart",
        title: "Mass balance",
        xKey: "stream",
        series: [{ name: "kg / L", key: "qty", color: "#2F6F6A" }],
        data: [
          { stream: "Beans in", qty: round(beans, 0) },
          { stream: "Oil out", qty: round(oil, 0) },
          { stream: "Cake out", qty: round(cake, 0) },
          { stream: "Waste", qty: round(waste, 0) },
        ],
      },
      {
        type: "table",
        title: "Outputs",
        columns: [
          { key: "product", label: "Product", type: "text" },
          { key: "qty", label: "Quantity", type: "number" },
          { key: "warehouse", label: "Warehouse", type: "text" },
          { key: "cost", label: "Cost", type: "money" },
        ],
        rows: [
          ...batch.oilOutputs.map((o) => ({ product: `${o.product?.name ?? "Oil"} (L)`, qty: round(num(o.quantityLitres), 1), warehouse: o.warehouse?.name ?? "—", cost: round(num(o.quantityLitres) * num(o.unitCost), 2) })),
          ...batch.cakeOutputs.map((c) => ({ product: `${c.product?.name ?? "Cake"} (kg)`, qty: round(num(c.quantityKg), 1), warehouse: c.warehouse?.name ?? "—", cost: round(num(c.quantityKg) * num(c.unitCost), 2) })),
        ],
      },
      {
        type: "table",
        title: "Quality checks",
        columns: [
          { key: "date", label: "Checked", type: "date" },
          { key: "moisture", label: "Moisture %", type: "percent" },
          { key: "purity", label: "Oil purity %", type: "percent" },
          { key: "protein", label: "Cake protein %", type: "percent" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: batch.qualityChecks.map((q) => ({
          date: dayKey(q.checkedAt),
          moisture: q.moisturePercent != null ? round(num(q.moisturePercent), 2) : "",
          purity: q.oilPurityPercent != null ? round(num(q.oilPurityPercent), 2) : "",
          protein: q.cakeProteinPercent != null ? round(num(q.cakeProteinPercent), 2) : "",
          status: q.status,
        })),
      },
      {
        type: "narrative",
        text: `${round(beans, 0).toLocaleString()} kg beans yielded ${round(oil, 0).toLocaleString()} L oil (${oilYield}%) and ${round(cake, 0).toLocaleString()} kg cake (${cakeYield}%). Output cost GHS ${round(oilCost + cakeCost, 0).toLocaleString()}.`,
      },
    ];
    return { subtitle: `${batch.productionSite?.name ?? ""} · ${dayKey(batch.processingDate)}`, scopeLabel: batch.batchNumber, sections };
  },
};

// ── Inventory: stock card ─────────────────────────────────────────────────
const inventoryStockCard: DocumentReportDefinition = {
  id: "inventory.stock-card",
  module: "inventory",
  label: "Stock card",
  description: "One product in one warehouse — every movement, running balance, ageing and expiry.",
  scopeType: "inventoryItem",
  permission: "inventory.read",
  async run({ prisma, user, scopeId }) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, code: true } },
      },
    });
    if (!item) throw new Error("Inventory item was not found.");

    const [movements, batches] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { companyId: user.companyId, deletedAt: null, productId: item.productId, OR: [{ warehouseId: item.warehouseId }, { fromWarehouseId: item.warehouseId }, { toWarehouseId: item.warehouseId }] },
        orderBy: { movementDate: "asc" },
        take: 500,
        select: { movementDate: true, movementType: true, quantity: true, unitCost: true, fromWarehouseId: true, toWarehouseId: true, referenceType: true },
      }),
      prisma.stockBatch.findMany({
        where: { companyId: user.companyId, deletedAt: null, productId: item.productId, warehouseId: item.warehouseId },
        orderBy: { expiryDate: "asc" },
        select: { batchNumber: true, quantityRemaining: true, unitCost: true, expiryDate: true, status: true, createdAt: true },
      }),
    ]);

    const onHand = num(item.quantityOnHand);
    const IN = new Set(["PURCHASE_RECEIPT", "PRODUCTION_OUTPUT", "ADJUSTMENT_IN", "OPENING_BALANCE"]);
    let bal = 0;
    const ledger = movements.map((m) => {
      const inbound = IN.has(m.movementType) || m.toWarehouseId === item.warehouseId;
      const signed = (inbound ? 1 : -1) * num(m.quantity);
      bal += signed;
      return { date: dayKey(m.movementDate), type: m.movementType.replace(/_/g, " "), in: inbound ? num(m.quantity) : "", out: inbound ? "" : num(m.quantity), balance: round(bal, 2) };
    });
    const valuation = batches.reduce((s, b) => s + num(b.quantityRemaining) * num(b.unitCost), 0);

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Product", value: `${item.product?.name ?? "—"} (${item.product?.sku ?? ""})` },
          { label: "Warehouse", value: item.warehouse ? `${item.warehouse.name} (${item.warehouse.code})` : "—" },
          { label: "On hand", value: round(onHand, 2).toLocaleString() },
          { label: "Reorder level", value: round(num(item.reorderLevel), 2).toLocaleString() },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "On hand", value: round(onHand, 0).toLocaleString(), tone: onHand <= num(item.reorderLevel) ? "critical" : "neutral" },
          { label: "Valuation", value: `GHS ${round(valuation, 0).toLocaleString()}`, tone: "neutral" },
          { label: "Open lots", value: String(batches.filter((b) => num(b.quantityRemaining) > 0).length), tone: "neutral" },
          { label: "Movements (all time)", value: String(movements.length), tone: "neutral" },
        ],
      },
      {
        type: "line-chart",
        title: "Running balance",
        xKey: "date",
        series: [{ name: "Balance", key: "balance", color: "#2F6F6A" }],
        data: ledger.map((l) => ({ date: l.date, balance: l.balance })),
      },
      {
        type: "table",
        title: "Movements",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "type", label: "Type", type: "text" },
          { key: "in", label: "In", type: "number" },
          { key: "out", label: "Out", type: "number" },
          { key: "balance", label: "Balance", type: "number" },
        ],
        rows: ledger.slice(-100),
      },
      {
        type: "table",
        title: "Lots on hand — ageing & expiry",
        columns: [
          { key: "batch", label: "Lot", type: "text" },
          { key: "remaining", label: "Remaining", type: "number" },
          { key: "unitCost", label: "Unit cost", type: "money" },
          { key: "age", label: "Age (days)", type: "number" },
          { key: "expiry", label: "Expiry", type: "date" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: batches
          .filter((b) => num(b.quantityRemaining) > 0)
          .map((b) => ({
            batch: b.batchNumber,
            remaining: round(num(b.quantityRemaining), 2),
            unitCost: round(num(b.unitCost), 2),
            age: Math.round((Date.now() - new Date(b.createdAt).getTime()) / 86400000),
            expiry: b.expiryDate ? dayKey(b.expiryDate) : "",
            status: b.status,
          })),
      },
    ];
    return {
      subtitle: `${item.warehouse?.name ?? ""}`,
      scopeLabel: `${item.product?.sku ?? ""} @ ${item.warehouse?.code ?? ""}`,
      sections,
    };
  },
};

// ── Sales: customer statement ─────────────────────────────────────────────
const customerStatement: DocumentReportDefinition = {
  id: "sales.customer-statement",
  module: "sales",
  label: "Customer statement",
  description: "One customer's account — every invoice, payment and return, with the running balance.",
  scopeType: "customer",
  permission: "sales.read",
  async run({ prisma, user, scopeId, range }) {
    const customer = await prisma.customer.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true, code: true, phone: true, email: true },
    });
    if (!customer) throw new Error("Customer was not found.");

    const entries = await prisma.customerStatement.findMany({
      where: {
        companyId: user.companyId,
        customerId: scopeId,
        ...(range?.start || range?.end ? { entryDate: { gte: range?.start, lte: range?.end } } : {}),
      },
      orderBy: { entryDate: "asc" },
      take: 1000,
    });

    const totalDebit = entries.reduce((s, e) => s + num(e.debit), 0);
    const totalCredit = entries.reduce((s, e) => s + num(e.credit), 0);
    const closing = entries.at(-1) ? num(entries.at(-1)!.balance) : 0;

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Customer", value: customer.code ? `${customer.name} (${customer.code})` : customer.name },
          { label: "Phone", value: customer.phone ?? "—" },
          { label: "Email", value: customer.email ?? "—" },
          { label: "Closing balance", value: `GHS ${round(closing, 2).toLocaleString()}` },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Invoiced", value: `GHS ${round(totalDebit, 0).toLocaleString()}`, tone: "neutral" },
          { label: "Paid / credited", value: `GHS ${round(totalCredit, 0).toLocaleString()}`, tone: "good" },
          { label: "Balance owing", value: `GHS ${round(closing, 0).toLocaleString()}`, tone: closing > 0 ? "warning" : "good" },
          { label: "Entries", value: String(entries.length), tone: "neutral" },
        ],
      },
      {
        type: "line-chart",
        title: "Account balance",
        xKey: "date",
        series: [{ name: "Balance", key: "balance", color: "#9A4526" }],
        data: entries.map((e) => ({ date: dayKey(e.entryDate), balance: round(num(e.balance), 2) })),
      },
      {
        type: "table",
        title: "Statement",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "type", label: "Type", type: "text" },
          { key: "description", label: "Description", type: "text" },
          { key: "debit", label: "Debit", type: "money" },
          { key: "credit", label: "Credit", type: "money" },
          { key: "balance", label: "Balance", type: "money" },
        ],
        rows: entries.map((e) => ({
          date: dayKey(e.entryDate),
          type: e.entryType,
          description: e.description,
          debit: num(e.debit) ? round(num(e.debit), 2) : "",
          credit: num(e.credit) ? round(num(e.credit), 2) : "",
          balance: round(num(e.balance), 2),
        })),
      },
      {
        type: "narrative",
        text: closing > 0
          ? `${customer.name} owes GHS ${round(closing, 2).toLocaleString()} across ${entries.length} account entries.`
          : `${customer.name}'s account is settled.`,
      },
    ];
    return { subtitle: customer.code ?? "", scopeLabel: customer.name, sections };
  },
};

// ── Procurement: purchase-order lifecycle ─────────────────────────────────
const purchaseOrderLifecycle: DocumentReportDefinition = {
  id: "procurement.purchase-order",
  module: "procurement",
  label: "Purchase order",
  description: "One PO from order to receipt to invoice to payment, with line items and fulfilment.",
  scopeType: "purchaseOrder",
  permission: "procurement.read",
  async run({ prisma, user, scopeId }) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      include: {
        supplier: { select: { name: true, code: true } },
        items: { orderBy: { sequence: "asc" } },
        grnRecords: { select: { reference: true, receivedDate: true, postedAt: true } },
        invoices: { select: { invoiceNumber: true, invoiceDate: true, totalAmount: true, paidAmount: true, balanceDue: true, status: true } },
      },
    });
    if (!po) throw new Error("Purchase order was not found.");

    const ordered = num(po.totalAmount);
    const orderedQty = po.items.reduce((s, i) => s + num(i.quantity), 0);
    const receivedQty = po.items.reduce((s, i) => s + num(i.receivedQty), 0);
    const fulfilment = orderedQty > 0 ? round((receivedQty / orderedQty) * 100, 1) : 0;
    const invoiced = po.invoices.reduce((s, i) => s + num(i.totalAmount), 0);
    const paid = po.invoices.reduce((s, i) => s + num(i.paidAmount), 0);

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "PO", value: po.reference },
          { label: "Supplier", value: po.supplier ? `${po.supplier.name} (${po.supplier.code})` : "—" },
          { label: "Order date", value: dayKey(po.orderDate) },
          { label: "Total", value: `${po.currency} ${round(ordered, 2).toLocaleString()}` },
          { label: "Status", value: po.status },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Ordered", value: `${po.currency} ${round(ordered, 0).toLocaleString()}`, tone: "neutral" },
          { label: "Fulfilment", value: `${fulfilment}%`, tone: fulfilment >= 100 ? "good" : "warning" },
          { label: "Invoiced", value: `${po.currency} ${round(invoiced, 0).toLocaleString()}`, tone: "neutral" },
          { label: "Paid", value: `${po.currency} ${round(paid, 0).toLocaleString()}`, tone: paid >= invoiced ? "good" : "warning" },
          { label: "Outstanding", value: `${po.currency} ${round(invoiced - paid, 0).toLocaleString()}`, tone: invoiced - paid > 0 ? "warning" : "good" },
        ],
      },
      {
        type: "table",
        title: "Line items",
        columns: [
          { key: "product", label: "Item", type: "text" },
          { key: "quantity", label: "Ordered", type: "number" },
          { key: "received", label: "Received", type: "number" },
          { key: "unitCost", label: "Unit cost", type: "money" },
          { key: "lineTotal", label: "Line total", type: "money" },
        ],
        rows: po.items.map((i) => ({
          product: i.productName,
          quantity: round(num(i.quantity), 2),
          received: round(num(i.receivedQty), 2),
          unitCost: round(num(i.unitCost), 2),
          lineTotal: round(num(i.lineTotal), 2),
        })),
      },
      {
        type: "timeline",
        title: "Lifecycle",
        events: [
          { date: dayKey(po.orderDate), label: `Ordered — ${po.currency} ${round(ordered, 2).toLocaleString()}`, kind: "order" },
          ...po.grnRecords.map((g) => ({ date: dayKey(g.receivedDate), label: `Goods received — ${g.reference}${g.postedAt ? " (posted)" : ""}`, kind: "receipt" })),
          ...po.invoices.map((inv) => ({ date: dayKey(inv.invoiceDate), label: `Invoice ${inv.invoiceNumber} — ${po.currency} ${round(num(inv.totalAmount), 2).toLocaleString()} (${inv.status})`, kind: "invoice" })),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      },
      { type: "narrative", text: `${fulfilment}% received; ${po.currency} ${round(invoiced - paid, 2).toLocaleString()} still owed to ${po.supplier?.name ?? "the supplier"}.` },
    ];
    return { subtitle: po.supplier?.name ?? "", scopeLabel: po.reference, sections };
  },
};

// ── HR: employee record ──────────────────────────────────────────────────
const employeeRecord: DocumentReportDefinition = {
  id: "hr.employee-record",
  module: "hr",
  label: "Employee record",
  description: "One employee — attendance, payroll history, leave and disciplinary.",
  scopeType: "employee",
  permission: "hr.read",
  async run({ prisma, user, scopeId }) {
    const emp = await prisma.employee.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      select: { id: true, code: true, fullName: true, phone: true, email: true, startDate: true, status: true, branch: { select: { name: true } } },
    });
    if (!emp) throw new Error("Employee was not found.");

    const since = new Date(Date.now() - 180 * 86400000);
    const [attendance, payroll, leave, disciplinary] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { companyId: user.companyId, employeeId: scopeId, date: { gte: since } }, orderBy: { date: "asc" }, select: { date: true, hoursWorked: true, overtimeHours: true, checkInTime: true } }),
      prisma.payrollRecord.findMany({ where: { companyId: user.companyId, employeeId: scopeId, deletedAt: null }, orderBy: { periodEnd: "asc" }, select: { period: true, grossPay: true, netPay: true, deductions: true, status: true, paymentDate: true } }),
      prisma.leaveRequest.findMany({ where: { companyId: user.companyId, employeeId: scopeId }, orderBy: { startDate: "desc" }, take: 20, select: { reference: true, startDate: true, endDate: true, daysRequested: true, status: true } }),
      prisma.disciplinaryRecord.findMany({ where: { companyId: user.companyId, employeeId: scopeId, deletedAt: null }, orderBy: { incidentDate: "desc" }, take: 20, select: { reference: true, incidentDate: true, category: true, actionTaken: true } }),
    ]);

    const daysAttended = attendance.filter((a) => a.checkInTime).length;
    const totalHours = attendance.reduce((s, a) => s + num(a.hoursWorked), 0);
    const otHours = attendance.reduce((s, a) => s + num(a.overtimeHours), 0);
    const lastPay = payroll.filter((p) => p.status === "PAID").at(-1);
    const tenureYears = round((Date.now() - new Date(emp.startDate).getTime()) / (365 * 86400000), 1);

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Employee", value: `${emp.fullName} (${emp.code})` },
          { label: "Branch", value: emp.branch?.name ?? "—" },
          { label: "Phone / email", value: `${emp.phone ?? "—"} · ${emp.email ?? "—"}` },
          { label: "Started", value: `${dayKey(emp.startDate)} (${tenureYears} yrs)` },
          { label: "Status", value: emp.status },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Days attended (6 mo)", value: String(daysAttended), tone: "neutral" },
          { label: "Hours worked (6 mo)", value: round(totalHours, 0).toLocaleString(), tone: "neutral" },
          { label: "Overtime hours", value: round(otHours, 0).toLocaleString(), tone: "neutral" },
          { label: "Last net pay", value: lastPay ? `GHS ${round(num(lastPay.netPay), 0).toLocaleString()}` : "—", tone: "neutral" },
          { label: "Open disciplinary", value: String(disciplinary.length), tone: disciplinary.length > 0 ? "warning" : "good" },
        ],
      },
      {
        type: "bar-chart",
        title: "Net pay by period",
        xKey: "period",
        series: [{ name: "Net pay", key: "netPay", color: "#2F6F6A" }],
        data: payroll.filter((p) => p.status === "PAID").map((p) => ({ period: p.period, netPay: round(num(p.netPay), 0) })),
      },
      {
        type: "table",
        title: "Leave",
        columns: [
          { key: "reference", label: "Ref", type: "text" },
          { key: "start", label: "From", type: "date" },
          { key: "end", label: "To", type: "date" },
          { key: "days", label: "Days", type: "number" },
          { key: "status", label: "Status", type: "text" },
        ],
        rows: leave.map((l) => ({ reference: l.reference, start: dayKey(l.startDate), end: dayKey(l.endDate), days: l.daysRequested, status: l.status })),
      },
      {
        type: "table",
        title: "Disciplinary",
        columns: [
          { key: "reference", label: "Ref", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "category", label: "Category", type: "text" },
          { key: "action", label: "Action taken", type: "text" },
        ],
        rows: disciplinary.map((d) => ({ reference: d.reference, date: dayKey(d.incidentDate), category: d.category, action: d.actionTaken })),
      },
    ];
    return { subtitle: emp.branch?.name ?? "", scopeLabel: `${emp.fullName} (${emp.code})`, sections };
  },
};

// ── Maintenance: machine history ─────────────────────────────────────────
const machineHistory: DocumentReportDefinition = {
  id: "maintenance.machine-history",
  module: "maintenance",
  label: "Machine history",
  description: "One machine — breakdowns, downtime, service log, spare-part usage and cost.",
  scopeType: "machine",
  permission: "maintenance.read",
  async run({ prisma, user, scopeId }) {
    const machine = await prisma.machine.findFirst({
      where: { id: scopeId, companyId: user.companyId, deletedAt: null },
      select: { id: true, code: true, name: true, machineType: true, status: true, manufacturer: true, modelNumber: true, branch: { select: { name: true } } },
    });
    if (!machine) throw new Error("Machine was not found.");

    const [breakdowns, maintenance, downtime, parts, costs] = await Promise.all([
      prisma.breakdownRecord.findMany({ where: { companyId: user.companyId, machineId: scopeId, deletedAt: null }, orderBy: { reportedAt: "asc" }, select: { breakdownNumber: true, reportedAt: true, severity: true, status: true, description: true } }),
      prisma.maintenanceRecord.findMany({ where: { companyId: user.companyId, machineId: scopeId, deletedAt: null }, orderBy: { maintenanceDate: "asc" }, select: { recordNumber: true, maintenanceDate: true, maintenanceType: true, status: true } }),
      prisma.machineDowntimeRecord.findMany({ where: { companyId: user.companyId, machineId: scopeId, deletedAt: null }, orderBy: { startAt: "asc" }, select: { startAt: true, durationHours: true, reason: true } }),
      prisma.sparePartUsage.findMany({ where: { companyId: user.companyId, machineId: scopeId, deletedAt: null }, orderBy: { usedAt: "asc" }, select: { usedAt: true, quantity: true, totalCost: true, product: { select: { name: true, sku: true } } } }),
      prisma.maintenanceCost.findMany({ where: { companyId: user.companyId, machineId: scopeId, deletedAt: null }, select: { costDate: true, amount: true } }),
    ]);

    const totalDowntimeH = downtime.reduce((s, d) => s + num(d.durationHours), 0);
    const partsCost = parts.reduce((s, p) => s + num(p.totalCost), 0);
    const otherCost = costs.reduce((s, c) => s + num(c.amount), 0);
    const openBreakdowns = breakdowns.filter((b) => !["RESOLVED", "CLOSED"].includes(b.status)).length;

    const sections: ReportSection[] = [
      {
        type: "header",
        fields: [
          { label: "Machine", value: `${machine.name} (${machine.code})` },
          { label: "Type", value: String(machine.machineType).replace(/_/g, " ") },
          { label: "Make / model", value: `${machine.manufacturer ?? "—"} ${machine.modelNumber ?? ""}`.trim() },
          { label: "Branch", value: machine.branch?.name ?? "—" },
          { label: "Status", value: machine.status },
        ],
      },
      {
        type: "kpis",
        items: [
          { label: "Breakdowns", value: String(breakdowns.length), tone: "neutral" },
          { label: "Open breakdowns", value: String(openBreakdowns), tone: openBreakdowns > 0 ? "critical" : "good" },
          { label: "Downtime (hrs)", value: round(totalDowntimeH, 1).toLocaleString(), tone: totalDowntimeH > 0 ? "warning" : "good" },
          { label: "Services logged", value: String(maintenance.length), tone: "neutral" },
          { label: "Parts cost", value: `GHS ${round(partsCost, 0).toLocaleString()}`, tone: "warning" },
          { label: "Other cost", value: `GHS ${round(otherCost, 0).toLocaleString()}`, tone: "warning" },
        ],
      },
      {
        type: "timeline",
        title: "Events",
        events: [
          ...breakdowns.map((b) => ({ date: dayKey(b.reportedAt), label: `Breakdown (${b.severity}) — ${b.description}`.slice(0, 120), kind: "breakdown" })),
          ...maintenance.map((m) => ({ date: dayKey(m.maintenanceDate), label: `Service — ${String(m.maintenanceType).replace(/_/g, " ")} (${m.status})`, kind: "service" })),
        ].sort((a, b) => a.date.localeCompare(b.date)),
      },
      {
        type: "table",
        title: "Spare parts used",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "part", label: "Part", type: "text" },
          { key: "qty", label: "Qty", type: "number" },
          { key: "cost", label: "Cost", type: "money" },
        ],
        rows: parts.map((p) => ({ date: dayKey(p.usedAt), part: p.product ? `${p.product.name} (${p.product.sku})` : "—", qty: round(num(p.quantity), 2), cost: round(num(p.totalCost), 2) })),
      },
      { type: "narrative", text: `${breakdowns.length} breakdowns and ${round(totalDowntimeH, 1)} hours of downtime; total maintenance cost GHS ${round(partsCost + otherCost, 0).toLocaleString()}.` },
    ];
    return { subtitle: machine.branch?.name ?? "", scopeLabel: `${machine.name} (${machine.code})`, sections };
  },
};

export const DOCUMENT_REPORTS: DocumentReportDefinition[] = [
  poultryBatchLifecycle,
  feedProductionBatch,
  soyaProcessingBatch,
  inventoryStockCard,
  customerStatement,
  purchaseOrderLifecycle,
  employeeRecord,
  machineHistory,
];
