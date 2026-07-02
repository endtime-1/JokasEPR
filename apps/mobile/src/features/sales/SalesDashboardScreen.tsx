import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonMetricGrid } from "../../components/SkeletonLoader";
import { fetchSalesDashboard, type SalesDashboardData, type SalesOrderListItem } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  DRAFT:    { ...semantic.status.draft,      label: "Draft"    },
  PENDING:  { ...semantic.status.pending,    label: "Pending"  },
  CONFIRMED:{ ...semantic.status.inProgress, label: "Confirmed"},
  INVOICED: { ...semantic.status.inProgress, label: "Invoiced" },
  PAID:     { ...semantic.status.approved,   label: "Paid"     },
  CANCELLED:{ ...semantic.status.rejected,   label: "Cancelled"},
};

export function SalesDashboardScreen() {
  const navigation = useNavigation<any>();
  const [data,       setData]       = useState<SalesDashboardData["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchSalesDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <PageHeader icon="chart-line" iconColor="#16a34a" title="Sales" />
          <SkeletonMetricGrid cols={2} rows={2} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const d = data;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader icon="chart-line" iconColor="#16a34a" title="Sales" subtitle="Revenue & order overview" />

        {/* KPI grid */}
        <View style={styles.grid}>
          <MetricCard icon="cash-multiple"        value={GHS(d?.totalRevenue ?? 0)}  label="Total Revenue"    color="#16a34a" />
          <MetricCard icon="receipt-text-outline" value={d?.totalOrders    ?? 0}     label="Total Orders"     color="#2563eb" />
          <MetricCard icon="check-circle-outline" value={d?.paidOrders     ?? 0}     label="Paid Orders"      color="#16a34a" />
          <MetricCard icon="clock-outline"        value={d?.pendingOrders  ?? 0}     label="Pending Orders"   color="#d97706" />
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("SalesOrder")} activeOpacity={0.8}>
            <Icon name="cart-plus" size={20} color={colors.brand} />
            <Text style={styles.quickBtnText}>New Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("SalesOrderHistory")} activeOpacity={0.8}>
            <Icon name="format-list-bulleted" size={20} color="#2563eb" />
            <Text style={[styles.quickBtnText, { color: "#2563eb" }]}>All Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("CustomerList")} activeOpacity={0.8}>
            <Icon name="account-group" size={20} color="#7c3aed" />
            <Text style={[styles.quickBtnText, { color: "#7c3aed" }]}>Customers</Text>
          </TouchableOpacity>
        </View>

        {/* Top customers */}
        {d?.topCustomers?.length ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Customers</Text>
              <TouchableOpacity onPress={() => navigation.navigate("CustomerList")}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {d.topCustomers.slice(0, 5).map((c, i) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.customerRow, i === 0 && styles.customerRowFirst]}
                onPress={() => navigation.navigate("CustomerDetail", { customerId: c.id, customerName: c.name })}
                activeOpacity={0.8}
              >
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <Text style={styles.customerName}>{c.name}</Text>
                <Text style={styles.customerSpend}>{GHS(c.totalSpend)}</Text>
                <Icon name="chevron-right" size={14} color={colors.inkLight} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Recent orders */}
        {d?.recentOrders?.length ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity onPress={() => navigation.navigate("SalesOrderHistory")}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {d.recentOrders.slice(0, 5).map((o: SalesOrderListItem, i) => {
              const s = ORDER_STATUS[o.status] ?? ORDER_STATUS.DRAFT;
              return (
                <View key={o.id} style={[styles.orderRow, i === 0 && styles.orderRowFirst]}>
                  <View style={styles.orderLeft}>
                    <Text style={styles.orderNum}>{o.orderNumber}</Text>
                    <Text style={styles.orderCustomer}>{o.customer.name}</Text>
                  </View>
                  <View style={styles.orderRight}>
                    <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                    <Text style={styles.orderAmount}>{GHS(o.totalAmount)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  actionsRow: { flexDirection: "row", gap: spacing.sm },
  quickBtn:   { flex: 1, flexDirection: "column", alignItems: "center", gap: 5, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, ...shadow.sm },
  quickBtnText: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.brand },

  sectionCard:   { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm },
  sectionTitle:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },
  seeAll:        { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.brand },

  customerRow:      { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  customerRowFirst: { borderTopWidth: 0 },
  rankBadge:        { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center" },
  rankText:         { fontSize: font.size.xs, fontFamily: font.family.extrabold, color: colors.brand },
  customerName:     { flex: 1, fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  customerSpend:    { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  orderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  orderRowFirst: { borderTopWidth: 0 },
  orderLeft:     { flex: 1, gap: 2 },
  orderNum:      { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  orderCustomer: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  orderRight:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  orderAmount:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
});
