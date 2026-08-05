import type { MetadataRoute } from "next";

const SITE_ORIGIN = (process.env.SITE_URL || process.env.WEB_ORIGIN || "https://jokasfarms.com").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Transactional/per-customer pages — nothing to index, and crawling
      // /order/* would otherwise expose customer order-reference URLs to bots.
      disallow: ["/cart", "/checkout", "/order"],
    },
    sitemap: `${SITE_ORIGIN}/shop/sitemap.xml`,
  };
}
