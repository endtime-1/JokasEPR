import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchFinanceDashboard, FinanceDashboardData } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = "expenses" | "revenue";

const EXPENSE_STATUS: Record<string, { bg: string; color: string }> = {
  PENDING:          { bg: "#f1f5f9", color: "#475569" },
  PENDING_APPROVAL: { bg: "#fff7ed", color: "#c2410c" },
  APPROVED:         { bg: "#f0fdf4", color: "#15803d" },
  REJECTED:         { bg: "#fef2f2", color: "#b91c1c" },
  PAID:             { bg: "#f0fdf4", color: "#15803d" },
};

export function FinanceMobileScreen() {
  const [dash,    setDash]    = useState<FinanceDashboardData["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<Tab>("expenses");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchFinanceDashboard();
      setDash(res.data);
    } catch {
      setError("Could not load finance data. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !dash) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      </SafeAreaView>
    );
  }

  const profit = dash?.netProfit ?? 0;
  const profitColor = profit >= 0 ? "#15803d" : "#dc2626";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Finance Overview</Text>
          <Text style={styles.headerSub}>Current period · read-only</Text>
        </View>

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, styles.kpiCardRevenue]}>
            <Text style={styles.kpiLabel}>Revenue</Text>
            <Text style={[styles.kpiValue, { color: "#15803d" }]}>{GHS(dash?.totalRevenue ?? 0)}</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardExpense]}>
            <Text style={styles.kpiLabel}>Expenses</Text>
            <Text style={[styles.kpiValue, { color: "#dc2626" }]}>{GHS(dash?.totalExpenses ?? 0)}</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardProfit, { borderColor: profit >= 0 ? "#bbf7d0" : "#fca5a5", backgroundColor: profit >= 0 ? "#f0fdf4" : "#fef2f2" }]}>
            <Text style={styles.kpiLabel}>Net Profit</Text>
            <Text style={[styles.kpiValueLg, { color: profitColor }]}>{GHS(profit)}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <Text style={styles.kpiLabel}>Pending Approvals</Text>
            <Text style={[styles.kpiValueLg, { color: "#d97706" }]}>{dash?.pendingApprovals ?? 0}</Text>
          </View>
        </View>

        {/* Bank accounts */}
        {(dash?.bankAccounts?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏦 Bank Balances</Text>
            <View style={styles.bankList}>
              {dash!.bankAccounts.map((b) => (
                <View key={b.id} style={styles.bankRow}>
                  <View style={styles.bankLeft}>
                    <Text style={styles.bankName}>{b.accountName}</Text>
                    <Text style={styles.bankSub}>{b.bankName}</Text>
                  </View>
                  <Text style={[styles.bankBalance, { color: Number(b.currentBalance) >= 0 ? "#15803d" : "#dc2626" }]}>
                    {GHS(Number(b.currentBalance))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent activity tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.tabRow}>
            {(["expenses", "revenue"] as Tab[]).map((t) => (
              <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                  {t === "expenses" ? "Expenses" : "Revenue"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "expenses" ? (
            dash?.recentExpenses?.length ? (
              dash.recentExpenses.map((e) => {
                const sc = EXPENSE_STATUS[e.status] ?? EXPENSE_STATUS.PENDING;
                return (
                  <View key={e.id} style={styles.txRow}>
                    <View style={styles.txLeft}>
                      <Text style={styles.txTitle}>{e.description}</Text>
                      <Text style={styles.txMeta}>{e.reference} · {e.category?.name ?? "Uncategorised"}</Text>
                      <Text style={styles.txDate}>{new Date(e.expenseDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, { color: "#dc2626" }]}>-{GHS(Number(e.amount))}</Text>
                      <View style={[styles.txBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.txBadgeText, { color: sc.color }]}>{e.status.replace("_", " ")}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : <Text style={styles.empty}>No recent expenses</Text>
          ) : (
            dash?.recentRevenue?.length ? (
              dash.recentRevenue.map((r) => (
                <View key={r.id} style={styles.txRow}>
                  <View style={styles.txLeft}>
                    <Text style={styles.txTitle}>{r.description ?? "Revenue"}</Text>
                    <Text style={styles.txDate}>{new Date(r.revenueDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: "#15803d" }]}>+{GHS(Number(r.amount))}</Text>
                </View>
              ))
            ) : <Text style={styles.empty}>No recent revenue</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },

  header:     { gap: 3 },
  headerTitle: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.ink },
  headerSub:  { fontSize: font.size.sm, color: colors.inkLight },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpiCard: {
    flex: 1, minWidth: "44%", padding: spacing.lg, borderRadius: radius.xl,
    borderWidth: 1, gap: 6, ...shadow.sm,
  },
  kpiCardRevenue: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  kpiCardExpense: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  kpiCardProfit:  { flex: 2, minWidth: "100%" },
  kpiLabel:   { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue:   { fontSize: font.size.lg, fontWeight: font.weight.extrabold },
  kpiValueLg: { fontSize: 28, fontWeight: font.weight.extrabold },

  section:      { gap: spacing.md },
  sectionTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },

  bankList: { gap: spacing.sm },
  bankRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, ...shadow.sm,
  },
  bankLeft:    { gap: 2 },
  bankName:    { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  bankSub:     { fontSize: font.size.xs, color: colors.inkLight },
  bankBalance: { fontSize: font.size.md, fontWeight: font.weight.extrabold },

  tabRow:        { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tabBtn:        { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabBtnActive:  { backgroundColor: colors.brand },
  tabLabel:      { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  tabLabelActive: { color: colors.white },

  txRow: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  txLeft:      { flex: 1, gap: 2 },
  txRight:     { alignItems: "flex-end", gap: 4 },
  txTitle:     { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  txMeta:      { fontSize: font.size.xs, color: colors.inkLight },
  txDate:      { fontSize: font.size.xs, color: colors.inkLight },
  txAmount:    { fontSize: font.size.sm, fontWeight: font.weight.extrabold },
  txBadge:     { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  txBadgeText: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase" },

  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  empty:     { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center", paddingVertical: spacing.lg },
});
