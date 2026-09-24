// Builds readable table columns from raw API rows whose shape isn't known up
// front (the generic "SimpleRowsTable" lists in Soya, Feed Production and
// Maintenance). Raw rows carry foreign keys like productionSiteId — showing
// those printed a UUID ("hash code") where the user expected a name. Instead:
//   • a `fooId` column whose row also carries the `foo` relation is shown as
//     that relation's name / batch number / receipt number / code;
//   • other bare ids and audit fields are hidden;
//   • arrays of outputs (oilOutputs, wasteRecords…) show their summed quantity;
//   • ISO timestamps are shown as a date.
// Display values are flattened onto a copy of each row so DataTable's search,
// sort and CSV export all see the readable text. The original fields are kept,
// so edit/delete handlers still get the row's id and raw values.

const HIDDEN = new Set(["id", "companyId", "branchId", "deletedAt", "updatedAt", "createdAt", "metadata", "idempotencyKey", "clientRequestId"]);
const LABEL_FIELDS = ["name", "batchNumber", "receiptNumber", "orderNumber", "referenceNumber", "code", "sku", "fullName", "email"];
const QTY_FIELDS: [string, string][] = [["quantityLitres", "L"], ["quantityKg", "kg"], ["quantity", ""]];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX_COLUMNS = 10;

export type AutoColumn = { key: string; label: string };
export type AutoRow = Record<string, unknown>;

function humanize(key: string) {
  const spaced = key.replace(/Id$/, "").replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function relationLabel(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const first = LABEL_FIELDS.find((field) => record[field] != null && record[field] !== "");
  if (!first) return null;
  // "Main Mill (MILL-01)" reads better than either alone when both exist.
  const label = String(record[first]);
  return first === "name" && record.code ? `${label} (${record.code})` : label;
}

function arraySummary(value: unknown[]): string | null {
  if (value.length === 0) return "-";
  const sample = value[0];
  if (!sample || typeof sample !== "object") return null;
  const qty = QTY_FIELDS.find(([field]) => field in (sample as Record<string, unknown>));
  if (!qty) return null;
  const total = value.reduce<number>((sum, item) => sum + (Number((item as Record<string, unknown>)[qty[0]]) || 0), 0);
  return `${total.toLocaleString("en-GH", { maximumFractionDigits: 2 })}${qty[1] ? ` ${qty[1]}` : ""}`;
}

function scalar(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  if (ISO_DATE.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return text.replace(/_/g, " ").slice(0, 90);
}

export function buildAutoColumns(rows: AutoRow[]): { rows: AutoRow[]; columns: AutoColumn[] } {
  const sample = rows[0];
  if (!sample) return { rows, columns: [] };

  type Plan = { key: string; label: string; value: (row: AutoRow) => string };
  const plans: Plan[] = [];
  const consumed = new Set<string>();

  for (const key of Object.keys(sample)) {
    if (HIDDEN.has(key) || consumed.has(key)) continue;
    if (key.endsWith("Id")) {
      const relation = key.slice(0, -2);
      // Only show the id when the row carries its relation to name it with;
      // a bare createdById / uomId etc. would just be another UUID.
      if (rows.some((row) => relationLabel(row[relation]) !== null)) {
        consumed.add(relation);
        plans.push({ key: `__${relation}`, label: humanize(relation), value: (row) => relationLabel(row[relation]) ?? "-" });
      }
      continue;
    }
    const value = sample[key];
    if (Array.isArray(value)) {
      if (arraySummary(value) !== null || rows.some((row) => Array.isArray(row[key]) && (row[key] as unknown[]).length > 0 && arraySummary(row[key] as unknown[]) !== null)) {
        plans.push({ key: `__${key}`, label: humanize(key), value: (row) => (Array.isArray(row[key]) ? arraySummary(row[key] as unknown[]) ?? "-" : "-") });
      }
      continue;
    }
    if (value !== null && typeof value === "object") {
      if (`${key}Id` in sample) continue; // named via its fooId column above
      // A relation object without a matching fooId column (e.g. an included
      // parent) — show its label if it has one, never raw JSON.
      if (relationLabel(value) !== null) plans.push({ key: `__${key}`, label: humanize(key), value: (row) => relationLabel(row[key]) ?? "-" });
      continue;
    }
    plans.push({ key: `__${key}`, label: humanize(key), value: (row) => scalar(row[key]) });
  }

  const chosen = plans.slice(0, MAX_COLUMNS);
  const displayRows = rows.map((row) => {
    const copy: AutoRow = { ...row };
    for (const plan of chosen) copy[plan.key] = plan.value(row);
    return copy;
  });
  return { rows: displayRows, columns: chosen.map(({ key, label }) => ({ key, label })) };
}
