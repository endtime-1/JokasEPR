// The Akoko Feeds range, taken from what is printed on the bags. Every series
// comes as a Mash (100%, ready to feed) and a Concentrate (50%). Image paths
// are the per-product bag photos in public/bags (see scripts/make-bag-images.py).

export interface FeedSeries {
  slug: string;        // bag image: /bags/<slug>-mash.webp
  name: string;        // shown to customers, also used as the shop search term
  bird: "Chicks" | "Growers" | "Layers" | "Broilers";
  tagline: string;     // from the bag
}

export const FEED_SERIES: FeedSeries[] = [
  { slug: "super-chicks", name: "Super Chicks", bird: "Chicks", tagline: "Kick-starts growth in the first weeks: the right protein and energy for young chicks." },
  { slug: "pre-starter", name: "Pre-Starter", bird: "Chicks", tagline: "Part of the Akoko chick feeding range, as mash and concentrate." },
  { slug: "chicks-starter", name: "Chicks Starter", bird: "Chicks", tagline: "Formulated for strong and healthy early bird life." },
  { slug: "developer", name: "Developer", bird: "Growers", tagline: "The right nutrients for steady, healthy growth." },
  { slug: "prelayer", name: "Pre-Lay", bird: "Growers", tagline: "Optimized for higher performance at the onset of lay." },
  { slug: "layer-1", name: "Layer 1", bird: "Layers", tagline: "Optimum egg production, egg size and shell improvement." },
  { slug: "layer-2", name: "Layer 2", bird: "Layers", tagline: "Specially formulated for older birds; prolongs the laying cycle." },
  { slug: "broiler-starter", name: "Broiler Starter", bird: "Broilers", tagline: "For optimum meat yield." },
  { slug: "broiler-finisher", name: "Broiler Finisher", bird: "Broilers", tagline: "Less feed for more weight. Supports healthy, resilient birds." },
];

export const BIRDS: Array<FeedSeries["bird"]> = ["Chicks", "Growers", "Layers", "Broilers"];

export const bagMash = (slug: string) => `/bags/${slug}-mash.webp`;
export const bagConcentrate = (slug: string) => `/bags/${slug}-concentrate.webp`;

// The order a layer flock moves through the range, and the broiler pair.
export const LAYER_PROGRAMME = ["super-chicks", "chicks-starter", "developer", "prelayer", "layer-1", "layer-2"];
export const BROILER_PROGRAMME = ["broiler-starter", "broiler-finisher"];
export const seriesBySlug = (slug: string) => FEED_SERIES.find((s) => s.slug === slug)!;
