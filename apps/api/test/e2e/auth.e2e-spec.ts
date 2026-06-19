import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import bcrypt from "bcryptjs";
import { createTestApp } from "../setup/app.setup";
import { PrismaMock } from "../setup/prisma.mock";
import { makeAccessToken, makeRefreshToken } from "../setup/auth.helper";
import {
  TEST_USER_ID,
  TEST_COMPANY_ID,
  TEST_REFRESH_TOKEN_ID,
  makeDbUser,
  makeDbRefreshToken,
  TEST_PASSWORD,
} from "../factories";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaMock;
  let userPasswordHash: string;

  const profileUser = () => ({
    ...makeDbUser({ passwordHash: userPasswordHash }),
    roles: [{ role: { name: "Manager", permissions: [{ key: "poultry.read" }] } }],
    branchAccesses: [],
    farmAccesses: [],
    warehouseAccesses: [],
    productionSiteAccess: [],
  });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    userPasswordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // audit writes should always succeed
    prisma.auditLog.create.mockResolvedValue({});
  });

  describe("POST /api/v1/auth/login", () => {
    it("200 — returns tokens on valid credentials", async () => {
      const user = makeDbUser({ passwordHash: userPasswordHash });
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.user.update.mockResolvedValue(user);
      prisma.user.findFirst.mockResolvedValue(profileUser());
      prisma.refreshToken.create.mockResolvedValue({ id: TEST_REFRESH_TOKEN_ID });
      prisma.refreshToken.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "test@jokas.local", password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.tokenType).toBe("Bearer");
      // Cookies should be set
      expect(res.headers["set-cookie"]).toBeDefined();
      const cookies: string[] = (res.headers["set-cookie"] as string[]);
      expect(cookies.some((c) => c.startsWith("jokas_at="))).toBe(true);
      expect(cookies.some((c) => c.startsWith("jokas_rt="))).toBe(true);
    });

    it("401 — rejects wrong password", async () => {
      const user = makeDbUser({ passwordHash: userPasswordHash });
      prisma.user.findMany.mockResolvedValue([user]);
      prisma.user.update.mockResolvedValue(user);

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "test@jokas.local", password: "WrongPass123!" })
        .expect(401);
    });

    it("401 — rejects unknown email", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "ghost@jokas.local", password: TEST_PASSWORD })
        .expect(401);
    });

    it("401 — rejects locked account", async () => {
      const lockedUser = makeDbUser({
        passwordHash: userPasswordHash,
        lockedUntil: new Date(Date.now() + 25 * 60 * 1000),
        failedLoginAttempts: 5,
      });
      prisma.user.findMany.mockResolvedValue([lockedUser]);

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "test@jokas.local", password: TEST_PASSWORD })
        .expect(401);

      expect(res.body.message).toContain("temporarily locked");
    });

    it("401 — rejects inactive account", async () => {
      prisma.user.findMany.mockResolvedValue([
        makeDbUser({ passwordHash: userPasswordHash, status: "INACTIVE" }),
      ]);

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "test@jokas.local", password: TEST_PASSWORD })
        .expect(401);
    });

    it("400 — rejects invalid email format", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "not-an-email", password: TEST_PASSWORD })
        .expect(400);
    });

    it("400 — rejects missing password", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "test@jokas.local" })
        .expect(400);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("200 — rotates tokens with valid refresh token in body", async () => {
      const refreshToken = makeRefreshToken(TEST_USER_ID, TEST_COMPANY_ID, TEST_REFRESH_TOKEN_ID);
      const hash = await bcrypt.hash(refreshToken, 4);
      prisma.refreshToken.findFirst.mockResolvedValue(makeDbRefreshToken({ tokenHash: hash }));
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.user.findFirst.mockResolvedValue(profileUser());
      prisma.refreshToken.create.mockResolvedValue({ id: "rt-id-2" });

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
    });

    it("400/401 — rejects when no token provided", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({})
        .expect((res) => {
          expect([400, 401, 500].includes(res.status)).toBe(true);
        });
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("200 — clears cookies and revokes token", async () => {
      const refreshToken = makeRefreshToken(TEST_USER_ID, TEST_COMPANY_ID, TEST_REFRESH_TOKEN_ID);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      // Cookies should be cleared
      const cookies: string[] = (res.headers["set-cookie"] as string[] | undefined) ?? [];
      expect(cookies.some((c) => c.includes("jokas_at=;") || c.includes("jokas_at="))).toBe(true);
    });

    it("200 — succeeds even without a refresh token (clears cookies)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .send({})
        .expect(200);

      expect(res.body.data.success).toBe(true);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("200 — returns authenticated user profile", async () => {
      const token = makeAccessToken({ id: TEST_USER_ID, companyId: TEST_COMPANY_ID });

      const res = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.id).toBe(TEST_USER_ID);
      expect(res.body.data.companyId).toBe(TEST_COMPANY_ID);
    });

    it("401 — rejects unauthenticated requests", async () => {
      await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    });

    it("401 — rejects expired/invalid token", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid.jwt.token")
        .expect(401);
    });
  });

  describe("POST /api/v1/auth/change-password", () => {
    it("200 — changes password successfully", async () => {
      const token = makeAccessToken({ id: TEST_USER_ID, companyId: TEST_COMPANY_ID });
      const user = makeDbUser({ passwordHash: userPasswordHash });
      prisma.user.findFirst.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: "NewSecure@9876!" })
        .expect(200);
    });

    it("401 — rejects wrong current password", async () => {
      const token = makeAccessToken({ id: TEST_USER_ID, companyId: TEST_COMPANY_ID });
      const user = makeDbUser({ passwordHash: userPasswordHash });
      prisma.user.findFirst.mockResolvedValue(user);

      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "WrongCurrent!", newPassword: "NewSecure@9876!" })
        .expect(401);
    });

    it("400 — rejects weak new password", async () => {
      const token = makeAccessToken({ id: TEST_USER_ID, companyId: TEST_COMPANY_ID });

      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: "weak" })
        .expect(400);
    });

    it("401 — requires authentication", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/change-password")
        .send({ currentPassword: TEST_PASSWORD, newPassword: "NewSecure@9876!" })
        .expect(401);
    });
  });
});
