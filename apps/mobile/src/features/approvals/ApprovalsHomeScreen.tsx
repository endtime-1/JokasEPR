import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { Icon, type IconName } from "../../components/Icon";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchPendingExpenses, fetchPayrollRuns, fetchPurchaseRequests } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type ApprovalCard = {
  icon: IconName;
  color: string;
  title: string;
  subtitle: string;
  count: number;
  screen: string;
};

export function ApprovalsHomeScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({ expenses: 0, payroll: 0, purchaseRequests: 0 });

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [expRes, payRes, prRes] = await Promise.allSettled([
        fetchPendingExpenses(),
        fetchPayrollRuns(),
        fetchPurchaseRequests("PENDING"),
      ]);
      setCounts({
        expenses:         expRes.status === "fulfilled" ? ((expRes.value.data as any) ?? []).length : 0,
        payroll:          payRes.status === "fulfilled" ? ((payRes.value.data as any) ?? []).filter((r: any) => r.status === "PENDING_APPROVAL").length : 0,
        purchaseRequests: prRes.status === "fulfilled"  ? ((prRes.value.data as any) ?? []).length : 0,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalPending = counts.expenses + counts.payroll + counts.purchaseRequests;

  const cards: ApprovalCard[] = [
    {
      icon: "receipt",
      color: "#dc2626",
      title: "Expense Approvals",
      subtitle: "Submitted expenses awaiting sign-off",
      count: counts.expenses,
      screen: "ExpenseApprovalList",
    },
    {
      icon: "account-cash",
      color: "#7c3aed",
      title: "Payroll Approval",
      subtitle: "Payroll runs ready for review",
      count: counts.payroll,
      screen: "PayrollApprovalList",
    },
    {
      icon: "truck-delivery",
      color: "#2563eb",
      title: "Procurement Approvals",
      subtitle: "Purchase requests & orders pending",
      count: counts.purchaseRequests,
      screen: "ProcurementApprovalList",
    },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={3} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="check-decagram" size={28} color={colors.white} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Approvals</Text>
            <Text style={styles.heroSub}>
              {totalPending > 0 ? `${totalPending} item${totalPending !== 1 ? "s" : ""} awaiting your decision` : "Nothing pending right now"}
            </Text>
          </View>
        </View>

        {/* Approval cards */}
        {cards.map((card) => (
          <TouchableOpacity
            key={card.screen}
            style={styles.card}
            onPress={() => navigation.navigate(card.screen)}
            activeOpacity={0.8}
          >
            <View style={[styles.cardIcon, { backgroundColor: card.color + "18" }]}>
              <Icon name={card.icon} size={24} color={card.color} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSub}>{card.subtitle}</Text>
            </View>
            <View style={styles.cardRight}>
              {card.count > 0 ? (
                <View style={[styles.badge, { backgroundColor: card.color }]}>
                  <Text style={styles.badgeText}>{card.count}</Text>
                </View>
              ) : (
                <Icon name="check-circle-outline" size={20} color="#16a34a" />
              )}
              <Icon name="chevron-right" size={18} color={colors.inkLight} />
            </View>
          </TouchableOpacity>
        ))}

        {totalPending === 0 && (
          <View style={styles.allClearCard}>
            <Icon name="check-all" size={32} color="#16a34a" />
            <Text style={styles.allClearTitle}>All clear</Text>
            <Text style={styles.allClearSub}>No pending approvals. Pull down to refresh.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pad:    { padding: spacing.xl, gap: spacing.sm },

  hero:     { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brand, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm, overflow: "hidden" },
  heroIcon: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, gap: 3 },
  heroTitle:{ fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.white },
  heroSub:  { fontSize: font.size.sm, color: "rgba(255,255,255,0.85)", fontFamily: font.family.regular },

  card:      { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardIcon:  { width: 52, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardText:  { flex: 1, gap: 3 },
  cardTitle: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  cardSub:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  badge:     { minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { fontSize: font.size.xs, fontFamily: font.family.extrabold, color: colors.white },

  allClearCard: { alignItems: "center", paddingVertical: 48, gap: spacing.sm },
  allClearTitle: { fontSize: font.size.lg, fontFamily: font.family.bold, color: "#16a34a" },
  allClearSub:   { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center", fontFamily: font.family.regular },
});
