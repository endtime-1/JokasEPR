import type {
  SubmitDailyPoultryRecord,
  SubmitEggProductionRecord,
  SubmitFeedConsumptionRecord,
  SubmitMedicationRecord,
  SubmitMortalityRecord,
  SubmitProductionRecord,
  SubmitSalesOrder,
  SubmitStockMovement,
  SubmitVaccinationRecord
} from "@jokas/shared";
import { apiFetch } from "./client";

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

// Platform
export const fetchPlatformSummary = () =>
  apiFetch<ApiEnvelope<{ branches: number; farms: number; productionSites: number; warehouses: number; users: number }>>("/platform/summary");

export const fetchFarms = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; farmType: string }[]>>("/platform/farms");

export const fetchWarehouses = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; warehouseType: string }[]>>("/platform/warehouses");

// Poultry
export const fetchFlockBatches = (farmId?: string) =>
  apiFetch<ApiEnvelope<{ id: string; code: string; name: string; farmId: string }[]>>(
    `/poultry/flock-batches${farmId ? `?farmId=${farmId}` : ""}`
  );

export const submitDailyPoultryRecord = (payload: SubmitDailyPoultryRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/daily-records", { method: "POST", body: JSON.stringify(payload) });

export const submitMortality = (payload: SubmitMortalityRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/mortality-records", { method: "POST", body: JSON.stringify(payload) });

export const submitEggProduction = (payload: SubmitEggProductionRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/egg-production-records", { method: "POST", body: JSON.stringify(payload) });

export const submitFeedConsumption = (payload: SubmitFeedConsumptionRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/feed-consumption-records", { method: "POST", body: JSON.stringify(payload) });

export const submitMedication = (payload: SubmitMedicationRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/medication-records", { method: "POST", body: JSON.stringify(payload) });

export const submitVaccination = (payload: SubmitVaccinationRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/vaccination-records", { method: "POST", body: JSON.stringify(payload) });

// Inventory
export const fetchInventoryItems = (warehouseId?: string) =>
  apiFetch<ApiEnvelope<{ id: string; product: { name: string; sku: string }; warehouseId: string }[]>>(
    `/inventory/items?limit=200${warehouseId ? `&warehouseId=${warehouseId}` : ""}`
  );

export const submitStockMovement = (payload: SubmitStockMovement) =>
  apiFetch<ApiEnvelope<unknown>>("/inventory/stock-movements", { method: "POST", body: JSON.stringify(payload) });

// Sales
export const fetchCustomers = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; code: string }[]>>("/sales/customers");

export const fetchProducts = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; sku: string; unitPrice: number }[]>>("/inventory/products");

export const fetchFeedProducts = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; sku: string; unitPrice: number }[]>>("/inventory/products?type=FINISHED_GOOD");

export const submitSalesOrder = (payload: SubmitSalesOrder) =>
  apiFetch<ApiEnvelope<unknown>>("/sales/orders", { method: "POST", body: JSON.stringify(payload) });

// Tasks
export const fetchMyTasks = () =>
  apiFetch<ApiEnvelope<Task[]>>("/hr/tasks/my?limit=50");

export const updateTaskStatus = (id: string, payload: { status: string; notes?: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/hr/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) });

// Hipro Predictive
export type HiproPredictiveIngredientRow = {
  ingredientId: string;
  name: string;
  sku: string;
  kgsPerTon: number;
  availableKg: number;
  bagsOnHand: number;
  tonsOnHand: number;
  maxProducibleKg: number | null;
  maxProducibleTons: number | null;
  feedConsumedKg: number;
};

export type HiproPredictiveFormula = {
  formulaId: string;
  formulaCode: string;
  formulaName: string;
  feedType: string;
  finishedProduct: { name: string; sku: string } | null;
  targetBatchKg: number;
  maxProducibleKg: number | null;
  maxProducibleTons: number | null;
  maxProducibleBags: number | null;
  limitingIngredient: { name: string; sku: string } | null;
  ingredients: HiproPredictiveIngredientRow[];
};

export type HiproPredictiveIngredientView = {
  ingredientId: string;
  name: string;
  sku: string;
  availableKg: number;
  bagsOnHand: number;
  tonsOnHand: number;
  feedConsumedKg: number;
  formulaUsages: Array<{
    formulaId: string;
    formulaName: string;
    feedType: string;
    kgsPerTon: number;
    maxProducibleKg: number | null;
  }>;
};

export const fetchHiproPredictive = (warehouseId?: string) =>
  apiFetch<ApiEnvelope<{ asOf: string; warehouseId: string | null; formulas: HiproPredictiveFormula[]; ingredientView: HiproPredictiveIngredientView[] }>>(
    `/feed-production/hipro-predictive${warehouseId ? `?warehouseId=${warehouseId}` : ""}`
  );

export type SimulatePredictiveResult = {
  plans: Array<{
    formulaId: string;
    formulaName: string;
    formulaCode: string;
    feedType: string;
    plannedTons: number;
    plannedKg: number;
    canProduce: boolean;
    ingredients: Array<{
      ingredientId: string;
      productName: string;
      sku: string;
      quantityKg: number;
      availableKg: number;
      shortageKg: number;
      unitCost: number;
      bagsRequired: number;
      tonsRequired: number;
      bagsAvailable: number;
      tonsAvailable: number;
    }>;
  }>;
  ingredientSummary: Array<{
    ingredientId: string;
    name: string;
    sku: string;
    totalRequired: number;
    totalAvailable: number;
    shortfall: number;
  }>;
  allCanProduce: boolean;
};

export const simulateHiproPredictive = (payload: { warehouseId: string; plans: Array<{ formulaId: string; plannedTons: number }> }) =>
  apiFetch<ApiEnvelope<SimulatePredictiveResult>>("/feed-production/hipro-predictive/simulate", {
    method: "POST",
    body: JSON.stringify(payload)
  });

// Soya Processing
export type SoyaOption = { id: string; name: string; code?: string; sku?: string; type?: string };

export type SoyaOptions = {
  data: {
    productionSites: SoyaOption[];
    warehouses: SoyaOption[];
    products: SoyaOption[];
    intakes: { id: string; receiptNumber: string; supplierName: string; quantityKg: number }[];
  };
};

export const fetchSoyaOptions = () =>
  apiFetch<SoyaOptions>("/soya-processing/options");

export const submitSoyaIntake = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/soya-processing/intakes", { method: "POST", body: JSON.stringify(payload) });

export const submitSoyaBatch = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/soya-processing/batches", { method: "POST", body: JSON.stringify(payload) });

// Prospect Visits
export type ProspectVisitOutcome = "INTERESTED" | "NOT_INTERESTED" | "FOLLOW_UP_NEEDED" | "CONVERTED" | "NO_ANSWER";
export type ProspectVisitType    = "COLD_CALL" | "REFERRAL" | "FOLLOW_UP" | "DEMO" | "REACTIVATION";

export type ProspectVisit = {
  id: string;
  prospectName: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  visitType: ProspectVisitType;
  outcome: ProspectVisitOutcome;
  notes?: string;
  visitedAt: string;
};

export const submitProspectVisit = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<ProspectVisit>>("/sales/prospect-visits", { method: "POST", body: JSON.stringify(payload) });

export const fetchMyProspectVisits = (dateFrom?: string) =>
  apiFetch<ApiEnvelope<ProspectVisit[]>>(`/sales/prospect-visits/my?limit=50${dateFrom ? `&dateFrom=${dateFrom}` : ""}`);

// Attendance (self check-in)
export const submitAttendanceMe = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/hr/attendance/me", { method: "POST", body: JSON.stringify(payload) });

// Quality
export type QualityOptItem = { id: string; name: string; code?: string };
export type QualityOptionsResponse = {
  data: {
    templates: (QualityOptItem & { checkType: string })[];
    farms: QualityOptItem[];
    warehouses: QualityOptItem[];
    productionSites: QualityOptItem[];
    branches: QualityOptItem[];
    suppliers: QualityOptItem[];
    users: { id: string; fullName: string }[];
  };
};
export const fetchQualityOptions = () =>
  apiFetch<QualityOptionsResponse>("/quality/options");

export type PoultryOptions = {
  data: {
    farms:   { id: string; code: string; name: string; branchId: string }[];
    houses:  { id: string; code: string; name: string; farmId: string }[];
    pens:    { id: string; code: string; name: string; penNumber: number; poultryHouseId: string; farmId: string; capacity: number | null }[];
    batches: { id: string; code: string; name: string; farmId: string; birdType: string }[];
  };
};
export const fetchPoultryOptions = () =>
  apiFetch<PoultryOptions>("/poultry/options");

export const submitHealthObservation = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/health-observations", { method: "POST", body: JSON.stringify(payload) });

export const submitBirdWeightRecord = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/bird-weight-records", { method: "POST", body: JSON.stringify(payload) });

export const submitCorrectiveAction = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/quality/corrective-actions", { method: "POST", body: JSON.stringify(payload) });

export const submitLabReport = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/quality/lab-reports", { method: "POST", body: JSON.stringify(payload) });

export const submitQualityCheck = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<{ id: string }>>("/quality/checks", { method: "POST", body: JSON.stringify(payload) });

export const passQualityCheck = (id: string, payload: { notes?: string; overallScore?: number }) =>
  apiFetch<ApiEnvelope<unknown>>(`/quality/checks/${id}/pass`, { method: "PATCH", body: JSON.stringify(payload) });

export const failQualityCheck = (id: string, payload: { reason: string; notes?: string; overallScore?: number }) =>
  apiFetch<ApiEnvelope<unknown>>(`/quality/checks/${id}/fail`, { method: "PATCH", body: JSON.stringify(payload) });

export const conditionalPassQualityCheck = (id: string, payload: { conditions: string; notes?: string; overallScore?: number }) =>
  apiFetch<ApiEnvelope<unknown>>(`/quality/checks/${id}/conditional-pass`, { method: "PATCH", body: JSON.stringify(payload) });

// Production
export const fetchProductionOrders = () =>
  apiFetch<ApiEnvelope<{ id: string; orderNumber: string; productionSiteId: string; status: string }[]>>(
    "/feed-production/orders?limit=50"
  );

export const submitProductionRecord = (payload: SubmitProductionRecord) =>
  apiFetch<ApiEnvelope<unknown>>("/feed-production/batches", { method: "POST", body: JSON.stringify(payload) });

// Notifications
export const fetchNotifications = (params?: string) =>
  apiFetch<ApiEnvelope<{ data: Notification[]; total: number }>>(`/notifications${params ? `?${params}` : ""}`);

export const markNotificationRead = (id: string) =>
  apiFetch<ApiEnvelope<unknown>>(`/notifications/${id}/read`, { method: "PATCH" });

export const markAllNotificationsRead = () =>
  apiFetch<ApiEnvelope<unknown>>("/notifications/mark-all-read", { method: "PATCH" });

export const fetchUnreadNotificationCount = () =>
  apiFetch<ApiEnvelope<{ count: number }>>("/notifications/unread-count");

// QR / Barcode
export type QrScanResult = {
  id: string;
  entityType: string;
  entityId: string;
  label: string;
  payload: string;
  barcodeValue: string;
  status: string;
  scannedAt: string;
  details: Record<string, unknown>;
};

export const scanQrCode = (code: string) =>
  apiFetch<ApiEnvelope<QrScanResult>>("/qr/scan", { method: "POST", body: JSON.stringify({ code }) });

// Finance
export type FinanceOption = { id: string; name: string; code?: string; bankName?: string };
export type FinanceOptions = {
  data: {
    branches: FinanceOption[];
    bankAccounts: (FinanceOption & { bankName: string; accountType: string })[];
    expenseCategories: FinanceOption[];
    accounts: FinanceOption[];
  };
};
export type ExpenseRecord = {
  id: string;
  reference: string;
  description: string;
  amount: number;
  expenseDate: string;
  status: string;
  vendorName?: string;
  category?: { name: string };
  branch?: { name: string };
};

export const fetchFinanceOptions = () =>
  apiFetch<FinanceOptions>("/finance/options");

export const submitExpense = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/finance/expenses", { method: "POST", body: JSON.stringify(payload) });

export const fetchExpenses = () =>
  apiFetch<ApiEnvelope<ExpenseRecord[]>>("/finance/expenses?limit=50");

export const submitCustomerPayment = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/finance/customer-payments", { method: "POST", body: JSON.stringify(payload) });

// Procurement
export type ProcurementOptions = {
  data: {
    branches: { id: string; name: string; code: string }[];
    warehouses: { id: string; name: string; code: string }[];
    suppliers: { id: string; name: string; code: string }[];
    bankAccounts: { id: string; accountName: string; bankName: string }[];
  };
};
export type PurchaseOrderListItem = {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  expectedDelivery?: string;
  supplier: { name: string; code: string };
  _count: { items: number; grnRecords: number };
};
export type PurchaseOrderDetail = PurchaseOrderListItem & {
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    receivedQty: number;
    unitCost: number;
    uomCode: string;
    productId?: string;
  }>;
};

export const fetchProcurementOptions = () =>
  apiFetch<ProcurementOptions>("/procurement/options");

// Inventory (extended)
export type InventoryOption = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
};
export type InventoryItemOption = {
  id: string;
  quantityOnHand: number;
  product: { id: string; sku: string; name: string };
  warehouse: { code: string; name: string };
  warehouseId: string;
};
export type InventoryOptions = {
  data: {
    warehouses: InventoryOption[];
    products: InventoryOption[];
    items: InventoryItemOption[];
  };
};
export type LowStockAlert = {
  id: string;
  sku: string;
  product: string;
  warehouse: string;
  quantityOnHand: number;
  reorderLevel: number;
};
export type ExpiryAlert = {
  id: string;
  daysToExpiry: number;
  expiryDate: string;
  status: string;
  product: { name: string; sku: string };
  warehouse: { name: string };
  stockBatch: { batchNumber: string; quantityRemaining: number } | null;
};

export const fetchInventoryOptions = () =>
  apiFetch<InventoryOptions>("/inventory/options");

export const fetchLowStockAlerts = () =>
  apiFetch<ApiEnvelope<LowStockAlert[]>>("/inventory/low-stock");

export const fetchExpiryAlerts = () =>
  apiFetch<ApiEnvelope<ExpiryAlert[]>>("/inventory/expiry-alerts");

export const submitStockAdjustment = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/inventory/adjustments", { method: "POST", body: JSON.stringify(payload) });

export const submitStockTransfer = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/inventory/transfers", { method: "POST", body: JSON.stringify(payload) });

// Returns all recent POs; screen filters to open statuses client-side
export const fetchOpenPurchaseOrders = () =>
  apiFetch<ApiEnvelope<PurchaseOrderListItem[]>>("/procurement/purchase-orders");

export const fetchPurchaseOrderDetail = (id: string) =>
  apiFetch<ApiEnvelope<PurchaseOrderDetail>>(`/procurement/purchase-orders/${id}`);

export const submitGRN = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/procurement/grns", { method: "POST", body: JSON.stringify(payload) });

// Manager Views
export type FinanceDashboardData = {
  data: {
    totalRevenue:           number;
    totalExpenses:          number;
    netProfit:              number;
    totalCustomerPayments:  number;
    pendingApprovals:       number;
    bankAccounts:           { id: string; accountName: string; bankName: string; currentBalance: number }[];
    recentExpenses:         { id: string; reference: string; description: string; amount: number; expenseDate: string; status: string; category?: { name: string } }[];
    recentRevenue:          { id: string; amount: number; revenueDate: string; description?: string }[];
  };
};
export const fetchFinanceDashboard = () =>
  apiFetch<FinanceDashboardData>("/finance/dashboard");

export type DebtorItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  dueDate?: string;
  customer: { name: string; code: string };
};
export const fetchDebtors = () =>
  apiFetch<ApiEnvelope<DebtorItem[]>>("/finance/debtors");

export type EmployeeItem = {
  id: string;
  code: string;
  fullName: string;
  phone?: string;
  email?: string;
  status: string;
  employeeRole?: { name: string; code: string };
  branch?: { name: string };
  farm?: { name: string };
};
export const fetchEmployees = () =>
  apiFetch<ApiEnvelope<EmployeeItem[]>>("/hr/employees?limit=200");

export type AttendanceEntry = {
  id: string;
  date: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  isLate?: boolean;
  employee: { fullName: string; code: string };
  shift?: { name: string; startTime: string; endTime: string } | null;
};
export const fetchTodayAttendance = () => {
  const today = new Date().toISOString().split("T")[0];
  return apiFetch<ApiEnvelope<AttendanceEntry[]>>(`/hr/attendance?dateFrom=${today}&dateTo=${today}`);
};

// Maintenance
export type MaintenanceAsset = { id: string; code: string; name: string; branchId: string; machineId?: string };
export type MaintenanceOptions = {
  data: {
    branches:        { id: string; code: string; name: string }[];
    machines:        MaintenanceAsset[];
    equipment:       MaintenanceAsset[];
    technicians:     { id: string; fullName: string; email: string }[];
  };
};
export type MaintenanceScheduleItem = {
  id: string;
  scheduleNumber: string;
  title: string;
  maintenanceType: string;
  priority: string;
  nextDueDate: string;
  frequencyDays: number;
  lastCompletedAt?: string;
  status: string;
  machine?:    { id: string; code: string; name: string } | null;
  equipment?:  { id: string; code: string; name: string } | null;
};

export const fetchMaintenanceOptions = () =>
  apiFetch<MaintenanceOptions>("/maintenance/options");

export const fetchMaintenanceSchedules = () =>
  apiFetch<ApiEnvelope<MaintenanceScheduleItem[]>>("/maintenance/schedules");

export const submitBreakdown = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/maintenance/breakdowns", { method: "POST", body: JSON.stringify(payload) });

export const submitMaintenanceRecord = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/maintenance/records", { method: "POST", body: JSON.stringify(payload) });

// Dashboard
export const fetchDashboardSummary = () =>
  apiFetch<ApiEnvelope<Record<string, unknown>>>("/dashboard/summary");

export type DutyItem = {
  id: string;
  title: string;
  description: string;
  icon: string;
  screen: string;
  slot: "MORNING" | "EVENING" | "ANYTIME";
  count: number;
  doneToday: boolean;
};

export type MyDutiesResponse = {
  data: {
    date: string;
    duties: DutyItem[];
    summary: { total: number; done: number; pending: number };
  };
};

export const fetchMyDuties = () =>
  apiFetch<MyDutiesResponse>("/dashboard/my-duties");

// Offline Sync
export type SyncBatchItem = {
  localId: string;
  endpoint: string;
  method: string;
  module: string;
  payload: Record<string, unknown>;
};

export type SyncBatchItemResult = {
  localId: string;
  status: "synced" | "duplicate" | "failed";
  recordId?: string;
  error?: string;
};

export type SyncBatchResponse = {
  data: {
    results: SyncBatchItemResult[];
    synced: number;
    duplicates: number;
    failed: number;
  };
};

export const postBatchSync = (records: SyncBatchItem[]) =>
  apiFetch<SyncBatchResponse>("/sync/batch", { method: "POST", body: JSON.stringify({ records }) });

export const fetchAdminSyncRecords = (params?: string) =>
  apiFetch<ApiEnvelope<{ data: MobileSyncRecord[]; total: number }>>(`/sync/records${params ? `?${params}` : ""}`);

export const fetchSyncStats = () =>
  apiFetch<ApiEnvelope<{ total: number; synced: number; failed: number; duplicates: number }>>("/sync/stats");

export const retrySyncRecord = (localId: string) =>
  apiFetch<ApiEnvelope<SyncBatchItemResult>>(`/sync/records/${encodeURIComponent(localId)}/retry`, { method: "POST" });

export type MobileSyncRecord = {
  id: string;
  localId: string;
  module: string;
  endpoint: string;
  method: string;
  recordId?: string;
  status: "SYNCED" | "DUPLICATE" | "FAILED";
  errorMsg?: string;
  syncedAt: string;
  user?: { id: string; fullName: string; email: string };
};

// Types
export type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  assignedTo?: { fullName: string };
  farm?: { name: string };
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: "UNREAD" | "READ";
  createdAt: string;
};
