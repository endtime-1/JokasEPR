import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { colors, font } from "../constants/theme";
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
const TasksStack = createNativeStackNavigator<TasksStackParams>();
const MoreStack = createNativeStackNavigator<MoreStackParams>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{name}</Text>;
}

function RecordsNavigator() {
  return (
    <RecordsStack.Navigator screenOptions={{ headerTintColor: colors.brand, headerBackTitle: "Back" }}>
      <RecordsStack.Screen name="RecordsHome" component={RecordsHomeScreen} options={{ title: "Records" }} />
      <RecordsStack.Screen name="DailyPoultry" component={DailyPoultryScreen} options={{ title: "Daily Record" }} />
      <RecordsStack.Screen name="Mortality" component={MortalityScreen} options={{ title: "Mortality Entry" }} />
      <RecordsStack.Screen name="EggCollection" component={EggCollectionScreen} options={{ title: "Egg Collection" }} />
      <RecordsStack.Screen name="FeedConsumption" component={FeedConsumptionScreen} options={{ title: "Feed Consumption" }} />
      <RecordsStack.Screen name="Medication" component={MedicationScreen} options={{ title: "Medication" }} />
      <RecordsStack.Screen name="Vaccination" component={VaccinationScreen} options={{ title: "Vaccination" }} />
      <RecordsStack.Screen name="StockMovement" component={StockMovementScreen} options={{ title: "Stock Movement" }} />
      <RecordsStack.Screen name="SalesOrder" component={SalesOrderScreen} options={{ title: "Sales Order" }} />
      <RecordsStack.Screen name="ProductionRecord" component={ProductionRecordScreen} options={{ title: "Production Record" }} />
      <RecordsStack.Screen name="Scanner" component={ScannerScreen} options={{ title: "QR Scanner" }} />
      <RecordsStack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: "Scan Result" }} />
    </RecordsStack.Navigator>
  );
}

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={{ headerTintColor: colors.brand, headerBackTitle: "Back" }}>
      <TasksStack.Screen name="TaskList" component={TaskListScreen} options={{ title: "My Tasks" }} />
      <TasksStack.Screen name="TaskUpdate" component={TaskUpdateScreen} options={{ title: "Update Task" }} />
    </TasksStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerTintColor: colors.brand, headerBackTitle: "Back" }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ title: "More" }} />
      <MoreStack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard" }} />
      <MoreStack.Screen name="SyncStatus" component={SyncStatusScreen} options={{ title: "Sync Status" }} />
      <MoreStack.Screen name="Scanner" component={ScannerScreen} options={{ title: "QR Scanner" }} />
      <MoreStack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: "Scan Result" }} />
    </MoreStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkLight,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.medium }
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: "Home", tabBarIcon: ({ focused }) => <TabIcon name="🏠" focused={focused} /> }}
      />
      <Tab.Screen
        name="RecordsTab"
        component={RecordsNavigator}
        options={{ title: "Records", tabBarIcon: ({ focused }) => <TabIcon name="📝" focused={focused} /> }}
      />
      <Tab.Screen
        name="TasksTab"
        component={TasksNavigator}
        options={{ title: "Tasks", tabBarIcon: ({ focused }) => <TabIcon name="✅" focused={focused} /> }}
      />
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsScreen}
        options={{ title: "Alerts", tabBarIcon: ({ focused }) => <TabIcon name="🔔" focused={focused} /> }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreNavigator}
        options={{ title: "More", tabBarIcon: ({ focused }) => <TabIcon name="⋯" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
