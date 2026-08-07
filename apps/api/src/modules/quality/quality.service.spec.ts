import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { QualityService } from "./quality.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

const mockPrisma = {
  qualityCheck: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
  rejectedBatch: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  approvedBatch: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  correctiveAction: { count: jest.fn(), groupBy: jest.fn() },
  qualityCheckParameter: { count: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new QualityService(mockPrisma as never, mockAudit as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("QualityService", () => {
  let service: QualityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: LookupCacheService, useValue: { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() } },
      ],
    }).compile();

    service = module.get<QualityService>(QualityService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});

describe("QualityService — location scope + self-review guard (H2)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("listChecks scoping", () => {
    it("applies a branch-restricting AND clause for a scope-restricted user", async () => {
      mockPrisma.qualityCheck.count.mockResolvedValue(0);
      mockPrisma.qualityCheck.findMany.mockResolvedValue([]);

      const service = makeService();
      await service.listChecks(makeUser({ branchIds: ["branch-1"] }), {} as never);

      const callArg = mockPrisma.qualityCheck.count.mock.calls[0][0];
      expect(callArg.where.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
    });

    it("applies no scope filter for a global-access user", async () => {
      mockPrisma.qualityCheck.count.mockResolvedValue(0);
      mockPrisma.qualityCheck.findMany.mockResolvedValue([]);

      const service = makeService();
      await service.listChecks(makeUser({ hasGlobalAccess: true }), {} as never);

      const callArg = mockPrisma.qualityCheck.count.mock.calls[0][0];
      expect(callArg.where.AND).toBeUndefined();
    });

    it("applies no scope filter for a user with zero location assignments (unrestricted-by-convention)", async () => {
      mockPrisma.qualityCheck.count.mockResolvedValue(0);
      mockPrisma.qualityCheck.findMany.mockResolvedValue([]);

      const service = makeService();
      await service.listChecks(makeUser({ branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [] }), {} as never);

      const callArg = mockPrisma.qualityCheck.count.mock.calls[0][0];
      expect(callArg.where.AND).toBeUndefined();
    });
  });

  describe("self-review guard", () => {
    it("blocks passCheck when the actor was the inspector", async () => {
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", status: "IN_PROGRESS", inspectorId: "user-1", createdById: "someone-else" });
      const service = makeService();
      await expect(service.passCheck(makeUser({ id: "user-1" }), "chk-1", {} as never, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks failCheck when the actor created the check", async () => {
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", status: "IN_PROGRESS", inspectorId: "someone-else", createdById: "user-1" });
      const service = makeService();
      await expect(service.failCheck(makeUser({ id: "user-1" }), "chk-1", {} as never, {})).rejects.toThrow(ForbiddenException);
    });

    it("allows passCheck when the actor is neither inspector nor creator", async () => {
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", status: "IN_PROGRESS", inspectorId: "inspector-1", createdById: "creator-1" });
      mockPrisma.qualityCheck.update.mockResolvedValue({ id: "chk-1", status: "PASSED" });
      const service = makeService();
      await expect(service.passCheck(makeUser({ id: "approver-1" }), "chk-1", {} as never, {})).resolves.toBeDefined();
    });

    it("blocks approveBatch self-review before checking for an existing approval", async () => {
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", inspectorId: "user-1", createdById: null });
      const service = makeService();
      await expect(service.approveBatch(makeUser({ id: "user-1" }), "chk-1", {} as never, {})).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.approvedBatch.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("createCheck location guard", () => {
    it("rejects a check created for a branch the actor doesn't have access to", async () => {
      const service = makeService();
      await expect(
        service.createCheck(makeUser({ branchIds: ["branch-1"] }), { branchId: "branch-OTHER", checkType: "INCOMING" } as never, {})
      ).rejects.toThrow(BadRequestException);
    });
  });
});
