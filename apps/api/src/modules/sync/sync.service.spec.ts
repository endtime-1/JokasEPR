import { AuthenticatedUser } from "@jokas/shared";
import { SyncService } from "./sync.service";

const mockPrisma = {
  mobileSyncRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
};
const mockInventoryService = { createStockMovement: jest.fn() };
const mockPoultryService = {};
const mockHrService = {};

function makeService() {
  return new SyncService(mockPrisma as never, mockPoultryService as never, mockInventoryService as never, mockHrService as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: true,
    ...overrides
  };
}

function stockMovementItem(overrides: Record<string, unknown> = {}) {
  return {
    localId: "local-1",
    endpoint: "/inventory/stock-movements",
    method: "POST",
    module: "inventory",
    payload: { inventoryItemId: "inv-1", quantity: 5 },
    ...overrides
  };
}

describe("SyncService.batchSync / processSyncItem — claim-before-work idempotency (H10)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claims the localId with a PROCESSING row before doing any work, then resolves it to SYNCED", async () => {
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
    mockPrisma.mobileSyncRecord.create.mockResolvedValue({ id: "rec-1" });
    mockInventoryService.createStockMovement.mockResolvedValue({ data: { id: "mvmt-1" } });

    const service = makeService();
    const result = await service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {});

    expect(mockPrisma.mobileSyncRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ localId: "local-1", status: "PROCESSING" }) })
    );
    // The claim (create) must happen before the real work runs.
    const createOrder = mockPrisma.mobileSyncRecord.create.mock.invocationCallOrder[0];
    const workOrder = mockInventoryService.createStockMovement.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(workOrder);

    expect(mockPrisma.mobileSyncRecord.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "SYNCED", recordId: "mvmt-1" }
    });
    expect(result.data.results[0]).toEqual({ localId: "local-1", status: "synced", recordId: "mvmt-1" });
  });

  it("does not run the underlying work twice for two concurrent requests with the same localId", async () => {
    // Simulates the exact race: both requests' fast-path read sees nothing
    // yet (the first hasn't committed its claim), so both reach create().
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
    mockPrisma.mobileSyncRecord.create
      .mockResolvedValueOnce({ id: "rec-1" }) // first request wins the claim
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" })); // second loses
    mockInventoryService.createStockMovement.mockResolvedValue({ data: { id: "mvmt-1" } });

    const service = makeService();
    const [first, second] = await Promise.all([
      service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {}),
      service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {})
    ]);

    // The real work (createStockMovement) only ever ran once, not twice —
    // this is the bug: two real stock movements for one physical transaction.
    expect(mockInventoryService.createStockMovement).toHaveBeenCalledTimes(1);
    expect(first.data.results[0].status).toBe("synced");
    expect(second.data.results[0].status).toBe("duplicate");
  });

  it("never overwrites a winner's SYNCED marker with FAILED from a losing concurrent request", async () => {
    // This is the second half of the bug: the loser used to reach the
    // catch block and upsert FAILED over the winner's already-SYNCED row.
    // Now the loser short-circuits on P2002 before ever touching the
    // winner's row.
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
    mockPrisma.mobileSyncRecord.create
      .mockResolvedValueOnce({ id: "rec-1" })
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    mockInventoryService.createStockMovement.mockResolvedValue({ data: { id: "mvmt-1" } });

    const service = makeService();
    await Promise.all([
      service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {}),
      service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {})
    ]);

    expect(mockPrisma.mobileSyncRecord.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mobileSyncRecord.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "SYNCED", recordId: "mvmt-1" }
    });
  });

  it("resolves its own claim to FAILED (not a shared upsert) when the underlying work throws", async () => {
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
    mockPrisma.mobileSyncRecord.create.mockResolvedValue({ id: "rec-1" });
    mockInventoryService.createStockMovement.mockRejectedValue(new Error("Insufficient stock"));

    const service = makeService();
    const result = await service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {});

    expect(mockPrisma.mobileSyncRecord.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "FAILED", errorMsg: "Insufficient stock" }
    });
    expect(result.data.results[0]).toEqual({ localId: "local-1", status: "failed", error: "Insufficient stock" });
  });

  it("replays a resolved SYNCED/FAILED outcome via the fast-path read without re-running the work", async () => {
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue({ status: "SYNCED", recordId: "mvmt-1", errorMsg: null });

    const service = makeService();
    const result = await service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {});

    expect(mockPrisma.mobileSyncRecord.create).not.toHaveBeenCalled();
    expect(mockInventoryService.createStockMovement).not.toHaveBeenCalled();
    expect(result.data.results[0]).toEqual({ localId: "local-1", status: "duplicate", recordId: "mvmt-1", error: undefined });
  });

  it("treats a still-PROCESSING record (genuinely in-flight or crashed) as a duplicate, not a fresh attempt", async () => {
    mockPrisma.mobileSyncRecord.findUnique.mockResolvedValue({ status: "PROCESSING", recordId: null, errorMsg: null });

    const service = makeService();
    const result = await service.batchSync(makeUser(), { records: [stockMovementItem()] } as never, {});

    expect(mockPrisma.mobileSyncRecord.create).not.toHaveBeenCalled();
    expect(mockInventoryService.createStockMovement).not.toHaveBeenCalled();
    expect(result.data.results[0].status).toBe("duplicate");
  });
});
