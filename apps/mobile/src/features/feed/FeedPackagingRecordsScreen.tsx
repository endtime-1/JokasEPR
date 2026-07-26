import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFeedPackagingRecords, type FeedPackagingRecordItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

export function FeedPackagingRecordsScreen() {
  const [records,    setRecords]    = useState<FeedPackagingRecordItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFeedPackagingRecords();
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
            <PageHeader icon="tag-multiple" iconColor="#7c3aed" title="Packaging Records" subtitle={`${records.length} record${records.length !== 1 ? "s" : ""}`} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="tag-multiple" title="No packaging records" subtitle="Packaging records will appear here after batches are packaged." iconColor="#7c3aed" />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardLeft}>
                <Text style={styles.productName}>{item.product?.name ?? "—"}</Text>
                {item.batch?.batchNumber ? (
                  <Text style={styles.batchNum}>Batch: {item.batch.batchNumber}</Text>
                ) : null}
                <Text style={styles.date}>{fmtDate(item.packagingDate)}</Text>
              </View>
              {item.labelPrinted ? (
                <Badge label="Label Printed" color="#15803d" bg="#f0fdf4" border="#bbf7d0" size="xs" />
              ) : (
                <Text style={styles.noLabel}>—</Text>
              )}
            </View>
            <View style={styles.cardBottom}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{item.bagsCount}</Text>
                <Text style={styles.statLbl}>Bags</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{item.bagWeightKg} kg</Text>
                <Text style={styles.statLbl}>Bag weight</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{item.quantityKg.toLocaleString()} kg</Text>
                <Text style={styles.statLbl}>Total</Text>
              </View>
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

  card:        { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardTop:     { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  cardLeft:    { flex: 1, gap: 2 },
  productName: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  batchNum:    { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular },
  date:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  noLabel:     { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
  cardBottom:  { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  statItem:    { flex: 1, alignItems: "center", gap: 2 },
  statVal:     { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.ink },
  statLbl:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  divider:     { width: 1, height: 28, backgroundColor: colors.border },
});
