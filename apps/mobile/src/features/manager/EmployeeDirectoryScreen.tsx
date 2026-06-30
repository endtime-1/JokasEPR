import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchEmployees, EmployeeItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = ["#f58220", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#ef4444", "#22c55e"];

function EmployeeRow({ item }: { item: EmployeeItem }) {
  const colorIdx  = item.code.charCodeAt(0) % AVATAR_COLORS.length;
  const avatarBg  = AVATAR_COLORS[colorIdx];
  const isActive  = item.status === "ACTIVE";
  const location  = item.farm?.name ?? item.branch?.name ?? "";

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Text style={styles.avatarText}>{initials(item.fullName)}</Text>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{item.fullName}</Text>
          <View style={[styles.statusBadge,
            isActive
              ? { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
              : { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" }
          ]}>
            <Text style={[styles.statusText, { color: isActive ? "#15803d" : "#64748b" }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.roleLine}>
          {item.employeeRole?.name ?? "—"}
          {location ? ` · ${location}` : ""}
        </Text>
        <Text style={styles.codeLine}>#{item.code}{item.phone ? ` · ${item.phone}` : ""}</Text>
      </View>
    </View>
  );
}

export function EmployeeDirectoryScreen() {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchEmployees();
      setEmployees((res.data as EmployeeItem[]) ?? []);
    } catch {
      setError("Could not load employees. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.phone ?? "").includes(q) ||
        (e.employeeRole?.name ?? "").toLowerCase().includes(q)
    );
  }, [employees, search]);

  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>👥</Text></View>
          <View>
            <Text style={styles.title}>Employee Directory</Text>
            <Text style={styles.sub}>{activeCount} active of {employees.length} total</Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, code, or role…"
            placeholderTextColor={colors.inkLight}
            autoCorrect={false}
          />
        </View>
      </View>

      {loading && !employees.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <EmployeeRow item={item} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{search ? "No matches found" : "No employees"}</Text>
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
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
    padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:  { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", alignItems: "center", justifyContent: "center" },
  iconText:  { fontSize: 20 },
  title:     { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:       { fontSize: font.size.xs, color: colors.inkLight },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  searchIcon:  { fontSize: 14 },
  searchInput: { flex: 1, fontSize: font.size.sm, color: colors.ink, paddingVertical: 0 },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm,
  },
  avatar:      { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText:  { color: colors.white, fontWeight: font.weight.extrabold, fontSize: font.size.md },
  rowContent:  { flex: 1, gap: 3 },
  rowTop:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name:        { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink, flex: 1 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.4 },
  roleLine:    { fontSize: font.size.xs, color: colors.inkMid },
  codeLine:    { fontSize: font.size.xs, color: colors.inkLight },

  sep:       { height: spacing.sm },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
});
