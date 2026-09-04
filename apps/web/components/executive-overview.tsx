"use client";

import Link from "next/link";
import { ArrowRight, Bird, Boxes, Factory, Landmark, Wheat } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

type Card = { key: string; label: string; value: number; unit?: string; tone: "neutral" | "good" | "warning" | "critical"; delta?: number | null };
type Series = { name: string; data: { label: string; value: number }[] };

function fmt(value: number, unit?: string) {
  const n = new Intl.NumberFormat("en-GH", { maximumFractionDigits: unit === "%" ? 1 : 0 }).format(value);
  if (unit === "GHS") return `GHS ${n}`;
  if (unit === "%") return `${n}%`;
  return n;
}

const TONE: Record<string, string> = {
  critical: "text-red-600",
  warning: "text-amber-700",
  good: "text-emerald-700",
  neutral: "text-ink",
};

// one series → a flat number[] for the sparkline
function spark(charts: Record<string, Series[]>, key: string): { i: number; value: number }[] {
  const s = charts?.[key]?.[0];
  if (!s) return [];
  return s.data.map((d, i) => ({ i, value: d.value }));
}

// "Today"/"Yesterday" read naturally bare ("Mortality today"); an earlier
// picked date reads better with "on" ("Mortality on 15 Aug").
function dayPhrase(dayLabel: string): string {
  return dayLabel === "Today" || dayLabel === "Yesterday" ? dayLabel.toLowerCase() : `on ${dayLabel}`;
}

export function ExecutiveOverview({
  summary, charts, dayLabel = "Today", periodLabel = "selected period"
}: { summary: Card[]; charts: Record<string, Series[]>; dayLabel?: string; periodLabel?: string }) {
  const by = Object.fromEntries(summary.map((c) => [c.key, c])) as Record<string, Card | undefined>;
  const v = (k: string) => by[k]?.value ?? 0;
  const day = dayPhrase(dayLabel);

  const openAlerts = v("lowStockAlerts") + v("pendingPurchaseApprovals") + v("machineMaintenanceAlerts") + v("aiAlerts") + v("pendingProductionOrders");

  const ribbon = [
    { label: "Total birds", value: fmt(v("totalBirds"), "birds"), spark: spark(charts, "mortalityTrend"), tone: "neutral" as const },
    {
      label: `Mortality ${day}`, value: fmt(v("mortalityToday")), spark: spark(charts, "mortalityTrend"),
      tone: v("mortalityToday") > 0 ? ("critical" as const) : ("good" as const),
      // The Daily stepper (Today/Yesterday/any date) drives the value above;
      // the Scope & trend window filter (7d/30d/MTD/...) drives this
      // sub-line instead — so switching that filter still visibly does
      // something even though it no longer touches the "Today" figure.
      sub: `${periodLabel}: ${fmt(v("mortalityPeriod"))}`,
    },
    {
      label: `Eggs ${day}`, value: fmt(v("eggProductionToday")), spark: spark(charts, "eggProductionTrend"), tone: "neutral" as const,
      sub: `${periodLabel}: ${fmt(v("eggProductionPeriod"))}`,
    },
    { label: "Inventory value", value: fmt(v("currentInventoryValue"), "GHS"), spark: [], tone: "neutral" as const },
    { label: "Sales this month", value: fmt(v("salesThisMonth"), "GHS"), spark: spark(charts, "salesTrend"), tone: "good" as const },
    { label: "Open items", value: fmt(openAlerts), spark: [], tone: openAlerts > 0 ? ("warning" as const) : ("good" as const) },
  ];

  const modules = [
    {
      key: "poultry", label: "Poultry", icon: Bird, href: "/dashboard/poultry", spark: spark(charts, "mortalityTrend"),
      lines: [
        { label: "batches open", value: fmt(v("activeFlockBatches")) },
        { label: `dead ${day}`, value: fmt(v("mortalityToday")), tone: v("mortalityToday") > 0 ? "critical" : undefined },
        { label: `eggs ${day}`, value: fmt(v("eggProductionToday")) },
        // Feed *fed to birds* is a poultry number (drawn from the farm feed
        // store), not a feed-mill number — it belongs on this card.
        { label: `feed fed ${day}`, value: `${fmt(v("feedConsumedToday"))} kg` },
      ],
    },
    {
      key: "feed", label: "Feed Mill", icon: Wheat, href: "/dashboard/feed", spark: spark(charts, "feedProductionTrend"),
      lines: [
        { label: "produced this wk", value: `${fmt(v("feedProducedThisWeek"))} kg` },
        { label: "orders pending", value: fmt(v("pendingProductionOrders")), tone: v("pendingProductionOrders") > 0 ? "warning" : undefined },
      ],
    },
    {
      key: "soya", label: "Soya", icon: Factory, href: "/dashboard/soya", spark: spark(charts, "soyaProductionTrend"),
      lines: [
        { label: "beans processed", value: `${fmt(v("soyaBeansProcessedThisWeek"))} kg` },
        { label: "oil produced", value: `${fmt(v("soyaOilProduced"))} L` },
        { label: "cake produced", value: `${fmt(v("soyaCakeProduced"))} kg` },
      ],
    },
    {
      key: "inventory", label: "Inventory", icon: Boxes, href: "/dashboard/inventory", spark: [],
      lines: [
        { label: "stock value", value: fmt(v("currentInventoryValue"), "GHS") },
        { label: "low stock", value: fmt(v("lowStockAlerts")), tone: v("lowStockAlerts") > 0 ? "critical" : undefined },
      ],
    },
    {
      key: "finance", label: "Sales & Finance", icon: Landmark, href: "/dashboard/finance", spark: spark(charts, "salesTrend"),
      lines: [
        { label: "sales this month", value: fmt(v("salesThisMonth"), "GHS") },
        { label: "debtors", value: fmt(v("outstandingCustomerDebt"), "GHS"), tone: v("outstandingCustomerDebt") > 0 ? "warning" : undefined },
        { label: "creditors", value: fmt(v("supplierDebt"), "GHS"), tone: v("supplierDebt") > 0 ? "warning" : undefined },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI ribbon */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Key metrics">
        {ribbon.map((k) => (
          <div key={k.label} className="app-card p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/45">{k.label}</div>
            <div className={`text-lg font-extrabold leading-tight ${TONE[k.tone]}`}>{k.value}</div>
            {"sub" in k && k.sub && <div className="mt-0.5 text-[10px] font-medium text-ink/40">{k.sub}</div>}
            {k.spark.length > 1 && (
              <div className="mt-1 h-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={k.spark}><Line type="monotone" dataKey="value" stroke="#2F6F6A" strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* module cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Business lines">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.key}
              href={m.href}
              className="app-card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-soft"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                  {m.label}
                </span>
                <ArrowRight className="h-4 w-4 text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-brand" />
              </div>
              <dl className="space-y-1">
                {m.lines.map((l) => (
                  <div key={l.label} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-ink/55">{l.label}</dt>
                    <dd className={`tabular-nums font-semibold ${l.tone === "critical" ? "text-red-600" : l.tone === "warning" ? "text-amber-700" : "text-ink"}`}>{l.value}</dd>
                  </div>
                ))}
              </dl>
              {m.spark.length > 1 && (
                <div className="h-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={m.spark}><Line type="monotone" dataKey="value" stroke="#2F6F6A" strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
