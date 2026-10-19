import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  variant?: "mark" | "lockup" | "light-lockup";
  height?: number;
  className?: string;
  href?: string;
}

/** The standalone hen-badge mark (square, works at any size) */
export function LogoMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/akoko-mark.svg"
      alt="Akoko Feeds"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

/**
 * Akoko Feeds logo: hen badge + "AKOKO FEEDS" wordmark.
 * variant="lockup"       → dark text, for light backgrounds
 * variant="light-lockup" → white text, for dark / photo backgrounds
 * variant="mark"         → just the badge
 */
export function Logo({ variant = "lockup", height = 44, className = "", href = "/" }: LogoProps) {
  const light = variant === "light-lockup";
  const content =
    variant === "mark" ? (
      <LogoMark size={height} />
    ) : (
      <span className="flex items-center gap-2.5">
        <LogoMark size={height} />
        <span className="flex flex-col leading-none">
          <span className={`font-display text-[22px] tracking-tight ${light ? "text-white" : "text-ink"}`}>
            Akoko <span className="text-brand">Feeds</span>
          </span>
          <span className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] ${light ? "text-white/55" : "text-muted"}`}>
            Quality Feed, Higher Production
          </span>
        </span>
      </span>
    );

  return (
    <Link href={href} aria-label="Akoko Feeds home" className={`inline-flex items-center select-none ${className}`}>
      {content}
    </Link>
  );
}

/* Legacy alias — keeps old imports working */
export function LogoIcon({ size = 40 }: { size?: number }) {
  return <LogoMark size={size} />;
}
