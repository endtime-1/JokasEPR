import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { TEST_ACCESS_SECRET, TEST_REFRESH_SECRET } from "../../../../test/setup/env";
import { TEST_USER_ID, TEST_COMPANY_ID, makeDbUser, makeAuthUser } from "../../../../test/factories";

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("$2b$12$mocked-hash"),
}));

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwt = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  getOrThrow: (key: string) => {
    const vals: Record<string, string> = {
      JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
      JWT_REFRESH_SECRET: TEST_REFRESH_SECRET,
    };
    return vals[key];
  },
  get: (key: string, fallback?: string) => {
    const vals: Record<string, string> = {
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL_DAYS: "30",
    };
    return vals[key] ?? fallback;
  },
};

const mockAudit = { write: jest.fn().mockResolvedValue(undefined) };

const CTX = { ipAddress: "127.0.0.1", userAgent: "jest-test" };

function makeService() {
  return new AuthService(
    mockPrisma as never,
    mockJwt as never,
    mockConfig as ConfigService,
    mockAudit as never
  );
}

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    mockJwt.signAsync.mockResolvedValue("signed-token");
    mockPrisma.refreshToken.create.mockResolvedValue({ id: "rt-id-1" });
    mockPrisma.refreshToken.update.mockResolvedValue({});
  });

  describe("login()", () => {
    const dbUser = makeDbUser();

    it("succeeds with valid credentials", async () => {
      mockPrisma.user.findMany.mockResolvedValue([dbUser]);
      mockPrisma.user.update.mockResolvedValue(dbUser);
      mockPrisma.user.findFirst.mockResolvedValue({
        ...dbUser,
        roles: [{ role: { name: "Manager", permissions: [{ key: "poultry.read" }] } }],
        branchAccesses: [],
        farmAccesses: [],
        warehouseAccesses: [],
        productionSiteAccess: [],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(
        { email: "test@jokas.local", password: "Admin@12345!" },
        CTX
      );

      expect(result.data.accessToken).toBe("signed-token");
      expect(result.data.refreshToken).toBe("signed-token");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEST_USER_ID },
          data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
        })
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LOGIN" })
      );
    });

    it("throws UnauthorizedException when user not found", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.login({ email: "unknown@jokas.local", password: "Admin@12345!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "FAILED_LOGIN" })
      );
    });

    it("throws UnauthorizedException when user is INACTIVE", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ status: "INACTIVE" }),
      ]);

      await expect(
        service.login({ email: "test@jokas.local", password: "Admin@12345!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is soft-deleted", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ deletedAt: new Date("2025-01-01") }),
      ]);

      await expect(
        service.login({ email: "test@jokas.local", password: "Admin@12345!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when account is locked", async () => {
      const lockedUntil = new Date(Date.now() + 20 * 60 * 1000); // 20 min from now
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ lockedUntil, failedLoginAttempts: 5 }),
      ]);

      const error = await service
        .login({ email: "test@jokas.local", password: "Admin@12345!" }, CTX)
        .catch((e: Error) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toContain("temporarily locked");
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "FAILED_LOGIN" })
      );
    });

    it("increments failedLoginAttempts on wrong password", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ failedLoginAttempts: 2 }),
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: "test@jokas.local", password: "WrongPass!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: 3 }),
        })
      );
    });

    it("locks the account after 5 failed attempts", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ failedLoginAttempts: 4 }),
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: "test@jokas.local", password: "WrongPass!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.failedLoginAttempts).toBe(5);
      expect(updateCall.data.lockedUntil).toBeDefined();
      expect(updateCall.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it("throws when multiple companies found for the email (requires companyId)", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeDbUser({ id: "user-1" }),
        makeDbUser({ id: "user-2" }),
      ]);

      await expect(
        service.login({ email: "test@jokas.local", password: "Admin@12345!" }, CTX)
      ).rejects.toThrow(UnauthorizedException);
    });

    it("uses companyId filter when provided", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login(
          { email: "test@jokas.local", password: "Admin@12345!", companyId: TEST_COMPANY_ID },
          CTX
        )
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: "test@jokas.local", companyId: TEST_COMPANY_ID }),
        })
      );
    });
  });

  describe("refresh()", () => {
    const refreshPayload = {
      sub: TEST_USER_ID,
      org: TEST_COMPANY_ID,
      jti: "rt-id-1",
      typ: "refresh" as const,
    };

    it("rotates the refresh token on valid input", async () => {
      mockJwt.verifyAsync.mockResolvedValue(refreshPayload);
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: "rt-id-1",
        tokenHash: "$2b$12$stored-hash",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.user.findFirst.mockResolvedValue({
        ...makeDbUser(),
        roles: [{ role: { name: "Manager", permissions: [{ key: "poultry.read" }] } }],
        branchAccesses: [],
        farmAccesses: [],
        warehouseAccesses: [],
        productionSiteAccess: [],
      });

      const result = await service.refresh("valid-refresh-token", CTX);

      expect(result.data.accessToken).toBeDefined();
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rt-id-1" },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TOKEN_REFRESH" })
      );
    });

    it("throws when refresh token is not in the database", async () => {
      mockJwt.verifyAsync.mockResolvedValue(refreshPayload);
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh("unknown-token", CTX)).rejects.toThrow(UnauthorizedException);
    });

    it("throws when token hash does not match (replay protection)", async () => {
      mockJwt.verifyAsync.mockResolvedValue(refreshPayload);
      mockPrisma.refreshToken.findFirst.mockResolvedValue({ id: "rt-id-1", tokenHash: "$2b$12$stored" });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refresh("tampered-token", CTX)).rejects.toThrow(UnauthorizedException);
    });

    it("throws when JWT verification fails", async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error("jwt expired"));

      await expect(service.refresh("expired-token", CTX)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("logout()", () => {
    it("revokes the refresh token", async () => {
      const refreshPayload = {
        sub: TEST_USER_ID,
        org: TEST_COMPANY_ID,
        jti: "rt-id-1",
        typ: "refresh" as const,
      };
      mockJwt.verifyAsync.mockResolvedValue(refreshPayload);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout("valid-refresh-token");

      expect(result.data.success).toBe(true);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rt-id-1", userId: TEST_USER_ID, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        })
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "LOGOUT" })
      );
    });

    it("throws when token is invalid", async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error("invalid token"));

      await expect(service.logout("bad-token")).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("changePassword()", () => {
    const actor = makeAuthUser();

    it("changes the password and revokes all refresh tokens", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeDbUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.changePassword(
        actor,
        { currentPassword: "Admin@12345!", newPassword: "NewSecure@9876!" },
        CTX
      );

      expect(result.data.success).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith("NewSecure@9876!", 12);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        })
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: "UPDATE", summary: expect.stringContaining("password") })
      );
    });

    it("throws when current password is incorrect", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeDbUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(
          actor,
          { currentPassword: "WrongCurrent!", newPassword: "NewSecure@9876!" },
          CTX
        )
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("throws when user is not found", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(
          actor,
          { currentPassword: "Admin@12345!", newPassword: "NewSecure@9876!" },
          CTX
        )
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("buildProfile()", () => {
    it("constructs a profile with roles and access scopes", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...makeDbUser(),
        roles: [
          {
            role: {
              name: "Farm Manager",
              permissions: [{ key: "poultry.read" }, { key: "poultry.manage" }],
            },
          },
        ],
        branchAccesses: [{ branchId: "branch-A" }],
        farmAccesses: [{ farmId: "farm-A" }],
        warehouseAccesses: [{ warehouseId: "wh-A" }],
        productionSiteAccess: [],
      });

      const profile = await service.buildProfile(TEST_USER_ID);

      expect(profile.roles).toEqual(["Farm Manager"]);
      expect(profile.permissions).toContain("poultry.read");
      expect(profile.permissions).toContain("poultry.manage");
      expect(profile.farmIds).toEqual(["farm-A"]);
      expect(profile.warehouseIds).toEqual(["wh-A"]);
      expect(profile.hasGlobalAccess).toBe(false);
    });

    it("sets hasGlobalAccess=true for Super Admin", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...makeDbUser(),
        roles: [{ role: { name: "Super Admin", permissions: [] } }],
        branchAccesses: [],
        farmAccesses: [],
        warehouseAccesses: [],
        productionSiteAccess: [],
      });

      const profile = await service.buildProfile(TEST_USER_ID);

      expect(profile.hasGlobalAccess).toBe(true);
    });

    it("deduplicates permissions from multiple roles", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...makeDbUser(),
        roles: [
          { role: { name: "Role A", permissions: [{ key: "poultry.read" }, { key: "sales.read" }] } },
          { role: { name: "Role B", permissions: [{ key: "poultry.read" }, { key: "finance.read" }] } },
        ],
        branchAccesses: [],
        farmAccesses: [],
        warehouseAccesses: [],
        productionSiteAccess: [],
      });

      const profile = await service.buildProfile(TEST_USER_ID);

      const poultryReadCount = profile.permissions.filter((p) => p === "poultry.read").length;
      expect(poultryReadCount).toBe(1);
      expect(profile.permissions).toContain("sales.read");
      expect(profile.permissions).toContain("finance.read");
    });

    it("throws when user is not active", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.buildProfile("inactive-user-id")).rejects.toThrow(UnauthorizedException);
    });
  });
});
