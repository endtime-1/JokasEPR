import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type MenuItem = {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  badge?: string;
  danger?: boolean;
  color?: string;
};

function MenuRow({ icon, label, description, onPress, badge, danger, color }: MenuItem) {
  const iconBg = danger ? "#fef2f2" : color ? color + "18" : colors.brandLight;
  const iconColor = danger ? "#dc2626" : color ?? colors.brand;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuRow}>
        <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>
          <Text style={styles.menuIcon}>{icon}</Text>
        </View>
        <View style={styles.menuText}>
          <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
          {description && <Text style={styles.menuDesc}>{description}</Text>}
        </View>
        {badge ? (
          <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{badge}</Text></View>
        ) : (
          <Text style={styles.chevron}>›</Text>
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

  function confirmLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout }
    ]);
  }

  const initials = user?.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "??";
  const roleLabel = user?.roles?.[0]?.replace(/_/g, " ") ?? "—";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={styles.profileCard}>
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
        </View>

        {/* Management section */}
        <SectionHeader title="MANAGEMENT" />
        <View style={styles.menuCard}>
          <MenuRow
            icon="📊"
            label="Dashboard"
            description="Business overview and key metrics"
            onPress={() => navigation.navigate("Dashboard")}
            color="#f58220"
          />
          <View style={styles.divider} />
          <MenuRow
            icon="🔄"
            label="Sync Status"
            description={syncing ? "Syncing…" : `${pending} pending record${pending !== 1 ? "s" : ""}`}
            onPress={() => navigation.navigate("SyncStatus")}
            badge={pending > 0 ? String(pending) : undefined}
            color="#4ade80"
          />
        </View>

        {/* Tools section */}
        <SectionHeader title="TOOLS" />
        <View style={styles.menuCard}>
          <MenuRow
            icon="📷"
            label="QR Scanner"
            description="Scan QR codes and barcodes"
            onPress={() => navigation.navigate("Scanner")}
            color="#a78bfa"
          />
        </View>

        {/* Account section */}
        <SectionHeader title="ACCOUNT" />
        <View style={styles.menuCard}>
          <MenuRow
            icon="🚪"
            label="Log Out"
            onPress={confirmLogout}
            danger
          />
        </View>

        <Text style={styles.version}>AKOKO SOLUTIONS ERP · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },

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
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.brand
  },
  avatarText: { color: colors.white, fontSize: font.size.xl, fontWeight: font.weight.bold },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  profileEmail: { fontSize: font.size.sm, color: colors.inkLight },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginTop: 2
  },
  rolePillText: { fontSize: font.size.xs, color: colors.brand, fontWeight: font.weight.bold },

  sectionLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.inkLight,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs
  },
  menuCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
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
  menuIcon: { fontSize: 20 },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  menuLabelDanger: { color: "#dc2626" },
  menuDesc: { fontSize: font.size.xs, color: colors.inkLight },
  chevron: { fontSize: 22, color: colors.inkLight, fontWeight: "300" },
  menuBadge: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    minWidth: 22,
    alignItems: "center"
  },
  menuBadgeText: { color: colors.white, fontSize: font.size.xs, fontWeight: font.weight.bold },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 40 + spacing.md },
  version: { fontSize: font.size.xs, color: colors.inkLight, textAlign: "center", marginTop: spacing.lg }
});
