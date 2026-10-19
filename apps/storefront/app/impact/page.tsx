import Image from "next/image";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import { FeatureIcon, type IconName } from "@/components/icons";
import { COMMUNITY, GREEN } from "@/lib/content";

export const metadata = {
  title: "Our Impact",
  description: "The Akoko Feeds green value chain and how we help local communities through farmer training, youth mentorship and employment.",
};

function IconGrid({ items, tone = "brand" }: { items: Array<{ icon: IconName; title: string }>; tone?: "brand" | "dark" }) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.title} className={`flex items-center gap-4 rounded-2xl p-4 ${tone === "dark" ? "bg-white/[0.06] ring-1 ring-white/10" : "bg-white ring-1 ring-sand shadow-card"}`}>
          <FeatureIcon name={it.icon} size={46} tone={tone === "dark" ? "dark" : "brand"} />
          <p className={`font-semibold leading-snug ${tone === "dark" ? "text-white" : "text-ink"}`}>{it.title}</p>
        </div>
      ))}
    </div>
  );
}

export default function ImpactPage() {
  return (
    <>
      <PageHero
        eyebrow="Our impact"
        title={<>Feeding more than <em className="text-brand">flocks.</em></>}
        lead="Sustainability is part of our DNA: for people, for profit and for the planet."
        image="/photos/layer-house.webp"
      />

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <RevealSection>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Sustainability</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">{GREEN.heading}</h2>
            <p className="mt-4 text-lg text-muted">{GREEN.lead}</p>
            <IconGrid items={GREEN.items} />
            <p className="mt-7 leading-relaxed text-stone">{GREEN.outro}</p>
          </RevealSection>
          <RevealSection className="reveal-delay-2 relative h-[420px] overflow-hidden rounded-4xl shadow-deep lg:h-[560px]">
            <Image src="/photos/feed-trough.webp" alt="Hens feeding from a trough" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </RevealSection>
        </div>
      </section>

      <section className="grain relative overflow-hidden bg-ink py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div className="relative mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <RevealSection className="relative h-[420px] overflow-hidden rounded-4xl lg:h-[540px]">
            <Image src="/photos/farm-feeding.webp" alt="A farmer feeding her flock" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </RevealSection>
          <RevealSection className="reveal-delay-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Community</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-white">{COMMUNITY.heading}</h2>
            <p className="mt-4 text-lg text-white/65">{COMMUNITY.lead}</p>
            <IconGrid items={COMMUNITY.items} tone="dark" />
            <p className="mt-7 leading-relaxed text-white/65">{COMMUNITY.outro}</p>
          </RevealSection>
        </div>
      </section>
    </>
  );
}
