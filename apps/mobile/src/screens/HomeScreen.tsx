import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { colors, font, radius, spacing } from "../constants/theme";

type QuickAction = { id: string; icon: string; label: string; screen: string; roles: string[] };

const ALL_ACTIONS: QuickAction[] = [
  { id: "daily", icon: "🐔", label: "Daily Record", screen: "DailyPoultry", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "mortality", icon: "💀", label: "Mortality", screen: "Mortality", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "eggs", icon: "🥚", label: "Egg Collection", screen: "EggCollection", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "feed", icon: "🌾", label: "Feed Consumption", screen: "FeedConsumption", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "medication", icon: "💊", label: "Medication", screen: "Medication", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "vaccination", icon: "💉", label: "Vaccination", screen: "Vaccination", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "stock", icon: "📦", label: "Stock Movement", screen: "StockMovement", roles: ["OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "sales", icon: "🧾", label: "Sales Order", screen: "SalesOrder", roles: ["OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "production", icon: "🏭", label: "Production Record", screen: "ProductionRecord", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "scanner", icon: "📷", label: "QR Scanner", screen: "Scanner", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "dashboard", icon: "📊", label: "Dashboard", screen: "Dashboard", roles: ["MANAGER", "CEO", "SUPER_ADMIN"] },
  { id: "tasks", icon: "✅", label: "My Tasks", screen: "TaskList", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] }
];

const ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CEO: "CEO",
  MANAGER: "Manager",
  OFFICER: "Officer",
  WORKER: "Worker",
  AUDITOR: "Auditor"
};

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const userRoles = user?.roles ?? [];
  const topRole = userRoles[0] ?? "WORKER";

  const actions = ALL_ACTIONS.filter((a) =>
    a.roles.some((r) => userRoles.includes(r))
  );

  function navigate(screen: string) {
    if (["Dashboard"].includes(screen)) {
      navigation.navigate("MoreTab", { screen });
    } else if (["TaskList"].includes(screen)) {
      navigation.navigate("TasksTab", { screen });
    } else {
      navigation.navigate("RecordsTab", { screen });
    }
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{user?.fullName?.split(" ")[0] ?? "User"}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{ROLE_NAMES[topRole] ?? topRole}</Text>
          </View>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.tile}
              onPress={() => navigate(action.screen)}
              activeOpacity={0.75}
            >
              <Text style={styles.tileIcon}>{action.icon}</Text>
              <Text style={styles.tileLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Farm info */}
        {(user?.farmIds?.length ?? 0) > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Assigned Farms</Text>
            <Text style={styles.infoValue}>{user!.farmIds.length} farm{user!.farmIds.length !== 1 ? "s" : ""}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  greeting: { fontSize: font.size.sm, color: colors.inkMid },
  name: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.ink },
  rolePill: {
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full
  },
  roleText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },
  sectionTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    color: colors.inkMid,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  tile: {
    width: "30%",
    aspectRatio: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.sm
  },
  tileIcon: { fontSize: 28 },
  tileLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.ink,
    textAlign: "center"
  },
  infoCard: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  infoTitle: { fontSize: font.size.sm, color: colors.brand, fontWeight: font.weight.medium },
  infoValue: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.brand }
});
