import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchStorefrontProducts, updateStorefrontProduct, type StorefrontProduct } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const CATEGORY_COLORS: Record<string, string> = {
  "Feed":             "#10b981",
  "Eggs & Poultry":   "#f58220",
  "Soya Products":    "#d97706",
};

function ProductRow({
  product,
  onToggle,
}: {
  product: StorefrontProduct;
  onToggle: (p: StorefrontProduct) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const toast = useToast();

  async function handleToggle(val: boolean) {
    setToggling(true);
    try {
      const updated = await updateStorefrontProduct(product.id, { isPublic: val });
      onToggle(updated.data as StorefrontProduct);
    } catch {
      toast.show({ type: "error", message: "Failed to update product." });
    } finally {
      setToggling(false);
    }
  }

  const catColor = product.storefrontCategory
    ? CATEGORY_COLORS[product.storefrontCategory] ?? colors.inkMid
    : colors.inkLight;

  return (
    <View style={styles.row}>
      {/* Category indicator */}
      <View style={[styles.catDot, { backgroundColor: catColor }]} />

      {/* Product info */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{product.name}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowSku}>{product.sku}</Text>
          {product.storefrontCategory && (
            <>
              <Text style={styles.rowMetaSep}>·</Text>
              <Text style={[styles.rowCat, { color: catColor }]}>{product.storefrontCategory}</Text>
            </>
          )}
          {product.unitPrice != null && (
            <>
              <Text style={styles.rowMetaSep}>·</Text>
              <Text style={styles.rowPrice}>GHS {Number(product.unitPrice).toLocaleString()}</Text>
            </>
          )}
        </View>
      </View>

      {/* Publish toggle */}
      <View style={styles.toggleWrap}>
        {toggling ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <>
            <Text style={[styles.toggleLabel, { color: product.isPublic ? "#16a34a" : colors.inkLight }]}>
              {product.isPublic ? "Live" : "Hidden"}
            </Text>
            <Switch
              value={product.isPublic}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.brandMid }}
              thumbColor={product.isPublic ? colors.brand : colors.inkLight}
              ios_backgroundColor={colors.border}
            />
          </>
        )}
      </View>
    </View>
  );
}

export function StorefrontProductsScreen() {
  const toast = useToast();

  const [products,   setProducts]   = useState<StorefrontProduct[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");

  const publishedCount = products.filter((p) => p.isPublic).length;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchStorefrontProducts(search || undefined);
      setProducts(res.data ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load products." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function handleToggle(updated: StorefrontProduct) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search + summary row */}
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <Icon name="magnify" size={18} color={colors.inkLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products…"
            placeholderTextColor={colors.inkLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => load()}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Icon name="close" size={16} color={colors.inkLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.summaryPill}>
          <Icon name="check-circle" size={14} color="#16a34a" />
          <Text style={styles.summaryText}>{publishedCount} live</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : products.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title="No products"
          subtitle={search ? "No products match your search" : "No products in the catalog yet"}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProductRow product={item} onToggle={handleToggle} />}
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
  list:   { paddingBottom: spacing.xxxl },

  topBar:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44, ...shadow.sm },
  searchInput:{ flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink },

  summaryPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f0fdf4", borderRadius: radius.full, borderWidth: 1, borderColor: "#bbf7d0", paddingHorizontal: spacing.sm, paddingVertical: 6 },
  summaryText: { fontSize: font.size.xs, fontFamily: font.family.bold, color: "#16a34a" },

  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },

  row:     { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md, backgroundColor: colors.bgCard },
  catDot:  { width: 10, height: 10, borderRadius: 5 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowSku:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  rowMetaSep:  { fontSize: font.size.xs, color: colors.inkLight },
  rowCat:      { fontSize: font.size.xs, fontFamily: font.family.semibold },
  rowPrice:    { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.semibold },

  toggleWrap:  { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  toggleLabel: { fontSize: 11, fontFamily: font.family.bold },
});
