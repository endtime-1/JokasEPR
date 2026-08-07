import { BadRequestException } from "@nestjs/common";
import { MarketPlanningService } from "./market-planning.service";

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
