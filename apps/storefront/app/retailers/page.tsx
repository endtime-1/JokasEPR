import { Check, Phone } from "lucide-react";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import RetailerForm from "@/components/RetailerForm";
import { FeatureIcon } from "@/components/icons";
import { RETAILER, RETAILERS, phoneParts } from "@/lib/content";

export const metadata = {
  title: "Become a Retailer",
  description: "Join the Akoko Feeds distribution network and grow your agribusiness, or find an Akoko Feeds retailer near you.",
};

export default function RetailersPage() {
  return (
    <>
      <PageHero
        eyebrow="Distribution network"
        title={<>{RETAILER.heading}. <em className="text-brand">Grow with Akoko.</em></>}
        lead={RETAILER.lead}
        image="/photos/farm-feeding.webp"
      />

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto grid max-w-8xl items-start gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <RevealSection>
            <FeatureIcon name="handshake" />
            <h2 className="mt-5 font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">As our retail partner, <em className="text-brand">you enjoy:</em></h2>
            <ul className="mt-7 space-y-4">
              {RETAILER.benefits.map((b) => (
                <li key={b} className="flex items-center gap-3.5 text-lg text-stone">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Check size={15} /></span>
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-lg font-semibold text-ink">{RETAILER.cta}</p>
          </RevealSection>
          <RevealSection className="reveal-delay-2" >
            <div id="apply" className="scroll-mt-24"><RetailerForm /></div>
          </RevealSection>
        </div>
      </section>

      <section id="locate" className="scroll-mt-20 bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <RevealSection className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Locate a retailer</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">Akoko feed, <em className="text-brand">close to your farm.</em></h2>
            <p className="mt-3 text-muted">Our distribution centres across the Ashanti and Bono regions. Call the one nearest to you.</p>
          </RevealSection>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {RETAILERS.map((r, i) => (
              <RevealSection key={r.town} className={`reveal-delay-${(i % 3) + 1}`}>
                <div className="h-full rounded-3xl bg-cream p-7 ring-1 ring-sand">
                  <div className="flex items-center gap-3">
                    <FeatureIcon name="pin" size={42} tone="soft" />
                    <h3 className="font-display text-2xl text-ink">{r.town}</h3>
                  </div>
                  <ul className="mt-5 space-y-4">
                    {r.outlets.map((o) => (
                      <li key={o.name}>
                        <p className="font-semibold text-ink">{o.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {o.phones.map((p) => {
                            const ph = phoneParts(p);
                            return (
                              <a key={p} href={`tel:${ph.tel}`} className="inline-flex items-center gap-1.5 text-sm text-stone transition hover:text-brand">
                                <Phone size={12} className="text-brand" /> {ph.label}
                              </a>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
