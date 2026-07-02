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
import { fetchOpenFeedOrders, type FeedOrder } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  DRAFT:     { ...semantic.status.draft,      label: "Draft"       },
  PENDING:   { ...semantic.status.pending,    label: "Pending"     },
  APPROVED:  { ...semantic.status.approved,   label: "Approved"    },
  IN_PROGRESS: { ...semantic.status.inProgress, label: "In Progress" },
  COMPLETED: { ...semantic.status.approved,   label: "Completed"   },
  CANCELLED: { ...semantic.status.rejected,   label: "Cancelled"   },
};

const SEGMENTS = [
  { key: "ALL",         label: "All"         },
  { key: "PENDING",     label: "Pending"     },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED",   label: "Completed"   },
];

export function FeedProductionOrderListScreen() {
  const navigation = useNavigation<any>();
  const [all,        setAll]        = useState<FeedOrder[]>([]);
  const [tab,        setTab]        = useState("ALL");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchOpenFeedOrders();
      setAll((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = tab === "ALL" ? all : all.filter((o) => o.status === tab);

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
              icon="factory"
              iconColor="#d97706"
              title="Production Orders"
              subtitle={`${all.length} total`}
              right={
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("FeedProductionOrderCreate")} activeOpacity={0.8}>
                  <Icon name="plus" size={18} color={colors.white} />
                </TouchableOpacity>
              }
            />
            <SegmentedControl segments={SEGMENTS} active={tab} onChange={setTab} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="factory" title="No production orders" subtitle="Tap + to create a new production order." iconColor="#d97706" actionLabel="New Order" onAction={() => navigation.navigate("FeedProductionOrderCreate")} />
        }
        renderItem={({ item }) => {
          const s = STATUS_META[item.status] ?? STATUS_META.DRAFT;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("FeedProductionOrderDetail", { orderId: item.id })}
              activeOpacity={0.8}
            >
              <View style={styles.cardLeft}>
                <View style={styles.iconWrap}>
                  <Icon name="factory" size={20} color="#d97706" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.orderNum}>{item.orderNumber}</Text>
                  {item.formula ? <Text style={styles.formula}>{item.formula.name} ({item.formula.code})</Text> : null}
                  <Text style={styles.date}>{new Date(item.scheduledDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
                <Text style={styles.qty}>{item.plannedQuantityKg.toLocaleString()} kg</Text>
                <Icon name="chevron-right" size={16} color={colors.inkLight} />
              </View>
            </TouchableOpacity>
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

  card:      { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:  { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#fffbeb", alignItems: "center", justifyContent: "center" },
  cardText:  { flex: 1, gap: 2 },
  orderNum:  { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  formula:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  date:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRight: { alignItems: "flex-end", gap: 4 },
  qty:       { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
});
