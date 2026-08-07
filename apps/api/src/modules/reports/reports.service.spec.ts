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
