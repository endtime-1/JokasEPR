import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchReportCatalog, type ReportCatalogItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import type { IconName } from "../../components/Icon";

type CategoryMeta = { color: string; bg: string; icon: IconName };

const CATEGORY_META: Record<string, CategoryMeta> = {
  "Poultry":           { color: "#d97706", bg: "#fff7ed", icon: "egg-outline"       },
  "Feed":              { color: "#10b981", bg: "#ecfdf5", icon: "silo"              },
  "Soya":              { color: "#8b5cf6", bg: "#f5f3ff", icon: "leaf"              },
  "Inventory":         { color: "#0284c7", bg: "#f0f9ff", icon: "package-variant"   },
  "Sales and Finance": { color: colors.brand, bg: colors.brandLight, icon: "chart-bar" },
};

const ALL = "All";

function ReportCard({ item, onPress }: { item: ReportCatalogItem; onPress: () => void }) {
  const meta = CATEGORY_META[item.category] ?? { color: colors.inkMid, bg: colors.bg, icon: "file-chart-outline" as IconName };
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.cardIcon, { backgroundColor: meta.bg }]}>
        <Icon name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        <View style={[styles.catPill, { backgroundColor: meta.bg, borderColor: meta.color + "44" }]}>
          <Text style={[styles.catPillText, { color: meta.color }]}>{item.category}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={colors.inkLight} />
    </TouchableOpacity>
  );
}

export function ReportsBrowserScreen() {
  const navigation = useNavigation<any>();
  const toast      = useToast();

  const [reports,  setReports]  = useState<ReportCatalogItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [category, setCategory] = useState<string>(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReportCatalog();
      setReports(res.data ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load reports catalog." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = [ALL, ...Array.from(new Set(reports.map((r) => r.category)))];
  const filtered   = category === ALL ? reports : reports.filter((r) => r.category === category);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Category filter */}
      <View style={styles.filterWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: cat }) => {
            const active = cat === category;
            const meta   = CATEGORY_META[cat];
            return (
              <TouchableOpacity
                style={[styles.filterChip, active && { borderColor: meta?.color ?? colors.brand, backgroundColor: meta?.bg ?? colors.brandLight }]}
                onPress={() => setCategory(cat)}
              >
                {meta && <Icon name={meta.icon} size={14} color={active ? meta.color : colors.inkLight} />}
                <Text style={[styles.filterText, active && { color: meta?.color ?? colors.brand, fontFamily: font.family.bold }]}>{cat}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="file-chart-outline" title="No Reports" subtitle="No reports available for this category" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <ReportCard
              item={item}
              onPress={() => navigation.navigate("ReportResult", { reportId: item.id, title: item.title })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list:   { padding: spacing.lg, paddingBottom: spacing.xxxl },

  filterWrap: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
  filterList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  filterText: { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },

  card:     { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm },
  cardIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 4 },
  cardTitle:{ fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.ink },
  cardDesc: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular, lineHeight: 16 },
  catPill:  { alignSelf: "flex-start", borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 },
  catPillText: { fontSize: 10, fontFamily: font.family.bold },
});
