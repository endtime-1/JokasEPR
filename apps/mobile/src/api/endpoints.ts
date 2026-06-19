import { apiFetch } from "./client";

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

// Platform
export const fetchPlatformSummary = () =>
  apiFetch<ApiEnvelope<{ branches: number; farms: number; productionSites: number; warehouses: number; users: number }>>("/platform/summary");

export const fetchFarms = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; farmType: string }[]>>("/platform/farms?limit=200");

export const fetchWarehouses = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; warehouseType: string }[]>>("/platform/warehouses?limit=200");

// Poultry
export const fetchFlockBatches = (farmId?: string) =>
  apiFetch<ApiEnvelope<{ id: string; batchCode: string; farmId: string }[]>>(
    `/poultry/flock-batches?limit=100${farmId ? `&farmId=${farmId}` : ""}`
  );

export const submitDailyPoultryRecord = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/daily-records", { method: "POST", body: JSON.stringify(payload) });

export const submitMortality = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/mortality-records", { method: "POST", body: JSON.stringify(payload) });

export const submitEggProduction = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/egg-production-records", { method: "POST", body: JSON.stringify(payload) });

export const submitFeedConsumption = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/feed-consumption-records", { method: "POST", body: JSON.stringify(payload) });

export const submitMedication = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/medication-records", { method: "POST", body: JSON.stringify(payload) });

export const submitVaccination = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/poultry/vaccination-records", { method: "POST", body: JSON.stringify(payload) });

// Inventory
export const fetchInventoryItems = (warehouseId?: string) =>
  apiFetch<ApiEnvelope<{ id: string; product: { name: string; sku: string }; warehouseId: string }[]>>(
    `/inventory/items?limit=200${warehouseId ? `&warehouseId=${warehouseId}` : ""}`
  );

export const submitStockMovement = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/inventory/stock-movements", { method: "POST", body: JSON.stringify(payload) });

// Sales
export const fetchCustomers = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; customerCode: string }[]>>("/sales/customers?limit=200");

export const fetchProducts = () =>
  apiFetch<ApiEnvelope<{ id: string; name: string; sku: string; unitPrice: number }[]>>("/inventory/products?limit=200");

export const submitSalesOrder = (payload: Record<string, unknown>) =>
  apiFetch<ApiEnvelope<unknown>>("/sales/orders", { method: "POST", body: JSON.stringify(payload) });

// Tasks
export const fetchMyTasks = () =>
  apiFetch<ApiEnvelope<Task[]>>("/hr/tasks/my?limit=50");

export const updateTaskStatus = (id: string, payload: { status: string; notes?: string }) =>
  apiFetch<ApiEnvelope<unknown>>(`/hr/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) });

// Production
export const fetchProductionOrders = () =>
  apiFetch<ApiEnvelope<{ id: string; orderNumber: string; productionSiteId: string; status: string }[]>>(
    "/feed-production/orders?limit=50&status=IN_PROGRESS"
  );

export const submitProductionRecord = (payload: Record<string, unknown>) =>
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

// Dashboard
export const fetchDashboardSummary = () =>
  apiFetch<ApiEnvelope<Record<string, unknown>>>("/dashboard/summary");

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
