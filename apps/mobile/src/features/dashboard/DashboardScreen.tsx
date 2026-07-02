import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchDashboardSummary, fetchHiproPredictive, fetchPlatformSummary } from "../../api/endpoints";
import type { HiproPredictiveFormula } from "../../api/endpoints";
import { EmptyState } from "../../components/EmptyState";
import { Icon, type IconName } from "../../components/Icon";
import { MetricCard } from "../../components/MetricCard";
import { SkeletonMetricGrid } from "../../components/SkeletonLoader";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Metric = { label: string; value: string; icon: IconName; color: string };

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

  const dash = summary as Record<string, any>;
  const plat = platform as Record<string, any>;

  const platformMetrics: Metric[] = [
    { label: "Farms",      value: String(plat.farms      ?? "—"), icon: "home-city",       color: colors.brand },
    { label: "Warehouses", value: String(plat.warehouses ?? "—"), icon: "warehouse",        color: "#8b5cf6"    },
    { label: "Users",      value: String(plat.users      ?? "—"), icon: "account-multiple", color: "#0891b2"    },
    { label: "Branches",   value: String(plat.branches   ?? "—"), icon: "office-building",  color: "#d97706"    },
  ];

  const summaryMetrics: Metric[] = [];
  if (dash.totalRevenue !== undefined)
    summaryMetrics.push({ label: "Revenue (GHS)", value: Number(dash.totalRevenue).toLocaleString("en-GH", { maximumFractionDigits: 0 }), icon: "cash",                color: "#16a34a"    });
  if (dash.openOrders !== undefined)
    summaryMetrics.push({ label: "Open Orders",   value: String(dash.openOrders),                                                          icon: "receipt-text-outline", color: colors.brand });
  if (dash.totalBirds !== undefined)
    summaryMetrics.push({ label: "Total Birds",   value: Number(dash.totalBirds).toLocaleString(),                                          icon: "bird",                color: "#16a34a"    });
  if (dash.pendingAlerts !== undefined)
    summaryMetrics.push({ label: "Pending Alerts",value: String(dash.pendingAlerts),                                                        icon: "alert-circle-outline", color: "#d97706"   });

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
            <MaterialCommunityIcons name="chart-areaspline" size={32} color="rgba(255,255,255,0.9)" />
          </View>
          <Text style={styles.heroTitle}>Dashboard</Text>
          <Text style={styles.heroDate}>{today}</Text>
        </View>

        {/* Business overview */}
        {(loading && summaryMetrics.length === 0) ? (
          <View style={styles.section}>
            <SectionLabel title="BUSINESS OVERVIEW" />
            <SkeletonMetricGrid />
          </View>
        ) : summaryMetrics.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel title="BUSINESS OVERVIEW" />
            <View style={styles.grid}>
              {summaryMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <EmptyState
              icon="chart-areaspline"
              title="No business data yet"
              subtitle="Dashboard metrics will appear here once your ERP has activity. Pull down to refresh."
              iconColor={colors.brand}
            />
          </View>
        )}

        {/* Platform overview */}
        <View style={styles.section}>
          <SectionLabel title="PLATFORM OVERVIEW" />
          {loading ? (
            <SkeletonMetricGrid />
          ) : (
            <View style={styles.grid}>
              {platformMetrics.map((m) => <MetricCard key={m.label} {...m} />)}
            </View>
          )}
        </View>

        {/* Feed Predictive snapshot */}
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
  const atRisk          = formulas.filter((f) => f.maxProducibleTons !== null && f.maxProducibleTons < 5);
  const outOfStock      = formulas.filter((f) => f.maxProducibleTons !== null && f.maxProducibleTons <= 0);

  const mostCritical = formulas
    .filter((f) => f.maxProducibleTons !== null)
    .sort((a, b) => (a.maxProducibleTons ?? 0) - (b.maxProducibleTons ?? 0))[0];

  const statusColor  = outOfStock.length > 0 ? "#dc2626" : atRisk.length > 0 ? "#d97706" : "#16a34a";
  const statusBg     = outOfStock.length > 0 ? "#fef2f2" : atRisk.length > 0 ? "#fffbeb" : "#f0fdf4";
  const statusBorder = outOfStock.length > 0 ? "#fecaca" : atRisk.length > 0 ? "#fde68a" : "#86efac";
  const statusIconName: IconName = outOfStock.length > 0 ? "alert-circle" : atRisk.length > 0 ? "alert" : "check-circle";

  return (
    <View style={styles.section}>
      <SectionLabel title="FEED PREDICTIVE SNAPSHOT" />
      <TouchableOpacity
        style={[styles.predictCard, { borderColor: statusBorder, backgroundColor: statusBg }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.predictHeader}>
          <View style={styles.predictHeaderLeft}>
            <View style={[styles.predictIconWrap, { backgroundColor: statusColor + "18" }]}>
              <Icon name="calculator-variant" size={22} color={statusColor} />
            </View>
            <View>
              <Text style={[styles.predictTitle, { color: statusColor }]}>Hipro Predictive</Text>
              <Text style={styles.predictSub}>Live ingredient stock analysis</Text>
            </View>
          </View>
          <Icon name="chevron-right" size={22} color={colors.inkLight} />
        </View>

        <View style={styles.predictStatRow}>
          <PredictStat label="Can Produce" value={`${canProduceCount}/${formulas.length}`} color="#16a34a" />
          <View style={styles.predictStatDivider} />
          <PredictStat label="At Risk (<5t)" value={String(atRisk.length)} color="#d97706" />
          <View style={styles.predictStatDivider} />
          <PredictStat label="Out of Stock" value={String(outOfStock.length)} color="#dc2626" />
        </View>

        {mostCritical ? (
          <View style={[styles.criticalRow, { borderColor: statusBorder }]}>
            <View style={styles.criticalLabelRow}>
              <Icon name={statusIconName} size={13} color={statusColor} />
              <Text style={styles.criticalLabel}>Most critical:</Text>
            </View>
            <Text style={[styles.criticalName, { color: statusColor }]}>{mostCritical.formulaName}</Text>
            <Text style={styles.criticalDetail}>
              {mostCritical.maxProducibleTons != null
                ? `${mostCritical.maxProducibleTons.toFixed(1)} tons · ${mostCritical.maxProducibleBags ?? 0} bags remaining`
                : "No ingredients configured"}
              {mostCritical.limitingIngredient ? ` · Limited by ${mostCritical.limitingIngredient.name}` : ""}
            </Text>
          </View>
        ) : null}

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

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: spacing.xxxl },

  hero: {
    backgroundColor: colors.brand,
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  deco:    { position: "absolute", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.1)" },
  decoTR:  { width: 160, height: 160, top: -50, right: -40 },
  decoBL:  { width: 120, height: 120, bottom: -30, left: -20 },
  heroIcon:{
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.xs,
  },
  heroTitle: { fontSize: font.size.xxl, fontFamily: font.family.extrabold, color: colors.white },
  heroDate:  { fontSize: font.size.sm, color: "rgba(255,255,255,0.8)", fontFamily: font.family.regular },

  section:         { paddingHorizontal: spacing.xl, gap: spacing.md, marginBottom: spacing.xl },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionLabelText:{ fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, letterSpacing: 1.2 },
  sectionLabelLine:{ flex: 1, height: 1, backgroundColor: colors.border },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },

  // Feed Predictive widget
  predictCard: {
    borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md, ...shadow.md,
  },
  predictHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  predictHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  predictIconWrap:   { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  predictTitle:      { fontSize: font.size.md, fontFamily: font.family.bold },
  predictSub:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  predictStatRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  predictStat:       { flex: 1, alignItems: "center", gap: 2 },
  predictStatVal:    { fontSize: font.size.xl, fontFamily: font.family.extrabold },
  predictStatLabel:  { fontSize: 10, color: colors.inkLight, fontFamily: font.family.medium },
  predictStatDivider:{ width: 1, height: 36, backgroundColor: colors.border },

  criticalRow:     { borderTopWidth: 1, paddingTop: spacing.sm, gap: 3 },
  criticalLabelRow:{ flexDirection: "row", alignItems: "center", gap: 5 },
  criticalLabel:   { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.semibold },
  criticalName:    { fontSize: font.size.sm, fontFamily: font.family.bold },
  criticalDetail:  { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular },

  predictTapHint: { fontSize: font.size.xs, fontFamily: font.family.semibold, textAlign: "right" },
});
