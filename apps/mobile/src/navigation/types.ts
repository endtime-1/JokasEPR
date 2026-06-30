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
  HomeTab: undefined;
  RecordsTab: undefined;
  TasksTab: undefined;
  NotificationsTab: undefined;
  MoreTab: undefined;
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
  ExpenseNew: undefined;
  ExpenseList: undefined;
  PaymentCollect: undefined;
  PurchaseOrderList: undefined;
  GrnCreate: { poId: string; poRef: string; supplierName: string };
  Scanner: undefined;
  ScanResult: { result: import("../api/endpoints").QrScanResult };
};

// Tasks stack
export type TasksStackParams = {
  TaskList: undefined;
  TaskUpdate: { taskId: string; taskTitle: string };
};

// More stack
export type MoreStackParams = {
  MoreHome: undefined;
  Dashboard: undefined;
  SyncStatus: undefined;
  Scanner: undefined;
  ScanResult: { result: import("../api/endpoints").QrScanResult };
};

export type RootStackScreenProps<T extends keyof RootStackParams> = NativeStackScreenProps<RootStackParams, T>;
export type TabScreenProps<T extends keyof TabParams> = CompositeScreenProps<BottomTabScreenProps<TabParams, T>, NativeStackScreenProps<RootStackParams>>;
export type RecordsScreenProps<T extends keyof RecordsStackParams> = NativeStackScreenProps<RecordsStackParams, T>;
export type TasksScreenProps<T extends keyof TasksStackParams> = NativeStackScreenProps<TasksStackParams, T>;
export type MoreScreenProps<T extends keyof MoreStackParams> = NativeStackScreenProps<MoreStackParams, T>;
