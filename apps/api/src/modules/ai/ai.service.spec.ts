import { ForbiddenException } from "@nestjs/common";
import { AiService } from "./ai.service";

const mockPrisma = {
  loginRateLimit: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  flockBatch: { findFirst: jest.fn() },
  feedConsumptionRecord: { findMany: jest.fn() }
};
const mockConfig = { get: jest.fn() };
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };
const mockData = {};

function makeService() {
  return new AiService(mockPrisma as never, mockConfig as never, mockAudit as never, mockData as never);
}

function service() {
  return makeService() as unknown as { enforceRateLimit: (userId: string) => Promise<void> };
}

// (L7) enforceRateLimit previously used an in-process Map only — if the API
// ever runs multiple forks, each fork's Map is independent, so a user's
// requests spread across forks effectively multiply their real limit.
describe("AiService.enforceRateLimit — shared across processes via the DB, not per-process (L7)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows the first request in a new window via an upsert", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue(null);
    mockPrisma.loginRateLimit.upsert.mockResolvedValue({});

    await service().enforceRateLimit("user-1");

    expect(mockPrisma.loginRateLimit.upsert).toHaveBeenCalledWith({
      where: { key: "ai:chat:user-1" },
      create: expect.objectContaining({ key: "ai:chat:user-1", attempts: 1 }),
      update: expect.objectContaining({ attempts: 1 })
    });
  });

  it("increments the shared DB row instead of a local counter for a request within the window", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue({ key: "ai:chat:user-1", attempts: 5, windowEnd: new Date(Date.now() + 30000) });
    mockPrisma.loginRateLimit.update.mockResolvedValue({});

    await service().enforceRateLimit("user-1");

    expect(mockPrisma.loginRateLimit.update).toHaveBeenCalledWith({
      where: { key: "ai:chat:user-1" },
      data: { attempts: { increment: 1 } }
    });
  });

  it("rejects once the shared count reaches the limit, regardless of which fork is handling the request", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue({ key: "ai:chat:user-1", attempts: 20, windowEnd: new Date(Date.now() + 30000) });

    await expect(service().enforceRateLimit("user-1")).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.loginRateLimit.update).not.toHaveBeenCalled();
  });

  it("falls back to an in-memory check without throwing when the DB is unreachable", async () => {
    mockPrisma.loginRateLimit.findUnique.mockRejectedValue(new Error("connection pool exhausted"));

    await expect(service().enforceRateLimit("user-2")).resolves.toBeUndefined();
  });
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: ["ai.read"], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  } as never;
}

describe("AiService.feedAnalysis — scoped to the user's assigned farm (H-BACK-6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue("claude-sonnet-4-6");
  });

  it("blocks a non-global-access user from analyzing a batch on a farm they aren't assigned to", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", farmId: "farm-other", farm: { name: "Other Farm" } });
    const service = makeService();

    await expect(
      service.feedAnalysis(makeUser({ farmIds: ["farm-1"] }), "batch-1")
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.feedConsumptionRecord.findMany).not.toHaveBeenCalled();
  });

  it("allows a user whose farmIds include the batch's farm", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", farmId: "farm-1", farm: { name: "Farm One" } });
    mockPrisma.feedConsumptionRecord.findMany.mockResolvedValue([]);
    const service = makeService();
    jest.spyOn(service as never as { callAi: (...args: unknown[]) => Promise<{ reply: string }> }, "callAi").mockResolvedValue({ reply: "analysis" });

    await expect(
      service.feedAnalysis(makeUser({ farmIds: ["farm-1"] }), "batch-1")
    ).resolves.toBeDefined();
  });

  it("allows a global-access user regardless of farmIds", async () => {
    mockPrisma.flockBatch.findFirst.mockResolvedValue({ id: "batch-1", farmId: "farm-other", farm: { name: "Other Farm" } });
    mockPrisma.feedConsumptionRecord.findMany.mockResolvedValue([]);
    const service = makeService();
    jest.spyOn(service as never as { callAi: (...args: unknown[]) => Promise<{ reply: string }> }, "callAi").mockResolvedValue({ reply: "analysis" });

    await expect(
      service.feedAnalysis(makeUser({ hasGlobalAccess: true, farmIds: [] }), "batch-1")
    ).resolves.toBeDefined();
  });
});
