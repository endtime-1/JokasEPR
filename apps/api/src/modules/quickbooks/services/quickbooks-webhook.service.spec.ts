import { createHmac } from "crypto";
import { QuickBooksWebhookService } from "./quickbooks-webhook.service";

const mockPrisma = {
  quickBooksConnection: { findFirst: jest.fn().mockResolvedValue({ id: "conn-1" }) },
  quickBooksWebhookEvent: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() }
};
const VERIFIER_TOKEN = "test-verifier-token";
const mockConfig = { get: jest.fn().mockReturnValue(VERIFIER_TOKEN) };

function makeService() {
  return new QuickBooksWebhookService(mockPrisma as never, mockConfig as never);
}

function signedPayload(entities: Array<{ name: string; id: string; operation: string; lastUpdated: string }>) {
  const body = { eventNotifications: [{ realmId: "realm-1", dataChangeEvent: { entities } }] };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = createHmac("sha256", VERIFIER_TOKEN).update(rawBody).digest("base64");
  return { rawBody, signature };
}

describe("QuickBooksWebhookService.processPayload — dedups redelivered events instead of recording duplicates (M2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records a genuinely new event", async () => {
    mockPrisma.quickBooksWebhookEvent.create.mockResolvedValue({});
    const { rawBody, signature } = signedPayload([
      { name: "Invoice", id: "qb-inv-1", operation: "Update", lastUpdated: "2026-08-09T10:00:00Z" }
    ]);

    const service = makeService();
    await service.processPayload(rawBody, signature);

    expect(mockPrisma.quickBooksWebhookEvent.create).toHaveBeenCalledTimes(1);
  });

  it("silently skips a redelivered event instead of throwing when the unique dedup index rejects it", async () => {
    mockPrisma.quickBooksWebhookEvent.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );
    const { rawBody, signature } = signedPayload([
      { name: "Invoice", id: "qb-inv-1", operation: "Update", lastUpdated: "2026-08-09T10:00:00Z" }
    ]);

    const service = makeService();
    await expect(service.processPayload(rawBody, signature)).resolves.toBeUndefined();
  });

  it("still processes other entities in the same payload after one is deduped", async () => {
    mockPrisma.quickBooksWebhookEvent.create
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
      .mockResolvedValueOnce({});
    const { rawBody, signature } = signedPayload([
      { name: "Invoice", id: "qb-inv-1", operation: "Update", lastUpdated: "2026-08-09T10:00:00Z" },
      { name: "Payment", id: "qb-pay-1", operation: "Create", lastUpdated: "2026-08-09T10:01:00Z" }
    ]);

    const service = makeService();
    await service.processPayload(rawBody, signature);

    expect(mockPrisma.quickBooksWebhookEvent.create).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid signature before ever attempting to record anything", async () => {
    const { rawBody } = signedPayload([{ name: "Invoice", id: "qb-inv-1", operation: "Update", lastUpdated: "2026-08-09T10:00:00Z" }]);

    const service = makeService();
    await expect(service.processPayload(rawBody, "bogus-signature")).rejects.toThrow();
    expect(mockPrisma.quickBooksWebhookEvent.create).not.toHaveBeenCalled();
  });
});
