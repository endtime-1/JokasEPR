import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Target, Compass } from "lucide-react";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import { FeatureIcon, type IconName } from "@/components/icons";
import { ABOUT, INTRO } from "@/lib/content";

export const metadata = {
  title: "About Us",
  description: "Akoko Feeds is dedicated to delivering superior animal nutrition solutions for modern poultry farming. Your Choice for Profit.",
};

const VALUE_ICONS: Record<string, IconName> = {
  Quality: "shield",
  Integrity: "handshake",
  Innovation: "flask",
  "Farmer Success": "chart",
  Sustainability: "leaf",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title={<>Akoko Feeds. <em className="text-brand">Quality Feed, Higher Production.</em></>}
        lead={ABOUT.lead}
        image="/photos/hero-hen-sunset.webp"
      />

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <RevealSection>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">{INTRO.heading}</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">
              Superior nutrition for <em className="text-brand">modern poultry farming.</em>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">{ABOUT.body}</p>
            <p className="mt-4 leading-relaxed text-muted">{INTRO.lead}</p>
            <p className="mt-4 leading-relaxed text-muted">{ABOUT.impact}</p>
          </RevealSection>
          <RevealSection className="reveal-delay-2 relative h-[420px] overflow-hidden rounded-4xl shadow-deep lg:h-[540px]">
            <Image src="/photos/farm-feeding.webp" alt="A farmer feeding her flock" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </RevealSection>
        </div>
      </section>

      {/* Vision and mission */}
      <section className="grain relative overflow-hidden bg-ink py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div className="relative mx-auto grid max-w-8xl gap-6 px-5 sm:px-8 md:grid-cols-2">
          <RevealSection>
            <div className="h-full rounded-4xl bg-white/[0.06] p-8 ring-1 ring-white/10 sm:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-brandSm"><Compass size={22} /></span>
              <h3 className="mt-6 font-display text-3xl text-white">Our vision</h3>
              <p className="mt-3 text-lg leading-relaxed text-white/70">{ABOUT.vision}</p>
            </div>
          </RevealSection>
          <RevealSection className="reveal-delay-2">
            <div className="h-full rounded-4xl bg-white/[0.06] p-8 ring-1 ring-white/10 sm:p-10">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-brandSm"><Target size={22} /></span>
              <h3 className="mt-6 font-display text-3xl text-white">Our mission</h3>
              <p className="mt-3 text-lg leading-relaxed text-white/70">{ABOUT.mission}</p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* Core values */}
      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <RevealSection className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">What we stand for</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">Our core values</h2>
          </RevealSection>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {ABOUT.values.map((v, i) => (
              <RevealSection key={v} className={`reveal-delay-${Math.min(i + 1, 5)}`}>
                <div className="flex h-full flex-col items-center rounded-3xl bg-cream p-6 text-center ring-1 ring-sand">
                  <FeatureIcon name={VALUE_ICONS[v] ?? "star"} />
                  <p className="mt-4 font-display text-xl text-ink">{v}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cream py-16">
        <RevealSection className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <p className="font-display text-[clamp(2rem,5vw,3.4rem)] italic text-brand">{ABOUT.tagline}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/feeds" className="flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-brandSm transition hover:bg-brandDark">
              Explore our feeds <ArrowRight size={15} />
            </Link>
            <Link href="/retailers" className="rounded-xl border border-sand bg-white px-7 py-3.5 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">Become a retailer</Link>
          </div>
        </RevealSection>
      </section>
    </>
  );
}
