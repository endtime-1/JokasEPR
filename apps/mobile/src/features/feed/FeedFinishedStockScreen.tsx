import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFinishedFeedStock, type FinishedFeedStockItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

export function FeedFinishedStockScreen() {
  const [items,      setItems]      = useState<FinishedFeedStockItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFinishedFeedStock();
      const sorted = [...((res.data as any) ?? [])].sort(
        (a: FinishedFeedStockItem, b: FinishedFeedStockItem) => b.quantityKg - a.quantityKg
      );
      setItems(sorted);
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
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="warehouse" iconColor="#2563eb" title="Finished Feed Stock" subtitle={`${items.length} item${items.length !== 1 ? "s" : ""}`} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="warehouse"
            title="No finished feed stock"
            subtitle="Produced batches will appear here after processing."
            iconColor="#2563eb"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: "#eff6ff" }]}>
              <Text style={styles.iconText}>🌾</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.productName}>{item.product.name}</Text>
              <Text style={styles.sku}>{item.product.sku}</Text>
              <Text style={styles.warehouse}>{item.warehouse.name} ({item.warehouse.code})</Text>
            </View>
            <View style={styles.qtyBox}>
              <Text style={styles.qtyVal}>{item.quantityKg.toLocaleString()}</Text>
              <Text style={styles.qtyUnit}>kg</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.bg },
  list:        { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:         { padding: spacing.xl },
  header:      { marginBottom: spacing.md },

  card:        { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  iconWrap:    { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  iconText:    { fontSize: 22 },
  cardText:    { flex: 1, gap: 2 },
  productName: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  sku:         { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  warehouse:   { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.medium },
  qtyBox:      { alignItems: "flex-end", gap: 1 },
  qtyVal:      { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: "#2563eb" },
  qtyUnit:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
