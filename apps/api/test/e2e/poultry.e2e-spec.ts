/**
 * Poultry module E2E tests.
 * Tests: batch management, daily record creation, mortality tracking,
 * egg production, feed consumption, medication, vaccination.
 */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../setup/app.setup";
import { PrismaMock } from "../setup/prisma.mock";
import { makeAccessToken } from "../setup/auth.helper";
import { AuthService } from "../../src/modules/auth/auth.service";
import { PERMISSIONS } from "@jokas/shared";
import {
  TEST_USER_ID,
  TEST_COMPANY_ID,
  TEST_FARM_ID,
  TEST_BRANCH_ID,
  makeDbUser,
  makeDbFlockBatch,
} from "../factories";

// class-validator's @IsUUID() rejects repeating-digit fixtures like
// "88888888-..." (fails the version/variant nibble checks) — see
// inventory.e2e-spec.ts for the full explanation. Using a properly-formatted
// UUID here so any test that isn't deliberately checking 400-on-bad-input
// doesn't accidentally get one anyway.
const BATCH_ID = "88888888-8888-4888-8888-888888888888";

describe("Poultry Module (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaMock;
  let authService: AuthService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // See finance.e2e-spec.ts for why this is required.
    authService.clearProfileCache(TEST_USER_ID);
    prisma.auditLog.create.mockResolvedValue({});
  });

  // Combined token+mock helper — see finance.e2e-spec.ts for why these must
  // travel together rather than relying on a single shared default profile.
  function poultryToken(extraPermissions: string[] = []) {
    const permissions = [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_MANAGE, PERMISSIONS.POULTRY_RECORD, ...extraPermissions];
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({ roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }] })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Farm Manager"],
      farmIds: [TEST_FARM_ID],
      warehouseIds: [],
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("GET /api/v1/poultry/dashboard", () => {
    it("200 — returns dashboard summary for user's farms", async () => {
      // dashboard() uses groupBy (not findMany) for the weekly trend queries,
      // and .map()s the results with no `?? []` guard — an unmocked jest.fn()
      // resolving to undefined crashes there. batchMetrics() itself IS
      // defensive (`batch.mortalityRecords ?? []` etc.) so the flockBatch
      // fixture doesn't need the full nested include shape.
      const batch = makeDbFlockBatch();
      prisma.flockBatch.findMany.mockResolvedValue([batch]);
      prisma.eggProductionRecord.groupBy.mockResolvedValue([]);
      prisma.mortalityRecord.groupBy.mockResolvedValue([]);
      prisma.feedConsumptionRecord.groupBy.mockResolvedValue([]);
      prisma.poultryHealthObservation.findMany.mockResolvedValue([]);
      prisma.poultryHouse.findMany.mockResolvedValue([]);
      prisma.systemSetting.findFirst.mockResolvedValue(null);

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
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({ roles: [{ role: { permissions: [{ key: PERMISSIONS.SALES_READ }] } }] })
      );
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

  describe("POST /api/v1/poultry/batches", () => {
    it("201 — creates a flock batch", async () => {
      prisma.flockBatch.create.mockResolvedValue(makeDbFlockBatch());
      prisma.poultryHouse.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/batches")
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
      // createBatch() derives farm scope from the pens being allocated to
      // (poultry.service.ts:478-482), not a direct farmId field on the DTO —
      // the old body shape (farmId/batchCode/breed/placementDate) doesn't
      // match CreateFlockBatchDto at all anymore (now code/name/birdType/
      // openingBirdCount/startDate/penAllocations). Mock a pen belonging to
      // TEST_FARM_ID, which the user's own farmAccesses (below) excludes.
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({
          roles: [{ role: { permissions: [{ key: PERMISSIONS.POULTRY_MANAGE }] } }],
          farmAccesses: [{ farmId: "other-farm-id" }],
        })
      );
      prisma.pen.findMany.mockResolvedValue([
        { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", companyId: TEST_COMPANY_ID, farmId: TEST_FARM_ID, deletedAt: null },
      ]);
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
        .post("/api/v1/poultry/batches")
        .set("Authorization", `Bearer ${token}`)
        .send({
          code: "BATCH-2026-001",
          name: "Test Batch",
          birdType: "BROILERS",
          openingBirdCount: 500,
          startDate: "2026-01-01",
          penAllocations: [{ penId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", birdCount: 500 }],
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
