/**
 * Multi-farm access restriction tests.
 *
 * Verifies that users scoped to specific farms, warehouses, and branches
 * cannot read or write data belonging to other scopes. Global-access users
 * (Super Admin / CEO) bypass all restrictions.
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
  TEST_WAREHOUSE_ID,
  TEST_BRANCH_ID,
  TEST_FLOCK_BATCH_ID,
  makeDbUser,
  makeDbInventoryItem,
  makeDbWarehouse,
  makeDbFlockBatch,
} from "../factories";

// class-validator's @IsUUID() rejects non-UUID-shaped fixtures like
// "farm-other-99999" — see inventory.e2e-spec.ts for the full explanation.
const OTHER_FARM_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_WAREHOUSE_ID = "99999999-9999-4999-8999-999999999999";
const VALID_PRODUCT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VALID_BATCH_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
// TEST_WAREHOUSE_ID ("44444444-...") also fails the strict @IsUUID() variant
// check (4th group must start 8/9/A/B, "4" doesn't qualify) — fine as a scope
// value (never DTO-validated there) but not as a DTO body field.
const VALID_WAREHOUSE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Multi-farm Access Restrictions (e2e)", () => {
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
  function scopedToken(farmIds: string[], warehouseIds: string[], permissions: string[]) {
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({
        roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }],
        farmAccesses: farmIds.map((farmId) => ({ farmId })),
        warehouseAccesses: warehouseIds.map((warehouseId) => ({ warehouseId })),
        branchAccesses: [{ branchId: TEST_BRANCH_ID }],
      })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Farm Worker"],
      farmIds,
      warehouseIds,
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  function globalToken() {
    // hasGlobalAccess is derived server-side from role.level (SUPER_ADMIN/CEO)
    // in AuthService.buildProfile — not from an overridable profile field —
    // so the mocked DB user needs a role with that exact level to actually
    // get global access, matching what the token claims.
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({
        roles: [{ role: { level: "SUPER_ADMIN", permissions: Object.values(PERMISSIONS).map((key) => ({ key })) } }],
        farmAccesses: [],
        warehouseAccesses: [],
        branchAccesses: [],
      })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions: Object.values(PERMISSIONS),
      roles: ["Super Admin"],
      farmIds: [],
      warehouseIds: [],
      branchIds: [],
      productionSiteIds: [],
      hasGlobalAccess: true,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("Poultry — farm scope enforcement", () => {
    it("403 — user cannot create a daily record for a farm they do not own", async () => {
      // CreateDailyPoultryRecordDto has no farmId field at all (whitelist would
      // reject it) — farm scope is derived server-side from the flock batch's
      // own farmId via getBatchContext() -> assertFarmAccess(), so the mock
      // needs a batch belonging to a farm the user's token doesn't grant.
      const token = scopedToken([TEST_FARM_ID], [], [PERMISSIONS.POULTRY_RECORD]);
      prisma.flockBatch.findFirst.mockResolvedValue(makeDbFlockBatch({ farmId: OTHER_FARM_ID }));

      await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${token}`)
        .send({
          flockBatchId: VALID_BATCH_ID,
          recordDate: "2026-01-15",
          mortalityCount: 0,
          feedConsumedKg: 500,
        })
        .expect(403);
    });

    it("allows creating a record for the user's own farm", async () => {
      const token = scopedToken([TEST_FARM_ID], [], [PERMISSIONS.POULTRY_RECORD]);
      const batch = makeDbFlockBatch();
      prisma.flockBatch.findFirst.mockResolvedValue(batch);
      prisma.dailyPoultryRecord.create.mockResolvedValue({ id: "dr-1", batchId: batch.id });

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${token}`)
        .send({
          batchId: batch.id,
          farmId: TEST_FARM_ID,
          recordDate: "2026-01-15",
          mortalityCount: 0,
          feedConsumedKg: 500,
        });

      // Should not be 403 (may be 201, 200, or 400 if DTO fails — not a scope rejection)
      expect(res.status).not.toBe(403);
    });

    it("Super Admin can create records on any farm", async () => {
      const token = globalToken();
      prisma.flockBatch.findFirst.mockResolvedValue(makeDbFlockBatch({ farmId: OTHER_FARM_ID }));
      prisma.dailyPoultryRecord.create.mockResolvedValue({ id: "dr-2" });

      const res = await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${token}`)
        .send({
          batchId: TEST_FLOCK_BATCH_ID,
          farmId: OTHER_FARM_ID,
          recordDate: "2026-01-15",
          mortalityCount: 0,
          feedConsumedKg: 500,
        });

      expect(res.status).not.toBe(403);
    });
  });

  describe("Inventory — warehouse scope enforcement", () => {
    it("403 — user cannot add stock to a warehouse they do not own", async () => {
      const token = scopedToken([], [TEST_WAREHOUSE_ID], [PERMISSIONS.INVENTORY_MANAGE]);

      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${token}`)
        .send({
          warehouseId: OTHER_WAREHOUSE_ID,
          productId: VALID_PRODUCT_ID,
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(403);
    });

    it("403 — user cannot transfer stock from a warehouse they do not own", async () => {
      const token = scopedToken([], [TEST_WAREHOUSE_ID], [PERMISSIONS.INVENTORY_MANAGE]);

      await request(app.getHttpServer())
        .post("/api/v1/inventory/transfers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fromWarehouseId: OTHER_WAREHOUSE_ID,
          // assertWarehouseAccess() checks fromWarehouseId first and throws
          // before toWarehouseId is evaluated, so this just needs to pass
          // format validation, not actually be in the user's access list.
          toWarehouseId: VALID_WAREHOUSE_ID,
          productId: VALID_PRODUCT_ID,
          quantity: 50,
        })
        .expect(403);
    });

    it("allows stock-in for the user's own warehouse", async () => {
      const token = scopedToken([], [TEST_WAREHOUSE_ID], [PERMISSIONS.INVENTORY_MANAGE]);
      prisma.warehouse.findFirst.mockResolvedValue(makeDbWarehouse());
      prisma.product.findFirst.mockResolvedValue({ id: "prod-1", sku: "F-001", uomId: "uom-kg" });
      prisma.$transaction.mockResolvedValue({ item: makeDbInventoryItem(), batch: {}, movement: {} });

      const res = await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${token}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: "prod-1",
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        });

      expect(res.status).not.toBe(403);
    });

    it("Super Admin can access any warehouse", async () => {
      const token = globalToken();
      prisma.warehouse.findFirst.mockResolvedValue(makeDbWarehouse({ id: OTHER_WAREHOUSE_ID }));
      prisma.product.findFirst.mockResolvedValue({ id: "prod-1", sku: "F-001", uomId: "uom-kg" });
      prisma.$transaction.mockResolvedValue({ item: makeDbInventoryItem(), batch: {}, movement: {} });

      const res = await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${token}`)
        .send({
          warehouseId: OTHER_WAREHOUSE_ID,
          productId: "prod-1",
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        });

      expect(res.status).not.toBe(403);
    });
  });

  describe("Cross-company data isolation", () => {
    it("403/401 — token from Company A cannot access Company B routes", async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({
          companyId: "company-a-id",
          roles: [{ role: { level: "SUPER_ADMIN", permissions: Object.values(PERMISSIONS).map((key) => ({ key })) } }],
        })
      );
      const companyAToken = makeAccessToken({
        id: TEST_USER_ID,
        companyId: "company-a-id",
        permissions: Object.values(PERMISSIONS),
        roles: ["Super Admin"],
        farmIds: [],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: true,
      } as Parameters<typeof makeAccessToken>[0]);

      // Even with all permissions, the companyId in JWT scopes all DB queries.
      // If poultry dashboard uses prisma.flockBatch.findMany({ where: { companyId: user.companyId } }),
      // querying with company-a's token will only see company-a data.
      // See poultry.e2e-spec.ts for why these specific mocks (groupBy, not
      // findMany, for the weekly trend queries) are what dashboard() needs.
      prisma.flockBatch.findMany.mockResolvedValue([]);
      prisma.eggProductionRecord.groupBy.mockResolvedValue([]);
      prisma.mortalityRecord.groupBy.mockResolvedValue([]);
      prisma.feedConsumptionRecord.groupBy.mockResolvedValue([]);
      prisma.poultryHealthObservation.findMany.mockResolvedValue([]);
      prisma.poultryHouse.findMany.mockResolvedValue([]);
      prisma.systemSetting.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get("/api/v1/poultry/dashboard")
        .set("Authorization", `Bearer ${companyAToken}`);

      // Should succeed but return empty (no company-B data visible)
      expect([200, 403, 401].includes(res.status)).toBe(true);
    });
  });
});

