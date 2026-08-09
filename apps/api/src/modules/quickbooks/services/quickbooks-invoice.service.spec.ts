import { QuickBooksApiError } from "./quickbooks-client.service";
import { QuickBooksInvoiceService } from "./quickbooks-invoice.service";

const mockPrisma = {
  invoice: { findFirstOrThrow: jest.fn(), update: jest.fn().mockResolvedValue({}) }
};
const mockClient = { get: jest.fn(), post: jest.fn(), query: jest.fn() };
const mockQbLogger = { getConnection: jest.fn(), begin: jest.fn(), succeed: jest.fn(), partial: jest.fn() };

function makeService() {
  return new QuickBooksInvoiceService(mockPrisma as never, mockClient as never, mockQbLogger as never);
}

const invoice = {
  id: "inv-1",
  invoiceNumber: "INV-001",
  invoiceDate: new Date("2026-08-01"),
  dueDate: new Date("2026-08-15"),
  totalAmount: 100,
  status: "ISSUED",
  qbInvoiceId: "qb-inv-1",
  customer: { name: "Acme", qbCustomerId: "qb-cust-1" }
};

describe("QuickBooksInvoiceService.syncOne — only a genuine 404 means 'recreate' (H20)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates the existing QB invoice in place on the happy path", async () => {
    mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
    mockClient.get.mockResolvedValue({ Invoice: { Id: "qb-inv-1", SyncToken: "3" } });
    mockClient.post.mockResolvedValue({ Invoice: { Id: "qb-inv-1" } });

    const service = makeService();
    await service.syncOne("company-1", "inv-1");

    expect(mockClient.post).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qbInvoiceId: "qb-inv-1", qbSyncStatus: "SYNCED" }) })
    );
  });

  it("recreates the invoice when QuickBooks genuinely returns 404 for it", async () => {
    mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
    mockClient.get.mockRejectedValue(new QuickBooksApiError("not found", 404));
    mockClient.post.mockResolvedValue({ Invoice: { Id: "qb-inv-NEW" } });

    const service = makeService();
    await service.syncOne("company-1", "inv-1");

    // Exactly one POST — the createQBInvoice call. The failed update-attempt
    // POST never ran because get() threw before reaching it.
    expect(mockClient.post).toHaveBeenCalledTimes(1);
    expect(mockClient.post).toHaveBeenCalledWith("company-1", "invoice", expect.not.objectContaining({ Id: "qb-inv-1" }));
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qbInvoiceId: "qb-inv-NEW", qbSyncStatus: "SYNCED" }) })
    );
  });

  it("does NOT recreate the invoice on a transient failure (500) — marks the sync FAILED instead", async () => {
    mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
    mockClient.get.mockRejectedValue(new QuickBooksApiError("internal error", 500));

    const service = makeService();
    await expect(service.syncOne("company-1", "inv-1")).rejects.toThrow();

    expect(mockClient.post).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qbSyncStatus: "FAILED" }) })
    );
  });

  it("does NOT recreate the invoice on a plain network error with no status at all — marks the sync FAILED instead", async () => {
    mockPrisma.invoice.findFirstOrThrow.mockResolvedValue(invoice);
    mockClient.get.mockRejectedValue(new Error("socket hang up"));

    const service = makeService();
    await expect(service.syncOne("company-1", "inv-1")).rejects.toThrow();

    expect(mockClient.post).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qbSyncStatus: "FAILED" }) })
    );
  });
});
