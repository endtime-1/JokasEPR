function modelMock() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    upsert: jest.fn(),
    groupBy: jest.fn(),
  };
}

export function createPrismaMock() {
  const mock = {
    user: modelMock(),
    refreshToken: modelMock(),
    company: modelMock(),
    role: modelMock(),
    userRole: modelMock(),
    permission: modelMock(),
    auditLog: modelMock(),
    flockBatch: modelMock(),
    poultryHouse: modelMock(),
    poultryHouseAssignment: modelMock(),
    dailyPoultryRecord: modelMock(),
    mortalityRecord: modelMock(),
    eggProductionRecord: modelMock(),
    feedConsumptionRecord: modelMock(),
    medicationRecord: modelMock(),
    vaccinationRecord: modelMock(),
    inventoryItem: modelMock(),
    stockMovement: modelMock(),
    stockTransfer: modelMock(),
    stockBatch: modelMock(),
    stockExpiryAlert: modelMock(),
    stockApproval: modelMock(),
    warehouseLocation: modelMock(),
    product: modelMock(),
    uom: modelMock(),
    warehouse: modelMock(),
    farm: modelMock(),
    branch: modelMock(),
    productionSite: modelMock(),
    salesOrder: modelMock(),
    salesOrderItem: modelMock(),
    invoice: modelMock(),
    invoiceItem: modelMock(),
    payment: modelMock(),
    salesReturn: modelMock(),
    customer: modelMock(),
    expense: modelMock(),
    revenue: modelMock(),
    bankAccount: modelMock(),
    payroll: modelMock(),
    budgetLine: modelMock(),
    mobileSyncRecord: modelMock(),
    aiAlert: modelMock(),
    notification: modelMock(),
    notificationSetting: modelMock(),
    procurementOrder: modelMock(),
    supplier: modelMock(),
    maintenanceRequest: modelMock(),
    hrTask: modelMock(),
    qualityInspection: modelMock(),
    feedProductionBatch: modelMock(),
    soyaProcessingBatch: modelMock(),
    reorderRule: modelMock(),
    $transaction: jest.fn().mockImplementation((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === "function") {
        return (arg as (tx: typeof mock) => Promise<unknown>)(mock);
      }
      return Promise.resolve(null);
    }),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
