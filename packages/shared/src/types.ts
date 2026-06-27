export type AuthenticatedUser = {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  farmIds: string[];
  warehouseIds: string[];
  productionSiteIds: string[];
  hasGlobalAccess: boolean;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

// ── Mobile submit payload types ─────────────────────────────────────────────
// Mirror the NestJS DTOs so mobile forms get compile-time type checking.

export type SubmitDailyPoultryRecord = {
  flockBatchId: string;
  penId?: string;
  recordDate: string;
  mortalityCount: number;
  culledCount: number;
  feedConsumedKg: number;
  totalEggs: number;
  openingBirdCount?: number;
  notes?: string;
};

export type SubmitMortalityRecord = {
  flockBatchId: string;
  penId?: string;
  recordDate: string;
  birdCount: number;
  isCulling?: boolean;
  reason?: string;
  notes?: string;
};

export type SubmitEggProductionRecord = {
  flockBatchId: string;
  penId?: string;
  recordDate: string;
  goodEggs: number;
  crackedEggs: number;
  dirtyEggs: number;
  brokenEggs: number;
  rejectedEggs: number;
  eggProductId?: string;
  warehouseId?: string;
  notes?: string;
};

export type SubmitFeedConsumptionRecord = {
  flockBatchId: string;
  penId?: string;
  recordDate: string;
  quantityKg: number;
  feedProductId?: string;
  costAmount?: number;
  warehouseId?: string;
  notes?: string;
};

export type SubmitMedicationRecord = {
  flockBatchId: string;
  penId?: string;
  medicationName: string;
  dosage: string;
  route?: string;
  startDate: string;
  endDate?: string;
  withdrawalUntil?: string;
  medicineProductId?: string;
  warehouseId?: string;
  quantityUsed?: number;
  notes?: string;
};

export type SubmitVaccinationRecord = {
  flockBatchId: string;
  penId?: string;
  vaccineName: string;
  dose: string;
  vaccinationDate: string;
  nextDueDate?: string;
  administeredBy?: string;
  vaccineProductId?: string;
  warehouseId?: string;
  notes?: string;
};

export type SubmitStockMovement = {
  inventoryItemId: string;
  movementType: string;
  quantity: number;
  unitCost?: number;
  referenceNo?: string;
  notes?: string;
};

export type SubmitSalesOrderLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
};

export type SubmitSalesOrder = {
  customerId: string;
  orderDate: string;
  deliveryDate?: string;
  lines: SubmitSalesOrderLine[];
  notes?: string;
};

export type SubmitProductionRecord = {
  productionOrderId: string;
  batchNumber: string;
  quantityProduced: number;
  qualityCheck?: string;
  notes?: string;
};

