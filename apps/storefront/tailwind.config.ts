import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand:      "#f58220",
        brandDark:  "#c96010",
        brandLight: "#fef3e2",
        ink:        "#0a0b0d",
        inkMid:     "#1a1d24",
        stone:      "#44403c",
        muted:      "#78716c",
        subtleMuted:"#a8a29e",
        surface:    "#ffffff",
        cream:      "#faf8f4",
        warm:       "#fef7ed",
        warmBorder: "#fed7aa",
        sand:       "#e7e5e0",
        feed:       "#d97706",
        eggs:       "#f97316",
        soya:       "#16a34a",
      },
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["DM Serif Display", "Georgia", "serif"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
        "8xl": ["6rem",   { lineHeight: "1"    }],
        "9xl": ["8rem",   { lineHeight: "1"    }],
        "10xl":["10rem",  { lineHeight: "0.9"  }],
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "128":"32rem",
      },
      maxWidth: {
        "8xl":"88rem",
      },
      borderRadius: {
        "4xl":"2rem",
        "5xl":"2.5rem",
      },
      boxShadow: {
        card:       "0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.06)",
        cardHover:  "0 8px 16px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.12)",
        brand:      "0 4px 24px rgba(245,130,32,0.40)",
        brandSm:    "0 2px 12px rgba(245,130,32,0.28)",
        panel:      "0 0 0 1px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.08)",
        deep:       "0 24px 64px rgba(0,0,0,0.24)",
        "inner-sm": "inset 0 1px 2px rgba(0,0,0,0.08)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg,#f59e0b 0%,#f58220 55%,#ea5b0c 100%)",
        "dark-gradient":  "linear-gradient(160deg,#0a0b0d 0%,#13171f 50%,#0d1018 100%)",
        "hero-glow":      "radial-gradient(ellipse 80% 60% at 60% 50%, rgba(245,130,32,0.15) 0%, transparent 70%)",
        "noise":          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        "fade-up":    { from:{ opacity:"0", transform:"translateY(24px)" }, to:{ opacity:"1", transform:"translateY(0)" } },
        "fade-in":    { from:{ opacity:"0" }, to:{ opacity:"1" } },
        "slide-up":   { from:{ opacity:"0", transform:"translateY(40px)" }, to:{ opacity:"1", transform:"translateY(0)" } },
        float:        { "0%,100%":{ transform:"translateY(0)" }, "50%":{ transform:"translateY(-10px)" } },
        "spin-slow":  { to:{ transform:"rotate(360deg)" } },
        "count-up":   { from:{ opacity:"0", transform:"translateY(8px)" }, to:{ opacity:"1", transform:"translateY(0)" } },
        shimmer:      { from:{ backgroundPosition:"200% center" }, to:{ backgroundPosition:"-200% center" } },
        marquee:      { "0%":{ transform:"translateX(0%)" }, "100%":{ transform:"translateX(-50%)" } },
        "scale-in":   { from:{ opacity:"0", transform:"scale(0.96)" }, to:{ opacity:"1", transform:"scale(1)" } },
      },
      animation: {
        "fade-up":        "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "fade-up-1":      "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both",
        "fade-up-2":      "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s both",
        "fade-up-3":      "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.35s both",
        "fade-in":        "fade-in 0.5s ease both",
        float:            "float 5s ease-in-out infinite",
        "float-1":        "float 5s ease-in-out 1s infinite",
        "float-2":        "float 5s ease-in-out 2s infinite",
        "spin-slow":      "spin-slow 20s linear infinite",
        marquee:          "marquee 30s linear infinite",
        "scale-in":       "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};
export default config;
