import { BadRequestException } from "@nestjs/common";

/**
 * Tax arithmetic in whole pesewas. Rates are percentages with up to 4 decimals (15, 2.5, 0.25).
 * Rounding is half-up to the pesewa, applied per line, so a document's tax is the sum of its
 * lines' taxes and a posted entry can always be re-derived exactly.
 */

/** A rate such as "2.5000" or 15 as thousandths-of-a-percent (2500), exact. */
export function rateToBasisPoints(rate: number | string | { toString(): string }): number {
  const s = String(rate).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(s)) throw new BadRequestException("A tax rate is a number between 0 and 100 with at most 4 decimals.");
  const [w, f = ""] = s.split(".");
  const bp = Number(w) * 10_000 + Number((f + "0000").slice(0, 4));
  if (bp > 1_000_000) throw new BadRequestException("A tax rate cannot be more than 100%.");
  return bp;
}

/** Tax added on top of a net amount: net x rate, half-up to the pesewa. */
export function taxOnNet(netPesewas: number, rate: number | string | { toString(): string }): number {
  const bp = rateToBasisPoints(rate);
  return mulDivHalfUp(netPesewas, bp, 1_000_000);
}

/** Splits a tax-inclusive gross into net and tax. tax = gross x rate / (100 + rate), half-up; net = gross - tax. */
export function splitGross(grossPesewas: number, rate: number | string | { toString(): string }): { net: number; tax: number } {
  const bp = rateToBasisPoints(rate);
  const tax = mulDivHalfUp(grossPesewas, bp, 1_000_000 + bp);
  return { net: grossPesewas - tax, tax };
}

/** (value x mul) / div rounded half away from zero, exact: BigInt, so large amounts cannot lose precision. */
export function mulDivHalfUp(value: number, mul: number, div: number): number {
  const num = BigInt(value) * BigInt(mul);
  const d = BigInt(div);
  const negative = num < 0n;
  const abs = negative ? -num : num;
  const q = (2n * abs + d) / (2n * d);
  return Number(negative ? -q : q);
}

/** The rate in force on a date: the latest row whose effectiveFrom is on or before it. */
export function rateOn<T extends { effectiveFrom: Date; ratePercent: { toString(): string } }>(rates: T[], date: Date): T | null {
  let best: T | null = null;
  for (const r of rates) {
    if (r.effectiveFrom.getTime() <= date.getTime() && (!best || r.effectiveFrom.getTime() > best.effectiveFrom.getTime())) best = r;
  }
  return best;
}
