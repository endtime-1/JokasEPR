import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Needed for standalone to trace files from the monorepo root
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  transpilePackages: ["@jokas/shared"],
  eslint: {
    ignoreDuringBuilds: false
  },
  typescript: {
    ignoreBuildErrors: false
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // Exclude build-only packages from standalone trace to reduce memory and bundle size.
  // These are compiler/bundler tools never needed at runtime.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@swc/**",
      "node_modules/webpack/**",
      "node_modules/next/dist/compiled/webpack/**",
      "node_modules/rollup/**",
      "node_modules/@esbuild/**",
      "node_modules/esbuild/**",
      "node_modules/terser/**",
      "node_modules/typescript/**",
      "node_modules/prettier/**",
      "node_modules/eslint/**",
      "node_modules/@typescript-eslint/**",
    ],
  },
  async headers() {
    const securityHeaders = [
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        // (L2) Forces HTTPS for a year on repeat visits, including subdomains.
        // No `preload` — that's a one-way submission to browsers' built-in
        // preload list and hard to reverse; not worth it unless every
        // subdomain is verified HTTPS-only long-term. Safe to set here even
        // if Hostinger's TLS layer also sets one — browsers just use
        // whichever header actually arrives.
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
      // (M11) Content-Security-Policy is set in middleware.ts instead of here —
      // it needs a fresh nonce per request for script-src, which a static header
      // here can't provide. Setting it in both places would emit two CSP headers,
      // and browsers intersect multiple CSP headers rather than letting the
      // later one win, which would silently reintroduce conflicts.
    ];

    return [
      {
        // Security headers on all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Static chunk files have content-addressed URLs (hashed filenames).
        // Cache them for 1 year — if the content changes, Next.js generates
        // a new URL so old cached files are never served for new code.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // All HTML routes must never be cached so the browser always gets
        // the latest chunk manifest pointing to current hashed filenames.
        source: "/((?!_next/static).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
  async rewrites() {
    // Proxy /api/v1/* to the internal NestJS process on API_PORT (default 4001).
    // This lets the browser call /api/v1/* on the same origin instead of directly
    // hitting localhost:4001 (which would be the user's own machine).
    const apiPort = process.env.API_PORT || "4001";
    // IMPORTANT: use 127.0.0.1, NOT localhost.
    // On Linux, `localhost` resolves to ::1 (IPv6 loopback) first. NestJS listens
    // on 0.0.0.0 (IPv4 only), so a connection to ::1:4001 is refused, causing every
    // API rewrite to fail with 502 — making ALL data endpoints appear to be down.
    return [
      {
        // Health check — must come before the /api/v1/:path* catch-all.
        // Rewrites to the raw /health Express middleware in NestJS (registered
        // before the global prefix so it has no /api/v1/ segment).
        // External ping services (UptimeRobot, cron-job.org) should hit
        // https://<domain>/api/v1/health every 5 min to prevent Hostinger
        // from hibernating the process between real user visits.
        source: "/api/v1/health",
        destination: `http://127.0.0.1:${apiPort}/health`,
      },
      {
        source: "/api/v1/:path*",
        destination: `http://127.0.0.1:${apiPort}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `http://127.0.0.1:${apiPort}/api/v1/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
