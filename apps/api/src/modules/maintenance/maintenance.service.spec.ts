import { NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { MaintenanceService } from "./maintenance.service";

const mockPrisma = {
  machine: { findFirst: jest.fn() },
  maintenanceSchedule: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  maintenanceRecord: { count: jest.fn().mockResolvedValue(0), create: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new MaintenanceService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("MaintenanceService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("MaintenanceService.createRecord — cross-tenant scheduleId guard (H4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.machine.findFirst.mockResolvedValue({ id: "mach-1", branchId: "branch-1", farmId: null, warehouseId: null, productionSiteId: null });
    mockPrisma.maintenanceRecord.count.mockResolvedValue(0);
  });

  it("rejects when scheduleId belongs to a different company, before creating the record", async () => {
    mockPrisma.maintenanceSchedule.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(
      service.createRecord(makeUser(), { machineId: "mach-1", scheduleId: "sched-OTHER", maintenanceType: "PREVENTIVE" } as never, {})
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.maintenanceSchedule.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "sched-OTHER", companyId: "company-1" })
    });
    expect(mockPrisma.maintenanceRecord.create).not.toHaveBeenCalled();
    expect(mockPrisma.maintenanceSchedule.update).not.toHaveBeenCalled();
  });

  it("proceeds and updates the schedule when scheduleId genuinely belongs to the same company", async () => {
    mockPrisma.maintenanceSchedule.findFirst.mockResolvedValue({ id: "sched-1", companyId: "company-1" });
    mockPrisma.maintenanceRecord.create.mockResolvedValue({ id: "rec-1", maintenanceDate: new Date() });

    const service = makeService();
    await service.createRecord(
      makeUser(),
      { machineId: "mach-1", scheduleId: "sched-1", nextDueDate: "2026-09-01", maintenanceType: "PREVENTIVE" } as never,
      {}
    );

    expect(mockPrisma.maintenanceRecord.create).toHaveBeenCalled();
    expect(mockPrisma.maintenanceSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sched-1" } })
    );
  });

  it("creates a record fine when no scheduleId is given at all", async () => {
    mockPrisma.maintenanceRecord.create.mockResolvedValue({ id: "rec-1", maintenanceDate: new Date() });

    const service = makeService();
    await service.createRecord(makeUser(), { machineId: "mach-1", maintenanceType: "PREVENTIVE" } as never, {});

    expect(mockPrisma.maintenanceSchedule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.maintenanceRecord.create).toHaveBeenCalled();
  });
});
