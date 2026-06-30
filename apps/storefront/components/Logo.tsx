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
      alt="Akoko Solutions"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

/**
 * Full logo: mark + "AKOKO / SOLUTIONS" wordmark.
 * variant="lockup"       → the full horizontal SVG lockup (dark text)
 * variant="mark"         → just the badge (square)
 * variant="light-lockup" → badge + white text wordmark, for dark backgrounds
 */
export function Logo({ variant = "lockup", height = 44, className = "", href = "/" }: LogoProps) {
  const content =
    variant === "lockup" ? (
      /* Full horizontal SVG lockup */
      <Image
        src="/brand/akoko-logo.svg"
        alt="Akoko Solutions"
        width={Math.round((640 / 190) * height)}
        height={height}
        priority
        className="h-auto"
        style={{ height }}
      />
    ) : variant === "light-lockup" ? (
      /* Badge + white text, for dark backgrounds */
      <span className="flex items-center gap-2.5">
        <LogoMark size={height} />
        <span className="flex flex-col leading-none">
          <span className="text-[17px] font-black tracking-tight text-white">Akoko</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Solutions
          </span>
        </span>
      </span>
    ) : (
      /* Mark only */
      <LogoMark size={height} />
    );

  return (
    <Link href={href} className={`inline-flex items-center select-none ${className}`}>
      {content}
    </Link>
  );
}

/* Legacy alias — keeps old imports working */
export function LogoIcon({ size = 40 }: { size?: number }) {
  return <LogoMark size={size} />;
}
