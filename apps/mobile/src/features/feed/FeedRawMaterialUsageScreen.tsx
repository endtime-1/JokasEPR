import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchRawMaterialUsage, type RawMaterialUsageItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

export function FeedRawMaterialUsageScreen() {
  const [records,    setRecords]    = useState<RawMaterialUsageItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchRawMaterialUsage();
      setRecords((res.data as any) ?? []);
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
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="scale-balance" iconColor="#b45309" title="Raw Material Usage" subtitle={`${records.length} record${records.length !== 1 ? "s" : ""}`} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="scale-balance" title="No usage records" subtitle="Raw material usage records will appear here after production." iconColor="#b45309" />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: "#b4530918" }]}>
              <Icon name="scale-balance" size={20} color="#b45309" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.productName}>{item.product?.name ?? "—"}</Text>
              {item.product?.sku ? (
                <Text style={styles.sku}>{item.product.sku}</Text>
              ) : null}
              <Text style={styles.batchNum}>Batch: {item.batchNumber}</Text>
              <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
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
  cardText:    { flex: 1, gap: 2 },
  productName: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  sku:         { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  batchNum:    { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.medium },
  date:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  qtyBox:      { alignItems: "flex-end", gap: 1 },
  qtyVal:      { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: "#b45309" },
  qtyUnit:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
