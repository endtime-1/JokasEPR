"use client";

import Link from "next/link";
import { ArrowRight, Bird, Boxes, Factory, ShoppingCart, Wheat, type LucideIcon } from "lucide-react";

type SectionCard = {
  key: string;
  label: string;
  sub?: string;
  value: number;
  unit?: string;
  tone: "neutral" | "good" | "warning" | "critical";
  href: string;
};
export type DashboardSection = {
  key: string;
  label: string;
  icon: string;
  moduleHref: string;
  cards: SectionCard[];
};

const ICONS: Record<string, LucideIcon> = { bird: Bird, wheat: Wheat, factory: Factory, cart: ShoppingCart, boxes: Boxes };

const TONE: Record<SectionCard["tone"], { wrap: string; val: string; dot: string }> = {
  critical: { wrap: "from-red-50 border-red-200", val: "text-red-700", dot: "bg-red-400" },
  warning: { wrap: "from-amber-50 border-amber-200", val: "text-caution", dot: "bg-amber-400" },
  good: { wrap: "from-emerald-50 border-emerald-200", val: "text-emerald-700", dot: "bg-emerald-400" },
  neutral: { wrap: "from-white border-line", val: "text-ink", dot: "bg-brand" },
};

function fmt(value: number, unit?: string): string {
  const n = new Intl.NumberFormat("en-GH", { maximumFractionDigits: unit === "kg" || unit === "L" || unit === "crates" ? 1 : 0 }).format(value);
  if (unit === "GHS") return `GHS ${n}`;
  return n;
}

function MetricCard({ card }: { card: SectionCard }) {
  const t = TONE[card.tone];
  return (
    <Link
      href={card.href}
      className={`group block rounded-2xl border bg-gradient-to-b ${t.wrap} to-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-ink/50">
          {card.label}
          {card.sub && <span className="ml-1 inline-block rounded bg-field px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-ink/45">{card.sub}</span>}
        </p>
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${t.dot} opacity-70`} />
          <ArrowRight aria-hidden className="h-3.5 w-3.5 text-ink/20 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </div>
      <strong className={`mt-3 block text-[22px] font-extrabold leading-none tracking-tight ${t.val}`}>
        {fmt(card.value, card.unit)}
        {card.unit && card.unit !== "GHS" && <span className="ml-1 text-xs font-bold text-ink/40">{card.unit}</span>}
      </strong>
    </Link>
  );
}

export function ExecutiveSections({ sections }: { sections: DashboardSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const Icon = ICONS[section.icon] ?? Boxes;
        return (
          <section key={section.key} className="app-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-white to-field px-5 py-3.5">
              <span className="flex items-center gap-2.5 text-sm font-bold text-ink">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                {section.label}
              </span>
              <Link
                href={section.moduleHref}
                className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/60 transition hover:border-brand/40 hover:text-brand"
              >
                Open module
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              {section.cards.map((card) => (
                <MetricCard key={card.key} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
