import { NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { MaintenanceService } from "./maintenance.service";
import { nextRef } from "../../common/next-ref";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-001") }));

const mockPrisma = {
  machine: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  equipment: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  maintenanceSchedule: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), count: jest.fn(), findMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: "sched-1" }) },
  maintenanceRecord: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
  breakdownRecord: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: "bd-1" }) },
  machineDowntimeRecord: { aggregate: jest.fn() },
  maintenanceCost: { aggregate: jest.fn(), findMany: jest.fn() },
  technicianAssignment: { findMany: jest.fn() }
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

describe("MaintenanceService.dashboard — does not mask query failures as an all-zero payload (M1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.machine.count.mockResolvedValue(0);
    mockPrisma.maintenanceSchedule.count.mockResolvedValue(0);
    mockPrisma.maintenanceSchedule.findMany.mockResolvedValue([]);
    mockPrisma.breakdownRecord.count.mockResolvedValue(0);
    mockPrisma.breakdownRecord.findMany.mockResolvedValue([]);
    mockPrisma.machineDowntimeRecord.aggregate.mockResolvedValue({ _sum: { durationHours: 0 } });
    mockPrisma.maintenanceCost.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.technicianAssignment.findMany.mockResolvedValue([]);
  });

  it("rejects instead of silently returning an all-zero payload when a query fails", async () => {
    mockPrisma.machine.count.mockRejectedValueOnce(new Error("connection pool exhausted"));
    const service = makeService();

    await expect(service.dashboard(makeUser(), {} as never)).rejects.toThrow();
  });

  it("returns real counts on the happy path", async () => {
    mockPrisma.machine.count.mockResolvedValueOnce(7);
    const service = makeService();

    const result = await service.dashboard(makeUser(), {} as never);
    expect(result.data.machineCount).toBe(7);
  });
});

describe("MaintenanceService.updateBreakdown — restores asset status once resolved (M13)", () => {
  beforeEach(() => jest.clearAllMocks());

  function breakdown(overrides: Record<string, unknown> = {}) {
    return {
      id: "bd-1", status: "IN_REPAIR", machineId: "mach-1", equipmentId: null,
      resolvedById: null, resolvedAt: null,
      ...overrides
    };
  }

  it("restores the machine to ACTIVE when the last open breakdown against it is resolved", async () => {
    mockPrisma.breakdownRecord.findFirst.mockResolvedValue(breakdown());
    mockPrisma.breakdownRecord.count.mockResolvedValue(0); // no other open breakdowns
    const service = makeService();

    await service.updateBreakdown(makeUser(), "bd-1", { status: "RESOLVED" } as never, {});

    expect(mockPrisma.machine.update).toHaveBeenCalledWith({ where: { id: "mach-1" }, data: { status: "ACTIVE", updatedById: "user-1" } });
  });

  it("does NOT restore the machine while another breakdown against it is still open", async () => {
    // The exact bug this guards against fixing: naively flipping status back
    // to ACTIVE on any resolve would falsely clear a machine with a second,
    // still-unresolved breakdown.
    mockPrisma.breakdownRecord.findFirst.mockResolvedValue(breakdown());
    mockPrisma.breakdownRecord.count.mockResolvedValue(1); // one other breakdown still open
    const service = makeService();

    await service.updateBreakdown(makeUser(), "bd-1", { status: "RESOLVED" } as never, {});

    expect(mockPrisma.machine.update).not.toHaveBeenCalled();
  });

  it("restores equipment status independently of its parent machine's status", async () => {
    mockPrisma.breakdownRecord.findFirst.mockResolvedValue(breakdown({ equipmentId: "equip-1" }));
    mockPrisma.breakdownRecord.count.mockResolvedValue(0);
    const service = makeService();

    await service.updateBreakdown(makeUser(), "bd-1", { status: "CLOSED" } as never, {});

    expect(mockPrisma.equipment.update).toHaveBeenCalledWith({ where: { id: "equip-1" }, data: { status: "ACTIVE", updatedById: "user-1" } });
    expect(mockPrisma.machine.update).toHaveBeenCalledWith({ where: { id: "mach-1" }, data: { status: "ACTIVE", updatedById: "user-1" } });
  });

  it("does not touch machine/equipment status for a non-resolving transition", async () => {
    mockPrisma.breakdownRecord.findFirst.mockResolvedValue(breakdown({ status: "REPORTED" }));
    const service = makeService();

    await service.updateBreakdown(makeUser(), "bd-1", { status: "ASSIGNED" } as never, {});

    expect(mockPrisma.machine.update).not.toHaveBeenCalled();
    expect(mockPrisma.breakdownRecord.count).not.toHaveBeenCalled();
  });
});

describe("MaintenanceService.reportCsv — neutralizes formula-injection payloads (M15)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefixes a formula-injection payload in the asset name/description with a single quote", async () => {
    mockPrisma.maintenanceCost.findMany.mockResolvedValue([{
      costDate: new Date("2026-08-01"), costType: "REPAIR", amount: 500,
      machine: { name: "=cmd|'/c calc'!A1" }, equipment: null,
      description: "@SUM(1,1)"
    }]);
    const service = makeService();

    const csv = await service.reportCsv(makeUser(), {} as never, {});

    expect(csv).toContain(`"'=cmd`);
    expect(csv).toContain(`"'@SUM(1,1)"`);
  });

  it("leaves an ordinary asset name/description untouched", async () => {
    mockPrisma.maintenanceCost.findMany.mockResolvedValue([{
      costDate: new Date("2026-08-01"), costType: "REPAIR", amount: 500,
      machine: { name: "Feed Mixer #2" }, equipment: null,
      description: "Replaced bearing"
    }]);
    const service = makeService();

    const csv = await service.reportCsv(makeUser(), {} as never, {});

    expect(csv).toContain(`"Feed Mixer #2"`);
    expect(csv).toContain(`"Replaced bearing"`);
  });
});

describe("MaintenanceService — document numbers use the atomic sequence, not a racy count()+1 (M18)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.machine.findFirst.mockResolvedValue({ id: "mach-1", branchId: "branch-1", farmId: null, warehouseId: null, productionSiteId: null });
  });

  it("createSchedule allocates its number via nextRef with prefix MS", async () => {
    mockPrisma.maintenanceSchedule.update.mockResolvedValue({});
    const service = makeService();

    await service.createSchedule(makeUser(), { machineId: "mach-1", title: "x", maintenanceType: "PREVENTIVE", frequencyDays: 30, nextDueDate: "2026-09-01" } as never, {});

    expect(nextRef).toHaveBeenCalledWith(expect.anything(), "company-1", "MS");
  });

  it("createBreakdown allocates its number via nextRef with prefix BD", async () => {
    mockPrisma.machine.update.mockResolvedValue({});
    const service = makeService();

    await service.createBreakdown(makeUser(), { machineId: "mach-1", description: "x" } as never, {});

    expect(nextRef).toHaveBeenCalledWith(expect.anything(), "company-1", "BD");
  });

  it("createRecord allocates its number via nextRef with prefix MR", async () => {
    const service = makeService();

    await service.createRecord(makeUser(), { machineId: "mach-1", maintenanceType: "PREVENTIVE" } as never, {});

    expect(nextRef).toHaveBeenCalledWith(expect.anything(), "company-1", "MR");
  });
});
