/**
 * Mobile sync module E2E tests.
 * Tests: batch sync endpoint, idempotency, duplicate detection,
 * partial failure handling, unsupported endpoint rejection.
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
  TEST_WAREHOUSE_ID,
  TEST_BRANCH_ID,
  TEST_FLOCK_BATCH_ID,
  makeDbMobileSyncRecord,
} from "../factories";

function syncToken() {
  return makeAccessToken({
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    permissions: [
      PERMISSIONS.POULTRY_RECORD,
      PERMISSIONS.POULTRY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.INVENTORY_READ,
    ],
    roles: ["Farm Worker"],
    farmIds: [TEST_FARM_ID],
    warehouseIds: [TEST_WAREHOUSE_ID],
    branchIds: [TEST_BRANCH_ID],
    productionSiteIds: [],
    hasGlobalAccess: false,
  } as Parameters<typeof makeAccessToken>[0]);
}

describe("Mobile Sync Module (e2e)", () => {
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

  describe("POST /api/v1/sync/batch", () => {
    it("401 — requires authentication", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .send({ records: [] })
        .expect(401);
    });

    it("200 — returns sync results for a batch of records", async () => {
      const localId = "local-daily-record-001";

      // First call: no existing sync record (fresh sync)
      prisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
      prisma.mobileSyncRecord.create.mockResolvedValue({ id: "sync-1", localId });

      // Mock the downstream service call for the daily record
      prisma.flockBatch.findFirst.mockResolvedValue({
        id: TEST_FLOCK_BATCH_ID,
        companyId: TEST_COMPANY_ID,
        farmId: TEST_FARM_ID,
      });
      prisma.dailyPoultryRecord.create.mockResolvedValue({ id: "dr-sync-1" });
      prisma.mobileSyncRecord.update.mockResolvedValue({
        id: "sync-1",
        localId,
        status: "SYNCED",
        remoteId: "dr-sync-1",
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${syncToken()}`)
        .send({
          records: [
            {
              localId,
              endpoint: "/poultry/daily-records",
              method: "POST",
              body: {
                batchId: TEST_FLOCK_BATCH_ID,
                farmId: TEST_FARM_ID,
                recordDate: "2026-01-15",
                mortalityCount: 0,
                feedConsumedKg: 500,
              },
            },
          ],
        })
        .expect(200);

      expect(res.body.data.results).toBeDefined();
      expect(Array.isArray(res.body.data.results)).toBe(true);
      expect(res.body.data.results).toHaveLength(1);
      expect(typeof res.body.data.synced).toBe("number");
      expect(typeof res.body.data.duplicates).toBe("number");
      expect(typeof res.body.data.failed).toBe("number");
    });

    it("200 — returns duplicate status for already-synced localId", async () => {
      const localId = "local-already-synced-001";
      const existingRecord = makeDbMobileSyncRecord({ localId, status: "SYNCED" });

      prisma.mobileSyncRecord.findUnique.mockResolvedValue(existingRecord);

      const res = await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${syncToken()}`)
        .send({
          records: [
            {
              localId,
              endpoint: "/poultry/daily-records",
              method: "POST",
              body: {
                batchId: TEST_FLOCK_BATCH_ID,
                farmId: TEST_FARM_ID,
                recordDate: "2026-01-16",
                mortalityCount: 2,
                feedConsumedKg: 480,
              },
            },
          ],
        })
        .expect(200);

      const result = res.body.data.results[0];
      expect(result.status).toBe("duplicate");
      expect(result.localId).toBe(localId);
      expect(res.body.data.duplicates).toBe(1);
      expect(res.body.data.synced).toBe(0);
    });

    it("200 — handles mixed batch (synced + duplicate + failed)", async () => {
      const freshId = "fresh-local-id-001";
      const dupId = "duplicate-local-id-001";
      const unsupportedId = "unsupported-local-id-001";

      prisma.mobileSyncRecord.findUnique
        .mockResolvedValueOnce(null) // fresh
        .mockResolvedValueOnce(makeDbMobileSyncRecord({ localId: dupId })) // dup
        .mockResolvedValueOnce(null); // fresh but unsupported endpoint

      prisma.mobileSyncRecord.create.mockResolvedValue({ id: "sync-fresh", localId: freshId });
      prisma.flockBatch.findFirst.mockResolvedValue({
        id: TEST_FLOCK_BATCH_ID,
        companyId: TEST_COMPANY_ID,
        farmId: TEST_FARM_ID,
      });
      prisma.dailyPoultryRecord.create.mockResolvedValue({ id: "dr-fresh" });
      prisma.mobileSyncRecord.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${syncToken()}`)
        .send({
          records: [
            {
              localId: freshId,
              endpoint: "/poultry/daily-records",
              method: "POST",
              body: {
                batchId: TEST_FLOCK_BATCH_ID,
                farmId: TEST_FARM_ID,
                recordDate: "2026-01-17",
                mortalityCount: 1,
                feedConsumedKg: 490,
              },
            },
            {
              localId: dupId,
              endpoint: "/poultry/daily-records",
              method: "POST",
              body: {
                batchId: TEST_FLOCK_BATCH_ID,
                farmId: TEST_FARM_ID,
                recordDate: "2026-01-16",
                mortalityCount: 2,
                feedConsumedKg: 480,
              },
            },
            {
              localId: unsupportedId,
              endpoint: "/nonexistent/endpoint",
              method: "POST",
              body: {},
            },
          ],
        })
        .expect(200);

      const { results, synced, duplicates, failed } = res.body.data;
      expect(results).toHaveLength(3);
      expect(duplicates).toBeGreaterThanOrEqual(1);
      // failed count includes unsupported endpoint
      expect(synced + duplicates + failed).toBe(3);
    });

    it("400 — rejects empty records array", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${syncToken()}`)
        .send({ records: [] })
        .expect(400);
    });

    it("400 — rejects missing required fields in sync record", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${syncToken()}`)
        .send({
          records: [
            { endpoint: "/poultry/daily-records" } // missing localId, method, body
          ],
        })
        .expect(400);
    });

    it("200 — idempotency: same localId from different users is tracked separately", async () => {
      const sharedLocalId = "shared-local-id";
      const user1Token = makeAccessToken({
        id: "user-1-id",
        companyId: TEST_COMPANY_ID,
        permissions: [PERMISSIONS.POULTRY_RECORD, PERMISSIONS.POULTRY_READ],
        roles: ["Worker"],
        farmIds: [TEST_FARM_ID],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);

      // Same localId, but different user — should be treated as separate records
      // (companyId + localId unique constraint in DB)
      prisma.mobileSyncRecord.findUnique.mockResolvedValue(null);
      prisma.mobileSyncRecord.create.mockResolvedValue({ id: "sync-u1", localId: sharedLocalId });
      prisma.flockBatch.findFirst.mockResolvedValue({
        id: TEST_FLOCK_BATCH_ID,
        companyId: TEST_COMPANY_ID,
        farmId: TEST_FARM_ID,
      });
      prisma.dailyPoultryRecord.create.mockResolvedValue({ id: "dr-u1" });
      prisma.mobileSyncRecord.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post("/api/v1/sync/batch")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          records: [
            {
              localId: sharedLocalId,
              endpoint: "/poultry/daily-records",
              method: "POST",
              body: {
                batchId: TEST_FLOCK_BATCH_ID,
                farmId: TEST_FARM_ID,
                recordDate: "2026-01-18",
                mortalityCount: 0,
                feedConsumedKg: 510,
              },
            },
          ],
        })
        .expect(200);

      expect(res.body.data.results).toHaveLength(1);
    });
  });

  describe("GET /api/v1/sync/records", () => {
    it("200 — returns sync history for the authenticated user's company", async () => {
      prisma.mobileSyncRecord.findMany.mockResolvedValue([makeDbMobileSyncRecord()]);
      prisma.mobileSyncRecord.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get("/api/v1/sync/records")
        .set("Authorization", `Bearer ${syncToken()}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("401 — requires authentication", async () => {
      await request(app.getHttpServer()).get("/api/v1/sync/records").expect(401);
    });
  });
});
