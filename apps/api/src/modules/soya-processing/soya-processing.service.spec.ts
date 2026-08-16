import { AuthenticatedUser } from "@jokas/shared";
import { SoyaProcessingService } from "./soya-processing.service";

const mockTx = {
  inventoryItem: { updateMany: jest.fn(), upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  soyaBeanIntake: { create: jest.fn(), update: jest.fn() },
  soyaProcessingBatch: { create: jest.fn(), update: jest.fn() },
  stockMovement: { create: jest.fn() },
  stockBatch: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  soyaOilOutput: { create: jest.fn(), update: jest.fn() },
  soyaCakeOutput: { create: jest.fn(), update: jest.fn() },
  soyaWasteRecord: { create: jest.fn(), update: jest.fn() },
  soyaProductionCost: { create: jest.fn(), update: jest.fn() },
  soyaInternalTransfer: { create: jest.fn(), update: jest.fn() },
  soyaSalesLink: { create: jest.fn(), update: jest.fn() },
  soyaQualityCheck: { update: jest.fn() }
};

const mockPrisma = {
  productionSite: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  inventoryItem: { findFirst: jest.fn() },
  soyaBeanIntake: { findFirst: jest.fn(), update: jest.fn() },
  soyaProcessingBatch: { findFirst: jest.fn(), update: jest.fn() },
  soyaQualityCheck: { findFirst: jest.fn(), update: jest.fn() },
  soyaInternalTransfer: { findFirst: jest.fn(), update: jest.fn() },
  soyaSalesLink: { findFirst: jest.fn(), update: jest.fn() },
  stockMovement: { findFirst: jest.fn() },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new SoyaProcessingService(mockPrisma as never, mockAudit as never, {} as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: true,
    ...overrides
  };
}

function makeDto(overrides: Record<string, unknown> = {}) {
  return {
    productionSiteId: "site-1", rawWarehouseId: "wh-raw", oilWarehouseId: "wh-oil", cakeWarehouseId: "wh-cake",
    beanProductId: "prod-bean", oilProductId: "prod-oil", cakeProductId: "prod-cake",
    beansUsedKg: 100, oilProducedLitres: 15, cakeProducedKg: 75, batchNumber: "SPB-TEST-001",
    ...overrides
  } as never;
}

describe("SoyaProcessingService", () => {
  it("is defined", () => {
    const service = new SoyaProcessingService({} as never, {} as never, {} as never);
    expect(service).toBeDefined();
  });
});

describe("SoyaProcessingService.createIntake — writes a StockBatch for valuation/expiry tracking (H3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-1" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-bean", uomId: "uom-1" });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-1" });
    mockTx.soyaBeanIntake.create.mockResolvedValue({ id: "intake-1", receiptNumber: "RCPT-001" });
  });

  it("creates a StockBatch alongside the inventory upsert instead of leaving beans untracked for valuation", async () => {
    const service = makeService();
    await service.createIntake(
      makeUser(),
      { productionSiteId: "site-1", warehouseId: "wh-raw", productId: "prod-bean", receiptNumber: "rcpt-001", supplierName: "Farm Co", quantityKg: 200, unitCost: 4 } as never,
      {}
    );

    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ batchNumber: "RCPT-001", quantityReceived: 200, quantityRemaining: 200, unitCost: 4, inventoryItemId: "inv-1", productId: "prod-bean" })
      })
    );
  });
});

describe("SoyaProcessingService.createBatch — costs from the linked intake and guards the decrement (M10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-1" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-x", uomId: "uom-1" });
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", quantityOnHand: 500 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-out" });
    mockTx.soyaProcessingBatch.create.mockResolvedValue({ id: "batch-1", branchId: "branch-1", productionSiteId: "site-1" });
    mockTx.stockBatch.findMany.mockResolvedValue([]);
  });

  it("writes StockBatch rows for both the oil and cake outputs — the H3 gap that left every soya SKU at $0 valuation", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-1", unitCost: 5 });

    const service = makeService();
    await service.createBatch(makeUser(), makeDto({ batchNumber: "SPB-H3-001" }), {});

    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "SPB-H3-001-OIL", productId: "prod-oil", quantityReceived: 15, quantityRemaining: 15 }) })
    );
    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ batchNumber: "SPB-H3-001-CAKE", productId: "prod-cake", quantityReceived: 75, quantityRemaining: 75 }) })
    );
  });

  it("best-effort consumes bean StockBatch lots without blocking the batch when no lot data exists yet", async () => {
    // Pre-existing stock predates H3 — zero StockBatch rows for it is
    // expected and must not block production the way feed-production's
    // hard floor guard (H2) intentionally does for its own disciplined lots.
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-1", unitCost: 5 });
    mockTx.stockBatch.findMany.mockResolvedValue([]);

    const service = makeService();
    await expect(service.createBatch(makeUser(), makeDto(), {})).resolves.toBeDefined();
    expect(mockTx.stockBatch.updateMany).not.toHaveBeenCalled();
  });

  it("costs from the specific intakeId given, not just the most recently received one", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockImplementation(({ where }: { where: { id?: string } }) => {
      if (where.id === "intake-old") return Promise.resolve({ id: "intake-old", unitCost: 3 });
      return Promise.resolve({ id: "intake-newest", unitCost: 10 }); // would be picked by "most recent" fallback
    });

    const service = makeService();
    await service.createBatch(makeUser(), makeDto({ intakeId: "intake-old" }), {});

    // 100kg * unitCost 3 (the linked intake) = 300, not 100 * 10 = 1000 (the newest intake)
    expect(mockTx.soyaProductionCost.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rawBeanCost: 300 }) })
    );
  });

  it("falls back to the most recent intake when no intakeId is given", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-newest", unitCost: 10 });

    const service = makeService();
    await service.createBatch(makeUser(), makeDto(), {});

    expect(mockTx.soyaProductionCost.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rawBeanCost: 1000 }) })
    );
  });

  it("rejects with a cross-tenant or nonexistent intakeId before touching stock", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue(null);

    const service = makeService();
    await expect(service.createBatch(makeUser(), makeDto({ intakeId: "intake-other-co" }), {})).rejects.toThrow();
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the floor-guarded decrement loses a concurrent race, instead of overdrawing stock", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-1", unitCost: 5 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.createBatch(makeUser(), makeDto(), {})).rejects.toThrow();
    expect(mockTx.soyaProcessingBatch.create).not.toHaveBeenCalled();
  });

  it("issues the decrement as a floor-guarded updateMany, not a plain unguarded update", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-1", unitCost: 5 });

    const service = makeService();
    await service.createBatch(makeUser(), makeDto({ beansUsedKg: 40 }), {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 40 } },
      data: { quantityOnHand: { decrement: 40 }, updatedById: "user-1" }
    });
  });

  it("idempotency (DB stability audit, 2026-08-16): replays the original batch instead of double-processing when the idempotencyKey was already used", async () => {
    mockPrisma.soyaProcessingBatch.findFirst.mockResolvedValue({ id: "batch-existing" });

    const service = makeService();
    const result = await service.createBatch(makeUser(), makeDto({ idempotencyKey: "key-1" }), {});

    expect(result.data).toEqual({ id: "batch-existing" });
    expect(mockPrisma.soyaBeanIntake.findFirst).not.toHaveBeenCalled();
    expect(mockTx.soyaProcessingBatch.create).not.toHaveBeenCalled();
  });

  it("idempotency (DB stability audit, 2026-08-16): replays the original batch when a concurrent duplicate loses the unique-constraint race (P2002)", async () => {
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({ id: "intake-1", unitCost: 5 });
    mockPrisma.soyaProcessingBatch.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "batch-existing" });
    mockTx.soyaProcessingBatch.create.mockRejectedValue({ code: "P2002" });

    const service = makeService();
    const result = await service.createBatch(makeUser(), makeDto({ idempotencyKey: "key-1" }), {});

    expect(result.data).toEqual({ id: "batch-existing" });
  });
});

describe("SoyaProcessingService.createTransfer / createSale — floor-guarded decrement (C1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaProcessingBatch.findFirst.mockResolvedValue({ id: "batch-1", branchId: "branch-1", productionSiteId: "site-1" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-x", uomId: "uom-1" });
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", quantityOnHand: 100 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-dest" });
    mockTx.soyaInternalTransfer.create.mockResolvedValue({ id: "trf-1" });
    mockTx.soyaSalesLink.create.mockResolvedValue({ id: "sale-1" });
  });

  const user = () => makeUser({ warehouseIds: ["wh-raw", "wh-oil", "wh-cake"], hasGlobalAccess: true });

  it("createTransfer issues the decrement as a floor-guarded updateMany, not a plain unguarded update", async () => {
    const service = makeService();
    await service.createTransfer(
      user(),
      { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", fromWarehouseId: "wh-oil", toWarehouseId: "wh-cake", quantity: 30 } as never,
      {}
    );

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 30 } },
      data: { quantityOnHand: { decrement: 30 }, updatedById: "user-1" }
    });
  });

  it("createTransfer rejects when the floor-guarded decrement loses a concurrent race, instead of overdrawing stock", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService();

    await expect(
      service.createTransfer(
        user(),
        { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", fromWarehouseId: "wh-oil", toWarehouseId: "wh-cake", quantity: 30 } as never,
        {}
      )
    ).rejects.toThrow();
    expect(mockTx.soyaInternalTransfer.create).not.toHaveBeenCalled();
  });

  it("createSale issues the decrement as a floor-guarded updateMany, not a plain unguarded update", async () => {
    const service = makeService();
    await service.createSale(
      user(),
      { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", warehouseId: "wh-oil", customerName: "Acme", quantity: 20, unitPrice: 10 } as never,
      {}
    );

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 20 } },
      data: { quantityOnHand: { decrement: 20 }, updatedById: "user-1" }
    });
  });

  it("createSale rejects when the floor-guarded decrement loses a concurrent race, instead of overselling stock", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    const service = makeService();

    await expect(
      service.createSale(
        user(),
        { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", warehouseId: "wh-oil", customerName: "Acme", quantity: 20, unitPrice: 10 } as never,
        {}
      )
    ).rejects.toThrow();
    expect(mockTx.soyaSalesLink.create).not.toHaveBeenCalled();
  });

  it("createTransfer consumes source StockBatch lots FIFO and carries their weighted cost to a new destination batch (H3)", async () => {
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 30, unitCost: 8 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createTransfer(
      user(),
      { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", fromWarehouseId: "wh-oil", toWarehouseId: "wh-cake", quantity: 30 } as never,
      {}
    );

    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "lot-a", quantityRemaining: { gte: 30 } },
      data: { quantityRemaining: { decrement: 30 } }
    });
    expect(mockTx.stockBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantityReceived: 30, quantityRemaining: 30, unitCost: 8 }) })
    );
  });

  it("createTransfer does not block on incomplete source lot data — best-effort, unlike the hard floor guard on quantityOnHand", async () => {
    // No StockBatch history for this stock yet (predates H3) — must not
    // prevent the transfer, since inventoryItem.quantityOnHand (already
    // floor-guarded above) remains the real availability check.
    mockTx.stockBatch.findMany.mockResolvedValue([]);

    const service = makeService();
    await expect(
      service.createTransfer(
        user(),
        { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", fromWarehouseId: "wh-oil", toWarehouseId: "wh-cake", quantity: 30 } as never,
        {}
      )
    ).resolves.toBeDefined();
    expect(mockTx.soyaInternalTransfer.create).toHaveBeenCalled();
  });

  it("createSale consumes source StockBatch lots FIFO without blocking on incomplete lot data", async () => {
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "lot-a", quantityRemaining: 5, unitCost: 6 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });

    const service = makeService();
    await service.createSale(
      user(),
      { productionBatchId: "batch-1", productId: "prod-oil", outputType: "OIL", warehouseId: "wh-oil", customerName: "Acme", quantity: 20, unitPrice: 10 } as never,
      {}
    );

    // Only 5 of the 20 sold units had lot data — consumed what's known, sold
    // the rest anyway (quantityOnHand already covers availability).
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "lot-a", quantityRemaining: { gte: 5 } },
      data: { quantityRemaining: { decrement: 5 } }
    });
    expect(mockTx.soyaSalesLink.create).toHaveBeenCalled();
  });
});

describe("SoyaProcessingService.updateQualityStatus — check + batch status updated atomically (H-BACK-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCheck(overrides: Record<string, unknown> = {}) {
    return {
      id: "check-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      productionBatchId: "batch-1", deletedAt: null,
      ...overrides
    };
  }

  it("updates the quality check and the processing batch inside the same transaction", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.soyaQualityCheck.update.mockResolvedValue({ id: "check-1", status: "APPROVED" });

    const service = makeService();
    await service.updateQualityStatus(makeUser({ id: "user-approver" }), "check-1", { status: "APPROVED" } as never, {});

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.soyaQualityCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "check-1" } })
    );
    expect(mockTx.soyaProcessingBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "APPROVED", updatedById: "user-approver" }
    });
  });

  it("rolls back the check update if the batch update fails (atomicity)", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.soyaQualityCheck.update.mockResolvedValue({ id: "check-1", status: "REJECTED" });
    mockTx.soyaProcessingBatch.update.mockRejectedValueOnce(new Error("db blip"));

    const service = makeService();
    await expect(
      service.updateQualityStatus(makeUser(), "check-1", { status: "REJECTED" } as never, {})
    ).rejects.toThrow("db blip");

    expect(mockTx.soyaQualityCheck.update).toHaveBeenCalled();
  });

  it("maps a REJECTED check to a REJECTED batch status, not left on its pre-check status", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck());
    mockTx.soyaQualityCheck.update.mockResolvedValue({ id: "check-1", status: "REJECTED" });

    const service = makeService();
    await service.updateQualityStatus(makeUser(), "check-1", { status: "REJECTED" } as never, {});

    expect(mockTx.soyaProcessingBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { status: "REJECTED", updatedById: expect.any(String) }
    });
  });
});

describe("SoyaProcessingService.updateIntake / deleteIntake", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaBeanIntake.findFirst.mockResolvedValue({
      id: "intake-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      warehouseId: "wh-raw", productId: "prod-bean", receiptNumber: "RCPT-001", supplierName: "Farm Co",
      quantityKg: 200, unitCost: 4, deletedAt: null
    });
    mockPrisma.soyaBeanIntake.update.mockResolvedValue({ id: "intake-1", receiptNumber: "RCPT-001" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", uomId: "uom-1", quantityOnHand: 200 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
  });

  it("updateIntake patches metadata fields only and writes an UPDATE audit entry", async () => {
    const service = makeService();
    await service.updateIntake(makeUser(), "intake-1", { supplierName: "New Farm", notes: "corrected" } as never, {});

    expect(mockPrisma.soyaBeanIntake.update).toHaveBeenCalledWith({
      where: { id: "intake-1" },
      data: expect.objectContaining({ supplierName: "New Farm", notes: "corrected", updatedById: "user-1" })
    });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "SoyaBeanIntake" }));
  });

  it("deleteIntake reverses the posted inventory increment with a floor-guarded decrement, then soft-deletes the intake", async () => {
    const service = makeService();
    await service.deleteIntake(makeUser(), "intake-1", {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 200 } },
      data: { quantityOnHand: { decrement: 200 }, updatedById: "user-1" }
    });
    expect(mockTx.soyaBeanIntake.update).toHaveBeenCalledWith({
      where: { id: "intake-1" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1" }
    });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "SoyaBeanIntake" }));
  });

  it("deleteIntake blocks when the beans have already moved on downstream, instead of driving inventory negative", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.deleteIntake(makeUser(), "intake-1", {})).rejects.toThrow();
    expect(mockTx.soyaBeanIntake.update).not.toHaveBeenCalled();
  });
});

describe("SoyaProcessingService.updateBatch / deleteBatch", () => {
  const batchRecord = {
    id: "batch-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
    beanProductId: "prod-bean", batchNumber: "SPB-001", beansUsedKg: 100,
    oilOutputs: [{ id: "oil-1", warehouseId: "wh-oil", productId: "prod-oil", quantityLitres: 15 }],
    cakeOutputs: [{ id: "cake-1", warehouseId: "wh-cake", productId: "prod-cake", quantityKg: 75 }],
    wasteRecords: [{ id: "waste-1" }],
    costs: [{ id: "cost-1" }],
    deletedAt: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaProcessingBatch.findFirst.mockResolvedValue(batchRecord);
    mockPrisma.soyaProcessingBatch.update.mockResolvedValue({ id: "batch-1", batchNumber: "SPB-001" });
    mockPrisma.stockMovement.findFirst.mockResolvedValue({ fromWarehouseId: "wh-raw" });
    mockTx.inventoryItem.findFirst.mockImplementation(({ where }: { where: { warehouseId: string } }) => {
      if (where.warehouseId === "wh-raw") return Promise.resolve({ id: "inv-bean", uomId: "uom-bean" });
      if (where.warehouseId === "wh-oil") return Promise.resolve({ id: "inv-oil", uomId: "uom-oil" });
      if (where.warehouseId === "wh-cake") return Promise.resolve({ id: "inv-cake", uomId: "uom-cake" });
      return Promise.resolve(null);
    });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
  });

  it("updateBatch patches metadata fields only and writes an UPDATE audit entry", async () => {
    const service = makeService();
    await service.updateBatch(makeUser(), "batch-1", { notes: "corrected" } as never, {});

    expect(mockPrisma.soyaProcessingBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: expect.objectContaining({ notes: "corrected", updatedById: "user-1" })
    });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "SoyaProcessingBatch" }));
  });

  it("deleteBatch reverses the bean consumption (increment) and both outputs (floor-guarded decrement), then soft-deletes everything the batch created", async () => {
    const service = makeService();
    await service.deleteBatch(makeUser(), "batch-1", {});

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-bean" },
      data: { quantityOnHand: { increment: 100 }, updatedById: "user-1" }
    });
    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-oil", quantityOnHand: { gte: 15 } },
      data: { quantityOnHand: { decrement: 15 }, updatedById: "user-1" }
    });
    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-cake", quantityOnHand: { gte: 75 } },
      data: { quantityOnHand: { decrement: 75 }, updatedById: "user-1" }
    });
    expect(mockTx.soyaOilOutput.update).toHaveBeenCalledWith({ where: { id: "oil-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockTx.soyaCakeOutput.update).toHaveBeenCalledWith({ where: { id: "cake-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockTx.soyaWasteRecord.update).toHaveBeenCalledWith({ where: { id: "waste-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockTx.soyaProductionCost.update).toHaveBeenCalledWith({ where: { id: "cost-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockTx.soyaProcessingBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1" }
    });
  });

  it("deleteBatch blocks when an output has already moved on downstream, instead of driving inventory negative", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.deleteBatch(makeUser(), "batch-1", {})).rejects.toThrow();
    expect(mockTx.soyaProcessingBatch.update).not.toHaveBeenCalled();
  });
});

describe("SoyaProcessingService.updateQualityCheck / deleteQualityCheck", () => {
  function makeCheck(overrides: Record<string, unknown> = {}) {
    return { id: "check-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1", approvedAt: null, deletedAt: null, ...overrides };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaQualityCheck.update.mockResolvedValue({ id: "check-1" });
  });

  it("updateQualityCheck patches metadata fields when the check is still open", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck());
    const service = makeService();
    await service.updateQualityCheck(makeUser(), "check-1", { notes: "recheck" } as never, {});

    expect(mockPrisma.soyaQualityCheck.update).toHaveBeenCalledWith({ where: { id: "check-1" }, data: expect.objectContaining({ notes: "recheck" }) });
  });

  it("updateQualityCheck blocks editing a finalized (approved/rejected) check", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck({ approvedAt: new Date() }));
    const service = makeService();
    await expect(service.updateQualityCheck(makeUser(), "check-1", { notes: "x" } as never, {})).rejects.toThrow();
    expect(mockPrisma.soyaQualityCheck.update).not.toHaveBeenCalled();
  });

  it("deleteQualityCheck soft-deletes an open check", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck());
    const service = makeService();
    await service.deleteQualityCheck(makeUser(), "check-1", {});

    expect(mockPrisma.soyaQualityCheck.update).toHaveBeenCalledWith({ where: { id: "check-1" }, data: { deletedAt: expect.any(Date) } });
  });

  it("deleteQualityCheck blocks deleting a finalized (approved/rejected) check", async () => {
    mockPrisma.soyaQualityCheck.findFirst.mockResolvedValue(makeCheck({ approvedAt: new Date() }));
    const service = makeService();
    await expect(service.deleteQualityCheck(makeUser(), "check-1", {})).rejects.toThrow();
    expect(mockPrisma.soyaQualityCheck.update).not.toHaveBeenCalled();
  });
});

describe("SoyaProcessingService.updateTransfer / deleteTransfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaInternalTransfer.findFirst.mockResolvedValue({
      id: "trf-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      fromWarehouseId: "wh-a", toWarehouseId: "wh-b", toProductionSiteId: null, productId: "prod-x", quantity: 30, deletedAt: null
    });
    mockPrisma.soyaInternalTransfer.update.mockResolvedValue({ id: "trf-1" });
    mockTx.inventoryItem.findFirst.mockImplementation(({ where }: { where: { warehouseId: string } }) => {
      if (where.warehouseId === "wh-b") return Promise.resolve({ id: "inv-dest", uomId: "uom-1" });
      if (where.warehouseId === "wh-a") return Promise.resolve({ id: "inv-src", uomId: "uom-1" });
      return Promise.resolve(null);
    });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
  });

  const user = () => makeUser({ warehouseIds: ["wh-a", "wh-b"], hasGlobalAccess: true });

  it("updateTransfer patches notes only and writes an UPDATE audit entry", async () => {
    const service = makeService();
    await service.updateTransfer(user(), "trf-1", { notes: "corrected" } as never, {});

    expect(mockPrisma.soyaInternalTransfer.update).toHaveBeenCalledWith({ where: { id: "trf-1" }, data: { notes: "corrected", updatedById: "user-1" } });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "SoyaInternalTransfer" }));
  });

  it("deleteTransfer reverses both legs — floor-guarded decrement at the destination, safe increment back at the source", async () => {
    const service = makeService();
    await service.deleteTransfer(user(), "trf-1", {});

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-dest", quantityOnHand: { gte: 30 } },
      data: { quantityOnHand: { decrement: 30 }, updatedById: "user-1" }
    });
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-src" },
      data: { quantityOnHand: { increment: 30 }, updatedById: "user-1" }
    });
    expect(mockTx.soyaInternalTransfer.update).toHaveBeenCalledWith({
      where: { id: "trf-1" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1", status: "CANCELLED" }
    });
  });

  it("deleteTransfer blocks when the destination stock has already moved on, instead of driving inventory negative", async () => {
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

    const service = makeService();
    await expect(service.deleteTransfer(user(), "trf-1", {})).rejects.toThrow();
    expect(mockTx.soyaInternalTransfer.update).not.toHaveBeenCalled();
    expect(mockTx.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe("SoyaProcessingService.updateSale / deleteSale", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.soyaSalesLink.findFirst.mockResolvedValue({
      id: "sale-1", companyId: "company-1", branchId: "branch-1", productionSiteId: "site-1",
      warehouseId: "wh-oil", productId: "prod-oil", quantity: 20, customerName: "Acme", deletedAt: null
    });
    mockPrisma.soyaSalesLink.update.mockResolvedValue({ id: "sale-1" });
    mockTx.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", uomId: "uom-1" });
  });

  const user = () => makeUser({ warehouseIds: ["wh-oil"], hasGlobalAccess: true });

  it("updateSale patches metadata fields only and writes an UPDATE audit entry", async () => {
    const service = makeService();
    await service.updateSale(user(), "sale-1", { customerName: "New Customer" } as never, {});

    expect(mockPrisma.soyaSalesLink.update).toHaveBeenCalledWith({
      where: { id: "sale-1" },
      data: expect.objectContaining({ customerName: "New Customer", updatedById: "user-1" })
    });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "SoyaSalesLink" }));
  });

  it("deleteSale reverses the posted decrement with a safe increment (nothing downstream a sale's stock could have moved on to), then soft-deletes the sale", async () => {
    const service = makeService();
    await service.deleteSale(user(), "sale-1", {});

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { quantityOnHand: { increment: 20 }, updatedById: "user-1" }
    });
    expect(mockTx.soyaSalesLink.update).toHaveBeenCalledWith({
      where: { id: "sale-1" },
      data: { deletedAt: expect.any(Date), updatedById: "user-1", status: "CANCELLED" }
    });
    expect(mockAudit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "SoyaSalesLink" }));
  });
});
