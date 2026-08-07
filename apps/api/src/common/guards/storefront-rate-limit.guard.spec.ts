import { ExecutionContext, HttpException } from "@nestjs/common";
import { StorefrontBrowseRateLimitGuard, StorefrontOrderRateLimitGuard } from "./storefront-rate-limit.guard";

const mockPrisma = {
  loginRateLimit: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() }
};

function makeContext(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) })
  } as unknown as ExecutionContext;
}

describe("StorefrontOrderRateLimitGuard — no longer fails open on a create race (M6)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("allows and creates a fresh window via an atomic upsert when none exists", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue(null);
    mockPrisma.loginRateLimit.upsert.mockResolvedValue({});

    const guard = new StorefrontOrderRateLimitGuard(mockPrisma as never);
    const allowed = await guard.canActivate(makeContext("1.2.3.4"));

    expect(allowed).toBe(true);
    expect(mockPrisma.loginRateLimit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "storefront:order:1.2.3.4" } })
    );
  });

  it("increments and allows while under the limit", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue({ attempts: 5, windowEnd: new Date(Date.now() + 60_000) });
    mockPrisma.loginRateLimit.update.mockResolvedValue({});

    const guard = new StorefrontOrderRateLimitGuard(mockPrisma as never);
    const allowed = await guard.canActivate(makeContext("1.2.3.4"));

    expect(allowed).toBe(true);
    expect(mockPrisma.loginRateLimit.update).toHaveBeenCalled();
  });

  it("rejects with 429 once the limit is reached, without silently allowing", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue({ attempts: 10, windowEnd: new Date(Date.now() + 60_000) });

    const guard = new StorefrontOrderRateLimitGuard(mockPrisma as never);
    await expect(guard.canActivate(makeContext("1.2.3.4"))).rejects.toThrow(HttpException);
    expect(mockPrisma.loginRateLimit.update).not.toHaveBeenCalled();
  });

  it("falls back to in-memory tracking on a DB error instead of allowing unconditionally", async () => {
    mockPrisma.loginRateLimit.findUnique.mockRejectedValue(new Error("unique constraint violation — lost the create race"));

    const guard = new StorefrontOrderRateLimitGuard(mockPrisma as never);
    const ip = `race-test-${Date.now()}`;

    // Previously: a DB error here (e.g. a lost create race) was caught and
    // treated as "allow the request" with no counting at all — a burst could
    // evade the limit entirely. Now it degrades to an in-memory counter that
    // still enforces the same limit.
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(makeContext(ip))).resolves.toBe(true);
    }
    await expect(guard.canActivate(makeContext(ip))).rejects.toThrow(HttpException);
  });
});

describe("StorefrontBrowseRateLimitGuard — no longer fails open on a create race (M6)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects with 429 once the limit is reached", async () => {
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue({ attempts: 60, windowEnd: new Date(Date.now() + 60_000) });

    const guard = new StorefrontBrowseRateLimitGuard(mockPrisma as never);
    await expect(guard.canActivate(makeContext("5.6.7.8"))).rejects.toThrow(HttpException);
  });

  it("falls back to in-memory tracking on a DB error instead of allowing unconditionally", async () => {
    mockPrisma.loginRateLimit.findUnique.mockRejectedValue(new Error("db unavailable"));

    const guard = new StorefrontBrowseRateLimitGuard(mockPrisma as never);
    const ip = `browse-race-test-${Date.now()}`;

    for (let i = 0; i < 60; i++) {
      await expect(guard.canActivate(makeContext(ip))).resolves.toBe(true);
    }
    await expect(guard.canActivate(makeContext(ip))).rejects.toThrow(HttpException);
  });
});
