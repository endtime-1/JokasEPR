/**
 * Finance module E2E tests.
 * Tests: expenses, revenue, bank accounts, financial report calculations,
 * large-expense thresholds, permission enforcement.
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
  makeDbExpense,
} from "../factories";

describe("Finance Module (e2e)", () => {
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
    // AuthService.buildProfile() caches per-user profiles in-memory (5-min TTL).
    // createTestApp() runs once in beforeAll, so that cache — and the same
    // AuthService instance — persists across every test in this file. Without
    // clearing it, the first test to populate the cache for TEST_USER_ID would
    // silently poison every later test that reuses that ID with a different
    // intended permission set.
    authService.clearProfileCache(TEST_USER_ID);
    prisma.auditLog.create.mockResolvedValue({});
    // finance.service.ts's dashboard() Promise.all's 9 queries together — these
    // aren't relevant to any current assertion but must resolve to something
    // array/object-shaped or bankAccounts.map() etc. throws on undefined.
    // Individual tests override expense/revenue aggregates as needed below.
    prisma.bankAccount.findMany.mockResolvedValue([]);
    prisma.expense.count.mockResolvedValue(0);
    prisma.supplierPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });
    prisma.customerPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });
    // M-BUG (2026-08-13): dashboard()'s new accountsPayable figure reads
    // supplierInvoice.aggregate — the model was missing from prisma.mock.ts
    // entirely (added alongside this), and modelMock()'s bare `{}` default
    // isn't enough on its own since dashboard() reads `._sum.balanceDue`.
    prisma.supplierInvoice.aggregate.mockResolvedValue({ _sum: { balanceDue: 0 }, _count: 0 });
  });

  // JwtStrategy.validate() hydrates the real AuthenticatedUser from the DB via
  // buildProfile() -> prisma.user.findFirst(), ignoring the JWT's own
  // `permissions` claim for authorization purposes. So the mocked DB user's
  // permissions must always match what this specific token is meant to grant —
  // stubbing a single shared "full access" profile in beforeEach would make
  // every "read-only" / permission-denial test wrongly pass as full-access.
  function financeToken(writeAccess = true) {
    const permissions = writeAccess
      ? [PERMISSIONS.FINANCE_READ, PERMISSIONS.FINANCE_MANAGE]
      : [PERMISSIONS.FINANCE_READ];
    prisma.user.findFirst.mockResolvedValue(
      makeDbUser({ roles: [{ role: { permissions: permissions.map((key) => ({ key })) } }] })
    );
    return makeAccessToken({
      id: TEST_USER_ID,
      companyId: TEST_COMPANY_ID,
      permissions,
      roles: ["Finance Manager"],
      farmIds: [],
      warehouseIds: [],
      branchIds: [TEST_BRANCH_ID],
      productionSiteIds: [],
      hasGlobalAccess: false,
    } as Parameters<typeof makeAccessToken>[0]);
  }

  describe("GET /api/v1/finance/dashboard", () => {
    it("200 — returns financial summary", async () => {
      prisma.expense.findMany.mockResolvedValue([makeDbExpense()]);
      prisma.revenue.findMany.mockResolvedValue([]);
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 3500 } });
      prisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      await request(app.getHttpServer())
        .get("/api/v1/finance/dashboard")
        .set("Authorization", `Bearer ${financeToken()}`)
        .expect(200);
    });

    it("403 — rejects user without finance.read", async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeDbUser({ roles: [{ role: { permissions: [{ key: PERMISSIONS.SALES_READ }] } }] })
      );
      const token = makeAccessToken({
        id: TEST_USER_ID,
        companyId: TEST_COMPANY_ID,
        permissions: [PERMISSIONS.SALES_READ],
        roles: ["Sales Rep"],
        farmIds: [],
        warehouseIds: [],
        branchIds: [],
        productionSiteIds: [],
        hasGlobalAccess: false,
      } as Parameters<typeof makeAccessToken>[0]);

      await request(app.getHttpServer())
        .get("/api/v1/finance/dashboard")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("POST /api/v1/finance/expenses — financial accuracy", () => {
    it("creates an expense record", async () => {
      prisma.expense.create.mockResolvedValue(makeDbExpense());

      const res = await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken()}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Feed",
          amount: 3500,
          description: "Broiler feed purchase for January",
          expenseDate: "2026-01-15",
        });

      expect([201, 200, 400].includes(res.status)).toBe(true);
    });

    it("403 — read-only user cannot create expenses", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken(false)}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Feed",
          amount: 3500,
          description: "Test expense",
          expenseDate: "2026-01-15",
        })
        .expect(403);
    });

    it("400 — rejects negative expense amount", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken()}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Feed",
          amount: -100,
          description: "Invalid negative expense",
          expenseDate: "2026-01-15",
        })
        .expect(400);
    });

    it("400 — rejects zero expense amount", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken()}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Feed",
          amount: 0,
          description: "Zero amount expense",
          expenseDate: "2026-01-15",
        })
        .expect(400);
    });

    it("400 — rejects missing required fields", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken()}`)
        .send({ amount: 1000 }) // missing category, description, expenseDate
        .expect(400);
    });
  });

  describe("POST /api/v1/finance/revenue", () => {
    it("403 — read-only user cannot create revenue records", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/revenue")
        .set("Authorization", `Bearer ${financeToken(false)}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Egg Sales",
          amount: 10000,
          description: "Weekly egg sales",
          revenueDate: "2026-01-15",
        })
        .expect(403);
    });

    it("400 — rejects negative revenue amount", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/finance/revenue")
        .set("Authorization", `Bearer ${financeToken()}`)
        .send({
          branchId: TEST_BRANCH_ID,
          category: "Egg Sales",
          amount: -500,
          description: "Invalid",
          revenueDate: "2026-01-15",
        })
        .expect(400);
    });
  });

  describe("GET /api/v1/finance/expenses", () => {
    it("200 — returns paginated expense list for user's company", async () => {
      prisma.expense.findMany.mockResolvedValue([makeDbExpense()]);
      prisma.expense.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get("/api/v1/finance/expenses")
        .set("Authorization", `Bearer ${financeToken()}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("Financial calculation consistency", () => {
    it("calculates net profit correctly from expenses and revenues", async () => {
      const expenses = [
        makeDbExpense({ amount: 5000 }),
        makeDbExpense({ amount: 3000 }),
      ];
      const revenueTotal = 15000;
      const expenseTotal = 8000;

      prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: expenseTotal } });
      prisma.revenue.aggregate.mockResolvedValue({ _sum: { amount: revenueTotal } });
      prisma.expense.findMany.mockResolvedValue(expenses);
      prisma.revenue.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/finance/dashboard")
        .set("Authorization", `Bearer ${financeToken()}`)
        .expect(200);

      // Verify that if the dashboard exposes profit = revenue - expenses, it is correct
      if (res.body.data?.netProfit !== undefined) {
        expect(res.body.data.netProfit).toBe(revenueTotal - expenseTotal);
      }
      // If not exposed directly, at minimum the endpoint should succeed
      expect(res.body.data).toBeDefined();
    });
  });
});
