import Image from "next/image";
import type { ReactNode } from "react";

/** Photo header used at the top of the inner pages (Feeds, Guide, Support, ...). */
export default function PageHero({ eyebrow, title, lead, image, children }: { eyebrow: string; title: ReactNode; lead?: string; image: string; children?: ReactNode }) {
  return (
    <section className="grain relative overflow-hidden bg-ink py-24 sm:py-28 lg:py-32">
      <Image src={image} alt="" fill priority sizes="100vw" className="object-cover opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/30" />
      <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            <span className="h-px w-8 bg-brand" /> {eyebrow}
          </p>
          <h1 className="font-display text-[clamp(2.6rem,6vw,4.8rem)] leading-[1.03] text-white">{title}</h1>
          {lead && <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">{lead}</p>}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}
