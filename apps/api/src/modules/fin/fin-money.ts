import { BadRequestException } from "@nestjs/common";

/**
 * Finance v2 money handling. All arithmetic is done in whole pesewas (integers),
 * never floats; amounts cross the DB boundary as DECIMAL(15,2) strings.
 */

/** Largest amount a DECIMAL(15,2) column can hold, in pesewas. */
export const MAX_PESEWAS = 999_999_999_999_999; // 9,999,999,999,999.99

type MoneyInput = number | string | { toString(): string } | null | undefined;

/** Parses a money value into whole pesewas. Rejects NaN, more than 2 decimals, and out-of-range values. */
export function toPesewas(value: MoneyInput, field = "amount"): number {
  if (value === null || value === undefined || value === "") return 0;
  const raw = typeof value === "number" ? numberToPlainString(value) : String(value).trim();
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(raw)) throw new BadRequestException(`${field} is not a valid number.`);
  const [whole, frac = ""] = raw.split(".");
  if (frac.replace(/0+$/, "").length > 2) throw new BadRequestException(`${field} can have at most 2 decimal places.`);
  const negative = whole.startsWith("-");
  const pesewas = Number(whole.replace("-", "")) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(pesewas) || pesewas > MAX_PESEWAS) throw new BadRequestException(`${field} is too large.`);
  return negative ? -pesewas : pesewas;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  // Avoid exponent notation and binary noise (e.g. 0.1 + 0.2): 2 decimals is all money has.
  const rounded = Math.round(n * 100) / 100;
  return Math.abs(n - rounded) < 1e-9 ? rounded.toFixed(2) : n.toFixed(6);
}

/** DECIMAL(15,2) string for Prisma, e.g. 12345 -> "123.45". */
export function pesewasToDecimal(p: number): string {
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display number (2 dp) from pesewas. Only for responses; never for arithmetic. */
export function pesewasToNumber(p: number): number {
  return p / 100;
}

/** Reads a Prisma Decimal (or string/number) column as pesewas. */
export function decimalToPesewas(value: MoneyInput): number {
  if (value === null || value === undefined) return 0;
  const s = typeof value === "number" ? value.toFixed(2) : String(value);
  return toPesewas(s);
}
