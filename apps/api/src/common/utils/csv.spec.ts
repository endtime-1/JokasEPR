import { sanitizeFormulaCell } from "./csv";

describe("sanitizeFormulaCell", () => {
  it("prefixes a leading = with a single quote", () => {
    expect(sanitizeFormulaCell('=cmd|"/c calc"!A1')).toBe('\'=cmd|"/c calc"!A1');
  });

  it("prefixes leading +, -, and @ too", () => {
    expect(sanitizeFormulaCell("+1+1")).toBe("'+1+1");
    expect(sanitizeFormulaCell("-1+1")).toBe("'-1+1");
    expect(sanitizeFormulaCell("@SUM(1,1)")).toBe("'@SUM(1,1)");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeFormulaCell("Acme Farms Ltd")).toBe("Acme Farms Ltd");
  });

  it("leaves an empty string untouched", () => {
    expect(sanitizeFormulaCell("")).toBe("");
  });
});
