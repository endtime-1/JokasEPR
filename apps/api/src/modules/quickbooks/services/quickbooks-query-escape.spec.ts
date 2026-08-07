import { escapeQboString } from "./quickbooks-query-escape";

describe("escapeQboString — escapes backslashes before quotes (L1)", () => {
  it("escapes a plain single quote", () => {
    expect(escapeQboString("O'Brien")).toBe("O\\'Brien");
  });

  it("escapes a leading backslash before it can neutralize the quote escape", () => {
    // Previously only quotes were escaped: "\' OR '1'='1" would pass through
    // the backslash untouched, then escape only the quotes, producing
    // "\\' OR \'1\'=\'1" — a double-backslash that QBO's parser could read
    // as an escaped literal backslash followed by an *unescaped* terminator.
    const malicious = "\\' OR '1'='1";
    const escaped = escapeQboString(malicious);

    expect(escaped).toBe("\\\\\\' OR \\'1\\'=\\'1");
    // Every quote in the output must be immediately preceded by exactly one backslash.
    expect(escaped.match(/(?<!\\)'/g)).toBeNull();
  });

  it("leaves an ordinary value untouched", () => {
    expect(escapeQboString("INV-2026-001")).toBe("INV-2026-001");
  });
});
