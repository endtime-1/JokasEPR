import type { Config } from "tailwindcss";

// Colours come from CSS variables (see app/globals.css) as "r g b" triplets, so every utility
// (text-ink, border-line, bg-brand/10 ...) follows the light / dark theme and keeps opacity modifiers.
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        ink: token("ink"),
        muted: token("muted"),
        field: token("field"),
        line: token("line"),
        brand: token("brand"),
        brandDark: token("brand-dark"),
        brandTint: token("brand-tint"),
        caution: token("caution"),
        sidebar: token("sidebar")
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        toast: "0 8px 32px rgba(0, 0, 0, 0.22)",
        modal: "0 24px 64px rgba(0, 0, 0, 0.28)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateX(110%) scale(0.95)" },
          to: { opacity: "1", transform: "translateX(0) scale(1)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-up": "slide-up 0.2s ease-out",
        "toast-in": "toast-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
