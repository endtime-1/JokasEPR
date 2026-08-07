import { ExecutionContext } from "@nestjs/common";
import { LoginRateLimitGuard } from "./login-rate-limit.guard";

const mockPrisma = {
  loginRateLimit: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() }
};

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req })
  } as unknown as ExecutionContext;
}

describe("LoginRateLimitGuard — buckets per authenticated user, not per IP alone (L6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.loginRateLimit.findUnique.mockResolvedValue(null);
    mockPrisma.loginRateLimit.upsert.mockResolvedValue({});
  });

  it("keys the bucket by request.user.id when the request is already authenticated (e.g. change-password)", async () => {
    const guard = new LoginRateLimitGuard(mockPrisma as never);
    const req = { ip: "1.2.3.4", user: { id: "user-42" }, body: {} };

    await guard.canActivate(makeContext(req));

    expect(mockPrisma.loginRateLimit.findUnique).toHaveBeenCalledWith({ where: { key: "1.2.3.4:user-42" } });
  });

  it("gives two different authenticated users behind the same IP two different buckets", async () => {
    const guard = new LoginRateLimitGuard(mockPrisma as never);

    await guard.canActivate(makeContext({ ip: "1.2.3.4", user: { id: "user-A" }, body: {} }));
    await guard.canActivate(makeContext({ ip: "1.2.3.4", user: { id: "user-B" }, body: {} }));

    const keys = mockPrisma.loginRateLimit.findUnique.mock.calls.map((c) => c[0].where.key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).toEqual(["1.2.3.4:user-A", "1.2.3.4:user-B"]);
  });

  it("falls back to the login-form email when there is no authenticated user yet (the login route)", async () => {
    const guard = new LoginRateLimitGuard(mockPrisma as never);
    const req = { ip: "1.2.3.4", body: { email: "Jane@Company.test" } };

    await guard.canActivate(makeContext(req));

    expect(mockPrisma.loginRateLimit.findUnique).toHaveBeenCalledWith({ where: { key: "1.2.3.4:jane@company.test" } });
  });
});
