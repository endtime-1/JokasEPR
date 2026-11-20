import { BadRequestException } from "@nestjs/common";
import { mulDivHalfUp } from "./fin-tax-math";

/**
 * Stock arithmetic. Quantities are whole thousandths ("milli-units", 3 decimals) and money is whole pesewas, so nothing is ever a float.
 * Cost method: weighted average. Taking stock out removes its share of the item's total value, and the last unit out removes all of it,
 * so value can never be left behind (or go negative) from rounding.
 */

export const MAX_MILLI = 999_999_999_999_999; // DECIMAL(15,3)

/** "12.5" -> 12500. At most 3 decimals; rejects anything that is not a plain number. */
export function qtyToMilli(value: string | number | { toString(): string } | null | undefined, field = "quantity"): number {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const raw = typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value).trim();
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(raw)) throw new BadRequestException(`${field} is not a valid number.`);
  const [whole, frac = ""] = raw.split(".");
  if (frac.replace(/0+$/, "").length > 3) throw new BadRequestException(`${field} can have at most 3 decimal places.`);
  const negative = whole.startsWith("-");
  const milli = Number(whole.replace("-", "") || "0") * 1000 + Number((frac + "000").slice(0, 3));
  if (!Number.isSafeInteger(milli) || milli > MAX_MILLI) throw new BadRequestException(`${field} is too large.`);
  return negative ? -milli : milli;
}

export function milliToString(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(milli);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
}

/** A unit cost as whole ten-thousandths of a cedi ("3.2" -> 32000). At most 4 decimals. */
export function costToTenThousandths(value: string | number | { toString(): string }, field = "unit cost"): number {
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(raw)) throw new BadRequestException(`${field} is not a valid amount.`);
  const [whole, frac = ""] = raw.split(".");
  if (frac.replace(/0+$/, "").length > 4) throw new BadRequestException(`${field} can have at most 4 decimal places.`);
  const n = Number(whole || "0") * 10_000 + Number((frac + "0000").slice(0, 4));
  if (!Number.isSafeInteger(n)) throw new BadRequestException(`${field} is too large.`);
  return n;
}

/** Value in pesewas of `qtyMilli` units at a cost of `cost4` ten-thousandths of a cedi per unit. */
export function valueOfStockIn(qtyMilli: number, cost4: number): number {
  return mulDivHalfUp(qtyMilli, cost4, 100_000);
}

/** The cost of taking `outMilli` units out of a stock of `onHandMilli` units worth `valuePesewas`: the weighted-average share. */
export function costOfStockOut(valuePesewas: number, onHandMilli: number, outMilli: number): number {
  if (outMilli <= 0 || onHandMilli <= 0) return 0;
  if (outMilli >= onHandMilli) return valuePesewas; // the last unit out takes all the remaining value
  return mulDivHalfUp(valuePesewas, outMilli, onHandMilli);
}

/** Unit cost, in ten-thousandths of a cedi, for display on a movement: value / quantity. */
export function unitCost4(valuePesewas: number, qtyMilli: number): number {
  if (qtyMilli === 0) return 0;
  return mulDivHalfUp(Math.abs(valuePesewas), 100_000, Math.abs(qtyMilli));
}

export function tenThousandthsToString(n: number): string {
  return `${Math.floor(n / 10_000)}.${String(n % 10_000).padStart(4, "0")}`;
}
