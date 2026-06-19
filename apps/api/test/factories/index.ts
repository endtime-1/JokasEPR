import { AuthenticatedUser } from "@jokas/shared";
import { PERMISSIONS } from "@jokas/shared";

export const TEST_COMPANY_ID = "11111111-1111-1111-1111-111111111111";
export const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
export const TEST_FARM_ID = "33333333-3333-3333-3333-333333333333";
export const TEST_WAREHOUSE_ID = "44444444-4444-4444-4444-444444444444";
export const TEST_BRANCH_ID = "55555555-5555-5555-5555-555555555555";
export const TEST_REFRESH_TOKEN_ID = "66666666-6666-6666-6666-666666666666";
export const TEST_PRODUCT_ID = "77777777-7777-7777-7777-777777777777";
export const TEST_FLOCK_BATCH_ID = "88888888-8888-8888-8888-888888888888";
export const TEST_PASSWORD = "Admin@12345!";

export function makeDbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    email: "test@jokas.local",
    fullName: "Test User",
    passwordHash: "$2b$04$placeholder-not-used-in-real-bcrypt-comparisons",
    status: "ACTIVE",
    failedLoginAttempts: 0,
    lockedUntil: null,
    deletedAt: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    roles: [
      {
        role: {
          name: "Manager",
          permissions: [
            { key: PERMISSIONS.POULTRY_READ },
            { key: PERMISSIONS.POULTRY_MANAGE },
            { key: PERMISSIONS.INVENTORY_READ },
            { key: PERMISSIONS.INVENTORY_MANAGE },
          ],
        },
      },
    ],
    branchAccesses: [{ branchId: TEST_BRANCH_ID }],
    farmAccesses: [{ farmId: TEST_FARM_ID }],
    warehouseAccesses: [{ warehouseId: TEST_WAREHOUSE_ID }],
    productionSiteAccess: [],
    ...overrides,
  };
}

export function makeAuthUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    email: "test@jokas.local",
    fullName: "Test User",
    roles: ["Manager"],
    permissions: [
      PERMISSIONS.POULTRY_READ,
      PERMISSIONS.POULTRY_MANAGE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
    ],
    branchIds: [TEST_BRANCH_ID],
    farmIds: [TEST_FARM_ID],
    warehouseIds: [TEST_WAREHOUSE_ID],
    productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides,
  };
}

export function makeSuperAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: TEST_USER_ID,
    companyId: TEST_COMPANY_ID,
    email: "admin@jokas.local",
    fullName: "Super Admin",
    roles: ["Super Admin"],
    permissions: Object.values(PERMISSIONS) as string[],
    branchIds: [],
    farmIds: [],
    warehouseIds: [],
    productionSiteIds: [],
    hasGlobalAccess: true,
    ...overrides,
  };
}

export function makeDbRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REFRESH_TOKEN_ID,
    companyId: TEST_COMPANY_ID,
    userId: TEST_USER_ID,
    tokenHash: "$2b$12$hashed-refresh-token",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    userAgent: "test-agent",
    ipAddress: "127.0.0.1",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeDbFlockBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_FLOCK_BATCH_ID,
    companyId: TEST_COMPANY_ID,
    farmId: TEST_FARM_ID,
    branchId: TEST_BRANCH_ID,
    batchCode: "BATCH-001",
    breed: "Ross 308",
    houseId: null,
    placementDate: new Date("2026-01-01"),
    initialCount: 10000,
    currentCount: 9800,
    ageInDays: 35,
    status: "ACTIVE",
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

export function makeDbInventoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-id-001",
    companyId: TEST_COMPANY_ID,
    warehouseId: TEST_WAREHOUSE_ID,
    branchId: TEST_BRANCH_ID,
    farmId: TEST_FARM_ID,
    productionSiteId: null,
    productId: TEST_PRODUCT_ID,
    uomId: "uom-kg",
    quantityOnHand: 500,
    reorderLevel: 50,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    product: { id: TEST_PRODUCT_ID, sku: "FEED-001", name: "Broiler Feed", type: "FEED", uomId: "uom-kg" },
    warehouse: { id: TEST_WAREHOUSE_ID, code: "WH-01", name: "Main Warehouse" },
    ...overrides,
  };
}

export function makeDbProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_PRODUCT_ID,
    companyId: TEST_COMPANY_ID,
    sku: "FEED-001",
    name: "Broiler Feed",
    type: "FEED",
    uomId: "uom-kg",
    deletedAt: null,
    ...overrides,
  };
}

export function makeDbWarehouse(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_WAREHOUSE_ID,
    companyId: TEST_COMPANY_ID,
    branchId: TEST_BRANCH_ID,
    farmId: TEST_FARM_ID,
    productionSiteId: null,
    code: "WH-01",
    name: "Main Warehouse",
    deletedAt: null,
    ...overrides,
  };
}

export function makeDbSalesOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-id-001",
    companyId: TEST_COMPANY_ID,
    branchId: TEST_BRANCH_ID,
    orderNumber: "SO-2026-001",
    status: "PENDING",
    customerId: "customer-id-001",
    subtotal: 5000,
    taxAmount: 750,
    discountAmount: 0,
    totalAmount: 5750,
    notes: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

export function makeDbExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "expense-id-001",
    companyId: TEST_COMPANY_ID,
    branchId: TEST_BRANCH_ID,
    category: "Feed",
    amount: 3500,
    currency: "GHS",
    description: "Broiler feed purchase",
    expenseDate: new Date("2026-01-15"),
    approvalStatus: "APPROVED",
    deletedAt: null,
    createdAt: new Date("2026-01-15"),
    ...overrides,
  };
}

export function makeDbMobileSyncRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "sync-id-001",
    companyId: TEST_COMPANY_ID,
    localId: "local-id-001",
    endpoint: "/poultry/daily-records",
    status: "SYNCED",
    remoteId: "remote-id-001",
    errorMessage: null,
    syncedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}
