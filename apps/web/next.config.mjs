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
  async headers() {
    return [
      {
        // All routes: no caching on HTML pages. Next.js overrides this for
        // /_next/static/** with its own immutable headers, so static assets
        // are still cached correctly by the browser.
        source: "/:path*",
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
        source: "/api/v1/:path*",
        destination: `http://localhost:${apiPort}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
