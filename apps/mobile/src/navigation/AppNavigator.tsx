import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StackActions } from "@react-navigation/native";
import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSync } from "../hooks/useSync";
import { colors, font, radius, shadow } from "../constants/theme";
import type { ComponentProps } from "react";
import { HomeScreen } from "../screens/HomeScreen";
import { DailyPoultryScreen } from "../features/poultry/DailyPoultryScreen";
import { MortalityScreen } from "../features/poultry/MortalityScreen";
import { EggCollectionScreen } from "../features/poultry/EggCollectionScreen";
import { FeedConsumptionScreen } from "../features/poultry/FeedConsumptionScreen";
import { MedicationScreen } from "../features/poultry/MedicationScreen";
import { VaccinationScreen } from "../features/poultry/VaccinationScreen";
import { StockMovementScreen } from "../features/inventory/StockMovementScreen";
import { SalesOrderScreen } from "../features/sales/SalesOrderScreen";
import { ProductionRecordScreen } from "../features/production/ProductionRecordScreen";
import { SoyaProcessingScreen } from "../features/soya/SoyaProcessingScreen";
import { AttendanceCheckInScreen } from "../features/hr/AttendanceCheckInScreen";
import { ProspectVisitScreen } from "../features/sales/ProspectVisitScreen";
import { QualityCheckScreen } from "../features/quality/QualityCheckScreen";
import { HiproPredictiveScreen } from "../features/feed/HiproPredictiveScreen";
import { ScannerScreen } from "../features/scanner/ScannerScreen";
import { ScanResultScreen } from "../features/scanner/ScanResultScreen";
import { ExpenseNewScreen } from "../features/finance/ExpenseNewScreen";
import { ExpenseListScreen } from "../features/finance/ExpenseListScreen";
import { PaymentCollectScreen } from "../features/finance/PaymentCollectScreen";
import { PurchaseOrderListScreen } from "../features/procurement/PurchaseOrderListScreen";
import { GrnCreateScreen } from "../features/procurement/GrnCreateScreen";
import { StockAdjustmentScreen } from "../features/inventory/StockAdjustmentScreen";
import { StockAlertsScreen } from "../features/inventory/StockAlertsScreen";
import { StockTransferScreen } from "../features/inventory/StockTransferScreen";
import { BreakdownReportScreen } from "../features/maintenance/BreakdownReportScreen";
import { MaintenanceTasksScreen } from "../features/maintenance/MaintenanceTasksScreen";
import { MaintenanceLogScreen } from "../features/maintenance/MaintenanceLogScreen";
import { HealthObservationScreen } from "../features/poultry/HealthObservationScreen";
import { BirdWeightScreen } from "../features/poultry/BirdWeightScreen";
import { CorrectiveActionScreen } from "../features/quality/CorrectiveActionScreen";
import { LabReportScreen } from "../features/quality/LabReportScreen";
import { FinanceMobileScreen } from "../features/manager/FinanceMobileScreen";
import { DebtorScreen } from "../features/manager/DebtorScreen";
import { EmployeeDirectoryScreen } from "../features/manager/EmployeeDirectoryScreen";
import { ShiftViewScreen } from "../features/manager/ShiftViewScreen";
import { FeedProductionBatchScreen } from "../features/feed/FeedProductionBatchScreen";
import { SoyaBatchScreen } from "../features/soya/SoyaBatchScreen";
import { PlanningDashboardScreen } from "../features/planning/PlanningDashboardScreen";
import { RecordsHomeScreen } from "../screens/RecordsHomeScreen";
import { TaskListScreen } from "../features/tasks/TaskListScreen";
import { TaskUpdateScreen } from "../features/tasks/TaskUpdateScreen";
import { TaskAssignScreen } from "../features/tasks/TaskAssignScreen";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { SyncStatusScreen } from "../screens/SyncStatusScreen";
import { MoreScreen } from "../screens/MoreScreen";
// Phase 3 — Approvals
import { ApprovalsHomeScreen } from "../features/approvals/ApprovalsHomeScreen";
import { ExpenseApprovalListScreen } from "../features/approvals/ExpenseApprovalListScreen";
import { ExpenseApprovalDetailScreen } from "../features/approvals/ExpenseApprovalDetailScreen";
import { PayrollApprovalScreen } from "../features/approvals/PayrollApprovalScreen";
import { ProcurementApprovalListScreen } from "../features/approvals/ProcurementApprovalListScreen";
import { PurchaseOrderDetailScreen } from "../features/approvals/PurchaseOrderDetailScreen";
// Phase 3 — Procurement Records
import { ProcurementDashboardScreen } from "../features/records/ProcurementDashboardScreen";
import { PurchaseRequestListScreen } from "../features/records/PurchaseRequestListScreen";
import { PurchaseRequestCreateScreen } from "../features/records/PurchaseRequestCreateScreen";
// Phase 3 — Feed Production Records
import { FeedProductionOrderListScreen } from "../features/records/FeedProductionOrderListScreen";
import { FeedProductionOrderCreateScreen } from "../features/records/FeedProductionOrderCreateScreen";
import { FeedProductionOrderDetailScreen } from "../features/records/FeedProductionOrderDetailScreen";
import { FeedFormulaListScreen } from "../features/records/FeedFormulaListScreen";
import { FeedFormulaDetailScreen } from "../features/records/FeedFormulaDetailScreen";
// Phase 4 — Settings / Profile
import { UserProfileScreen } from "../features/settings/UserProfileScreen";
import { ChangePasswordScreen } from "../features/settings/ChangePasswordScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
// Phase 4 — Sales Intelligence
import { SalesDashboardScreen } from "../features/sales/SalesDashboardScreen";
import { CustomerListScreen } from "../features/sales/CustomerListScreen";
import { CustomerDetailScreen } from "../features/sales/CustomerDetailScreen";
import { SalesOrderHistoryScreen } from "../features/sales/SalesOrderHistoryScreen";
// Phase 4 — HR Depth
import { LeaveRequestScreen } from "../features/hr/LeaveRequestScreen";
import { LeaveStatusScreen } from "../features/hr/LeaveStatusScreen";
import { HRDashboardScreen } from "../features/hr/HRDashboardScreen";
// Phase 4 — Market Planning Depth
import { MarketTargetDetailScreen } from "../features/planning/MarketTargetDetailScreen";
import { MarketTargetCreateScreen } from "../features/planning/MarketTargetCreateScreen";
// Phase 5 — Storefront Admin
import { StorefrontDashboardScreen } from "../features/storefront/StorefrontDashboardScreen";
import { StorefrontOrdersScreen } from "../features/storefront/StorefrontOrdersScreen";
import { StorefrontProductsScreen } from "../features/storefront/StorefrontProductsScreen";
// Phase 5 — Inventory & Finance
import { StockLevelsScreen } from "../features/inventory/StockLevelsScreen";
import { IncomeEntryScreen } from "../features/finance/IncomeEntryScreen";
// Phase 6 — AI + Reports + Payslips
import { AiChatScreen } from "../features/ai/AiChatScreen";
import { ReportsBrowserScreen } from "../features/reports/ReportsBrowserScreen";
import { ReportResultScreen } from "../features/reports/ReportResultScreen";
import { MyPayslipsScreen } from "../features/hr/MyPayslipsScreen";
import { useAuth } from "../auth/AuthContext";
import type { ApprovalsStackParams, RecordsStackParams, TabParams, TasksStackParams, MoreStackParams } from "./types";

const Tab = createBottomTabNavigator<TabParams>();
const RecordsStack   = createNativeStackNavigator<RecordsStackParams>();
const ApprovalsStack = createNativeStackNavigator<ApprovalsStackParams>();
const TasksStack     = createNativeStackNavigator<TasksStackParams>();
const MoreStack      = createNativeStackNavigator<MoreStackParams>();

type MCName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// outline when inactive, filled when focused
const TAB_ICONS: Record<string, { default: MCName; focused: MCName }> = {
  HomeTab:      { default: "home-outline",                   focused: "home"                    },
  RecordsTab:   { default: "file-document-outline",          focused: "file-document"           },
  ApprovalsTab: { default: "check-circle-outline",           focused: "check-circle"            },
  TasksTab:     { default: "checkbox-marked-circle-outline", focused: "checkbox-marked-circle"  },
  MoreTab:      { default: "dots-grid",                      focused: "view-grid"               },
};

type TabIconProps = { route: string; focused: boolean; color: string };

function TabIcon({ route, focused, color }: TabIconProps) {
  const icons = TAB_ICONS[route] ?? { default: "dots-horizontal", focused: "dots-horizontal" };
  const name  = focused ? icons.focused : icons.default;
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <MaterialCommunityIcons name={name} size={22} color={focused ? colors.white : color} />
      {focused && <View style={styles.focusDot} />}
    </View>
  );
}

function RecordsNavigator() {
  return (
    <RecordsStack.Navigator screenOptions={stackOpts}>
      <RecordsStack.Screen name="RecordsHome"     component={RecordsHomeScreen}     options={{ title: "Records"         }} />
      <RecordsStack.Screen name="DailyPoultry"    component={DailyPoultryScreen}    options={{ title: "Daily Record"    }} />
      <RecordsStack.Screen name="Mortality"       component={MortalityScreen}       options={{ title: "Mortality Entry" }} />
      <RecordsStack.Screen name="EggCollection"   component={EggCollectionScreen}   options={{ title: "Egg Collection"  }} />
      <RecordsStack.Screen name="FeedConsumption" component={FeedConsumptionScreen} options={{ title: "Feed Record"     }} />
      <RecordsStack.Screen name="Medication"      component={MedicationScreen}      options={{ title: "Medication"      }} />
      <RecordsStack.Screen name="Vaccination"     component={VaccinationScreen}     options={{ title: "Vaccination"     }} />
      <RecordsStack.Screen name="StockMovement"   component={StockMovementScreen}   options={{ title: "Stock Movement"  }} />
      <RecordsStack.Screen name="SalesOrder"      component={SalesOrderScreen}      options={{ title: "Sales Order"     }} />
      <RecordsStack.Screen name="ProductionRecord"  component={ProductionRecordScreen}  options={{ title: "Production"       }} />
      <RecordsStack.Screen name="SoyaProcessing"   component={SoyaProcessingScreen}    options={{ title: "Soya Processing"       }} />
      <RecordsStack.Screen name="AttendanceCheckIn" component={AttendanceCheckInScreen} options={{ title: "Attendance Check-In"  }} />
      <RecordsStack.Screen name="ProspectVisit"    component={ProspectVisitScreen}     options={{ title: "Prospect Visit"        }} />
      <RecordsStack.Screen name="QualityCheck"    component={QualityCheckScreen}      options={{ title: "Quality Inspection"   }} />
      <RecordsStack.Screen name="HiproPredict"    component={HiproPredictiveScreen}   options={{ title: "Feed Predictive"      }} />
      <RecordsStack.Screen name="HealthObservation"   component={HealthObservationScreen}  options={{ title: "Health Observation" }} />
      <RecordsStack.Screen name="BirdWeight"          component={BirdWeightScreen}          options={{ title: "Bird Weight"        }} />
      <RecordsStack.Screen name="CorrectiveAction"    component={CorrectiveActionScreen}    options={{ title: "Corrective Action"  }} />
      <RecordsStack.Screen name="LabReport"           component={LabReportScreen}           options={{ title: "Lab Report"         }} />
      <RecordsStack.Screen name="BreakdownReport"     component={BreakdownReportScreen}    options={{ title: "Report Breakdown"   }} />
      <RecordsStack.Screen name="MaintenanceTasks"   component={MaintenanceTasksScreen}   options={{ title: "Maintenance"        }} />
      <RecordsStack.Screen name="MaintenanceLog"     component={MaintenanceLogScreen}     options={{ title: "Log Work Done"      }} />
      <RecordsStack.Screen name="StockAdjustment"    component={StockAdjustmentScreen}    options={{ title: "Stock Adjustment"   }} />
      <RecordsStack.Screen name="StockAlerts"        component={StockAlertsScreen}        options={{ title: "Stock Alerts"       }} />
      <RecordsStack.Screen name="StockTransfer"      component={StockTransferScreen}      options={{ title: "Stock Transfer"     }} />
      <RecordsStack.Screen name="ExpenseNew"         component={ExpenseNewScreen}         options={{ title: "New Expense"        }} />
      <RecordsStack.Screen name="ExpenseList"        component={ExpenseListScreen}        options={{ title: "My Expenses"        }} />
      <RecordsStack.Screen name="PaymentCollect"     component={PaymentCollectScreen}     options={{ title: "Collect Payment"    }} />
      <RecordsStack.Screen name="PurchaseOrderList"  component={PurchaseOrderListScreen}  options={{ title: "Purchase Orders"    }} />
      <RecordsStack.Screen name="GrnCreate"          component={GrnCreateScreen}          options={{ title: "Receive Goods"      }} />
      <RecordsStack.Screen name="Scanner"            component={ScannerScreen}            options={{ title: "QR Scanner"         }} />
      <RecordsStack.Screen name="ScanResult"         component={ScanResultScreen}         options={{ title: "Scan Result"        }} />
      <RecordsStack.Screen name="FinanceMobile"      component={FinanceMobileScreen}      options={{ title: "Finance Overview"   }} />
      <RecordsStack.Screen name="DebtorList"         component={DebtorScreen}             options={{ title: "Debtors"            }} />
      <RecordsStack.Screen name="EmployeeDirectory"  component={EmployeeDirectoryScreen}  options={{ title: "Employees"          }} />
      <RecordsStack.Screen name="ShiftView"          component={ShiftViewScreen}          options={{ title: "Today's Attendance"    }} />
      <RecordsStack.Screen name="FeedProductionBatch" component={FeedProductionBatchScreen} options={{ title: "Feed Production Batch" }} />
      <RecordsStack.Screen name="SoyaBatch"           component={SoyaBatchScreen}           options={{ title: "Soya Processing Batch" }} />
      <RecordsStack.Screen name="PlanningDashboard"   component={PlanningDashboardScreen}   options={{ title: "Market Planning"       }} />
      {/* Phase 4 — Sales */}
      <RecordsStack.Screen name="SalesDashboard"    component={SalesDashboardScreen}    options={{ title: "Sales"            }} />
      <RecordsStack.Screen name="CustomerList"      component={CustomerListScreen}      options={{ title: "Customers"        }} />
      <RecordsStack.Screen name="CustomerDetail"    component={CustomerDetailScreen}    options={{ title: "Customer"         }} />
      <RecordsStack.Screen name="SalesOrderHistory" component={SalesOrderHistoryScreen} options={{ title: "Sales Orders"     }} />
      {/* Phase 4 — HR */}
      <RecordsStack.Screen name="LeaveRequest"      component={LeaveRequestScreen}      options={{ title: "Request Leave"    }} />
      <RecordsStack.Screen name="LeaveStatus"       component={LeaveStatusScreen}       options={{ title: "My Leave"         }} />
      <RecordsStack.Screen name="HRDashboard"       component={HRDashboardScreen}       options={{ title: "HR Overview"      }} />
      {/* Phase 4 — Market Planning depth */}
      <RecordsStack.Screen name="MarketTargetDetail" component={MarketTargetDetailScreen} options={{ title: "Target Detail"  }} />
      <RecordsStack.Screen name="MarketTargetCreate" component={MarketTargetCreateScreen} options={{ title: "New Target"     }} />
      {/* Phase 5 — Storefront Admin */}
      <RecordsStack.Screen name="StorefrontDashboard" component={StorefrontDashboardScreen} options={{ title: "Storefront"       }} />
      <RecordsStack.Screen name="StorefrontOrders"    component={StorefrontOrdersScreen}    options={{ title: "Online Orders"    }} />
      <RecordsStack.Screen name="StorefrontProducts"  component={StorefrontProductsScreen}  options={{ title: "Product Catalog"  }} />
      {/* Phase 5 — Inventory & Finance */}
      <RecordsStack.Screen name="StockLevels"  component={StockLevelsScreen}  options={{ title: "Stock Levels"  }} />
      <RecordsStack.Screen name="IncomeEntry"  component={IncomeEntryScreen}  options={{ title: "Record Income" }} />
      {/* Phase 3 — Procurement */}
      <RecordsStack.Screen name="ProcurementDashboard"  component={ProcurementDashboardScreen}  options={{ title: "Procurement"          }} />
      <RecordsStack.Screen name="PurchaseRequestList"   component={PurchaseRequestListScreen}   options={{ title: "Purchase Requests"    }} />
      <RecordsStack.Screen name="PurchaseRequestCreate" component={PurchaseRequestCreateScreen} options={{ title: "New Purchase Request" }} />
      {/* Phase 3 — Feed Production Orders */}
      <RecordsStack.Screen name="FeedProductionOrderList"   component={FeedProductionOrderListScreen}   options={{ title: "Production Orders"    }} />
      <RecordsStack.Screen name="FeedProductionOrderCreate" component={FeedProductionOrderCreateScreen} options={{ title: "New Production Order" }} />
      <RecordsStack.Screen name="FeedProductionOrderDetail" component={FeedProductionOrderDetailScreen} options={{ title: "Order Detail"          }} />
      <RecordsStack.Screen name="FeedFormulaList"           component={FeedFormulaListScreen}           options={{ title: "Feed Formulas"         }} />
      <RecordsStack.Screen name="FeedFormulaDetail"         component={FeedFormulaDetailScreen}         options={{ title: "Formula Detail"        }} />
    </RecordsStack.Navigator>
  );
}

function ApprovalsNavigator() {
  return (
    <ApprovalsStack.Navigator screenOptions={stackOpts}>
      <ApprovalsStack.Screen name="ApprovalsHome"          component={ApprovalsHomeScreen}           options={{ title: "Approvals"           }} />
      <ApprovalsStack.Screen name="ExpenseApprovalList"    component={ExpenseApprovalListScreen}     options={{ title: "Pending Expenses"    }} />
      <ApprovalsStack.Screen name="ExpenseApprovalDetail"  component={ExpenseApprovalDetailScreen}   options={{ title: "Expense Detail"      }} />
      <ApprovalsStack.Screen name="PayrollApprovalList"    component={PayrollApprovalScreen}         options={{ title: "Payroll Runs"        }} />
      <ApprovalsStack.Screen name="ProcurementApprovalList" component={ProcurementApprovalListScreen} options={{ title: "Procurement Approvals" }} />
      <ApprovalsStack.Screen name="PurchaseOrderDetail"    component={PurchaseOrderDetailScreen}     options={{ title: "Purchase Order"      }} />
    </ApprovalsStack.Navigator>
  );
}

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={stackOpts}>
      <TasksStack.Screen name="TaskList"   component={TaskListScreen}   options={{ title: "Tasks"       }} />
      <TasksStack.Screen name="TaskUpdate" component={TaskUpdateScreen} options={{ title: "Update Task" }} />
      <TasksStack.Screen name="TaskAssign" component={TaskAssignScreen} options={{ title: "Assign Task" }} />
    </TasksStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={stackOpts}>
      <MoreStack.Screen name="MoreHome"        component={MoreScreen}          options={{ title: "More"            }} />
      <MoreStack.Screen name="Dashboard"       component={DashboardScreen}     options={{ title: "Dashboard"       }} />
      <MoreStack.Screen name="SyncStatus"      component={SyncStatusScreen}    options={{ title: "Sync Status"     }} />
      <MoreStack.Screen name="Scanner"         component={ScannerScreen}       options={{ title: "QR Scanner"      }} />
      <MoreStack.Screen name="ScanResult"      component={ScanResultScreen}    options={{ title: "Scan Result"     }} />
      <MoreStack.Screen name="UserProfile"     component={UserProfileScreen}   options={{ title: "My Profile"      }} />
      <MoreStack.Screen name="ChangePassword"  component={ChangePasswordScreen} options={{ title: "Change Password" }} />
      <MoreStack.Screen name="Notifications"   component={NotificationsScreen}  options={{ title: "Notifications"  }} />
      {/* Phase 6 */}
      <MoreStack.Screen name="AiChat"          component={AiChatScreen}         options={{ title: "AI Assistant"   }} />
      <MoreStack.Screen name="ReportsBrowser"  component={ReportsBrowserScreen} options={{ title: "Reports"         }} />
      <MoreStack.Screen name="ReportResult"    component={ReportResultScreen}   options={({ route }) => ({ title: (route.params as { title: string }).title })} />
      <MoreStack.Screen name="MyPayslips"      component={MyPayslipsScreen}     options={{ title: "My Payslips"    }} />
    </MoreStack.Navigator>
  );
}

const stackOpts = {
  headerTintColor: colors.brand,
  headerBackTitle: "Back",
  headerStyle: { backgroundColor: colors.bgCard },
  headerShadowVisible: true,
  headerTitleStyle: { fontFamily: font.family.bold, color: colors.ink },
  headerBackTitleStyle: { fontFamily: font.family.regular },
};

// Mounts once when user is logged in. Triggers sync every time the app
// returns to the foreground so queued offline records are flushed promptly.
function AppStateSync() {
  const { sync } = useSync();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") sync();
    });
    return () => sub.remove();
  }, [sync]);
  return null;
}

const APPROVALS_ROLES = ["SUPER_ADMIN", "CEO", "MANAGER", "HR_MANAGER", "ADMIN", "OFFICER", "AUDITOR"];

export function AppNavigator() {
  const { pending } = useSync();
  const { user }    = useAuth();
  const canApprove  = user?.roles?.some((r) => APPROVALS_ROLES.includes(r)) ?? false;

  return (
    <>
      <AppStateSync />
      <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => (
          <TabIcon route={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkLight,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="HomeTab"    component={HomeScreen}       options={{ title: "Home"    }} />
      <Tab.Screen
        name="RecordsTab"
        component={RecordsNavigator}
        options={{ title: "Records" }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const state = navigation.getState();
            const recordsRoute = state?.routes?.find((r: any) => r.name === "RecordsTab");
            const stackKey = (recordsRoute as any)?.state?.key;
            const stackDepth: number = (recordsRoute as any)?.state?.routes?.length ?? 0;
            if (stackKey && stackDepth > 1) {
              // Only intercept when deep in the stack — pop to RecordsHome
              e.preventDefault();
              navigation.dispatch({ ...StackActions.popToTop(), target: stackKey });
              navigation.navigate("RecordsTab");
            }
            // depth ≤ 1: let default tab press handle it (mounts the navigator correctly)
          },
        })}
      />
      {canApprove && (
        <Tab.Screen name="ApprovalsTab" component={ApprovalsNavigator} options={{ title: "Approvals" }} />
      )}
      <Tab.Screen name="TasksTab" component={TasksNavigator} options={{ title: "Tasks" }} />
      <Tab.Screen name="MoreTab"  component={MoreNavigator}  options={{ title: "More", tabBarBadge: pending > 0 ? pending : undefined }} />
    </Tab.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 72,
    paddingBottom: 10,
    paddingTop: 6,
    ...shadow.md,
  },
  tabItem: {
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: font.weight.semibold as any,
    marginTop: 2,
  },

  // active icon pill
  iconWrap: {
    width: 44,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    position: "relative",
  },
  iconWrapFocused: {
    backgroundColor: colors.brand,
    ...shadow.brand,
  },
  focusDot: {
    position: "absolute",
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
});
