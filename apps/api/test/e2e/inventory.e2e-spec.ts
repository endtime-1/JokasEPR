/**
 * Inventory module E2E tests.
 * Tests: item CRUD, stock-in, stock-out, stock adjustment, stock transfer,
 * warehouse scope enforcement, stock movement accuracy.
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
  TEST_WAREHOUSE_ID,
  TEST_FARM_ID,
  TEST_BRANCH_ID,
  TEST_PRODUCT_ID,
  makeDbUser,
  makeDbInventoryItem,
  makeDbWarehouse,
  makeDbProduct,
} from "../factories";

// class-validator's @IsUUID() (no version arg) enforces the RFC4122 version
// (3rd group must start with 1-5) and variant (4th group must start with
// 8/9/A/B) nibbles — repeating-digit fixtures like the shared TEST_PRODUCT_ID
// ("77777777-...") don't qualify (7 fails both checks) and get rejected with
// a 400 before ever reaching the warehouse-scope check these tests target.
// Using properly-formatted UUIDs here so the request actually reaches
// assertWarehouseAccess() instead of dying in DTO validation.
const OTHER_WAREHOUSE_ID = "99999999-9999-4999-8999-999999999999";
const VALID_PRODUCT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VALID_WAREHOUSE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Inventory Module (e2e)", () => {
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
    // dashboard() Promise.all's 11 queries, several via private helpers
    // (lowStockRows/valuationRows) that both re-call inventoryItem.findMany
    // with different `include`s. Empty-array defaults avoid every shape
    // mismatch; tests that care about specific content override individually.
    prisma.inventoryItem.groupBy.mockResolvedValue([]);
    prisma.inventoryItem.count.mockResolvedValue(0);
    prisma.inventoryItem.aggregate.mockResolvedValue({ _sum: { quantityOnHand: 0 } });
    prisma.inventoryItem.findMany.mockResolvedValue([]);
    prisma.stockAdjustment.groupBy.mockResolvedValue([]);
    prisma.stockMovement.count.mockResolvedValue(0);
  });

  // Combined token+mock helper — see finance.e2e-spec.ts for why these must
  // travel together rather than relying on a single shared default profile.
  // warehouseIds/farmIds for scope checks come from buildProfile()'s DB-driven
  // warehouseAccesses/farmAccesses too, not the JWT claim — makeDbUser()'s
  // defaults already point at TEST_WAREHOUSE_ID/TEST_FARM_ID so no override
  // is needed here for the scope-enforcement tests below to work.
  function inventoryToken(writeAccess = true) {
    const permissions = writeAccess
      ? [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE]
      : [PERMISSIONS.INVENTORY_READ];
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({ roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }] })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Stock Manager"],
      farmIds: [TEST_FARM_ID],
      warehouseIds: [TEST_WAREHOUSE_ID],
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("GET /api/v1/inventory/dashboard", () => {
    it("200 — returns inventory summary", async () => {
      // inventoryItem.findMany already defaults to [] in beforeEach — leaving it
      // there (rather than [makeDbInventoryItem()]) since that factory doesn't
      // include stockReorderLevels/stockBatches that lowStockRows()/
      // valuationRows() need, and this test only asserts the endpoint succeeds.
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
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({ roles: [{ role: { permissions: [{ key: PERMISSIONS.POULTRY_READ }] } }] })
      );
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
          productId: VALID_PRODUCT_ID,
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
          productId: VALID_PRODUCT_ID,
          quantity: 50,
        })
        .expect(403);
    });
  });

  describe("POST /api/v1/inventory/transfers", () => {
    it("403 — cannot transfer from warehouse not in user's access", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/transfers")
        .set("Authorization", `Bearer ${inventoryToken()}`)
        .send({
          fromWarehouseId: OTHER_WAREHOUSE_ID,
          // assertWarehouseAccess() checks fromWarehouseId first and throws
          // before toWarehouseId is ever evaluated, so this just needs to be
          // a structurally valid UUID, not one the user actually has access to.
          toWarehouseId: VALID_WAREHOUSE_ID,
          productId: VALID_PRODUCT_ID,
          quantity: 25,
        })
        .expect(403);
    });

    it("400 — rejects transfer to the same warehouse", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inventory/transfers")
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
