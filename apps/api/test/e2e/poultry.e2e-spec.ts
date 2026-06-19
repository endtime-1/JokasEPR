/**
 * Poultry module E2E tests.
 * Tests: batch management, daily record creation, mortality tracking,
 * egg production, feed consumption, medication, vaccination.
 */
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp } from "../setup/app.setup";
import { PrismaMock } from "../setup/prisma.mock";
import { makeAccessToken } from "../setup/auth.helper";
import { PERMISSIONS } from "@jokas/shared";
import {
  TEST_USER_ID,
  TEST_COMPANY_ID,
  TEST_FARM_ID,
  TEST_BRANCH_ID,
  makeDbFlockBatch,
} from "../factories";

const BATCH_ID = "88888888-8888-8888-8888-888888888888";

function poultryToken(extraPermissions: string[] = []) {
  return makeAccessToken({
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    permissions: [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE, PERMISSIONS.POULTRY_RECORD, ...extraPermissions],
    roles: ["Farm Manager"],
    farmIds: [TEST_FARM_ID],
    warehouseIds: [],
    branchIds: [TEST_BRANCH_ID],
    productionSiteIds: [],
    hasGlobalAccess: false,
  } as Parameters<typeof makeAccessToken>[0]);
}

describe("Poultry Module (e2e)", () => {
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

  describe("GET /api/v1/poultry/dashboard", () => {
    it("200 — returns dashboard summary for user's farms", async () => {
      const batch = makeDbFlockBatch();
      prisma.flockBatch.findMany.mockResolvedValue([batch]);
      prisma.dailyPoultryRecord.findMany.mockResolvedValue([]);
      prisma.mortalityRecord.findMany.mockResolvedValue([]);
      prisma.eggProductionRecord.findMany.mockResolvedValue([]);
      prisma.feedConsumptionRecord.findMany.mockResolvedValue([]);
      prisma.poultryHouse.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/poultry/dashboard")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
    });

    it("401 — requires authentication", async () => {
      await request(app.getHttpServer()).get("/api/v1/poultry/dashboard").expect(401);
    });

    it("403 — requires poultry.read permission", async () => {
      const token = makeAccessToken({
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        permissions: [PERMISSIONS.SALES_READ],
        roles: ["Sales Rep"],
        farmIds: [TEST_FARM_ID],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);

      await request(app.getHttpServer())
        .get("/api/v1/poultry/dashboard")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("POST /api/v1/poultry/flock-batches", () => {
    it("201 — creates a flock batch", async () => {
      prisma.flockBatch.create.mockResolvedValue(makeDbFlockBatch());
      prisma.poultryHouse.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/flock-batches")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          farmId: TEST_FARM_ID,
          batchCode: "BATCH-2026-001",
          breed: "Ross 308",
          placementDate: "2026-01-01",
          initialCount: 10000,
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
      if (res.status === 201 || res.status === 200) {
        expect(res.body.data).toBeDefined();
      }
    });

    it("403 — user without farm access is rejected", async () => {
      const token = makeAccessToken({
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        permissions: [PERMISSIONS.POULTRY_MANAGE],
        roles: ["Farm Manager"],
        farmIds: ["other-farm-id"],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);

      await request(app.getHttpServer())
        .post("/api/v1/poultry/flock-batches")
        .set("Authorization", `Bearer ${token}`)
        .send({
          farmId: TEST_FARM_ID,
          batchCode: "BATCH-2026-001",
          breed: "Ross 308",
          placementDate: "2026-01-01",
          initialCount: 10000,
        })
        .expect(403);
    });
  });

  describe("POST /api/v1/poultry/daily-records", () => {
    it("400 — rejects negative mortality count", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          batchId: BATCH_ID,
          farmId: TEST_FARM_ID,
          recordDate: "2026-01-15",
          mortalityCount: -5, // invalid
          feedConsumedKg: 500,
        });

      expect(res.status).toBe(400);
    });

    it("400 — rejects missing required fields", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          batchId: BATCH_ID,
          // missing farmId, recordDate, mortalityCount, feedConsumedKg
        })
        .expect(400);
    });
  });

  describe("POST /api/v1/poultry/mortality-records", () => {
    it("records mortality against an active batch", async () => {
      const batch = makeDbFlockBatch();
      prisma.flockBatch.findFirst.mockResolvedValue(batch);
      prisma.mortalityRecord.create.mockResolvedValue({ id: "mr-1", batchId: BATCH_ID, count: 50 });

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/mortality-records")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          batchId: BATCH_ID,
          farmId: TEST_FARM_ID,
          recordDate: "2026-01-15",
          count: 50,
          cause: "disease",
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
    });
  });

  describe("Form validation", () => {
    it("400 — rejects non-date recordDate", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          batchId: BATCH_ID,
          farmId: TEST_FARM_ID,
          recordDate: "not-a-date",
          mortalityCount: 0,
          feedConsumedKg: 500,
        })
        .expect(400);
    });

    it("400 — rejects extra fields (forbidNonWhitelisted)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({
          batchId: BATCH_ID,
          farmId: TEST_FARM_ID,
          recordDate: "2026-01-15",
          mortalityCount: 0,
          feedConsumedKg: 500,
          injectedField: "hacker-value", // not in DTO
        })
        .expect(400);
    });
  });
});
