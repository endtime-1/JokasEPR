// H-BACK-8: payroll gross/net calculations run in plain JS number arithmetic
// before being stored as the database's fixed-precision decimal column — the
// standard floating-point rounding risk (e.g. 19.999999999998 instead of
// 20.00). A full rewrite of the PAYE tax-band engine to Decimal arithmetic
// would be a disproportionate, higher-risk change for what the audit itself
// rated low-likelihood (amounts are typically whole currency units) — this
// gives every computed money value a single, consistent rounding pass before
// storage instead, matching the pattern 3 of the 4 payroll code paths in
// hr.service.ts already used inline (`Math.round(x * 100) / 100`); the other
// paths (this one included) had no rounding step at all.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
