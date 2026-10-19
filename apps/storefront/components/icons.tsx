import type { ReactNode } from "react";

/**
 * Akoko icon set: one consistent line style (24 px grid, rounded strokes) shown
 * inside a brand badge. Used for features and sections instead of emoji.
 */
const GLYPHS: Record<string, ReactNode> = {
  wheat: (
    <>
      <path d="M12 21V8" />
      <path d="M12 8c-2.6 0-4-1.6-4-4 2.6 0 4 1.6 4 4Zm0 0c2.6 0 4-1.6 4-4-2.6 0-4 1.6-4 4Z" />
      <path d="M12 13.5c-2.6 0-4-1.6-4-4 2.6 0 4 1.6 4 4Zm0 0c2.6 0 4-1.6 4-4-2.6 0-4 1.6-4 4Z" />
      <path d="M12 19c-2.6 0-4-1.6-4-4 2.6 0 4 1.6 4 4Zm0 0c2.6 0 4-1.6 4-4-2.6 0-4 1.6-4 4Z" />
    </>
  ),
  egg: <path d="M12 3c3.6 0 6.2 5.3 6.2 9.2a6.2 6.2 0 0 1-12.4 0C5.8 8.3 8.4 3 12 3Z" />,
  truck: (
    <>
      <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7z" />
      <circle cx="7" cy="18" r="1.9" />
      <circle cx="17" cy="18" r="1.9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19 6v5.2c0 4.5-3 8-7 9.8-4-1.8-7-5.3-7-9.8V6l7-3Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  advice: (
    <>
      <path d="M4 5h16v11H9.5L5 20v-4H4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3h5M10.5 3v5.5L5.2 18a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3l-5.3-9.5V3" />
      <path d="M7.6 15h8.8" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10 10.5 5 19 5c0 9-5 14-14 14Z" />
      <path d="M5 19c2.2-4.2 5-7 9-9.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.5 14.2c2.3.2 3.7 1.6 4 4.3" />
    </>
  ),
  cap: (
    <>
      <path d="m2.5 9.5 9.5-5 9.5 5-9.5 5-9.5-5Z" />
      <path d="M6.5 11.8V16c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="m8 15 3.5-3.8 3 2.6L20 7.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.8 7-11.2a7 7 0 1 0-14 0C5 15.2 12 21 12 21Z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </>
  ),
  recycle: (
    <>
      <path d="M7 7.5 9.7 4.2a1.2 1.2 0 0 1 2 0l1.5 2.4M17 7.5l2.7 3.3M17.6 16H12M6.4 16H4.2a1.2 1.2 0 0 1-1-1.8L4.7 12" />
      <path d="m11 13.5-1.5 2.5 1.5 2.5M15.5 5l1.8 2.7-3 .8" />
    </>
  ),
  box: (
    <>
      <path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4v-9Z" />
      <path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" />
    </>
  ),
  handshake: (
    <>
      <path d="m3 12 4-4 4 1.5 3-2 4 3.5-5 5-2.2-1.5-1.8 1.5L3 12Z" />
      <path d="m17 10.5 4 1.5M3 12l-1-1" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8L12 3.5Z" />,
};

export type IconName = keyof typeof GLYPHS;

export function FeatureIcon({ name, size = 52, tone = "brand", className = "" }: { name: IconName; size?: number; tone?: "brand" | "dark" | "soft"; className?: string }) {
  const palette =
    tone === "brand"
      ? "bg-gradient-to-br from-brand to-[#ea5b0c] text-white shadow-brandSm"
      : tone === "dark"
        ? "bg-white/[0.08] text-brand ring-1 ring-white/15"
        : "bg-warm text-brandDark ring-1 ring-warmBorder";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl ${palette} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.5, height: size * 0.5 }}>
        {GLYPHS[name]}
      </svg>
    </span>
  );
}
