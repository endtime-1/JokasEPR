import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { HRService } from "./hr.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";

const mockPrisma = {
  employee: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  attendanceRecord: { findMany: jest.fn() },
  payrollRecord: { findMany: jest.fn() },
  disciplinaryRecord: { findMany: jest.fn() },
  grievanceRecord: { findMany: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new HRService(mockPrisma as never, mockAudit as never, { sendWithAttachment: jest.fn() } as never, {} as never);
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
