import { AuthenticatedUser } from "@jokas/shared";
import { QrService } from "./qr.service";

const mockTx = {
  inventoryItem: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  stockBatch: { update: jest.fn(), updateMany: jest.fn() },
  stockMovement: { create: jest.fn() }
};

const mockPrisma = {
  stockBatch: { findUnique: jest.fn() },
  inventoryItem: { findUnique: jest.fn() },
  warehouse: { findFirst: jest.fn() },
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new QrService(mockPrisma as never, mockAudit as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: ["inventory.manage"], branchIds: [], farmIds: [], warehouseIds: ["wh-1", "wh-2"], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

function mockScan(service: QrService, qr: Record<string, unknown>) {
  jest.spyOn(service, "scan").mockResolvedValue({ data: qr } as never);
}

const item = { id: "inv-1", quantityOnHand: 500, productId: "prod-1", uomId: "uom-1", branchId: "branch-1", warehouseId: "wh-1", farmId: null, productionSiteId: null };

describe("QrService.stockMovementByCode — floor-guarded decrement + batch/aggregate mismatch fix (H11)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects when the batch's own quantityRemaining is insufficient even though the item's aggregate quantityOnHand looks healthy", async () => {
    // Aggregate stock (summed across all batches) is a healthy 500, but the
    // SPECIFIC scanned batch only has 3 left — a batch-scoped scan for 10
    // must be rejected against the batch, not the aggregate.
    const service = makeService();
    mockScan(service, { id: "qr-1", entityType: "STOCK_BATCH", entityId: "batch-1", label: "Batch A" });
    mockPrisma.stockBatch.findUnique.mockResolvedValue({ id: "batch-1", inventoryItemId: "inv-1", quantityRemaining: 3 });
    mockPrisma.inventoryItem.findUnique.mockResolvedValue(item);

    await expect(
      service.stockMovementByCode(makeUser(), { code: "qr-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never)
    ).rejects.toThrow(/batch/i);
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("floor-guards the item decrement instead of a plain update, rejecting a concurrent race", async () => {
    const service = makeService();
    mockScan(service, { id: "qr-1", entityType: "WAREHOUSE_ITEM", entityId: "inv-1", label: "Item A" });
    mockPrisma.inventoryItem.findUnique.mockResolvedValue({ ...item, quantityOnHand: 50 });
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 0 }); // lost the race

    await expect(
      service.stockMovementByCode(makeUser(), { code: "qr-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never)
    ).rejects.toThrow(/concurrently/);
  });

  it("succeeds and floor-guards both the item and the specific batch when stock genuinely covers the request", async () => {
    const service = makeService();
    mockScan(service, { id: "qr-1", entityType: "STOCK_BATCH", entityId: "batch-1", label: "Batch A" });
    mockPrisma.stockBatch.findUnique.mockResolvedValue({ id: "batch-1", inventoryItemId: "inv-1", quantityRemaining: 20 });
    mockPrisma.inventoryItem.findUnique.mockResolvedValue(item);
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mv-1" });

    await service.stockMovementByCode(makeUser(), { code: "qr-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never);

    expect(mockTx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", quantityOnHand: { gte: 10 } },
      data: { quantityOnHand: { increment: -10 } }
    });
    expect(mockTx.stockBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantityRemaining: { gte: 10 } },
      data: { quantityRemaining: { increment: -10 } }
    });
  });

  it("rejects when the specific batch's floor guard loses a concurrent race even though the item-level guard succeeded", async () => {
    const service = makeService();
    mockScan(service, { id: "qr-1", entityType: "STOCK_BATCH", entityId: "batch-1", label: "Batch A" });
    mockPrisma.stockBatch.findUnique.mockResolvedValue({ id: "batch-1", inventoryItemId: "inv-1", quantityRemaining: 20 });
    mockPrisma.inventoryItem.findUnique.mockResolvedValue(item);
    mockTx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    mockTx.stockBatch.updateMany.mockResolvedValue({ count: 0 }); // this specific batch raced

    await expect(
      service.stockMovementByCode(makeUser(), { code: "qr-1", movementType: "ADJUSTMENT_OUT", quantity: 10 } as never)
    ).rejects.toThrow(/batch's stock was modified concurrently/);
  });

  it("does not require a stock check at all for ADJUSTMENT_IN", async () => {
    const service = makeService();
    mockScan(service, { id: "qr-1", entityType: "WAREHOUSE_ITEM", entityId: "inv-1", label: "Item A" });
    mockPrisma.inventoryItem.findUnique.mockResolvedValue({ ...item, quantityOnHand: 0 });
    mockTx.stockMovement.create.mockResolvedValue({ id: "mv-1" });

    await expect(
      service.stockMovementByCode(makeUser(), { code: "qr-1", movementType: "ADJUSTMENT_IN", quantity: 10 } as never)
    ).resolves.toBeDefined();
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { quantityOnHand: { increment: 10 } } });
    expect(mockTx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });
});
