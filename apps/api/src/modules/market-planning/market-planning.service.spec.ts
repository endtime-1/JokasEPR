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
