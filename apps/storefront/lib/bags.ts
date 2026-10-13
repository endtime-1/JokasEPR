// Product -> bag photo. The four bag designs list their variants (Mash /
// Concentrate) as a checklist; public/bags/ holds one image per product with
// ITS box ticked (built by scripts/make-bag-images.py). Matching is by product
// name so it keeps working whatever slug the ERP gives a product.

const SERIES: Array<[RegExp, string]> = [
  [/broiler\s*starter/, "broiler-starter"],
  [/broiler\s*finisher/, "broiler-finisher"],
  [/super\s*chick/, "super-chicks"],
  [/chicks?\s*starter/, "chicks-starter"],
  [/developer/, "developer"],
  [/pre[\s-]*lay/, "prelayer"],
  [/layer\s*1\b/, "layer-1"],
  [/layer\s*2\b/, "layer-2"],
];

/** The ticked bag image for a product name, or null when we have no bag for it. */
export function bagImageFor(name: string): string | null {
  const n = name.toLowerCase();
  const series = SERIES.find(([re]) => re.test(n))?.[1];
  if (!series) return null;
  // "Concentrate", "Conc", or a trailing " C" (the ERP's short form) = concentrate.
  const concentrate = /concentrate|\bconc\b|\sc$/.test(n.trim());
  return `/bags/${series}-${concentrate ? "concentrate" : "mash"}.webp`;
}
