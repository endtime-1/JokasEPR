import { BadRequestException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { MarketPlanningService } from "./market-planning.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("PP-REF-001") }));

// createProductionExecution's full flow has many dependent lookups
// (plan/formula/product/etc.) that would need extensive mocking to exercise
// end-to-end. consumeInventoryTx is the actual fix for H8 (negative stock
// under concurrency) — tested directly here as it's the unit that matters.
describe("MarketPlanningService.consumeInventoryTx — atomic guarded decrement (H8)", () => {
  const mockTx = {
    inventoryItem: {
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn()
    }
  };

  function makeService() {
    return new MarketPlanningService({} as never, {} as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it("throws instead of decrementing when the guarded updateMany finds insufficient stock", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService() as unknown as { consumeInventoryTx: (...args: unknown[]) => Promise<unknown> };

    await expect(
      service.consumeInventoryTx(mockTx, "company-1", "wh-1", "prod-1", 10, "user-1")
    ).rejects.toThrow(BadRequestException);

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", warehouseId: "wh-1", productId: "prod-1", quantityOnHand: { gte: 10 } },
      data: { quantityOnHand: { decrement: 10 }, updatedById: "user-1" }
    });
    expect(mockTx.inventoryItem.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("succeeds and returns identifying fields when enough stock exists", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.findFirstOrThrow.mockResolvedValue({ id: "inv-1", uomId: "uom-1" });
    const service = makeService() as unknown as { consumeInventoryTx: (...args: unknown[]) => Promise<{ id: string; uomId: string }> };

    const result = await service.consumeInventoryTx(mockTx, "company-1", "wh-1", "prod-1", 10, "user-1");

    expect(result).toEqual({ id: "inv-1", uomId: "uom-1" });
  });
});

describe("MarketPlanningService.submitTarget / approveTarget — status-guarded, no double-run (C3)", () => {
  const mockApproveTx = {
    marketTarget: { updateMany: jest.fn() },
    marketTargetItem: { updateMany: jest.fn() },
    productionPlan: { create: jest.fn() },
    productionPlanItem: { createMany: jest.fn() }
  };

  const mockPrisma = {
    marketTarget: { findFirst: jest.fn(), update: jest.fn() },
    marketTargetItem: { findMany: jest.fn(), updateMany: jest.fn() },
    productionSite: { findFirst: jest.fn() },
    warehouse: { findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockApproveTx) => Promise<unknown>) => cb(mockApproveTx))
  };
  const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, mockAudit as never);
  }

  function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [], branchIds: ["branch-1"], farmIds: [], warehouseIds: ["wh-1"], productionSiteIds: ["site-1"],
      hasGlobalAccess: false,
      ...overrides
    };
  }

  beforeEach(() => jest.clearAllMocks());

  describe("submitTarget", () => {
    it("rejects submitting a target that isn't DRAFT", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "SUBMITTED", branchId: "branch-1", productionSiteId: "site-1" });
      const service = makeService();

      await expect(service.submitTarget(makeUser(), "mt-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.marketTarget.update).not.toHaveBeenCalled();
    });

    it("allows submitting a DRAFT target", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "DRAFT", branchId: "branch-1", productionSiteId: "site-1", targetNumber: "MT-1" });
      mockPrisma.marketTarget.update.mockResolvedValue({ id: "mt-1", status: "SUBMITTED" });
      const service = makeService();

      await service.submitTarget(makeUser(), "mt-1", {});
      expect(mockPrisma.marketTarget.update).toHaveBeenCalled();
    });
  });

  describe("approveTarget", () => {
    beforeEach(() => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "SUBMITTED", branchId: "branch-1", productionSiteId: "site-1", targetNumber: "MT-1" });
      mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1" });
      mockPrisma.marketTargetItem.findMany.mockResolvedValue([{ id: "mti-1", productId: "prod-1", formulaId: null, formulaVersionId: null, targetQuantityKg: 100 }]);
      mockApproveTx.marketTarget.updateMany.mockResolvedValue({ count: 1 });
      mockApproveTx.marketTargetItem.updateMany.mockResolvedValue({ count: 1 });
      mockApproveTx.productionPlan.create.mockResolvedValue({ id: "pp-1" });
      mockApproveTx.productionPlanItem.createMany.mockResolvedValue({ count: 1 });
    });

    it("issues the status transition as a guarded updateMany scoped to SUBMITTED", async () => {
      const service = makeService();
      await service.approveTarget(makeUser(), "mt-1", { productionSiteId: "site-1", centralWarehouseId: "wh-1" } as never, {});

      expect(mockApproveTx.marketTarget.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "mt-1", status: "SUBMITTED" } })
      );
      expect(mockApproveTx.productionPlan.create).toHaveBeenCalled();
    });

    it("rejects a double-click/retry that races the guard — no second production plan is created", async () => {
      // Simulates the exact bug: the target was already approved (by the
      // first click/request) by the time this second one's guarded update runs.
      mockApproveTx.marketTarget.updateMany.mockResolvedValue({ count: 0 });
      const service = makeService();

      await expect(
        service.approveTarget(makeUser(), "mt-1", { productionSiteId: "site-1", centralWarehouseId: "wh-1" } as never, {})
      ).rejects.toThrow(BadRequestException);
      expect(mockApproveTx.productionPlan.create).not.toHaveBeenCalled();
      expect(mockApproveTx.productionPlanItem.createMany).not.toHaveBeenCalled();
    });
  });
});

describe("MarketPlanningService.targetVsActualReport — target list is capped, not unbounded (M16)", () => {
  const mockPrisma = {
    marketTarget: { findMany: jest.fn() }
  };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, {} as never);
  }

  function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: false,
      ...overrides
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("caps the underlying target query at take: 200", async () => {
    mockPrisma.marketTarget.findMany.mockResolvedValue([]);
    const service = makeService();

    await service.targetVsActualReport(makeUser(), {} as never);

    expect(mockPrisma.marketTarget.findMany.mock.calls[0][0].take).toBe(200);
  });
});

describe("MarketPlanningService — target/plan/MRP/recommendation edit+delete (H-CRUD-1)", () => {
  const mockTx = {
    marketTarget: { update: jest.fn() },
    marketTargetItem: { updateMany: jest.fn() }
  };
  const mockPrisma = {
    marketTarget: { findFirst: jest.fn(), update: jest.fn() },
    productionPlan: { findFirst: jest.fn(), update: jest.fn() },
    materialRequirementPlan: { findFirst: jest.fn(), update: jest.fn() },
    procurementRecommendation: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
  };
  const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, mockAudit as never);
  }

  function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: true,
      ...overrides
    };
  }

  beforeEach(() => jest.clearAllMocks());

  describe("updateTarget", () => {
    it("edits a DRAFT target", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "DRAFT", branchId: null, productionSiteId: null, periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30") });
      mockPrisma.marketTarget.update.mockResolvedValue({ id: "mt-1", title: "Corrected title" });

      const service = makeService();
      await service.updateTarget(makeUser(), "mt-1", { title: "Corrected title" } as never, {});

      expect(mockPrisma.marketTarget.update).toHaveBeenCalledWith({
        where: { id: "mt-1" },
        data: expect.objectContaining({ title: "Corrected title" })
      });
    });

    it("rejects editing a target that has already been submitted or approved", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "APPROVED", branchId: null, productionSiteId: null });

      const service = makeService();
      await expect(service.updateTarget(makeUser(), "mt-1", { title: "x" } as never, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.marketTarget.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteTarget", () => {
    it("soft-deletes a DRAFT target and its items", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "DRAFT", branchId: null, productionSiteId: null, targetNumber: "MT-1" });

      const service = makeService();
      await service.deleteTarget(makeUser(), "mt-1", {});

      expect(mockTx.marketTarget.update).toHaveBeenCalledWith({ where: { id: "mt-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) });
      expect(mockTx.marketTargetItem.updateMany).toHaveBeenCalled();
    });

    it("allows deleting a SUBMITTED target (nothing downstream exists yet)", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "SUBMITTED", branchId: null, productionSiteId: null, targetNumber: "MT-1" });

      const service = makeService();
      await expect(service.deleteTarget(makeUser(), "mt-1", {})).resolves.toEqual({ success: true });
    });

    it("rejects deleting an APPROVED target — production plans may already depend on it", async () => {
      mockPrisma.marketTarget.findFirst.mockResolvedValue({ id: "mt-1", companyId: "company-1", status: "APPROVED", branchId: null, productionSiteId: null, targetNumber: "MT-1" });

      const service = makeService();
      await expect(service.deleteTarget(makeUser(), "mt-1", {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("deleteProductionPlan", () => {
    it("allows deleting a DRAFT plan", async () => {
      mockPrisma.productionPlan.findFirst.mockResolvedValue({ id: "pp-1", companyId: "company-1", status: "DRAFT", branchId: "branch-1", productionSiteId: "site-1", centralWarehouseId: "wh-1", planNumber: "PP-1" });
      mockPrisma.productionPlan.update.mockResolvedValue({});

      const service = makeService();
      await expect(service.deleteProductionPlan(makeUser(), "pp-1", {})).resolves.toEqual({ success: true });
    });

    it("rejects deleting a plan that's already IN_PROGRESS", async () => {
      mockPrisma.productionPlan.findFirst.mockResolvedValue({ id: "pp-1", companyId: "company-1", status: "IN_PROGRESS", branchId: "branch-1", productionSiteId: "site-1", centralWarehouseId: "wh-1", planNumber: "PP-1" });

      const service = makeService();
      await expect(service.deleteProductionPlan(makeUser(), "pp-1", {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("deleteMrp", () => {
    it("allows deleting a CALCULATED run", async () => {
      mockPrisma.materialRequirementPlan.findFirst.mockResolvedValue({ id: "mrp-1", companyId: "company-1", status: "CALCULATED", branchId: "branch-1", centralWarehouseId: "wh-1", mrpNumber: "MRP-1" });
      mockPrisma.materialRequirementPlan.update.mockResolvedValue({});

      const service = makeService();
      await expect(service.deleteMrp(makeUser(), "mrp-1", {})).resolves.toEqual({ success: true });
    });

    it("rejects deleting a run once procurement recommendations have been generated from it", async () => {
      mockPrisma.materialRequirementPlan.findFirst.mockResolvedValue({ id: "mrp-1", companyId: "company-1", status: "PROCUREMENT_RECOMMENDED", branchId: "branch-1", centralWarehouseId: "wh-1", mrpNumber: "MRP-1" });

      const service = makeService();
      await expect(service.deleteMrp(makeUser(), "mrp-1", {})).rejects.toThrow(BadRequestException);
    });
  });

  describe("cancelRecommendation", () => {
    it("cancels an OPEN recommendation", async () => {
      mockPrisma.procurementRecommendation.findFirst.mockResolvedValue({ id: "rec-1", companyId: "company-1", status: "OPEN", branchId: "branch-1" });
      mockPrisma.procurementRecommendation.update.mockResolvedValue({ id: "rec-1", status: "CANCELLED" });

      const service = makeService();
      await service.cancelRecommendation(makeUser(), "rec-1", {});

      expect(mockPrisma.procurementRecommendation.update).toHaveBeenCalledWith({ where: { id: "rec-1" }, data: { status: "CANCELLED", updatedById: "user-1" } });
    });

    it("rejects cancelling a recommendation that was already converted to a purchase request", async () => {
      mockPrisma.procurementRecommendation.findFirst.mockResolvedValue({ id: "rec-1", companyId: "company-1", status: "CONVERTED_TO_PR", branchId: "branch-1" });

      const service = makeService();
      await expect(service.cancelRecommendation(makeUser(), "rec-1", {})).rejects.toThrow(BadRequestException);
    });
  });
});
