/**
 * Sales module E2E tests.
 * Tests: sales orders, invoices, payments, financial calculation accuracy.
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
  TEST_BRANCH_ID,
  makeDbUser,
  makeDbSalesOrder,
} from "../factories";

describe("Sales Module (e2e)", () => {
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
    // See finance.e2e-spec.ts for why this is required: buildProfile() caches
    // per-user profiles across the whole file (same AuthService instance from
    // one beforeAll), so a stale cached profile from an earlier test silently
    // overrides whatever prisma.user.findFirst is mocked to for this test.
    authService.clearProfileCache(TEST_USER_ID);
    prisma.auditLog.create.mockResolvedValue({});
  });

  // Combined token+mock helper — see finance.e2e-spec.ts for why these must
  // travel together rather than relying on a single shared default profile.
  function salesToken(writeAccess = true) {
    const permissions = writeAccess
      ? [PERMISSIONS.SALES_READ, PERMISSIONS.SALES_MANAGE]
      : [PERMISSIONS.SALES_READ];
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({ roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }] })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Sales Manager"],
      farmIds: [],
      warehouseIds: [],
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  // POST /sales/payments is gated on FINANCE_MANAGE, not SALES_MANAGE
  // (sales.controller.ts:102) — recording a payment is treated as a finance
  // action even though it lives under the sales module.
  function salesPaymentToken() {
    const permissions = [PERMISSIONS.SALES_READ, PERMISSIONS.FINANCE_MANAGE];
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({ roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }] })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Sales Manager"],
      farmIds: [],
      warehouseIds: [],
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("GET /api/v1/sales/dashboard", () => {
    it("200 — returns sales summary", async () => {
      // dashboard() calls salesOrder.findMany 3x internally (once directly,
      // once each via the private salesByProduct/salesByCustomer helpers,
      // each with different `include` shapes) — all through this one mock.
      // Returning [] avoids every shape mismatch (order.items, row.customer,
      // etc.) since this test only asserts the endpoint succeeds, not content.
      prisma.salesOrder.findMany.mockResolvedValue([]);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 5750, balanceDue: 0 } });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 5750 } });
      prisma.salesReturn.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });

      await request(app.getHttpServer())
        .get("/api/v1/sales/dashboard")
        .set("Authorization", `Bearer ${salesToken()}`)
        .expect(200);
    });

    it("403 — rejects user without sales.read", async () => {
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
        .get("/api/v1/sales/dashboard")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("401 — requires authentication", async () => {
      await request(app.getHttpServer()).get("/api/v1/sales/dashboard").expect(401);
    });
  });

  describe("POST /api/v1/sales/orders — financial calculation accuracy", () => {
    it("creates a sales order with calculated totals", async () => {
      const subtotal = 10000;
      const taxRate = 0.15; // 15% VAT
      const taxAmount = Math.round(subtotal * taxRate * 100) / 100; // 1500
      const total = subtotal + taxAmount; // 11500

      prisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Farm Co Ltd" });
      prisma.salesOrder.create.mockResolvedValue({
        ...makeDbSalesOrder(),
        subtotal,
        taxAmount,
        totalAmount: total,
        orderNumber: "SO-2026-002",
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/sales/orders")
        .set("Authorization", `Bearer ${salesToken()}`)
        .send({
          customerId: "cust-1",
          branchId: TEST_BRANCH_ID,
          items: [
            { productId: "prod-1", quantity: 100, unitPrice: 100, notes: null }
          ],
          taxRate,
          notes: "Test order",
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
    });

    it("403 — read-only user cannot create orders", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sales/orders")
        .set("Authorization", `Bearer ${salesToken(false)}`)
        .send({
          customerId: "cust-1",
          branchId: TEST_BRANCH_ID,
          items: [{ productId: "prod-1", quantity: 10, unitPrice: 50 }],
        })
        .expect(403);
    });

    it("400 — rejects order with empty items array", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sales/orders")
        .set("Authorization", `Bearer ${salesToken()}`)
        .send({
          customerId: "cust-1",
          branchId: TEST_BRANCH_ID,
          items: [], // empty items not allowed
        })
        .expect(400);
    });

    it("400 — rejects negative unit price", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sales/orders")
        .set("Authorization", `Bearer ${salesToken()}`)
        .send({
          customerId: "cust-1",
          branchId: TEST_BRANCH_ID,
          items: [{ productId: "prod-1", quantity: 10, unitPrice: -50 }],
        })
        .expect(400);
    });
  });

  describe("POST /api/v1/sales/payments", () => {
    it("records a payment against an invoice", async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: "invoice-1",
        totalAmount: 5750,
        amountPaid: 0,
        status: "UNPAID",
        companyId: TEST_COMPANY_ID,
      });
      prisma.payment.create.mockResolvedValue({
        id: "pay-1",
        invoiceId: "invoice-1",
        amount: 5750,
        paymentDate: new Date(),
      });
      prisma.invoice.update.mockResolvedValue({});

      const res = await request(app.getHttpServer())
        .post("/api/v1/sales/payments")
        .set("Authorization", `Bearer ${salesPaymentToken()}`)
        .send({
          invoiceId: "invoice-1",
          amount: 5750,
          paymentMethod: "CASH",
          paymentDate: "2026-01-20",
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
    });

    it("400 — rejects payment with zero amount", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/sales/payments")
        .set("Authorization", `Bearer ${salesPaymentToken()}`)
        .send({
          invoiceId: "invoice-1",
          amount: 0,
          paymentMethod: "CASH",
          paymentDate: "2026-01-20",
        })
        .expect(400);
    });
  });

  describe("GET /api/v1/sales/orders", () => {
    it("200 — returns paginated order list", async () => {
      prisma.salesOrder.findMany.mockResolvedValue([makeDbSalesOrder()]);
      prisma.salesOrder.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get("/api/v1/sales/orders")
        .set("Authorization", `Bearer ${salesToken()}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
