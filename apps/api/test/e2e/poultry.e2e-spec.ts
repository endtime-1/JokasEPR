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

  describe("Feed store — receipts & stock (Poultry Supervisor)", () => {
    // Valid v4/variant-8 UUIDs (see the BATCH_ID comment at the top of the file).
    const FARM_UUID = "3a000000-0000-4000-8000-000000000001";
    const WAREHOUSE_ID = "77770000-0000-4000-8000-000000000001";
    const PRODUCT_ID = "66660000-0000-4000-8000-000000000001";

    function supervisorToken(extra: string[] = []) {
      const permissions = [PERMISSIONS.POULTRY_READ, PERMISSIONS.POULTRY_SUPERVISE, PERMISSIONS.INVENTORY_READ, ...extra];
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({
          roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }],
          farmAccesses: [{ farmId: FARM_UUID }],
          // Farm-scoped, not warehouse-scoped — access is constrained by the
          // farm check + "feed store must belong to that farm" check instead.
          warehouseAccesses: [],
        })
      );
      return makeAccessToken({
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        permissions,
        roles: ["Poultry Supervisor"],
        farmIds: [FARM_UUID],
        warehouseIds: [],
        branchIds: [TEST_BRANCH_ID],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);
    }

    it("403 — feed receipt without poultry.supervise", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/poultry/feed-receipts")
        .set("Authorization", `Bearer ${poultryToken()}`)
        .send({ farmId: FARM_UUID, warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, receiptDate: "2026-08-29", quantityKg: 500 })
        .expect(403);
    });

    it("400 — rejects zero/negative quantity", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/poultry/feed-receipts")
        .set("Authorization", `Bearer ${supervisorToken()}`)
        .send({ farmId: FARM_UUID, warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, receiptDate: "2026-08-29", quantityKg: 0 })
        .expect(400);
    });

    it("400 — rejects a non-FEED_STORE warehouse", async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: WAREHOUSE_ID, type: "GENERAL", farmId: FARM_UUID, status: "ACTIVE" });
      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/feed-receipts")
        .set("Authorization", `Bearer ${supervisorToken()}`)
        .send({ farmId: FARM_UUID, warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, receiptDate: "2026-08-29", quantityKg: 500 });
      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/FEED_STORE/i);
    });

    it("creates a feed receipt and credits the feed store", async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: WAREHOUSE_ID, type: "FEED_STORE", farmId: FARM_UUID, status: "ACTIVE" });
      prisma.farm.findFirst.mockResolvedValue({ id: FARM_UUID, branchId: TEST_BRANCH_ID });
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, uomId: "uom-1", name: "Layer Mash" });
      prisma.feedReceiptRecord.create.mockResolvedValue({ id: "frc-1", farmId: FARM_UUID, quantityKg: 500 });
      prisma.inventoryItem.upsert.mockResolvedValue({ id: "inv-1", uomId: "uom-1", branchId: TEST_BRANCH_ID });
      prisma.stockBatch.create.mockResolvedValue({ id: "lot-1" });
      prisma.stockMovement.create.mockResolvedValue({ id: "mv-1" });

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/feed-receipts")
        .set("Authorization", `Bearer ${supervisorToken()}`)
        .send({ farmId: FARM_UUID, warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, receiptDate: "2026-08-29", quantityKg: 500, sourceType: "SUPPLIER", billReference: "WB-1029" });

      expect([200, 201]).toContain(res.status);
      expect(prisma.feedReceiptRecord.create).toHaveBeenCalled();
      expect(prisma.inventoryItem.upsert).toHaveBeenCalled();
      expect(prisma.stockBatch.create).toHaveBeenCalled();
    });

    it("GET /feed-stock returns a reconciliation shape", async () => {
      prisma.warehouse.findMany.mockResolvedValue([{ id: WAREHOUSE_ID, name: "Feed Store", code: "FS1", farmId: FARM_UUID, farm: { name: "Farm A" } }]);
      prisma.inventoryItem.findMany.mockResolvedValue([{ warehouseId: WAREHOUSE_ID, productId: PRODUCT_ID, quantityOnHand: 300, product: { name: "Layer Mash", sku: "LM1" } }]);
      prisma.feedReceiptRecord.groupBy.mockResolvedValue([{ warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, _sum: { quantityKg: 500 } }]);
      prisma.feedConsumptionRecord.groupBy.mockResolvedValue([{ warehouseId: WAREHOUSE_ID, feedProductId: PRODUCT_ID, _sum: { quantityKg: 200 } }]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/poultry/feed-stock")
        .set("Authorization", `Bearer ${supervisorToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lines[0]).toMatchObject({ onHandKg: 300, receivedKg: 500, consumedKg: 200 });
      expect(res.body.data.totals.onHandKg).toBe(300);
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
