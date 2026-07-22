const DATE_COLS = new Set([
  "recordDate",
  "startDate",
  "vaccinationDate",
  "observationDate",
  "costDate",
  "transferDate",
]);

export function formatDate(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatCell(col: string, value: unknown, maxLen = 50): string {
  if (DATE_COLS.has(col)) return formatDate(value);
  if (value == null) return "—";
  return String(value).slice(0, maxLen);
}
