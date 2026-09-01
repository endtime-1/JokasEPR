function modelMock() {
  return {
    // Read methods default to a resolved "found nothing" value, not a bare
    // `jest.fn()` (which returns `undefined` synchronously, not a Promise).
    // App code across the codebase routinely does
    // `this.prisma.x.count(...).catch(() => 0)` or `.findMany(...).map(...)`
    // defensively — calling `.catch()`/`.then()` on a non-Promise throws, and
    // `.map()` on `undefined` throws too. Every test file in this suite hit
    // some version of this until each one explicitly stubbed the exact
    // methods its code path touched; defaulting here fixes the whole class
    // of bug at once for methods any test forgets to configure. Write
    // methods (create/update/upsert/delete/...) deliberately stay bare —
    // tests almost always need to assert on their specific mocked return
    // value, so a wrong default there would mask a genuinely missing setup
    // rather than help.
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({}),
    upsert: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

export function createPrismaMock() {
  const mock = {
    user: modelMock(),
    refreshToken: modelMock(),
    loginRateLimit: modelMock(),
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
    feedReceiptRecord: modelMock(),
    feedInternalTransfer: modelMock(),
    medicationRecord: modelMock(),
    vaccinationRecord: modelMock(),
    inventoryItem: modelMock(),
    stockMovement: modelMock(),
    stockTransfer: modelMock(),
    transferDiscrepancy: modelMock(),
    stockReservation: modelMock(),
    stockAdjustment: modelMock(),
    stockBatch: modelMock(),
    stockExpiryAlert: modelMock(),
    stockApproval: modelMock(),
    stockReorderLevel: modelMock(),
    inventoryValuation: modelMock(),
    userWarehouseAccess: modelMock(),
    finishedFeedStock: modelMock(),
    soyaBeanIntake: modelMock(),
    soyaOilOutput: modelMock(),
    soyaCakeOutput: modelMock(),
    deliveryNote: modelMock(),
    goodsReceivedNote: modelMock(),
    machine: modelMock(),
    equipment: modelMock(),
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
    supplierPayment: modelMock(),
    supplierInvoice: modelMock(),
    customerPayment: modelMock(),
    bankAccount: modelMock(),
    payrollRecord: modelMock(),
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
    feedProductionOrder: modelMock(),
    feedExternalSale: modelMock(),
    marketTarget: modelMock(),
    priceList: modelMock(),
    receipt: modelMock(),
    soyaProcessingBatch: modelMock(),
    reorderRule: modelMock(),
    poultryHealthObservation: modelMock(),
    systemSetting: modelMock(),
    pen: modelMock(),
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
