// Excel/Sheets/Numbers all treat a cell starting with =, +, -, or @ as a
// formula regardless of surrounding quotes, so a value like "=cmd|'/c calc'!A1"
// or "=HYPERLINK(...)" opened by staff gets executed — the classic
// CSV/formula-injection pattern. Prefixing a single quote forces the cell to
// be read as text instead of evaluated.
export function sanitizeFormulaCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
