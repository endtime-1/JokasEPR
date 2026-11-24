import { analyseEggs } from "./egg-analysis.calc";
import { build } from "./egg-analysis.fixture";
import { buildEggWorkbook } from "./egg-analysis.workbook";

jest.setTimeout(60_000);

async function open(buf: Buffer) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}
const text = (ws: { eachRow: (cb: (row: { values: unknown }) => void) => void }) => {
  const out: string[] = [];
  ws.eachRow((row) => out.push((Array.isArray(row.values) ? row.values : Object.values(row.values as object)).map((v) => (v && typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result) : String(v ?? ""))).join("|")));
  return out.join("\n");
};

describe("egg analysis workbook", () => {
  const a = analyseEggs(build());

  it("is a real .xlsx with the nine sheets in reading order", async () => {
    const buf = await buildEggWorkbook(a, { company: "Test Farms" });
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // xlsx is a zip
    const wb = await open(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Where the eggs went", "By month", "Stores", "Production vs stock", "Transfers", "Egg sales", "Adjustments", "Notes"]);
  });

  it("the Summary shows the headline, the not-accounted-for figure and the findings", async () => {
    const wb = await open(await buildEggWorkbook(a, { company: "Test Farms" }));
    const t = text(wb.getWorksheet("Summary")!);
    expect(t).toContain("Egg analysis: farm to head office");
    expect(t).toContain("Test Farms");
    expect(t).toContain("NOT ACCOUNTED FOR");
    expect(t).toContain("WATCH");
    expect(t).toContain("Eggs lost in transit");
    expect(t).toContain("approved by the same person who entered them");
    const ws = wb.getWorksheet("Summary")!;
    // the headline row for not-accounted-for carries the crates as a number, not text
    let crates: unknown;
    ws.eachRow((row) => { if (String(row.getCell(1).value) === "NOT ACCOUNTED FOR") crates = row.getCell(2).value; });
    expect(typeof crates).toBe("number");
    expect(crates as number).toBeCloseTo(a.headline.notAccountedFor, 3);
  });

  it("'Where the eggs went' lists the bridge and the reasons, and they add up", async () => {
    const wb = await open(await buildEggWorkbook(a));
    const ws = wb.getWorksheet("Where the eggs went")!;
    const t = text(ws);
    expect(t).toContain("Eggs produced, per the farm's production records");
    expect(t).toContain("Lost in transit");
    let total: number | null = null;
    ws.eachRow((row) => { if (String(row.getCell(1).value) === "TOTAL") total = row.getCell(2).value as number; });
    expect(total).toBeCloseTo(a.headline.notAccountedFor, 3);
  });

  it("every other sheet carries its data: months, stores, production gap, transfers, sales, adjustments", async () => {
    const wb = await open(await buildEggWorkbook(a));
    expect(text(wb.getWorksheet("By month")!)).toContain("2026-10");
    expect(text(wb.getWorksheet("Stores")!)).toContain("Jokas Egg");
    const gap = text(wb.getWorksheet("Production vs stock")!);
    expect(gap).toContain("Dufie");
    expect(gap).toContain("2026-09-17");
    expect(gap).toContain("Edited on");
    expect(text(wb.getWorksheet("Transfers")!)).toContain("STR-2");
    expect(text(wb.getWorksheet("Egg sales")!)).toContain("13525");
    const adj = text(wb.getWorksheet("Adjustments")!);
    expect(adj).toContain("ADJ-1");
    expect(adj).toContain("NO: same person");
    expect(text(wb.getWorksheet("Notes")!)).toContain("A PHYSICAL COUNT is the real test");
  });

  it("handles an analysis with nothing in it", async () => {
    const empty = analyseEggs({ perCrate: 30, today: new Date("2026-11-24T00:00:00Z"), warehouses: [], onHand: [], movements: [], records: [], transfers: [], discrepancies: [], sales: [], deletedSaleCount: 0, adjustments: [] });
    const wb = await open(await buildEggWorkbook(empty));
    expect(wb.worksheets).toHaveLength(9);
  });
});
