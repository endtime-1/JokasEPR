import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchFeedFormulas, type FeedFormula } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const FEED_TYPE_COLOR: Record<string, string> = {
  LAYER_MASH:   "#2563eb",
  BROILER_STARTER: "#d97706",
  BROILER_FINISHER: "#16a34a",
  CHICK_MASH:   "#7c3aed",
};

export function FeedFormulaListScreen() {
  const navigation = useNavigation<any>();
  const [all,        setAll]        = useState<FeedFormula[]>([]);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFeedFormulas();
      setAll((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = query.trim()
    ? all.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.code.toLowerCase().includes(query.toLowerCase()) ||
        f.feedType.toLowerCase().includes(query.toLowerCase())
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
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="flask-outline" iconColor="#16a34a" title="Feed Formulas" subtitle={`${all.length} formula${all.length !== 1 ? "s" : ""}`} />
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={colors.inkLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search formulas…"
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
          <EmptyState icon="flask-outline" title={query ? "No matching formulas" : "No formulas found"} subtitle={query ? "Try a different search term." : "Feed formulas will appear here once created."} iconColor="#16a34a" />
        }
        renderItem={({ item }) => {
          const typeColor = FEED_TYPE_COLOR[item.feedType] ?? colors.brand;
          const typeBg    = typeColor + "18";
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("FeedFormulaDetail", { formulaId: item.id })}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrap, { backgroundColor: typeBg }]}>
                <Icon name="flask-outline" size={20} color={typeColor} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.code}>{item.code} · {item.feedType.replace(/_/g, " ")}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.inkLight} />
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

  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  searchInput: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, padding: 0 },

  card:     { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  name:     { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  code:     { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
});
