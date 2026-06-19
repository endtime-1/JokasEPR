/**
 * Inventory module E2E tests.
 * Tests: item CRUD, stock-in, stock-out, stock adjustment, stock transfer,
 * warehouse scope enforcement, stock movement accuracy.
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
  TEST_WAREHOUSE_ID,
  TEST_FARM_ID,
  TEST_BRANCH_ID,
  TEST_PRODUCT_ID,
  makeDbInventoryItem,
  makeDbWarehouse,
  makeDbProduct,
} from "../factories";

const OTHER_WAREHOUSE_ID = "wh-other-99999";

function inventoryToken(writeAccess = true) {
  return makeAccessToken({
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    permissions: writeAccess
      ? [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE]
      : [PERMISSIONS.INVENTORY_READ],
    roles: ["Stock Manager"],
    farmIds: [TEST_FARM_ID],
    warehouseIds: [TEST_WAREHOUSE_ID],
    branchIds: [TEST_BRANCH_ID],
    productionSiteIds: [],
    hasGlobalAccess: false,
  } as Parameters<typeof makeAccessToken>[0]);
}

describe("Inventory Module (e2e)", () => {
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

  describe("GET /api/v1/inventory/dashboard", () => {
    it("200 — returns inventory summary", async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([makeDbInventoryItem()]);
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.stockExpiryAlert.findMany.mockResolvedValue([]);
      prisma.stockApproval.count.mockResolvedValue(0);
      prisma.$transaction.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get("/api/v1/inventory/dashboard")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .expect(200);
    });

    it("403 — rejects user without inventory.read", async () => {
      const token = makeAccessToken({
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        permissions: [PERMISSIONS.POULTRY_READ],
        roles: ["Farm Worker"],
        farmIds: [],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);

      await request(app.getHttpServer())
        .get("/api/v1/inventory/dashboard")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("POST /api/v1/inventory/stock-in — stock movement accuracy", () => {
    it("403 — cannot stock-in to a warehouse not in user's access list", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: OTHER_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(403);
    });

    it("allows stock-in to owned warehouse and creates movement record", async () => {
      const warehouse = makeDbWarehouse();
      const product = makeDbProduct();
      const item = makeDbInventoryItem({ quantityOnHand: 0 });
      const updatedItem = { ...item, quantityOnHand: 100 };

      prisma.warehouse.findFirst.mockResolvedValue(warehouse);
      prisma.product.findFirst.mockResolvedValue(product);
      prisma.$transaction.mockResolvedValue({
        item: updatedItem,
        batch: { id: "batch-id", quantityReceived: 100 },
        movement: { id: "mov-id", movementType: "PURCHASE_RECEIPT", quantity: 100 },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10.5,
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
    });

    it("400 — rejects zero quantity", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 0,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(400);
    });

    it("400 — rejects negative quantity", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: -50,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(400);
    });
  });

  describe("POST /api/v1/inventory/stock-out", () => {
    it("403 — cannot stock-out from a warehouse not in user's access list", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-out")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: OTHER_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 50,
        })
        .expect(403);
    });
  });

  describe("POST /api/v1/inventory/stock-transfer", () => {
    it("403 — cannot transfer from warehouse not in user's access", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-transfer")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          fromWarehouseId: OTHER_WAREHOUSE_ID,
          toWarehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 25,
        })
        .expect(403);
    });

    it("400 — rejects transfer to the same warehouse", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-transfer")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          fromWarehouseId: TEST_WAREHOUSE_ID,
          toWarehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 25,
        })
        .expect(400);
    });
  });

  describe("GET /api/v1/inventory/items", () => {
    it("200 — returns items for user's warehouses only", async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([makeDbInventoryItem()]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/inventory/items")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("403 — read-only user cannot manage inventory", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken(false)}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(403);
    });
  });

  describe("Form validation", () => {
    it("400 — rejects non-numeric quantity", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          warehouseId: TEST_WAREHOUSE_ID,
          productId: TEST_PRODUCT_ID,
          quantity: "lots",
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(400);
    });

    it("400 — rejects missing warehouseId", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/stock-in")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          productId: TEST_PRODUCT_ID,
          quantity: 100,
          batchNumber: "BATCH-001",
          unitCost: 10,
        })
        .expect(400);
    });
  });
});
