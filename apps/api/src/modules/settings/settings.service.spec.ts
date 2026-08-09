import { AuthenticatedUser } from "@jokas/shared";
import { SettingsService } from "./settings.service";

const mockPrisma = {
  systemSetting: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }
};
const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new SettingsService(mockPrisma as never, mockAudit as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: ["settings.manage"], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

// (M18) setSetting was a plain find-then-branch (findFirst → create-or-update)
// with no protection against a concurrent save creating the row between the
// check and the create() call.
describe("SettingsService.setSetting — concurrent-create fallback (M18)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates the existing row directly when one is already present", async () => {
    mockPrisma.systemSetting.findFirst.mockResolvedValue({ id: "set-1" });
    mockPrisma.systemSetting.update.mockResolvedValue({ id: "set-1" });
    const service = makeService();

    await service.updateTax(makeUser(), { enabled: true, taxName: "VAT", ratePercent: 15 } as never, {});

    expect(mockPrisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: "set-1" },
      data: { value: { enabled: true, taxName: "VAT", ratePercent: 15 }, updatedById: "user-1" }
    });
    expect(mockPrisma.systemSetting.create).not.toHaveBeenCalled();
  });

  it("creates a new row when none exists yet", async () => {
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null);
    mockPrisma.systemSetting.create.mockResolvedValue({ id: "set-1" });
    const service = makeService();

    await service.updateTax(makeUser(), { enabled: true, taxName: "VAT", ratePercent: 15 } as never, {});

    expect(mockPrisma.systemSetting.create).toHaveBeenCalled();
  });

  it("falls back to update instead of failing the save when a concurrent request created the row first (P2002)", async () => {
    // The exact race this fixes: two saves both see "no existing row" from
    // findFirst, both attempt create() — the loser must recover instead of
    // erroring out or (worse, previously) throwing an unhandled 500.
    mockPrisma.systemSetting.findFirst
      .mockResolvedValueOnce(null) // initial check: not found
      .mockResolvedValueOnce({ id: "set-1" }); // re-check after the P2002: now it exists
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mockPrisma.systemSetting.create.mockRejectedValue(p2002);
    mockPrisma.systemSetting.update.mockResolvedValue({ id: "set-1" });
    const service = makeService();

    await expect(service.updateTax(makeUser(), { enabled: true, taxName: "VAT", ratePercent: 15 } as never, {})).resolves.toBeDefined();

    expect(mockPrisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: "set-1" },
      data: { value: { enabled: true, taxName: "VAT", ratePercent: 15 }, updatedById: "user-1" }
    });
  });

  it("rethrows a create failure that isn't a unique-constraint conflict", async () => {
    mockPrisma.systemSetting.findFirst.mockResolvedValue(null);
    mockPrisma.systemSetting.create.mockRejectedValue(new Error("connection pool exhausted"));
    const service = makeService();

    await expect(
      service.updateTax(makeUser(), { enabled: true, taxName: "VAT", ratePercent: 15 } as never, {})
    ).rejects.toThrow("connection pool exhausted");
  });
});
