import { BadRequestException } from "@nestjs/common";
import { mulDivHalfUp, splitGross, taxOnNet } from "./fin-tax-math";

/**
 * Till arithmetic, in whole pesewas. Shelf prices include tax by default (the usual retail rule), so a line's tax is split OUT of
 * what the customer pays: price 115.00 at 15% is 100.00 plus 15.00 tax. A price marked "plus tax" has tax added on top instead.
 * An overall discount is shared across the lines in proportion to what each costs, to the pesewa, so the tax on each line is right.
 */

export type CartLineInput = {
  qtyMilli: number;
  /** Price of one unit, in pesewas. */
  unitPesewas: number;
  /** Discount on this line, as an amount in pesewas. */
  discountPesewas: number;
  taxRatePercent: string;
  priceIncludesTax: boolean;
};

export type CartLineResult = {
  /** Quantity x price, before any discount. */
  gross: number;
  /** What the line costs after its own discount. */
  afterLine: number;
  /** This line's share of the overall discount. */
  share: number;
  net: number;
  tax: number;
  /** What the customer pays for this line. */
  total: number;
};

export type CartResult = {
  lines: CartLineResult[];
  /** Sum of the net (before tax) amounts, after discounts. */
  subtotal: number;
  /** Line discounts plus the overall discount. */
  discountTotal: number;
  taxTotal: number;
  total: number;
};

/** A discount as a percentage of an amount, to the pesewa (half up). Percent has at most 2 decimals. */
export function percentOf(amountPesewas: number, percent: string | number): number {
  const raw = String(percent).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new BadRequestException("A discount percentage can have at most 2 decimals.");
  const [w, f = ""] = raw.split(".");
  const hundredths = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (hundredths > 10_000) throw new BadRequestException("A discount cannot be more than 100%.");
  return mulDivHalfUp(amountPesewas, hundredths, 10_000);
}

/** Splits `total` across `weights` exactly (to the pesewa): the largest remainders get the extra pesewas. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const T = BigInt(total);
  const S = BigInt(sum);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % S }));
  let left = Number(T - base.reduce((s, b) => s + b, 0n));
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map((b) => Number(b));
  for (let k = 0; k < rem.length && left > 0; k++, left--) out[rem[k].i] += 1;
  return out;
}

export function computeCart(lines: CartLineInput[], overallDiscountPesewas: number): CartResult {
  const gross = lines.map((l) => mulDivHalfUp(l.unitPesewas, l.qtyMilli, 1000));
  const afterLine = lines.map((l, i) => {
    if (l.discountPesewas < 0) throw new BadRequestException("A discount cannot be negative.");
    if (l.discountPesewas > gross[i]) throw new BadRequestException("A line discount cannot be more than the line costs.");
    return gross[i] - l.discountPesewas;
  });
  const sum = afterLine.reduce((s, a) => s + a, 0);
  if (overallDiscountPesewas < 0) throw new BadRequestException("A discount cannot be negative.");
  if (overallDiscountPesewas > sum) throw new BadRequestException("The discount cannot be more than the sale costs.");
  const shares = allocate(overallDiscountPesewas, afterLine);

  const results: CartLineResult[] = lines.map((l, i) => {
    const x = afterLine[i] - shares[i];
    if (l.priceIncludesTax) {
      const { net, tax } = splitGross(x, l.taxRatePercent);
      return { gross: gross[i], afterLine: afterLine[i], share: shares[i], net, tax, total: x };
    }
    const tax = taxOnNet(x, l.taxRatePercent);
    return { gross: gross[i], afterLine: afterLine[i], share: shares[i], net: x, tax, total: x + tax };
  });
  return {
    lines: results,
    subtotal: results.reduce((s, r) => s + r.net, 0),
    discountTotal: lines.reduce((s, l) => s + l.discountPesewas, 0) + overallDiscountPesewas,
    taxTotal: results.reduce((s, r) => s + r.tax, 0),
    total: results.reduce((s, r) => s + r.total, 0)
  };
}

export type PayInput = { method: "CASH" | "MOMO" | "CARD"; amount: number; tendered: number };

/** Checks a split payment against the total and works out the change. Only cash can be handed over in excess. */
export function checkPayments(total: number, pays: PayInput[]): { paid: number; tendered: number; change: number } {
  if (pays.length === 0) throw new BadRequestException("Take at least one payment.");
  let paid = 0;
  let tendered = 0;
  for (const p of pays) {
    if (!Number.isInteger(p.amount) || p.amount <= 0) throw new BadRequestException("Each payment must be more than zero.");
    if (p.tendered < p.amount) throw new BadRequestException("The money handed over cannot be less than the payment.");
    if (p.method !== "CASH" && p.tendered !== p.amount) throw new BadRequestException("Only cash can be handed over in excess: MoMo and card pay the exact amount.");
    paid += p.amount;
    tendered += p.tendered;
  }
  if (paid !== total) throw new BadRequestException(paid < total ? `The payments add up to less than the sale (short by ${((total - paid) / 100).toFixed(2)}).` : `The payments add up to more than the sale (over by ${((paid - total) / 100).toFixed(2)}). Only cash can be over, as change.`);
  return { paid, tendered, change: tendered - paid };
}
