import { AuthenticatedUser } from "@jokas/shared";
import { SoyaProcessingService } from "./soya-processing.service";

const mockTx = {
  inventoryItem: { updateMany: jest.fn(), upsert: jest.fn() },
  soyaBeanIntake: { create: jest.fn() },
  soyaProcessingBatch: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  stockBatch: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  soyaOilOutput: { create: jest.fn() },
  soyaCakeOutput: { create: jest.fn() },
  soyaWasteRecord: { create: jest.fn() },
  soyaProductionCost: { create: jest.fn() },
  soyaInternalTransfer: { create: jest.fn() },
  soyaSalesLink: { create: jest.fn() }
};

const mockPrisma = {
  productionSite: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  inventoryItem: { findFirst: jest.fn() },
  soyaBeanIntake: { findFirst: jest.fn() },
  soyaProcessingBatch: { findFirst: jest.fn() },
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
