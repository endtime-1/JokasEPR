import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowDown, Phone, Mail, Check, MessageCircle } from "lucide-react";
import RevealSection from "@/components/RevealSection";
import { whatsappLink, WHATSAPP_DISPLAY } from "@/lib/contact";
import { FEED_SERIES, LAYER_PROGRAMME, BROILER_PROGRAMME, bagMash, seriesBySlug } from "@/lib/range";
import { FeatureIcon } from "@/components/icons";
import { FEED_DETAILS, INTRO, RETAILER, VALUES } from "@/lib/content";
import { MOCK_STATS, HOW_IT_WORKS } from "@/lib/mock-data";

const WA_GENERAL = "Hello Akoko Feeds, I would like to place an order / ask about your feed.";

/* --- Hero --- */
export function Hero() {
  return (
    <section className="grain relative -mt-[64px] flex min-h-[min(92vh,820px)] items-center overflow-hidden pb-14 pt-32 lg:pt-28">
      <Image
        src="/photos/hero-hen-sunset.webp"
        alt="A hen feeding in golden light"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[60%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/65 to-ink/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/30" />
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />

      <div className="relative z-10 mx-auto grid w-full max-w-8xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="animate-fade-up mb-6 flex items-center gap-3">
            <div className="h-px w-10 bg-brand" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">Akoko Feeds · Ghana</span>
          </div>
          <h1 className="animate-fade-up-1 font-display text-[clamp(3rem,7.6vw,6.4rem)] leading-[1.02] tracking-tight text-white">
            Your Choice
            <br />
            <em className="not-italic text-brand">for Profit.</em>
          </h1>
          <p className="animate-fade-up-2 mt-6 max-w-xl text-[1.1rem] leading-relaxed text-white/75">
            Science-based poultry feed for chicks, growers, layers and broilers. Milled in Kumasi,
            with distribution points across Ashanti and Bono, and free technical advice on every order.
          </p>

          <div className="animate-fade-up-3 mt-9 flex flex-wrap items-center gap-3.5">
            <Link
              href="/products"
              className="group flex items-center gap-2 rounded-xl bg-brand px-7 py-4 text-sm font-bold text-white shadow-brand transition-all hover:bg-brandDark active:scale-95"
            >
              Shop Feed
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href={whatsappLink(WA_GENERAL)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-[#25D366] px-7 py-4 text-sm font-bold text-white shadow-[0_8px_28px_rgba(37,211,102,0.35)] transition hover:bg-[#1ebe5a] active:scale-95"
            >
              <MessageCircle size={16} /> Order on WhatsApp
            </a>
            <a href="#feed-finder" className="glass flex items-center gap-2 rounded-xl px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/15">
              Find my feed <ArrowDown size={14} />
            </a>
          </div>

          <div className="animate-fade-up-3 mt-9 flex flex-wrap gap-2.5">
            {["Free technical advice", "50 kg bags", "9 distribution points", "Made in Kumasi"].map((t) => (
              <span key={t} className="glass rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-white/85">{t}</span>
            ))}
          </div>
        </div>

        {/* Floating bags */}
        <div className="relative mx-auto h-[360px] w-[300px] sm:h-[460px] sm:w-[400px] lg:h-[560px] lg:w-[500px]" aria-hidden>
          <Image src="/bags/cutouts/grower.webp" alt="" width={605} height={960} sizes="220px"
            className="animate-float-1 absolute bottom-6 left-0 z-10 h-auto w-[44%] -rotate-6 drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]" />
          <Image src="/bags/cutouts/layer1.webp" alt="" width={606} height={960} sizes="260px" priority
            className="animate-float absolute left-[26%] top-0 z-20 h-auto w-[52%] drop-shadow-[0_40px_50px_rgba(0,0,0,0.6)]" />
          <Image src="/bags/cutouts/broiler.webp" alt="" width={640} height={939} sizes="220px"
            className="animate-float-2 absolute bottom-10 right-0 z-10 h-auto w-[44%] rotate-6 drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]" />
        </div>
      </div>
    </section>
  );
}

/* --- Trust numbers --- */
export function StatsBar() {
  return (
    <section className="border-b border-sand bg-white">
      <div className="mx-auto max-w-8xl">
        <div className="grid grid-cols-2 divide-sand sm:grid-cols-4 sm:divide-x">
          {MOCK_STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center px-4 py-8 text-center">
              <span className="font-display text-5xl italic text-brand">{s.value}</span>
              <span className="mt-1 text-sm font-semibold text-ink">{s.label}</span>
              <span className="text-xs text-muted">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- The full range (always shown, whatever is published in the shop) --- */
export function RangeGrid() {
  return (
    <section className="bg-cream py-24 lg:py-32">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-14 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">The Akoko range</p>
            <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05] text-ink">
              One feed for <em className="text-brand">every stage.</em>
            </h2>
            <p className="mt-3 max-w-xl text-muted">
              Every feed comes as a Mash (100%, ready to feed) and a Concentrate (50%), in 50 kg bags.
            </p>
          </div>
          <Link href="/products" className="flex items-center gap-2 rounded-xl border border-sand bg-white px-5 py-3 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">
            See all prices <ArrowRight size={14} />
          </Link>
        </RevealSection>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {FEED_SERIES.map((s, i) => (
            <RevealSection key={s.slug} className={`reveal-delay-${(i % 4) + 1}`}>
              <Link
                href={`/products?q=${encodeURIComponent(s.name)}`}
                className="group block overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-sand transition duration-500 hover:-translate-y-1 hover:shadow-cardHover"
              >
                <div className="relative h-60 bg-gradient-to-b from-[#fff3e3] to-[#f8d9b0] sm:h-72">
                  <Image
                    src={bagMash(s.slug)}
                    alt={`${s.name} feed bag`}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-contain p-4 transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brandDark">
                    {s.bird}
                  </span>
                </div>
                <div className="p-4 sm:p-5">
                  <h3 className="font-display text-xl text-ink transition-colors group-hover:text-brand">{s.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted sm:text-sm">{s.tagline}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    View &amp; order <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- Feeding programme --- */
function Step({ slug, n }: { slug: string; n: number }) {
  const s = seriesBySlug(slug);
  return (
    <Link href={`/products?q=${encodeURIComponent(s.name)}`} className="group flex w-36 shrink-0 flex-col items-center text-center sm:w-40">
      <div className="relative h-36 w-full rounded-2xl bg-white/[0.06] ring-1 ring-white/10 transition duration-500 group-hover:-translate-y-1 group-hover:bg-white/10 sm:h-44">
        <Image src={bagMash(s.slug)} alt={`${s.name} bag`} fill sizes="160px" className="object-contain p-2.5" />
        <span className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-black text-white shadow-brandSm">{n}</span>
      </div>
      <span className="mt-3 text-sm font-bold text-white">{s.name}</span>
      {FEED_DETAILS.find((d) => d.slug === s.slug)?.period && (
        <span className="mt-1 text-xs font-medium text-brand">{FEED_DETAILS.find((d) => d.slug === s.slug)?.period}</span>
      )}
    </Link>
  );
}

export function FeedingProgramme() {
  const Arrow = () => <ArrowRight size={18} className="mt-16 hidden shrink-0 text-brand/70 sm:block" aria-hidden />;
  return (
    <section id="feeding-programme" className="grain relative overflow-hidden bg-ink py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-14 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Feeding programme</p>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05] text-white">
            The right feed, <em className="text-brand">at the right time.</em>
          </h2>
          <p className="mt-4 text-white/60">
            Birds need different nutrition as they grow. Follow the Akoko range stage by stage, and ask our farmer-support
            team when to move your flock to the next feed.
          </p>
        </RevealSection>

        <RevealSection>
          <h3 className="mb-5 text-sm font-bold uppercase tracking-widest text-white/50">Layers</h3>
          <div className="-mx-5 flex items-start gap-3 overflow-x-auto px-5 pb-4 sm:mx-0 sm:gap-4 sm:px-0">
            {LAYER_PROGRAMME.map((slug, i) => (
              <div key={slug} className="flex items-start gap-3 sm:gap-4">
                <Step slug={slug} n={i + 1} />
                {i < LAYER_PROGRAMME.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
        </RevealSection>

        <RevealSection className="mt-12">
          <h3 className="mb-5 text-sm font-bold uppercase tracking-widest text-white/50">Broilers</h3>
          <div className="flex items-start gap-3 sm:gap-4">
            {BROILER_PROGRAMME.map((slug, i) => (
              <div key={slug} className="flex items-start gap-3 sm:gap-4">
                <Step slug={slug} n={i + 1} />
                {i < BROILER_PROGRAMME.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
        </RevealSection>
      </div>
    </section>
  );
}

/* --- Driving farmers progress (owner copy) + the four Akoko values --- */
export function IntroValues() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <RevealSection>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Akoko Feeds</p>
            <h2 className="font-display text-[clamp(2.3rem,5vw,4rem)] leading-[1.03] text-ink">
              {INTRO.heading.split(" ").slice(0, -1).join(" ")} <em className="text-brand">{INTRO.heading.split(" ").slice(-1)}.</em>
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-stone">{INTRO.lead}</p>
            {INTRO.paragraphs.map((p) => (
              <p key={p.slice(0, 20)} className="mt-4 leading-relaxed text-muted">{p}</p>
            ))}
            <Link href="/about" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-brand transition hover:gap-3">
              More about Akoko Feeds <ArrowRight size={15} />
            </Link>
          </RevealSection>
          <RevealSection className="reveal-delay-2">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-stone">The Akoko Feed value</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-3xl bg-cream p-6 ring-1 ring-sand transition duration-500 hover:-translate-y-1 hover:shadow-card">
                  <FeatureIcon name={v.icon} />
                  <p className="mt-4 text-sm font-semibold leading-relaxed text-ink">{v.title}</p>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
}

/* --- Become a retailer --- */
export function RetailerTeaser() {
  return (
    <section className="grain relative overflow-hidden bg-gradient-to-br from-brand to-[#d9560c] py-20 lg:py-24">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-8xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
        <RevealSection>
          <FeatureIcon name="handshake" tone="dark" className="!bg-white/20 !text-white" />
          <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.04] text-white">{RETAILER.heading}</h2>
          <p className="mt-3 max-w-xl text-lg text-white/85">{RETAILER.lead}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/retailers#apply" className="flex items-center gap-2 rounded-xl bg-ink px-7 py-3.5 text-sm font-bold text-white transition hover:bg-inkMid active:scale-95">
              Apply now <ArrowRight size={15} />
            </Link>
            <Link href="/retailers#locate" className="rounded-xl border border-white/40 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">
              Locate a retailer
            </Link>
          </div>
        </RevealSection>
        <RevealSection className="reveal-delay-2">
          <ul className="space-y-3">
            {RETAILER.benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 rounded-2xl bg-white/15 px-5 py-3.5 font-semibold text-white backdrop-blur-sm">
                <Check size={16} className="shrink-0" /> {b}
              </li>
            ))}
          </ul>
        </RevealSection>
      </div>
    </section>
  );
}

/* --- Free technical advice --- */
export function AdviceBand() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="mx-auto grid max-w-8xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <RevealSection className="relative h-[440px] overflow-hidden rounded-4xl shadow-deep lg:h-[560px]">
          <Image src="/photos/farmer-tablet.webp" alt="A farmer checking her flock" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        </RevealSection>
        <RevealSection className="reveal-delay-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Farmer support</p>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.05] text-ink">
            Not sure which feed? <em className="text-brand">Just ask.</em>
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Tell us what birds you keep, their age and your flock size. Our farmer-support team will recommend the right
            feed and feeding plan, free with every purchase.
          </p>
          <ul className="mt-6 space-y-2.5 text-stone">
            {["Which feed for which stage", "Feeding plans for your flock size", "Help moving to the next feed"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-brand"><Check size={12} /></span>
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={whatsappLink("Hello Akoko Feeds, I need advice on the right feed for my birds.")} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(37,211,102,0.3)] transition hover:bg-[#1ebe5a] active:scale-95">
              <MessageCircle size={16} /> Chat {WHATSAPP_DISPLAY}
            </a>
            <a href="tel:+233505455055" className="flex items-center gap-2 rounded-xl border border-sand px-6 py-3.5 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">
              <Phone size={15} /> Call us
            </a>
            <a href="mailto:farmersupport@akokofeeds.com" className="flex items-center gap-2 rounded-xl border border-sand px-6 py-3.5 text-sm font-semibold text-stone transition hover:border-brand hover:text-brand">
              <Mail size={15} /> Email
            </a>
          </div>
        </RevealSection>
      </div>
    </section>
  );
}

/* --- How ordering works --- */
export function HowItWorks() {
  return (
    <section className="bg-cream py-24 lg:py-28">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Ordering</p>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] text-ink">Three steps to your feed.</h2>
        </RevealSection>
        <div className="grid gap-5 md:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <RevealSection key={s.step} className={`reveal-delay-${i + 1}`}>
              <div className="h-full rounded-3xl bg-white p-8 shadow-card ring-1 ring-sand">
                <span className="font-display text-5xl italic text-brand/80">{s.step}</span>
                <h3 className="mt-3 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- Closing call to action --- */
export function FinalCTA() {
  return (
    <section className="grain relative overflow-hidden bg-ink py-28 lg:py-36">
      <Image src="/photos/hen-portrait.webp" alt="" fill sizes="100vw" className="object-cover opacity-45" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/30" />
      <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="max-w-2xl">
          <h2 className="font-display text-[clamp(2.6rem,6vw,5rem)] leading-[1.02] text-white">
            Ready to grow <em className="text-brand">your flock?</em>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-white/65">
            Order today and our team will confirm and arrange delivery or pickup. Your choice for profit.
          </p>
          <div className="mt-9 flex flex-wrap gap-3.5">
            <Link href="/products" className="flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark active:scale-95">
              Shop Feed <ArrowRight size={15} />
            </Link>
            <a href={whatsappLink(WA_GENERAL)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-[#25D366] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#1ebe5a] active:scale-95">
              <MessageCircle size={16} /> Order on WhatsApp
            </a>
          </div>
        </RevealSection>
      </div>
    </section>
  );
}
