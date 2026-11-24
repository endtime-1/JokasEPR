/**
 * Live line and document totals for the sales editors. This mirrors the server (fin-sales-math.ts): whole pesewas,
 * BigInt multiplication, half-up rounding, tax worked out per line. The server always recalculates on save, so
 * this only drives what the person sees while typing: the two must agree, which is why the maths is the same.
 */

export type CalcLine = { quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: number | string };
export type CalcResult = { gross: number; discount: number; net: number; tax: number; total: number; valid: boolean };

/** "12.34" -> 1234, or null when not a valid amount with at most `decimals` decimals. */
function scaled(value: string, decimals: number): number | null {
  const t = value.trim();
  if (t === "") return null;
  const re = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!re.test(t)) return null;
  const [w, f = ""] = t.split(".");
  const n = Number(w) * 10 ** decimals + Number((f + "0".repeat(decimals)).slice(0, decimals));
  return Number.isSafeInteger(n) ? n : null;
}

function mulDivHalfUp(value: number, mul: number, div: number): number {
  const num = BigInt(value) * BigInt(mul);
  const d = BigInt(div);
  const neg = num < 0n;
  const abs = neg ? -num : num;
  const q = (2n * abs + d) / (2n * d);
  return Number(neg ? -q : q);
}

export function calcLine(l: CalcLine): CalcResult {
  const qty = scaled(l.quantity, 4);
  const price = scaled(l.unitPrice, 2);
  const pct = l.discountPercent.trim() === "" ? 0 : scaled(l.discountPercent, 2);
  const rate = scaled(String(l.taxRatePercent || "0"), 4);
  if (qty === null || qty <= 0 || price === null || pct === null || pct > 10_000 || rate === null) return { gross: 0, discount: 0, net: 0, tax: 0, total: 0, valid: false };
  const gross = mulDivHalfUp(price, qty, 10_000);
  const discount = mulDivHalfUp(gross, pct, 10_000);
  const net = gross - discount;
  const tax = mulDivHalfUp(net, rate, 1_000_000);
  return { gross, discount, net, tax, total: net + tax, valid: true };
}

export function calcDoc(lines: CalcLine[]) {
  const rows = lines.map(calcLine);
  const subtotal = rows.reduce((s, r) => s + r.gross, 0);
  const discountTotal = rows.reduce((s, r) => s + r.discount, 0);
  const taxTotal = rows.reduce((s, r) => s + r.tax, 0);
  const total = rows.reduce((s, r) => s + r.net, 0) + taxTotal;
  return { rows, subtotal, discountTotal, taxTotal, total, valid: rows.every((r) => r.valid) };
}

/** Whole pesewas to "1,234.50". */
export function fmtPesewas(p: number): string {
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}
