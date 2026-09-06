"use strict";
// Compiled copy of poultry-standards.ts — kept in sync by hand because jest's
// moduleNameMapper resolves @jokas/shared to src/ and moduleFileExtensions
// prefers .js over .ts. See warehouse-purpose.js for the same arrangement.
Object.defineProperty(exports, "__esModule", { value: true });
exports.BREED_STANDARD = void 0;
exports.standardWeightG = standardWeightG;
exports.standardWeightKg = standardWeightKg;
exports.standardLayPct = standardLayPct;

const LAYER_WEIGHT_G = [
  { week: 1, value: 65 }, { week: 2, value: 125 }, { week: 3, value: 190 }, { week: 4, value: 275 },
  { week: 5, value: 365 }, { week: 6, value: 470 }, { week: 7, value: 570 }, { week: 8, value: 685 },
  { week: 9, value: 795 }, { week: 10, value: 900 }, { week: 11, value: 1010 }, { week: 12, value: 1100 },
  { week: 13, value: 1185 }, { week: 14, value: 1255 }, { week: 15, value: 1325 }, { week: 16, value: 1395 },
  { week: 17, value: 1460 }, { week: 18, value: 1550 }, { week: 20, value: 1700 }, { week: 24, value: 1900 },
  { week: 28, value: 2000 }, { week: 90, value: 2000 },
];
const LAYER_LAY_PCT = [
  { week: 17, value: 0 }, { week: 18, value: 5 }, { week: 19, value: 25 }, { week: 20, value: 50 },
  { week: 21, value: 74 }, { week: 22, value: 88 }, { week: 23, value: 92 }, { week: 24, value: 94 },
  { week: 26, value: 95 }, { week: 30, value: 94 }, { week: 40, value: 90 }, { week: 50, value: 85 },
  { week: 60, value: 80 }, { week: 72, value: 72 }, { week: 90, value: 65 },
];
const BROILER_WEIGHT_G = [
  { week: 1, value: 180 }, { week: 2, value: 460 }, { week: 3, value: 900 }, { week: 4, value: 1500 },
  { week: 5, value: 2100 }, { week: 6, value: 2650 }, { week: 7, value: 3100 }, { week: 8, value: 3500 },
];

exports.BREED_STANDARD = {
  LAYERS: { weightG: LAYER_WEIGHT_G, layPct: LAYER_LAY_PCT },
  BREEDERS: { weightG: LAYER_WEIGHT_G, layPct: LAYER_LAY_PCT },
  BROILERS: { weightG: BROILER_WEIGHT_G },
  COCKERELS: { weightG: LAYER_WEIGHT_G },
  CHICKS: { weightG: LAYER_WEIGHT_G },
};

function interpolate(points, week) {
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

const std = (birdType) => exports.BREED_STANDARD[birdType];

function standardWeightG(birdType, ageWeeks) {
  const s = std(birdType);
  return s ? interpolate(s.weightG, Math.max(1, Math.round(ageWeeks))) : null;
}
function standardWeightKg(birdType, ageWeeks) {
  const g = standardWeightG(birdType, ageWeeks);
  return g == null ? null : Math.round((g / 1000) * 1000) / 1000;
}
function standardLayPct(birdType, ageWeeks) {
  const s = std(birdType);
  return s && s.layPct ? interpolate(s.layPct, Math.max(1, Math.round(ageWeeks))) : null;
}
