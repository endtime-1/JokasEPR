import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Card } from "../components/Card";
import { useAuth } from "../auth/AuthContext";
import { useSync } from "../hooks/useSync";
import { colors, font, radius, spacing } from "../constants/theme";

type MenuItem = {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  badge?: string;
  danger?: boolean;
};

function MenuRow({ icon, label, description, onPress, badge, danger }: MenuItem) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuRow}>
        <View style={[styles.menuIconWrap, danger && styles.menuIconDanger]}>
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

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { pending, syncing } = useSync();

  function confirmLogout() {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: logout }
      ]
    );
  }

  const roleLabel = user?.roles?.[0]?.replace(/_/g, " ") ?? "—";
  const initials = user?.fullName?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "??";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <Card style={styles.profileCard}>
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
        </Card>

        {/* Management */}
        <Text style={styles.sectionLabel}>Management</Text>
        <Card style={styles.menuCard} padded={false}>
          <MenuRow
            icon="📊"
            label="Dashboard"
            description="Business overview and key metrics"
            onPress={() => navigation.navigate("Dashboard")}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="🔄"
            label="Sync Status"
            description="View and manage offline submissions"
            onPress={() => navigation.navigate("SyncStatus")}
            badge={pending > 0 ? String(pending) : undefined}
          />
        </Card>

        {/* Tools */}
        <Text style={styles.sectionLabel}>Tools</Text>
        <Card style={styles.menuCard} padded={false}>
          <MenuRow
            icon="📷"
            label="Scanner"
            description="Scan QR codes and barcodes"
            onPress={() => navigation.navigate("Scanner")}
          />
        </Card>

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <Card style={styles.menuCard} padded={false}>
          <MenuRow
            icon="🚪"
            label="Log Out"
            onPress={confirmLogout}
            danger
          />
        </Card>

        <Text style={styles.version}>Jokas ERP Mobile · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  profileCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { color: "#fff", fontSize: font.size.xl, fontWeight: font.weight.bold },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  profileEmail: { fontSize: font.size.sm, color: colors.inkMid },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: 2
  },
  rolePillText: { fontSize: font.size.xs, color: colors.brand, fontWeight: font.weight.bold },
  sectionLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.inkMid,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.sm
  },
  menuCard: { overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center"
  },
  menuIconDanger: { backgroundColor: "#fef2f2" },
  menuIcon: { fontSize: 20 },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.ink },
  menuLabelDanger: { color: "#dc2626" },
  menuDesc: { fontSize: font.size.xs, color: colors.inkMid },
  chevron: { fontSize: font.size.xl, color: colors.inkLight },
  menuBadge: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    minWidth: 20,
    alignItems: "center"
  },
  menuBadgeText: { color: "#fff", fontSize: font.size.xs, fontWeight: font.weight.bold },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 36 + spacing.md },
  version: { fontSize: font.size.xs, color: colors.inkLight, textAlign: "center", marginTop: spacing.lg }
});
