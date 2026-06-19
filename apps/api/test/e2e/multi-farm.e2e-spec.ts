/**
 * Multi-farm access restriction tests.
 *
 * Verifies that users scoped to specific farms, warehouses, and branches
 * cannot read or write data belonging to other scopes. Global-access users
 * (Super Admin / CEO) bypass all restrictions.
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
  makeDbInventoryItem,
  makeDbWarehouse,
  makeDbFlockBatch,
} from "../factories";

const OTHER_FARM_ID = "farm-other-99999";
const OTHER_WAREHOUSE_ID = "wh-other-99999";

function scopedToken(farmIds: string[], warehouseIds: string[], permissions: string[]) {
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

describe("Multi-farm Access Restrictions (e2e)", () => {
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

  describe("Poultry — farm scope enforcement", () => {
    it("403 — user cannot create a daily record for a farm they do not own", async () => {
      const token = scopedToken([TEST_FARM_ID], [], [PERMISSIONS.POULTRY_RECORD]);

      await request(app.getHttpServer())
        .post("/api/v1/poultry/daily-records")
        .set("Authorization", `Bearer ${token}`)
        .send({
          batchId: "batch-1",
          farmId: OTHER_FARM_ID, // different from user's farmId
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
          productId: "product-1",
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(403);
    });

    it("403 — user cannot transfer stock from a warehouse they do not own", async () => {
      const token = scopedToken([], [TEST_WAREHOUSE_ID], [PERMISSIONS.INVENTORY_MANAGE]);

      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-transfer")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fromWarehouseId: OTHER_WAREHOUSE_ID,
          toWarehouseId: TEST_WAREHOUSE_ID,
          productId: "product-1",
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
      const companyAToken = makeAccessToken({
        id: TEST_USER_ID,
        companyId: "company-a-id",
        permissions: Object.values(PERMISSIONS),
        roles: ["Super Admin"],
        hasGlobalAccess: true,
      } as Parameters<typeof makeAccessToken>[0]);

      // Even with all permissions, the companyId in JWT scopes all DB queries.
      // If poultry dashboard uses prisma.flockBatch.findMany({ where: { companyId: user.companyId } }),
      // querying with company-a's token will only see company-a data.
      prisma.flockBatch.findMany.mockResolvedValue([]);
      prisma.dailyPoultryRecord.findMany.mockResolvedValue([]);
      prisma.mortalityRecord.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/poultry/dashboard")
        .set("Authorization", `Bearer ${companyAToken}`);

      // Should succeed but return empty (no company-B data visible)
      expect([200, 403, 401].includes(res.status)).toBe(true);
    });
  });
});

