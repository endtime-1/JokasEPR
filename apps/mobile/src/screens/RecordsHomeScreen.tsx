import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type RecordItem = {
  icon: string;
  label: string;
  desc: string;
  screen: string;
  roles: string[];
  color: string;
};

const GROUPS: { title: string; icon: string; items: RecordItem[] }[] = [
  {
    title: "Poultry Operations",
    icon: "🐔",
    items: [
      { icon: "📋", label: "Daily Poultry Record",  desc: "Population counts & performance metrics",  screen: "DailyPoultry",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#4ade80" },
      { icon: "📉", label: "Mortality Entry",        desc: "Record bird deaths and culling events",     screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#f87171" },
      { icon: "🥚", label: "Egg Collection",         desc: "Daily egg counts by grade",                screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fbbf24" },
      { icon: "🌾", label: "Feed Consumption",       desc: "Feed dispensed to flocks",                 screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#86efac" },
      { icon: "💊", label: "Medication Record",      desc: "Treatments and dosages administered",      screen: "Medication",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#a78bfa" },
      { icon: "💉", label: "Vaccination Record",     desc: "Vaccines administered to birds",           screen: "Vaccination",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#67e8f9" },
      { icon: "🏥", label: "Health Observation",     desc: "Log a flock health or welfare concern",    screen: "HealthObservation", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fbbf24" },
      { icon: "⚖️", label: "Bird Weight Record",     desc: "Log body weight samples for growth check", screen: "BirdWeight",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#34d399" },
    ],
  },
  {
    title: "Finance",
    icon: "💰",
    items: [
      { icon: "💸", label: "Log Expense",            desc: "Submit a business expense for approval",   screen: "ExpenseNew",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#f87171" },
      { icon: "📋", label: "My Expenses",            desc: "View status of submitted expenses",        screen: "ExpenseList",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fb923c" },
      { icon: "💳", label: "Collect Payment",        desc: "Record a customer payment received",       screen: "PaymentCollect",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#34d399" },
    ],
  },
  {
    title: "Procurement & Receiving",
    icon: "🚚",
    items: [
      { icon: "🚚", label: "Receive Goods (GRN)",    desc: "Log goods received against a purchase order", screen: "PurchaseOrderList", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],       color: "#60a5fa" },
    ],
  },
  {
    title: "Inventory & Supply Chain",
    icon: "📦",
    items: [
      { icon: "📦", label: "Stock Movement",         desc: "Receive, issue, or transfer stock",        screen: "StockMovement",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#fb923c" },
      { icon: "⚖️", label: "Stock Adjustment",       desc: "Correct stock counts or write off losses", screen: "StockAdjustment",  roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#f59e0b" },
      { icon: "🔄", label: "Stock Transfer",         desc: "Move stock between warehouses",            screen: "StockTransfer",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#60a5fa" },
      { icon: "⚠️", label: "Stock Alerts",           desc: "Low stock & upcoming expiry warnings",     screen: "StockAlerts",      roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#ef4444" },
    ],
  },
  {
    title: "Sales",
    icon: "🧾",
    items: [
      { icon: "🧾", label: "Sales Order",            desc: "Create a new customer sales order",        screen: "SalesOrder",       roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#34d399" },
      { icon: "📍", label: "Prospect Visit",         desc: "Log a field visit with GPS location",      screen: "ProspectVisit",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fbbf24" },
    ],
  },
  {
    title: "Production",
    icon: "🏭",
    items: [
      { icon: "🏭", label: "Production Record",      desc: "Log feed mill batch output",               screen: "ProductionRecord",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
      { icon: "⚙️", label: "Feed Production Batch",  desc: "Record batch against a production order",  screen: "FeedProductionBatch",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#f58220" },
      { icon: "🫘", label: "Soya Processing",        desc: "Log bean intake or processing batch",      screen: "SoyaProcessing",        roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#f59e0b" },
      { icon: "🫘", label: "Soya Processing Batch",  desc: "Record soya processing with oil/cake output", screen: "SoyaBatch",          roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706" },
    ],
  },
  {
    title: "Quality",
    icon: "🔬",
    items: [
      { icon: "🔬", label: "Quality Inspection",     desc: "Log a new quality check with verdict",     screen: "QualityCheck",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#818cf8" },
      { icon: "✅", label: "Corrective Action",      desc: "Log a corrective action for a quality issue", screen: "CorrectiveAction", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#34d399" },
      { icon: "🧪", label: "Lab Report",             desc: "Submit external lab analysis results",     screen: "LabReport",        roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#60a5fa" },
    ],
  },
  {
    title: "Maintenance",
    icon: "🔧",
    items: [
      { icon: "📅", label: "Maintenance Schedule",    desc: "View upcoming tasks and log work done",    screen: "MaintenanceTasks",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
      { icon: "🔧", label: "Report Breakdown",        desc: "Log a machine or equipment failure",       screen: "BreakdownReport",   roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#ef4444" },
    ],
  },
  {
    title: "HR",
    icon: "🗓️",
    items: [
      { icon: "🗓️", label: "Attendance Check-In",    desc: "Log your attendance for today",            screen: "AttendanceCheckIn", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
    ],
  },
  {
    title: "Manager Views",
    icon: "📊",
    items: [
      { icon: "📈", label: "Finance Overview",        desc: "Revenue, expenses, net profit & bank balances", screen: "FinanceMobile",      roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#34d399" },
      { icon: "⏳", label: "Debtors",                 desc: "Outstanding customer invoices & balances",      screen: "DebtorList",         roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#f87171" },
      { icon: "👥", label: "Employee Directory",      desc: "Search staff by name, code, or role",           screen: "EmployeeDirectory",  roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
      { icon: "🗓️", label: "Today's Attendance",     desc: "Attendance summary and check-in status",        screen: "ShiftView",          roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#a78bfa" },
    ],
  },
  {
    title: "Planning",
    icon: "🎯",
    items: [
      { icon: "🎯", label: "Market Planning",         desc: "View production targets and approval status",   screen: "PlanningDashboard",  roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#f58220" },
    ],
  },
  {
    title: "Tools",
    icon: "🛠️",
    items: [
      { icon: "📷", label: "QR / Barcode Scanner",   desc: "Scan and look up assets or stock items",   screen: "Scanner",          roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#c084fc" },
    ],
  },
];

export function RecordsHomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const userRoles = user?.roles ?? [];

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => item.roles.some((r) => userRoles.includes(r))),
  })).filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <Text style={styles.pageIcon}>📝</Text>
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Records</Text>
            <Text style={styles.pageSub}>Select a module to log data</Text>
          </View>
        </View>

        {visibleGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            {/* Group header */}
            <View style={styles.groupHeader}>
              <Text style={styles.groupIcon}>{group.icon}</Text>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.groupLine} />
            </View>

            {/* Items */}
            <View style={styles.groupCard}>
              {group.items.map((item, idx) => (
                <View key={item.screen}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate(item.screen)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.iconBg, { backgroundColor: item.color + "22" }]}>
                      <Text style={styles.icon}>{item.icon}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowDesc}>{item.desc}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
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
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  pageIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
    alignItems: "center",
    justifyContent: "center",
  },
  pageIcon: { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight },

  group: { gap: spacing.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupIcon: { fontSize: 16 },
  groupTitle: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.inkLight,
    letterSpacing: 1,
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
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 22 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  rowDesc: { fontSize: font.size.xs, color: colors.inkLight },
  chevron: { fontSize: 22, color: colors.inkLight, fontWeight: "300" },
});
