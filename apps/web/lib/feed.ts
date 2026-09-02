// Finished feed comes in two forms — MASH (ready-to-feed) and CONCENTRATE
// (mixed with grain by the farmer). Every feed type (Layer 1, Broiler
// Starter, …) exists in both. The distinction lives in the product name /
// SKU ("Layer 1 Mash" / FEED-L1M vs "Layer 1 Concentrate" / FEED-L1C); this
// reads it back out so pickers can group and badge by form.

export type FeedForm = "MASH" | "CONCENTRATE";

export function feedFormOf(product: { name?: string | null; sku?: string | null; feedForm?: FeedForm | null }): FeedForm | null {
  if (product.feedForm) return product.feedForm;
  const hay = `${product.name ?? ""} ${product.sku ?? ""}`.toLowerCase();
  if (/\bconcentrate\b|\bconc\b/.test(hay) || /-\w*c$/.test(product.sku?.toLowerCase() ?? "")) return "CONCENTRATE";
  if (/\bmash\b/.test(hay) || /-\w*m$/.test(product.sku?.toLowerCase() ?? "")) return "MASH";
  return null;
}

export const FEED_FORM_LABEL: Record<FeedForm, string> = { MASH: "Mash", CONCENTRATE: "Concentrate" };

/**
 * Split a product list into Mash / Concentrate / Other buckets for rendering
 * grouped <optgroup>s. Preserves the incoming order within each bucket.
 */
export function groupByFeedForm<T extends { name?: string | null; sku?: string | null; feedForm?: FeedForm | null }>(products: T[]) {
  const mash: T[] = [];
  const concentrate: T[] = [];
  const other: T[] = [];
  for (const p of products) {
    const f = feedFormOf(p);
    (f === "MASH" ? mash : f === "CONCENTRATE" ? concentrate : other).push(p);
  }
  return { mash, concentrate, other };
}
