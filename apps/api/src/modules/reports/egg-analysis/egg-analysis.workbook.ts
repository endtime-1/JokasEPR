import type { Worksheet } from "exceljs";
import { EggAnalysis } from "./egg-analysis.calc";

/**
 * The Excel workbook the owner reads. Plain English, numbers formatted, one idea per sheet:
 *   Summary -> Where the eggs went -> By month -> Stores -> Production vs stock -> Transfers -> Egg sales -> Adjustments -> Notes.
 */

const GREEN = "FF1F5C3A", PALE = "FFEAF3EE", GREY = "FFF3F4F6", AMBER = "FFFDECC8", OKGREEN = "FFD8F0DF", INFOGREY = "FFE5E7EB";
const CRATES = "#,##0.00;[Red]-#,##0.00;-", EGGS = "#,##0;[Red]-#,##0;-", MONEY = "#,##0.00", PCT = "0.00%";

type Cell = string | number | null | undefined;

export async function buildEggWorkbook(a: EggAnalysis, meta: { company?: string; preparedBy?: string } = {}): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.preparedBy ?? "Jokas ERP";
  wb.created = new Date(a.generatedAt);
  const per = a.perCrate;
  const eggs = (c: number) => Math.round(c * per);
  const period = a.period.from ? `${a.period.from} to ${a.period.to}` : `all records up to ${a.period.to}`;

  const sheet = (name: string, title: string, widths: number[]) => {
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], properties: { tabColor: { argb: GREEN } } });
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { size: 16, bold: true, color: { argb: GREEN } };
    ws.getCell("A2").value = `${meta.company ? meta.company + "  ·  " : ""}Period: ${period}  ·  1 crate = ${per} eggs  ·  Prepared ${a.generatedAt.slice(0, 10)}`;
    ws.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
    return ws;
  };
  const table = (ws: Worksheet, row: number, headers: string[], rows: Cell[][], formats: (string | undefined)[] = [], opts: { boldLast?: boolean } = {}) => {
    const h = ws.getRow(row);
    headers.forEach((t, i) => {
      const c = h.getCell(i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : formats[i] ? "right" : "left", wrapText: true };
    });
    h.height = 22;
    rows.forEach((r, ri) => {
      const x = ws.getRow(row + 1 + ri);
      r.forEach((v, i) => {
        const c = x.getCell(i + 1);
        c.value = v === undefined ? null : v;
        if (formats[i] && typeof v === "number") { c.numFmt = formats[i]!; c.alignment = { horizontal: "right", vertical: "top" }; }
        else c.alignment = { vertical: "top", wrapText: true };
        c.border = { bottom: { style: "hair", color: { argb: "FFD1D5DB" } } };
        if (opts.boldLast && ri === rows.length - 1) { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } }; }
      });
    });
    return row + rows.length + 2;
  };
  const heading = (ws: Worksheet, row: number, text: string, note?: string) => {
    ws.getCell(row, 1).value = text;
    ws.getCell(row, 1).font = { size: 12, bold: true, color: { argb: GREEN } };
    if (note) { ws.getCell(row + 1, 1).value = note; ws.getCell(row + 1, 1).font = { size: 10, italic: true, color: { argb: "FF6B7280" } }; return row + 2; }
    return row + 1;
  };
  const h = a.headline;

  // ── 1. Summary ──
  {
    const ws = sheet("Summary", "Egg analysis: farm to head office", [52, 16, 16, 16]);
    let r = heading(ws, 4, "The headline");
    r = table(ws, r, ["", "Crates", "Eggs", "% of production"], [
      ["Eggs produced (per the farm's production records)", h.producedPerRecords, eggs(h.producedPerRecords), 1],
      ["Eggs sold (net of returns)", h.sold, eggs(h.sold), h.producedPerRecords ? h.sold / h.producedPerRecords : 0],
      ["Eggs in the farm egg store now", h.heldAtFarm, eggs(h.heldAtFarm), h.producedPerRecords ? h.heldAtFarm / h.producedPerRecords : 0],
      ["Eggs in the head-office egg store now", h.heldAtSalesStores, eggs(h.heldAtSalesStores), h.producedPerRecords ? h.heldAtSalesStores / h.producedPerRecords : 0],
      ["NOT ACCOUNTED FOR", h.notAccountedFor, eggs(h.notAccountedFor), h.notAccountedForPercent / 100]
    ], [undefined, CRATES, EGGS, PCT], { boldLast: true });
    if (h.estimatedValue !== null) {
      ws.getCell(r - 1, 1).value = `Estimated value of the eggs not accounted for, at the average selling price of GHS ${h.averagePricePerCrate} a crate`;
      ws.getCell(r - 1, 2).value = h.estimatedValue;
      ws.getCell(r - 1, 2).numFmt = MONEY;
      ws.getCell(r - 1, 1).font = { italic: true };
      r += 1;
    }
    r = heading(ws, r, "What to look at", "OK = nothing to do. WATCH = worth a look or a question to someone. INFO = for your information.");
    const rows: Cell[][] = a.findings.map((f) => [f.level, f.title, f.detail]);
    ws.getColumn(2).width = 40; ws.getColumn(3).width = 100;
    const start = r;
    table(ws, r, ["Status", "What", "Detail"], rows);
    a.findings.forEach((f, i) => {
      const c = ws.getCell(start + 1 + i, 1);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: f.level === "OK" ? OKGREEN : f.level === "WATCH" ? AMBER : INFOGREY } };
      c.font = { bold: true };
      ws.getCell(start + 1 + i, 2).font = { bold: true };
    });
    ws.getColumn(1).width = 52;
  }

  // ── 2. Where the eggs went ──
  {
    const ws = sheet("Where the eggs went", "Where the eggs went", [78, 16, 16, 60]);
    let r = heading(ws, 4, "From production to sales and stock", "Start with what the farm recorded producing, take away what was sold and what is still in the two egg stores. What is left over is the eggs not accounted for.");
    r = table(ws, r, ["", "Crates", "Eggs", ""], a.bridge.map((b) => [b.label, b.crates, eggs(b.crates), b.note ?? ""]), [undefined, CRATES, EGGS], { boldLast: true });
    r = heading(ws, r, "Why they are not accounted for", "These lines add up to the figure above.");
    const total = a.shrinkage.reduce((s, x) => s + x.crates, 0);
    r = table(ws, r, ["", "Crates", "Eggs", ""], [...a.shrinkage.map((s) => [s.label, s.crates, eggs(s.crates), ""] as Cell[]), ["TOTAL", Math.round(total * 10_000) / 10_000, eggs(total), ""]], [undefined, CRATES, EGGS], { boldLast: true });
    ws.getCell(r, 1).value = "The 'not corrected' line is stock that was credited when production was first recorded, but the record was later edited down and the stock was never reduced. A write-off elsewhere may already offset it.";
    ws.getCell(r, 1).font = { size: 10, italic: true };
    ws.getCell(r, 1).alignment = { wrapText: true };
  }

  // ── 3. By month ──
  {
    const ws = sheet("By month", "Month by month", [12, 14, 14, 14, 14, 14, 14, 14, 14, 16]);
    const rows = a.months.map((m) => [m.month, m.recorded, m.credited, m.systemCorrections, m.writeOffs, m.sentOut, m.received, m.sold, m.soldAmount] as Cell[]);
    const tot = (i: number) => Math.round(a.months.reduce((s, m) => s + ([0, m.recorded, m.credited, m.systemCorrections, m.writeOffs, m.sentOut, m.received, m.sold, m.soldAmount] as number[])[i], 0) * 10_000) / 10_000;
    rows.push(["Total", tot(1), tot(2), tot(3), tot(4), tot(5), tot(6), tot(7), Math.round(tot(8) * 100) / 100]);
    table(ws, 4, ["Month", "Produced (records)", "Credited to farm store", "Reversed by the system", "Written off / adjusted", "Sent to head office", "Received at head office", "Sold (net)", "Sales value (GHS)"], rows, [undefined, CRATES, CRATES, CRATES, CRATES, CRATES, CRATES, CRATES, MONEY], { boldLast: true });
    ws.getRow(4).height = 36;
    ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
    ws.getCell("A" + (rows.length + 7)).value = "All figures in crates except the last column. 'Reversed by the system' is stock taken back out when a production record is deleted or corrected.";
    ws.getCell("A" + (rows.length + 7)).font = { size: 10, italic: true };
  }

  // ── 4. Stores ──
  {
    const ws = sheet("Stores", "Each egg store: what its records say against what the system shows", [58, 16, 16, 40]);
    let r = 4;
    for (const s of a.stores) {
      r = heading(ws, r, `${s.name}${s.farm ? `  (${s.farm})` : ""}${s.retired ? "  [retired store]" : ""}`, s.role === "FARM" ? "Farm egg store: eggs are credited here from production." : s.role === "SALES" ? "Sales egg store (head office): receives transfers and sells eggs." : "Not part of the farm-to-head-office chain.");
      const rows: Cell[][] = [["Opening stock", s.opening, eggs(s.opening), ""], ...s.lines.map((l) => [l.label.replace(/^(In|Out): /, ""), l.crates, eggs(l.crates), l.crates >= 0 ? "in" : "out"] as Cell[]), ["Should hold, per the movements", s.closing, eggs(s.closing), ""], ["System on-hand now", s.systemOnHand, eggs(s.systemOnHand), s.agrees === null ? "" : s.agrees ? "agrees" : "DOES NOT AGREE"]];
      r = table(ws, r, ["", "Crates", "Eggs", ""], rows, [undefined, CRATES, EGGS]);
    }
  }

  // ── 5. Production vs stock ──
  {
    const g = a.productionGap;
    const ws = sheet("Production vs stock", "Farm production records against stock credited", [34, 16, 16, 16, 16, 40]);
    let r = heading(ws, 4, "The gap, in one table");
    r = table(ws, r, ["", "Crates", "Eggs"], [
      ["Production records (live)", g.recordedLive, eggs(g.recordedLive)],
      ["Credited to the farm store", g.creditedGross, eggs(g.creditedGross)],
      ["less: taken back out by the system (deleted or corrected records)", -g.systemCorrections, eggs(-g.systemCorrections)],
      ["Credited, net", g.creditedNet, eggs(g.creditedNet)],
      ["Stock credited MORE than the records show", g.difference, eggs(g.difference)],
      ["of which explained below", g.explained, eggs(g.explained)],
      ["Not explained", g.unexplained, eggs(g.unexplained)]
    ], [undefined, CRATES, EGGS]);
    r = heading(ws, r, "Production records deleted after their stock was credited", "When a record is deleted the system takes its stock back out. 'Still credited' should be zero.");
    r = table(ws, r, ["Record date", "House", "Credited (crates)", "Reversed (crates)", "Still credited", "Deleted on"], g.deleted.length ? g.deleted.map((d) => [d.date, d.house, d.credited, d.reversed, d.net, d.deletedOn]) : [["None", "", null, null, null, ""]], [undefined, undefined, CRATES, CRATES, CRATES]);
    r = heading(ws, r, "Production records edited after their stock was credited", "The stock was NOT corrected for these. Positive = stock credited more than the record now shows.");
    r = table(ws, r, ["Record date", "House", "Record now (eggs)", "Credited (eggs)", "Difference (eggs)", "Edited on"], g.edited.length ? g.edited.map((e) => [e.date, e.house, e.recordNow, e.credited, e.difference, e.editedOn]) : [["None", "", null, null, null, ""]], [undefined, undefined, EGGS, EGGS, EGGS]);
    r = heading(ws, r, "Older records credited a day at a time");
    table(ws, r, ["", "Records", "Crates"], [["Records with no link to a credit", g.neverCredited.count, g.neverCredited.crates], ["Per-day credits not linked to a record", g.untiedCredits.count, g.untiedCredits.crates]], [undefined, EGGS, CRATES]);
  }

  // ── 6. Transfers ──
  {
    const t = a.transfers;
    const ws = sheet("Transfers", "Eggs sent from the farm to the head office", [16, 14, 22, 22, 14, 14, 18, 14]);
    let r = heading(ws, 4, "Summary");
    r = table(ws, r, ["", "Crates", "Eggs"], [["Sent (completed transfers)", t.summary.sent, eggs(t.summary.sent)], ["Received", t.summary.received, eggs(t.summary.received)], ["Received SHORT", t.summary.shortBy, eggs(t.summary.shortBy)], ["Approved, still on the way", t.summary.onTheWay, eggs(t.summary.onTheWay)], ["Waiting for approval (stock has not moved)", t.summary.waitingApproval, eggs(t.summary.waitingApproval)]], [undefined, CRATES, EGGS]);
    r = heading(ws, r, "Every transfer");
    r = table(ws, r, ["Number", "Date", "From", "To", "Sent", "Received", "Status", "Short by"], t.rows.map((x) => [x.number, x.date, x.from, x.to, x.sent, x.received, x.status, x.shortBy]), [undefined, undefined, undefined, undefined, CRATES, CRATES, undefined, CRATES]);
    heading(ws, r, "Transfers received short: the discrepancy records");
    table(ws, r + 1, ["Transfer", "Expected", "Received", "Difference", "Status", "Resolution", "Reason"], t.discrepancies.length ? t.discrepancies.map((d) => [d.transferNumber, d.expected, d.received, d.difference, d.status, d.resolution ?? "", d.reason ?? ""]) : [["None", null, null, null, "", "", ""]], [undefined, CRATES, CRATES, CRATES]);
    ws.getColumn(7).width = 18;
  }

  // ── 7. Egg sales ──
  {
    const s = a.sales;
    const ws = sheet("Egg sales", "Egg sales", [14, 12, 16, 18, 20]);
    const rows: Cell[][] = s.byMonth.map((m) => [m.month, m.sales, m.crates, m.amount, m.averagePrice]);
    rows.push(["Total", s.total.sales, s.total.crates, s.total.amount, s.total.crates > 0 ? Math.round((s.total.amount / s.total.crates) * 100) / 100 : null]);
    let r = table(ws, 4, ["Month", "Sales", "Crates", "Value (GHS)", "Average price per crate"], rows, [undefined, "#,##0", CRATES, MONEY, MONEY], { boldLast: true });
    r = heading(ws, r, "Checks");
    r = table(ws, r, ["", "Count"], [["Egg sales that did not take any stock out", s.withoutStockOut.length], ["Egg sales that were deleted (their stock was put back)", s.deletedSaleCount]], [undefined, "#,##0"]);
    if (s.withoutStockOut.length) { heading(ws, r, "Sales that took no stock out"); table(ws, r + 1, ["Sale", "Date", "Crates"], s.withoutStockOut.map((x) => [x.number, x.date, x.crates]), [undefined, undefined, CRATES]); }
  }

  // ── 8. Adjustments ──
  {
    const ws = sheet("Adjustments", "Stock adjustments", [12, 14, 16, 20, 11, 12, 54, 18, 18, 18]);
    table(ws, 4, ["Date", "Number", "Store", "Type", "Crates", "Status", "Reason", "Entered by", "Approved by", "Reviewed by someone else?"], a.adjustments.map((x) => [x.date, x.number, x.store, x.type, x.crates, x.status, x.reason, x.requestedBy, x.approvedBy, x.sameApprover ? "NO: same person" : "yes"]), [undefined, undefined, undefined, undefined, CRATES]);
    a.adjustments.forEach((x, i) => { if (x.sameApprover) { const c = ws.getCell(5 + i, 10); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER } }; c.font = { bold: true }; } });
    ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  }

  // ── 9. Notes ──
  {
    const ws = sheet("Notes", "How to read this workbook", [120]);
    const lines = [
      "WHAT IT IS: a reconciliation of the egg chain, built only from the system's own records (production records, stock movements, transfers, egg sales and stock adjustments). Nothing here is typed in by hand.",
      `UNITS: crates and eggs. One crate is ${per} eggs. Egg counts are crates multiplied by ${per}.`,
      "PRODUCED: the eggs the farm recorded in its daily egg production records (good, cracked, dirty, broken and rejected eggs together). Deleted records are left out.",
      "NOT ACCOUNTED FOR: production recorded, minus eggs sold, minus the eggs still in the farm and head-office egg stores. It is the eggs that went missing from the paper trail, and the 'Where the eggs went' sheet shows the reasons.",
      "WRITTEN OFF: stock adjustments (count corrections, write-offs, damage). They remove eggs from stock with a reason and an approval.",
      "LOST IN TRANSIT: eggs sent from the farm store that the head-office store received short (the transfer's discrepancy records).",
      "NOT CORRECTED: a production record was edited after its stock was credited and the stock was not changed to match, so stock holds eggs the records no longer show.",
      "REVERSED BY THE SYSTEM: when a production record is deleted the system takes its stock back out automatically.",
      "THE STORES SHEET compares what each store's stock movements say it should hold against what the system shows. They should agree.",
      "A PHYSICAL COUNT is the real test. This workbook proves the records are consistent; it cannot prove eggs are physically on the shelves. Count both stores and compare with the 'should hold' figures.",
      "ESTIMATED VALUE uses the average selling price over the period and is only a guide.",
      `GENERATED ${a.generatedAt} from live data. Run it again for current figures.`
    ];
    lines.forEach((t, i) => { const c = ws.getCell(4 + i, 1); c.value = t; c.alignment = { wrapText: true, vertical: "top" }; ws.getRow(4 + i).height = t.length > 120 ? 34 : 20; if (i % 2 === 0) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } }; });
  }

  for (const ws of wb.worksheets) {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.headerFooter = { oddFooter: "&L&A&RPage &P of &N" };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
