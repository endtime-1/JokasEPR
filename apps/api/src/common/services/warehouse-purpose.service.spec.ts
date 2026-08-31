import { BadRequestException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { WarehousePurposeService } from "./warehouse-purpose.service";

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "u-1", companyId: "co-1", email: "x@y.z", roles: [], permissions: [],
    branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false, ...overrides,
  } as AuthenticatedUser;
}

const feedStore = { id: "w-feed", type: "FEED_STORE", name: "Feed Store", code: "FS", branchId: "b-1" };
const eggStore = { id: "w-egg", type: "EGG_STORE", name: "Egg Store", code: "ES", branchId: "b-1" };
const general = { id: "w-gen", type: "GENERAL", name: "Main", code: "MN", branchId: "b-1" };

describe("WarehousePurposeService", () => {
  let prisma: { systemSetting: { findFirst: jest.Mock } };
  let audit: { write: jest.Mock };
  let svc: WarehousePurposeService;

  const setEnforced = (on: boolean) =>
    prisma.systemSetting.findFirst.mockResolvedValue(on ? { value: { enforceWarehousePurpose: true } } : { value: {} });

  beforeEach(() => {
    prisma = { systemSetting: { findFirst: jest.fn() } };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    svc = new WarehousePurposeService(prisma as never, audit as never);
  });

  it("is a no-op when enforcement is off — any warehouse passes", async () => {
    setEnforced(false);
    await expect(svc.assert(makeUser(), eggStore, "feed-production.raw-materials")).resolves.toBeUndefined();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("allows a matching type when enforcement is on", async () => {
    setEnforced(true);
    await expect(svc.assert(makeUser(), feedStore, "feed-production.raw-materials")).resolves.toBeUndefined();
  });

  it("always allows GENERAL", async () => {
    setEnforced(true);
    await expect(svc.assert(makeUser(), general, "egg.collection")).resolves.toBeUndefined();
  });

  it("rejects a mismatched type when enforcement is on and no override given", async () => {
    setEnforced(true);
    await expect(svc.assert(makeUser(), eggStore, "feed-production.raw-materials")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets a manager through with an override reason and audits it", async () => {
    setEnforced(true);
    await expect(
      svc.assert(makeUser({ permissions: ["inventory.manage"] }), eggStore, "feed-production.raw-materials", { overrideReason: "one-off" }),
    ).resolves.toBeUndefined();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Warehouse", summary: expect.stringContaining("override") }));
  });

  it("does not let a non-manager override", async () => {
    setEnforced(true);
    await expect(
      svc.assert(makeUser(), eggStore, "feed-production.raw-materials", { overrideReason: "please" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("filterForOperation narrows the list only when enforced", async () => {
    const list = [feedStore, eggStore, general];
    setEnforced(false);
    expect(await svc.filterForOperation("co-1", list, "feed-production.raw-materials")).toEqual(list);
    svc.invalidate("co-1");
    setEnforced(true);
    expect(await svc.filterForOperation("co-1", list, "feed-production.raw-materials")).toEqual([feedStore, general]);
  });
});
