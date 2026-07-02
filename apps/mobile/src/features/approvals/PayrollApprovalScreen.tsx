import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { useToast } from "../../components/Toast";
import { approvePayroll, fetchPayrollRuns, type PayrollRun } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING_APPROVAL: { ...semantic.status.pending,    label: "Pending"  },
  APPROVED:         { ...semantic.status.approved,   label: "Approved" },
  PAID:             { ...semantic.status.approved,   label: "Paid"     },
  DRAFT:            { ...semantic.status.draft,      label: "Draft"    },
};

export function PayrollApprovalScreen() {
  const toast = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchPayrollRuns();
      setRuns((res.data as any) ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load payroll runs." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id: string) {
    setApproving(id);
    try {
      await approvePayroll(id);
      toast.show({ type: "success", message: "Payroll approved." });
      await load(true);
    } catch {
      toast.show({ type: "error", message: "Approval failed. Try again." });
    } finally {
      setApproving(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <PageHeader icon="account-cash" iconColor="#7c3aed" title="Payroll Runs" subtitle={`${runs.length} run${runs.length !== 1 ? "s" : ""} found`} />
        }
        ListEmptyComponent={
          <EmptyState icon="account-cash" title="No payroll runs" subtitle="Payroll runs will appear here once created." iconColor="#7c3aed" />
        }
        renderItem={({ item }) => {
          const s = STATUS[item.status] ?? STATUS.DRAFT;
          const isPending = item.status === "PENDING_APPROVAL";
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={styles.iconWrap}>
                    <Icon name="account-group" size={20} color="#7c3aed" />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.ref}>{item.reference}</Text>
                    <Text style={styles.period}>{item.period}</Text>
                  </View>
                </View>
                <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{GHS(item.totalAmount)}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{item.employeeCount}</Text>
                  <Text style={styles.statLabel}>Employees</Text>
                </View>
              </View>
              {isPending && (
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleApprove(item.id)}
                  disabled={approving === item.id}
                  activeOpacity={0.8}
                >
                  {approving === item.id ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Icon name="check-circle" size={16} color={colors.white} />
                      <Text style={styles.approveBtnText}>Approve Payroll</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pad:  { padding: spacing.xl },

  card:        { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardTop:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cardLeft:    { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:    { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#f5f3ff", alignItems: "center", justifyContent: "center" },
  cardText:    { flex: 1, gap: 2 },
  ref:         { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  period:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  statsRow:    { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  stat:        { flex: 1, alignItems: "center", gap: 2 },
  statValue:   { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  statLabel:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  approveBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#16a34a", borderRadius: radius.lg, paddingVertical: spacing.md },
  approveBtnText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
