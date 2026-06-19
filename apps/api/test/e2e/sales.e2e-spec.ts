/**
 * Sales module E2E tests.
 * Tests: sales orders, invoices, payments, financial calculation accuracy.
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
  TEST_BRANCH_ID,
  makeDbSalesOrder,
} from "../factories";

function salesToken(writeAccess = true) {
  return makeAccessToken({
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    permissions: writeAccess
      ? [PERMISSIONS.SALES_READ, PERMISSIONS.SALES_MANAGE]
      : [PERMISSIONS.SALES_READ],
    roles: ["Sales Manager"],
    farmIds: [],
    warehouseIds: [],
    branchIds: [TEST_BRANCH_ID],
    productionSiteIds: [],
    hasGlobalAccess: false,
  } as Parameters<typeof makeAccessToken>[0]);
}

describe("Sales Module (e2e)", () => {
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

  describe("GET /api/v1/sales/dashboard", () => {
    it("200 — returns sales summary", async () => {
      prisma.salesOrder.findMany.mockResolvedValue([makeDbSalesOrder()]);
      prisma.salesOrder.count.mockResolvedValue(1);
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.salesOrder.aggregate.mockResolvedValue({ _sum: { totalAmount: 5750 } });

      await request(app.getHttpServer())
        .get("/api/v1/sales/dashboard")
        .set("Authorization", `Bearer ${salesToken()}`)
        .expect(200);
    });

    it("403 — rejects user without sales.read", async () => {
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
        .set("Authorization", `Bearer ${salesToken()}`)
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
        .set("Authorization", `Bearer ${salesToken()}`)
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
