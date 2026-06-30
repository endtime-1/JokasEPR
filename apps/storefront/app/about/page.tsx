import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { HERO_BG, CATEGORY_IMAGES } from "@/lib/mock-data";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import RevealSection from "@/components/RevealSection";

export const metadata = { title: "Our Story — Akoko Solutions" };

const MILESTONES = [
  { year: "2015", label: "Akoko Solutions founded",      desc: "Started with 500 layer birds and a small on-site feed mill in rural Ghana." },
  { year: "2020", label: "Feed mill expansion",         desc: "Scaled to 5 tonnes per day. Our formula proven on 50,000+ birds year-round." },
  { year: "2022", label: "Soya processing added",       desc: "Built an expeller press on-site — full control over cake protein and oil purity." },
  { year: "2023", label: "Akoko Solutions launched",    desc: "Opened to farms and households. The same quality we demand, now available to all." },
  { year: "2024", label: "500+ farms across Ghana",     desc: "Supplying from Accra to Tamale — daily milling, direct delivery, no middlemen." },
];

const USPS = [
  {
    icon: "🌾",
    title: "Own-Mill Feed",
    desc: "Formulated and milled daily at our own facility. Every bag is the same formula our own 50,000 birds eat — no outsourcing, no guessing.",
    bg: "bg-amber-50",
    accent: "text-amber-600",
  },
  {
    icon: "🥚",
    title: "Daily-Fresh Eggs",
    desc: "Collected and graded every morning from our disease-tested flock. Farm to crate in under 12 hours — no cold-store, no age.",
    bg: "bg-orange-50",
    accent: "text-orange-600",
  },
  {
    icon: "💧",
    title: "On-Site Soya Press",
    desc: "We expel our own soya — full control over protein levels, moisture, and purity. No blending with inferior stock.",
    bg: "bg-emerald-50",
    accent: "text-emerald-600",
  },
  {
    icon: "🤝",
    title: "Farmer-First Terms",
    desc: "Minimum orders designed for small-to-medium farms. Standing orders, bulk pricing, and a team that actually picks up the phone.",
    bg: "bg-blue-50",
    accent: "text-blue-600",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* ── Cinematic Hero ─────────────────────────────────────────────── */}
      <section className="grain relative -mt-[64px] flex min-h-[92vh] flex-col justify-end overflow-hidden pb-20">
        <div className="absolute inset-0">
          <Image
            src={HERO_BG}
            alt="Akoko Solutions Farm at golden hour"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-8xl px-5 sm:px-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px w-10 bg-brand" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Our Story
            </span>
          </div>
          <h1 className="font-display text-[clamp(3rem,8vw,7rem)] leading-[1.0] text-white">
            Built on a Farm.<br />
            <em className="text-brand">Grown by Passion.</em>
          </h1>
          <p className="mt-7 max-w-xl text-[1.1rem] leading-relaxed text-white/60">
            Akoko Solutions is Ghana's trusted integrated poultry operation — growing,
            milling, pressing, and selling since 2015. No middlemen. No shortcuts.
            Just farm-honest quality, delivered direct.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            {["Founded 2015", "50,000+ birds", "500+ farms served", "Daily production"].map((t) => (
              <span key={t} className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-white/80">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── The Name ───────────────────────────────────────────────────── */}
      <section className="bg-cream py-24 lg:py-32">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-28">
            {/* Image stack */}
            <RevealSection className="relative h-[480px] lg:h-[560px]">
              <div className="absolute left-0 top-0 h-[74%] w-[68%] overflow-hidden rounded-3xl shadow-deep">
                <Image
                  src={CATEGORY_IMAGES["Feed"]}
                  alt="Akoko Solutions feed mill"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute bottom-0 right-0 h-[50%] w-[55%] overflow-hidden rounded-3xl border-4 border-cream shadow-deep">
                <Image
                  src={CATEGORY_IMAGES["Eggs & Poultry"]}
                  alt="Fresh farm eggs"
                  fill
                  className="object-cover"
                />
              </div>
              {/* Float badge */}
              <div className="absolute bottom-[26%] left-[30%] z-10 -translate-x-1/2 translate-y-1/2">
                <div className="glass-dark rounded-2xl px-5 py-3.5 shadow-deep">
                  <div className="font-display text-2xl italic text-brand">Akoko</div>
                  <div className="text-xs text-white/50">the Akan word for hen</div>
                </div>
              </div>
            </RevealSection>

            {/* Copy */}
            <RevealSection className="reveal-delay-2">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                Why "Akoko"?
              </p>
              <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-ink">
                A Name Rooted<br />
                <em className="text-brand">in Purpose.</em>
              </h2>
              <p className="mt-6 text-[1.05rem] leading-relaxed text-stone">
                <em className="font-semibold not-italic text-ink">Akoko</em> is the Akan word for
                hen — and the hen is everything at Akoko Solutions. She eats our feed, lays our eggs,
                and raises our broilers. She is the product we serve and the reason we exist.
              </p>
              <p className="mt-4 text-[1.05rem] leading-relaxed text-stone">
                We started in 2015 with a simple conviction: Ghanaian farmers deserve feed that
                is genuinely nutritious, honestly priced, and actually delivered on time. So we
                built our own mill. Then our own soya press. Then this storefront — so you can
                order direct.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  "Every bag milled at our own facility",
                  "Eggs collected and graded daily",
                  "Soya cake pressed on-site for full protein control",
                  "Team picks up the phone — always",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3 text-sm text-stone">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand" />
                    {line}
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ── What Sets Us Apart ─────────────────────────────────────────── */}
      <section className="bg-ink py-28 lg:py-36">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <RevealSection className="mb-16">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              What Sets Us Apart
            </p>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.05] text-white">
              Four Reasons Farmers<br />
              <em className="text-brand">Choose Akoko.</em>
            </h2>
          </RevealSection>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {USPS.map((u, i) => (
              <RevealSection key={u.title} className={`reveal-delay-${i + 1}`}>
                <div className="flex h-full flex-col rounded-3xl border border-white/8 bg-white/5 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:bg-white/8">
                  <div className="mb-5 text-3xl">{u.icon}</div>
                  <h3 className="font-display text-xl text-white">{u.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-white/50">{u.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <section className="grain relative overflow-hidden bg-brand py-20">
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage:"radial-gradient(circle,rgba(255,255,255,0.12) 1px,transparent 1px)", backgroundSize:"26px 26px" }} />
        <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n:"50,000+", l:"Birds on our farm",   s:"Fed on Akoko Mix daily" },
              { n:"5 t",     l:"Feed milled per day", s:"Mill-fresh every batch" },
              { n:"500+",    l:"Farms supplied",       s:"Across all 16 regions" },
              { n:"11+",     l:"Years in business",    s:"Since 2015" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-display text-6xl italic text-white">{s.n}</div>
                <div className="mt-2 text-base font-bold text-white/90">{s.l}</div>
                <div className="mt-0.5 text-sm text-white/55">{s.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      <section className="bg-cream py-28 lg:py-36">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <RevealSection className="mb-16">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Our Journey
            </p>
            <h2 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-ink">
              Eleven Years of<br />
              <em className="text-brand">Quiet Progress.</em>
            </h2>
          </RevealSection>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[60px] top-0 hidden h-full w-px bg-gradient-to-b from-brand via-brand/40 to-transparent lg:left-1/2 lg:block" />

            <div className="space-y-0 lg:space-y-0">
              {MILESTONES.map((m, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <RevealSection
                    key={m.year}
                    className={`relative flex flex-col pb-12 last:pb-0 lg:grid lg:grid-cols-2 lg:gap-16 lg:pb-14 ${isLeft ? "" : "lg:direction-rtl"}`}
                  >
                    {/* Left side */}
                    <div className={`flex items-start gap-6 ${isLeft ? "lg:justify-end lg:text-right" : "lg:order-2 lg:justify-start lg:text-left"}`}>
                      {/* Mobile: year + line */}
                      <div className="relative z-10 flex-col items-center lg:hidden">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-xs font-black text-white shadow-brand">
                          {m.year}
                        </div>
                        {i < MILESTONES.length - 1 && (
                          <div className="mx-auto mt-2 h-full w-px bg-brand/30" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="min-w-0 lg:max-w-sm">
                        <div className="font-display text-3xl italic text-brand lg:text-4xl">{m.year}</div>
                        <h3 className="mt-1.5 text-lg font-bold text-ink">{m.label}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">{m.desc}</p>
                      </div>
                    </div>

                    {/* Center dot — desktop only */}
                    <div className={`absolute left-1/2 top-3 z-10 hidden h-4 w-4 -translate-x-1/2 rounded-full border-4 border-cream bg-brand shadow-brand lg:block`} />

                    {/* Right spacer (alternating) */}
                    <div className={isLeft ? "hidden lg:block" : "hidden lg:order-1 lg:block"} />
                  </RevealSection>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="grain relative overflow-hidden bg-ink py-32">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 select-none font-display text-[12rem] font-bold leading-none text-white/[0.03]">
          AKOKO
        </div>
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <div className="mb-6 inline-flex items-center justify-center">
            <LogoMark size={64} className="opacity-90" />
          </div>
          <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] text-white">
            Ready to Experience<br />
            <em className="text-brand">The Difference?</em>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[1.05rem] leading-relaxed text-white/50">
            Join 500+ farms across Ghana who trust Akoko Solutions for their feed,
            eggs, and soya. Order online — our team confirms every order personally.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/products"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand px-10 py-4 text-sm font-bold text-white shadow-brand transition-all hover:bg-brandDark hover:shadow-[0_8px_40px_rgba(245,130,32,0.5)] active:scale-95">
              Browse All Products
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/contact"
              className="glass inline-flex items-center gap-2 rounded-xl px-10 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/14">
              Talk to Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
