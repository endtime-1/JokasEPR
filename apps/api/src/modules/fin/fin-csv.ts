import { BadRequestException } from "@nestjs/common";

/**
 * Small RFC 4180 CSV reader/writer for the finance imports. Handles quoted fields, commas and
 * line breaks inside quotes, doubled quotes, CRLF/LF, a UTF-8 BOM (Excel), and ; as a delimiter
 * (some regional Excel settings export semicolons).
 */

export const MAX_CSV_ROWS = 5000;

export function parseCsv(text: string): string[][] {
  let src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  src = src.replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (quoted) throw new BadRequestException("The CSV file has an unclosed quote.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are completely empty (blank lines, trailing commas only).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** , or ; (whichever the header line uses more outside quotes). */
function detectDelimiter(src: string): string {
  const firstLine = src.split("\n", 1)[0];
  let commas = 0;
  let semis = 0;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch === ",") commas++;
    else if (!q && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** Reads a CSV into objects keyed by normalised header (lower case, spaces and dashes to underscores). */
export function parseCsvObjects(text: string, aliases: Record<string, string> = {}): { headers: string[]; rows: { line: number; values: Record<string, string> }[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) throw new BadRequestException("The CSV file is empty.");
  if (grid.length - 1 > MAX_CSV_ROWS) throw new BadRequestException(`The CSV file has more than ${MAX_CSV_ROWS} rows. Split it into smaller files.`);
  const headers = grid[0].map((h) => {
    const key = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return aliases[key] ?? key;
  });
  const seen = new Set<string>();
  for (const h of headers) {
    if (h && seen.has(h)) throw new BadRequestException(`The column "${h}" appears twice in the header row.`);
    seen.add(h);
  }
  const rows = grid.slice(1).map((cells, idx) => {
    const values: Record<string, string> = {};
    headers.forEach((h, c) => {
      if (h) values[h] = unguard((cells[c] ?? "").trim());
    });
    return { line: idx + 2, values }; // line 1 is the header
  });
  return { headers, rows };
}

/** Undoes the quote that toCsv() puts in front of a cell starting with = + - @ so an exported file imports back unchanged. */
function unguard(v: string): string {
  return /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
}

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // A cell starting with = + - @ is read by Excel as a formula; prefix a quote so it stays text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const BOM = String.fromCharCode(0xfeff); // lets Excel read the file as UTF-8
  return `${BOM}${[headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
