import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
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
      { icon: "clipboard-list",   label: "Daily Poultry Record",  desc: "Population counts & performance metrics",     screen: "DailyPoultry",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
      { icon: "arrow-down-bold",  label: "Mortality Entry",        desc: "Record bird deaths and culling events",        screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626" },
      { icon: "egg",              label: "Egg Collection",         desc: "Daily egg counts by grade",                   screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "barley",           label: "Feed Consumption",       desc: "Feed dispensed to flocks",                    screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
      { icon: "pill",             label: "Medication Record",      desc: "Treatments and dosages administered",         screen: "Medication",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
      { icon: "needle",           label: "Vaccination Record",     desc: "Vaccines administered to birds",              screen: "Vaccination",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#0891b2" },
      { icon: "heart-pulse",      label: "Health Observation",     desc: "Log a flock health or welfare concern",       screen: "HealthObservation",roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "scale",            label: "Bird Weight Record",     desc: "Log body weight samples for growth check",    screen: "BirdWeight",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
    ],
  },
  {
    title: "Finance",
    icon: "cash",
    items: [
      { icon: "credit-card-minus",  label: "Log Expense",       desc: "Submit a business expense for approval",  screen: "ExpenseNew",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626" },
      { icon: "receipt",            label: "My Expenses",       desc: "View status of submitted expenses",       screen: "ExpenseList",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "credit-card-check",  label: "Collect Payment",   desc: "Record a customer payment received",      screen: "PaymentCollect", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a" },
    ],
  },
  {
    title: "Procurement & Receiving",
    icon: "truck-delivery",
    items: [
      { icon: "truck-delivery", label: "Receive Goods (GRN)", desc: "Log goods received against a purchase order", screen: "PurchaseOrderList", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
    ],
  },
  {
    title: "Inventory & Supply Chain",
    icon: "package-variant",
    items: [
      { icon: "swap-horizontal", label: "Stock Movement",   desc: "Receive, issue, or transfer stock",         screen: "StockMovement",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "tune-variant",    label: "Stock Adjustment", desc: "Correct stock counts or write off losses",  screen: "StockAdjustment", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
      { icon: "transfer",        label: "Stock Transfer",   desc: "Move stock between warehouses",             screen: "StockTransfer",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
      { icon: "alert-rhombus",   label: "Stock Alerts",     desc: "Low stock & upcoming expiry warnings",      screen: "StockAlerts",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626" },
    ],
  },
  {
    title: "Sales",
    icon: "receipt",
    items: [
      { icon: "cart-plus",       label: "Sales Order",    desc: "Create a new customer sales order",         screen: "SalesOrder",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a" },
      { icon: "map-marker-plus", label: "Prospect Visit", desc: "Log a field visit with GPS location",       screen: "ProspectVisit", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706" },
    ],
  },
  {
    title: "Production",
    icon: "factory",
    items: [
      { icon: "factory",        label: "Production Record",      desc: "Log feed mill batch output",                 screen: "ProductionRecord",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
      { icon: "cog-play",       label: "Feed Production Batch",  desc: "Record batch against a production order",    screen: "FeedProductionBatch", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: colors.brand },
      { icon: "seed",           label: "Soya Processing",        desc: "Log bean intake or processing batch",        screen: "SoyaProcessing",      roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706" },
      { icon: "seed-outline",   label: "Soya Processing Batch",  desc: "Record soya processing with oil/cake output",screen: "SoyaBatch",           roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706" },
    ],
  },
  {
    title: "Quality",
    icon: "shield-check",
    items: [
      { icon: "magnify-scan", label: "Quality Inspection", desc: "Log a new quality check with verdict",         screen: "QualityCheck",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
      { icon: "check-circle", label: "Corrective Action",  desc: "Log a corrective action for a quality issue",  screen: "CorrectiveAction", roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
      { icon: "test-tube",    label: "Lab Report",         desc: "Submit external lab analysis results",          screen: "LabReport",        roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
    ],
  },
  {
    title: "Maintenance",
    icon: "wrench",
    items: [
      { icon: "calendar-clock",  label: "Maintenance Schedule", desc: "View upcoming tasks and log work done",  screen: "MaintenanceTasks", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
      { icon: "alert-circle",    label: "Report Breakdown",     desc: "Log a machine or equipment failure",     screen: "BreakdownReport",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626" },
    ],
  },
  {
    title: "HR",
    icon: "account-group",
    items: [
      { icon: "account-clock", label: "Attendance Check-In", desc: "Log your attendance for today", screen: "AttendanceCheckIn", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
    ],
  },
  {
    title: "Manager Views",
    icon: "chart-bar",
    items: [
      { icon: "chart-line",         label: "Finance Overview",     desc: "Revenue, expenses, net profit & bank balances", screen: "FinanceMobile",     roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a" },
      { icon: "account-arrow-right",label: "Debtors",              desc: "Outstanding customer invoices & balances",      screen: "DebtorList",        roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626" },
      { icon: "account-multiple",   label: "Employee Directory",   desc: "Search staff by name, code, or role",           screen: "EmployeeDirectory", roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
      { icon: "calendar-today",     label: "Today's Attendance",   desc: "Attendance summary and check-in status",        screen: "ShiftView",         roles: ["MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
    ],
  },
  {
    title: "Planning",
    icon: "bullseye-arrow",
    items: [
      { icon: "bullseye-arrow", label: "Market Planning", desc: "View production targets and approval status", screen: "PlanningDashboard", roles: ["MANAGER","CEO","SUPER_ADMIN"], color: colors.brand },
    ],
  },
  {
    title: "Tools",
    icon: "tools",
    items: [
      { icon: "qrcode-scan", label: "QR / Barcode Scanner", desc: "Scan and look up assets or stock items", screen: "Scanner", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
    ],
  },
];

export function RecordsHomeScreen() {
  const { user }     = useAuth();
  const navigation   = useNavigation<any>();
  const userRoles    = user?.roles ?? [];

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => item.roles.some((r) => userRoles.includes(r))),
  })).filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <Icon name="file-document" size={26} color={colors.brand} />
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Records</Text>
            <Text style={styles.pageSub}>Select a module to log data</Text>
          </View>
        </View>

        {visibleGroups.map((group) => (
          <View key={group.title} style={styles.group}>
            <View style={styles.groupHeader}>
              <View style={styles.groupIconWrap}>
                <Icon name={group.icon} size={14} color={colors.inkMid} />
              </View>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.groupLine} />
            </View>

            <View style={styles.groupCard}>
              {group.items.map((item, idx) => (
                <View key={item.screen}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate(item.screen)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.iconBg, { backgroundColor: item.color + "18" }]}>
                      <Icon name={item.icon} size={22} color={item.color} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowDesc}>{item.desc}</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={colors.inkLight} />
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
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },

  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  pageIconWrap:   { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },

  group:       { gap: spacing.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupIconWrap:{ width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  groupTitle:  {
    fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight,
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  groupLine: { flex: 1, height: 1, backgroundColor: colors.border },

  groupCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", ...shadow.sm,
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 44 + spacing.md },
  row: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.lg, gap: spacing.md,
  },
  iconBg:   { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  rowText:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  rowDesc:  { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
