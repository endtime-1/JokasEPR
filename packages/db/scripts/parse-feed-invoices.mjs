// Parses the QuickBooks feed-invoice export (mill → farm deliveries) into a
// clean JSON the feed-receipt importer consumes.
//
//   node packages/db/scripts/parse-feed-invoices.mjs --src esaso-april-report.xlsx --out feed-import-data.json
//
// Needs `xlsx` on the machine that runs it (dev box, not the VPS).
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith("--") ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const SRC = args.src || "esaso-april-report.xlsx";
const OUT = args.out || "feed-import-data.json";
const KG_PER_BAG = Number(args["kg-per-bag"] || 50);

const num = (v) => { const s = String(v ?? "").replace(/[,$]/g, "").trim(); const n = parseFloat(s); return Number.isNaN(n) ? 0 : n; };
const parseUsDate = (s) => {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(Date.UTC(yr, +m[1] - 1, +m[2])).toISOString().slice(0, 10);
};

const wb = XLSX.readFile(SRC, { cellDates: false });
const sheet = wb.SheetNames.find((s) => /sheet1|transaction|detail/i.test(s)) || wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: "" });

const hdr = rows.find((r) => r.some((c) => /^type$/i.test(String(c).trim()))) || rows[0];
const H = hdr.map((c) => String(c).trim().toLowerCase());
const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
const C = {
  type: col("type"), date: col("date"), num: col("num"),
  name: col("name"), item: col("item"), qty: col("qty", "quantity"),
  um: col("u/m", "um"), price: col("sales price", "price"), amount: col("amount"),
};

const lines = [];
const itemTotals = {};
for (const r of rows) {
  if (String(r[C.type] ?? "").trim() !== "Invoice") continue;
  const date = parseUsDate(r[C.date]);
  const rawItem = String(r[C.item] ?? "").trim();
  if (!date || !rawItem) continue;
  const bags = num(r[C.qty]);
  const item = rawItem.replace(/^Finished Feed:/i, "");        // "Mash:Layer 1 Mash 001-26"
  const shortName = item.replace(/^(Mash|Concentrates?):/i, ""); // "Layer 1 Mash 001-26"
  const feedForm = /concentrate/i.test(item) ? "CONCENTRATE" : "MASH";
  const line = {
    date,
    invoiceNo: String(r[C.num] ?? "").trim(),
    qbItem: rawItem,
    name: shortName,
    feedForm,
    bags,
    kg: Math.round(bags * KG_PER_BAG * 10000) / 10000,
    unitPricePerBag: num(r[C.price]),
    amount: num(r[C.amount]),
  };
  lines.push(line);
  const k = shortName;
  itemTotals[k] = itemTotals[k] || { qbItem: rawItem, feedForm, lines: 0, bags: 0, kg: 0, amount: 0 };
  itemTotals[k].lines++; itemTotals[k].bags += bags; itemTotals[k].kg += line.kg; itemTotals[k].amount += line.amount;
}

lines.sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo));
const out = {
  generatedAt: new Date().toISOString(),
  source: SRC, kgPerBag: KG_PER_BAG,
  firstDate: lines[0]?.date, lastDate: lines[lines.length - 1]?.date,
  totalLines: lines.length,
  totalBags: lines.reduce((s, l) => s + l.bags, 0),
  totalKg: Math.round(lines.reduce((s, l) => s + l.kg, 0) * 10000) / 10000,
  totalAmount: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
  items: itemTotals,
  lines,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log(`wrote ${OUT}`);
console.log(`${out.totalLines} lines · ${out.firstDate}..${out.lastDate} · ${out.totalBags} bags · ${out.totalKg} kg · GHS ${out.totalAmount}`);
console.log("\nDISTINCT FEED ITEMS (map each to a system product):");
for (const [name, t] of Object.entries(itemTotals)) {
  console.log(`  ${name.padEnd(30)} [${t.feedForm}]  ${String(t.lines).padStart(3)} lines  ${String(t.bags).padStart(6)} bags  ${String(t.kg).padStart(9)} kg  GHS ${t.amount.toFixed(2)}`);
}
