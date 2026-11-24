import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { MAX_CSV_ROWS, parseCsv } from "./fin-csv";
import { pesewasToDecimal, toPesewas } from "./fin-money";

/**
 * Reads bank and mobile-money statements. Banks all export differently, so the user maps the columns once; this file turns
 * whatever they hold (day-first dates, Excel serial numbers, "1,234.50", "(500.00)", "250.00 DR") into clean, signed lines.
 */

export type Mapping = {
  date: number;
  description: number;
  reference?: number;
  amount?: number;
  moneyIn?: number;
  moneyOut?: number;
  balance?: number;
  dateOrder?: "DMY" | "MDY" | "YMD";
  hasHeader?: boolean;
};

export type ParsedLine = {
  lineNo: number; // line in the file, 1-based, as a person would count it
  date: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amountPesewas: number; // money in positive, money out negative
  balancePesewas: number | null;
  fingerprint: string;
};

export type ParseResult = { lines: ParsedLine[]; errors: { lineNo: number; message: string }[]; skipped: number };

// ─── reading the file ────────────────────────────────────────────────────────

/** Turns an uploaded file (CSV text or an Excel workbook) into rows of text. */
export async function readGrid(input: { csv?: string; fileBase64?: string }): Promise<string[][]> {
  if (input.csv && input.csv.trim()) return parseCsv(input.csv);
  if (!input.fileBase64) throw new BadRequestException("Upload a CSV or Excel file.");
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length === 0) throw new BadRequestException("The file is empty.");
  if (buffer.length > 3_000_000) throw new BadRequestException("That file is larger than 3 MB. Split it into smaller files.");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException("That does not look like an Excel (.xlsx) file. Save the statement as .xlsx or .csv and try again.");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new BadRequestException("The workbook has no sheets.");
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, row.actualCellCount); c++) cells.push(cellText(row.getCell(c).value));
    if (cells.some((x) => x.trim() !== "")) rows.push(cells);
  });
  if (rows.length > MAX_CSV_ROWS + 1) throw new BadRequestException(`The file has more than ${MAX_CSV_ROWS} rows. Split it into smaller files.`);
  return rows;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return String(o.text);
    return "";
  }
  return String(v);
}

// ─── cells ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** A date from a statement cell, or null. Ambiguous dates like 03/04/2026 are read day-first (the Ghana convention) unless told otherwise. */
export function parseDateCell(raw: string, order?: "DMY" | "MDY" | "YMD"): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Excel serial number (days since 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3)];
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return mon ? iso(y, mon, Number(m[1])) : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (order === "MDY") return iso(y, a, b);
    if (order === "DMY" || order === undefined) {
      if (a > 12) return iso(y, b, a); // cannot be a month: it is the day
      if (order === undefined && b > 12) return iso(y, a, b); // second part cannot be a month: month-first
      return iso(y, b, a);
    }
    return null;
  }
  return null;
}

/** An amount from a statement cell, in pesewas (sign kept), or null when blank. Throws on junk. */
export function parseAmountCell(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(DR|D)\s*$/i.test(s)) {
    negative = true;
    s = s.replace(/\s*(DR|D)\s*$/i, "");
  } else if (/\b(CR|C)\s*$/i.test(s)) {
    s = s.replace(/\s*(CR|C)\s*$/i, "");
  }
  s = s.replace(/GH[S₵]|₵|¢|GHC/gi, "").replace(/\s+/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?$/.test(s)) throw new BadRequestException(`"${raw}" is not an amount.`);
  const p = toPesewas(s.endsWith(".") ? s.slice(0, -1) : s, "The amount");
  return negative ? -p : p;
}

const normText = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ─── the whole statement ─────────────────────────────────────────────────────

export function parseStatement(grid: string[][], m: Mapping): ParseResult {
  if (m.amount === undefined && m.moneyIn === undefined && m.moneyOut === undefined) throw new BadRequestException("Say which column holds the amount, or the money-in and money-out columns.");
  const hasHeader = m.hasHeader !== false;
  const start = hasHeader ? 1 : 0;
  const lines: ParsedLine[] = [];
  const errors: { lineNo: number; message: string }[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();

  for (let i = start; i < grid.length; i++) {
    const row = grid[i];
    const lineNo = i + 1;
    const cell = (c: number | undefined) => (c === undefined ? "" : (row[c] ?? "").trim());
    const dateText = cell(m.date);
    const amountTexts = [cell(m.amount), cell(m.moneyIn), cell(m.moneyOut)];
    if (!dateText && amountTexts.every((t) => !t)) {
      skipped++; // a blank or heading-only line
      continue;
    }
    try {
      const date = parseDateCell(dateText, m.dateOrder);
      if (!date) throw new BadRequestException(dateText ? `"${dateText}" is not a date I can read.` : "The date is missing.");
      let amount: number;
      if (m.amount !== undefined) {
        const a = parseAmountCell(cell(m.amount));
        if (a === null) throw new BadRequestException("The amount is missing.");
        amount = a;
      } else {
        const inn = m.moneyIn !== undefined ? parseAmountCell(cell(m.moneyIn)) : null;
        const out = m.moneyOut !== undefined ? parseAmountCell(cell(m.moneyOut)) : null;
        if (inn === null && out === null) throw new BadRequestException("Both the money-in and money-out amounts are empty.");
        amount = Math.abs(inn ?? 0) - Math.abs(out ?? 0);
      }
      if (amount === 0) {
        skipped++;
        continue;
      }
      const description = cell(m.description) || "(no description)";
      const reference = cell(m.reference) || null;
      const balance = m.balance !== undefined && cell(m.balance) ? parseAmountCell(cell(m.balance)) : null;
      // Two genuinely identical lines on one day are legitimate; the occurrence number keeps them apart, and keeps a re-import identical.
      const key = `${date}|${amount}|${normText(description)}|${reference ? normText(reference) : ""}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      lines.push({ lineNo, date, description: description.slice(0, 300), reference: reference ? reference.slice(0, 100) : null, amountPesewas: amount, balancePesewas: balance, fingerprint: createHash("sha256").update(`${key}|${n}`).digest("hex") });
    } catch (e) {
      errors.push({ lineNo, message: e instanceof Error ? e.message : "Could not read this line." });
    }
  }
  return { lines, errors, skipped };
}

/** Guesses the column numbers from a header row, so the mapping screen starts filled in. */
export function guessMapping(header: string[]): Partial<Mapping> {
  const find = (...words: RegExp[]) => header.findIndex((h) => words.some((w) => w.test(h.trim().toLowerCase())));
  const out: Partial<Mapping> = {};
  const date = find(/^date/, /txn date|trans.*date|value date|posting date/);
  const desc = find(/narrat/, /descri/, /details/, /particulars/, /remarks/, /memo/);
  const ref = find(/^ref/, /reference/, /cheque/, /transaction id|trans.*id|txn id/);
  const amount = find(/^amount$/, /^amt$/);
  const inn = find(/credit/, /money in/, /deposit/, /paid in/, /received/);
  const outt = find(/debit/, /money out/, /withdraw/, /paid out/);
  const bal = find(/balance/);
  if (date >= 0) out.date = date;
  if (desc >= 0) out.description = desc;
  if (ref >= 0 && ref !== desc) out.reference = ref;
  if (amount >= 0) out.amount = amount;
  else {
    if (inn >= 0) out.moneyIn = inn;
    if (outt >= 0) out.moneyOut = outt;
  }
  if (bal >= 0) out.balance = bal;
  return out;
}

export const asDecimal = pesewasToDecimal;
