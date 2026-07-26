import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFeedIngredients, type FeedIngredientItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FeedIngredientsScreen() {
  const [all,        setAll]        = useState<FeedIngredientItem[]>([]);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFeedIngredients();
      setAll((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = query.trim()
    ? all.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.code.toLowerCase().includes(query.toLowerCase()) ||
        i.product.sku.toLowerCase().includes(query.toLowerCase())
      )
    : all;

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
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="grain" iconColor="#92400e" title="Raw Material Catalog" subtitle={`${all.length} ingredient${all.length !== 1 ? "s" : ""}`} />
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={colors.inkLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, code or SKU…"
                placeholderTextColor={colors.inkLight}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                  <Icon name="close-circle" size={16} color={colors.inkLight} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="grain"
            title={query ? "No matching ingredients" : "No ingredients found"}
            subtitle={query ? "Try a different search term." : "Raw material ingredients will appear here once configured."}
            iconColor="#92400e"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Icon name="grain" size={20} color="#92400e" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.code}>{item.code} · {item.product.sku}</Text>
            </View>
            {item.unitCost != null ? (
              <Text style={styles.cost}>{GHS(item.unitCost)}</Text>
            ) : (
              <Text style={styles.costNone}>—</Text>
            )}
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
  header:      { gap: spacing.md, marginBottom: spacing.md },

  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  searchInput: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, padding: 0 },

  card:     { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#92400e18", alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  name:     { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  code:     { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  cost:     { fontSize: font.size.sm, fontFamily: font.family.bold, color: "#92400e" },
  costNone: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
});
