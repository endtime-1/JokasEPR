// Product -> bag photo, and the order feeds are shown in. The four bag designs
// list their variants (Mash / Concentrate) as a checklist; public/bags/ holds
// one image per product with ITS box ticked (built by scripts/make-bag-images.py).
// Matching is by product name so it keeps working whatever slug the ERP gives a
// product. packages/db/scripts/sync-feed-products.mjs uses the same rules.

// The feeding order: the first week's feed comes first, never alphabetical.
const SERIES: Array<[RegExp, string]> = [
  [/super[\s-]*chick/, "super-chicks"],
  [/broiler[\s-]*starter/, "broiler-starter"],
  [/broiler[\s-]*finisher/, "broiler-finisher"],
  [/chicks?[\s-]*(starter|mash|conc)/, "chicks-starter"],
  [/developer/, "developer"],
  [/pre[\s-]*lay/, "prelayer"],
  [/layer[\s-]*1\b/, "layer-1"],
  [/layer[\s-]*2\b/, "layer-2"],
];

export const FEED_ORDER = [
  "super-chicks",
  "chicks-starter",
  "developer",
  "prelayer",
  "layer-1",
  "layer-2",
  "broiler-starter",
  "broiler-finisher",
];

/** Which feed series a product name belongs to (or null for non-feed products). */
export function feedSeriesOf(name: string): string | null {
  const n = name.toLowerCase();
  return SERIES.find(([re]) => re.test(n))?.[1] ?? null;
}

/** "Concentrate", "Conc", or a trailing " C" (the ERP's short form) = concentrate. */
export function isConcentrate(name: string): boolean {
  return /concentrate|\bconc\b|\sc$/.test(name.toLowerCase().trim());
}

const DISPLAY_NAME: Record<string, string> = {
  "super-chicks": "Super Chicks",
  "chicks-starter": "Chicks Starter",
  developer: "Developer",
  prelayer: "Pre-Lay",
  "layer-1": "Layer 1",
  "layer-2": "Layer 2",
  "broiler-starter": "Broiler Starter",
  "broiler-finisher": "Broiler Finisher",
};

/** The customer-facing name for a feed: "Layer1 M" in the ERP shows as "Layer 1 Mash".
 *  Anything that is not one of our feeds keeps its own name. */
export function displayFeedName(name: string): string {
  const series = feedSeriesOf(name);
  if (!series) return name;
  return `${DISPLAY_NAME[series]} ${isConcentrate(name) ? "Concentrate" : "Mash"}`;
}

/** The ticked bag image for a product name, or null when we have no bag for it. */
export function bagImageFor(name: string): string | null {
  const series = feedSeriesOf(name);
  if (!series) return null;
  return `/bags/${series}-${isConcentrate(name) ? "concentrate" : "mash"}.webp`;
}

/** Sort products into feeding order: Super Chicks first, mash before concentrate,
 *  then anything that is not one of our feeds (alphabetical) at the end. */
export function sortByFeedOrder<T extends { name: string }>(items: T[]): T[] {
  const rank = (p: T) => {
    const series = feedSeriesOf(p.name);
    const i = series ? FEED_ORDER.indexOf(series) : -1;
    return i === -1 ? 1000 : i * 2 + (isConcentrate(p.name) ? 1 : 0);
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
