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
