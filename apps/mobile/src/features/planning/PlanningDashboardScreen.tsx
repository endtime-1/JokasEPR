import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchMarketTargets, MarketTarget } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: "Draft",     color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  SUBMITTED: { label: "Submitted", color: "#d97706", bg: "#fff7ed", border: "#fed7aa" },
  APPROVED:  { label: "Approved",  color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  REJECTED:  { label: "Rejected",  color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
  CLOSED:    { label: "Closed",    color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function TargetRow({ item, onPress }: { item: MarketTarget; onPress: () => void }) {
  const sc = STATUS_CFG[item.status] ?? STATUS_CFG.DRAFT;
  const totalKg = (item.items ?? []).reduce((s, i) => s + Number(i.targetQuantityKg), 0);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
    <View style={[styles.row, { borderColor: sc.border, backgroundColor: sc.bg }]}>
      <View style={styles.rowTop}>
        <View style={styles.rowLeft}>
          {item.targetNumber && <Text style={styles.targetNum}>{item.targetNumber}</Text>}
          <Text style={styles.period}>
            {fmt(item.periodStart)} → {fmt(item.periodEnd)}
          </Text>
          {(item.items?.length ?? 0) > 0 && (
            <Text style={styles.itemsSub}>
              {item.items!.length} product{item.items!.length !== 1 ? "s" : ""} · {totalKg.toFixed(0)} kg total target
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.color }]}>
          <Text style={styles.statusText}>{sc.label}</Text>
        </View>
      </View>

      {(item.items?.length ?? 0) > 0 && (
        <View style={styles.itemList}>
          {item.items!.slice(0, 3).map((itm) => (
            <View key={itm.id} style={styles.itemRow}>
              <Text style={styles.itemName}>{itm.product?.name ?? "—"}</Text>
              <Text style={styles.itemQty}>{Number(itm.targetQuantityKg).toFixed(0)} kg</Text>
            </View>
          ))}
          {(item.items?.length ?? 0) > 3 && (
            <Text style={styles.moreItems}>+{item.items!.length - 3} more products</Text>
          )}
        </View>
      )}

      {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
    </View>
    </TouchableOpacity>
  );
}

export function PlanningDashboardScreen() {
  const navigation = useNavigation<any>();
  const [targets, setTargets] = useState<MarketTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMarketTargets();
      setTargets((res.data as MarketTarget[]) ?? []);
    } catch {
      setError("Could not load planning targets. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approvedCount  = targets.filter((t) => t.status === "APPROVED").length;
  const submittedCount = targets.filter((t) => t.status === "SUBMITTED").length;
  const draftCount     = targets.filter((t) => t.status === "DRAFT").length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>🎯</Text></View>
          <View>
            <Text style={styles.title}>Market Planning</Text>
            <Text style={styles.sub}>Production targets · read-only</Text>
          </View>
        </View>
      </View>

      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
          <Text style={[styles.chipNum, { color: "#15803d" }]}>{approvedCount}</Text>
          <Text style={[styles.chipLabel, { color: "#15803d" }]}>Approved</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.chipNum, { color: "#d97706" }]}>{submittedCount}</Text>
          <Text style={[styles.chipLabel, { color: "#d97706" }]}>Pending</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" }]}>
          <Text style={[styles.chipNum, { color: "#475569" }]}>{draftCount}</Text>
          <Text style={[styles.chipLabel, { color: "#475569" }]}>Draft</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.brandLight, borderColor: colors.brandMid }]}>
          <Text style={[styles.chipNum, { color: colors.brand }]}>{targets.length}</Text>
          <Text style={[styles.chipLabel, { color: colors.brand }]}>Total</Text>
        </View>
      </View>

      {loading && !targets.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={targets}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <TargetRow item={item} onPress={() => navigation.navigate("MarketTargetDetail", { targetId: item.id })} />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No targets set</Text>
              <Text style={styles.emptyHint}>Create a target to start tracking production volumes</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => navigation.navigate("MarketTargetCreate")}
                activeOpacity={0.8}
              >
                <Text style={styles.createBtnText}>+ Create Market Target</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:   { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  iconText:   { fontSize: 20 },
  title:      { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:        { fontSize: font.size.xs, color: colors.inkLight },

  chipRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  chip:    { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, gap: 1 },
  chipNum: { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  chipLabel: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.3 },

  row: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  rowTop:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rowLeft:    { flex: 1, gap: 3 },
  targetNum:  { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  period:     { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  itemsSub:   { fontSize: font.size.xs, color: colors.inkLight },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusText:  { fontSize: 9, fontWeight: font.weight.extrabold, color: colors.white, letterSpacing: 0.5 },

  itemList: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: spacing.sm },
  itemRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { fontSize: font.size.sm, color: colors.ink },
  itemQty:  { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkMid },
  moreItems: { fontSize: font.size.xs, color: colors.inkLight, fontStyle: "italic" },

  notes: { fontSize: font.size.xs, color: colors.inkLight, fontStyle: "italic" },

  sep:       { height: spacing.md },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
  createBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  createBtnText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
