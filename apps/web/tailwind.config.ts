import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        field: "#fff8f1",
        line: "#eadfd2",
        brand: "#f58220",
        brandDark: "#c65f0f",
        caution: "#b45309",
        sidebar: "#1a2235"
      },
      boxShadow: {
        panel: "0 18px 44px rgba(31, 41, 51, 0.08)",
        soft: "0 8px 22px rgba(31, 41, 51, 0.07)",
        card: "0 2px 8px rgba(31, 41, 51, 0.06), 0 0 0 1px rgba(234, 223, 210, 0.6)",
        toast: "0 8px 32px rgba(31, 41, 51, 0.18)",
        modal: "0 24px 64px rgba(31, 41, 51, 0.16)"
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
