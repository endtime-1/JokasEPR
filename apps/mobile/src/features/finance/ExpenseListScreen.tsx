import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchExpenses, ExpenseRecord } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  PENDING:          { bg: "#f1f5f9", text: "#475569", label: "Pending"           },
  PENDING_APPROVAL: { bg: "#fff7ed", text: "#c2410c", label: "Needs Approval"   },
  APPROVED:         { bg: "#f0fdf4", text: "#15803d", label: "Approved"          },
  REJECTED:         { bg: "#fef2f2", text: "#b91c1c", label: "Rejected"          },
  CANCELLED:        { bg: "#f8fafc", text: "#94a3b8", label: "Cancelled"         },
};

function fmt(amount: number) {
  return `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function ExpenseRow({ item }: { item: ExpenseRecord }) {
  const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.PENDING;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.rowMeta}>
          {item.category?.name ?? "—"}{item.branch ? ` · ${item.branch.name}` : ""}
        </Text>
        <Text style={styles.rowDate}>{fmtDate(item.expenseDate)}  ·  {item.reference}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{fmt(item.amount)}</Text>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
        </View>
      </View>
    </View>
  );
}

export function ExpenseListScreen() {
  const navigation = useNavigation<any>();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchExpenses();
      setExpenses((r.data as ExpenseRecord[]) ?? []);
    } catch {
      setError("Could not load expenses. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>💸</Text></View>
          <View>
            <Text style={styles.title}>My Expenses</Text>
            <Text style={styles.sub}>Recent expense submissions</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("ExpenseNew")}>
          <Text style={styles.newBtnText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      {loading && !expenses.length ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ExpenseRow item={item} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No expenses yet</Text>
              <Text style={styles.emptyHint}>Tap "＋ New" to log your first expense</Text>
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
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 20 },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:   { fontSize: font.size.xs, color: colors.inkLight },
  newBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, ...shadow.brand },
  newBtnText: { color: colors.white, fontWeight: font.weight.bold, fontSize: font.size.sm },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.sm,
  },
  rowLeft: { flex: 1, gap: 3 },
  rowDesc: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  rowMeta: { fontSize: font.size.xs, color: colors.inkMid },
  rowDate: { fontSize: font.size.xs, color: colors.inkLight },

  rowRight: { alignItems: "flex-end", gap: spacing.xs },
  rowAmount: { fontSize: font.size.md, fontWeight: font.weight.extrabold, color: colors.brand },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: 10, fontWeight: font.weight.bold },

  sep: { height: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
