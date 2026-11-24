import { BadRequestException } from "@nestjs/common";
import { FIN_PERMISSION_CATALOG, FIN_PERMISSIONS } from "@jokas/shared";
import { FIN_ACCOUNT_ROLES, FIN_CHART_TEMPLATE } from "./fin-chart-template";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { FIN_DOC_TYPES, formatDocNumber } from "./fin-numbering.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { validateLogoDataUrl } from "./fin-settings.service";

describe("fin money (pesewas)", () => {
  it("parses whole and decimal amounts exactly", () => {
    expect(toPesewas("10")).toBe(1000);
    expect(toPesewas("10.5")).toBe(1050);
    expect(toPesewas("10.05")).toBe(1005);
    expect(toPesewas(0.1 + 0.2)).toBe(30); // binary noise is not a 3rd decimal
    expect(toPesewas(19.99)).toBe(1999);
    expect(toPesewas(1.005 * 1000)).toBe(100500);
    expect(toPesewas(null)).toBe(0);
    expect(toPesewas("")).toBe(0);
    expect(toPesewas("12.300")).toBe(1230);
  });

  it("rejects more than 2 decimals, junk and out-of-range values", () => {
    expect(() => toPesewas("1.234")).toThrow(BadRequestException);
    expect(() => toPesewas("abc")).toThrow(BadRequestException);
    expect(() => toPesewas(Number.NaN)).toThrow(BadRequestException);
    expect(() => toPesewas("1e5")).toThrow(BadRequestException);
    expect(() => toPesewas("99999999999999.99")).toThrow(BadRequestException);
    expect(toPesewas("9999999999999.99")).toBe(999_999_999_999_999);
  });

  it("formats DECIMAL(15,2) strings and round-trips", () => {
    expect(pesewasToDecimal(12345)).toBe("123.45");
    expect(pesewasToDecimal(5)).toBe("0.05");
    expect(pesewasToDecimal(0)).toBe("0.00");
    expect(pesewasToDecimal(-250)).toBe("-2.50");
    expect(decimalToPesewas("123.45")).toBe(12345);
    expect(decimalToPesewas({ toString: () => "7.10" })).toBe(710);
    expect(decimalToPesewas(null)).toBe(0);
  });

  it("sums without floating point drift", () => {
    const parts = Array.from({ length: 10 }, () => toPesewas("0.10"));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("fin numbering format", () => {
  it("formats with and without the year", () => {
    expect(formatDocNumber({ prefix: "INV", padding: 4, includeYear: true }, 7, 2026)).toBe("INV-2026-0007");
    expect(formatDocNumber({ prefix: "RCT", padding: 6, includeYear: false }, 12, 2026)).toBe("RCT-000012");
    expect(formatDocNumber({ prefix: "JE", padding: 3, includeYear: true }, 1234, 2026)).toBe("JE-2026-1234");
  });

  it("has a default sequence for every document type the module will need", () => {
    for (const t of ["INVOICE", "BILL", "RECEIPT", "PAYMENT", "JOURNAL", "POS_SALE", "CREDIT_NOTE", "QUOTE"]) {
      expect(FIN_DOC_TYPES[t]).toBeDefined();
    }
  });
});

describe("fin dates", () => {
  it("parses calendar days as UTC midnight", () => {
    expect(parseDay("2026-11-20").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(parseDay("2026-11-20T23:59:59.000Z").toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(dayString(parseDay(new Date("2026-02-28T18:00:00Z")))).toBe("2026-02-28");
  });
  it("rejects nonsense", () => {
    expect(() => parseDay("not a date")).toThrow(BadRequestException);
    expect(() => parseDay("2026-13-45")).toThrow(BadRequestException);
  });
});

describe("fin logo validation", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  it("accepts a small png/jpeg/webp data URL", () => {
    expect(() => validateLogoDataUrl(png)).not.toThrow();
    expect(() => validateLogoDataUrl("data:image/jpeg;base64,/9j/4AAQ")).not.toThrow();
  });
  it("rejects other types, scripts and oversize images", () => {
    expect(() => validateLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow(BadRequestException);
    expect(() => validateLogoDataUrl("data:text/html;base64,PGh0bWw+")).toThrow(BadRequestException);
    expect(() => validateLogoDataUrl("javascript:alert(1)")).toThrow(BadRequestException);
    expect(() => validateLogoDataUrl("data:image/png;base64," + "A".repeat(1_000_000))).toThrow(BadRequestException);
  });
});

describe("poultry and feed chart template", () => {
  const byCode = new Map(FIN_CHART_TEMPLATE.map((a) => [a.code, a]));

  it("has unique codes and lists every parent before its children", () => {
    expect(byCode.size).toBe(FIN_CHART_TEMPLATE.length);
    const seen = new Set<string>();
    for (const a of FIN_CHART_TEMPLATE) {
      if (a.parent) expect(seen.has(a.parent)).toBe(true);
      seen.add(a.code);
    }
  });

  it("only hangs accounts under headings of the same type", () => {
    for (const a of FIN_CHART_TEMPLATE) {
      if (!a.parent) continue;
      const parent = byCode.get(a.parent)!;
      expect(parent.postable).toBe(false);
      expect(parent.type).toBe(a.type);
    }
  });

  it("every heading has at least one account under it and never holds a role", () => {
    for (const h of FIN_CHART_TEMPLATE.filter((a) => a.postable === false)) {
      expect(FIN_CHART_TEMPLATE.some((a) => a.parent === h.code)).toBe(true);
      expect(h.role).toBeUndefined();
    }
  });

  it("roles are valid, unique, on posting accounts, and match the account type", () => {
    const seen = new Set<string>();
    for (const a of FIN_CHART_TEMPLATE.filter((x) => x.role)) {
      const def = FIN_ACCOUNT_ROLES[a.role!];
      expect(def).toBeDefined();
      expect(def.type).toBe(a.type);
      expect(a.postable).not.toBe(false);
      expect(seen.has(a.role!)).toBe(false);
      seen.add(a.role!);
    }
  });

  it("fills every role the ledger and the later modules need", () => {
    const filled = new Set(FIN_CHART_TEMPLATE.filter((a) => a.role).map((a) => a.role));
    for (const role of Object.keys(FIN_ACCOUNT_ROLES)) expect(filled.has(role)).toBe(true);
  });

  it("covers all five account types with a poultry/feed/soya flavour", () => {
    for (const t of ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]) expect(FIN_CHART_TEMPLATE.some((a) => a.type === t)).toBe(true);
    const names = FIN_CHART_TEMPLATE.map((a) => a.name).join("|");
    for (const word of ["Egg", "Feed", "Soya", "Layer", "Vaccine", "Mortality"]) expect(names).toContain(word);
  });

  it("starts the tax account inactive (the business does not charge VAT today)", () => {
    expect(byCode.get("2180")?.active).toBe(false);
  });
});

describe("fin permissions", () => {
  it("catalog and constants list exactly the same keys, all prefixed fin.", () => {
    const catalog = FIN_PERMISSION_CATALOG.map(([k]) => k).sort();
    const constants = Object.values(FIN_PERMISSIONS).sort();
    expect(catalog).toEqual(constants);
    expect(new Set(catalog).size).toBe(catalog.length);
    for (const k of catalog) expect(k.startsWith("fin.")).toBe(true);
  });

  it("covers every menu area with the actions that make sense", () => {
    const keys = new Set(FIN_PERMISSION_CATALOG.map(([k]) => k));
    for (const area of ["sales", "purchases", "banking", "pos", "payroll", "accounting"]) {
      for (const action of ["view", "create", "approve", "post", "void"]) expect(keys.has(`fin.${area}.${action}`)).toBe(true);
    }
    for (const k of ["fin.dashboard.view", "fin.reports.view", "fin.reports.export", "fin.settings.view", "fin.settings.settings", "fin.accounting.settings"]) {
      expect(keys.has(k)).toBe(true);
    }
  });
});

describe("fin deadlock retry", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isDeadlock, retryOnDeadlock } = require("./fin-retry") as typeof import("./fin-retry");
  it("recognises Prisma and raw MySQL deadlocks only", () => {
    expect(isDeadlock({ code: "P2034" })).toBe(true);
    expect(isDeadlock({ code: "P2010", meta: { code: "1213", message: "Deadlock found when trying to get lock" } })).toBe(true);
    expect(isDeadlock(new Error("Deadlock found when trying to get lock; try restarting transaction"))).toBe(true);
    expect(isDeadlock({ code: "P2002" })).toBe(false);
    expect(isDeadlock(new Error("fin: a journal entry must balance"))).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
  });
  it("retries a deadlock victim, but never an ordinary error", async () => {
    let calls = 0;
    await expect(retryOnDeadlock(async () => { calls++; if (calls < 3) throw { code: "P2034" }; return "ok"; })).resolves.toBe("ok");
    expect(calls).toBe(3);
    let bad = 0;
    await expect(retryOnDeadlock(async () => { bad++; throw new Error("nope"); })).rejects.toThrow("nope");
    expect(bad).toBe(1);
    let always = 0;
    await expect(retryOnDeadlock(async () => { always++; throw { code: "P2034" }; }, 3)).rejects.toMatchObject({ code: "P2034" });
    expect(always).toBe(3);
  });
});
