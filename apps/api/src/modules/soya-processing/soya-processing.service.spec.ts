import { AuthenticatedUser } from "@jokas/shared";
import { SoyaProcessingService } from "./soya-processing.service";

const mockTx = {
  inventoryItem: { updateMany: jest.fn(), upsert: jest.fn() },
  soyaProcessingBatch: { create: jest.fn() },
  stockMovement: { create: jest.fn() },
  soyaOilOutput: { create: jest.fn() },
  soyaCakeOutput: { create: jest.fn() },
  soyaWasteRecord: { create: jest.fn() },
  soyaProductionCost: { create: jest.fn() }
};

const mockPrisma = {
  productionSite: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  inventoryItem: { findFirst: jest.fn() },
  soyaBeanIntake: { findFirst: jest.fn() },
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

describe("SoyaProcessingService.createBatch — costs from the linked intake and guards the decrement (M10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.productionSite.findFirst.mockResolvedValue({ id: "site-1", branchId: "branch-1" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-x", uomId: "uom-1" });
    mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: "inv-1", quantityOnHand: 500 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.upsert.mockResolvedValue({ id: "inv-out" });
    mockTx.soyaProcessingBatch.create.mockResolvedValue({ id: "batch-1", branchId: "branch-1", productionSiteId: "site-1" });
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
