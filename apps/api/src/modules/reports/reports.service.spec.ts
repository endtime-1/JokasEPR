import { PERMISSIONS } from "@jokas/shared";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  it("is defined", () => {
    const service = new ReportsService({} as never, {} as never);
    expect(service).toBeDefined();
  });

  it("filters the report catalog by user permissions", () => {
    const service = new ReportsService({} as never, {} as never);
    const result = service.catalog({
      id: "user-1",
      companyId: "company-1",
      email: "farm@example.test",
      fullName: "Farm Manager",
      roles: ["Farm Manager"],
      permissions: [PERMISSIONS.PLATFORM_READ, PERMISSIONS.POULTRY_READ],
      branchIds: [],
      farmIds: [],
      warehouseIds: [],
      productionSiteIds: [],
      hasGlobalAccess: false
    });

    expect(result.data.some((report) => report.id === "poultry.daily")).toBe(true);
    expect(result.data.some((report) => report.id === "finance.profit-loss")).toBe(false);
  });
});

describe("ReportsService.run — where() empty-array convention (H12)", () => {
  const mockPrisma = { dailyPoultryRecord: { findMany: jest.fn().mockResolvedValue([]) } };

  function makeUser(overrides: Partial<Parameters<ReportsService["catalog"]>[0]> = {}) {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [PERMISSIONS.POULTRY_READ], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: false,
      ...overrides
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("does not restrict to an empty branchId/farmId IN() for an unrestricted (empty-array) user", async () => {
    // d8570ec fixed options() for this exact pattern but missed where() —
    // the method that actually filters report rows. An empty branchIds
    // array here must mean "unrestricted", not "matches nothing".
    const service = new ReportsService(mockPrisma as never, {} as never);
    await service.run("poultry.daily", makeUser() as never, {} as never);

    const where = mockPrisma.dailyPoultryRecord.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("restricts via OR to the user's own branch/farm ids when they do have assignments", async () => {
    const service = new ReportsService(mockPrisma as never, {} as never);
    await service.run("poultry.daily", makeUser({ branchIds: ["branch-1"] }) as never, {} as never);

    const where = mockPrisma.dailyPoultryRecord.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ branchId: { in: ["branch-1"] } }]);
  });

  it("applies no OR restriction at all for a global-access user", async () => {
    const service = new ReportsService(mockPrisma as never, {} as never);
    await service.run("poultry.daily", makeUser({ hasGlobalAccess: true }) as never, {} as never);

    const where = mockPrisma.dailyPoultryRecord.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });
});

describe("ReportsService.run — row-cap truncation is surfaced, not silent (M6)", () => {
  function makeUser(overrides: Partial<Parameters<ReportsService["catalog"]>[0]> = {}) {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [PERMISSIONS.POULTRY_READ], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: false,
      ...overrides
    };
  }

  it("sets truncated: true and caps rows at 1000 when more than 1000 rows match", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ recordDate: new Date(2026, 0, 1 + i), totalEggs: 10 }));
    const mockPrisma = { dailyPoultryRecord: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new ReportsService(mockPrisma as never, {} as never);

    const result = await service.run("poultry.daily", makeUser() as never, {} as never);

    expect(result.data.truncated).toBe(true);
    expect(result.data.rows).toHaveLength(1000);
  });

  it("sets truncated: false when the result is within the cap", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ recordDate: new Date(2026, 0, 1 + i), totalEggs: 10 }));
    const mockPrisma = { dailyPoultryRecord: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new ReportsService(mockPrisma as never, {} as never);

    const result = await service.run("poultry.daily", makeUser() as never, {} as never);

    expect(result.data.truncated).toBe(false);
    expect(result.data.rows).toHaveLength(5);
  });
});

describe("ReportsService.run — resolveIds() scopes the ID-to-name lookup to the caller's company (2026-08-25)", () => {
  function makeUser(overrides: Partial<Parameters<ReportsService["catalog"]>[0]> = {}) {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [PERMISSIONS.POULTRY_READ], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: false,
      ...overrides
    };
  }

  it("includes companyId in the flockBatch/poultryHouse lookup, not just id IN (...)", async () => {
    // The ids here are always drawn from rows the main query already scoped
    // to this company, so this was never a reachable leak in practice — but
    // a bare `id: { in: ids }` with no companyId still tripped
    // PrismaService's tenant guard (a WARN logged on every report view with
    // a Flock/House column) and left no real defense if that assumption
    // ever stopped holding as ID_MODELS grows.
    const mockPrisma = {
      dailyPoultryRecord: { findMany: jest.fn().mockResolvedValue([{ recordDate: new Date(2026, 0, 1), flockBatchId: "batch-1" }]) },
      flockBatch: { findMany: jest.fn().mockResolvedValue([{ id: "batch-1", code: "FB-1" }]) }
    };
    const service = new ReportsService(mockPrisma as never, {} as never);

    await service.run("poultry.daily", makeUser() as never, {} as never);

    const where = mockPrisma.flockBatch.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe("company-1");
    expect(where.id).toEqual({ in: ["batch-1"] });
  });
});

describe("ReportsService — totals() averages percent columns instead of summing them (M6)", () => {
  it("averages a percent-typed column across rows", () => {
    const service = new ReportsService({} as never, {} as never);
    const columns = [{ key: "margin", label: "Margin %", type: "percent" as const }];
    const rows = [{ margin: 80 }, { margin: 60 }, { margin: 40 }];

    const totals = (service as unknown as { totals: (c: typeof columns, r: typeof rows) => Record<string, number> }).totals(columns, rows);

    // Previously summed: 80 + 60 + 40 = 180 ("Total margin: 180%").
    expect(totals.margin).toBe(60);
  });

  it("still sums money/number columns as before", () => {
    const service = new ReportsService({} as never, {} as never);
    const columns = [{ key: "amount", label: "Amount", type: "money" as const }];
    const rows = [{ amount: 100 }, { amount: 200 }];

    const totals = (service as unknown as { totals: (c: typeof columns, r: typeof rows) => Record<string, number> }).totals(columns, rows);

    expect(totals.amount).toBe(300);
  });

  it("returns 0 for a percent column with no rows, instead of dividing by zero", () => {
    const service = new ReportsService({} as never, {} as never);
    const columns = [{ key: "margin", label: "Margin %", type: "percent" as const }];

    const totals = (service as unknown as { totals: (c: typeof columns, r: never[]) => Record<string, number> }).totals(columns, []);

    expect(totals.margin).toBe(0);
  });
});

describe("ReportsService — totals() uses the latest row for balance columns instead of summing them", () => {
  it("uses the first row's value for a balance-typed column, not the sum across rows", () => {
    const service = new ReportsService({} as never, {} as never);
    const columns = [{ key: "openingBirdCount", label: "Opening Birds", type: "balance" as const }];
    // rows arrive ordered desc by date (see run()), so rows[0] is the most
    // recent day's snapshot — 4500 birds today, not 4500 + 4800 + 5000 across
    // every day this flock has ever been recorded.
    const rows = [{ openingBirdCount: 4500 }, { openingBirdCount: 4800 }, { openingBirdCount: 5000 }];

    const totals = (service as unknown as { totals: (c: typeof columns, r: typeof rows) => Record<string, number> }).totals(columns, rows);

    expect(totals.openingBirdCount).toBe(4500);
  });

  it("returns 0 for a balance column with no rows", () => {
    const service = new ReportsService({} as never, {} as never);
    const columns = [{ key: "openingBirdCount", label: "Opening Birds", type: "balance" as const }];

    const totals = (service as unknown as { totals: (c: typeof columns, r: never[]) => Record<string, number> }).totals(columns, []);

    expect(totals.openingBirdCount).toBe(0);
  });
});

describe("ReportsService.runDocument — poultry batch lifecycle", () => {
  function makeUser(overrides: Partial<Parameters<ReportsService["catalog"]>[0]> = {}) {
    return {
      id: "u-1", companyId: "co-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [PERMISSIONS.POULTRY_READ], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: false, ...overrides,
    };
  }

  const batch = {
    id: "b-1", code: "FB-1", name: "Flock 1", birdType: "BROILERS", status: "ACTIVE",
    openingBirdCount: 1000, startDate: new Date(Date.now() - 21 * 86400000), farmId: "f-1",
    farm: { name: "Adenta", code: "ADN" }, poultryHouse: { name: "House 1", code: "H1" },
    dailyRecords: [],
    mortalityRecords: [
      { recordDate: new Date(Date.now() - 20 * 86400000), birdCount: 10, isCulling: false },
      { recordDate: new Date(Date.now() - 10 * 86400000), birdCount: 40, isCulling: false },
      { recordDate: new Date(Date.now() - 5 * 86400000), birdCount: 5, isCulling: true },
    ],
    feedConsumptionRecords: [{ recordDate: new Date(Date.now() - 10 * 86400000), quantityKg: 300 }],
    eggProductionRecords: [],
    birdWeightRecords: [{ recordDate: new Date(Date.now() - 2 * 86400000), averageWeightKg: 1.6 }],
    medicationRecords: [{ startDate: new Date(Date.now() - 8 * 86400000), medicationName: "Amoxi" }],
    vaccinationRecords: [],
    healthObservations: [],
    poultryTransferRecords: [],
    costRecords: [{ costDate: new Date(Date.now() - 9 * 86400000), costType: "FEED", amount: 900 }],
  };

  it("computes mortality %, alive count and a bird-survival curve", async () => {
    const mockPrisma = { flockBatch: { findFirst: jest.fn().mockResolvedValue(batch) } };
    const service = new ReportsService(mockPrisma as never, {} as never);

    const { data } = await service.runDocument("poultry.batch-lifecycle", makeUser() as never, { scopeType: "batch", scopeId: "b-1" } as never);

    expect(data.scope.label).toBe("FB-1 — Flock 1");
    const kpis = data.sections.find((s) => s.type === "kpis") as { items: { label: string; value: string }[] };
    expect(kpis.items.find((i) => i.label === "Live birds")?.value).toBe("945"); // 1000 - 50 deaths - 5 culls
    expect(kpis.items.find((i) => i.label === "Mortality")?.value).toBe("5%");
    const curve = data.sections.find((s) => s.type === "line-chart" && s.title === "Bird survival") as { data: Record<string, number>[] };
    expect(curve.data.at(-1)?.cumulativeMortality).toBe(50);
  });

  it("rejects a scopeType mismatch", async () => {
    const service = new ReportsService({ flockBatch: { findFirst: jest.fn() } } as never, {} as never);
    await expect(
      service.runDocument("poultry.batch-lifecycle", makeUser() as never, { scopeType: "farm", scopeId: "f-1" } as never),
    ).rejects.toThrow(/runs on a "batch"/);
  });
});

describe("ReportsService — CSV/XLS formula-injection neutralization (M12)", () => {
  function makeReportResult(cellValue: unknown) {
    return {
      definition: { id: "test", title: "Test Report", category: "Sales and Finance", columns: [{ key: "name", label: "Name" }] },
      rows: [{ name: cellValue }],
      totals: {}
    } as never;
  }

  it("prefixes a formula-injection payload in CSV output with a single quote", () => {
    const service = new ReportsService({} as never, {} as never);
    const csv = (service as unknown as { csv: (r: unknown) => string }).csv(makeReportResult('=cmd|"/c calc"!A1'));

    expect(csv).toContain(`"'=cmd`);
  });

  it("prefixes +, -, and @ leading characters too, not just =", () => {
    const service = new ReportsService({} as never, {} as never);
    const plus = (service as unknown as { csv: (r: unknown) => string }).csv(makeReportResult("+1+1"));
    const at = (service as unknown as { csv: (r: unknown) => string }).csv(makeReportResult("@SUM(1,1)"));

    expect(plus).toContain(`"'+1+1"`);
    expect(at).toContain(`"'@SUM`);
  });

  it("leaves an ordinary business name untouched", () => {
    const service = new ReportsService({} as never, {} as never);
    const csv = (service as unknown as { csv: (r: unknown) => string }).csv(makeReportResult("Acme Farms Ltd"));

    expect(csv).toContain(`"Acme Farms Ltd"`);
  });

  it("prefixes a formula-injection payload in the XLS/XML output too", () => {
    const service = new ReportsService({} as never, {} as never);
    const xls = (service as unknown as { excel: (r: unknown) => string }).excel(makeReportResult("=HYPERLINK(\"http://evil\")"));

    expect(xls).toContain("'=HYPERLINK");
  });
});
