import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { HRService } from "./hr.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";

const mockPrisma = {
  employee: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), count: jest.fn() },
  attendanceRecord: { findMany: jest.fn(), count: jest.fn() },
  payrollRecord: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  disciplinaryRecord: { findMany: jest.fn() },
  grievanceRecord: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  task: { findMany: jest.fn(), count: jest.fn() },
  leaveRequest: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() }
};
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
