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
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
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
    return [
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
    return [
      {
        // Health check — must come before the /api/v1/:path* catch-all.
        // Rewrites to the raw /health Express middleware in NestJS (registered
        // before the global prefix so it has no /api/v1/ segment).
        // External ping services (UptimeRobot, cron-job.org) should hit
        // https://<domain>/api/v1/health every 5 min to prevent Hostinger
        // from hibernating the process between real user visits.
        source: "/api/v1/health",
        destination: `http://localhost:${apiPort}/health`,
      },
      {
        source: "/api/v1/:path*",
        destination: `http://localhost:${apiPort}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `http://localhost:${apiPort}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
