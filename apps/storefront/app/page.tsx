import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { MOCK_STATS, MOCK_TESTIMONIALS, HOW_IT_WORKS, HERO_BG, CATEGORY_IMAGES, PRODUCT_IMAGES } from "@/lib/mock-data";
import { ArrowRight, Star, ChevronDown, ArrowUpRight } from "lucide-react";
import RevealSection from "@/components/RevealSection";
import PremiumProductCard from "@/components/PremiumProductCard";

export const revalidate = 60;

/* ─── Hero ──────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="grain relative -mt-[64px] flex min-h-screen flex-col justify-end overflow-hidden pb-16">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src={HERO_BG}
          alt="Akoko Solutions Farm — Golden-hour aerial view"
          fill
          className="object-cover"
          priority
        />
        {/* Layered overlays for mood */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-8xl px-5 sm:px-8">
        {/* Eyebrow */}
        <div className="animate-fade-up mb-6 flex items-center gap-3">
          <div className="h-px w-10 bg-brand" />
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            Akoko Solutions · Ghana
          </span>
        </div>

        {/* Display headline */}
        <h1 className="animate-fade-up-1 font-display text-[clamp(3.5rem,9vw,7.5rem)] font-normal leading-[1.0] tracking-tight text-white">
          The Freshest Feed.<br />
          <em className="not-italic text-brand">The Finest Farm.</em>
        </h1>

        <p className="animate-fade-up-2 mt-7 max-w-xl text-[1.15rem] leading-relaxed text-white/65">
          Ghana's most trusted source for premium poultry feed, fresh eggs, ready
          broiler chickens, and soya products — milled and packed daily at Akoko Solutions
          and delivered to your door.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up-3 mt-10 flex flex-wrap items-center gap-4">
          <Link href="/products"
            className="group flex items-center gap-2 rounded-xl bg-brand px-8 py-4 text-sm font-bold text-white shadow-brand transition-all hover:bg-brandDark hover:shadow-[0_8px_32px_rgba(245,130,32,0.5)] active:scale-95">
            Shop All Products
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/about"
            className="glass flex items-center gap-2 rounded-xl px-8 py-4 text-sm font-semibold text-white transition hover:bg-white/14">
            Our Farm Story
          </Link>
        </div>

        {/* Trust chips */}
        <div className="animate-fade-up-3 mt-9 flex flex-wrap gap-2.5">
          {["50,000+ birds fed daily","500+ farms served","Since 2015","Farm-direct pricing"].map(t => (
            <span key={t}
              className="glass rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-white/80">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/40">
        <span className="text-[10px] uppercase tracking-widest">Scroll</span>
        <ChevronDown size={16} className="animate-bounce" />
      </div>
    </section>
  );
}

/* ─── Stats bar ─────────────────────────────────────────────────────── */
function StatsBar() {
  return (
    <section className="border-y border-sand bg-cream">
      <div className="mx-auto max-w-8xl">
        <div className="grid divide-y divide-sand sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {MOCK_STATS.map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center py-8 text-center`}>
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

/* ─── Farm story ────────────────────────────────────────────────────── */
function FarmStory() {
  return (
    <section className="bg-cream py-28 lg:py-36">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
          {/* Image stack */}
          <RevealSection className="relative h-[500px] lg:h-[600px]">
            <div className="absolute left-0 top-0 h-[75%] w-[72%] overflow-hidden rounded-3xl shadow-deep">
              <Image
                src={CATEGORY_IMAGES["Feed"]}
                alt="Akoko Solutions feed mill"
                fill
                className="object-cover"
              />
            </div>
            <div className="absolute bottom-0 right-0 h-[52%] w-[54%] overflow-hidden rounded-3xl border-4 border-cream shadow-deep">
              <Image
                src={CATEGORY_IMAGES["Eggs & Poultry"]}
                alt="Fresh farm eggs"
                fill
                className="object-cover"
              />
            </div>
            {/* Floating badge */}
            <div className="absolute bottom-[28%] left-[28%] z-10 -translate-x-1/2 translate-y-1/2">
              <div className="glass-dark rounded-2xl px-5 py-3.5 shadow-deep">
                <div className="text-2xl font-black text-brand">2015</div>
                <div className="text-xs text-white/60">Year founded</div>
              </div>
            </div>
          </RevealSection>

          {/* Copy */}
          <RevealSection className="reveal-delay-2">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              The Akoko Solutions Story
            </p>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-ink">
              We don't just sell feed.<br />
              <em className="text-brand">We raise it.</em>
            </h2>
            <p className="mt-6 text-[1.05rem] leading-relaxed text-stone">
              Every bag of feed that leaves Akoko Solutions is the same formula we feed
              our own 50,000-bird flock. We started with 500 birds in 2015 and built our
              own feed mill because we couldn't trust what was on the market.
            </p>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-stone">
              Now, that same feed — mill-fresh and quality-checked on every batch — is
              available to farms and households across Ghana. No middlemen. No shelf-sitting.
              Direct from our mill to your farm.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { n: "50,000+", l: "Birds on our farm" },
                { n: "5 t/day",  l: "Feed mill capacity" },
                { n: "48 hrs",   l: "Mill to delivery" },
                { n: "100%",     l: "Quality checked" },
              ].map(s => (
                <div key={s.l} className="rounded-2xl bg-warm p-4 ring-1 ring-warmBorder">
                  <div className="text-2xl font-black text-brand">{s.n}</div>
                  <div className="text-xs text-muted">{s.l}</div>
                </div>
              ))}
            </div>

            <Link href="/about"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
              Read our full story <ArrowUpRight size={14} />
            </Link>
          </RevealSection>
        </div>
      </div>
    </section>
  );
}

/* ─── Product magazine grid ─────────────────────────────────────────── */
async function ProductShowcase() {
  const products = await api.products.list().catch(() => []);
  const featured = products.slice(0, 6);

  return (
    <section className="bg-ink py-28 lg:py-36">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        {/* Section header */}
        <RevealSection className="mb-14 flex items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Our Products
            </p>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.05] text-white">
              14 Products.<br />
              <em className="text-brand">One Farm.</em>
            </h2>
          </div>
          <Link href="/products"
            className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-brand hover:text-brand lg:flex">
            All Products <ArrowRight size={14} />
          </Link>
        </RevealSection>

        {/* Magazine grid */}
        {featured.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => (
              <RevealSection key={p.id} className={`reveal-delay-${Math.min(i + 1, 4)}`}>
                <PremiumProductCard product={p} featured={i === 0} />
              </RevealSection>
            ))}
          </div>
        )}

        <div className="mt-10 text-center lg:hidden">
          <Link href="/products"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70 hover:border-brand hover:text-brand">
            See all 14 products <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Category trio ──────────────────────────────────────────────────── */
function CategoryTrio() {
  const cats = [
    {
      href: "/products?category=Feed",
      img: CATEGORY_IMAGES["Feed"],
      tag: "10 Products",
      title: "Poultry Feed",
      body: "Broiler starter to layer mash — 10 varieties, mill-fresh daily at Akoko Solutions. Same formula we feed our own 50,000 birds.",
      cta: "Browse Feed",
    },
    {
      href: "/products?category=Eggs+%26+Poultry",
      img: CATEGORY_IMAGES["Eggs & Poultry"],
      tag: "2 Products",
      title: "Eggs & Poultry",
      body: "Fresh-graded eggs collected each morning + ready broiler chickens raised on Akoko Mix feed. Farm-pure, daily-fresh.",
      cta: "Browse Eggs & Poultry",
    },
    {
      href: "/products?category=Soya+Products",
      img: CATEGORY_IMAGES["Soya Products"],
      tag: "2 Products",
      title: "Soya Products",
      body: "On-site expeller-pressed soya cake (44–48% CP) and food-grade soya oil. No blending, no additives — pure soya.",
      cta: "Browse Soya",
    },
  ];

  return (
    <section className="bg-cream py-28 lg:py-36">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-16 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            Three Categories
          </p>
          <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] text-ink">
            Everything Your Farm Needs,<br />
            <em className="text-brand">One Trusted Source.</em>
          </h2>
        </RevealSection>

        <div className="grid gap-5 lg:grid-cols-3">
          {cats.map((c, i) => (
            <RevealSection key={c.title} className={`reveal-delay-${i + 1}`}>
              <Link href={c.href}
                className="group relative flex flex-col overflow-hidden rounded-4xl shadow-panel transition-all duration-500 hover:-translate-y-1 hover:shadow-cardHover">
                {/* Image */}
                <div className="relative h-64 overflow-hidden">
                  <Image
                    src={c.img}
                    alt={c.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
                  <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
                    {c.tag}
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col bg-white p-6">
                  <h3 className="font-display text-2xl text-ink group-hover:text-brand transition-colors">
                    {c.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.body}</p>
                  <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-brand">
                    {c.cta} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Numbers (orange) ──────────────────────────────────────────────── */
function NumbersSection() {
  return (
    <section className="grain relative overflow-hidden bg-brand py-24">
      {/* Dot pattern */}
      <div className="pointer-events-none absolute inset-0"
        style={{ backgroundImage:"radial-gradient(circle,rgba(255,255,255,0.12) 1px,transparent 1px)", backgroundSize:"28px 28px" }} />
      <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n:"50,000+", l:"Birds on our farm",    s:"Fed on Akoko Mix daily"   },
            { n:"500+",    l:"Farms we supply",      s:"Across all 16 regions"    },
            { n:"5 t",     l:"Feed milled per day",  s:"Fresh on every batch"     },
            { n:"11+",     l:"Years in business",    s:"Growing since 2015"       },
          ].map(s => (
            <div key={s.l} className="text-white">
              <div className="font-display text-6xl italic">{s.n}</div>
              <div className="mt-2 text-lg font-bold text-white/90">{s.l}</div>
              <div className="mt-0.5 text-sm text-white/55">{s.s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Process strip ─────────────────────────────────────────────────── */
function HowItWorks() {
  return (
    <section className="bg-ink py-28">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            Ordering is Simple
          </p>
          <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] text-white">
            From Browse to Delivery<br />
            <em className="text-brand">in Three Steps.</em>
          </h2>
        </RevealSection>

        <div className="relative grid gap-1 lg:grid-cols-3">
          {/* Connecting line */}
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/8 lg:block" />

          {HOW_IT_WORKS.map((step, i) => (
            <RevealSection key={step.step} className={`reveal-delay-${i + 1}`}>
              <div className="relative rounded-3xl border border-white/8 bg-white/4 p-8 backdrop-blur-sm">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-black text-white shadow-brand">
                  {step.step}
                </div>
                <h3 className="mb-3 text-xl font-bold text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-white/50">{step.desc}</p>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ArrowRight size={16} className="absolute -right-2 top-10 hidden text-brand/40 lg:block" />
                )}
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials ──────────────────────────────────────────────────── */
function Testimonials() {
  return (
    <section className="bg-cream py-28 lg:py-36">
      <div className="mx-auto max-w-8xl px-5 sm:px-8">
        <RevealSection className="mb-16 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            From Our Customers
          </p>
          <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] text-ink">
            Farmers Across Ghana<br />
            <em className="text-brand">Trust Akoko.</em>
          </h2>
        </RevealSection>

        <div className="grid gap-6 lg:grid-cols-3">
          {MOCK_TESTIMONIALS.map((t, i) => (
            <RevealSection key={t.id} className={`reveal-delay-${i + 1}`}>
              <div className="flex flex-col rounded-4xl bg-white p-8 shadow-panel ring-1 ring-sand">
                {/* Stars */}
                <div className="mb-5 flex gap-1">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={14} className="fill-brand text-brand" />
                  ))}
                </div>
                {/* Quote */}
                <p className="flex-1 text-[1.05rem] leading-relaxed text-stone before:content-['“'] after:content-['”']">
                  {t.text}
                </p>
                {/* Author */}
                <div className="mt-7 flex items-center gap-4 border-t border-sand pt-6">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-sm font-black text-white shadow-md`}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="font-bold text-ink">{t.name}</div>
                    <div className="text-xs text-muted">{t.role} · {t.location}</div>
                  </div>
                </div>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="grain relative overflow-hidden bg-ink py-36">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      {/* Large watermark */}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 select-none font-display text-[14rem] font-bold text-white/[0.03] leading-none">
        AKOKO
      </div>
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
          Start Today
        </p>
        <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] text-white">
          Ready to Feed<br />
          <em className="text-brand">Your Farm?</em>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-[1.1rem] leading-relaxed text-white/55">
          Browse 14 products, place your order online, and our team personally confirms
          every order before dispatch. Ghana's best feed, delivered to your gate.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/products"
            className="group inline-flex items-center gap-2 rounded-xl bg-brand px-10 py-4 text-sm font-bold text-white shadow-brand transition-all hover:bg-brandDark hover:shadow-[0_8px_40px_rgba(245,130,32,0.5)] active:scale-95">
            Shop All Products
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="tel:+233XXXXXXXX"
            className="glass inline-flex items-center gap-2 rounded-xl px-10 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/14">
            Call to Order
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default async function HomePage() {
  return (
    <>
      <Hero />
      <StatsBar />
      <FarmStory />
      <ProductShowcase />
      <CategoryTrio />
      <NumbersSection />
      <HowItWorks />
      <Testimonials />
      <FinalCTA />
    </>
  );
}
