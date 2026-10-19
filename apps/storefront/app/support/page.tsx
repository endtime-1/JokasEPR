import Image from "next/image";
import { Check, MessageCircle } from "lucide-react";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import { FeatureIcon } from "@/components/icons";
import { QUALITY, SUPPORT, VALUES, CONTACT } from "@/lib/content";
import { whatsappLink, WHATSAPP_DISPLAY } from "@/lib/contact";

export const metadata = {
  title: "Farmer Support & Quality",
  description: "How Akoko Feeds supports farmers with on-the-farm advice, feeding programs and training, and the quality mandate behind every bag.",
};

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3.5">
      {items.map((t) => (
        <li key={t} className="flex gap-3.5 leading-relaxed text-stone">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Check size={13} /></span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function SupportPage() {
  return (
    <>
      <PageHero
        eyebrow="Farmer support"
        title={<>More than feed. <em className="text-brand">A partner on the farm.</em></>}
        lead="Quality feed, expert guidance and continuous support, because that is what successful poultry farming takes."
        image="/photos/farmer-tablet.webp"
      />

      {/* The Akoko Feed Value */}
      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <RevealSection className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">The Akoko Feed value</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">What every bag stands for.</h2>
          </RevealSection>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v, i) => (
              <RevealSection key={v.title} className={`reveal-delay-${i + 1}`}>
                <div className="h-full rounded-3xl bg-cream p-7 ring-1 ring-sand">
                  <FeatureIcon name={v.icon} />
                  <p className="mt-5 font-semibold leading-relaxed text-ink">{v.title}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* How we support you */}
      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <RevealSection>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">How we support you</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">Expert guidance, <em className="text-brand">continuous support.</em></h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">{SUPPORT.intro}</p>
            <p className="mt-6 font-bold text-ink">Akoko Feeds provides:</p>
            <Checklist items={SUPPORT.items} />
            <p className="mt-6 leading-relaxed text-muted">{SUPPORT.outro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={whatsappLink("Hello Akoko Feeds, I would like on-the-farm support.")} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#1ebe5a]">
                <MessageCircle size={16} /> {WHATSAPP_DISPLAY}
              </a>
              <a href={`mailto:${CONTACT.emailSupport}`} className="rounded-xl border border-sand bg-white px-6 py-3.5 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">{CONTACT.emailSupport}</a>
            </div>
          </RevealSection>
          <RevealSection className="reveal-delay-2 relative h-[420px] overflow-hidden rounded-4xl shadow-deep lg:h-[560px]">
            <Image src="/photos/expert-team.webp" alt="Poultry technical team with farmers" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </RevealSection>
        </div>
      </section>

      {/* Quality mandate */}
      <section className="grain relative overflow-hidden bg-ink py-20 lg:py-28">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div className="relative mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <RevealSection className="relative h-[380px] overflow-hidden rounded-4xl lg:h-[520px]">
            <Image src="/photos/house-aisle.webp" alt="A clean, well-run poultry house" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
          </RevealSection>
          <RevealSection className="reveal-delay-2">
            <div className="flex items-center gap-4">
              <FeatureIcon name="shield" tone="dark" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Our quality mandate</p>
            </div>
            <h2 className="mt-5 font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-white">Quality is the <em className="text-brand">foundation.</em></h2>
            <p className="mt-4 text-lg text-white/65">{QUALITY.intro}</p>
            <ul className="mt-6 space-y-3.5">
              {QUALITY.items.map((t) => (
                <li key={t} className="flex gap-3.5 leading-relaxed text-white/80">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand"><Check size={13} /></span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 leading-relaxed text-white/60">{QUALITY.outro}</p>
          </RevealSection>
        </div>
      </section>

      {/* Farmer wins */}
      <section className="bg-white py-20 lg:py-24">
        <RevealSection className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <FeatureIcon name="star" className="mx-auto" />
          <h2 className="mt-5 font-display text-[clamp(2rem,4.5vw,3rem)] text-ink">Farmer wins</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted">Farmers trust Akoko Feeds to grow their businesses. Our success is measured by our farmers&apos; profitability.</p>
          <a href={whatsappLink("Hello Akoko Feeds, I would like to share my story as an Akoko farmer.")} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-xl border border-sand px-6 py-3.5 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">
            Share your Akoko story
          </a>
        </RevealSection>
      </section>
    </>
  );
}
