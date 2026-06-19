import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { colors, font, radius, spacing } from "../constants/theme";

type RecordItem = { icon: string; label: string; desc: string; screen: string; roles: string[] };

const RECORDS: RecordItem[] = [
  { icon: "🐔", label: "Daily Poultry Record", desc: "Population, performance metrics", screen: "DailyPoultry", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "💀", label: "Mortality Entry", desc: "Record bird deaths", screen: "Mortality", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "🥚", label: "Egg Collection", desc: "Daily egg counts by grade", screen: "EggCollection", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "🌾", label: "Feed Consumption", desc: "Feed given to flocks", screen: "FeedConsumption", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "💊", label: "Medication Record", desc: "Treatments administered", screen: "Medication", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "💉", label: "Vaccination Record", desc: "Vaccines administered", screen: "Vaccination", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "🏭", label: "Production Record", desc: "Feed mill / soya output", screen: "ProductionRecord", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "📦", label: "Stock Movement", desc: "Receive, issue, transfer stock", screen: "StockMovement", roles: ["OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "🧾", label: "Sales Order", desc: "Create a new sales order", screen: "SalesOrder", roles: ["OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] },
  { icon: "📷", label: "QR / Barcode Scanner", desc: "Scan items and assets", screen: "Scanner", roles: ["WORKER", "OFFICER", "MANAGER", "CEO", "SUPER_ADMIN"] }
];

export function RecordsHomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const userRoles = user?.roles ?? [];

  const available = RECORDS.filter((r) => r.roles.some((role) => userRoles.includes(role)));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>What would you like to record?</Text>
        {available.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.row}
            onPress={() => navigation.navigate(item.screen)}
            activeOpacity={0.8}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowDesc}>{item.desc}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },
  heading: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.inkMid, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  icon: { fontSize: 28 },
  rowInfo: { flex: 1, gap: 2 },
  rowLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  rowDesc: { fontSize: font.size.sm, color: colors.inkMid },
  chevron: { fontSize: 22, color: colors.inkLight }
});
