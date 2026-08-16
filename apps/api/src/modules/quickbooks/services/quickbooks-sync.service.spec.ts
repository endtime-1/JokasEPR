import { QuickBooksSyncService } from "./quickbooks-sync.service";

const mockPrisma = {
  loginRateLimit: { create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn().mockResolvedValue({}) }
};
const mockQbLogger = {
  getConnection: jest.fn(),
  begin: jest.fn().mockResolvedValue("log-1"),
  succeed: jest.fn().mockResolvedValue(undefined),
  fail: jest.fn().mockResolvedValue(undefined)
};
const mockCustomerSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockVendorSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockItemSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockInvoiceSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockPaymentSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockBillSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };
const mockExpenseSvc = { syncAll: jest.fn().mockResolvedValue(undefined), syncOne: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new QuickBooksSyncService(
    mockPrisma as never,
    mockQbLogger as never,
    mockCustomerSvc as never,
    mockVendorSvc as never,
    mockItemSvc as never,
    mockInvoiceSvc as never,
    mockPaymentSvc as never,
    mockBillSvc as never,
    mockExpenseSvc as never
  );
}

describe("QuickBooksSyncService — per-company sync lock prevents duplicate-record races (C5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQbLogger.getConnection.mockResolvedValue({ id: "conn-1", isActive: true });
  });

  describe("syncAll", () => {
    it("acquires the lock, runs every entity sync, and releases the lock on success", async () => {
      mockPrisma.loginRateLimit.create.mockResolvedValue({});
      const service = makeService();

      await service.syncAll("company-1");

      expect(mockPrisma.loginRateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ key: "qb-sync-lock:company-1" }) })
      );
      expect(mockCustomerSvc.syncAll).toHaveBeenCalledWith("company-1", undefined);
      expect(mockPaymentSvc.syncAll).toHaveBeenCalledWith("company-1", undefined);
      expect(mockPrisma.loginRateLimit.deleteMany).toHaveBeenCalledWith({ where: { key: "qb-sync-lock:company-1" } });
    });

    it("no-ops without running any entity sync when another sync already holds the lock", async () => {
      // Simulates the exact race: a cron and a user-triggered "Sync Now"
      // firing for the same company within the same window.
      mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
      mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 0 }); // lock still held by the other sync
      const service = makeService();

      await service.syncAll("company-1");

      expect(mockCustomerSvc.syncAll).not.toHaveBeenCalled();
      expect(mockPaymentSvc.syncAll).not.toHaveBeenCalled();
    });

    it("still releases the lock even when an entity sync throws", async () => {
      mockPrisma.loginRateLimit.create.mockResolvedValue({});
      mockInvoiceSvc.syncAll.mockRejectedValueOnce(new Error("QBO API down"));
      const service = makeService();

      await service.syncAll("company-1");

      expect(mockPrisma.loginRateLimit.deleteMany).toHaveBeenCalledWith({ where: { key: "qb-sync-lock:company-1" } });
    });

    it("reclaims a stale lock left behind by a crashed prior sync", async () => {
      mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
      mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 1 }); // stale lock reclaimed
      const service = makeService();

      await service.syncAll("company-1");

      expect(mockCustomerSvc.syncAll).toHaveBeenCalled();
    });
  });

  describe("syncEntity / syncRecord", () => {
    beforeEach(() => {
      mockPrisma.loginRateLimit.create.mockResolvedValue({});
    });

    it("syncEntity acquires and releases the same per-company lock", async () => {
      const service = makeService();
      await service.syncEntity("company-1", "invoices");

      expect(mockPrisma.loginRateLimit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ key: "qb-sync-lock:company-1" }) })
      );
      expect(mockInvoiceSvc.syncAll).toHaveBeenCalled();
      expect(mockPrisma.loginRateLimit.deleteMany).toHaveBeenCalled();
    });

    it("syncEntity no-ops when the lock is already held", async () => {
      mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
      mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 0 });
      const service = makeService();

      await service.syncEntity("company-1", "invoices");
      expect(mockInvoiceSvc.syncAll).not.toHaveBeenCalled();
    });

    it("syncRecord acquires and releases the same per-company lock", async () => {
      const service = makeService();
      await service.syncRecord("company-1", "payments", "pay-1");

      expect(mockPaymentSvc.syncOne).toHaveBeenCalledWith("company-1", "pay-1");
      expect(mockPrisma.loginRateLimit.deleteMany).toHaveBeenCalled();
    });

    it("syncRecord no-ops when the lock is already held — a retried record can't double-POST to QuickBooks", async () => {
      mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
      mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 0 });
      const service = makeService();

      await service.syncRecord("company-1", "payments", "pay-1");
      expect(mockPaymentSvc.syncOne).not.toHaveBeenCalled();
    });

    it("H-BUG (DB stability audit, 2026-08-16): syncEntity logs a real sync-log row on success, same as syncAll", async () => {
      const service = makeService();
      await service.syncEntity("company-1", "invoices", "user-1");

      expect(mockQbLogger.begin).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company-1", connectionId: "conn-1", entityType: "invoices", triggeredById: "user-1" })
      );
      expect(mockQbLogger.succeed).toHaveBeenCalledWith("log-1", expect.objectContaining({ recordsProcessed: 1 }));
      expect(mockQbLogger.fail).not.toHaveBeenCalled();
    });

    it("H-BUG (DB stability audit, 2026-08-16): syncEntity records the failure to the DB-backed log instead of vanishing silently", async () => {
      mockInvoiceSvc.syncAll.mockRejectedValueOnce(new Error("QBO API down"));
      const service = makeService();

      // The controller fires this via setImmediate(...).catch(() => undefined) —
      // the fix is that the failure gets recorded before it's swallowed there,
      // not that it stops being swallowed. This must not throw.
      await expect(service.syncEntity("company-1", "invoices")).resolves.toBeUndefined();

      expect(mockQbLogger.fail).toHaveBeenCalledWith("log-1", "QBO API down");
      expect(mockQbLogger.succeed).not.toHaveBeenCalled();
      // Lock is still released even though the sync failed.
      expect(mockPrisma.loginRateLimit.deleteMany).toHaveBeenCalledWith({ where: { key: "qb-sync-lock:company-1" } });
    });

    it("syncEntity no-ops without acquiring the lock when the QuickBooks connection isn't active", async () => {
      mockQbLogger.getConnection.mockResolvedValueOnce({ id: "conn-1", isActive: false });
      const service = makeService();

      await service.syncEntity("company-1", "invoices");

      expect(mockPrisma.loginRateLimit.create).not.toHaveBeenCalled();
      expect(mockInvoiceSvc.syncAll).not.toHaveBeenCalled();
    });
  });
});
