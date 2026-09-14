import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { EggSalesService } from "./egg-sales.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("ES-2026-0001") }));

const EGGS_PRODUCT = { id: "prod-eggs", piecesPerUnit: 30 };
const WAREHOUSE = { id: "wh-akoko", companyId: "company-1", branchId: "branch-hq", name: "Akoko Solution Egg Store", type: "EGG_STORE", deletedAt: null };
const INVENTORY_ITEM = {
  id: "item-1", companyId: "company-1", branchId: "branch-hq", farmId: null, warehouseId: "wh-akoko",
  productionSiteId: null, productId: "prod-eggs", uomId: "uom-crate", quantityOnHand: 100,
};

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: true,
    ...overrides
  };
}

describe("EggSalesService.createSale", () => {
  const mockTx = {
    eggSale: { create: jest.fn() },
    stockBatch: { findMany: jest.fn(), updateMany: jest.fn() },
    stockMovement: { create: jest.fn() },
    inventoryItem: { updateMany: jest.fn() }
  };
  const mockPrisma = {
    warehouse: { findFirst: jest.fn() },
    product: { findFirst: jest.fn() },
    inventoryItem: { findFirst: jest.fn() },
    eggSale: { findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
  };
  const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new EggSalesService(mockPrisma as never, mockAudit as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.warehouse.findFirst.mockResolvedValue(WAREHOUSE);
    mockPrisma.product.findFirst.mockResolvedValue(EGGS_PRODUCT);
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(INVENTORY_ITEM);
    mockPrisma.eggSale.findFirst.mockResolvedValue(null);
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 100, unitCost: 20 }]);
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.eggSale.create.mockImplementation((args: any) => Promise.resolve({ id: "sale-1", ...args.data }));
  });

  it("converts a piece quantity to crates using the product's own piecesPerUnit, and computes the total from crates × price", async () => {
    const service = makeService();
    const result = await service.createSale(
      makeUser(),
      { warehouseId: "wh-akoko", buyerName: "Ama", quantity: 90, unit: "PIECES", unitPriceCrate: 25 } as never,
      {}
    );

    expect(result.data.quantityPieces).toBe(90);
    expect(result.data.quantityCrates).toBe(3); // 90 / 30
    expect(result.data.totalAmount).toBe(75); // 3 crates × 25
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantityRemaining: { decrement: 3 } } })
    );
  });

  it("accepts a crate quantity directly without going through the pieces conversion", async () => {
    const service = makeService();
    const result = await service.createSale(
      makeUser(),
      { warehouseId: "wh-akoko", quantity: 5, unit: "CRATES", unitPriceCrate: 30 } as never,
      {}
    );

    expect(result.data.quantityCrates).toBe(5);
    expect(result.data.quantityPieces).toBe(150); // 5 × 30
    expect(result.data.totalAmount).toBe(150);
  });

  it("uses a manually-given sale number instead of auto-generating one", async () => {
    const service = makeService();
    const result = await service.createSale(
      makeUser(),
      { warehouseId: "wh-akoko", quantity: 5, unit: "CRATES", unitPriceCrate: 30, saleNumber: "1333" } as never,
      {}
    );

    expect(mockPrisma.eggSale.findFirst).toHaveBeenCalledWith({ where: { companyId: "company-1", saleNumber: "1333" } });
    expect(result.data.saleNumber).toBe("1333");
  });

  it("rejects a manually-given sale number that's already in use", async () => {
    mockPrisma.eggSale.findFirst.mockResolvedValue({ id: "existing-sale" });
    const service = makeService();

    await expect(
      service.createSale(makeUser(), { warehouseId: "wh-akoko", quantity: 5, unit: "CRATES", unitPriceCrate: 30, saleNumber: "1333" } as never, {})
    ).rejects.toThrow(/already in use/);
    expect(mockTx.eggSale.create).not.toHaveBeenCalled();
  });

  it("rejects selling from a warehouse that isn't an Egg Store", async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValue({ ...WAREHOUSE, type: "FEED_STORE" });
    const service = makeService();

    await expect(
      service.createSale(makeUser(), { warehouseId: "wh-akoko", quantity: 1, unit: "CRATES", unitPriceCrate: 25 } as never, {})
    ).rejects.toThrow(BadRequestException);
    expect(mockTx.eggSale.create).not.toHaveBeenCalled();
  });

  it("rejects when no \"Eggs\" (SKU EG) product exists in the catalog yet", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    const service = makeService();

    await expect(
      service.createSale(makeUser(), { warehouseId: "wh-akoko", quantity: 1, unit: "CRATES", unitPriceCrate: 25 } as never, {})
    ).rejects.toThrow(/Eggs.*catalog/);
  });

  it("rejects a sale that exceeds the crates actually available in stock batches", async () => {
    mockTx.stockBatch.findMany.mockResolvedValue([{ id: "batch-1", quantityRemaining: 2, unitCost: 20 }]);
    const service = makeService();

    await expect(
      service.createSale(makeUser(), { warehouseId: "wh-akoko", quantity: 5, unit: "CRATES", unitPriceCrate: 25 } as never, {})
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects when the actor has no access to the warehouse", async () => {
    const service = makeService();
    await expect(
      service.createSale(makeUser({ hasGlobalAccess: false, warehouseIds: ["wh-other"] }), { warehouseId: "wh-akoko", quantity: 1, unit: "CRATES", unitPriceCrate: 25 } as never, {})
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("EggSalesService.voidSale", () => {
  const mockTx = {
    eggSale: { updateMany: jest.fn() },
    stockBatch: { update: jest.fn() },
    inventoryItem: { update: jest.fn() },
    stockMovement: { create: jest.fn() }
  };
  const mockPrisma = {
    eggSale: { findFirst: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
  };
  const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new EggSalesService(mockPrisma as never, mockAudit as never);
  }

  const SALE = { id: "sale-1", companyId: "company-1", branchId: "branch-hq", warehouseId: "wh-akoko", saleNumber: "ES-2026-0001", quantityCrates: 3, deletedAt: null };
  const DISPATCH = {
    id: "mv-1", branchId: "branch-hq", productId: "prod-eggs", inventoryItemId: "item-1", stockBatchId: "batch-1",
    warehouseId: "wh-akoko", farmId: null, productionSiteId: null, uomId: "uom-crate", quantity: 3, unitCost: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.eggSale.findFirst.mockResolvedValue(SALE);
    mockPrisma.stockMovement.findMany.mockResolvedValue([DISPATCH]);
    mockTx.eggSale.updateMany.mockResolvedValue({ count: 1 });
  });

  it("restores the exact stock batch the sale consumed, not just a bare quantityOnHand bump", async () => {
    const service = makeService();
    await service.voidSale(makeUser(), "sale-1", {});

    expect(mockTx.stockBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { quantityRemaining: { increment: 3 }, status: "AVAILABLE" }
    });
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { quantityOnHand: { increment: 3 } }
    });
    expect(mockTx.eggSale.updateMany).toHaveBeenCalledWith({
      where: { id: "sale-1", deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date) })
    });
  });

  it("refuses to void a sale with no recorded stock movement, rather than silently soft-deleting it", async () => {
    mockPrisma.stockMovement.findMany.mockResolvedValue([]);
    const service = makeService();

    await expect(service.voidSale(makeUser(), "sale-1", {})).rejects.toThrow(BadRequestException);
    expect(mockTx.eggSale.updateMany).not.toHaveBeenCalled();
  });

  it("404s on a sale that doesn't exist or was already voided", async () => {
    mockPrisma.eggSale.findFirst.mockResolvedValue(null);
    const service = makeService();
    await expect(service.voidSale(makeUser(), "missing", {})).rejects.toThrow(NotFoundException);
  });
});
