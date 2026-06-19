# Jokas ERP — Testing Guide

This document explains how to run all tests, what is tested, how to write new tests,
and how to understand test failures.

---

## Table of Contents

1. [Test Structure](#test-structure)
2. [Running Tests](#running-tests)
3. [Test Infrastructure](#test-infrastructure)
4. [Unit Tests](#unit-tests)
5. [E2E / Integration Tests](#e2e--integration-tests)
6. [Writing New Tests](#writing-new-tests)
7. [Test Data Factories](#test-data-factories)
8. [CI Integration](#ci-integration)
9. [Coverage Reports](#coverage-reports)
10. [Troubleshooting](#troubleshooting)

---

## Test Structure

```
apps/api/
  src/
    modules/
      auth/
        auth.service.spec.ts          — auth logic unit tests (14 tests)
      common/guards/
        permissions.guard.spec.ts     — RBAC guard unit tests (6 tests)
        scope-access.guard.spec.ts    — scope restriction unit tests (11 tests)

  test/
    setup/
      env.ts                          — test env vars (loaded by setupFiles)
      prisma.mock.ts                  — Prisma mock factory
      app.setup.ts                    — NestJS test app factory
      auth.helper.ts                  — JWT token generation helpers

    factories/
      index.ts                        — typed test data factories

    jest-e2e.json                     — E2E test configuration

    e2e/
      auth.e2e-spec.ts                — auth API tests (12 tests)
      permissions.e2e-spec.ts         — RBAC route protection (8 tests)
      multi-farm.e2e-spec.ts          — multi-farm scope enforcement (8 tests)
      poultry.e2e-spec.ts             — poultry module tests (8 tests)
      inventory.e2e-spec.ts           — inventory + stock movement (10 tests)
      sales.e2e-spec.ts               — sales + financial calculations (9 tests)
      finance.e2e-spec.ts             — finance module tests (10 tests)
      mobile-sync.e2e-spec.ts         — mobile sync + idempotency (8 tests)
      security.e2e-spec.ts            — security hardening tests (11 tests)
```

---

## Running Tests

### Prerequisites

Ensure you have installed dependencies:

```bash
pnpm install
```

The tests use a **mocked Prisma service** — no real database is required to run
unit tests or E2E tests. The only requirement is that the code can compile.

### Unit tests (fast — no HTTP, no DB)

```bash
cd apps/api
pnpm test
```

### E2E tests (HTTP-level — mocked DB)

```bash
cd apps/api
pnpm test:e2e
```

### Run all tests

```bash
cd apps/api
pnpm test:all
```

### Coverage report

```bash
cd apps/api
pnpm test:coverage       # unit tests with coverage
pnpm test:e2e:coverage   # e2e tests with coverage
```

Coverage output is in `apps/api/coverage/`.

### Watch mode (while developing)

```bash
cd apps/api
pnpm test:watch
```

### Run a single spec file

```bash
cd apps/api
npx jest src/modules/auth/auth.service.spec.ts
npx jest test/e2e/auth.e2e-spec.ts --config test/jest-e2e.json
```

### Run tests matching a pattern

```bash
cd apps/api
npx jest --testNamePattern="login"
```

---

## Test Infrastructure

### Environment variables (`test/setup/env.ts`)

Loaded automatically by Jest's `setupFiles` before any test runs. Sets all required
environment variables including test JWT secrets (32+ chars, different from production).
Export constants `TEST_ACCESS_SECRET` and `TEST_REFRESH_SECRET` for use in token helpers.

**Never use production secrets in tests.** The test secrets are only used during
`pnpm test` — they have no access to real data.

### Prisma mock (`test/setup/prisma.mock.ts`)

`createPrismaMock()` returns a plain object with `jest.fn()` for every model operation
(findFirst, findMany, create, update, updateMany, delete, upsert, count, etc.).

The `$transaction` mock calls the callback function synchronously with the mock itself,
so transaction-wrapped service code works without a real DB.

**Usage in tests:**

```typescript
const { app, prisma } = await createTestApp();

// Set up return values before the test:
prisma.user.findMany.mockResolvedValue([makeDbUser()]);
prisma.user.update.mockResolvedValue(makeDbUser());

// Assert that specific calls were made:
expect(prisma.user.update).toHaveBeenCalledWith(
  expect.objectContaining({ data: { failedLoginAttempts: 0 } })
);

// Reset between tests:
jest.clearAllMocks(); // in beforeEach()
```

### App factory (`test/setup/app.setup.ts`)

`createTestApp()` creates a full NestJS application (using the real `AppModule`) with:
- `PrismaService` replaced with the mock
- Cookie parser middleware
- Global prefix `api`, URI versioning `v1`
- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true`
- `HttpExceptionFilter`
- Logger silenced (no output during tests)

Create the app once per describe block:

```typescript
let app: INestApplication;
let prisma: PrismaMock;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});
```

### Auth helpers (`test/setup/auth.helper.ts`)

```typescript
// Generate a valid access token for a user
const token = makeAccessToken({
  id: "user-id",
  companyId: "company-id",
  permissions: [PERMISSIONS.POULTRY_READ],
  roles: ["Farm Worker"],
  farmIds: ["farm-1"],
  warehouseIds: [],
  branchIds: [],
  productionSiteIds: [],
  hasGlobalAccess: false,
});

// Generate a refresh token (for testing logout/refresh endpoints)
const refreshToken = makeRefreshToken(userId, companyId, jti);

// Add to request
request(app.getHttpServer())
  .get("/api/v1/auth/me")
  .set("Authorization", `Bearer ${token}`)
```

---

## Unit Tests

Unit tests live in `src/**/*.spec.ts` alongside the service/guard they test.
They test pure business logic without HTTP or database.

### What they test

| File | Key scenarios |
|---|---|
| `auth.service.spec.ts` | Login success/failure, account lockout after 5 failures, token rotation, changePassword, buildProfile permission deduplication |
| `permissions.guard.spec.ts` | Permission presence/absence enforcement, missing user context |
| `scope-access.guard.spec.ts` | Farm/warehouse scope enforcement, Super Admin bypass, type-confusion bypass prevention (empty string, number) |

### Key patterns

```typescript
// Mock bcryptjs entirely in auth unit tests (avoids slow hashing):
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("$2b$12$mocked"),
}));

// Control bcrypt.compare() per test:
(bcrypt.compare as jest.Mock).mockResolvedValue(true);  // correct password
(bcrypt.compare as jest.Mock).mockResolvedValue(false); // wrong password
```

---

## E2E / Integration Tests

E2E tests live in `test/e2e/*.e2e-spec.ts`. They test the full HTTP pipeline
using `supertest`: routing, guards, validation pipes, middleware, response shape.
Prisma is mocked so no database is needed.

### What they test

| File | Module | Key scenarios |
|---|---|---|
| `auth.e2e-spec.ts` | Auth | Login/refresh/logout/me/change-password, cookie headers, validation |
| `permissions.e2e-spec.ts` | Guards | 403 for missing permissions across modules |
| `multi-farm.e2e-spec.ts` | Scope | Farm/warehouse scope enforcement, Super Admin bypass |
| `poultry.e2e-spec.ts` | Poultry | Dashboard, batch CRUD, daily records, form validation |
| `inventory.e2e-spec.ts` | Inventory | Stock-in/out/transfer, warehouse scope, quantity validation |
| `sales.e2e-spec.ts` | Sales | Orders, payments, financial calculation, permission checks |
| `finance.e2e-spec.ts` | Finance | Expenses, revenue, P&L calculation accuracy, permission checks |
| `mobile-sync.e2e-spec.ts` | Sync | Batch sync, idempotency, duplicate detection, error handling |
| `security.e2e-spec.ts` | Security | JWT forgery, cookie headers, SQL injection in inputs, scope bypass |

### Setting up mocks for E2E

Because the full app runs, all Prisma calls within any service that processes a request
must be mocked. Before each relevant test:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  prisma.auditLog.create.mockResolvedValue({}); // audit writes always succeed
});

it("200 — returns items", async () => {
  prisma.inventoryItem.findMany.mockResolvedValue([makeDbInventoryItem()]);

  const res = await request(app.getHttpServer())
    .get("/api/v1/inventory/items")
    .set("Authorization", `Bearer ${inventoryToken()}`)
    .expect(200);

  expect(Array.isArray(res.body.data)).toBe(true);
});
```

---

## Writing New Tests

### Adding a unit test

1. Create `src/modules/<name>/<name>.service.spec.ts`
2. Import the service and its dependencies
3. Mock all injected providers with `jest.fn()` or `jest.mock()`
4. Create the service with mock dependencies: `new MyService(mockPrisma as never, ...)`
5. Write `describe` / `it` blocks covering success paths, error paths, edge cases

### Adding an E2E test

1. Create `test/e2e/<name>.e2e-spec.ts`
2. Import `createTestApp`, `makeAccessToken`, your factories
3. Set up the test app in `beforeAll`
4. Clear mocks in `beforeEach` and always mock `prisma.auditLog.create`
5. Generate tokens with appropriate permissions using `makeAccessToken`
6. Use `request(app.getHttpServer()).post(...).send(...)` with supertest
7. Assert HTTP status codes and response body shape

### Test naming conventions

```typescript
describe("ModuleName (e2e)", () => {
  describe("POST /api/v1/module/action", () => {
    it("200 — success description", async () => { ... });
    it("400 — invalid input description", async () => { ... });
    it("401 — requires authentication", async () => { ... });
    it("403 — requires permission-name permission", async () => { ... });
  });
});
```

---

## Test Data Factories

All factories are in `test/factories/index.ts`. Use them to create realistic test
objects that match the shape of Prisma model output.

```typescript
import {
  makeDbUser,           // User row with relations for auth tests
  makeAuthUser,         // AuthenticatedUser (JWT payload shape)
  makeSuperAdmin,       // AuthenticatedUser with hasGlobalAccess=true
  makeDbRefreshToken,   // RefreshToken row
  makeDbFlockBatch,     // FlockBatch row
  makeDbInventoryItem,  // InventoryItem row with product and warehouse
  makeDbWarehouse,      // Warehouse row
  makeDbProduct,        // Product row
  makeDbSalesOrder,     // SalesOrder row
  makeDbExpense,        // Expense row
  makeDbMobileSyncRecord, // MobileSyncRecord row
} from "../factories";
```

All factories accept an `overrides` object to change specific fields:

```typescript
const lockedUser = makeDbUser({
  failedLoginAttempts: 5,
  lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
});
```

### Constant IDs

The factories export fixed UUIDs for use in assertions:

```typescript
export const TEST_COMPANY_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_FARM_ID = "33333333-3333-3333-3333-333333333333";
export const TEST_WAREHOUSE_ID = "44444444-4444-4444-4444-444444444444";
export const TEST_BRANCH_ID = "55555555-5555-5555-5555-555555555555";
```

---

## CI Integration

Add to your CI pipeline (GitHub Actions example):

```yaml
- name: Run unit tests
  run: pnpm --filter @jokas/api test

- name: Run E2E tests
  run: pnpm --filter @jokas/api test:e2e
```

No database setup is required. The test environment is fully self-contained.

For coverage gates, add to `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    branches: 70,
    functions: 80,
    lines: 80,
    statements: 80,
  }
}
```

---

## Coverage Reports

After running `pnpm test:coverage`, open the HTML report:

```bash
# Windows
start apps/api/coverage/lcov-report/index.html

# Mac/Linux
open apps/api/coverage/lcov-report/index.html
```

The report shows line-by-line coverage for all files in `src/`.

---

## Troubleshooting

### `Cannot find module '@jokas/shared'`

The workspace package is not built. Run:
```bash
pnpm --filter @jokas/shared build
```

Or check that `moduleNameMapper` in `jest.config.ts` points to `packages/shared/src`.

### `JWT_ACCESS_SECRET is required` error

The `test/setup/env.ts` setup file is not loading. Verify `setupFiles` is set in
`jest.config.ts` and `test/jest-e2e.json`.

### `Cannot find module 'cookie-parser'`

Run `pnpm install` from the workspace root to install `cookie-parser`.

### Tests fail with `[object Object]` in assertions

Use `expect.objectContaining({ ... })` instead of exact equality when matching
complex objects with many fields you don't care about.

### E2E test is flaky (sometimes passes, sometimes fails)

Add `beforeEach(() => { jest.clearAllMocks(); })` to ensure mock state is clean
between tests. Each `it` block should set up all the mocks it needs independently.

### `prisma.auditLog.create is not a function`

Make sure you mock `prisma.auditLog.create.mockResolvedValue({})` in `beforeEach`.
Every service call that writes audit records will call this, and an unmocked function
will throw.

### Type errors in test files

Run `pnpm --filter @jokas/api lint` to check TypeScript compilation. The test files
use `as Parameters<typeof makeAccessToken>[0]` casts for tokens that include optional
scope fields — this is expected.

---

## Quick Reference

```bash
# All unit tests
pnpm --filter @jokas/api test

# All E2E tests  
pnpm --filter @jokas/api test:e2e

# Single file
pnpm --filter @jokas/api exec npx jest src/modules/auth/auth.service.spec.ts

# Single E2E file
pnpm --filter @jokas/api exec npx jest test/e2e/auth.e2e-spec.ts --config test/jest-e2e.json

# Run tests matching name pattern
pnpm --filter @jokas/api exec npx jest --testNamePattern="lockout"

# Coverage
pnpm --filter @jokas/api test:coverage
```
