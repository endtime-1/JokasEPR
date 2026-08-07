// L1: QuickBooks' Query API has no parameterized-query mechanism — it's a
// REST endpoint that takes an SQL-like string, so values are always
// interpolated. Intuit's own escaping rule requires backslashes to be
// escaped *before* quotes; the previous per-service escaping only handled
// quotes, so a value containing a literal backslash immediately before a
// quote (e.g. "\' OR '1'='1") could neutralize the quote-escaping and
// break out of the string literal. Low risk (targets QuickBooks' own data,
// not the local database) but worth doing correctly.
export function escapeQboString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
