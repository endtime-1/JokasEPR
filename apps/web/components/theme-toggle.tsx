"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "light" | "dark" | "system";
const STORAGE_KEY = "akoko-theme";
const ORDER: Mode[] = ["system", "light", "dark"];

function readMode(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Cycles System, Light, Dark. "System" follows the computer's own setting, live. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    setMode(readMode());
  }, []);

  // While on "system", follow the OS if it changes (e.g. sunset auto dark mode).
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice still applies for this visit
    }
    apply(next);
  }, [mode]);

  const label = mode === "system" ? "Theme: follows your computer. Click for light." : mode === "light" ? "Theme: light. Click for dark." : "Theme: dark. Click to follow your computer.";
  const Icon = mode === "system" ? Monitor : mode === "light" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink/60 shadow-sm transition hover:bg-field hover:text-ink"
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}
