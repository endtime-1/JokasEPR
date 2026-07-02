import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchCustomers } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Customer = { id: string; name: string; code: string };

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
const colorFor = (id: string) => COLORS[id.charCodeAt(0) % COLORS.length];

export function CustomerListScreen() {
  const navigation = useNavigation<any>();
  const [all,        setAll]        = useState<Customer[]>([]);
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchCustomers();
      setAll((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = query.trim()
    ? all.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.code.toLowerCase().includes(query.toLowerCase())
      )
    : all;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={6} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={displayed}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="account-group" iconColor="#7c3aed" title="Customers" subtitle={`${all.length} customer${all.length !== 1 ? "s" : ""}`} />
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={colors.inkLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or code…"
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
          <EmptyState icon="account-group" title={query ? "No matching customers" : "No customers yet"} subtitle="Customers will appear here once created." iconColor="#7c3aed" />
        }
        renderItem={({ item }) => {
          const color    = colorFor(item.id);
          const initials = item.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate("CustomerDetail", { customerId: item.id, customerName: item.name })}
              activeOpacity={0.8}
            >
              <View style={[styles.avatar, { backgroundColor: color + "18" }]}>
                <Text style={[styles.avatarText, { color }]}>{initials}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.code}>{item.code}</Text>
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

  row:        { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.size.md, fontFamily: font.family.extrabold },
  rowText:    { flex: 1, gap: 2 },
  name:       { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  code:       { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
