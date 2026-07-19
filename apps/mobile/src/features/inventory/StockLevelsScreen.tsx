import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchInventoryOptions, type InventoryItemOption, type InventoryOption } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function StockRow({ item }: { item: InventoryItemOption }) {
  const qty = Number(item.quantityOnHand);
  const stockColor = qty <= 0 ? colors.error : qty < 10 ? "#d97706" : "#16a34a";

  return (
    <View style={styles.row}>
      <View style={[styles.qtyBadge, { backgroundColor: stockColor + "18", borderColor: stockColor + "44" }]}>
        <Text style={[styles.qtyNum, { color: stockColor }]}>{qty.toLocaleString("en-GH", { maximumFractionDigits: 2 })}</Text>
        <Text style={[styles.qtyUnit, { color: stockColor }]}>units</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.product.name}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowSku}>{item.product.sku}</Text>
          <Text style={styles.rowMetaSep}>·</Text>
          <Icon name="warehouse" size={11} color={colors.inkLight} />
          <Text style={styles.rowWarehouse}>{item.warehouse.name}</Text>
        </View>
      </View>
      <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
    </View>
  );
}

export function StockLevelsScreen() {
  const toast = useToast();

  const [items,      setItems]      = useState<InventoryItemOption[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryOption[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("ALL");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchInventoryOptions();
      setItems(res.data.items ?? []);
      setWarehouses(res.data.warehouses ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load stock levels." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((item) => {
    const matchesWarehouse = warehouseFilter === "ALL" || item.warehouseId === warehouseFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || item.product.name.toLowerCase().includes(q) || item.product.sku.toLowerCase().includes(q);
    return matchesWarehouse && matchesSearch;
  });

  const totalItems   = filtered.length;
  const zeroStock    = filtered.filter((i) => Number(i.quantityOnHand) <= 0).length;
  const lowStock     = filtered.filter((i) => { const q = Number(i.quantityOnHand); return q > 0 && q < 10; }).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Icon name="magnify" size={18} color={colors.inkLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products…"
            placeholderTextColor={colors.inkLight}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Icon name="close" size={16} color={colors.inkLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Summary chips */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Text style={styles.summaryNum}>{totalItems}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
          <Text style={[styles.summaryNum, { color: colors.error }]}>{zeroStock}</Text>
          <Text style={[styles.summaryLabel, { color: colors.error }]}>Out of stock</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.summaryNum, { color: "#d97706" }]}>{lowStock}</Text>
          <Text style={[styles.summaryLabel, { color: "#d97706" }]}>Low stock</Text>
        </View>
      </View>

      {/* Warehouse filter */}
      {warehouses.length > 1 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, warehouseFilter === "ALL" && styles.filterChipActive]}
            onPress={() => setWarehouseFilter("ALL")}
          >
            <Text style={[styles.filterChipText, warehouseFilter === "ALL" && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {warehouses.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.filterChip, warehouseFilter === w.id && styles.filterChipActive]}
              onPress={() => setWarehouseFilter(w.id)}
            >
              <Text style={[styles.filterChipText, warehouseFilter === w.id && styles.filterChipTextActive]} numberOfLines={1}>
                {w.code ?? w.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title="No stock records"
          subtitle={search ? "No items match your search" : "No inventory items found"}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <StockRow item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list:   { paddingBottom: spacing.xxxl, backgroundColor: colors.bgCard },

  searchRow:   { padding: spacing.lg, paddingBottom: spacing.sm },
  searchWrap:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44, ...shadow.sm },
  searchInput: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink },

  summaryRow:  { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  summaryChip: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, gap: 2 },
  summaryNum:  { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  summaryLabel:{ fontSize: 10, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase" },

  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexWrap: "wrap" },
  filterChip:         { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  filterChipActive:   { borderColor: colors.brand, backgroundColor: colors.brandLight },
  filterChipText:     { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  filterChipTextActive: { color: colors.brand, fontFamily: font.family.bold },

  sep: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md, backgroundColor: colors.bgCard },

  qtyBadge: { width: 64, height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 1 },
  qtyNum:   { fontSize: font.size.md, fontFamily: font.family.extrabold },
  qtyUnit:  { fontSize: 9, fontFamily: font.family.bold, textTransform: "uppercase" },

  rowInfo:     { flex: 1, gap: 2 },
  rowName:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  rowMeta:     { flexDirection: "row", alignItems: "center", gap: 4 },
  rowSku:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  rowMetaSep:  { fontSize: font.size.xs, color: colors.inkLight },
  rowWarehouse:{ fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  stockDot:    { width: 8, height: 8, borderRadius: 4 },
});
