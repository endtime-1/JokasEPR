import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchLowStockAlerts, fetchExpiryAlerts, LowStockAlert, ExpiryAlert } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Tab = "low_stock" | "expiry";

function LowStockRow({ item }: { item: LowStockAlert }) {
  const ratio = item.reorderLevel > 0 ? item.quantityOnHand / item.reorderLevel : 1;
  const critical = ratio < 0.5;
  return (
    <View style={[styles.row, critical && styles.rowCritical]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowProduct}>{item.product}</Text>
        <Text style={styles.rowMeta}>{item.sku} · {item.warehouse}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.stockQty, { color: critical ? colors.error : "#d97706" }]}>
          {item.quantityOnHand}
        </Text>
        <Text style={styles.reorderLabel}>min {item.reorderLevel}</Text>
      </View>
    </View>
  );
}

function ExpiryRow({ item }: { item: ExpiryAlert }) {
  const urgent = item.daysToExpiry <= 7;
  const warning = item.daysToExpiry <= 30;
  const color = urgent ? colors.error : warning ? "#d97706" : "#15803d";
  const bg    = urgent ? "#fef2f2"   : warning ? "#fff7ed"  : "#f0fdf4";
  const border = urgent ? "#fca5a5"  : warning ? "#fed7aa"  : "#bbf7d0";
  return (
    <View style={[styles.row, { borderColor: border, backgroundColor: bg }]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowProduct}>{item.product.name}</Text>
        <Text style={styles.rowMeta}>
          {item.product.sku} · {item.warehouse.name}
        </Text>
        {item.stockBatch && (
          <Text style={styles.rowBatch}>Batch: {item.stockBatch.batchNumber} · {Number(item.stockBatch.quantityRemaining)} units</Text>
        )}
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.daysBadge, { backgroundColor: color }]}>
          <Text style={styles.daysText}>{item.daysToExpiry}d</Text>
        </View>
        <Text style={[styles.expiryDate, { color }]}>
          {new Date(item.expiryDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
        </Text>
      </View>
    </View>
  );
}

export function StockAlertsScreen() {
  const navigation = useNavigation<any>();
  const [tab,          setTab]          = useState<Tab>("low_stock");
  const [lowStock,     setLowStock]     = useState<LowStockAlert[]>([]);
  const [expiry,       setExpiry]       = useState<ExpiryAlert[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [lsRes, exRes] = await Promise.all([fetchLowStockAlerts(), fetchExpiryAlerts()]);
      setLowStock((lsRes.data as LowStockAlert[]) ?? []);
      setExpiry((exRes.data as ExpiryAlert[]) ?? []);
    } catch {
      setError("Could not load alerts. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const data = tab === "low_stock" ? lowStock : expiry;
  const criticalLow    = lowStock.filter((i) => i.reorderLevel > 0 && i.quantityOnHand / i.reorderLevel < 0.5).length;
  const urgentExpiry   = expiry.filter((i) => i.daysToExpiry <= 7).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>⚠️</Text></View>
          <View>
            <Text style={styles.title}>Stock Alerts</Text>
            <Text style={styles.sub}>Low stock & upcoming expiries</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.adjBtn} onPress={() => navigation.navigate("StockAdjustment")}>
          <Text style={styles.adjBtnText}>Adjust</Text>
        </TouchableOpacity>
      </View>

      {/* Summary chips */}
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
          <Text style={[styles.chipNum, { color: colors.error }]}>{criticalLow}</Text>
          <Text style={[styles.chipLabel, { color: colors.error }]}>Critical</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.chipNum, { color: "#d97706" }]}>{lowStock.length}</Text>
          <Text style={[styles.chipLabel, { color: "#d97706" }]}>Low Stock</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
          <Text style={[styles.chipNum, { color: colors.error }]}>{urgentExpiry}</Text>
          <Text style={[styles.chipLabel, { color: colors.error }]}>Expiring ≤ 7d</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.chipNum, { color: "#d97706" }]}>{expiry.length}</Text>
          <Text style={[styles.chipLabel, { color: "#d97706" }]}>Expiry Alerts</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["low_stock", "expiry"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "low_stock" ? `Low Stock (${lowStock.length})` : `Expiry (${expiry.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !data.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) =>
            tab === "low_stock"
              ? <LowStockRow item={item as LowStockAlert} />
              : <ExpiryRow   item={item as ExpiryAlert}   />
          }
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tab === "low_stock" ? "No low-stock items" : "No expiry alerts"}
              </Text>
              <Text style={styles.emptyHint}>All stock levels are healthy</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.bg },
  list:  { padding: spacing.lg, paddingBottom: spacing.xxxl },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:   { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", alignItems: "center", justifyContent: "center" },
  iconText:   { fontSize: 20 },
  title:      { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:        { fontSize: font.size.xs, color: colors.inkLight },
  adjBtn:     { backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  adjBtnText: { color: colors.white, fontWeight: font.weight.bold, fontSize: font.size.sm },

  chipRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  chip:    { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, gap: 1 },
  chipNum: { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  chipLabel: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.3 },

  tabRow: { flexDirection: "row", margin: spacing.md, marginBottom: 0, backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tabBtn: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabBtnActive: { backgroundColor: colors.brand },
  tabLabel:     { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  tabLabelActive: { color: colors.white },

  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: "#fed7aa", padding: spacing.lg, gap: spacing.md, ...shadow.sm,
  },
  rowCritical: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  rowLeft:     { flex: 1, gap: 3 },
  rowProduct:  { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  rowMeta:     { fontSize: font.size.xs, color: colors.inkMid },
  rowBatch:    { fontSize: font.size.xs, color: colors.inkLight },
  rowRight:    { alignItems: "flex-end", gap: 4 },

  stockQty:     { fontSize: font.size.xxl, fontWeight: font.weight.extrabold },
  reorderLabel: { fontSize: font.size.xs, color: colors.inkLight },

  daysBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  daysText:  { fontSize: font.size.sm, fontWeight: font.weight.extrabold, color: colors.white },
  expiryDate: { fontSize: font.size.xs, fontWeight: font.weight.semibold },

  sep:       { height: spacing.sm },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
