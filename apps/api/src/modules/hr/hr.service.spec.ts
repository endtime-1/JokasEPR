import { BadRequestException, ConflictException, ForbiddenException, Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { HRService } from "./hr.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-2026-0001") }));

const mockPrisma = {
  employee: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn() },
  attendanceRecord: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  payrollRecord: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  disciplinaryRecord: { findMany: jest.fn(), create: jest.fn() },
  grievanceRecord: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  task: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  leaveRequest: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), groupBy: jest.fn() },
  leaveBalance: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  leavePolicy: { findFirst: jest.fn() },
  expenseCategory: { findFirst: jest.fn(), create: jest.fn() },
  expense: { create: jest.fn() },
  user: { findFirst: jest.fn() }
};

function makeRes() {
  return { setHeader: jest.fn(), send: jest.fn() };
}
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
const mockNotifications = { broadcast: jest.fn().mockResolvedValue(undefined), send: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new HRService(mockPrisma as never, mockAudit as never, { sendWithAttachment: jest.fn() } as never, mockNotifications as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("HRService", () => {
  it("should be defined", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HRService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: EmailService, useValue: { sendWithAttachment: jest.fn() } },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    expect(module.get<HRService>(HRService)).toBeDefined();
  });
});

describe("HRService — branch/farm/warehouse/site scoping (H6)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("listEmployees applies an AND-of-OR-null-or-allowed scope for a restricted user", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listEmployees(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.employee.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("listEmployees applies no scope filter for a global-access user", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listEmployees(makeUser({ hasGlobalAccess: true }), {} as never);

    const where = mockPrisma.employee.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
  });

  it("updateEmployee blocks editing an employee outside the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", firstName: "A", lastName: "B", branchId: "branch-OTHER", farmId: null, warehouseId: null, productionSiteId: null });
    const service = makeService();
    await expect(service.updateEmployee(makeUser({ branchIds: ["branch-1"] }), "emp-1", {} as never, {})).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.employee.update).not.toHaveBeenCalled();
  });

  it("updateEmployee allows editing an employee within the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", firstName: "A", lastName: "B", branchId: "branch-1", farmId: null, warehouseId: null, productionSiteId: null });
    mockPrisma.employee.update.mockResolvedValue({ id: "emp-1" });
    const service = makeService();
    await expect(service.updateEmployee(makeUser({ branchIds: ["branch-1"] }), "emp-1", {} as never, {})).resolves.toBeDefined();
  });

  it("listAttendance scopes through the employee relation", async () => {
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listAttendance(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.employee.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("listPayroll scopes through the employee relation, not a direct branchId field", async () => {
    mockPrisma.payrollRecord.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listPayroll(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.payrollRecord.findMany.mock.calls[0][0].where;
    expect(where.employee.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("listDisciplinary and listGrievances scope through the employee relation", async () => {
    mockPrisma.disciplinaryRecord.findMany.mockResolvedValue([]);
    mockPrisma.grievanceRecord.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listDisciplinary(makeUser({ branchIds: ["branch-1"] }), {} as never);
    await service.listGrievances(makeUser({ branchIds: ["branch-1"] }), {} as never);

    expect(mockPrisma.disciplinaryRecord.findMany.mock.calls[0][0].where.employee.AND).toBeDefined();
    expect(mockPrisma.grievanceRecord.findMany.mock.calls[0][0].where.employee.AND).toBeDefined();
  });

  it("getOrgChart scopes the roster to the actor's own branch/farm/warehouse/site (M1)", async () => {
    // Previously unscoped — the practical way a branch-scoped user could
    // obtain out-of-scope employeeIds for the H14 write-path gaps.
    mockPrisma.employee.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.getOrgChart(makeUser({ branchIds: ["branch-1"] }));

    const where = mockPrisma.employee.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });
});

describe("HRService — write methods now enforce the same employee scope their read siblings already did (H14)", () => {
  beforeEach(() => jest.clearAllMocks());

  const outOfScopeEmployee = { id: "emp-1", fullName: "A", code: "E1", basicSalary: 1000, branchId: "branch-OTHER", farmId: null, warehouseId: null, productionSiteId: null };
  const inScopeEmployee = { id: "emp-1", fullName: "A", code: "E1", basicSalary: 1000, branchId: "branch-1", farmId: null, warehouseId: null, productionSiteId: null };

  it("recordAttendance blocks recording attendance for an employee outside the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(outOfScopeEmployee);
    const service = makeService();
    await expect(
      service.recordAttendance(makeUser({ branchIds: ["branch-1"] }), { employeeId: "emp-1", date: "2026-09-01", status: "PRESENT" } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it("bulkPayrollRun's employee query is intersected with the actor's own scope", async () => {
    mockPrisma.employee.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.bulkPayrollRun(makeUser({ branchIds: ["branch-1"] }), { period: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30" } as never, {});

    const where = mockPrisma.employee.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("deleteEmployee blocks terminating an employee outside the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(outOfScopeEmployee);
    const service = makeService();
    await expect(service.deleteEmployee(makeUser({ branchIds: ["branch-1"] }), "emp-1", {})).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.employee.update).not.toHaveBeenCalled();
  });

  it("deleteEmployee allows terminating an employee within the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(inScopeEmployee);
    mockPrisma.employee.update.mockResolvedValue({ id: "emp-1" });
    const service = makeService();
    await expect(service.deleteEmployee(makeUser({ branchIds: ["branch-1"] }), "emp-1", {})).resolves.toBeDefined();
  });

  it("resolveGrievance blocks acting on a grievance whose employee is outside the actor's branch scope", async () => {
    mockPrisma.grievanceRecord.findFirst.mockResolvedValue({ id: "grv-1", status: "OPEN", employee: { branchId: "branch-OTHER", farmId: null, warehouseId: null, productionSiteId: null } });
    const service = makeService();
    await expect(
      service.resolveGrievance(makeUser({ branchIds: ["branch-1"] }), "grv-1", { resolution: "done" } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.grievanceRecord.update).not.toHaveBeenCalled();
  });

  it("createDisciplinaryRecord blocks issuing a record against an employee outside the actor's branch scope", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue(outOfScopeEmployee);
    const service = makeService();
    await expect(
      service.createDisciplinaryRecord(makeUser({ branchIds: ["branch-1"] }), { employeeId: "emp-1", incidentDate: "2026-09-01", category: "Late", description: "x", actionTaken: "Warning" } as never, {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.disciplinaryRecord.create).not.toHaveBeenCalled();
  });
});

describe("HRService.dashboard — does not mask query failures as zero counts (M1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.employee.count.mockResolvedValue(0);
    mockPrisma.attendanceRecord.count.mockResolvedValue(0);
    mockPrisma.task.count.mockResolvedValue(0);
    mockPrisma.payrollRecord.count.mockResolvedValue(0);
    mockPrisma.leaveRequest.count.mockResolvedValue(0);
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
  });

  it("rejects instead of silently returning 0 when a count query fails", async () => {
    mockPrisma.employee.count.mockRejectedValueOnce(new Error("connection pool exhausted"));
    const service = makeService();

    await expect(service.dashboard(makeUser())).rejects.toThrow();
  });

  it("returns real counts on the happy path", async () => {
    mockPrisma.employee.count.mockResolvedValueOnce(42);
    const service = makeService();

    const result = await service.dashboard(makeUser());
    expect(result.data.totalEmployees).toBe(42);
  });
});

describe("HRService.getMyEmployee — binds by userId, self-heals from email (M13)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resolves directly by userId when already linked, without touching email at all", async () => {
    mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: "emp-1", fullName: "Jane Doe" });
    const service = makeService();

    await service.getMyEmployee(makeUser({ id: "user-1" }));

    expect(mockPrisma.employee.findFirst).toHaveBeenCalledTimes(1);
    const where = mockPrisma.employee.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe("user-1");
    expect(where.email).toBeUndefined();
    expect(mockPrisma.employee.update).not.toHaveBeenCalled();
  });

  it("falls back to an unlinked email match and self-heals the link for next time", async () => {
    mockPrisma.employee.findFirst
      .mockResolvedValueOnce(null) // no employee linked by userId yet
      .mockResolvedValueOnce({ id: "emp-2" }) // unlinked employee matched by email
      .mockResolvedValueOnce({ id: "emp-2", fullName: "Jane Doe" }); // re-fetch with full select after linking
    mockPrisma.employee.update.mockResolvedValue({});
    const service = makeService();

    await service.getMyEmployee(makeUser({ id: "user-1", email: "jane@company.test" }));

    expect(mockPrisma.employee.update).toHaveBeenCalledWith({ where: { id: "emp-2" }, data: { userId: "user-1" } });
    const emailLookupWhere = mockPrisma.employee.findFirst.mock.calls[1][0].where;
    expect(emailLookupWhere.email).toBe("jane@company.test");
    expect(emailLookupWhere.userId).toBeNull();
  });

  it("never matches an employee already linked to a different user's account", async () => {
    // The fallback query explicitly filters userId: null, so an employee
    // already linked to someone else can't be silently re-bound to this user.
    mockPrisma.employee.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const service = makeService();

    const result = await service.getMyEmployee(makeUser({ id: "user-1", fullName: "Fallback Name" }));

    expect(mockPrisma.employee.update).not.toHaveBeenCalled();
    expect(result.data.code).toBeNull();
    expect(result.data.fullName).toBe("Fallback Name");
  });
});

describe("HRService.listEmployees — real pagination, not a silent 500-row cap (M14)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.employee.findMany.mockResolvedValue([]);
    mockPrisma.employee.count.mockResolvedValue(0);
  });

  it("defaults to take=500 (today's cap) when the caller sends no pagination params", async () => {
    const service = makeService();
    await service.listEmployees(makeUser(), {} as never);

    expect(mockPrisma.employee.findMany.mock.calls[0][0].take).toBe(500);
    expect(mockPrisma.employee.findMany.mock.calls[0][0].skip).toBe(0);
  });

  it("honors an explicit page/take and computes the correct skip", async () => {
    mockPrisma.employee.count.mockResolvedValue(220);
    const service = makeService();

    const result = await service.listEmployees(makeUser(), { page: 3, take: 100 } as never);

    expect(mockPrisma.employee.findMany.mock.calls[0][0].skip).toBe(200);
    expect(mockPrisma.employee.findMany.mock.calls[0][0].take).toBe(100);
    expect(result.meta).toEqual({ total: 220, page: 3, take: 100, totalPages: 3 });
  });

  it("reports the real total so a caller can tell more rows exist past the current page", async () => {
    mockPrisma.employee.count.mockResolvedValue(650);
    const service = makeService();

    const result = await service.listEmployees(makeUser(), {} as never);

    expect(result.meta.total).toBe(650);
    expect(result.meta.totalPages).toBe(2);
  });
});

describe("HRService — leave/payroll/grievance cross-field and state-machine checks (M15)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.employee.findFirst.mockResolvedValue(null);
  });

  describe("submitLeaveRequest", () => {
    it("rejects when daysRequested exceeds the actual selected date range", async () => {
      const service = makeService();
      const dto = { leaveType: "ANNUAL", startDate: "2026-09-01", endDate: "2026-09-02", daysRequested: 30 } as never;

      await expect(service.submitLeaveRequest(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.leaveRequest.create).not.toHaveBeenCalled();
    });

    it("rejects when endDate is before startDate", async () => {
      const service = makeService();
      const dto = { leaveType: "ANNUAL", startDate: "2026-09-05", endDate: "2026-09-01", daysRequested: 1 } as never;

      await expect(service.submitLeaveRequest(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
    });

    it("allows daysRequested at or below the calendar span (working-day counts excluding weekends)", async () => {
      mockPrisma.leaveRequest.create.mockResolvedValue({ id: "lvr-1" });
      const service = makeService();
      const dto = { leaveType: "ANNUAL", startDate: "2026-09-01", endDate: "2026-09-05", daysRequested: 3 } as never;

      await expect(service.submitLeaveRequest(makeUser(), dto, {})).resolves.toBeDefined();
      expect(mockPrisma.leaveRequest.create).toHaveBeenCalled();
    });
  });

  describe("createPayrollRecord", () => {
    it("rejects when periodEnd is not after periodStart", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", fullName: "Jane", code: "E1", basicSalary: 1000, branchId: "branch-1" });
      const service = makeService();
      const dto = { employeeId: "emp-1", period: "2026-09", periodStart: "2026-09-30", periodEnd: "2026-09-01", basicSalary: 1000 } as never;

      await expect(service.createPayrollRecord(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.payrollRecord.create).not.toHaveBeenCalled();
    });

    it("allows a valid periodStart/periodEnd pair", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", fullName: "Jane", code: "E1", basicSalary: 1000, branchId: "branch-1" });
      mockPrisma.payrollRecord.create.mockResolvedValue({ id: "pay-1" });
      const service = makeService();
      const dto = { employeeId: "emp-1", period: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30", basicSalary: 1000 } as never;

      await expect(service.createPayrollRecord(makeUser(), dto, {})).resolves.toBeDefined();
    });

    it("rejects running payroll twice for the same employee/period (M17)", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", fullName: "Jane", code: "E1", basicSalary: 1000, branchId: "branch-1" });
      mockPrisma.payrollRecord.findFirst.mockResolvedValue({ id: "pay-existing", period: "2026-09" });
      const service = makeService();
      const dto = { employeeId: "emp-1", period: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30", basicSalary: 1000 } as never;

      await expect(service.createPayrollRecord(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.payrollRecord.create).not.toHaveBeenCalled();
    });

    it("allows re-running payroll for the period once the prior record was soft-deleted", async () => {
      // The duplicate check filters deletedAt: null — this proves it doesn't
      // block a legitimate redo after a correction.
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", fullName: "Jane", code: "E1", basicSalary: 1000, branchId: "branch-1" });
      mockPrisma.payrollRecord.findFirst.mockResolvedValue(null);
      mockPrisma.payrollRecord.create.mockResolvedValue({ id: "pay-2" });
      const service = makeService();
      const dto = { employeeId: "emp-1", period: "2026-09", periodStart: "2026-09-01", periodEnd: "2026-09-30", basicSalary: 1000 } as never;

      await service.createPayrollRecord(makeUser(), dto, {});

      const where = mockPrisma.payrollRecord.findFirst.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(mockPrisma.payrollRecord.create).toHaveBeenCalled();
    });
  });

  describe("computePayrollEstimate — flags stale PAYE bands instead of trusting them forever (M17)", () => {
    it("flags the bands as stale once the calendar year has moved past the bands' tax year", async () => {
      // The bands are hardcoded to Ghana's 2024 fiscal year; this test's
      // "current" year is controlled by the real system clock, which by now
      // (2026+) is already past that year — proving the flag actually fires
      // rather than asserting a fixed year that will itself go stale.
      const service = makeService();
      const result = await service.computePayrollEstimate(makeUser(), { basicSalary: 5000 } as never);

      expect(result.data.payeBandsTaxYear).toBe(2024);
      expect(result.data.payeBandsStale).toBe(new Date().getFullYear() > 2024);
    });
  });

  describe("resolveGrievance / closeGrievance state machine", () => {
    it("rejects resolving a grievance that is already CLOSED", async () => {
      mockPrisma.grievanceRecord.findFirst.mockResolvedValue({ id: "grv-1", status: "CLOSED" });
      const service = makeService();

      await expect(service.resolveGrievance(makeUser(), "grv-1", { resolution: "done" } as never, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.grievanceRecord.update).not.toHaveBeenCalled();
    });

    it("rejects resolving a grievance that is already RESOLVED", async () => {
      mockPrisma.grievanceRecord.findFirst.mockResolvedValue({ id: "grv-1", status: "RESOLVED" });
      const service = makeService();

      await expect(service.resolveGrievance(makeUser(), "grv-1", { resolution: "done" } as never, {})).rejects.toThrow(BadRequestException);
    });

    it("allows resolving an OPEN grievance", async () => {
      mockPrisma.grievanceRecord.findFirst.mockResolvedValue({ id: "grv-1", status: "OPEN" });
      mockPrisma.grievanceRecord.update.mockResolvedValue({ id: "grv-1", status: "RESOLVED" });
      const service = makeService();

      await expect(service.resolveGrievance(makeUser(), "grv-1", { resolution: "done" } as never, {})).resolves.toBeDefined();
    });

    it("rejects closing a grievance that is already CLOSED", async () => {
      mockPrisma.grievanceRecord.findFirst.mockResolvedValue({ id: "grv-1", status: "CLOSED" });
      const service = makeService();

      await expect(service.closeGrievance(makeUser(), "grv-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.grievanceRecord.update).not.toHaveBeenCalled();
    });
  });
});

describe("HRService.reviewLeaveRequest — status-guarded, no double-debit under concurrency (H12)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("issues the status transition as a guarded updateMany, not a plain unguarded update", async () => {
    mockPrisma.leaveRequest.findFirst.mockResolvedValue({ id: "lvr-1", status: "PENDING", employeeId: null, daysRequested: 3, startDate: new Date("2026-09-01"), leaveType: "ANNUAL" });
    mockPrisma.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.leaveRequest.findUniqueOrThrow.mockResolvedValue({ id: "lvr-1", status: "APPROVED" });

    const service = makeService();
    await service.reviewLeaveRequest(makeUser(), "lvr-1", { decision: "APPROVED" } as never, {});

    expect(mockPrisma.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "lvr-1", status: "PENDING" },
      data: expect.objectContaining({ status: "APPROVED" })
    });
  });

  it("rejects a second concurrent review once the first has already advanced the request out of PENDING", async () => {
    mockPrisma.leaveRequest.findFirst.mockResolvedValue({ id: "lvr-1", status: "PENDING", employeeId: "emp-1", daysRequested: 3, startDate: new Date("2026-09-01"), leaveType: "ANNUAL" });
    // Simulates the exact race: both requests read status: PENDING before
    // either write landed — the second's guarded updateMany now sees 0 rows
    // affected because the first already flipped the status.
    mockPrisma.leaveRequest.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(
      service.reviewLeaveRequest(makeUser(), "lvr-1", { decision: "APPROVED" } as never, {})
    ).rejects.toThrow(BadRequestException);
    // The leave balance must not be touched by the loser of the race.
    expect(mockPrisma.leaveBalance.update).not.toHaveBeenCalled();
    expect(mockPrisma.leaveBalance.create).not.toHaveBeenCalled();
  });
});

describe("HRService.markPayrollPaid — status-guarded transition (H13); no Finance mirror (C-BACK 2026-08-15)", () => {
  beforeEach(() => jest.clearAllMocks());

  const payroll = { id: "pay-1", status: "APPROVED", paymentDate: null, netPay: 1000, reference: "PR-001", employeeName: "Jane", period: "2026-09", employee: { email: "jane@x.com" } };

  it("issues the status transition as a guarded updateMany, not a plain unguarded update", async () => {
    mockPrisma.payrollRecord.findFirst.mockResolvedValue(payroll);
    mockPrisma.payrollRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payrollRecord.findUniqueOrThrow.mockResolvedValue({ ...payroll, status: "PAID" });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const service = makeService();
    await service.markPayrollPaid(makeUser(), "pay-1", {});

    expect(mockPrisma.payrollRecord.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: "APPROVED" },
      data: expect.objectContaining({ status: "PAID" })
    });
  });

  it("rejects a second concurrent mark-paid once the first has already advanced the record out of APPROVED", async () => {
    mockPrisma.payrollRecord.findFirst.mockResolvedValue(payroll);
    mockPrisma.payrollRecord.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.markPayrollPaid(makeUser(), "pay-1", {})).rejects.toThrow(BadRequestException);
  });

  it("does not create a Finance Expense row — PayrollRecord is the single source of truth for payroll cost, summed directly by finance.service.ts", async () => {
    mockPrisma.payrollRecord.findFirst.mockResolvedValue(payroll);
    mockPrisma.payrollRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payrollRecord.findUniqueOrThrow.mockResolvedValue({ ...payroll, status: "PAID" });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const service = makeService();
    await service.markPayrollPaid(makeUser(), "pay-1", {});

    expect(mockPrisma.expenseCategory.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });
});

describe("HRService — sanity bounds on employee dates (L5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.employee.findUnique.mockResolvedValue(null);
    mockPrisma.employee.create.mockResolvedValue({ id: "emp-1" });
  });

  it("createEmployee rejects a dateOfBirth in the future", async () => {
    const service = makeService();
    const dto = { code: "E1", firstName: "A", lastName: "B", startDate: "2026-01-01", dateOfBirth: "2099-01-01" } as never;

    await expect(service.createEmployee(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
    expect(mockPrisma.employee.create).not.toHaveBeenCalled();
  });

  it("createEmployee rejects a dateOfBirth more than 100 years ago", async () => {
    const service = makeService();
    const dto = { code: "E1", firstName: "A", lastName: "B", startDate: "2026-01-01", dateOfBirth: "1850-01-01" } as never;

    await expect(service.createEmployee(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
  });

  it("createEmployee rejects a startDate far in the future", async () => {
    const service = makeService();
    const dto = { code: "E1", firstName: "A", lastName: "B", startDate: "2099-01-01" } as never;

    await expect(service.createEmployee(makeUser(), dto, {})).rejects.toThrow(BadRequestException);
  });

  it("createEmployee accepts a reasonable dateOfBirth and startDate", async () => {
    const service = makeService();
    const dto = { code: "E1", firstName: "A", lastName: "B", startDate: "2026-01-01", dateOfBirth: "1990-05-15" } as never;

    await expect(service.createEmployee(makeUser(), dto, {})).resolves.toBeDefined();
    expect(mockPrisma.employee.create).toHaveBeenCalled();
  });

  it("updateEmployee rejects a dateOfBirth in the future", async () => {
    mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", firstName: "A", lastName: "B", branchId: null, farmId: null, warehouseId: null, productionSiteId: null });
    const service = makeService();

    await expect(
      service.updateEmployee(makeUser(), "emp-1", { dateOfBirth: "2099-01-01" } as never, {})
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.employee.update).not.toHaveBeenCalled();
  });
});

describe("HRService — leave summary / leave balance no longer fail silently (M12)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("reportLeaveSummary", () => {
    it("returns the real breakdown on success", async () => {
      mockPrisma.leaveRequest.groupBy.mockResolvedValue([{ leaveType: "ANNUAL", status: "APPROVED", _count: { id: 3 }, _sum: { daysRequested: 9 } }]);
      const service = makeService();

      const result = await service.reportLeaveSummary(makeUser(), {} as never);

      expect(result.data.breakdown).toHaveLength(1);
    });

    it("throws instead of silently returning an empty breakdown when the query fails", async () => {
      // Previously .catch(() => []) — a real DB failure rendered identically to
      // "no leave activity this period" with no way to tell the two apart.
      mockPrisma.leaveRequest.groupBy.mockRejectedValue(new Error("db unavailable"));
      const service = makeService();

      await expect(service.reportLeaveSummary(makeUser(), {} as never)).rejects.toThrow("Leave summary report failed to load");
    });
  });

  describe("submitLeaveRequest — leave balance bookkeeping", () => {
    const dto = { leaveType: "ANNUAL", startDate: "2026-09-01", endDate: "2026-09-05", daysRequested: 3 } as never;

    beforeEach(() => {
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1", fullName: "Jane", code: "E1" });
      mockPrisma.leaveRequest.create.mockResolvedValue({ id: "lvr-1", employeeName: "Jane", leaveType: "ANNUAL", daysRequested: 3 });
    });

    it("still creates the leave request when the balance bookkeeping update throws", async () => {
      // Best-effort by design (a bookkeeping failure shouldn't block a valid
      // leave request) — this is NOT a regression to fix, just verifying the
      // request still succeeds now that the catch also logs.
      mockPrisma.leaveBalance.findUnique.mockRejectedValue(new Error("db unavailable"));
      const service = makeService();

      await expect(service.submitLeaveRequest(makeUser(), dto, {})).resolves.toBeDefined();
    });

    it("logs the failure instead of swallowing it completely", async () => {
      mockPrisma.leaveBalance.findUnique.mockRejectedValue(new Error("db unavailable"));
      const service = makeService();
      const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      await service.submitLeaveRequest(makeUser(), dto, {});

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("leave balance update failed for employee emp-1"));
      errorSpy.mockRestore();
    });
  });
});

describe("HRService.bankExportCsv — neutralizes formula-injection payloads (M15)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefixes a formula-injection payload in the employee/bank fields with a single quote", async () => {
    mockPrisma.payrollRecord.findMany.mockResolvedValue([{
      employeeName: "Fallback Name", period: "2026-08", netPay: 1000,
      employee: { code: "=cmd|'/c calc'!A1", fullName: "Jane Doe", bankName: "+1+1 Bank", bankAccount: "@SUM(1,1)" }
    }]);
    const service = makeService();
    const res = makeRes();

    await service.bankExportCsv(makeUser(), "2026-08", res as never);

    const csv = res.send.mock.calls[0][0] as string;
    expect(csv).toContain(`"'=cmd`);
    expect(csv).toContain(`"'+1+1 Bank"`);
    expect(csv).toContain(`"'@SUM(1,1)"`);
  });

  it("leaves ordinary bank details untouched", async () => {
    mockPrisma.payrollRecord.findMany.mockResolvedValue([{
      employeeName: "Fallback Name", period: "2026-08", netPay: 1000,
      employee: { code: "E001", fullName: "Jane Doe", bankName: "GCB Bank", bankAccount: "1234567890" }
    }]);
    const service = makeService();
    const res = makeRes();

    await service.bankExportCsv(makeUser(), "2026-08", res as never);

    const csv = res.send.mock.calls[0][0] as string;
    expect(csv).toContain(`"GCB Bank"`);
    expect(csv).toContain(`"1234567890"`);
  });
});

describe("HRService.updateTaskStatus — conflict detection on the one true edit-sync endpoint (L1)", () => {
  beforeEach(() => jest.clearAllMocks());

  const updatedAt = new Date("2026-08-01T10:00:00.000Z");

  it("updates normally when no expectedUpdatedAt is supplied (backward compatible)", async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: "task-1", status: "OPEN", updatedAt });
    mockPrisma.task.update.mockResolvedValue({ id: "task-1", status: "IN_PROGRESS" });
    const service = makeService();

    await expect(service.updateTaskStatus(makeUser(), "task-1", { status: "IN_PROGRESS" } as never, {})).resolves.toBeDefined();
  });

  it("updates normally when expectedUpdatedAt matches the task's current updatedAt", async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: "task-1", status: "OPEN", updatedAt });
    mockPrisma.task.update.mockResolvedValue({ id: "task-1", status: "IN_PROGRESS" });
    const service = makeService();

    await expect(
      service.updateTaskStatus(makeUser(), "task-1", { status: "IN_PROGRESS", expectedUpdatedAt: updatedAt.toISOString() } as never, {})
    ).resolves.toBeDefined();
    expect(mockPrisma.task.update).toHaveBeenCalled();
  });

  it("rejects as a conflict when the task changed since the caller last saw it", async () => {
    // The exact bug this fixes: an offline mobile edit and a meanwhile online
    // web edit both target this task — whichever syncs last must not
    // silently overwrite the other without at least surfacing a conflict.
    mockPrisma.task.findFirst.mockResolvedValue({ id: "task-1", status: "COMPLETED", updatedAt: new Date("2026-08-01T11:00:00.000Z") });
    const service = makeService();

    await expect(
      service.updateTaskStatus(makeUser(), "task-1", { status: "IN_PROGRESS", expectedUpdatedAt: updatedAt.toISOString() } as never, {})
    ).rejects.toThrow(ConflictException);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });
});

describe("HRService.submitGrievance — excludes the concerned person from the broadcast (H-BACK-4)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("broadcasts with no exclusions when the submitter didn't identify who it concerns", async () => {
    mockPrisma.employee.findFirst.mockResolvedValueOnce({ id: "emp-1", fullName: "Ama", code: "E1", basicSalary: 1000 });
    mockPrisma.grievanceRecord.create.mockResolvedValue({ id: "grv-1" });
    const service = makeService();

    await service.submitGrievance(makeUser({ hasGlobalAccess: true }), { employeeId: "emp-1", submittedDate: "2026-08-11", category: "Conduct", description: "..." } as never, {});

    expect(mockNotifications.broadcast).toHaveBeenCalledWith(
      "company-1", "HR_MANAGE", expect.objectContaining({ entityType: "GrievanceRecord" }), []
    );
  });

  it("excludes the concerned employee's linked user account when one is identified and resolvable", async () => {
    mockPrisma.employee.findFirst
      .mockResolvedValueOnce({ id: "emp-1", fullName: "Ama", code: "E1", basicSalary: 1000 }) // submitting employee
      .mockResolvedValueOnce({ email: "manager@jokas.local" }); // concerned employee lookup
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-manager" });
    mockPrisma.grievanceRecord.create.mockResolvedValue({ id: "grv-1" });
    const service = makeService();

    await service.submitGrievance(
      makeUser({ hasGlobalAccess: true }),
      { employeeId: "emp-1", submittedDate: "2026-08-11", category: "Conduct", description: "...", concernedEmployeeId: "emp-manager" } as never,
      {}
    );

    expect(mockNotifications.broadcast).toHaveBeenCalledWith(
      "company-1", "HR_MANAGE", expect.objectContaining({ entityType: "GrievanceRecord" }), ["user-manager"]
    );
  });

  it("falls back to no exclusion when the concerned employee has no linked user account", async () => {
    mockPrisma.employee.findFirst
      .mockResolvedValueOnce({ id: "emp-1", fullName: "Ama", code: "E1", basicSalary: 1000 })
      .mockResolvedValueOnce({ email: null });
    mockPrisma.grievanceRecord.create.mockResolvedValue({ id: "grv-1" });
    const service = makeService();

    await service.submitGrievance(
      makeUser({ hasGlobalAccess: true }),
      { employeeId: "emp-1", submittedDate: "2026-08-11", category: "Conduct", description: "...", concernedEmployeeId: "emp-manager" } as never,
      {}
    );

    expect(mockNotifications.broadcast).toHaveBeenCalledWith(
      "company-1", "HR_MANAGE", expect.objectContaining({ entityType: "GrievanceRecord" }), []
    );
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });
});
