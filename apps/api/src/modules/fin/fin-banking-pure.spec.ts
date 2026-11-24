import { createHmac } from "crypto";
import { Body, Controller, HttpCode, Module, Post, RawBodyRequest, Req } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import request from "supertest";
import { PaystackProvider } from "./fin-payment-provider";
import { guessMapping, parseAmountCell, parseDateCell, parseStatement, readGrid } from "./fin-statement-parser";
import { scoreMatch } from "./fin-reconciliation.service";

describe("statement dates", () => {
  it.each([
    ["2026-11-05", "2026-11-05"],
    ["2026/11/05", "2026-11-05"],
    ["05/11/2026", "2026-11-05"], // day-first is the default
    ["5-11-2026", "2026-11-05"],
    ["05.11.26", "2026-11-05"],
    ["25/12/2026", "2026-12-25"], // 25 cannot be a month
    ["12/25/2026", "2026-12-25"], // 25 in the second place: month-first
    ["05 Nov 2026", "2026-11-05"],
    ["5-Sept-2026", "2026-09-05"],
    ["2026-11-05T09:30:00Z", "2026-11-05"],
    ["46331", "2026-11-05"] // an Excel serial number
  ])("%s -> %s", (input, expected) => {
    expect(parseDateCell(input)).toBe(expected);
  });
  it("honours an explicit order and rejects impossible dates", () => {
    expect(parseDateCell("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseDateCell("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("not a date")).toBeNull();
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("13/13/2026")).toBeNull();
  });
});

describe("statement amounts", () => {
  it.each([
    ["1,234.50", 123_450],
    ["-500.00", -50_000],
    ["(500.00)", -50_000],
    ["500.00-", -50_000],
    ["250.00 DR", -25_000],
    ["250.00 CR", 25_000],
    ["GHS 1,000", 100_000],
    ["GH₵75.5", 7_550],
    ["+40", 4_000],
    [".5", 50],
    ["12.", 1_200]
  ])("%s -> %s pesewas", (input, expected) => {
    expect(parseAmountCell(input)).toBe(expected);
  });
  it("treats blanks as nothing and refuses junk and 3 decimals", () => {
    expect(parseAmountCell("")).toBeNull();
    expect(parseAmountCell("-")).toBeNull();
    expect(() => parseAmountCell("abc")).toThrow(/not an amount/);
    expect(() => parseAmountCell("12.345")).toThrow(/2 decimal/);
  });
});

describe("statement parsing", () => {
  const grid = [
    ["Date", "Narration", "Ref", "Debit", "Credit", "Balance"],
    ["05/11/2026", "TRANSFER FROM KOFI", "RCT-2026-0001", "", "500.00", "1,500.00"],
    ["06/11/2026", "ATM WITHDRAWAL", "", "120.00", "", "1,380.00"],
    ["", "", "", "", "", ""],
    ["07/11/2026", "MONTHLY FEE", "", "15.00", "", "1,365.00"],
    ["not a date", "garbage", "", "1.00", "", ""]
  ];
  const mapping = { date: 0, description: 1, reference: 2, moneyOut: 3, moneyIn: 4, balance: 5 };

  it("reads signed lines from separate money-in and money-out columns", () => {
    const r = parseStatement(grid, mapping);
    expect(r.lines.map((l) => [l.date, l.amountPesewas, l.reference])).toEqual([["2026-11-05", 50_000, "RCT-2026-0001"], ["2026-11-06", -12_000, null], ["2026-11-07", -1_500, null]]);
    expect(r.lines[0].balancePesewas).toBe(150_000);
    expect(r.skipped).toBe(1); // the blank line
    expect(r.errors).toEqual([{ lineNo: 6, message: '"not a date" is not a date I can read.' }]);
  });

  it("reads one signed amount column too", () => {
    const r = parseStatement([["d", "x", "amt"], ["2026-11-01", "In", "100.00"], ["2026-11-02", "Out", "-40.50"]], { date: 0, description: 1, amount: 2 });
    expect(r.lines.map((l) => l.amountPesewas)).toEqual([10_000, -4_050]);
  });

  it("works without a header row and needs an amount column", () => {
    const r = parseStatement([["2026-11-01", "In", "100.00"]], { date: 0, description: 1, amount: 2, hasHeader: false });
    expect(r.lines).toHaveLength(1);
    expect(() => parseStatement(grid, { date: 0, description: 1 })).toThrow(/column holds the amount/);
  });

  it("keeps two identical lines on one day apart, and gives the same fingerprints on a re-import", () => {
    const g = [["d", "x", "a"], ["2026-11-01", "COFFEE", "-5.00"], ["2026-11-01", "COFFEE", "-5.00"], ["2026-11-01", "TEA", "-5.00"]];
    const m = { date: 0, description: 1, amount: 2 };
    const a = parseStatement(g, m).lines.map((l) => l.fingerprint);
    expect(new Set(a).size).toBe(3);
    expect(parseStatement(g, m).lines.map((l) => l.fingerprint)).toEqual(a);
    // a longer file that starts the same way keeps the same fingerprints for the shared lines
    const longer = parseStatement([...g, ["2026-11-02", "LUNCH", "-9.00"]], m).lines.map((l) => l.fingerprint);
    expect(longer.slice(0, 3)).toEqual(a);
  });

  it("skips zero-amount lines and reports lines with no amount", () => {
    const r = parseStatement([["d", "x", "i", "o"], ["2026-11-01", "Memo", "", ""], ["2026-11-01", "Zero", "0.00", ""]], { date: 0, description: 1, moneyIn: 2, moneyOut: 3 });
    expect(r.lines).toHaveLength(0);
    expect(r.skipped + r.errors.length).toBe(2);
  });

  it("guesses columns from a header row", () => {
    expect(guessMapping(["Transaction Date", "Narration", "Cheque No", "Debit", "Credit", "Balance"])).toEqual({ date: 0, description: 1, reference: 2, moneyIn: 4, moneyOut: 3, balance: 5 });
    expect(guessMapping(["Date", "Description", "Amount"])).toEqual({ date: 0, description: 1, amount: 2 });
  });
});

describe("reading an Excel statement", () => {
  it("reads the first sheet, including real dates and numbers", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Statement");
    ws.addRow(["Date", "Description", "Debit", "Credit"]);
    ws.addRow([new Date(Date.UTC(2026, 10, 5)), "Deposit", null, 500]);
    ws.addRow([new Date(Date.UTC(2026, 10, 6)), "Fee", 15.5, null]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const grid = await readGrid({ fileBase64: buf.toString("base64") });
    expect(grid[0]).toEqual(["Date", "Description", "Debit", "Credit"]);
    const r = parseStatement(grid, { date: 0, description: 1, moneyOut: 2, moneyIn: 3 });
    expect(r.errors).toEqual([]);
    expect(r.lines.map((l) => [l.date, l.amountPesewas])).toEqual([["2026-11-05", 50_000], ["2026-11-06", -1_550]]);
  });
  it("refuses something that is not a workbook, and an empty upload", async () => {
    await expect(readGrid({ fileBase64: Buffer.from("this is not excel").toString("base64") })).rejects.toThrow(/does not look like an Excel/);
    await expect(readGrid({})).rejects.toThrow(/Upload a CSV or Excel/);
  });
});

describe("match scoring", () => {
  const line = { date: "2026-11-05", description: "TRANSFER FROM KOFI MENSAH", reference: "RCT-2026-0001" };
  const ours = (over: object = {}) => ({ date: "2026-11-05", reference: "JE-2026-0009", description: "RCT-2026-0001 Kofi Mensah", entryDescription: "Receipt RCT-2026-0001 - Kofi Mensah", ...over });

  it("scores a same-day entry that carries our document number highest", () => {
    const best = scoreMatch(line, ours())!;
    const plain = scoreMatch(line, ours({ description: "x", entryDescription: "y" }))!;
    expect(best).toBeGreaterThan(plain);
    expect(plain).toBeLessThan(110); // base 100 plus at most a word or two in common (the year in the numbers)
  });
  it("prefers nearer dates and rejects entries outside the window", () => {
    expect(scoreMatch(line, ours({ date: "2026-11-05" }))!).toBeGreaterThan(scoreMatch(line, ours({ date: "2026-11-07" }))!);
    expect(scoreMatch(line, ours({ date: "2026-11-09" }))).toBeNull();
    expect(scoreMatch(line, ours({ date: "2026-11-09" }), 10)).not.toBeNull();
  });
  it("uses shared words as a small tie-breaker", () => {
    const withName = scoreMatch({ date: "2026-11-05", description: "KOFI MENSAH FARMS", reference: null }, { date: "2026-11-05", reference: "JE-1", description: "x", entryDescription: "Receipt - Kofi Mensah Farms" })!;
    const without = scoreMatch({ date: "2026-11-05", description: "SOMEONE ELSE", reference: null }, { date: "2026-11-05", reference: "JE-1", description: "x", entryDescription: "Receipt - Kofi Mensah Farms" })!;
    expect(withName).toBeGreaterThan(without);
  });
});

describe("Paystack webhook signature", () => {
  const prior = process.env.PAYSTACK_SECRET_KEY;
  const provider = new PaystackProvider();
  const body = JSON.stringify({ event: "charge.success", data: { reference: "fin-abc", amount: 10000 } });
  const sign = (raw: string, key = "sk_test_unit_secret_key") => createHmac("sha512", key).update(raw).digest("hex");
  beforeAll(() => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_secret_key";
  });
  afterAll(() => {
    if (prior === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = prior;
  });

  it("accepts the right signature over the exact bytes", () => {
    expect(provider.verifySignature(Buffer.from(body), { "x-paystack-signature": sign(body) })).toBe(true);
    expect(provider.verifySignature(body, { "x-paystack-signature": sign(body).toUpperCase() })).toBe(true);
  });
  it("rejects a changed body, a wrong key, a missing or truncated header, and an unconfigured provider", () => {
    expect(provider.verifySignature(Buffer.from(body.replace("10000", "99999")), { "x-paystack-signature": sign(body) })).toBe(false);
    expect(provider.verifySignature(Buffer.from(body), { "x-paystack-signature": sign(body, "another-key-entirely") })).toBe(false);
    expect(provider.verifySignature(Buffer.from(body), {})).toBe(false);
    expect(provider.verifySignature(Buffer.from(body), { "x-paystack-signature": sign(body).slice(0, 40) })).toBe(false);
    expect(provider.verifySignature("", { "x-paystack-signature": sign("") })).toBe(false);
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(provider.isConfigured()).toBe(false);
    expect(provider.verifySignature(Buffer.from(body), { "x-paystack-signature": sign(body) })).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_secret_key";
  });
  it("reads the event and reference", () => {
    expect(provider.parseWebhook(JSON.parse(body))).toEqual({ event: "charge.success", reference: "fin-abc" });
    expect(provider.parseWebhook({})).toEqual({ event: "", reference: null });
    expect(provider.parseWebhook(null)).toEqual({ event: "", reference: null });
  });
});

describe("raw request body reaches the webhook (same setup as main.ts)", () => {
  @Controller("hook")
  class HookController {
    @Post()
    @HttpCode(200)
    take(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
      return { raw: req.rawBody?.toString("utf8") ?? null, parsed: body };
    }
  }
  @Module({ controllers: [HookController] })
  class HookModule {}

  it("keeps the exact bytes (spacing and key order included) next to the parsed JSON", async () => {
    const mod = await Test.createTestingModule({ imports: [HookModule] }).compile();
    const app = mod.createNestApplication<NestExpressApplication>({ rawBody: true });
    app.useBodyParser("json", { limit: "3mb" }); // the same call main.ts makes
    await app.init();
    const exact = '{ "event":"charge.success",  "data":{"reference":"fin-1"} }';
    const res = await request(app.getHttpServer()).post("/hook").set("Content-Type", "application/json").send(exact);
    expect(res.status).toBe(200);
    expect(res.body.raw).toBe(exact);
    expect(res.body.parsed).toEqual({ event: "charge.success", data: { reference: "fin-1" } });
    // and a valid signature over those exact bytes verifies
    const sig = createHmac("sha512", "sk_test_unit_secret_key").update(res.body.raw).digest("hex");
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_secret_key";
    expect(new PaystackProvider().verifySignature(Buffer.from(res.body.raw), { "x-paystack-signature": sig })).toBe(true);
    delete process.env.PAYSTACK_SECRET_KEY;
    await app.close();
  });
});
