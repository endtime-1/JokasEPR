import { BadRequestException } from "@nestjs/common";
import { mulDivHalfUp, taxOnNet } from "./fin-tax-math";
import { toPesewas } from "./fin-money";

/**
 * Sales document arithmetic, in whole pesewas, exact for every size a DECIMAL(15,2) can hold.
 *
 *   gross    = quantity x unit price                       (half-up to the pesewa)
 *   discount = gross x discount %                          (half-up)
 *   net      = gross - discount
 *   tax      = net x tax rate                              (half-up, PER LINE)
 *   total    = net + tax
 *
 * A document's totals are the plain sums of its lines, so a posted entry can always be re-derived.
 */

export type LineMoneyInput = {
  quantity: string | number;
  unitPrice: string | number;
  discountPercent?: string | number | null;
  taxRatePercent?: string | number | { toString(): string } | null;
};

export type LineMoney = { gross: number; discount: number; net: number; tax: number; total: number };

/** "2.5" -> 25000 (ten-thousandths). Quantities have at most 4 decimals and must be above zero. */
export function parseQuantity(value: string | number, field = "quantity"): number {
  const s = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(s)) throw new BadRequestException(`The ${field} must be a number above zero with at most 4 decimals.`);
  const [w, f = ""] = s.split(".");
  const q = Number(w) * 10_000 + Number((f + "0000").slice(0, 4));
  if (!Number.isSafeInteger(q) || q <= 0) throw new BadRequestException(`The ${field} must be above zero.`);
  if (q > 999_999_999_999) throw new BadRequestException(`The ${field} is too large.`);
  return q;
}

/** "12.5" -> 1250 (hundredths of a percent), 0 to 100 with at most 2 decimals. */
export function parsePercent(value: string | number | null | undefined, field = "discount"): number {
  if (value === null || value === undefined || value === "") return 0;
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new BadRequestException(`The ${field} must be a percentage from 0 to 100 with at most 2 decimals.`);
  const [w, f = ""] = s.split(".");
  const p = Number(w) * 100 + Number((f + "00").slice(0, 2));
  if (p > 10_000) throw new BadRequestException(`The ${field} cannot be more than 100%.`);
  return p;
}

export function computeLine(l: LineMoneyInput): LineMoney {
  const qty = parseQuantity(l.quantity);
  const price = toPesewas(l.unitPrice, "The unit price");
  if (price < 0) throw new BadRequestException("The unit price cannot be negative.");
  const gross = mulDivHalfUp(price, qty, 10_000);
  const discount = mulDivHalfUp(gross, parsePercent(l.discountPercent), 10_000);
  const net = gross - discount;
  const rate = l.taxRatePercent === null || l.taxRatePercent === undefined ? "0" : String(l.taxRatePercent);
  const tax = taxOnNet(net, rate);
  return { gross, discount, net, tax, total: net + tax };
}

export type DocTotals = { subtotal: number; discountTotal: number; taxTotal: number; total: number };

export function sumLines(lines: { gross: number; discount: number; tax: number; net: number }[]): DocTotals {
  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const taxTotal = lines.reduce((s, l) => s + l.tax, 0);
  const net = lines.reduce((s, l) => s + l.net, 0);
  return { subtotal, discountTotal, taxTotal, total: net + taxTotal };
}

/** Calendar maths for recurring invoices. n = how many periods after the start (0 = the start date itself). */
export function nthOccurrence(start: Date, frequency: "WEEKLY" | "MONTHLY", n: number): Date {
  if (frequency === "WEEKLY") return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7 * n));
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)));
}

export function addDays(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / 86_400_000);
}
