import { AuthenticatedUser } from "@jokas/shared";
import { AlertsService } from "./alerts.service";

const mockPrisma = {
  aiAlert: { findMany: jest.fn(), count: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new AlertsService(mockPrisma as never, mockAudit as never, {} as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: ["alerts.read", "poultry.read"], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: true,
    ...overrides
  };
}

describe("AlertsService.reportCsv — neutralizes formula-injection payloads (M15)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefixes a formula-injection payload in title/location/entity/message with a single quote", async () => {
    mockPrisma.aiAlert.findMany.mockResolvedValue([{
      createdAt: new Date("2026-08-01"), severity: "HIGH", status: "OPEN", category: "MORTALITY_ANOMALY",
      title: "=cmd|'/c calc'!A1", entityName: "+1+1", message: "@SUM(1,1)",
      farm: { name: "-1+1 Farm" }
    }]);
    mockPrisma.aiAlert.count.mockResolvedValue(1);
    const service = makeService();

    const csv = await service.reportCsv(makeUser(), {} as never);

    expect(csv).toContain(`"'=cmd`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'@SUM(1,1)"`);
    expect(csv).toContain(`"'-1+1 Farm"`);
  });

  it("leaves ordinary alert text untouched", async () => {
    mockPrisma.aiAlert.findMany.mockResolvedValue([{
      createdAt: new Date("2026-08-01"), severity: "HIGH", status: "OPEN", category: "MORTALITY_ANOMALY",
      title: "Mortality spike detected", entityName: "Flock A", message: "12 birds lost overnight",
      farm: { name: "North Farm" }
    }]);
    mockPrisma.aiAlert.count.mockResolvedValue(1);
    const service = makeService();

    const csv = await service.reportCsv(makeUser(), {} as never);

    expect(csv).toContain(`"Mortality spike detected"`);
    expect(csv).toContain(`"North Farm"`);
  });
});
