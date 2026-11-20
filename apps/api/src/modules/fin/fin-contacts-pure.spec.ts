import { BadRequestException } from "@nestjs/common";
import { parseCsv, parseCsvObjects, toCsv } from "./fin-csv";
import { nameKey, normalizePhone } from "./fin-contacts.service";
import { rateOn, rateToBasisPoints, splitGross, taxOnNet } from "./fin-tax-math";

describe("fin csv reader", () => {
  it("reads plain, quoted, embedded comma/newline and doubled-quote fields", () => {
    const rows = parseCsv('a,b,c\n1,"two, 2","line1\nline2"\n"he said ""hi""",,x\n');
    expect(rows).toEqual([["a", "b", "c"], ["1", "two, 2", "line1\nline2"], ['he said "hi"', "", "x"]]);
  });
  it("handles CRLF, a UTF-8 BOM, blank lines and a missing final newline", () => {
    const rows = parseCsv("﻿name,phone\r\nKofi,024\r\n\r\nAma,020");
    expect(rows).toEqual([["name", "phone"], ["Kofi", "024"], ["Ama", "020"]]);
  });
  it("detects a semicolon delimiter (regional Excel)", () => {
    expect(parseCsv("name;phone\nKofi;024")).toEqual([["name", "phone"], ["Kofi", "024"]]);
    expect(parseCsv('name,note\nKofi,"a;b"')).toEqual([["name", "note"], ["Kofi", "a;b"]]);
  });
  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('name\n"oops')).toThrow(BadRequestException);
  });
  it("maps headers case-insensitively with aliases and rejects duplicate columns", () => {
    const { rows } = parseCsvObjects("Contact Name,Mobile\nKofi,024", { contact_name: "name", mobile: "phone" });
    expect(rows[0]).toEqual({ line: 2, values: { name: "Kofi", phone: "024" } });
    expect(() => parseCsvObjects("name,Name\na,b")).toThrow(/appears twice/);
    expect(() => parseCsvObjects("")).toThrow(/empty/);
  });
  it("reads an exported cell back exactly (the formula guard is undone on import)", () => {
    const csv = toCsv(["name", "phone"], [["A", "+233244123456"], ["B", "=1+1"]]);
    const { rows } = parseCsvObjects(csv);
    expect(rows.map((r) => r.values.phone)).toEqual(["+233244123456", "=1+1"]);
  });
  it("refuses files over the row limit", () => {
    const big = "name\n" + Array.from({ length: 5001 }, (_, i) => `n${i}`).join("\n");
    expect(() => parseCsvObjects(big)).toThrow(/more than 5000 rows/);
  });
  it("writes a CSV that round-trips, with a BOM, quoting, and formula cells neutralised", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'q"r'], ["=SUM(A1)", "@evil"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'@evil");
    expect(parseCsv(csv)).toEqual([["a", "b"], ["x,y", 'q"r'], ["'=SUM(A1)", "'@evil"]]);
  });
});

describe("fin phone and name normalising", () => {
  it.each([
    ["0244123456", "+233244123456"],
    ["024 412 3456", "+233244123456"],
    ["244123456", "+233244123456"],
    ["233244123456", "+233244123456"],
    ["+233 (24) 412-3456", "+233244123456"],
    ["00233244123456", "+233244123456"],
    ["+44 20 7946 0958", "+442079460958"],
    ["  ", null],
    [null, null]
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input as string | null)).toBe(expected);
  });
  it("rejects letters and impossible lengths", () => {
    expect(() => normalizePhone("024-ABC")).toThrow(BadRequestException);
    expect(() => normalizePhone("12345")).toThrow(/wrong number of digits/);
    expect(() => normalizePhone("+1234567890123456")).toThrow(/wrong number of digits/);
  });
  it("makes names comparable regardless of case, spacing and punctuation", () => {
    expect(nameKey("  KOFI   Mensah-Farms Ltd. ")).toBe(nameKey("kofi mensah farms ltd"));
    expect(nameKey("A & B")).toBe(nameKey("a b"));
  });
});

describe("fin tax maths (whole pesewas, half-up per line)", () => {
  it("adds tax on a net amount", () => {
    expect(taxOnNet(10_000, "15")).toBe(1_500); // 100.00 at 15% = 15.00
    expect(taxOnNet(10_000, "2.5")).toBe(250);
    expect(taxOnNet(999, "15")).toBe(150); // 9.99 x 15% = 1.4985 -> 1.50
    expect(taxOnNet(1, "50")).toBe(1); // 0.5 pesewa rounds up
    expect(taxOnNet(10_000, "0")).toBe(0);
    expect(taxOnNet(-10_000, "15")).toBe(-1_500); // credit notes mirror invoices
    expect(taxOnNet(10_000, "0.25")).toBe(25);
  });
  it("splits a tax-inclusive total so net + tax always equals the gross", () => {
    for (const [gross, rate] of [[11_500, "15"], [10_000, "15"], [999, "12.5"], [1, "15"], [123_456_789, "17.5"]] as const) {
      const { net, tax } = splitGross(gross, rate);
      expect(net + tax).toBe(gross);
    }
    expect(splitGross(11_500, "15")).toEqual({ net: 10_000, tax: 1_500 });
  });
  it("stays exact for the largest amounts a DECIMAL(15,2) can hold", () => {
    expect(taxOnNet(999_999_999_999_999, "100")).toBe(999_999_999_999_999);
    expect(taxOnNet(999_999_999_999_999, "15")).toBe(150_000_000_000_000); // 15% of 9,999,999,999,999.99 = ...999.85, rounded up
  });
  it("validates rates", () => {
    expect(rateToBasisPoints("15")).toBe(150_000);
    expect(rateToBasisPoints("2.5")).toBe(25_000);
    expect(rateToBasisPoints("0.0001")).toBe(1);
    expect(() => rateToBasisPoints("100.0001")).toThrow(/more than 100/);
    expect(() => rateToBasisPoints("-1")).toThrow(BadRequestException);
    expect(() => rateToBasisPoints("15.12345")).toThrow(BadRequestException);
    expect(() => rateToBasisPoints("abc")).toThrow(BadRequestException);
  });
  it("picks the rate in force on a date", () => {
    const rates = [
      { effectiveFrom: new Date("2000-01-01"), ratePercent: "0" },
      { effectiveFrom: new Date("2026-04-01"), ratePercent: "15" },
      { effectiveFrom: new Date("2027-01-01"), ratePercent: "12.5" }
    ];
    expect(rateOn(rates, new Date("1999-12-31"))).toBeNull();
    expect(rateOn(rates, new Date("2026-03-31"))!.ratePercent).toBe("0");
    expect(rateOn(rates, new Date("2026-04-01"))!.ratePercent).toBe("15");
    expect(rateOn(rates, new Date("2026-12-31"))!.ratePercent).toBe("15");
    expect(rateOn(rates, new Date("2030-01-01"))!.ratePercent).toBe("12.5");
  });
});
