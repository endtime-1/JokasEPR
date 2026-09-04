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
      // Revisit if this app's basePath is ever replaced by a reverse-proxy
      // prefix, or on a future Next.js upgrade that may fix the detection.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://plus.unsplash.com https://www.akokosolutions.com",
      // (2026-09-04) nginx accepts both jokasfarms.com and www.jokasfarms.com
      // on the same server block with no canonical redirect. A /shop page
      // loaded from www.jokasfarms.com has document origin www.jokasfarms.com,
      // so its own fetches to the bare-domain API don't match 'self' — every
      // API call was silently CSP-blocked on that host. This app has no
      // middleware.ts (see the comment above — Next.js never detects one
      // with basePath set) so it can't redirect www -> apex the way
      // apps/web's middleware now does; listing both hosts explicitly here
      // is the fix that's actually deployable for this app.
      "connect-src 'self' https://jokasfarms.com https://www.jokasfarms.com",
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Serve the shop at /shop/* so it shares the same domain as the dashboard
  basePath: "/shop",
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "www.akokosolutions.com" },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
