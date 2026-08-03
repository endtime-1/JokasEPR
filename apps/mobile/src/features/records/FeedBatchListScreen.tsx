import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFeedBatches, type FeedBatchItem } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

function statusToken(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETED":   return semantic.status.approved;
    case "PENDING":     return semantic.status.pending;
    case "CANCELLED":   return semantic.status.rejected;
    case "IN_PROGRESS": return semantic.status.inProgress;
    default:            return semantic.status.draft;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TABS = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export function FeedBatchListScreen() {
  const [batches,    setBatches]    = useState<FeedBatchItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTab,  setStatusTab]  = useState<string>("ALL");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFeedBatches();
      setBatches((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filtered = statusTab === "ALL" ? batches : batches.filter((b) => b.status === statusTab);

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
        data={filtered}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <PageHeader icon="package-variant" iconColor="#d97706" title="Production Batches" subtitle={`${filtered.length} batch${filtered.length !== 1 ? "es" : ""}`} />
            </View>
            <View style={styles.filterRow}>
              {STATUS_TABS.map((tab) => (
                <TouchableOpacity key={tab} style={[styles.filterTab, statusTab === tab && styles.filterTabActive]} onPress={() => setStatusTab(tab)}>
                  <Text style={[styles.filterTabText, statusTab === tab && styles.filterTabTextActive]}>{tab === "ALL" ? "All" : tab.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState icon="package-variant" title="No production batches" subtitle="Batches will appear here after production runs are recorded." iconColor="#d97706" />
        }
        renderItem={({ item }) => {
          const tok = statusToken(item.status);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <Text style={styles.batchNum}>{item.batchNumber}</Text>
                  {item.order?.formula?.name ? (
                    <Text style={styles.formulaName}>{item.order.formula.name}</Text>
                  ) : null}
                  {item.order?.orderNumber ? (
                    <Text style={styles.orderNum}>Order: {item.order.orderNumber}</Text>
                  ) : null}
                  {item.productionSite?.name ? (
                    <Text style={styles.site}>{item.productionSite.name}</Text>
                  ) : null}
                </View>
                <Badge label={item.status.replace(/_/g, " ")} color={tok.color} bg={tok.bg} border={tok.border} />
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.qty}>{item.producedQuantityKg.toLocaleString()} kg produced</Text>
                <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  list:    { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:     { padding: spacing.xl },
  header:  { marginBottom: spacing.md },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
  filterTab: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  filterTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTabText: { fontSize: font.size.xs, fontWeight: font.weight.medium, color: colors.inkLight },
  filterTabTextActive: { color: colors.white },

  card:       { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  cardTop:    { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  cardLeft:   { flex: 1, gap: 3 },
  batchNum:   { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  formulaName:{ fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.inkMid },
  orderNum:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  site:       { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  qty:        { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.inkMid },
  date:       { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
