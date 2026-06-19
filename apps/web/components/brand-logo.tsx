import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  label?: string;
  variant?: "mark" | "lockup";
};

export function BrandLogo({
  className,
  label = "Akoko Solutions",
  variant = "mark"
}: BrandLogoProps) {
  const src = variant === "lockup" ? "/brand/akoko-logo.svg" : "/brand/akoko-mark.svg";
  const size = variant === "lockup" ? { width: 640, height: 190 } : { width: 256, height: 256 };

  return (
    <Image
      src={src}
      alt={label}
      width={size.width}
      height={size.height}
      className={className}
      priority
    />
  );
}
