import { BadRequestException } from "@nestjs/common";
import { displayStatus } from "./fin-invoices.service";
import { FinLinksService } from "./fin-links.service";
import { addDays, computeLine, daysBetween, nthOccurrence, parsePercent, parseQuantity, sumLines } from "./fin-sales-math";
import { formatPercent, formatQuantity } from "./fin-sales-lines";

describe("sales line maths (whole pesewas, half-up)", () => {
  it("prices a plain line", () => {
    expect(computeLine({ quantity: "2", unitPrice: "336.00" })).toEqual({ gross: 67_200, discount: 0, net: 67_200, tax: 0, total: 67_200 });
  });

  it("applies a percentage discount before tax", () => {
    // 10 x 100.00 = 1,000.00; 10% off = 100.00; net 900.00; 15% tax = 135.00
    expect(computeLine({ quantity: 10, unitPrice: 100, discountPercent: "10", taxRatePercent: "15" })).toEqual({ gross: 100_000, discount: 10_000, net: 90_000, tax: 13_500, total: 103_500 });
  });

  it("rounds half-up at every step, never with floats", () => {
    // 3 x 0.335 is impossible (2dp prices), but 0.335 of a unit is: 0.335 x 10.00 = 3.35
    expect(computeLine({ quantity: "0.335", unitPrice: "10" }).gross).toBe(335);
    // 1/3 style: 0.3333 x 10.00 = 3.333 -> 3.33
    expect(computeLine({ quantity: "0.3333", unitPrice: "10" }).gross).toBe(333);
    // 0.5 pesewa rounds up: 0.0005 x 10.00 = 0.005 -> 0.01
    expect(computeLine({ quantity: "0.0005", unitPrice: "10" }).gross).toBe(1);
    // discount 12.5% of 9.99 = 1.24875 -> 1.25; net 8.74; tax 15% = 1.311 -> 1.31
    const l = computeLine({ quantity: 1, unitPrice: "9.99", discountPercent: "12.5", taxRatePercent: "15" });
    expect(l).toEqual({ gross: 999, discount: 125, net: 874, tax: 131, total: 1005 });
  });

  it("stays exact at the largest amounts a DECIMAL(15,2) can hold", () => {
    const l = computeLine({ quantity: "1", unitPrice: "9999999999999.99", taxRatePercent: "0" });
    expect(l.net).toBe(999_999_999_999_999);
    // 100,000 x 9,999,999.99 = 999,999,999,000.00 = 99,999,999,900,000 pesewas
    expect(computeLine({ quantity: "100000", unitPrice: "9999999.99" }).gross).toBe(99_999_999_900_000);
  });

  it("sums a document from its lines (tax is per line, then added up)", () => {
    const a = computeLine({ quantity: 1, unitPrice: "0.10", taxRatePercent: "15" }); // tax 0.015 -> 0.02
    const b = computeLine({ quantity: 1, unitPrice: "0.10", taxRatePercent: "15" });
    const t = sumLines([a, b]);
    expect(a.tax).toBe(2);
    expect(t).toEqual({ subtotal: 20, discountTotal: 0, taxTotal: 4, total: 24 });
    expect(t.total).toBe(t.subtotal - t.discountTotal + t.taxTotal);
  });

  it("rejects bad quantities, prices and percentages", () => {
    expect(() => computeLine({ quantity: "0", unitPrice: "1" })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: "-1", unitPrice: "1" })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: "1.00001", unitPrice: "1" })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: "abc", unitPrice: "1" })).toThrow(BadRequestException);
    expect(() => computeLine({ quantity: 1, unitPrice: "-5" })).toThrow(/negative/);
    expect(() => computeLine({ quantity: 1, unitPrice: "1.234" })).toThrow(/2 decimal/);
    expect(() => computeLine({ quantity: 1, unitPrice: "1", discountPercent: "100.01" })).toThrow(/more than 100/);
    expect(() => computeLine({ quantity: 1, unitPrice: "1", discountPercent: "5.555" })).toThrow(BadRequestException);
  });

  it("allows a 100% discount (a free line)", () => {
    expect(computeLine({ quantity: 1, unitPrice: "50", discountPercent: "100", taxRatePercent: "15" })).toEqual({ gross: 5_000, discount: 5_000, net: 0, tax: 0, total: 0 });
  });

  it("parses and formats quantities and percentages", () => {
    expect(parseQuantity("2.5")).toBe(25_000);
    expect(parseQuantity(7)).toBe(70_000);
    expect(formatQuantity(25_000)).toBe("2.5000");
    expect(formatQuantity(1)).toBe("0.0001");
    expect(parsePercent("12.5")).toBe(1_250);
    expect(parsePercent(null)).toBe(0);
    expect(formatPercent(1_250)).toBe("12.50");
  });
});

describe("recurring schedule dates", () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);

  it("weekly adds 7 days each time", () => {
    expect([0, 1, 2, 5].map((n) => iso(nthOccurrence(d("2026-11-20"), "WEEKLY", n)))).toEqual(["2026-11-20", "2026-11-27", "2026-12-04", "2026-12-25"]);
  });

  it("monthly keeps the day of month, and clamps to short months without drifting", () => {
    const start = d("2026-01-31");
    expect([0, 1, 2, 3, 12].map((n) => iso(nthOccurrence(start, "MONTHLY", n)))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2027-01-31"]);
    expect(iso(nthOccurrence(d("2027-12-15"), "MONTHLY", 2))).toBe("2028-02-15");
    expect(iso(nthOccurrence(d("2028-01-31"), "MONTHLY", 1))).toBe("2028-02-29"); // leap year
  });

  it("adds days and counts days between dates", () => {
    expect(iso(addDays(d("2026-12-30"), 5))).toBe("2027-01-04");
    expect(daysBetween(d("2026-11-01"), d("2026-11-15"))).toBe(14);
    expect(daysBetween(d("2026-11-15"), d("2026-11-01"))).toBe(-14);
  });
});

describe("invoice display status", () => {
  const today = new Date("2026-11-20T00:00:00.000Z");
  const due = (s: string) => new Date(`${s}T00:00:00.000Z`);
  it("derives paid, partially paid, overdue, sent, void and draft", () => {
    expect(displayStatus({ status: "DRAFT", paymentStatus: "UNPAID", dueDate: due("2026-12-01") }, today)).toBe("DRAFT");
    expect(displayStatus({ status: "VOID", paymentStatus: "UNPAID", dueDate: due("2026-01-01") }, today)).toBe("VOID");
    expect(displayStatus({ status: "SENT", paymentStatus: "PAID", dueDate: due("2026-01-01") }, today)).toBe("PAID");
    expect(displayStatus({ status: "SENT", paymentStatus: "UNPAID", dueDate: due("2026-11-19") }, today)).toBe("OVERDUE");
    expect(displayStatus({ status: "SENT", paymentStatus: "PARTIAL", dueDate: due("2026-11-19") }, today)).toBe("OVERDUE");
    expect(displayStatus({ status: "SENT", paymentStatus: "UNPAID", dueDate: due("2026-11-20") }, today)).toBe("SENT"); // due today is not yet overdue
    expect(displayStatus({ status: "SENT", paymentStatus: "PARTIAL", dueDate: due("2026-12-01") }, today)).toBe("PARTIALLY_PAID");
  });
});

describe("public link tokens", () => {
  const links = new FinLinksService();
  const id = "11111111-2222-4333-8444-555555555555";
  const prior = process.env.FIN_LINK_SECRET;
  beforeAll(() => {
    process.env.FIN_LINK_SECRET = "unit-test-secret-which-is-long-enough";
  });
  afterAll(() => {
    if (prior === undefined) delete process.env.FIN_LINK_SECRET;
    else process.env.FIN_LINK_SECRET = prior;
  });

  it("makes a token that verifies for its own invoice and version only", () => {
    const token = links.invoiceToken(id, 1);
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    const parsed = links.parseInvoiceToken(token)!;
    expect(parsed.invoiceId).toBe(id);
    expect(links.verifyInvoice(parsed, 1)).toBe(true);
    expect(links.verifyInvoice(parsed, 2)).toBe(false); // regenerating the link kills the old one
  });

  it("is deterministic (so the link can be shown again) but different per invoice and version", () => {
    expect(links.invoiceToken(id, 1)).toBe(links.invoiceToken(id, 1));
    expect(links.invoiceToken(id, 1)).not.toBe(links.invoiceToken(id, 2));
    expect(links.invoiceToken(id, 1)).not.toBe(links.invoiceToken("11111111-2222-4333-8444-555555555556", 1));
  });

  it("rejects tampering, wrong lengths and junk without throwing", () => {
    const token = links.invoiceToken(id, 1);
    const [i, mac] = token.split(".");
    const forged = links.parseInvoiceToken(`${i}.${mac.slice(0, 31)}${mac.endsWith("A") ? "B" : "A"}`)!;
    expect(links.verifyInvoice(forged, 1)).toBe(false);
    for (const bad of ["", "abc", `${i}`, `${i}.short`, `not-a-uuid.${mac}`, `${i}.${mac}.extra`, undefined as unknown as string]) {
      expect(links.parseInvoiceToken(bad)).toBeNull();
    }
  });

  it("signs statements for one customer and one date range only", () => {
    const t = links.statementToken(id, "2026-01-01", "2026-03-31");
    expect(links.parseStatementToken(t)).toEqual({ contactId: id, from: "2026-01-01", to: "2026-03-31" });
    const parts = t.split(".");
    expect(links.parseStatementToken(`${parts[0]}.2026-01-01.2026-12-31.${parts[3]}`)).toBeNull(); // widened range
    expect(links.parseStatementToken(`${parts[0]}.2026-01-01.2026-03-31.${"x".repeat(32)}`)).toBeNull();
    expect(links.parseStatementToken("garbage")).toBeNull();
  });

  it("will not make links when the server has no secret", () => {
    const keep = { a: process.env.FIN_LINK_SECRET, b: process.env.JWT_ACCESS_SECRET };
    delete process.env.FIN_LINK_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => links.invoiceToken(id, 1)).toThrow(/not configured/);
    process.env.FIN_LINK_SECRET = keep.a;
    if (keep.b !== undefined) process.env.JWT_ACCESS_SECRET = keep.b;
  });

  it("builds a WhatsApp link with the number when known", () => {
    expect(links.whatsappUrl("+233244123456", "Hello there & more")).toBe("https://wa.me/233244123456?text=Hello%20there%20%26%20more");
    expect(links.whatsappUrl(null, "Hi")).toBe("https://wa.me/?text=Hi");
  });
});
