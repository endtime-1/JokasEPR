import { AuthenticatedUser } from "@jokas/shared";
import { Logger } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

const mockPrisma = {
  notification: { findMany: jest.fn(), count: jest.fn() }
};

function makeService() {
  return new NotificationsService(mockPrisma as never, {} as never, {} as never, {} as never);
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

// (M12) findAll/unreadCount previously swallowed every DB error into a fake
// empty list / zero count — a real outage rendered identically to "you have
// no notifications", including on the bell badge, with no trace anywhere.
describe("NotificationsService — no longer masks DB failures as empty results (M12)", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("findAll", () => {
    it("returns the real list and total on success", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: "n-1" }]);
      mockPrisma.notification.count.mockResolvedValue(1);
      const service = makeService();

      const result = await service.findAll(makeUser(), {} as never);

      expect(result.data.data).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });

    it("throws instead of silently returning an empty list when the query fails", async () => {
      mockPrisma.notification.findMany.mockRejectedValue(new Error("db unavailable"));
      mockPrisma.notification.count.mockResolvedValue(0);
      const service = makeService();

      await expect(service.findAll(makeUser(), {} as never)).rejects.toThrow("Notifications failed to load");
    });

    it("logs the underlying error before throwing", async () => {
      mockPrisma.notification.findMany.mockRejectedValue(new Error("db unavailable"));
      const service = makeService();
      const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      await expect(service.findAll(makeUser(), {} as never)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("notifications list failed to load for user user-1"));
      errorSpy.mockRestore();
    });
  });

  describe("unreadCount", () => {
    it("returns the real count on success", async () => {
      mockPrisma.notification.count.mockResolvedValue(4);
      const service = makeService();

      const result = await service.unreadCount(makeUser());

      expect(result.data.count).toBe(4);
    });

    it("throws instead of silently showing the bell badge as 0 unread when the query fails", async () => {
      mockPrisma.notification.count.mockRejectedValue(new Error("db unavailable"));
      const service = makeService();

      await expect(service.unreadCount(makeUser())).rejects.toThrow("Unread notification count failed to load");
    });
  });
});
