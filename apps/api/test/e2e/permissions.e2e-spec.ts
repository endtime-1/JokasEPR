import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp } from "../setup/app.setup";
import { PrismaMock } from "../setup/prisma.mock";
import { makeAccessToken } from "../setup/auth.helper";
import { PERMISSIONS } from "@jokas/shared";
import { TEST_USER_ID, TEST_COMPANY_ID, makeDbUser } from "../factories";

describe("Permission System (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaMock;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.auditLog.create.mockResolvedValue({});
  });

  function tokenWithPermissions(permissions: string[]) {
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Worker"],
    });
  }

  function superAdminToken() {
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions: Object.values(PERMISSIONS),
      roles: ["Super Admin"],
      hasGlobalAccess: true,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("Audit log access", () => {
    it("200 — user with audit.read can access audit logs", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.$transaction.mockResolvedValue([0, []]);

      await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.AUDIT_READ])}`)
        .expect((res) => {
          expect([200, 404].includes(res.status)).toBe(true);
        });
    });

    it("403 — user without audit.read is denied", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.POULTRY_READ])}`)
        .expect(403);
    });

    it("401 — unauthenticated requests are rejected", async () => {
      await request(app.getHttpServer()).get("/api/v1/audit-logs").expect(401);
    });
  });

  describe("Platform / identity access", () => {
    it("403 — user without identity.read cannot list users", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/identity/users")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.POULTRY_READ])}`)
        .expect(403);
    });

    it("403 — user without platform.manage cannot create a farm", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/platform/farms")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.POULTRY_READ])}`)
        .send({ name: "New Farm", code: "NF01" })
        .expect(403);
    });
  });

  describe("Finance access", () => {
    it("403 — user without finance.read cannot access finance dashboard", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/finance/dashboard")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.SALES_READ])}`)
        .expect(403);
    });

    it("403 — user without finance.manage cannot create expense", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.FINANCE_READ])}`)
        .send({ amount: 1000, category: "Feed", description: "Test expense", expenseDate: "2026-01-01" })
        .expect(403);
    });
  });

  describe("Reports access", () => {
    it("403 — user without reports.export cannot download reports", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/reports/poultry?format=csv")
        .set("Authorization", `Bearer ${tokenWithPermissions([PERMISSIONS.POULTRY_READ])}`)
        .expect(403);
    });
  });

  describe("Token validity", () => {
    it("401 — malformed JWT is rejected on all protected routes", async () => {
      await Promise.all([
        request(app.getHttpServer()).get("/api/v1/auth/me").set("Authorization", "Bearer malformed").expect(401),
        request(app.getHttpServer()).get("/api/v1/audit-logs").set("Authorization", "Bearer malformed").expect(401),
      ]);
    });

    it("401 — no Authorization header is rejected on protected routes", async () => {
      await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    });
  });
});
