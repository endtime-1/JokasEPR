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

export const submitIncomeEntry = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/finance/revenue", { method: "POST", body: JSON.stringify(payload) });

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
export type TaskAssignment = {
  id: string;
  employee: { id: string; fullName: string; code?: string };
  assignedBy?: { fullName: string };
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  taskType?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  assignees?: { id: string; fullName: string; employeeRole?: { name: string } }[];
  assignedTo?: { fullName: string };
  assignedBy?: { fullName: string };
  assignments?: TaskAssignment[];
  farm?: { id: string; name: string };
  branch?: { id: string; name: string };
  productionSite?: { name: string };
};

export const fetchTask = (id: string) =>
  apiFetch<ApiEnvelope<Task>>(`/hr/tasks/${id}`);

export const fetchAllTasks = (params?: { status?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit)  qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch<ApiEnvelope<Task[]>>(`/hr/tasks${q ? `?${q}` : "?limit=100"}`);
};

export const submitCreateTask = (payload: {
  title: string;
  description?: string;
  taskType?: string;
  priority?: string;
  dueDate?: string;
  farmId?: string;
  branchId?: string;
  notes?: string;
  assigneeIds?: string[];
}) =>
  apiFetch<ApiEnvelope<Task>>("/hr/tasks", { method: "POST", body: JSON.stringify(payload) });

// Feed Production
export type FeedOption = { id: string; code: string; name: string; branchId?: string; productionSiteId?: string; farmId?: string; type?: string };
export type FeedFormula = { id: string; code: string; name: string; feedType: string; finishedProductId: string };
export type FeedOrder  = { id: string; orderNumber: string; status: string; scheduledDate: string; plannedQuantityKg: number; formula: { name: string; code: string } | null };
export type FeedProductionOptions = {
  data: {
    productionSites: FeedOption[];
    warehouses:      FeedOption[];
    rawMaterials:    FeedOption[];
    finishedFeeds:   FeedOption[];
    formulas:        FeedFormula[];
  };
};
export const fetchFeedProductionOptions = () => apiFetch<FeedProductionOptions>("/feed-production/options");
export const fetchOpenFeedOrders = () =>
  apiFetch<ApiEnvelope<FeedOrder[]>>("/feed-production/orders?limit=50");
export const submitFeedProductionBatch = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/feed-production/batches", { method: "POST", body: JSON.stringify(payload) });

// Market Planning
export type MarketTarget = {
  id: string;
  targetNumber?: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  notes?: string;
  items?: { id: string; targetQuantityKg: number; product?: { name: string; sku: string } | null }[];
};
export type PlanningDashboardData = {
  data: {
    targets:         MarketTarget[];
    targetStats:     { status: string; count: number }[];
    planStats:       { status: string; count: number }[];
  };
};
export const fetchPlanningDashboard = () => apiFetch<PlanningDashboardData>("/market-planning/dashboard");
export const fetchMarketTargets    = () => apiFetch<ApiEnvelope<MarketTarget[]>>("/market-planning/targets?limit=20");

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: "UNREAD" | "READ";
  createdAt: string;
};

// ── Finance Approvals ────────────────────────────────────────────────────────
export type ExpenseDetailRecord = ExpenseRecord & {
  notes?: string;
  receiptUrl?: string;
  vendorName?: string;
  requestedBy?: { fullName: string; code: string };
  approvedBy?: { fullName: string } | null;
};

export type PayrollRun = {
  id: string;
  reference: string;
  period: string;
  status: string;
  totalAmount: number;
  employeeCount: number;
  processedAt?: string;
  approvedAt?: string;
};

export const fetchPendingExpenses = () =>
  apiFetch<ApiEnvelope<ExpenseRecord[]>>("/finance/expenses?status=PENDING_APPROVAL&limit=50");

export const fetchExpenseDetail = (id: string) =>
  apiFetch<ApiEnvelope<ExpenseDetailRecord>>(`/finance/expenses/${id}`);

export const approveExpense = (id: string, payload?: { notes?: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/finance/expenses/${id}/approve`, { method: "PATCH", body: JSON.stringify(payload ?? {}) });

export const rejectExpense = (id: string, payload: { reason: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/finance/expenses/${id}/reject`, { method: "PATCH", body: JSON.stringify(payload) });

export const fetchPayrollRuns = () =>
  apiFetch<ApiEnvelope<PayrollRun[]>>("/finance/payroll?limit=20");

export const approvePayroll = (id: string) =>
  apiFetch<ApiEnvelope<unknown>>(`/finance/payroll/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });

// ── Procurement (manager flow) ───────────────────────────────────────────────
export type ProcurementDashboardData = {
  data: {
    openPurchaseRequests: number;
    pendingPurchaseOrders: number;
    grnsThisMonth: number;
    totalSpendThisMonth: number;
    recentPurchaseOrders: PurchaseOrderListItem[];
  };
};

export type PurchaseRequestItem = {
  id: string;
  productName: string;
  quantity: number;
  unitCost?: number;
  uomCode?: string;
  notes?: string;
};

export type PurchaseRequest = {
  id: string;
  reference: string;
  status: string;
  requestDate: string;
  totalAmount?: number;
  notes?: string;
  requestedBy?: { fullName: string };
  supplier?: { id: string; name: string; code: string };
  items: PurchaseRequestItem[];
};

export const fetchProcurementDashboard = () =>
  apiFetch<ProcurementDashboardData>("/procurement/dashboard");

export const fetchPurchaseRequests = (status?: string) =>
  apiFetch<ApiEnvelope<PurchaseRequest[]>>(`/procurement/purchase-requests?limit=50${status ? `&status=${status}` : ""}`);

export const fetchPurchaseRequestDetail = (id: string) =>
  apiFetch<ApiEnvelope<PurchaseRequest>>(`/procurement/purchase-requests/${id}`);

export const submitPurchaseRequest = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/procurement/purchase-requests", { method: "POST", body: JSON.stringify(payload) });

export const approvePurchaseRequest = (id: string, payload?: { notes?: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/procurement/purchase-requests/${id}/approve`, { method: "PATCH", body: JSON.stringify(payload ?? {}) });

export const rejectPurchaseRequest = (id: string, payload: { reason: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/procurement/purchase-requests/${id}/reject`, { method: "PATCH", body: JSON.stringify(payload) });

export const approvePurchaseOrder = (id: string, payload?: { notes?: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/procurement/purchase-orders/${id}/approve`, { method: "PATCH", body: JSON.stringify(payload ?? {}) });

export const rejectPurchaseOrder = (id: string, payload: { reason: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/procurement/purchase-orders/${id}/reject`, { method: "PATCH", body: JSON.stringify(payload) });

// ── Feed Production (manager order flow) ─────────────────────────────────────
export type FeedFormulaIngredientDetail = {
  id: string;
  product: { id: string; name: string; sku: string };
  percentageInFormula: number;
  kgPerTonne: number;
  bagsPerTonne: number;
  unitCostGhs: number;
  totalCostGhs: number;
  uomCode: string;
  bagWeightKg: number;
};

export type FeedFormulaDetail = {
  id: string;
  code: string;
  name: string;
  feedType: string;
  isActive: boolean;
  targetBatchKg: number;
  finishedProduct: { name: string; sku: string } | null;
  ingredients: FeedFormulaIngredientDetail[];
  totalCostPerTonne: number;
  totalCostPerBatch: number;
  version?: number;
};

export type FeedProductionOrderFull = FeedOrder & {
  productionSite?: { name: string; code: string } | null;
  warehouse?: { name: string; code: string } | null;
  createdBy?: { fullName: string } | null;
  batches?: { id: string; batchNumber: string; producedQuantityKg: number; status: string; createdAt: string }[];
  formula?: { name: string; code: string; ingredients: { product: { name: string; sku: string }; kgPerTonne: number; requiredKg: number }[] } | null;
};

export const fetchFeedFormulas = () =>
  apiFetch<ApiEnvelope<FeedFormula[]>>("/feed-production/formulas?limit=100");

export const fetchFeedFormulaDetail = (id: string) =>
  apiFetch<ApiEnvelope<FeedFormulaDetail>>(`/feed-production/formulas/${id}`);

export const fetchFeedProductionOrderDetail = (id: string) =>
  apiFetch<ApiEnvelope<FeedProductionOrderFull>>(`/feed-production/orders/${id}`);

export const createFeedProductionOrder = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<{ id: string; orderNumber: string }>>("/feed-production/orders", { method: "POST", body: JSON.stringify(payload) });

export const approveFeedProductionOrder = (id: string) =>
  apiFetch<ApiEnvelope<unknown>>(`/feed-production/orders/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) });

// ── Profile & Auth ────────────────────────────────────────────────────────────
export type MyProfileData = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  code?: string;
  roles: string[];
  branch?: { id: string; name: string; code: string };
  farm?: { id: string; name: string; code: string };
  employeeRole?: { name: string; code: string };
};

export const fetchMyProfile = () =>
  apiFetch<ApiEnvelope<MyProfileData>>("/hr/employees/me");

export const updateMyProfile = (payload: { phone?: string }) =>
  apiFetch<ApiEnvelope<MyProfileData>>("/hr/employees/me", { method: "PATCH", body: JSON.stringify(payload) });

export const changePassword = (payload: { currentPassword: string; newPassword: string }) =>
  apiFetch<ApiEnvelope<unknown>>("/auth/change-password", { method: "POST", body: JSON.stringify(payload) });

// ── Sales (manager/visibility) ────────────────────────────────────────────────
export type SalesDashboardData = {
  data: {
    totalRevenue:       number;
    totalOrders:        number;
    paidOrders:         number;
    pendingOrders:      number;
    topCustomers:       { id: string; name: string; totalSpend: number }[];
    recentOrders:       SalesOrderListItem[];
  };
};

export type SalesOrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  customer: { id: string; name: string; code: string };
  _count?: { items: number };
};

export type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  phone?: string;
  email?: string;
  address?: string;
  totalOrders: number;
  totalSpend: number;
  outstandingBalance: number;
  recentOrders: SalesOrderListItem[];
};

export const fetchSalesDashboard = () =>
  apiFetch<SalesDashboardData>("/sales/dashboard");

export const fetchSalesOrders = (status?: string) =>
  apiFetch<ApiEnvelope<SalesOrderListItem[]>>(`/sales/orders?limit=50${status ? `&status=${status}` : ""}`);

export const fetchCustomerDetail = (id: string) =>
  apiFetch<ApiEnvelope<CustomerDetail>>(`/sales/customers/${id}`);

// ── HR (leave requests) ───────────────────────────────────────────────────────
export type LeaveType = "ANNUAL" | "SICK" | "MATERNITY" | "PATERNITY" | "COMPASSIONATE" | "UNPAID";

export type LeaveRequest = {
  id: string;
  reference?: string;
  leaveType: LeaveType | string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: string;
  reason?: string;
  reviewedBy?: { fullName: string } | null;
  reviewNote?: string;
  createdAt: string;
};

export type HRDashboardData = {
  data: {
    totalEmployees:    number;
    presentToday:      number;
    absentToday:       number;
    openLeaveRequests: number;
    attendanceRate:    number;
    recentLeaveRequests: LeaveRequest[];
  };
};

export const fetchMyLeaveRequests = () =>
  apiFetch<ApiEnvelope<LeaveRequest[]>>("/hr/leave-requests/my?limit=20");

export const submitLeaveRequest = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<LeaveRequest>>("/hr/leave-requests", { method: "POST", body: JSON.stringify(payload) });

export const fetchHRDashboard = () =>
  apiFetch<HRDashboardData>("/hr/dashboard");

// ── Market Planning (depth) ───────────────────────────────────────────────────
export type MarketTargetItem = {
  id: string;
  targetQuantityKg: number;
  achievedQuantityKg?: number;
  product?: { id: string; name: string; sku: string } | null;
};

export type MarketTargetFull = Omit<MarketTarget, "items"> & {
  items: MarketTargetItem[];
  createdBy?: { fullName: string } | null;
  approvedBy?: { fullName: string } | null;
};

export const fetchMarketTargetDetail = (id: string) =>
  apiFetch<ApiEnvelope<MarketTargetFull>>(`/market-planning/targets/${id}`);

export const submitMarketTarget = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<MarketTarget>>("/market-planning/targets", { method: "POST", body: JSON.stringify(payload) });

// ── Phase 5 — Storefront Admin ────────────────────────────────────────────────

export type StorefrontStats = {
  data: { published: number; pending: number; confirmed: number; delivered: number; total: number };
};

export type StorefrontOrderItem = { name: string; qty: number; unitPrice: number; total: number };
export type StorefrontOrder = {
  id: string;
  orderNumber: string;
  ref: string | null;
  status: string;
  statusLabel: string;
  orderDate: string;
  total: number;
  customer: { name: string | null; phone: string | null; email: string | null; address: string | null };
  notes: string | null;
  items: StorefrontOrderItem[];
};

export type StorefrontProduct = {
  id: string;
  name: string;
  sku: string;
  isPublic: boolean;
  publicSlug: string | null;
  publicDescription: string | null;
  storefrontCategory: string | null;
  minOrderQty: number;
  unitLabel: string | null;
  unitPrice: number | null;
};

export const fetchStorefrontStats   = () =>
  apiFetch<StorefrontStats>("/public/admin/stats");

export const fetchStorefrontOrders  = (status?: string, search?: string) => {
  const params = new URLSearchParams();
  if (status && status !== "ALL") params.set("status", status);
  if (search) params.set("search", search);
  const qs = params.toString();
  return apiFetch<ApiEnvelope<StorefrontOrder[]>>(`/public/admin/orders${qs ? `?${qs}` : ""}`);
};

export const updateStorefrontOrderStatus = (id: string, status: string) =>
  apiFetch<ApiEnvelope<unknown>>(`/public/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });

export const fetchStorefrontProducts = (search?: string) =>
  apiFetch<ApiEnvelope<StorefrontProduct[]>>(`/public/admin/products${search ? `?search=${encodeURIComponent(search)}` : ""}`);

export const updateStorefrontProduct = (id: string, payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<StorefrontProduct>>(`/public/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

// ── Phase 6 — AI Assistant ────────────────────────────────────────────────────

export type AiSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AiChatResponse = {
  data: {
    sessionId: string;
    reply: string;
    model: string;
  };
};

export type AiSessionDetail = {
  data: {
    session: AiSession;
    messages: AiMessage[];
  };
};

export const fetchAiSessions = () =>
  apiFetch<ApiEnvelope<AiSession[]>>("/ai/sessions");

export const fetchAiSession = (id: string) =>
  apiFetch<AiSessionDetail>(`/ai/sessions/${id}`);

export const deleteAiSession = (id: string) =>
  apiFetch<ApiEnvelope<unknown>>(`/ai/sessions/${id}`, { method: "DELETE" });

export const sendAiMessage = (message: string, sessionId?: string) =>
  apiFetch<AiChatResponse>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, sessionId }),
  });

// ── Phase 6 — Reports Browser ─────────────────────────────────────────────────

export type ReportColumn = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "date" | "percent";
};

export type ReportCatalogItem = {
  id: string;
  title: string;
  category: string;
  description: string;
};

export type ReportChart = {
  title: string;
  labels: string[];
  values: number[];
};

export type ReportRunResult = {
  data: {
    definition: ReportCatalogItem & { columns: ReportColumn[] };
    rows: Record<string, unknown>[];
    totals: Record<string, number>;
    chart?: ReportChart;
  };
};

export const fetchReportCatalog = () =>
  apiFetch<ApiEnvelope<ReportCatalogItem[]>>("/reports");

export const runReport = (id: string, params?: Record<string, string>) => {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiFetch<ReportRunResult>(`/reports/${id}${qs}`);
};

// ── Phase 6 — My Payslips ─────────────────────────────────────────────────────

export type PayslipRecord = {
  id: string;
  reference: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  employeeName: string;
  employeeCode?: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  grossPay: number;
  taxDeduction: number;
  ssnit: number;
  netPay: number;
  paymentDate?: string;
  paymentMethod?: string;
  status: string;
  notes?: string;
};

export const fetchMyPayslips = () =>
  apiFetch<ApiEnvelope<PayslipRecord[]>>("/hr/payroll/me");
