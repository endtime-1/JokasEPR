import { BadRequestException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { MarketPlanningService } from "./market-planning.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("PP-REF-001") }));

// createProductionExecution's full flow has many dependent lookups
// (plan/formula/product/etc.) that would need extensive mocking to exercise
// end-to-end. consumeInventoryTx is the actual fix for H8 (negative stock
// under concurrency) — tested directly here as it's the unit that matters.
describe("MarketPlanningService.consumeInventoryTx — atomic guarded decrement + lot-level quality gating (H8, H-BUG-2)", () => {
  const mockTx = {
    inventoryItem: {
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn()
    },
    stockBatch: {
      findMany: jest.fn(),
      updateMany: jest.fn()
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
    // Never even looked at lots — the aggregate check already failed.
    expect(mockTx.stockBatch.findMany).not.toHaveBeenCalled();
  });

  it("succeeds, consumes from AVAILABLE lots FIFO, and returns identifying fields when enough stock exists", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 10 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.findFirstOrThrow.mockResolvedValue({ id: "inv-1", uomId: "uom-1" });
    const service = makeService() as unknown as { consumeInventoryTx: (...args: unknown[]) => Promise<{ id: string; uomId: string }> };

    const result = await service.consumeInventoryTx(mockTx, "company-1", "wh-1", "prod-1", 10, "user-1");

    expect(mockTx.stockBatch.findMany).toHaveBeenCalledWith({
      where: { companyId: "company-1", warehouseId: "wh-1", productId: "prod-1", quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantityRemaining: { gte: 10 } },
      data: { quantityRemaining: { decrement: 10 } }
    });
    expect(result).toEqual({ id: "inv-1", uomId: "uom-1" });
  });

  it("H-BUG-2: a quarantined lot is invisible to this query and can't be consumed even though quantityOnHand looks sufficient", async () => {
    // The aggregate decrement passes (quantityOnHand includes the quarantined lot's stock),
    // but the lot query below only returns AVAILABLE lots — so a fully-quarantined product
    // has quantityOnHand > 0 yet zero consumable lots, and must fail loudly, not silently
    // consume the held stock.
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([]); // the only lot is QUARANTINED, excluded by the status filter
    const service = makeService() as unknown as { consumeInventoryTx: (...args: unknown[]) => Promise<unknown> };

    await expect(
      service.consumeInventoryTx(mockTx, "company-1", "wh-1", "prod-1", 10, "user-1", "Maize")
    ).rejects.toThrow(/quarantined/);

    expect(mockTx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back when a lot was consumed concurrently (per-lot floor guard)", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 10 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService() as unknown as { consumeInventoryTx: (...args: unknown[]) => Promise<unknown> };

    await expect(
      service.consumeInventoryTx(mockTx, "company-1", "wh-1", "prod-1", 10, "user-1", "Maize")
    ).rejects.toThrow(/consumed concurrently/);
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
    materialRequirementPlan: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    productionExecution: { count: jest.fn().mockResolvedValue(0) },
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

    it("L-BUG: allows deleting an APPROVED plan with nothing built on top of it — plans are always created APPROVED, so DRAFT/READY_FOR_APPROVAL alone made this permanently unusable", async () => {
      mockPrisma.productionPlan.findFirst.mockResolvedValue({ id: "pp-1", companyId: "company-1", status: "APPROVED", branchId: "branch-1", productionSiteId: "site-1", centralWarehouseId: "wh-1", planNumber: "PP-1" });
      mockPrisma.materialRequirementPlan.count.mockResolvedValue(0);
      mockPrisma.productionExecution.count.mockResolvedValue(0);
      mockPrisma.productionPlan.update.mockResolvedValue({});

      const service = makeService();
      await expect(service.deleteProductionPlan(makeUser(), "pp-1", {})).resolves.toEqual({ success: true });
    });

    it("L-BUG: rejects deleting an APPROVED plan once an MRP run depends on it", async () => {
      mockPrisma.productionPlan.findFirst.mockResolvedValue({ id: "pp-1", companyId: "company-1", status: "APPROVED", branchId: "branch-1", productionSiteId: "site-1", centralWarehouseId: "wh-1", planNumber: "PP-1" });
      mockPrisma.materialRequirementPlan.count.mockResolvedValue(1);
      mockPrisma.productionExecution.count.mockResolvedValue(0);

      const service = makeService();
      await expect(service.deleteProductionPlan(makeUser(), "pp-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.productionPlan.update).not.toHaveBeenCalled();
    });

    it("L-BUG: rejects deleting an APPROVED plan once a production execution depends on it", async () => {
      mockPrisma.productionPlan.findFirst.mockResolvedValue({ id: "pp-1", companyId: "company-1", status: "APPROVED", branchId: "branch-1", productionSiteId: "site-1", centralWarehouseId: "wh-1", planNumber: "PP-1" });
      mockPrisma.materialRequirementPlan.count.mockResolvedValue(0);
      mockPrisma.productionExecution.count.mockResolvedValue(1);

      const service = makeService();
      await expect(service.deleteProductionPlan(makeUser(), "pp-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.productionPlan.update).not.toHaveBeenCalled();
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

describe("MarketPlanningService.lockedFormulaIngredients — a plan item's formula version is actually honored, not just carried around decoratively (H-BUG-2)", () => {
  const mockPrisma = {
    feedFormulaVersion: { findFirst: jest.fn() },
    product: { findMany: jest.fn() }
  };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, {} as never) as unknown as {
      lockedFormulaIngredients: (companyId: string, formulaId: string, formulaVersionId: string | null | undefined) => Promise<unknown>;
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("returns null (use the live formula) when no version is locked", async () => {
    const service = makeService();
    const result = await service.lockedFormulaIngredients("company-1", "formula-1", null);
    expect(result).toBeNull();
    expect(mockPrisma.feedFormulaVersion.findFirst).not.toHaveBeenCalled();
  });

  it("throws when the locked version can't be found", async () => {
    mockPrisma.feedFormulaVersion.findFirst.mockResolvedValue(null);
    const service = makeService();
    await expect(service.lockedFormulaIngredients("company-1", "formula-1", "ver-1")).rejects.toThrow(/version was not found/);
  });

  it("resolves the snapshot's SKUs back to live products and returns the LOCKED quantities, ignoring whatever the live formula looks like now", async () => {
    mockPrisma.feedFormulaVersion.findFirst.mockResolvedValue({
      versionNo: 3,
      ingredientSnapshot: [{ sku: "MAIZE-1", name: "Maize", quantityKg: 60, unitCost: 2.5 }]
    });
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-maize", sku: "MAIZE-1" }]);
    const service = makeService();

    const result = await service.lockedFormulaIngredients("company-1", "formula-1", "ver-1");

    expect(result).toEqual([{ ingredientId: "prod-maize", name: "Maize", sku: "MAIZE-1", quantityKg: 60, unitCost: 2.5 }]);
  });

  it("throws loudly instead of silently dropping an ingredient whose SKU no longer matches a live product", async () => {
    mockPrisma.feedFormulaVersion.findFirst.mockResolvedValue({
      versionNo: 3,
      ingredientSnapshot: [{ sku: "MAIZE-DISCONTINUED", name: "Old Maize", quantityKg: 60, unitCost: 2.5 }]
    });
    mockPrisma.product.findMany.mockResolvedValue([]); // SKU no longer matches anything
    const service = makeService();

    await expect(service.lockedFormulaIngredients("company-1", "formula-1", "ver-1")).rejects.toThrow(/could not be matched/);
  });
});

describe("MarketPlanningService.availableQuantity — active reservations reduce what MRP/execution see as available (H-BUG-2)", () => {
  const mockPrisma = { stockReservation: { findMany: jest.fn() } };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, {} as never) as unknown as {
      availableQuantity: (inventoryItemId: string, quantityOnHand: number) => Promise<number>;
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("returns the full quantityOnHand when nothing is reserved", async () => {
    mockPrisma.stockReservation.findMany.mockResolvedValue([]);
    const service = makeService();
    await expect(service.availableQuantity("inv-1", 100)).resolves.toBe(100);
  });

  it("subtracts active, unexpired reservations from quantityOnHand", async () => {
    mockPrisma.stockReservation.findMany.mockResolvedValue([{ quantity: 30 }, { quantity: 10 }]);
    const service = makeService();
    await expect(service.availableQuantity("inv-1", 100)).resolves.toBe(60);
    expect(mockPrisma.stockReservation.findMany).toHaveBeenCalledWith({
      where: { inventoryItemId: "inv-1", status: "ACTIVE", deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
      select: { quantity: true }
    });
  });

  it("never returns negative available stock even if reservations exceed quantityOnHand", async () => {
    mockPrisma.stockReservation.findMany.mockResolvedValue([{ quantity: 150 }]);
    const service = makeService();
    await expect(service.availableQuantity("inv-1", 100)).resolves.toBe(0);
  });
});

describe("MarketPlanningService.calculateIngredientNeeds — locked formula version wins over the live formula (H-BUG-2)", () => {
  const mockPrisma = {
    feedFormula: { findFirst: jest.fn() },
    feedFormulaVersion: { findFirst: jest.fn() },
    feedFormulaIngredient: { findMany: jest.fn() },
    product: { findMany: jest.fn() }
  };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, {} as never) as unknown as {
      calculateIngredientNeeds: (companyId: string, planItems: unknown[]) => Promise<Array<{ rawMaterialId: string; requiredQuantityKg: number }>>;
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("uses the LIVE formula ingredients when the plan item has no locked version (legacy/unversioned behavior, unchanged)", async () => {
    mockPrisma.feedFormula.findFirst.mockResolvedValue({ id: "formula-1", code: "BROILER-STARTER", targetBatchKg: 100 });
    mockPrisma.feedFormulaIngredient.findMany.mockResolvedValue([{ ingredientId: "prod-maize", quantityKg: 60, unitCost: 2.5 }]);
    const service = makeService();

    const needs = await service.calculateIngredientNeeds("company-1", [
      { id: "item-1", productId: "prod-feed", formulaId: "formula-1", formulaVersionId: null, plannedQuantityKg: 200 }
    ]);

    expect(needs).toEqual([expect.objectContaining({ rawMaterialId: "prod-maize", requiredQuantityKg: 120 })]);
  });

  it("uses the LOCKED version's snapshot ingredients when the plan item has a formulaVersionId, even though the live formula has since changed", async () => {
    mockPrisma.feedFormula.findFirst.mockResolvedValue({ id: "formula-1", code: "BROILER-STARTER", targetBatchKg: 100 });
    mockPrisma.feedFormulaVersion.findFirst.mockResolvedValue({
      versionNo: 2,
      ingredientSnapshot: [{ sku: "MAIZE-1", name: "Maize", quantityKg: 60, unitCost: 2.5 }]
    });
    mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-maize", sku: "MAIZE-1" }]);
    // Live formula now calls for a completely different quantity — this must NOT be used.
    mockPrisma.feedFormulaIngredient.findMany.mockResolvedValue([{ ingredientId: "prod-maize", quantityKg: 999, unitCost: 2.5 }]);
    const service = makeService();

    const needs = await service.calculateIngredientNeeds("company-1", [
      { id: "item-1", productId: "prod-feed", formulaId: "formula-1", formulaVersionId: "ver-2", plannedQuantityKg: 200 }
    ]);

    expect(needs).toEqual([expect.objectContaining({ rawMaterialId: "prod-maize", requiredQuantityKg: 120 })]);
    expect(mockPrisma.feedFormulaIngredient.findMany).not.toHaveBeenCalled();
  });
});

describe("MarketPlanningService.generateProcurementRecommendations — dedupes across recalculations, not just within one MRP run (M-BUG)", () => {
  const mockTx = {
    procurementRecommendation: { findFirst: jest.fn(), create: jest.fn() },
    materialRequirementPlan: { update: jest.fn() }
  };
  const mockPrisma = {
    materialRequirementPlan: { findFirst: jest.fn() },
    materialRequirementItem: { findMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
  };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, { write: jest.fn() } as never);
  }

  function makeUser(): AuthenticatedUser {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: true,
      ...({} as Partial<AuthenticatedUser>)
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("reuses an existing OPEN recommendation for the same target+material even though this MRP run is brand new", async () => {
    // The second "recalculate" always creates a fresh MaterialRequirementPlan row
    // (mrp-2, different id from the one the earlier recommendation was generated
    // under) — dedup has to look across the whole market target, not just this run.
    mockPrisma.materialRequirementPlan.findFirst.mockResolvedValue({ id: "mrp-2", companyId: "company-1", branchId: "branch-1", centralWarehouseId: "wh-1", marketTargetId: "mt-1" });
    mockPrisma.materialRequirementItem.findMany.mockResolvedValue([{ id: "item-1", rawMaterialId: "prod-maize", shortageQuantityKg: 50, unitCost: 2, estimatedShortageCost: 100 }]);
    mockTx.procurementRecommendation.findFirst.mockResolvedValue({ id: "rec-existing", marketTargetId: "mt-1", rawMaterialId: "prod-maize", status: "OPEN" });

    const service = makeService();
    const result = await service.generateProcurementRecommendations(makeUser(), "mrp-2", {} as never, {});

    expect(mockTx.procurementRecommendation.findFirst).toHaveBeenCalledWith({
      where: { companyId: "company-1", marketTargetId: "mt-1", rawMaterialId: "prod-maize", status: "OPEN", deletedAt: null }
    });
    expect(mockTx.procurementRecommendation.create).not.toHaveBeenCalled();
    expect(result.data).toEqual([{ id: "rec-existing", marketTargetId: "mt-1", rawMaterialId: "prod-maize", status: "OPEN" }]);
  });

  it("creates a new recommendation when no OPEN one exists yet for this target+material", async () => {
    mockPrisma.materialRequirementPlan.findFirst.mockResolvedValue({ id: "mrp-1", companyId: "company-1", branchId: "branch-1", centralWarehouseId: "wh-1", marketTargetId: "mt-1" });
    mockPrisma.materialRequirementItem.findMany.mockResolvedValue([{ id: "item-1", rawMaterialId: "prod-maize", shortageQuantityKg: 50, unitCost: 2, estimatedShortageCost: 100 }]);
    mockTx.procurementRecommendation.findFirst.mockResolvedValue(null);
    mockTx.procurementRecommendation.create.mockResolvedValue({ id: "rec-new" });

    const service = makeService();
    await service.generateProcurementRecommendations(makeUser(), "mrp-1", {} as never, {});

    expect(mockTx.procurementRecommendation.create).toHaveBeenCalled();
  });
});

describe("MarketPlanningService — an old/unapproved formula can't be used just by referencing its id directly (M-BUG)", () => {
  const mockPrisma = { feedFormula: { findFirst: jest.fn() } };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, {} as never) as unknown as {
      resolveFormula: (companyId: string, productId: string, formulaId?: string) => Promise<unknown>;
      getFormulaForExecution: (companyId: string, formulaId?: string) => Promise<unknown>;
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("resolveFormula requires status ACTIVE even when a formulaId is explicitly given", async () => {
    mockPrisma.feedFormula.findFirst.mockResolvedValue(null);
    const service = makeService();

    await expect(service.resolveFormula("company-1", "prod-1", "formula-1")).rejects.toThrow(/active feed formula/);
    expect(mockPrisma.feedFormula.findFirst).toHaveBeenCalledWith({
      where: { companyId: "company-1", deletedAt: null, status: "ACTIVE", id: "formula-1" },
      orderBy: { updatedAt: "desc" }
    });
  });

  it("getFormulaForExecution requires status ACTIVE, not just companyId+id", async () => {
    mockPrisma.feedFormula.findFirst.mockResolvedValue(null);
    const service = makeService();

    await expect(service.getFormulaForExecution("company-1", "formula-1")).rejects.toThrow(/not found, or is no longer active/);
    expect(mockPrisma.feedFormula.findFirst).toHaveBeenCalledWith({
      where: { id: "formula-1", companyId: "company-1", deletedAt: null, status: "ACTIVE" }
    });
  });
});

describe("MarketPlanningService.createTarget — flags a suspiciously large computed quantity instead of staying silent (M-BUG)", () => {
  const mockTx = {
    marketTarget: { create: jest.fn() },
    marketTargetItem: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }
  };
  const mockPrisma = {
    product: { findFirst: jest.fn() },
    feedFormula: { findFirst: jest.fn().mockResolvedValue({ id: "formula-1", targetBatchKg: 100 }) },
    feedFormulaVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
  };

  function makeService() {
    return new MarketPlanningService(mockPrisma as never, { write: jest.fn() } as never);
  }

  function makeUser(): AuthenticatedUser {
    return {
      id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
      roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
      hasGlobalAccess: true
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.feedFormula.findFirst.mockResolvedValue({ id: "formula-1", targetBatchKg: 100 });
    mockPrisma.feedFormulaVersion.findFirst.mockResolvedValue(null);
    mockTx.marketTarget.create.mockResolvedValue({ id: "mt-1", targetNumber: "MT-1" });
  });

  it("warns when baseQuantity × bagSizeKg produces an implausibly large total (likely kg typed into a bags field)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", name: "Broiler Starter", companyId: "company-1" });
    const service = makeService();

    const result = await service.createTarget(
      makeUser(),
      { title: "Q3 Target", period: "Q3", periodStart: "2026-07-01", periodEnd: "2026-09-30", items: [{ productId: "prod-1", baseQuantity: 5000, bagSizeKg: 50 }] } as never,
      {}
    );

    expect(result.warnings).toBeDefined();
    expect(result.warnings?.[0]).toMatch(/confirm this quantity is really in BAGS/);
  });

  it("does not warn for a plausible bag count", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", name: "Broiler Starter", companyId: "company-1" });
    const service = makeService();

    const result = await service.createTarget(
      makeUser(),
      { title: "Q3 Target", period: "Q3", periodStart: "2026-07-01", periodEnd: "2026-09-30", items: [{ productId: "prod-1", baseQuantity: 50, bagSizeKg: 50 }] } as never,
      {}
    );

    expect(result.warnings).toBeUndefined();
  });
});
