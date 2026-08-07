import { AuthenticatedUser } from "@jokas/shared";
import { FeedProductionService } from "./feed-production.service";

const mockPrisma = {
  feedProductionOrder: { findMany: jest.fn().mockResolvedValue([]) }
};

function makeService() {
  return new FeedProductionService(mockPrisma as never, {} as never, { get: jest.fn().mockReturnValue(null), set: jest.fn() } as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("FeedProductionService", () => {
  it("is defined", () => {
    expect(makeService()).toBeDefined();
  });
});

describe("FeedProductionService.listOrders — orderWhere empty-array convention (H12)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not filter to an empty productionSiteId IN() for a user with zero site assignments", async () => {
    // This is the exact bug: a non-hasGlobalAccess user with no explicit
    // productionSiteIds assigned is supposed to be unrestricted (matching
    // the app-wide convention), not filtered to `{ in: [] }` (which matches
    // nothing and silently blanks the page).
    const service = makeService();
    await service.listOrders(makeUser({ productionSiteIds: [] }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toBeUndefined();
  });

  it("restricts to the user's own productionSiteIds when they do have assignments", async () => {
    const service = makeService();
    await service.listOrders(makeUser({ productionSiteIds: ["site-1"] }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toEqual({ in: ["site-1"] });
  });

  it("applies no restriction at all for a global-access user", async () => {
    const service = makeService();
    await service.listOrders(makeUser({ hasGlobalAccess: true }), {} as never);

    const where = mockPrisma.feedProductionOrder.findMany.mock.calls[0][0].where;
    expect(where.productionSiteId).toBeUndefined();
  });
});
