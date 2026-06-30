"use client";
import React, { useEffect, useRef, type ReactNode } from "react";

interface RevealSectionProps {
  children: ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

export default function RevealSection({ children, className = "", as: Tag = "div" }: RevealSectionProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          io.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // @ts-expect-error dynamic tag
  return <Tag ref={ref} className={`reveal ${className}`}>{children}</Tag>;
}
