import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchSalesOrders, type SalesOrderListItem } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  DRAFT:     { ...semantic.status.draft,      label: "Draft"     },
  PENDING:   { ...semantic.status.pending,    label: "Pending"   },
  CONFIRMED: { ...semantic.status.inProgress, label: "Confirmed" },
  INVOICED:  { ...semantic.status.inProgress, label: "Invoiced"  },
  PAID:      { ...semantic.status.approved,   label: "Paid"      },
  CANCELLED: { ...semantic.status.rejected,   label: "Cancelled" },
};

const SEGMENTS = [
  { key: "ALL",      label: "All"       },
  { key: "PENDING",  label: "Pending"   },
  { key: "PAID",     label: "Paid"      },
  { key: "INVOICED", label: "Invoiced"  },
];

export function SalesOrderHistoryScreen() {
  const navigation = useNavigation<any>();
  const [all,        setAll]        = useState<SalesOrderListItem[]>([]);
  const [tab,        setTab]        = useState("ALL");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchSalesOrders();
      setAll((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = tab === "ALL" ? all : all.filter((o) => o.status === tab);
  const totalValue = displayed.reduce((sum, o) => sum + o.totalAmount, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={5} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={displayed}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              icon="receipt-text-outline"
              iconColor="#16a34a"
              title="Sales Orders"
              subtitle={`${all.length} orders`}
              right={
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("SalesOrder")} activeOpacity={0.8}>
                  <Icon name="plus" size={18} color={colors.white} />
                </TouchableOpacity>
              }
            />
            <SegmentedControl segments={SEGMENTS} active={tab} onChange={setTab} />
            {displayed.length > 0 && (
              <View style={styles.summaryChip}>
                <Text style={styles.summaryText}>{displayed.length} orders · {GHS(totalValue)}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="receipt-text-outline" title={tab === "ALL" ? "No orders yet" : `No ${tab.toLowerCase()} orders`} subtitle="Create a new sales order to get started." iconColor="#16a34a" actionLabel="New Order" onAction={() => navigation.navigate("SalesOrder")} />
        }
        renderItem={({ item }) => {
          const s = STATUS_META[item.status] ?? STATUS_META.DRAFT;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={styles.iconWrap}>
                    <Icon name="receipt-text-outline" size={20} color="#16a34a" />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.orderNum}>{item.orderNumber}</Text>
                    <Text style={styles.customer}>{item.customer.name}</Text>
                    <Text style={styles.date}>{new Date(item.orderDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
                  <Text style={styles.amount}>{GHS(item.totalAmount)}</Text>
                  {item._count?.items != null && (
                    <Text style={styles.itemCount}>{item._count.items} item{item._count.items !== 1 ? "s" : ""}</Text>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  list:   { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:    { padding: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },

  newBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },

  summaryChip: { alignSelf: "flex-start", backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4, borderWidth: 1, borderColor: colors.brandMid },
  summaryText: { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.brand },

  card:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.sm },
  cardTop:  { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  orderNum: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  customer: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  date:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRight:{ alignItems: "flex-end", gap: 4 },
  amount:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
  itemCount:{ fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
