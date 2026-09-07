/*
 * ONE-TIME: replace the test/placeholder poultry records in Batch 001 & 002
 * with the real farm data from the Excel workbooks.
 *
 *   node packages/db/scripts/parse-poultry-excel.mjs --src . --out poultry-import-data.json   # on a box with the .xlsx files + `xlsx`
 *   node packages/db/scripts/import-poultry-excel.mjs --data poultry-import-data.json           # DRY RUN — writes nothing
 *   node packages/db/scripts/import-poultry-excel.mjs --data poultry-import-data.json --commit --i-have-a-backup
 *
 * Flags:
 *   --data <path>          required — output of parse-poultry-excel.mjs
 *   --commit               actually write (default: dry run)
 *   --i-have-a-backup      required alongside --commit (guard)
 *   --egg-unit crates|pieces   how to credit eggs to the egg store (default: crates = pieces / 30)
 *   --egg-from YYYY-MM-DD   only credit eggs on/after this date to inventory (records still created for all days)
 *
 * KEEPS untouched: FeedConsumptionRecord, FeedReceiptRecord.
 * WIPES (hard delete, both batches): mortality, eggs, bird weights, medication,
 *   vaccination, transfers, health observations, daily poultry records, count
 *   adjustments, cost records, pen allocations — plus any inventory this batch's
 *   egg records had credited (StockMovement/StockBatch/InventoryItem).
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const A = process.argv.slice(2);
const flag = (n) => A.includes("--" + n);
const opt = (n, d) => { const i = A.indexOf("--" + n); return i >= 0 ? A[i + 1] : d; };

const DATA_PATH = opt("data");
const COMMIT = flag("commit");
const EGG_UNIT = opt("egg-unit", "crates");
const EGG_FROM = opt("egg-from", null);
const EGGS_PER_CRATE = 30;

if (!DATA_PATH) { console.error("--data <poultry-import-data.json> is required"); process.exit(1); }
if (COMMIT && !flag("i-have-a-backup")) { console.error("Refusing to --commit without --i-have-a-backup. Run infra/vps/backup.sh first."); process.exit(1); }
if (!["crates", "pieces"].includes(EGG_UNIT)) { console.error("--egg-unit must be crates or pieces"); process.exit(1); }

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const THROUGH = data.through;

// ── expected anchors (from inspect-poultry-state.mjs) ────────────────────────
const EXPECT = {
  company: "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1",
  branch: "6dae3b77-897f-42b1-af1d-cf3e223dc917",
  farm: "ec1cea6b-40d7-4741-abb0-67ef687f251c",
};

// Excel house name → DB PoultryHouse.name
const HOUSE_NAMES = { Adubofour: "Adubofour", Dufie: "Dufie", Simon: "Simon" };
// Excel "RoomN" → pen penNumber
const roomNo = (room) => parseInt(String(room).replace(/\D/g, ""), 10);

// Batch 1 spans Adubofour+Dufie; Batch 2 is Simon.
// `openings` = the genuine placement(s). The farm logged these in the Trsf-In
// column with no counterparty (Adubofour) or the O'Stock column (Simon), so
// they can't be inferred reliably — they're pinned here. Their sum must equal
// the batch's openingBirdCount.
const BATCHES = [
  {
    code: "001", label: "Batch 1", excelHouses: ["Adubofour", "Dufie"], primaryHouse: "Adubofour",
    birdType: "LAYERS", startDate: "2026-04-03",
    openings: [
      { xh: "Adubofour", room: "Room2", date: "2026-04-03", birds: 5760 },
      { xh: "Adubofour", room: "Room3", date: "2026-04-03", birds: 5760 },
    ],
  },
  {
    code: "002", label: "Batch 2", excelHouses: ["Simon"], primaryHouse: "Simon",
    birdType: "LAYERS", startDate: "2026-07-18",
    openings: [
      { xh: "Simon", room: "Room2", date: "2026-07-18", birds: 5670 },
      { xh: "Simon", room: "Room3", date: "2026-07-18", birds: 5580 },
    ],
  },
];

// ── medication / vaccination classification (my call — review this table) ────
const VACCINE_KEYS = [
  "lasota", "gumboro intermediate", "gumboro intermediate plus", "ma5+clone 30", "ma5 clone 30",
  "fowl pox vaccination", "fowl pox vaccine", "nd+ib+eds", "newcavac", "newcastle",
];
const SKIP_KEYS = ["recount", "-", "=", "1089", "", "culling of smaller birds"];
const NAME_FIX = {
  "3 -sulpha": "3-Sulpha", "3-sulpha": "3-Sulpha", "3-supha": "3-Sulpha",
  "pentstrep": "Penstrep", "penstrep": "Penstrep",
  "amprolilium": "Amprolium", "ampro": "Amprolium", "amprolium": "Amprolium",
  "tolturazuri": "Toltrazuril", "tolturazuril": "Toltrazuril",
  "vitatimin": "Vitamin", "vtamin": "Vitamin", "vitamin": "Vitamin",
  "franceryl": "Francyrel", "francyrel": "Francyrel",
  "enro 20%": "Enrovet", "enrovet": "Enrovet",
  "king herb": "King Herb", "sulphur": "Sulphur", "levamisole": "Levamisole",
  "neodox": "Neodox", "albendazole": "Albendazole", "glucose": "Glucose",
  "ma5+clone 30": "Ma5 + Clone 30", "gumboro intermediate": "Gumboro Intermediate",
  "lasota": "Lasota", "fowl pox vaccination": "Fowl Pox", "fowl pox vaccine": "Fowl Pox",
  "nd+ib+eds": "ND + IB + EDS", "newcavac": "Newcavac",
  "tylonoemycin, vitamin, amprolium": "Tylosin + Vitamin + Amprolium",
};
const classifyMed = (raw) => {
  const k = String(raw || "").trim().toLowerCase();
  if (SKIP_KEYS.includes(k)) return null;
  const name = NAME_FIX[k] || (raw.trim()[0].toUpperCase() + raw.trim().slice(1));
  const isVaccine = VACCINE_KEYS.some((v) => k.includes(v));
  return { name, kind: isVaccine ? "vaccine" : "medication" };
};

const iso = (s) => new Date(s + "T00:00:00.000Z");
const money = (n) => Math.round(n * 10000) / 10000;
const dayDiff = (a, b) => Math.abs((iso(a) - iso(b)) / 86400000);
// the Remarks column doubles as a scratch cell for recount closing figures
// ("1,076") — keep only actual notes.
const note = (s) => { const t = String(s || "").trim(); return !t || /^[\d.,]+$/.test(t) ? null : t.slice(0, 480); };

// ── transfer matcher ────────────────────────────────────────────────────────
// Every Trsf-Out is paired with a Trsf-In elsewhere in the batch within a
// 3-day window (nearest date first), producing pen→pen transfer records.
// Whatever won't pair (the sheet's "Recount" correction days) becomes a small
// count adjustment on that pen/date. `openingKeys` is the set of
// "<penId>|<date>" in-events that are the genuine placement, not a move.
function buildMovements(rooms, openingKeys) {
  const outs = [], ins = [];
  for (const r of rooms) for (const t of r.transfers) {
    if (t.out > 0) outs.push({ date: t.date, qty: t.out, penId: r.penId, houseId: r.houseId, label: r.label });
    if (t.in > 0 && !openingKeys.has(`${r.penId}|${t.date}`)) ins.push({ date: t.date, qty: t.in, penId: r.penId, houseId: r.houseId, label: r.label });
  }
  outs.sort((a, b) => a.date.localeCompare(b.date));
  ins.sort((a, b) => a.date.localeCompare(b.date));
  const transfers = [], adjustments = [];
  for (const inn of ins) {
    let need = inn.qty;
    while (need > 0) {
      const cand = outs.filter((o) => o.qty > 0 && dayDiff(o.date, inn.date) <= 3)
        .sort((a, b) => dayDiff(a.date, inn.date) - dayDiff(b.date, inn.date) || a.date.localeCompare(b.date));
      if (!cand.length) break;
      const o = cand[0];
      const take = Math.min(need, o.qty);
      transfers.push({ date: inn.date, qty: take, fromPenId: o.penId, fromHouseId: o.houseId, toPenId: inn.penId, toHouseId: inn.houseId, note: `${o.label} → ${inn.label}` });
      o.qty -= take; need -= take;
    }
    if (need > 0) adjustments.push({ date: inn.date, penId: inn.penId, houseId: inn.houseId, delta: need, label: inn.label, kind: "unmatched-in" });
  }
  for (const o of outs) if (o.qty > 0) adjustments.push({ date: o.date, penId: o.penId, houseId: o.houseId, delta: -o.qty, label: o.label, kind: "unmatched-out" });
  return { transfers, adjustments };
}

async function main() {
  console.log(`\n${"=".repeat(70)}\n  POULTRY EXCEL IMPORT  —  ${COMMIT ? "!!! COMMIT MODE (writing) !!!" : "dry run (no writes)"}`);
  console.log(`  data: ${DATA_PATH}   through: ${THROUGH}   egg-unit: ${EGG_UNIT}${EGG_FROM ? `   egg-from: ${EGG_FROM}` : ""}\n${"=".repeat(70)}`);

  // resolve + validate anchors
  const company = await prisma.company.findFirst();
  if (company.id !== EXPECT.company) console.warn(`  ! company ${company.id} != expected ${EXPECT.company}`);
  const houses = await prisma.poultryHouse.findMany({
    where: { name: { in: Object.values(HOUSE_NAMES) }, deletedAt: null },
    select: { id: true, name: true, branchId: true, farmId: true, pens: { where: { deletedAt: null }, select: { id: true, penNumber: true } } },
  });
  const houseByName = {};
  for (const [xls, dbName] of Object.entries(HOUSE_NAMES)) {
    const h = houses.find((x) => x.name.trim() === dbName);
    if (!h) throw new Error(`house "${dbName}" not found`);
    const penByNo = {};
    for (const p of h.pens) penByNo[p.penNumber] = p.id;
    for (let n = 1; n <= 5; n++) if (!penByNo[n]) throw new Error(`${dbName} missing pen #${n}`);
    houseByName[xls] = { id: h.id, branchId: h.branchId, farmId: h.farmId, penByNo };
  }

  const eggStore = await prisma.warehouse.findFirst({ where: { type: "EGG_STORE", farmId: EXPECT.farm, deletedAt: null } });
  if (!eggStore) throw new Error("no EGG_STORE warehouse on the farm");
  const eggProduct = await prisma.product.findFirst({ where: { sku: "EG" }, select: { id: true, name: true, uomId: true, piecesPerUnit: true } });
  if (!eggProduct) throw new Error('no egg product (sku "EG")');
  console.log(`  egg store: ${eggStore.name} (${eggStore.id})`);
  console.log(`  egg product: ${eggProduct.name}  uom-pieces/unit=${eggProduct.piecesPerUnit}\n`);

  // just for createdById traceability (nullable) — the first-seeded user
  const adminUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  const CREATED_BY = adminUser?.id ?? null;
  console.log(`  createdBy: ${adminUser?.email ?? "(null)"}\n`);

  // hard-deleted and rebuilt from the sheet. DailyPoultryRecord (the mobile
  // daily-entry screen's own log) is included — it's test data for these
  // batches and its stale openingBirdCount would mislead the daily-entry
  // prefill. The authoritative feed history (FeedConsumptionRecord) is KEPT.
  const WIPE_MODELS = [
    "mortalityRecord", "eggProductionRecord", "birdWeightRecord", "medicationRecord",
    "vaccinationRecord", "poultryTransferRecord", "poultryHealthObservation",
    "poultryCountAdjustment", "poultryCostRecord", "dailyPoultryRecord", "batchPenAllocation",
  ];

  const plan = { deletes: {}, creates: {}, warnings: [], reconcile: [] };

  for (const B of BATCHES) {
    const batch = await prisma.flockBatch.findFirst({ where: { companyId: EXPECT.company, code: B.code }, select: { id: true, code: true, name: true, birdType: true, startDate: true, openingBirdCount: true, branchId: true, farmId: true } });
    if (!batch) throw new Error(`batch ${B.code} not found`);
    const branchId = batch.branchId, farmId = batch.farmId;
    console.log(`\n  resolved ${B.label}: "${batch.name}" (${batch.id})  birdType=${batch.birdType} start=${batch.startDate.toISOString().slice(0, 10)} opening=${batch.openingBirdCount}`);
    console.log(`     houses: ${B.excelHouses.map((h) => `${h}=${houseByName[h].id}`).join("  ")}`);
    const pinnedOpen = B.openings.reduce((s, o) => s + o.birds, 0);
    if (batch.openingBirdCount !== pinnedOpen) plan.warnings.push(`${B.label} openingBirdCount ${batch.openingBirdCount} != pinned opening sum ${pinnedOpen}`);

    // ---- rooms for this batch ----
    const rooms = [];
    for (const xh of B.excelHouses) {
      const hd = data.houses[xh];
      const H = houseByName[xh];
      for (const [roomLabel, rd] of Object.entries(hd.rooms)) {
        rooms.push({
          xh, roomLabel, label: `${xh}/${roomLabel}`, houseId: H.id, penId: H.penByNo[roomNo(roomLabel)],
          transfers: rd.transfers, mortalityDays: rd.mortalityDays, cullDays: rd.cullDays,
          eggDays: rd.eggDays, weightDays: rd.weightDays, medCourses: rd.medCourses,
          lastCStock: rd.totals.lastCStock,
        });
      }
    }

    // ---- deletes ----
    plan.deletes[B.code] = {};
    for (const m of WIPE_MODELS) {
      const n = await prisma[m].count({ where: { flockBatchId: batch.id } });
      plan.deletes[B.code][m] = n;
    }
    // egg inventory this batch credited
    const eggRecIds = (await prisma.eggProductionRecord.findMany({ where: { flockBatchId: batch.id }, select: { id: true } })).map((r) => r.id);
    const eggMoves = eggRecIds.length ? await prisma.stockMovement.count({ where: { referenceType: "EggProductionRecord", referenceId: { in: eggRecIds } } }) : 0;
    plan.deletes[B.code]._eggStockMovements = eggMoves;
    const prevImportSb = await prisma.stockBatch.count({ where: { companyId: EXPECT.company, batchNumber: `EGG-XLS-${B.code}` } });
    if (prevImportSb) plan.deletes[B.code]._prevImportEggBatch = prevImportSb;

    // ---- batch field fixes ----
    const fieldFix = {};
    if (batch.birdType !== B.birdType) fieldFix.birdType = `${batch.birdType} → ${B.birdType}`;
    const wantStart = B.startDate;
    if (batch.startDate.toISOString().slice(0, 10) !== wantStart) fieldFix.startDate = `${batch.startDate.toISOString().slice(0, 10)} → ${wantStart}`;

    // ---- opening allocations (from the pinned config) ----
    const roomByKey = new Map(rooms.map((r) => [`${r.xh}:${r.roomLabel}`, r]));
    const openingKeys = new Set();
    const allocations = []; // { penId, houseId, birdCount }
    let openingTotal = 0;
    for (const o of B.openings) {
      const r = roomByKey.get(`${o.xh}:${o.room}`);
      if (!r) throw new Error(`opening config references unknown room ${o.xh}:${o.room}`);
      allocations.push({ penId: r.penId, houseId: r.houseId, birdCount: o.birds, room: `${o.room}@${o.xh}`, date: o.date });
      openingKeys.add(`${r.penId}|${o.date}`);
      openingTotal += o.birds;
    }

    // ---- mortality / culls ----
    let mortRows = 0, mortBirds = 0, cullRows = 0, cullBirds = 0;
    for (const r of rooms) {
      for (const d of r.mortalityDays) { if (d.date > THROUGH) continue; mortRows++; mortBirds += d.count; }
      for (const d of r.cullDays) { if (d.date > THROUGH) continue; cullRows++; cullBirds += d.count; }
    }

    // ---- transfers + residual adjustments ----
    const { transfers, adjustments } = buildMovements(rooms, openingKeys);

    // apply allocation increments from transfers (mirror createTransfer upsert)
    const allocMap = new Map(allocations.map((a) => [a.penId, a.birdCount]));
    for (const t of transfers) allocMap.set(t.toPenId, (allocMap.get(t.toPenId) || 0) + t.qty);
    // adjustments change delta, not allocation
    // ---- reconcile per pen: alloc - mortality(pen) - outgoing(pen) + adj(pen) vs Excel lastCStock ----
    const mortByPen = new Map(), outByPen = new Map(), adjByPen = new Map();
    for (const r of rooms) {
      let m = 0; for (const d of r.mortalityDays) if (d.date <= THROUGH) m += d.count;
      for (const d of r.cullDays) if (d.date <= THROUGH) m += d.count;
      mortByPen.set(r.penId, m);
    }
    for (const t of transfers) outByPen.set(t.fromPenId, (outByPen.get(t.fromPenId) || 0) + t.qty);
    for (const a of adjustments) adjByPen.set(a.penId, (adjByPen.get(a.penId) || 0) + a.delta);

    const finalAdj = [];
    for (const r of rooms) {
      const alloc = allocMap.get(r.penId) || 0;
      const live = alloc - (mortByPen.get(r.penId) || 0) - (outByPen.get(r.penId) || 0) + (adjByPen.get(r.penId) || 0);
      const target = r.lastCStock;
      const gap = target - live;
      plan.reconcile.push({ batch: B.code, room: `${r.xh}/${r.roomLabel}`, alloc, mort: mortByPen.get(r.penId) || 0, out: outByPen.get(r.penId) || 0, adj: adjByPen.get(r.penId) || 0, live, target, gap });
      if (gap !== 0) finalAdj.push({ date: THROUGH, penId: r.penId, houseId: r.houseId, delta: gap, label: r.roomLabel, kind: "final-reconcile" });
    }

    // ---- eggs ----
    let eggRows = 0, eggPieces = 0, eggCreditPieces = 0;
    for (const r of rooms) for (const d of r.eggDays) {
      if (d.date > THROUGH) continue;
      eggRows++; eggPieces += d.count;
      if (!EGG_FROM || d.date >= EGG_FROM) eggCreditPieces += d.count;
    }
    const eggCreditQty = EGG_UNIT === "crates" ? money(eggCreditPieces / EGGS_PER_CRATE) : eggCreditPieces;
    const eggBreakdown = `${eggCreditPieces} eggs = ${Math.floor(eggCreditPieces / EGGS_PER_CRATE)} crates + ${eggCreditPieces % EGGS_PER_CRATE} loose`;

    // ---- weights ----
    let weightRows = 0;
    for (const r of rooms) for (const d of r.weightDays) if (d.date <= THROUGH && d.avgKg > 0) weightRows++;

    // ---- medication / vaccination (dedup → batch level) ----
    // The farm logs one regime across all room columns (Adubofour) OR only in
    // the house TOTAL sheet (Simon) — union both, then merge same-drug courses
    // whose ranges overlap or sit within 2 days (the room column and the TOTAL
    // sheet often log the same course a day apart).
    const classified = [];
    for (const c of [...rooms.flatMap((r) => r.medCourses), ...B.excelHouses.flatMap((xh) => data.houses[xh].totalMedCourses || [])]) {
      const cls = classifyMed(c.name);
      if (cls) classified.push({ ...cls, start: c.start, end: c.end });
    }
    classified.sort((a, b) => a.start.localeCompare(b.start));
    const merged = [];
    for (const c of classified) {
      // classified is sorted by start, so c.start >= m.start always; merge when
      // c starts on/before m.end + 2 days (overlapping, contiguous, or a tiny gap)
      const hit = merged.find((m) => m.kind === c.kind && m.name === c.name && iso(c.start).getTime() <= iso(m.end).getTime() + 2 * 86400000);
      if (hit) { if (c.end > hit.end) hit.end = c.end; }
      else merged.push({ ...c });
    }
    const meds = merged.filter((x) => x.kind === "medication");
    const vaccs = merged.filter((x) => x.kind === "vaccine");

    plan.creates[B.code] = {
      fieldFix,
      allocations: allocations.map((a) => `${a.room}=${a.birdCount}`),
      openingTotal,
      mortality: `${mortRows} rows / ${mortBirds} birds`,
      culls: `${cullRows} rows / ${cullBirds} birds`,
      transfers: transfers.length,
      residualAdjustments: adjustments.length,
      finalReconcileAdjustments: finalAdj.length,
      eggs: `${eggRows} day-rows / ${eggPieces} eggs (kept per pen per day)  → egg store: ${eggCreditQty} ${EGG_UNIT}  (${eggBreakdown})`,
      weights: weightRows,
      medications: meds.length,
      vaccinations: vaccs.length,
    };
    plan._detail = plan._detail || {};
    plan._detail[B.code] = { transfers, adjustments, finalAdj, meds, vaccs, batchId: batch.id, branchId, farmId, primaryHouseId: houseByName[B.primaryHouse].id, rooms, allocations, eggCreditQty, eggCreditPieces, eggBreakdown };

    // sanity
    if (B.code === "001" && openingTotal !== 11520) plan.warnings.push(`Batch 1 opening allocations sum to ${openingTotal}, expected 11520`);
    if (B.code === "002" && openingTotal !== 11250) plan.warnings.push(`Batch 2 opening allocations sum to ${openingTotal}, expected 11250`);
  }

  // ── print plan ──
  console.log("\n─── DELETE (hard) ───");
  for (const [code, d] of Object.entries(plan.deletes)) {
    console.log(`  Batch ${code}:`);
    for (const [k, v] of Object.entries(d)) if (v) console.log(`     ${k.padEnd(26)} ${v}`);
  }
  console.log("\n─── KEEP untouched ───\n     feedConsumptionRecord, feedReceiptRecord, the FlockBatch rows");

  console.log("\n─── CREATE ───");
  for (const [code, c] of Object.entries(plan.creates)) {
    console.log(`  Batch ${code}:`);
    for (const [k, v] of Object.entries(c)) {
      if (k === "fieldFix") { if (Object.keys(v).length) console.log(`     field fixes: ${JSON.stringify(v)}`); continue; }
      if (k === "allocations") { console.log(`     opening allocations: ${v.join(", ")}`); continue; }
      console.log(`     ${k.padEnd(26)} ${v}`);
    }
  }

  console.log("\n─── MEDICATION / VACCINATION mapping ───");
  for (const [code, det] of Object.entries(plan._detail)) {
    console.log(`  Batch ${code} medications: ${det.meds.map((m) => `${m.name}[${m.start}${m.end !== m.start ? ".." + m.end : ""}]`).join(", ") || "—"}`);
    console.log(`  Batch ${code} vaccinations: ${det.vaccs.map((m) => `${m.name}[${m.start}]`).join(", ") || "—"}`);
  }

  console.log("\n─── TRANSFERS (first 12 per batch) + residual adjustments ───");
  for (const [code, det] of Object.entries(plan._detail)) {
    console.log(`  Batch ${code}: ${det.transfers.length} transfers, ${det.adjustments.length} residual adj, ${det.finalAdj.length} final-reconcile adj`);
    det.transfers.slice(0, 12).forEach((t) => console.log(`     ${t.date}  ${String(t.qty).padStart(5)}  ${t.note}`));
    det.adjustments.forEach((a) => console.log(`     adj ${a.date}  ${String(a.delta).padStart(6)}  ${a.label} (${a.kind})`));
    det.finalAdj.forEach((a) => console.log(`     adj ${a.date}  ${String(a.delta).padStart(6)}  ${a.label} (${a.kind})`));
  }

  console.log("\n─── RECONCILE (pen live after import vs Excel current C'Stock) ───");
  for (const r of plan.reconcile) {
    console.log(`  ${r.room.padEnd(18)} alloc ${String(r.alloc).padStart(6)}  -mort ${String(r.mort).padStart(4)}  -out ${String(r.out).padStart(5)}  +adj ${String(r.adj).padStart(5)}  = ${String(r.live).padStart(6)}  vs ${String(r.target).padStart(6)}  gap ${r.gap}`);
  }

  if (plan.warnings.length) { console.log("\n!!! WARNINGS:"); plan.warnings.forEach((w) => console.log("   " + w)); }

  if (!COMMIT) { console.log("\n(dry run — nothing written. add --commit --i-have-a-backup to apply)\n"); await prisma.$disconnect(); return; }

  // ══════════════════ COMMIT ══════════════════
  console.log("\n>>> COMMITTING\n");
  for (const B of BATCHES) {
    const det = plan._detail[B.code];
    const { batchId, branchId, farmId, primaryHouseId } = det;
    const base = { companyId: EXPECT.company, branchId, farmId, flockBatchId: batchId, createdById: CREATED_BY };

    // 1. wipe. First reverse any egg inventory this batch had credited:
    //  (a) the service path (one StockMovement per egg record) — none on first run
    const eggRecIds = (await prisma.eggProductionRecord.findMany({ where: { flockBatchId: batchId }, select: { id: true } })).map((r) => r.id);
    if (eggRecIds.length) {
      const mv = await prisma.stockMovement.findMany({ where: { referenceType: "EggProductionRecord", referenceId: { in: eggRecIds } }, select: { id: true, inventoryItemId: true, quantity: true, stockBatchId: true } });
      for (const m of mv) {
        if (m.inventoryItemId) await prisma.inventoryItem.update({ where: { id: m.inventoryItemId }, data: { quantityOnHand: { decrement: m.quantity } } });
        if (m.stockBatchId) await prisma.stockBatch.deleteMany({ where: { id: m.stockBatchId } });
      }
      if (mv.length) await prisma.stockMovement.deleteMany({ where: { id: { in: mv.map((m) => m.id) } } });
    }
    //  (b) a previous run of THIS script (one consolidated StockBatch)
    const prevSb = await prisma.stockBatch.findFirst({ where: { companyId: EXPECT.company, batchNumber: `EGG-XLS-${B.code}` }, select: { id: true, inventoryItemId: true, quantityRemaining: true } });
    if (prevSb) {
      if (prevSb.inventoryItemId) await prisma.inventoryItem.update({ where: { id: prevSb.inventoryItemId }, data: { quantityOnHand: { decrement: prevSb.quantityRemaining } } });
      await prisma.stockMovement.deleteMany({ where: { stockBatchId: prevSb.id } });
      await prisma.stockBatch.delete({ where: { id: prevSb.id } });
      console.log(`   reversed previous import egg batch EGG-XLS-${B.code}`);
    }
    for (const m of ["mortalityRecord", "eggProductionRecord", "birdWeightRecord", "medicationRecord", "vaccinationRecord", "poultryTransferRecord", "poultryHealthObservation", "poultryCountAdjustment", "poultryCostRecord", "dailyPoultryRecord", "batchPenAllocation"]) {
      const { count } = await prisma[m].deleteMany({ where: { flockBatchId: batchId } });
      console.log(`   wiped ${m}: ${count}`);
    }

    // 2. batch field fixes
    await prisma.flockBatch.update({ where: { id: batchId }, data: {
      birdType: B.birdType,
      startDate: iso(B.startDate),
      openingBirdCount: B.openings.reduce((s, o) => s + o.birds, 0),
      poultryHouseId: null,
    } });

    // 3. opening allocations (pinned config)
    for (const a of det.allocations) {
      await prisma.batchPenAllocation.create({ data: { companyId: EXPECT.company, branchId, farmId, flockBatchId: batchId, penId: a.penId, poultryHouseId: a.houseId, birdCount: a.birdCount, createdById: CREATED_BY } });
    }

    // 4. mortality + culls
    const mortData = [];
    for (const r of det.rooms) {
      for (const d of r.mortalityDays) if (d.date <= THROUGH) mortData.push({ ...base, poultryHouseId: r.houseId, penId: r.penId, recordDate: iso(d.date), birdCount: d.count, isCulling: false, reason: note(d.remark), status: "APPROVED", idempotencyKey: `xls:${B.code}:${r.xh}:${r.roomLabel}:${d.date}:mort` });
      for (const d of r.cullDays) if (d.date <= THROUGH) mortData.push({ ...base, poultryHouseId: r.houseId, penId: r.penId, recordDate: iso(d.date), birdCount: d.count, isCulling: true, reason: note(d.remark) || "Culling", status: "APPROVED", idempotencyKey: `xls:${B.code}:${r.xh}:${r.roomLabel}:${d.date}:cull` });
    }
    for (let i = 0; i < mortData.length; i += 500) await prisma.mortalityRecord.createMany({ data: mortData.slice(i, i + 500) });
    console.log(`   mortality/cull rows: ${mortData.length}`);

    // 5. transfers (+ allocation upserts) — status COMPLETED
    for (const t of det.transfers) {
      await prisma.poultryTransferRecord.create({ data: {
        companyId: EXPECT.company, branchId, flockBatchId: batchId,
        fromFarmId: farmId, fromPoultryHouseId: t.fromHouseId, fromPenId: t.fromPenId,
        toFarmId: farmId, toPoultryHouseId: t.toHouseId, toPenId: t.toPenId,
        birdCount: t.qty, isFullBatchRelocation: false, transferDate: iso(t.date),
        status: "COMPLETED", reason: `Excel import: ${t.note}`, createdById: CREATED_BY,
      } });
      await prisma.batchPenAllocation.upsert({
        where: { flockBatchId_penId: { flockBatchId: batchId, penId: t.toPenId } },
        update: { birdCount: { increment: t.qty } },
        create: { companyId: EXPECT.company, branchId, farmId, flockBatchId: batchId, penId: t.toPenId, poultryHouseId: t.toHouseId, birdCount: t.qty, createdById: CREATED_BY },
      });
    }
    console.log(`   transfers: ${det.transfers.length}`);

    // 6. count adjustments (residual + final reconcile)
    const allAdj = [...det.adjustments, ...det.finalAdj];
    for (const a of allAdj) {
      // ensure an allocation row exists for the pen so per-pen reads work
      await prisma.batchPenAllocation.upsert({
        where: { flockBatchId_penId: { flockBatchId: batchId, penId: a.penId } },
        update: {},
        create: { companyId: EXPECT.company, branchId, farmId, flockBatchId: batchId, penId: a.penId, poultryHouseId: a.houseId, birdCount: 0, createdById: CREATED_BY },
      });
      await prisma.poultryCountAdjustment.create({ data: {
        companyId: EXPECT.company, branchId, farmId, poultryHouseId: a.houseId, penId: a.penId, flockBatchId: batchId,
        adjustmentDate: iso(a.date), countedTotal: 0, expectedTotal: -a.delta, delta: a.delta,
        reason: `Excel import (${a.kind})`, status: "APPROVED",
        idempotencyKey: `xls:${B.code}:${a.penId}:${a.date}:${a.kind}`, createdById: CREATED_BY,
      } });
    }
    console.log(`   count adjustments: ${allAdj.length}`);

    // 7. eggs + inventory credit
    const eggData = [];
    for (const r of det.rooms) for (const d of r.eggDays) if (d.date <= THROUGH) {
      eggData.push({ ...base, poultryHouseId: r.houseId, penId: r.penId, recordDate: iso(d.date), goodEggs: d.count, status: "APPROVED", idempotencyKey: `xls:${B.code}:${r.xh}:${r.roomLabel}:${d.date}:eggs` });
    }
    for (let i = 0; i < eggData.length; i += 500) await prisma.eggProductionRecord.createMany({ data: eggData.slice(i, i + 500) });
    console.log(`   egg day-rows: ${eggData.length}`);

    // credit ONE consolidated stock batch + one movement per credited day
    if (det.eggCreditQty > 0) {
      const eggStoreW = await prisma.warehouse.findFirst({ where: { type: "EGG_STORE", farmId: EXPECT.farm, deletedAt: null } });
      const eggProd = await prisma.product.findFirst({ where: { sku: "EG" } });
      const item = await prisma.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: EXPECT.company, warehouseId: eggStoreW.id, productId: eggProd.id } },
        update: { quantityOnHand: { increment: det.eggCreditQty } },
        create: { companyId: EXPECT.company, branchId: eggStoreW.branchId, warehouseId: eggStoreW.id, farmId, productId: eggProd.id, uomId: eggProd.uomId, quantityOnHand: det.eggCreditQty, createdById: CREATED_BY },
      });
      const firstEggDate = eggData.map((e) => e.recordDate).sort((a, b) => a - b)[0];
      const eggNote = `Excel import — ${B.label}: ${det.eggBreakdown} → egg store (raw piece counts kept per pen per day on the egg-production records)`;
      const sb = await prisma.stockBatch.create({ data: {
        companyId: EXPECT.company, branchId: eggStoreW.branchId, farmId, warehouseId: eggStoreW.id, productId: eggProd.id,
        inventoryItemId: item.id, uomId: eggProd.uomId, batchNumber: `EGG-XLS-${B.code}`,
        quantityReceived: det.eggCreditQty, quantityRemaining: det.eggCreditQty, manufactureDate: firstEggDate, createdById: CREATED_BY,
      } });
      await prisma.stockMovement.create({ data: {
        companyId: EXPECT.company, branchId: eggStoreW.branchId, productId: eggProd.id, inventoryItemId: item.id, stockBatchId: sb.id,
        toWarehouseId: eggStoreW.id, warehouseId: eggStoreW.id, farmId, uomId: eggProd.uomId,
        movementType: "PRODUCTION_OUTPUT", quantity: det.eggCreditQty, referenceType: "PoultryExcelImport", referenceId: batchId,
        notes: eggNote.slice(0, 490), movementDate: firstEggDate, createdById: CREATED_BY,
      } });
      console.log(`   egg inventory credited: ${det.eggCreditQty} ${EGG_UNIT}  (${det.eggBreakdown})`);
    }

    // 8. weights
    const wData = [];
    for (const r of det.rooms) for (const d of r.weightDays) if (d.date <= THROUGH && d.avgKg > 0) {
      wData.push({ ...base, poultryHouseId: r.houseId, penId: r.penId, recordDate: iso(d.date), sampleSize: 50, averageWeightKg: d.avgKg, status: "APPROVED", idempotencyKey: `xls:${B.code}:${r.xh}:${r.roomLabel}:${d.date}:wt` });
    }
    if (wData.length) for (let i = 0; i < wData.length; i += 500) await prisma.birdWeightRecord.createMany({ data: wData.slice(i, i + 500) });
    console.log(`   weight rows: ${wData.length}`);

    // 9. medication + vaccination (batch level, primary house, no pen)
    for (const m of det.meds) await prisma.medicationRecord.create({ data: {
      companyId: EXPECT.company, branchId, farmId, poultryHouseId: primaryHouseId, flockBatchId: batchId,
      medicationName: m.name, dosage: "per farm record", route: null, startDate: iso(m.start), endDate: iso(m.end),
      notes: "Excel import", status: "APPROVED", idempotencyKey: `xls:${B.code}:med:${m.name}:${m.start}:${m.end}`, createdById: CREATED_BY,
    } });
    for (const v of det.vaccs) await prisma.vaccinationRecord.create({ data: {
      companyId: EXPECT.company, branchId, farmId, poultryHouseId: primaryHouseId, flockBatchId: batchId,
      vaccineName: v.name, dose: "per farm record", vaccinationDate: iso(v.start),
      notes: "Excel import", status: "APPROVED", idempotencyKey: `xls:${B.code}:vac:${v.name}:${v.start}`, createdById: CREATED_BY,
    } });
    console.log(`   medications: ${det.meds.length}   vaccinations: ${det.vaccs.length}`);
  }

  console.log("\n>>> DONE\n");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
