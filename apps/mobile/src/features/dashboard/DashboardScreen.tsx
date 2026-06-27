import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { fetchDashboardSummary, fetchHiproPredictive, fetchPlatformSummary } from "../../api/endpoints";
import type { HiproPredictiveFormula } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Metric = { label: string; value: string; icon: string; color: string };

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [platform, setPlatform] = useState<Record<string, unknown>>({});
  const [feedFormulas, setFeedFormulas] = useState<HiproPredictiveFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [dashRes, platRes, feedRes] = await Promise.allSettled([
        fetchDashboardSummary(),
        fetchPlatformSummary(),
        fetchHiproPredictive(),
      ]);
      if (dashRes.status === "fulfilled") setSummary(dashRes.value.data as Record<string, unknown>);
      if (platRes.status === "fulfilled") setPlatform(platRes.value.data as Record<string, unknown>);
      if (feedRes.status === "fulfilled") setFeedFormulas(feedRes.value.data.formulas);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const dash = summary as Record<string, any>;
  const plat = platform as Record<string, any>;

  const platformMetrics: Metric[] = [
    { label: "Farms",      value: String(plat.farms      ?? "—"), icon: "🏡", color: colors.brand   },
    { label: "Warehouses", value: String(plat.warehouses ?? "—"), icon: "🏠", color: "#8b5cf6"       },
    { label: "Users",      value: String(plat.users      ?? "—"), icon: "👥", color: "#0891b2"       },
    { label: "Branches",   value: String(plat.branches   ?? "—"), icon: "🏢", color: "#d97706"       },
  ];

  const summaryMetrics: Metric[] = [];
  if (dash.totalRevenue !== undefined)
    summaryMetrics.push({ label: "Revenue (GHS)", value: Number(dash.totalRevenue).toLocaleString("en-GH", { maximumFractionDigits: 0 }), icon: "💰", color: "#16a34a" });
  if (dash.openOrders !== undefined)
    summaryMetrics.push({ label: "Open Orders",   value: String(dash.openOrders),                                                          icon: "🧾", color: colors.brand });
  if (dash.totalBirds !== undefined)
    summaryMetrics.push({ label: "Total Birds",   value: Number(dash.totalBirds).toLocaleString(),                                          icon: "🐔", color: "#16a34a" });
  if (dash.pendingAlerts !== undefined)
    summaryMetrics.push({ label: "Pending Alerts",value: String(dash.pendingAlerts),                                                        icon: "⚠️", color: "#d97706" });

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.deco, styles.decoTR]} />
          <View style={[styles.deco, styles.decoBL]} />
          <View style={styles.heroIcon}>
            <Text style={styles.heroEmoji}>📊</Text>
          </View>
          <Text style={styles.heroTitle}>Dashboard</Text>
          <Text style={styles.heroDate}>{today}</Text>
        </View>

        {/* Business overview */}
        {summaryMetrics.length > 0 && (
          <View style={styles.section}>
            <SectionLabel title="BUSINESS OVERVIEW" />
            <View style={styles.grid}>
              {summaryMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
            </View>
          </View>
        )}

        {/* Operations */}
        <View style={styles.section}>
          <SectionLabel title="PLATFORM OVERVIEW" />
          <View style={styles.grid}>
            {platformMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
          </View>
        </View>

        {summaryMetrics.length === 0 && (
          <View style={styles.noDataCard}>
            <Text style={styles.noDataEmoji}>📈</Text>
            <Text style={styles.noDataTitle}>No business data yet</Text>
            <Text style={styles.noDataDesc}>Dashboard metrics will appear here once your ERP has activity. Pull down to refresh.</Text>
          </View>
        )}

        {/* ── Feed Predictive snapshot ── */}
        {feedFormulas.length > 0 && (
          <FeedPredictiveWidget
            formulas={feedFormulas}
            onPress={() => navigation.navigate("RecordsTab", { screen: "HiproPredict" })}
          />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function FeedPredictiveWidget({ formulas, onPress }: { formulas: HiproPredictiveFormula[]; onPress: () => void }) {
  const canProduceCount = formulas.filter((f) => f.maxProducibleTons !== null && f.maxProducibleTons > 0).length;
  const atRisk = formulas.filter((f) => f.maxProducibleTons !== null && f.maxProducibleTons < 5);
  const outOfStock = formulas.filter((f) => f.maxProducibleTons !== null && f.maxProducibleTons <= 0);

  const mostCritical = formulas
    .filter((f) => f.maxProducibleTons !== null)
    .sort((a, b) => (a.maxProducibleTons ?? 0) - (b.maxProducibleTons ?? 0))[0];

  const statusColor = outOfStock.length > 0 ? "#dc2626" : atRisk.length > 0 ? "#d97706" : "#16a34a";
  const statusBg = outOfStock.length > 0 ? "#fef2f2" : atRisk.length > 0 ? "#fffbeb" : "#f0fdf4";
  const statusBorder = outOfStock.length > 0 ? "#fecaca" : atRisk.length > 0 ? "#fde68a" : "#86efac";
  const statusIcon = outOfStock.length > 0 ? "🔴" : atRisk.length > 0 ? "⚠️" : "✅";

  return (
    <View style={styles.section}>
      <SectionLabel title="FEED PREDICTIVE SNAPSHOT" />
      <TouchableOpacity style={[styles.predictCard, { borderColor: statusBorder, backgroundColor: statusBg }]} onPress={onPress} activeOpacity={0.8}>
        {/* Header row */}
        <View style={styles.predictHeader}>
          <View style={styles.predictHeaderLeft}>
            <Text style={styles.predictIcon}>🧮</Text>
            <View>
              <Text style={[styles.predictTitle, { color: statusColor }]}>Hipro Predictive</Text>
              <Text style={styles.predictSub}>Live ingredient stock analysis</Text>
            </View>
          </View>
          <Text style={styles.predictArrow}>›</Text>
        </View>

        {/* Stat row */}
        <View style={styles.predictStatRow}>
          <PredictStat label="Can Produce" value={`${canProduceCount}/${formulas.length}`} color="#16a34a" />
          <View style={styles.predictStatDivider} />
          <PredictStat label="At Risk (<5t)" value={String(atRisk.length)} color="#d97706" />
          <View style={styles.predictStatDivider} />
          <PredictStat label="Out of Stock" value={String(outOfStock.length)} color="#dc2626" />
        </View>

        {/* Most critical */}
        {mostCritical && (
          <View style={[styles.criticalRow, { borderColor: statusBorder }]}>
            <Text style={styles.criticalLabel}>{statusIcon} Most critical:</Text>
            <Text style={[styles.criticalName, { color: statusColor }]}>{mostCritical.formulaName}</Text>
            <Text style={styles.criticalDetail}>
              {mostCritical.maxProducibleTons != null
                ? `${mostCritical.maxProducibleTons.toFixed(1)} tons · ${mostCritical.maxProducibleBags ?? 0} bags remaining`
                : "No ingredients configured"}
              {mostCritical.limitingIngredient ? ` · Limited by ${mostCritical.limitingIngredient.name}` : ""}
            </Text>
          </View>
        )}

        <Text style={[styles.predictTapHint, { color: statusColor }]}>Tap to view full predictive analysis →</Text>
      </TouchableOpacity>
    </View>
  );
}

function PredictStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.predictStat}>
      <Text style={[styles.predictStatVal, { color }]}>{value}</Text>
      <Text style={styles.predictStatLabel}>{label}</Text>
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      <View style={styles.sectionLabelLine} />
    </View>
  );
}

function MetricCard({ label, value, icon, color }: Metric) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconWrap, { backgroundColor: color + "18" }]}>
        <Text style={styles.metricEmoji}>{icon}</Text>
      </View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={[styles.metricAccent, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: spacing.xxxl },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight },

  hero: {
    backgroundColor: colors.brand,
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  deco: {
    position: "absolute",
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  decoTR: { width: 160, height: 160, top: -50, right: -40 },
  decoBL: { width: 120, height: 120, bottom: -30, left: -20 },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  heroEmoji: { fontSize: 32 },
  heroTitle: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.white },
  heroDate: { fontSize: font.size.sm, color: "rgba(255,255,255,0.8)" },

  section: { paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.xl },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionLabelText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1.2 },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: colors.border },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCard: {
    width: "47%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: "hidden",
    ...shadow.md,
  },
  metricIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  metricEmoji: { fontSize: 24 },
  metricValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold },
  metricLabel: { fontSize: font.size.sm, color: colors.inkMid, fontWeight: font.weight.medium },
  metricAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },

  noDataCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.brandLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  noDataEmoji: { fontSize: 40 },
  noDataTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.brandDark },
  noDataDesc: { fontSize: font.size.sm, color: colors.brand, textAlign: "center", lineHeight: 20 },

  // Feed Predictive widget
  predictCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.md,
  },
  predictHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  predictHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  predictIcon: { fontSize: 28 },
  predictTitle: { fontSize: font.size.md, fontWeight: font.weight.bold as any },
  predictSub: { fontSize: font.size.xs, color: colors.inkLight },
  predictArrow: { fontSize: 24, color: colors.inkLight },

  predictStatRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  predictStat: { flex: 1, alignItems: "center", gap: 2 },
  predictStatVal: { fontSize: font.size.xl, fontWeight: font.weight.extrabold as any },
  predictStatLabel: { fontSize: 10, color: colors.inkLight, fontWeight: font.weight.medium as any },
  predictStatDivider: { width: 1, height: 36, backgroundColor: colors.border },

  criticalRow: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: 3,
  },
  criticalLabel: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.semibold as any },
  criticalName: { fontSize: font.size.sm, fontWeight: font.weight.bold as any },
  criticalDetail: { fontSize: font.size.xs, color: colors.inkMid },

  predictTapHint: { fontSize: font.size.xs, fontWeight: font.weight.semibold as any, textAlign: "right" },
});
