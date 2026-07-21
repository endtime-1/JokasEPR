import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type MenuItem = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  description?: string;
  onPress: () => void;
  badge?: string;
  danger?: boolean;
  color?: string;
};

function MenuRow({ icon, label, description, onPress, badge, danger, color }: MenuItem) {
  const iconBg = danger ? colors.errorBg : color ? color + "12" : colors.brandLight;
  const iconColor = danger ? colors.error : color ?? colors.brand;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuRow}>
        <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>
          <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.menuText}>
          <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
          {description && <Text style={styles.menuDesc}>{description}</Text>}
        </View>
        {badge ? (
          <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{badge}</Text></View>
        ) : (
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkLight} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { pending, syncing } = useSync();

  const EXEC_ROLES = ["SUPER_ADMIN", "CEO", "MANAGER", "AUDITOR"];
  const canViewExecutive =
    (user?.roles?.some((r) => EXEC_ROLES.includes(r.toUpperCase())) ?? false) ||
    (user?.permissions?.includes("executive.read") ?? false);

  function confirmLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out of your Jokas ERP account?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout }
    ]);
  }

  const ROLE_DISPLAY: Record<string, string> = {
    SUPER_ADMIN: "Super Admin", CEO: "CEO / Owner", MANAGER: "General Manager",
    OFFICER: "Field Officer", WORKER: "Farm Worker", AUDITOR: "Auditor",
    HR_MANAGER: "HR Manager", ADMIN: "Admin",
  };
  const initials = user?.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";
  const roleLabel = ROLE_DISPLAY[user?.roles?.[0] ?? ""] ?? (user?.roles?.[0]?.replace(/_/g, " ") ?? "User");

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Profile Card — tappable */}
        <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate("UserProfile")} activeOpacity={0.8}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.fullName ?? "User"}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? ""}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{roleLabel}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkLight} />
        </TouchableOpacity>

        {/* Management section — Dashboard only for executive roles */}
        <SectionHeader title="MANAGEMENT" />
        <View style={styles.menuCard}>
          {canViewExecutive && (
            <>
              <MenuRow
                icon="chart-areaspline"
                label="Dashboard"
                description="Business overview and key metrics"
                onPress={() => navigation.navigate("Dashboard")}
                color={colors.brand}
              />
              <View style={styles.divider} />
            </>
          )}
          <MenuRow
            icon="sync"
            label="Sync Status"
            description={syncing ? "Synchronizing database…" : `${pending} offline record${pending !== 1 ? "s" : ""} pending`}
            onPress={() => navigation.navigate("SyncStatus")}
            badge={pending > 0 ? String(pending) : undefined}
            color="#10B981"
          />
        </View>

        {/* Tools section */}
        <SectionHeader title="TOOLS" />
        <View style={styles.menuCard}>
          {canViewExecutive && (
            <>
              <MenuRow
                icon="robot-excited-outline"
                label="AI Assistant"
                description="Ask questions about your farm data and operations"
                onPress={() => navigation.navigate("AiChat")}
                color={colors.brand}
              />
              <View style={styles.divider} />
              <MenuRow
                icon="chart-bar"
                label="Reports"
                description="Browse and run business intelligence reports"
                onPress={() => navigation.navigate("ReportsBrowser")}
                color="#0284c7"
              />
              <View style={styles.divider} />
            </>
          )}
          <MenuRow
            icon="bell-outline"
            label="Notifications"
            description="View alerts and system notifications"
            onPress={() => navigation.navigate("Notifications")}
            color="#2563eb"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="qrcode-scan"
            label="QR Scanner"
            description="Scan QR codes and product barcodes"
            onPress={() => navigation.navigate("Scanner")}
            color="#8B5CF6"
          />
        </View>

        {/* Account section */}
        <SectionHeader title="ACCOUNT" />
        <View style={styles.menuCard}>
          <MenuRow
            icon="account-circle-outline"
            label="My Profile"
            description="View and update your contact info"
            onPress={() => navigation.navigate("UserProfile")}
            color={colors.brand}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="file-account-outline"
            label="My Payslips"
            description="View your salary and payment history"
            onPress={() => navigation.navigate("MyPayslips")}
            color="#16a34a"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="lock-reset"
            label="Change Password"
            description="Update your account password"
            onPress={() => navigation.navigate("ChangePassword")}
            color="#7c3aed"
          />
        </View>

        {/* Standalone Log Out button — always visible for all roles */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.8}>
          <MaterialCommunityIcons name="logout-variant" size={20} color="#fff" />
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>AKOKO SOLUTIONS ERP · v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadow.md
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.brand
  },
  avatarText: { color: colors.white, fontSize: font.size.xl - 1, fontFamily: font.family.bold },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: font.size.lg - 1, fontFamily: font.family.bold, color: colors.ink },
  profileEmail: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.medium },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.brandMid,
  },
  rolePillText: { fontSize: 11, color: colors.brand, fontFamily: font.family.bold },

  sectionLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bold,
    color: colors.inkLight,
    letterSpacing: 1.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs
  },
  menuCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm
  },
  menuRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  menuLabelDanger: { color: colors.error },
  menuDesc: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  menuBadge: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    minWidth: 24,
    alignItems: "center"
  },
  menuBadgeText: { color: colors.white, fontSize: 11, fontFamily: font.family.bold },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 40 + spacing.md },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radius.xl,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.xs,
    ...shadow.md,
  },
  logoutBtnText: {
    fontSize: font.size.md,
    fontFamily: font.family.bold,
    color: "#fff",
  },

  version: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.bold, textAlign: "center", marginTop: spacing.xxl }
});
