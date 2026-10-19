import path from "path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    // (L2) See apps/web/next.config.mjs for the same header — no `preload`,
    // safe to set alongside whatever Hostinger's TLS layer may also set.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // (M11) Tried a nonce-based script-src here, matching apps/web's fix —
      // verified (both `next dev` and a real `next build`) that with
      // `basePath: "/shop"` set, this Next.js setup (15.5.19) never detects
      // middleware.ts at all: no "Compiling /middleware" in dev, no
      // "Middleware" entry in the build's route table, and no CSP/x-nonce
      // header ever reaches the response. Shipping the nonce version here
      // would have silently dropped ALL security headers in production
      // (this array wouldn't run either, since it'd move into middleware.ts
      // too) — reverted to keep this app's headers actually working.
      // The basePath is gone now (the site is served from the root), so a
      // nonce-based CSP via middleware.ts could be revisited.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      // The browser only ever calls same-origin /api/v1/public/* (nginx on
      // akokofeeds.com forwards just those routes to the API). www. is listed
      // as a second line of defence behind nginx's www -> apex redirect: a
      // page that ends up on the other host would otherwise have every API
      // call silently CSP-blocked (the 2026-09-04 jokasfarms.com bug).
      "connect-src 'self' https://akokofeeds.com https://www.akokofeeds.com",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Served from the root of akokofeeds.com (the marketing + sales site). It
  // used to live at jokasfarms.com/shop; nginx now 301-redirects that here.
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
