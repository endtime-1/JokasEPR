import type { MetadataRoute } from "next";
import { api } from "@/lib/api";

const SITE_ORIGIN = (process.env.SITE_URL || process.env.WEB_ORIGIN || "https://jokasfarms.com").replace(/\/$/, "");
const BASE = `${SITE_ORIGIN}/shop`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Best-effort: product pages make the sitemap more useful, but a slow/down
  // API must never take the whole sitemap route down with it.
  try {
    const products = await api.products.list();
    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${BASE}/products/${p.publicSlug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
