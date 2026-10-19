import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import RevealSection from "@/components/RevealSection";
import PremiumProductCard from "@/components/PremiumProductCard";
import FeedFinder from "@/components/home/FeedFinder";
import { Hero, StatsBar, IntroValues, RangeGrid, FeedingProgramme, AdviceBand, HowItWorks, RetailerTeaser, FinalCTA } from "@/components/home/sections";

export const revalidate = 60;

/** Live products published from the ERP. Hidden until at least one is published,
 *  so the page never shows an empty shelf (the static range below always shows). */
async function LiveShop() {
  const products = await api.products.list().catch(() => []);
  const featured = products.slice(0, 6);
  if (featured.length === 0) return null;

  return (
    <section className="bg-ink py-24 lg:py-32">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-12 flex items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">In the shop now</p>
            <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05] text-white">
              Order <em className="text-brand">today.</em>
            </h2>
          </div>
          <Link href="/products" className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-brand hover:text-brand lg:flex">
            All products <ArrowRight size={14} />
          </Link>
        </RevealSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p, i) => (
            <RevealSection key={p.id} className={`reveal-delay-${Math.min(i + 1, 4)}`}>
              <PremiumProductCard product={p} featured={i === 0} />
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  return (
    <>
      <Hero />
      <StatsBar />
      <IntroValues />
      <section id="feed-finder" className="scroll-mt-20 bg-cream py-24 lg:py-32">
        <FeedFinder />
      </section>
      <RangeGrid />
      <LiveShop />
      <FeedingProgramme />
      <AdviceBand />
      <HowItWorks />
      <RetailerTeaser />
      <FinalCTA />
    </>
  );
}
