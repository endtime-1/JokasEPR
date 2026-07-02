import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchPendingExpenses, type ExpenseRecord } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ExpenseApprovalListScreen() {
  const navigation = useNavigation<any>();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchPendingExpenses();
      setExpenses((res.data as any) ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={5} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <FlatList
        data={expenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <PageHeader
            icon="receipt"
            iconColor="#dc2626"
            title="Pending Expenses"
            subtitle={`${expenses.length} awaiting approval`}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-text-outline"
            title="No pending expenses"
            subtitle="All expenses have been reviewed."
            iconColor="#16a34a"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("ExpenseApprovalDetail", { expenseId: item.id })}
            activeOpacity={0.8}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconWrap}>
                <Icon name="receipt" size={20} color="#dc2626" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.meta}>{item.reference} · {item.category?.name ?? "No category"}</Text>
                <Text style={styles.date}>{new Date(item.expenseDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.amount}>{GHS(Number(item.amount))}</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.inkLight} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pad:  { padding: spacing.xl, gap: spacing.sm },

  card:      { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:  { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" },
  cardText:  { flex: 1, gap: 2 },
  desc:      { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  meta:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  date:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRight: { alignItems: "flex-end", gap: 4 },
  amount:    { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
  pendingBadge: { backgroundColor: "#fff7ed", borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "#fed7aa" },
  pendingText:  { fontSize: 9, fontFamily: font.family.bold, color: "#d97706" },
});
