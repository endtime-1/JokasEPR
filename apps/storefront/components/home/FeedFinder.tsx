"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BIRDS, FEED_SERIES, bagMash, type FeedSeries } from "@/lib/range";
import { whatsappLink } from "@/lib/contact";

const BLURB: Record<FeedSeries["bird"], string> = {
  Chicks: "A strong start decides the whole flock. Pick the starter that matches your chicks.",
  Growers: "Raise healthy pullets and get them ready for lay.",
  Layers: "Keep your hens laying well, with strong shells and good egg size.",
  Broilers: "Fast, efficient growth to market weight.",
};

/** "What are you feeding?" — pick the birds, see the right bags, order in one tap. */
export default function FeedFinder() {
  const [bird, setBird] = useState<FeedSeries["bird"]>("Layers");
  const picks = FEED_SERIES.filter((s) => s.bird === bird);

  return (
    <div className="mx-auto max-w-8xl px-5 sm:px-8">
      <div className="text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">Find your feed</p>
        <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.05] text-ink">
          What are you <em className="text-brand">feeding?</em>
        </h2>
      </div>

      {/* Bird picker */}
      <div role="tablist" aria-label="Type of bird" className="mx-auto mt-9 flex max-w-xl flex-wrap justify-center gap-2 rounded-2xl bg-white p-1.5 shadow-panel ring-1 ring-sand sm:flex-nowrap">
        {BIRDS.map((b) => (
          <button
            key={b}
            role="tab"
            aria-selected={bird === b}
            onClick={() => setBird(b)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              bird === b ? "bg-brand text-white shadow-brandSm" : "text-stone hover:bg-warm hover:text-brand"
            }`}
          >
            {b}
          </button>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-lg text-center text-sm text-muted">{BLURB[bird]}</p>

      {/* Recommended bags */}
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
        {picks.map((s) => (
          <div key={s.slug} className="group relative overflow-hidden rounded-4xl bg-white p-6 shadow-panel ring-1 ring-sand transition duration-500 hover:-translate-y-1 hover:shadow-cardHover">
            <div className="flex items-center gap-5">
              <div className="relative h-44 w-28 shrink-0 sm:h-52 sm:w-32">
                <Image
                  src={bagMash(s.slug)}
                  alt={`${s.name} Mash bag`}
                  fill
                  sizes="140px"
                  className="object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.25)] transition duration-500 group-hover:scale-105 group-hover:-rotate-2"
                />
              </div>
              <div className="min-w-0">
                <span className="rounded-full bg-warm px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brandDark">
                  {s.bird}
                </span>
                <h3 className="mt-2 font-display text-2xl leading-tight text-ink">{s.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.tagline}</p>
                <p className="mt-2 text-xs font-semibold text-stone">Mash (100%) · Concentrate (50%) · 50 kg</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href={`/products?q=${encodeURIComponent(s.name)}`}
                className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-brandSm transition hover:bg-brandDark active:scale-95"
              >
                See prices <ArrowRight size={14} />
              </Link>
              <a
                href={whatsappLink(`Hello Akoko Feeds, I would like to order ${s.name}. Please share today's price and delivery.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2.5 text-sm font-bold text-[#128C4A] transition hover:bg-[#25D366]/20 active:scale-95"
              >
                Order on WhatsApp
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
