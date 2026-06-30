import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchDebtors, DebtorItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  ISSUED:           { label: "Issued",         bg: "#eff6ff", color: "#1d4ed8" },
  PARTIALLY_PAID:   { label: "Part Paid",       bg: "#fff7ed", color: "#d97706" },
  OVERDUE:          { label: "Overdue",          bg: "#fef2f2", color: "#b91c1c" },
};

function DebtorRow({ item }: { item: DebtorItem }) {
  const sc = STATUS_CFG[item.status] ?? STATUS_CFG.ISSUED;
  const isOverdue = item.status === "OVERDUE";
  const daysOverdue = item.dueDate
    ? Math.ceil((Date.now() - new Date(item.dueDate).getTime()) / 86_400_000)
    : null;

  return (
    <View style={[styles.row, isOverdue && styles.rowOverdue]}>
      <View style={styles.rowTop}>
        <View style={styles.rowLeft}>
          <Text style={styles.customerName}>{item.customer.name}</Text>
          <Text style={styles.invoiceNum}>{item.invoiceNumber} · {item.customer.code}</Text>
          {item.dueDate && (
            <Text style={[styles.dueDate, { color: isOverdue ? "#b91c1c" : colors.inkLight }]}>
              Due: {new Date(item.dueDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
              {isOverdue && daysOverdue && daysOverdue > 0 ? `  (${daysOverdue}d overdue)` : ""}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Invoice</Text>
          <Text style={styles.amountValue}>{GHS(Number(item.totalAmount))}</Text>
        </View>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Paid</Text>
          <Text style={[styles.amountValue, { color: "#15803d" }]}>{GHS(Number(item.amountPaid))}</Text>
        </View>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Balance Due</Text>
          <Text style={[styles.amountValueLg, { color: isOverdue ? "#b91c1c" : "#d97706" }]}>
            {GHS(Number(item.balanceDue))}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function DebtorScreen() {
  const [debtors, setDebtors] = useState<DebtorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchDebtors();
      setDebtors((res.data as DebtorItem[]) ?? []);
    } catch {
      setError("Could not load debtors. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalBalance = debtors.reduce((s, d) => s + Number(d.balanceDue), 0);
  const overdueCount = debtors.filter((d) => d.status === "OVERDUE").length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>📊</Text></View>
          <View>
            <Text style={styles.title}>Debtors</Text>
            <Text style={styles.sub}>Outstanding customer balances</Text>
          </View>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.summaryNum, { color: "#d97706" }]}>{debtors.length}</Text>
          <Text style={[styles.summaryLabel, { color: "#d97706" }]}>Open</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
          <Text style={[styles.summaryNum, { color: "#b91c1c" }]}>{overdueCount}</Text>
          <Text style={[styles.summaryLabel, { color: "#b91c1c" }]}>Overdue</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardTotal]}>
          <Text style={[styles.summaryNum, { color: "#b91c1c", fontSize: font.size.lg }]}>{GHS(totalBalance)}</Text>
          <Text style={[styles.summaryLabel, { color: "#b91c1c" }]}>Total Outstanding</Text>
        </View>
      </View>

      {loading && !debtors.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={debtors}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <DebtorRow item={item} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No outstanding debtors</Text>
              <Text style={styles.emptyHint}>All invoices are settled</Text>
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:   { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", alignItems: "center", justifyContent: "center" },
  iconText:   { fontSize: 20 },
  title:      { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:        { fontSize: font.size.xs, color: colors.inkLight },

  summaryRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md },
  summaryCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: "center", gap: 2 },
  summaryCardTotal: { flex: 2, backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  summaryNum:   { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  summaryLabel: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.4 },

  row: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm,
  },
  rowOverdue: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  rowTop:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rowLeft:    { flex: 1, gap: 3 },
  customerName: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  invoiceNum:   { fontSize: font.size.xs, color: colors.inkMid },
  dueDate:      { fontSize: font.size.xs, fontWeight: font.weight.semibold },
  statusBadge:  { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusText:   { fontSize: 10, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.4 },

  amountRow:     { flexDirection: "row", gap: spacing.md },
  amountBlock:   { flex: 1, gap: 2 },
  amountLabel:   { fontSize: 9, color: colors.inkLight, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.3 },
  amountValue:   { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  amountValueLg: { fontSize: font.size.md, fontWeight: font.weight.extrabold },

  sep:       { height: spacing.md },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
