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
  module: "poultry" | "feed" | "soya" | "inventory" | "sales";
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

export const DOCUMENT_REPORTS: DocumentReportDefinition[] = [poultryBatchLifecycle];
