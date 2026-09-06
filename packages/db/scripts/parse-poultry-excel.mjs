// Parses the four farm Excel workbooks (Adubofour House.xlsx, Dufie House.xlsx,
// Simon.xlsx, Total.xlsx) into a single importer-ready JSON file.
//
// The workbooks are NOT in git (root .gitignore covers *.xlsx). Drop them in
// the directory you pass as --src (default: repo root) and run:
//
//   node packages/db/scripts/parse-poultry-excel.mjs --src . --out poultry-import-data.json
//
// Needs the `xlsx` package on the machine that runs it (dev box, not the VPS):
//   pnpm add -w -D xlsx
//
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith("--") ? [...a, [x.slice(2), arr[i + 1]]] : a), []),
);
const SRC = args.src || ".";
const OUT = args.out || "poultry-import-data.json";
const CUTOFF = new Date((args.through || "2026-09-06") + "T00:00:00Z"); // ignore future template rows

const HOUSES = { "Adubofour House.xlsx": "Adubofour", "Dufie House.xlsx": "Dufie", "Simon.xlsx": "Simon" };

const num = (v) => {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").replace(/"/g, "").trim();
  if (s === "" || s === "-" || s === "–") return 0;
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const parseDate = (s) => {
  const m = String(s || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m || MONTHS[m[2].toLowerCase()] == null) return null;
  return new Date(Date.UTC(2000 + +m[3], MONTHS[m[2].toLowerCase()], +m[1]));
};
const iso = (d) => d.toISOString().slice(0, 10);

const out = { generatedAt: new Date().toISOString(), through: iso(CUTOFF), houses: {} };

for (const [file, house] of Object.entries(HOUSES)) {
  const wb = XLSX.readFile(path.join(SRC, file), { cellDates: false });
  out.houses[house] = { rooms: {} };
  for (const sn of wb.SheetNames) {
    if (/total/i.test(sn)) continue; // house TOTAL sheet is a rollup; rooms are the truth
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: "" });
    const room = sn.replace(/\s+/g, "");
    const daily = [];
    let openingStock = 0;
    let openingDate = null;
    for (const r of rows) {
      const d0 = String(r[0] || "").trim();
      if (/WKL\s*REP/i.test(d0)) continue;
      const date = parseDate(d0);
      if (!date || date > CUTOFF) continue;
      const rec = {
        date: iso(date),
        age: num(r[1]),
        oStock: num(r[2]),
        cull: num(r[3]),
        mortality: num(r[4]),
        trnsfOut: num(r[5]),
        trnsfIn: num(r[6]),
        cStock: num(r[7]),
        eggs: num(r[11]),
        actualWt: num(r[17]),
        med: String(r[18] || "").trim(),
        remark: String(r[19] || "").trim(),
      };
      // opening = the first day this room holds birds, via O'Stock or first trnsfIn
      if (!openingDate && (rec.oStock > 0 || rec.trnsfIn > 0)) {
        openingDate = rec.date;
        openingStock = rec.oStock > 0 ? rec.oStock : rec.trnsfIn;
      }
      daily.push(rec);
    }
    // collapse consecutive same-name medication rows into courses
    const medCourses = [];
    let cur = null;
    for (const rec of daily) {
      const name = rec.med && rec.med !== "-" && rec.med !== "=" ? rec.med : null;
      if (name && cur && cur.name.toLowerCase() === name.toLowerCase() && daysBetween(cur.end, rec.date) <= 1) {
        cur.end = rec.date;
      } else {
        if (cur) medCourses.push(cur);
        cur = name ? { name, start: rec.date, end: rec.date } : null;
      }
    }
    if (cur) medCourses.push(cur);

    out.houses[house].rooms[room] = {
      openingDate,
      openingStock,
      firstDate: daily[0]?.date ?? null,
      lastDate: daily[daily.length - 1]?.date ?? null,
      totals: {
        mortality: sum(daily, "mortality"),
        cull: sum(daily, "cull"),
        trnsfIn: sum(daily, "trnsfIn"),
        trnsfOut: sum(daily, "trnsfOut"),
        eggs: sum(daily, "eggs"),
        lastCStock: [...daily].reverse().find((x) => x.cStock)?.cStock ?? 0,
      },
      mortalityDays: daily.filter((x) => x.mortality > 0).map((x) => ({ date: x.date, count: x.mortality, remark: x.remark || undefined })),
      cullDays: daily.filter((x) => x.cull > 0).map((x) => ({ date: x.date, count: x.cull, remark: x.remark || undefined })),
      eggDays: daily.filter((x) => x.eggs > 0).map((x) => ({ date: x.date, count: x.eggs })),
      transfers: daily.filter((x) => x.trnsfIn > 0 || x.trnsfOut > 0).map((x) => ({ date: x.date, in: x.trnsfIn, out: x.trnsfOut, remark: x.remark || undefined, med: x.med || undefined })),
      weightDays: daily.filter((x) => x.actualWt > 0).map((x) => ({ date: x.date, avgKg: x.actualWt, age: x.age })),
      medCourses,
    };
  }
}

function sum(arr, k) { return arr.reduce((s, x) => s + x[k], 0); }
function daysBetween(a, b) { return Math.abs((new Date(b) - new Date(a)) / 86400000); }

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("wrote " + OUT);
for (const [h, hd] of Object.entries(out.houses)) {
  console.log("\n" + h);
  for (const [room, rd] of Object.entries(hd.rooms)) {
    console.log(`  ${room}: open ${rd.openingStock}@${rd.openingDate}  mort ${rd.totals.mortality}  tIn ${rd.totals.trnsfIn}  tOut ${rd.totals.trnsfOut}  eggs ${rd.totals.eggs}  lastC'Stock ${rd.totals.lastCStock}  medCourses ${rd.medCourses.length}`);
  }
}
