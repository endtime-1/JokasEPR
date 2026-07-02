import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFinanceDashboard, FinanceDashboardData } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = "expenses" | "revenue";

const EXPENSE_STATUS: Record<string, { bg: string; color: string; border: string }> = {
  PENDING:          { ...semantic.status.draft      },
  PENDING_APPROVAL: { ...semantic.status.submitted  },
  APPROVED:         { ...semantic.status.approved   },
  REJECTED:         { ...semantic.status.rejected   },
  PAID:             { ...semantic.status.approved   },
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
        <View style={styles.skeletonPad}>
          <SkeletonList count={4} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Failed to load"
          subtitle={error}
          iconColor="#dc2626"
          actionLabel="Retry"
          onAction={load}
        />
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
        <PageHeader
          icon="chart-line"
          title="Finance Overview"
          subtitle="Current period · read-only"
        />

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, styles.kpiCardRevenue]}>
            <View style={styles.kpiIconRow}>
              <Icon name="trending-up" size={16} color="#15803d" />
              <Text style={styles.kpiLabel}>Revenue</Text>
            </View>
            <Text style={[styles.kpiValue, { color: "#15803d" }]}>{GHS(dash?.totalRevenue ?? 0)}</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardExpense]}>
            <View style={styles.kpiIconRow}>
              <Icon name="trending-down" size={16} color="#dc2626" />
              <Text style={styles.kpiLabel}>Expenses</Text>
            </View>
            <Text style={[styles.kpiValue, { color: "#dc2626" }]}>{GHS(dash?.totalExpenses ?? 0)}</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardProfit, { borderColor: profit >= 0 ? "#bbf7d0" : "#fca5a5", backgroundColor: profit >= 0 ? "#f0fdf4" : "#fef2f2" }]}>
            <View style={styles.kpiIconRow}>
              <Icon name="scale-balance" size={16} color={profitColor} />
              <Text style={styles.kpiLabel}>Net Profit</Text>
            </View>
            <Text style={[styles.kpiValueLg, { color: profitColor }]}>{GHS(profit)}</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <View style={styles.kpiIconRow}>
              <Icon name="clock-outline" size={16} color="#d97706" />
              <Text style={styles.kpiLabel}>Pending Approvals</Text>
            </View>
            <Text style={[styles.kpiValueLg, { color: "#d97706" }]}>{dash?.pendingApprovals ?? 0}</Text>
          </View>
        </View>

        {/* Bank accounts */}
        {(dash?.bankAccounts?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Icon name="bank" size={16} color={colors.inkMid} />
              <Text style={styles.sectionTitle}>Bank Balances</Text>
            </View>
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
        ) : null}

        {/* Recent activity tabs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <SegmentedControl
            segments={[
              { key: "expenses", label: "Expenses", icon: "credit-card-minus" },
              { key: "revenue",  label: "Revenue",  icon: "cash-plus"         },
            ]}
            active={tab}
            onChange={(k) => setTab(k as Tab)}
          />

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
                      <View style={[styles.txBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                        <Text style={[styles.txBadgeText, { color: sc.color }]}>{e.status.replace("_", " ")}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyState icon="receipt-text-outline" title="No recent expenses" iconColor="#dc2626" />
            )
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
            ) : (
              <EmptyState icon="cash-plus" title="No recent revenue" iconColor="#16a34a" />
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.bg },
  scroll:     { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  skeletonPad:{ padding: spacing.xl, gap: spacing.sm },

  kpiGrid:       { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpiCard:       { flex: 1, minWidth: "44%", padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, gap: 6, ...shadow.sm },
  kpiCardRevenue:{ backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  kpiCardExpense:{ backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  kpiCardProfit: { flex: 2, minWidth: "100%" },
  kpiIconRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiLabel:      { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue:      { fontSize: font.size.lg, fontFamily: font.family.extrabold },
  kpiValueLg:    { fontSize: 28, fontFamily: font.family.extrabold },

  section:        { gap: spacing.md },
  sectionTitleRow:{ flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle:   { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.ink },

  bankList:    { gap: spacing.sm },
  bankRow:     {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, ...shadow.sm,
  },
  bankLeft:    { gap: 2 },
  bankName:    { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  bankSub:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  bankBalance: { fontSize: font.size.md, fontFamily: font.family.extrabold },

  txRow: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  txLeft:      { flex: 1, gap: 2 },
  txRight:     { alignItems: "flex-end", gap: 4 },
  txTitle:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  txMeta:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  txDate:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  txAmount:    { fontSize: font.size.sm, fontFamily: font.family.extrabold },
  txBadge:     { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  txBadgeText: { fontSize: 9, fontFamily: font.family.bold, textTransform: "uppercase" },
});
