import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { QualityService } from "./quality.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("REF-2026-0001") }));

const mockTx = {
  qualityCheck: { update: jest.fn() },
  rejectedBatch: { create: jest.fn() },
  approvedBatch: { create: jest.fn() },
  stockBatch: { updateMany: jest.fn() }
};

const mockPrisma = {
  qualityCheck: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
  rejectedBatch: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  approvedBatch: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  correctiveAction: { count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  qualityCheckParameter: { count: jest.fn() },
  qualityCheckTemplate: { findFirst: jest.fn(), update: jest.fn() },
  labReportUpload: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
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

  describe("approveBatch/rejectBatch cannot contradict an already-finalised check (M14)", () => {
    it("rejects approveBatch on a check that was already FAILED (e.g. via failCheck or rejectBatch)", async () => {
      // Previously only approvedBatch was checked for a prior decision — a
      // FAILED check could still be routed through approveBatch, creating an
      // ApprovedBatch row (letting a failed batch into inventory) while
      // flipping the check back to PASSED.
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", status: "FAILED", inspectorId: "inspector-1", createdById: "creator-1" });
      const service = makeService();

      await expect(service.approveBatch(makeUser({ id: "approver-1" }), "chk-1", {} as never, {})).rejects.toThrow("Check already finalised");
      expect(mockPrisma.approvedBatch.findFirst).not.toHaveBeenCalled();
    });

    it("rejects rejectBatch on a check that was already PASSED (e.g. via passCheck or approveBatch)", async () => {
      mockPrisma.qualityCheck.findFirst.mockResolvedValue({ id: "chk-1", status: "PASSED", inspectorId: "inspector-1", createdById: "creator-1" });
      const service = makeService();

      await expect(service.rejectBatch(makeUser({ id: "approver-1" }), "chk-1", {} as never, {})).rejects.toThrow("Check already finalised");
      expect(mockPrisma.rejectedBatch.findFirst).not.toHaveBeenCalled();
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

describe("QualityService — finalize/approve/reject actions are scoped, not just reads (H15)", () => {
  beforeEach(() => jest.clearAllMocks());

  const finalizers: Array<[string, (service: QualityService, user: AuthenticatedUser) => Promise<unknown>]> = [
    ["submitResults", (s, u) => s.submitResults(u, "chk-1", { results: [] } as never, {})],
    ["passCheck", (s, u) => s.passCheck(u, "chk-1", {} as never, {})],
    ["failCheck", (s, u) => s.failCheck(u, "chk-1", {} as never, {})],
    ["conditionalPass", (s, u) => s.conditionalPass(u, "chk-1", { conditions: "x" } as never, {})],
    ["approveBatch", (s, u) => s.approveBatch(u, "chk-1", {} as never, {})],
    ["rejectBatch", (s, u) => s.rejectBatch(u, "chk-1", {} as never, {})],
    ["quarantineBatch", (s, u) => s.quarantineBatch(u, "chk-1", { reason: "x" } as never, {})]
  ];

  it.each(finalizers)("%s includes the actor's location scope in the qualityCheck lookup, not just companyId", async (_name, run) => {
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(null); // out of scope in the real DB — mock just needs to return null

    const service = makeService();
    await expect(run(service, makeUser({ branchIds: ["branch-1"] }))).rejects.toThrow(/not found/i);

    const where = mockPrisma.qualityCheck.findFirst.mock.calls[0][0].where;
    expect(where.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("createCorrectiveAction validates the referenced check exists within the actor's scope before creating anything", async () => {
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(
      service.createCorrectiveAction(makeUser({ branchIds: ["branch-1"] }), { checkId: "chk-other-branch", title: "x", description: "x" } as never, {})
    ).rejects.toThrow(/not found/i);
    expect(mockPrisma.correctiveAction.create).not.toHaveBeenCalled();
  });

  it.each([
    ["updateCorrectiveAction", (s: QualityService, u: AuthenticatedUser) => s.updateCorrectiveAction(u, "ca-1", {} as never, {})],
    ["resolveCorrectiveAction", (s: QualityService, u: AuthenticatedUser) => s.resolveCorrectiveAction(u, "ca-1", { resolution: "x" } as never, {})],
    ["verifyCorrectiveAction", (s: QualityService, u: AuthenticatedUser) => s.verifyCorrectiveAction(u, "ca-1", {} as never, {})]
  ])("%s scopes the corrective-action lookup via its check relation", async (_name, run) => {
    mockPrisma.correctiveAction.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(run(service, makeUser({ branchIds: ["branch-1"] }))).rejects.toThrow(/not found/i);

    const where = mockPrisma.correctiveAction.findFirst.mock.calls[0][0].where;
    expect(where.check.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("listLabReports scopes via its check relation instead of leaking company-wide (M1)", async () => {
    mockPrisma.labReportUpload.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listLabReports(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.labReportUpload.findMany.mock.calls[0][0].where;
    expect(where.check.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });

  it("listCorrectiveActions scopes via its check relation instead of leaking company-wide (M1)", async () => {
    mockPrisma.correctiveAction.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listCorrectiveActions(makeUser({ branchIds: ["branch-1"] }), {} as never);

    const where = mockPrisma.correctiveAction.findMany.mock.calls[0][0].where;
    expect(where.check.AND).toEqual([{ OR: [{ branchId: null }, { branchId: { in: ["branch-1"] } }] }]);
  });
});

describe("QualityService — delete routes (templates, corrective actions, lab reports)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("deleteTemplate", () => {
    it("soft-deletes a template with no referencing checks", async () => {
      mockPrisma.qualityCheckTemplate.findFirst.mockResolvedValue({ id: "tpl-1", companyId: "company-1" });
      mockPrisma.qualityCheck.count.mockResolvedValue(0);
      mockPrisma.qualityCheckTemplate.update.mockResolvedValue({});

      const service = makeService();
      await service.deleteTemplate(makeUser(), "tpl-1", {});

      expect(mockPrisma.qualityCheckTemplate.update).toHaveBeenCalledWith({
        where: { id: "tpl-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
    });

    it("is blocked when existing quality checks still reference the template", async () => {
      mockPrisma.qualityCheckTemplate.findFirst.mockResolvedValue({ id: "tpl-1", companyId: "company-1" });
      mockPrisma.qualityCheck.count.mockResolvedValue(2);

      const service = makeService();
      await expect(service.deleteTemplate(makeUser(), "tpl-1", {})).rejects.toThrow(/referenced by existing quality checks/);
      expect(mockPrisma.qualityCheckTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteCorrectiveAction", () => {
    it("soft-deletes an OPEN corrective action", async () => {
      mockPrisma.correctiveAction.findFirst.mockResolvedValue({ id: "ca-1", companyId: "company-1", status: "OPEN" });
      mockPrisma.correctiveAction.update.mockResolvedValue({});

      const service = makeService();
      await service.deleteCorrectiveAction(makeUser(), "ca-1", {});

      expect(mockPrisma.correctiveAction.update).toHaveBeenCalledWith({
        where: { id: "ca-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
    });

    it("is blocked when the corrective action is already CLOSED", async () => {
      mockPrisma.correctiveAction.findFirst.mockResolvedValue({ id: "ca-1", companyId: "company-1", status: "CLOSED" });

      const service = makeService();
      await expect(service.deleteCorrectiveAction(makeUser(), "ca-1", {})).rejects.toThrow(/closed corrective action/);
      expect(mockPrisma.correctiveAction.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteLabReport", () => {
    it("soft-deletes a lab report within the actor's scope", async () => {
      mockPrisma.labReportUpload.findFirst.mockResolvedValue({ id: "lr-1", companyId: "company-1" });
      mockPrisma.labReportUpload.update.mockResolvedValue({});

      const service = makeService();
      await service.deleteLabReport(makeUser(), "lr-1", {});

      expect(mockPrisma.labReportUpload.update).toHaveBeenCalledWith({
        where: { id: "lr-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) })
      });
    });

    it("404s for a lab report outside the actor's scope", async () => {
      mockPrisma.labReportUpload.findFirst.mockResolvedValue(null);

      const service = makeService();
      await expect(service.deleteLabReport(makeUser(), "lr-1", {})).rejects.toThrow(/not found/i);
      expect(mockPrisma.labReportUpload.update).not.toHaveBeenCalled();
    });
  });
});

describe("QualityService — batch/lab/corrective-action lists are capped, not unbounded (M16)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("listRejectedBatches caps the query at take: 200", async () => {
    mockPrisma.rejectedBatch.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listRejectedBatches(makeUser(), {} as never);
    expect(mockPrisma.rejectedBatch.findMany.mock.calls[0][0].take).toBe(200);
  });

  it("listApprovedBatches caps the query at take: 200", async () => {
    mockPrisma.approvedBatch.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listApprovedBatches(makeUser(), {} as never);
    expect(mockPrisma.approvedBatch.findMany.mock.calls[0][0].take).toBe(200);
  });

  it("listLabReports caps the query at take: 200", async () => {
    mockPrisma.labReportUpload.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listLabReports(makeUser(), {} as never);
    expect(mockPrisma.labReportUpload.findMany.mock.calls[0][0].take).toBe(200);
  });

  it("listCorrectiveActions caps the query at take: 200", async () => {
    mockPrisma.correctiveAction.findMany.mockResolvedValue([]);
    const service = makeService();
    await service.listCorrectiveActions(makeUser(), {} as never);
    expect(mockPrisma.correctiveAction.findMany.mock.calls[0][0].take).toBe(200);
  });
});

describe("QualityService — approve/reject/quarantine actually gate the stock lot (H-BUG-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  const inScopeCheck = { id: "chk-1", status: "IN_PROGRESS", inspectorId: "inspector-1", createdById: "creator-1", referenceType: "GRN", referenceId: "grn-1", batchNumber: "B-1" };

  it("approveBatch confirms the lot AVAILABLE when a stockBatchId is given", async () => {
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(inScopeCheck);
    mockPrisma.approvedBatch.findFirst.mockResolvedValue(null);
    mockTx.approvedBatch.create.mockResolvedValue({ id: "ab-1" });

    const service = makeService();
    await service.approveBatch(makeUser({ id: "approver-1" }), "chk-1", { stockBatchId: "sb-1" } as never, {});

    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({ where: { id: "sb-1", companyId: "company-1" }, data: { status: "AVAILABLE" } });
  });

  it("approveBatch does not touch any stock lot when no stockBatchId is given", async () => {
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(inScopeCheck);
    mockPrisma.approvedBatch.findFirst.mockResolvedValue(null);
    mockTx.approvedBatch.create.mockResolvedValue({ id: "ab-1" });

    const service = makeService();
    await service.approveBatch(makeUser({ id: "approver-1" }), "chk-1", {} as never, {});

    expect(mockTx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("rejectBatch quarantines the lot when a stockBatchId is given — this is the actual gate", async () => {
    // The real bug this closes: before this fix, nothing anywhere set
    // StockBatch.status on a rejection, so every FIFO consumer (sales,
    // feed-production, etc.) still happily sold/consumed a rejected lot.
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(inScopeCheck);
    mockPrisma.rejectedBatch.findFirst.mockResolvedValue(null);
    mockTx.rejectedBatch.create.mockResolvedValue({ id: "rb-1" });

    const service = makeService();
    await service.rejectBatch(makeUser({ id: "approver-1" }), "chk-1", { rejectionReason: "contaminated", stockBatchId: "sb-1" } as never, {});

    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({ where: { id: "sb-1", companyId: "company-1" }, data: { status: "QUARANTINED" } });
  });

  it("quarantineBatch quarantines the lot when a stockBatchId is given, inside a transaction", async () => {
    mockPrisma.qualityCheck.findFirst.mockResolvedValue(inScopeCheck);
    mockTx.qualityCheck.update.mockResolvedValue({ id: "chk-1", decision: "QUARANTINE" });

    const service = makeService();
    await service.quarantineBatch(makeUser({ id: "approver-1" }), "chk-1", { reason: "pending re-test", stockBatchId: "sb-1" } as never, {});

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({ where: { id: "sb-1", companyId: "company-1" }, data: { status: "QUARANTINED" } });
  });
});
