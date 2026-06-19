import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchDashboardSummary, fetchPlatformSummary } from "../../api/endpoints";
import { Card } from "../../components/Card";
import { colors, font, spacing } from "../../constants/theme";

type Metric = { label: string; value: string; icon: string; color?: string };

function MetricCard({ label, value, icon, color }: Metric) {
  return (
    <Card style={[styles.metricCard, color ? { borderLeftWidth: 3, borderLeftColor: color } : null]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export function DashboardScreen() {
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [dashRes, platRes] = await Promise.allSettled([
        fetchDashboardSummary(),
        fetchPlatformSummary()
      ]);
      if (dashRes.status === "fulfilled") setSummary(dashRes.value.data as Record<string, unknown>);
      if (platRes.status === "fulfilled") setPlatform(platRes.value.data as Record<string, unknown>);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const platformMetrics: Metric[] = [
    { label: "Farms", value: String(platform.farms ?? "-"), icon: "🐔", color: colors.brand },
    { label: "Warehouses", value: String(platform.warehouses ?? "-"), icon: "🏠", color: "#8b5cf6" },
    { label: "Users", value: String(platform.users ?? "-"), icon: "👥", color: "#0891b2" },
    { label: "Branches", value: String(platform.branches ?? "-"), icon: "🏢", color: "#d97706" }
  ];

  // Map common dashboard summary keys
  const dash = summary as Record<string, any>;
  const summaryMetrics: Metric[] = [];
  if (dash.totalRevenue !== undefined) summaryMetrics.push({ label: "Revenue (GHS)", value: Number(dash.totalRevenue).toLocaleString("en-GH", { maximumFractionDigits: 0 }), icon: "💰", color: colors.success });
  if (dash.openOrders !== undefined) summaryMetrics.push({ label: "Open Orders", value: String(dash.openOrders), icon: "🧾", color: colors.brand });
  if (dash.totalBirds !== undefined) summaryMetrics.push({ label: "Total Birds", value: Number(dash.totalBirds).toLocaleString(), icon: "🐔", color: "#16a34a" });
  if (dash.pendingAlerts !== undefined) summaryMetrics.push({ label: "Pending Alerts", value: String(dash.pendingAlerts), icon: "⚠️", color: colors.warning });

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.dateLabel}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Text>

        {summaryMetrics.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Business Overview</Text>
            <View style={styles.grid}>
              {summaryMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>Operations</Text>
        <View style={styles.grid}>
          {platformMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
        </View>

        {summaryMetrics.length === 0 && (
          <Card style={styles.noDataCard}>
            <Text style={styles.noDataText}>Dashboard data will appear here once your ERP has activity. Pull to refresh.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  dateLabel: { fontSize: font.size.sm, color: colors.inkMid, fontWeight: font.weight.medium },
  sectionLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.inkMid, textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCard: { width: "47%", gap: spacing.xs, alignItems: "flex-start" },
  metricIcon: { fontSize: 24 },
  metricValue: { fontSize: font.size.xxl, fontWeight: font.weight.bold, color: colors.ink },
  metricLabel: { fontSize: font.size.sm, color: colors.inkMid },
  noDataCard: { backgroundColor: colors.brandLight, borderColor: colors.brand + "40" },
  noDataText: { fontSize: font.size.sm, color: colors.inkMid, lineHeight: 20 }
});
