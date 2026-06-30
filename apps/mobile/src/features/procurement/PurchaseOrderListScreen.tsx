import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchOpenPurchaseOrders, PurchaseOrderListItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  APPROVED:           { bg: "#f0fdf4", text: "#15803d", label: "Approved"           },
  SENT_TO_SUPPLIER:   { bg: "#eff6ff", text: "#1d4ed8", label: "Sent to Supplier"   },
  PARTIALLY_RECEIVED: { bg: "#fff7ed", text: "#c2410c", label: "Partially Received" },
};

function fmt(amount: number) {
  return `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function PORow({ item, onPress }: { item: PurchaseOrderListItem; onPress: () => void }) {
  const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.APPROVED;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rowTop}>
        <View style={styles.rowTopLeft}>
          <Text style={styles.poRef}>{item.reference}</Text>
          <Text style={styles.supplier}>{item.supplier.name}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Items</Text>
          <Text style={styles.metaValue}>{item._count.items}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>GRNs</Text>
          <Text style={styles.metaValue}>{item._count.grnRecords}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Expected</Text>
          <Text style={styles.metaValue}>{fmtDate(item.expectedDelivery)}</Text>
        </View>
        <View style={[styles.metaItem, styles.metaItemRight]}>
          <Text style={styles.poTotal}>{fmt(item.totalAmount)}</Text>
        </View>
      </View>
      <View style={styles.receiveRow}>
        <Text style={styles.receiveLabel}>Tap to receive goods →</Text>
      </View>
    </TouchableOpacity>
  );
}

export function PurchaseOrderListScreen() {
  const navigation = useNavigation<any>();
  const [orders,  setOrders]  = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const OPEN_STATUSES = new Set(["APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"]);
    try {
      const r = await fetchOpenPurchaseOrders();
      const all = (r.data as PurchaseOrderListItem[]) ?? [];
      setOrders(all.filter((po) => OPEN_STATUSES.has(po.status)));
    } catch {
      setError("Could not load purchase orders. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>📋</Text>
        </View>
        <View>
          <Text style={styles.title}>Open Purchase Orders</Text>
          <Text style={styles.sub}>Select a PO to create a Goods Received Note</Text>
        </View>
      </View>

      {loading && !orders.length ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <PORow
              item={item}
              onPress={() =>
                navigation.navigate("GrnCreate", {
                  poId: item.id,
                  poRef: item.reference,
                  supplierName: item.supplier.name,
                })
              }
            />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No open purchase orders</Text>
              <Text style={styles.emptyHint}>Purchase orders must be Approved or Sent to Supplier before you can receive goods</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 20 },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:   { fontSize: font.size.xs, color: colors.inkLight, flexShrink: 1 },

  row: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  rowTopLeft: { gap: 2, flex: 1 },
  poRef:    { fontSize: font.size.md, fontWeight: font.weight.extrabold, color: colors.ink },
  supplier: { fontSize: font.size.sm, color: colors.inkMid },

  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: 10, fontWeight: font.weight.bold },

  rowBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  metaItem: { flex: 1, gap: 1 },
  metaItemRight: { alignItems: "flex-end" },
  metaLabel: { fontSize: 10, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  poTotal:   { fontSize: font.size.md, fontWeight: font.weight.extrabold, color: colors.brand },

  receiveRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  receiveLabel: { fontSize: font.size.sm, color: colors.brand, fontWeight: font.weight.semibold, textAlign: "center" },

  sep: { height: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
