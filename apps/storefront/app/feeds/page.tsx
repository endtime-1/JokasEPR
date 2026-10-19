import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import PageHero from "@/components/PageHero";
import RevealSection from "@/components/RevealSection";
import { whatsappLink } from "@/lib/contact";
import { bagMash, bagConcentrate } from "@/lib/range";
import { FEED_DETAILS, LAYER_INTRO, BROILER_INTRO, BROILER_BENEFITS, BROILER_FIT, type FeedDetail } from "@/lib/content";

export const metadata = {
  title: "Our Feeds",
  description:
    "Akoko Feeds for layers and broilers: Super Chicks, Chicks Starter, Developer, Pre-Lay, Layer 1, Layer 2, Broiler Starter and Broiler Finisher, each as mash and concentrate in 50 kg bags.",
};

function FeedBlock({ f, i }: { f: FeedDetail; i: number }) {
  return (
    <RevealSection className="reveal-delay-1">
      <article className={`grid items-center gap-8 rounded-4xl bg-white p-6 shadow-panel ring-1 ring-sand sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 ${i % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}>
        <div className="relative grid grid-cols-2 gap-3 rounded-3xl bg-gradient-to-b from-[#fff3e3] to-[#f8d9b0] p-4">
          {[
            { src: bagMash(f.slug), label: "Mash (100%)" },
            { src: bagConcentrate(f.slug), label: "Concentrate (50%)" },
          ].map((b) => (
            <div key={b.label} className="text-center">
              <div className="relative h-56 sm:h-72">
                <Image
                  src={b.src}
                  alt={`${f.name} ${b.label} bag`}
                  fill
                  sizes="(max-width: 1024px) 45vw, 22vw"
                  className="object-contain drop-shadow-[0_14px_16px_rgba(0,0,0,0.22)]"
                />
              </div>
              <span className="mt-2 inline-block rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-brandDark">{b.label}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-3xl text-ink">{f.name}</h3>
            {f.period && <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Use for {f.period}</span>}
          </div>
          <p className="mt-4 leading-relaxed text-muted">{f.body}</p>
          <p className="mt-3 text-sm font-semibold text-stone">Mash and concentrate · 50 kg sacks</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/products?q=${encodeURIComponent(f.name)}`}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-brandSm transition hover:bg-brandDark active:scale-95"
            >
              See prices <ArrowRight size={14} />
            </Link>
            <a
              href={whatsappLink(`Hello Akoko Feeds, I would like to order ${f.name}. Please share today's price and delivery.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-5 py-3 text-sm font-bold text-[#128C4A] transition hover:bg-[#25D366]/20 active:scale-95"
            >
              <MessageCircle size={15} /> Order on WhatsApp
            </a>
          </div>
        </div>
      </article>
    </RevealSection>
  );
}

export default function FeedsPage() {
  const layers = FEED_DETAILS.filter((f) => f.group === "Layers");
  const broilers = FEED_DETAILS.filter((f) => f.group === "Broilers");
  return (
    <>
      <PageHero
        eyebrow="Our feeds"
        title={<>Feed for every <em className="text-brand">stage.</em></>}
        lead="Akoko feeds for layers and broilers, each as a mash and a concentrate in 50 kg sacks."
        image="/photos/feed-trough.webp"
      >
        <Link href="/feeding-guide" className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark">
          Feeding guide <ArrowRight size={15} />
        </Link>
      </PageHero>

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto max-w-8xl space-y-14 px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Layers</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">
              Healthy growth, <em className="text-brand">optimal egg production.</em>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">{LAYER_INTRO}</p>
          </div>
          <div className="space-y-8">{layers.map((f, i) => <FeedBlock key={f.slug} f={f} i={i} />)}</div>

          <div className="max-w-3xl pt-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Broilers</p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] leading-[1.05] text-ink">
              Rapid growth, <em className="text-brand">excellent conversion.</em>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">{BROILER_INTRO}</p>
            <p className="mt-5 text-sm font-bold uppercase tracking-wider text-stone">Akoko broiler feed ensures</p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {BROILER_BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-3 text-stone">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Check size={13} /></span>
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-muted">{BROILER_FIT}</p>
          </div>
          <div className="space-y-8">{broilers.map((f, i) => <FeedBlock key={f.slug} f={f} i={i} />)}</div>
        </div>
      </section>
    </>
  );
}
