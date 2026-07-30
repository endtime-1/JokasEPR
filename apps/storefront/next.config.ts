import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve the shop at /shop/* so it shares the same domain as the dashboard
  basePath: "/shop",
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
    ],
  },
};

export default nextConfig;
