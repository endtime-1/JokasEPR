import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { Icon, type IconName } from "../components/Icon";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type RecordItem = {
  icon: IconName;
  label: string;
  desc: string;
  screen: string;
  roles: string[];
  permission?: string;
  color: string;
};

type Group = {
  title: string;
  icon: IconName;
  items: RecordItem[];
};

const GROUPS: Group[] = [
  {
    title: "Poultry Operations",
    icon: "bird",
    items: [
      { icon: "clipboard-list",   label: "Daily Poultry Record",  desc: "Population counts & performance metrics",     screen: "DailyPoultry",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
      { icon: "arrow-down-bold",  label: "Mortality Entry",        desc: "Record bird deaths and culling events",        screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444" },
      { icon: "egg",              label: "Egg Collection",         desc: "Daily egg counts by grade",                   screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706" },
      { icon: "barley",           label: "Feed Consumption",       desc: "Feed dispensed to flocks",                    screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
      { icon: "pill",             label: "Medication Record",      desc: "Treatments and dosages administered",         screen: "Medication",       roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "health.manage", color: "#8B5CF6" },
      { icon: "needle",           label: "Vaccination Record",     desc: "Vaccines administered to birds",              screen: "Vaccination",      roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "health.manage", color: "#06B6D4" },
      { icon: "heart-pulse",      label: "Health Observation",     desc: "Log a flock health or welfare concern",       screen: "HealthObservation",roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "health.manage", color: "#D97706" },
      { icon: "scale",            label: "Bird Weight Record",     desc: "Log body weight samples for growth check",    screen: "BirdWeight",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
    ],
  },
  {
    title: "Finance",
    icon: "cash",
    items: [
      { icon: "credit-card-minus",  label: "Log Expense",       desc: "Submit a business expense for approval",  screen: "ExpenseNew",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444" },
      { icon: "receipt",            label: "My Expenses",       desc: "View status of submitted expenses",       screen: "ExpenseList",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706" },
      { icon: "credit-card-check",  label: "Collect Payment",   desc: "Record a customer payment received",      screen: "PaymentCollect", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#10B981" },
      { icon: "cash-multiple",      label: "Record Income",     desc: "Log a revenue or income transaction",     screen: "IncomeEntry",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a" },
    ],
  },
  {
    title: "Procurement & Receiving",
    icon: "truck-delivery",
    items: [
      { icon: "view-dashboard-outline", label: "Procurement Dashboard",  desc: "KPIs, spend summary, recent purchase orders", screen: "ProcurementDashboard",  roles: ["MANAGER","CEO","SUPER_ADMIN"],          color: "#2563eb" },
      { icon: "file-document-outline",  label: "Purchase Requests",      desc: "Create and view purchase requests",          screen: "PurchaseRequestList",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
      { icon: "truck-delivery",         label: "Receive Goods (GRN)",    desc: "Log goods received against a purchase order",screen: "PurchaseOrderList",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
    ],
  },
  {
    title: "Inventory & Supply Chain",
    icon: "package-variant",
    items: [
      { icon: "package-variant-closed", label: "Stock Levels",    desc: "Browse current stock balances by product & warehouse", screen: "StockLevels",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb"   },
      { icon: "swap-horizontal",         label: "Stock Movement",   desc: "Receive, issue, or transfer stock",                    screen: "StockMovement",  roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706"   },
      { icon: "tune-variant",            label: "Stock Adjustment", desc: "Correct stock counts or write off losses",             screen: "StockAdjustment",roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706"   },
      { icon: "transfer",                label: "Stock Transfer",   desc: "Move stock between warehouses",                       screen: "StockTransfer",  roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6"   },
      { icon: "alert-rhombus",           label: "Stock Alerts",     desc: "Low stock & upcoming expiry warnings",                 screen: "StockAlerts",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444"   },
    ],
  },
  {
    title: "Sales",
    icon: "receipt",
    items: [
      { icon: "chart-line",          label: "Sales Dashboard",  desc: "Revenue, orders, top customers overview",    screen: "SalesDashboard",    roles: ["MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a" },
      { icon: "cart-plus",           label: "Sales Order",      desc: "Create a new customer sales order",          screen: "SalesOrder",        roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
      { icon: "format-list-bulleted", label: "Order History",   desc: "View and filter all sales orders",           screen: "SalesOrderHistory", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
      { icon: "account-group",       label: "Customer Directory",desc: "Search and view customer profiles",         screen: "CustomerList",      roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
      { icon: "map-marker-plus",     label: "Prospect Visit",   desc: "Log a field visit with GPS location",        screen: "ProspectVisit",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706" },
    ],
  },
  {
    title: "Storefront",
    icon: "storefront-outline",
    items: [
      { icon: "shopping",              label: "Storefront Dashboard", desc: "Online orders overview — pending, confirmed, delivered", screen: "StorefrontDashboard", roles: ["MANAGER","CEO","SUPER_ADMIN"], color: colors.brand },
      { icon: "format-list-bulleted",  label: "Manage Orders",        desc: "Confirm, deliver or cancel customer orders",             screen: "StorefrontOrders",    roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#d97706"    },
      { icon: "package-variant",       label: "Product Catalog",      desc: "Publish or hide products on the storefront",             screen: "StorefrontProducts",  roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a"    },
    ],
  },
  {
    title: "Production",
    icon: "factory",
    items: [
      { icon: "factory",                label: "Production Record",        desc: "Log feed mill batch output",                    screen: "ProductionRecord",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6"    },
      { icon: "cog-play",               label: "Feed Production Batch",    desc: "Record batch against a production order",        screen: "FeedProductionBatch",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: colors.brand },
      { icon: "format-list-numbered",   label: "Production Orders",        desc: "Create and track feed production orders",        screen: "FeedProductionOrderList", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706"    },
      { icon: "flask-outline",          label: "Feed Formulas",            desc: "Browse formula ingredients, kg/tonne, costs",    screen: "FeedFormulaList",         roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a"    },
      { icon: "calculator-variant",     label: "Feed Predictive (HiPro)", desc: "AI-driven feed cost and ratio predictor",        screen: "HiproPredict",            roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: colors.brand },
      { icon: "seed",                   label: "Soya Processing",          desc: "Log bean intake or processing batch",            screen: "SoyaProcessing",          roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#D97706"    },
      { icon: "seed-outline",           label: "Soya Processing Batch",    desc: "Record soya processing with oil/cake output",    screen: "SoyaBatch",               roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#D97706"    },
    ],
  },
  {
    title: "Quality",
    icon: "shield-check",
    items: [
      { icon: "magnify-scan", label: "Quality Inspection", desc: "Log a new quality check with verdict",         screen: "QualityCheck",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "quality.manage", color: "#8B5CF6" },
      { icon: "check-circle", label: "Corrective Action",  desc: "Log a corrective action for a quality issue",  screen: "CorrectiveAction", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "quality.manage", color: "#10B981" },
      { icon: "test-tube",    label: "Lab Report",         desc: "Submit external lab analysis results",          screen: "LabReport",        roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], permission: "quality.manage", color: "#3B82F6" },
    ],
  },
  {
    title: "Maintenance",
    icon: "wrench",
    items: [
      { icon: "calendar-clock",  label: "Maintenance Schedule", desc: "View upcoming tasks and log work done",  screen: "MaintenanceTasks", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6" },
      { icon: "clipboard-check", label: "Log Work Done",        desc: "Record completed maintenance work",      screen: "MaintenanceLog",   roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
      { icon: "alert-circle",    label: "Report Breakdown",     desc: "Log a machine or equipment failure",     screen: "BreakdownReport",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444" },
    ],
  },
  {
    title: "HR",
    icon: "account-group",
    items: [
      { icon: "view-dashboard-outline",  label: "HR Overview",         desc: "Headcount, attendance rate, leave summary",   screen: "HRDashboard",      roles: ["MANAGER","CEO","SUPER_ADMIN"],           color: "#2563eb" },
      { icon: "account-clock",           label: "Attendance Check-In", desc: "Log your attendance for today",               screen: "AttendanceCheckIn",roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6" },
      { icon: "calendar-plus",           label: "Request Leave",       desc: "Submit a leave request for approval",         screen: "LeaveRequest",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "calendar-account",        label: "My Leave Requests",   desc: "Track status of your leave applications",     screen: "LeaveStatus",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
    ],
  },
  {
    title: "Manager Views",
    icon: "chart-bar",
    items: [
      { icon: "chart-line",         label: "Finance Overview",     desc: "Revenue, expenses, net profit & bank balances", screen: "FinanceMobile",     roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#10B981" },
      { icon: "account-arrow-right",label: "Debtors",              desc: "Outstanding customer invoices & balances",      screen: "DebtorList",        roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444" },
      { icon: "account-multiple",   label: "Employee Directory",   desc: "Search staff by name, code, or role",           screen: "EmployeeDirectory", roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6" },
      { icon: "calendar-today",     label: "Today's Attendance",   desc: "Attendance summary and check-in status",        screen: "ShiftView",         roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#8B5CF6" },
    ],
  },
  {
    title: "Planning",
    icon: "bullseye-arrow",
    items: [
      { icon: "bullseye-arrow",     label: "Market Planning",    desc: "View production targets and approval status", screen: "PlanningDashboard",   roles: ["MANAGER","CEO","SUPER_ADMIN"], color: colors.brand },
      { icon: "bullseye",           label: "Create Market Target",desc: "Set new volume targets for a period",        screen: "MarketTargetCreate",  roles: ["MANAGER","CEO","SUPER_ADMIN"], color: colors.brand },
    ],
  },
  {
    title: "Tools",
    icon: "tools",
    items: [
      { icon: "qrcode-scan", label: "QR / Barcode Scanner", desc: "Scan and look up assets or stock items", screen: "Scanner", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#8B5CF6" },
    ],
  },
];

export function RecordsHomeScreen() {
  const { user }     = useAuth();
  const navigation   = useNavigation<any>();
  const userRoles    = (user?.roles ?? []).map((r) => r.toUpperCase());
  const userPerms    = user?.permissions ?? [];

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) =>
      item.roles.some((r) => userRoles.includes(r)) &&
      (item.permission ? userPerms.includes(item.permission) : true)
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Page Header ── */}
        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color={colors.brand} />
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Module Directory</Text>
            <Text style={styles.pageSub}>Select an operation module to log data</Text>
          </View>
        </View>

        {/* ── Group Blocks ── */}
        {visibleGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            {/* Elegant Sub-Header */}
            <View style={styles.groupHeader}>
              <View style={styles.groupIconWrap}>
                <Icon name={group.icon} size={15} color={colors.inkMid} />
              </View>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.groupLine} />
            </View>

            {/* Float Card wrapping items */}
            <View style={styles.groupCard}>
              {group.items.map((item, idx) => (
                <View key={item.screen}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate(item.screen)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.iconBg, { backgroundColor: item.color + "12" }]}>
                      <Icon name={item.icon} size={22} color={item.color} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowDesc}>{item.desc}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkLight} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },

  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  pageIconWrap:   {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },

  group:       { gap: spacing.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupIconWrap:{ width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  groupTitle:  {
    fontSize: font.size.xs,
    fontFamily: font.family.bold,
    color: colors.inkMid,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  groupLine: { flex: 1, height: 1, backgroundColor: colors.border },

  groupCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 44 + spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconBg:   { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowText:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  rowDesc:  { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
