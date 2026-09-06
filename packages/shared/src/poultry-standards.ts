/**
 * Breed / production standards — the reference curves a farm compares actual
 * performance against. The system has no editable standards table yet, so
 * these are fixed per bird type (which is exactly how the farm's Excel sheets
 * work: one "Target WT" column per bird type). An editable BreedStandard table
 * is a deliberate later follow-up.
 *
 * The LAYERS body-weight curve is seeded from the farm's own Excel "Target WT"
 * column; the lay-% curve and the BROILERS weight curve are generic
 * brown-layer / Ross-type standards.
 *
 * Plain data + pure helpers so the mobile app can import this too.
 */

export type BirdTypeName = "LAYERS" | "BROILERS" | "COCKERELS" | "BREEDERS" | "CHICKS";

type Point = { week: number; value: number };

interface Standard {
  /** Target average body weight in grams, by age-week. */
  weightG: Point[];
  /** Target hen-day lay %, by age-week (layers / breeders only). */
  layPct?: Point[];
}

// From the farm's Excel "Target WT" column (weeks 1–18 verbatim), extended to
// ~2 kg mature weight by week 28 and held flat thereafter.
const LAYER_WEIGHT_G: Point[] = [
  { week: 1, value: 65 }, { week: 2, value: 125 }, { week: 3, value: 190 }, { week: 4, value: 275 },
  { week: 5, value: 365 }, { week: 6, value: 470 }, { week: 7, value: 570 }, { week: 8, value: 685 },
  { week: 9, value: 795 }, { week: 10, value: 900 }, { week: 11, value: 1010 }, { week: 12, value: 1100 },
  { week: 13, value: 1185 }, { week: 14, value: 1255 }, { week: 15, value: 1325 }, { week: 16, value: 1395 },
  { week: 17, value: 1460 }, { week: 18, value: 1550 }, { week: 20, value: 1700 }, { week: 24, value: 1900 },
  { week: 28, value: 2000 }, { week: 90, value: 2000 },
];

// Generic brown-layer hen-day production standard.
const LAYER_LAY_PCT: Point[] = [
  { week: 17, value: 0 }, { week: 18, value: 5 }, { week: 19, value: 25 }, { week: 20, value: 50 },
  { week: 21, value: 74 }, { week: 22, value: 88 }, { week: 23, value: 92 }, { week: 24, value: 94 },
  { week: 26, value: 95 }, { week: 30, value: 94 }, { week: 40, value: 90 }, { week: 50, value: 85 },
  { week: 60, value: 80 }, { week: 72, value: 72 }, { week: 90, value: 65 },
];

// Ross-type as-hatched broiler live weight (g).
const BROILER_WEIGHT_G: Point[] = [
  { week: 1, value: 180 }, { week: 2, value: 460 }, { week: 3, value: 900 }, { week: 4, value: 1500 },
  { week: 5, value: 2100 }, { week: 6, value: 2650 }, { week: 7, value: 3100 }, { week: 8, value: 3500 },
];

export const BREED_STANDARD: Record<BirdTypeName, Standard> = {
  LAYERS: { weightG: LAYER_WEIGHT_G, layPct: LAYER_LAY_PCT },
  BREEDERS: { weightG: LAYER_WEIGHT_G, layPct: LAYER_LAY_PCT },
  BROILERS: { weightG: BROILER_WEIGHT_G },
  COCKERELS: { weightG: LAYER_WEIGHT_G },
  CHICKS: { weightG: LAYER_WEIGHT_G },
};

function interpolate(points: Point[], week: number): number | null {
  if (!points.length || week < points[0].week) return points.length && week >= 1 && points[0].week === 1 ? points[0].value : null;
  const last = points[points.length - 1];
  if (week >= last.week) return last.value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (week >= a.week && week <= b.week) {
      const t = (week - a.week) / (b.week - a.week);
      return Math.round(a.value + t * (b.value - a.value));
    }
  }
  return null;
}

const std = (birdType: string): Standard | undefined => BREED_STANDARD[birdType as BirdTypeName];

/** Standard body weight in grams at the given age-week, or null if unknown. */
export function standardWeightG(birdType: string, ageWeeks: number): number | null {
  const s = std(birdType);
  return s ? interpolate(s.weightG, Math.max(1, Math.round(ageWeeks))) : null;
}

/** Standard body weight in kg at the given age-week, or null if unknown. */
export function standardWeightKg(birdType: string, ageWeeks: number): number | null {
  const g = standardWeightG(birdType, ageWeeks);
  return g == null ? null : Math.round((g / 1000) * 1000) / 1000;
}

/** Standard hen-day lay % at the given age-week (layers/breeders), or null. */
export function standardLayPct(birdType: string, ageWeeks: number): number | null {
  const s = std(birdType);
  return s?.layPct ? interpolate(s.layPct, Math.max(1, Math.round(ageWeeks))) : null;
}
