import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";

// Root
export type RootStackParams = {
  Login: undefined;
  App: undefined;
};

// Bottom tabs
export type TabParams = {
  HomeTab:      undefined;
  RecordsTab:   undefined;
  ApprovalsTab: undefined;
  TasksTab:     undefined;
  MoreTab:      undefined;
};

// Records stack
export type RecordsStackParams = {
  RecordsHome: undefined;
  DailyPoultry: undefined;
  Mortality: undefined;
  EggCollection: undefined;
  FeedConsumption: undefined;
  Medication: undefined;
  Vaccination: undefined;
  StockMovement: undefined;
  SalesOrder: undefined;
  ProductionRecord: undefined;
  SoyaProcessing: undefined;
  AttendanceCheckIn: undefined;
  ProspectVisit: undefined;
  QualityCheck: undefined;
  HiproPredict: undefined;
  StockAdjustment: undefined;
  StockAlerts: undefined;
  StockTransfer: undefined;
  BreakdownReport: undefined;
  MaintenanceTasks: undefined;
  MaintenanceLog: { scheduleId?: string; machineId?: string; equipmentId?: string; assetName: string; maintenanceType?: string };
  HealthObservation: undefined;
  BirdWeight: undefined;
  CorrectiveAction: undefined;
  LabReport: undefined;
  FinanceMobile: undefined;
  DebtorList: undefined;
  EmployeeDirectory: undefined;
  ShiftView: undefined;
  FeedProductionBatch: undefined;
  SoyaBatch: undefined;
  PlanningDashboard: undefined;
  ExpenseNew: undefined;
  ExpenseList: undefined;
  PaymentCollect: undefined;
  PurchaseOrderList: undefined;
  GrnCreate: { poId: string; poRef: string; supplierName: string };
  Scanner: undefined;
  ScanResult: { result: import("../api/endpoints").QrScanResult };
  // Phase 3 — Procurement
  ProcurementDashboard: undefined;
  PurchaseRequestList: undefined;
  PurchaseRequestCreate: undefined;
  // Phase 3 — Feed Production Orders
  FeedProductionOrderList: undefined;
  FeedProductionOrderCreate: undefined;
  FeedProductionOrderDetail: { orderId: string };
  FeedFormulaList: undefined;
  FeedFormulaDetail: { formulaId: string };
  // Phase 4 — Sales
  SalesDashboard: undefined;
  CustomerList: undefined;
  CustomerDetail: { customerId: string; customerName: string };
  SalesOrderHistory: undefined;
  // Phase 4 — HR
  LeaveRequest: undefined;
  LeaveStatus: undefined;
  HRDashboard: undefined;
  // Phase 4 — Market Planning depth
  MarketTargetDetail: { targetId: string };
  MarketTargetCreate: undefined;
  // Phase 5 — Storefront Admin
  StorefrontDashboard: undefined;
  StorefrontOrders: undefined;
  StorefrontProducts: undefined;
  // Phase 5 — Inventory
  StockLevels: undefined;
  // Phase 5 — Finance
  IncomeEntry: undefined;
};

// Approvals stack (Phase 3 — new tab)
export type ApprovalsStackParams = {
  ApprovalsHome: undefined;
  ExpenseApprovalList: undefined;
  ExpenseApprovalDetail: { expenseId: string };
  PayrollApprovalList: undefined;
  ProcurementApprovalList: undefined;
  PurchaseOrderDetail: { poId: string };
};

// Tasks stack
export type TasksStackParams = {
  TaskList:   undefined;
  TaskUpdate: { taskId: string; taskTitle: string };
  TaskAssign: undefined;
};

// More stack
export type MoreStackParams = {
  MoreHome:        undefined;
  Dashboard:       undefined;
  SyncStatus:      undefined;
  Scanner:         undefined;
  ScanResult:      { result: import("../api/endpoints").QrScanResult };
  UserProfile:     undefined;
  ChangePassword:  undefined;
  Notifications:   undefined;
  // Phase 6 — AI + Reports + Payslips
  AiChat:          { sessionId?: string } | undefined;
  ReportsBrowser:  undefined;
  ReportResult:    { reportId: string; title: string };
  MyPayslips:      undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParams>    = NativeStackScreenProps<RootStackParams, T>;
export type TabScreenProps<T extends keyof TabParams>                = CompositeScreenProps<BottomTabScreenProps<TabParams, T>, NativeStackScreenProps<RootStackParams>>;
export type RecordsScreenProps<T extends keyof RecordsStackParams>   = NativeStackScreenProps<RecordsStackParams, T>;
export type ApprovalsScreenProps<T extends keyof ApprovalsStackParams> = NativeStackScreenProps<ApprovalsStackParams, T>;
export type TasksScreenProps<T extends keyof TasksStackParams>       = NativeStackScreenProps<TasksStackParams, T>;
export type MoreScreenProps<T extends keyof MoreStackParams>         = NativeStackScreenProps<MoreStackParams, T>;
