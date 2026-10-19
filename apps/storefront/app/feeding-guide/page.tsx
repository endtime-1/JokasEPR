import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import { FeatureIcon } from "@/components/icons";
import { BROILER_CHART, BROILER_NOTE, LAYER_CHART, MIXING, PRELAYER_RULE } from "@/lib/content";
import { whatsappLink } from "@/lib/contact";

export const metadata = {
  title: "Feeding Guide",
  description: "Akoko Feeds feeding chart for layers and broilers, plus feed mixing instructions for concentrates.",
};

function Chart({ title, rows }: { title: string; rows: Array<{ age: string; feed: string; bag: string }> }) {
  return (
    <div className="overflow-hidden rounded-4xl bg-white shadow-panel ring-1 ring-sand">
      <div className="border-b border-sand bg-warm px-6 py-4">
        <h3 className="font-display text-2xl text-ink">{title}</h3>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs font-bold uppercase tracking-wider text-muted">
            <th className="px-6 py-3">Bird age</th>
            <th className="px-6 py-3">Feed type</th>
            <th className="px-6 py-3 text-right">Bag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.age} className="border-t border-sand/70 text-sm">
              <td className="px-6 py-4 font-semibold text-ink">{r.age}</td>
              <td className="px-6 py-4 text-stone">{r.feed}</td>
              <td className="px-6 py-4 text-right text-muted">{r.bag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FeedingGuidePage() {
  return (
    <>
      <PageHero
        eyebrow="Feed chart"
        title={<>Feed the right way, <em className="text-brand">every week.</em></>}
        lead="Our feeding charts give clear guidelines for every poultry stage, so you reach maximum biological and economic performance."
        image="/photos/layer-house.webp"
      />

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <RevealSection className="grid gap-8 lg:grid-cols-2">
            <div>
              <Chart title="Layers" rows={LAYER_CHART} />
              <div className="mt-5 flex gap-3 rounded-2xl border border-warmBorder bg-warm p-5 text-sm leading-relaxed text-stone">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-brand" />
                <p>{PRELAYER_RULE}</p>
              </div>
            </div>
            <div>
              <Chart title="Broilers" rows={BROILER_CHART} />
              <p className="mt-5 rounded-2xl border border-sand bg-white p-5 text-sm leading-relaxed text-stone">{BROILER_NOTE}</p>
            </div>
          </RevealSection>

          <RevealSection className="mt-20">
            <div className="flex items-center gap-4">
              <FeatureIcon name="clipboard" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Concentrates</p>
                <h2 className="font-display text-[clamp(1.9rem,4vw,2.8rem)] leading-tight text-ink">Feed mixing instructions</h2>
              </div>
            </div>
            <ol className="mt-8 space-y-4">
              {MIXING.map((m, i) => (
                <li key={i} className="flex gap-5 rounded-3xl bg-white p-6 shadow-card ring-1 ring-sand">
                  <span className="font-display text-4xl italic leading-none text-brand/80">{String(i + 1).padStart(2, "0")}</span>
                  <p className="pt-1 leading-relaxed text-stone">{m}</p>
                </li>
              ))}
            </ol>
          </RevealSection>

          <RevealSection className="mt-16 rounded-4xl bg-ink p-8 text-center sm:p-12">
            <h3 className="font-display text-3xl text-white">Need help with your feeding plan?</h3>
            <p className="mx-auto mt-3 max-w-lg text-white/60">Our farmer-support team gives free advice on feeding programs for your flock.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href={whatsappLink("Hello Akoko Feeds, I need help with a feeding plan for my birds.")} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#1ebe5a]">
                Ask on WhatsApp
              </a>
              <Link href="/feeds" className="flex items-center gap-2 rounded-xl border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-brand hover:text-brand">
                See all feeds <ArrowRight size={14} />
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>
    </>
  );
}
