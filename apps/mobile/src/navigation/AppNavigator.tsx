import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSync } from "../hooks/useSync";
import { colors, font, radius, shadow } from "../constants/theme";
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
import { RecordsHomeScreen } from "../screens/RecordsHomeScreen";
import { TaskListScreen } from "../features/tasks/TaskListScreen";
import { TaskUpdateScreen } from "../features/tasks/TaskUpdateScreen";
import { NotificationsScreen } from "../features/notifications/NotificationsScreen";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { SyncStatusScreen } from "../screens/SyncStatusScreen";
import { MoreScreen } from "../screens/MoreScreen";
import type { RecordsStackParams, TabParams, TasksStackParams, MoreStackParams } from "./types";

const Tab = createBottomTabNavigator<TabParams>();
const RecordsStack = createNativeStackNavigator<RecordsStackParams>();
const TasksStack   = createNativeStackNavigator<TasksStackParams>();
const MoreStack    = createNativeStackNavigator<MoreStackParams>();

// Icon name maps — outline when inactive, solid when focused
const TAB_ICONS: Record<string, { default: keyof typeof Ionicons.glyphMap; focused: keyof typeof Ionicons.glyphMap }> = {
  HomeTab:          { default: "home-outline",          focused: "home"            },
  RecordsTab:       { default: "document-text-outline", focused: "document-text"   },
  TasksTab:         { default: "checkmark-circle-outline", focused: "checkmark-circle" },
  NotificationsTab: { default: "notifications-outline", focused: "notifications"   },
  MoreTab:          { default: "grid-outline",          focused: "grid"            },
};

type TabIconProps = {
  route: string;
  focused: boolean;
  color: string;
};

function TabIcon({ route, focused, color }: TabIconProps) {
  const icons = TAB_ICONS[route] ?? { default: "ellipsis-horizontal-outline", focused: "ellipsis-horizontal" };
  const name  = focused ? icons.focused : icons.default;
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <Ionicons name={name} size={22} color={focused ? colors.white : color} />
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
      <RecordsStack.Screen name="Scanner"         component={ScannerScreen}         options={{ title: "QR Scanner"      }} />
      <RecordsStack.Screen name="ScanResult"      component={ScanResultScreen}      options={{ title: "Scan Result"     }} />
    </RecordsStack.Navigator>
  );
}

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={stackOpts}>
      <TasksStack.Screen name="TaskList"   component={TaskListScreen}   options={{ title: "My Tasks"    }} />
      <TasksStack.Screen name="TaskUpdate" component={TaskUpdateScreen} options={{ title: "Update Task" }} />
    </TasksStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={stackOpts}>
      <MoreStack.Screen name="MoreHome"   component={MoreScreen}       options={{ title: "More"        }} />
      <MoreStack.Screen name="Dashboard"  component={DashboardScreen}  options={{ title: "Dashboard"   }} />
      <MoreStack.Screen name="SyncStatus" component={SyncStatusScreen} options={{ title: "Sync Status" }} />
      <MoreStack.Screen name="Scanner"    component={ScannerScreen}    options={{ title: "QR Scanner"  }} />
      <MoreStack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: "Scan Result" }} />
    </MoreStack.Navigator>
  );
}

const stackOpts = {
  headerTintColor: colors.brand,
  headerBackTitle: "Back",
  headerStyle: { backgroundColor: colors.bgCard },
  headerShadowVisible: true,
  headerTitleStyle: { fontWeight: font.weight.bold as any, color: colors.ink },
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

export function AppNavigator() {
  const { pending } = useSync();
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
      <Tab.Screen name="HomeTab"          component={HomeScreen}        options={{ title: "Home"        }} />
      <Tab.Screen name="RecordsTab"       component={RecordsNavigator}  options={{ title: "Records"     }} />
      <Tab.Screen name="TasksTab"         component={TasksNavigator}    options={{ title: "Tasks"       }} />
      <Tab.Screen name="NotificationsTab" component={NotificationsScreen} options={{ title: "Alerts"   }} />
      <Tab.Screen name="MoreTab"          component={MoreNavigator}     options={{ title: "More", tabBarBadge: pending > 0 ? pending : undefined }} />
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
