// Business units for the dashboards. The owner works in crates and bags, so those are the headline
// figures; the raw pieces / kilos stay visible underneath.
//   1 crate of eggs = 30 eggs      1 bag of feed (or any bagged material) = 50 kg
export const EGGS_PER_CRATE = 30;
export const KG_PER_BAG = 50;

const oneDecimal = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });

export type UnitParts = {
  /** The big number, e.g. "123.4" */
  main: string;
  /** The big number's unit, e.g. "crates" */
  mainUnit: string;
  /** The small line under it, e.g. "3,702 eggs" */
  under: string;
};

/** Eggs (pieces) -> crates as the headline, pieces underneath. */
export function toCrates(eggs: number): UnitParts {
  const n = Number(eggs) || 0;
  const crates = n / EGGS_PER_CRATE;
  return { main: oneDecimal.format(crates), mainUnit: crates === 1 ? "crate" : "crates", under: `${whole.format(n)} ${n === 1 ? "egg" : "eggs"}` };
}

/** Kilograms -> 50 kg bags as the headline, kilograms underneath. */
export function toBags(kg: number): UnitParts {
  const n = Number(kg) || 0;
  const bags = n / KG_PER_BAG;
  return { main: oneDecimal.format(bags), mainUnit: bags === 1 ? "bag" : "bags", under: `${whole.format(n)} kg` };
}
