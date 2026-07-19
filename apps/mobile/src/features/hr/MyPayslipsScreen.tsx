import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchMyPayslips, type PayslipRecord } from "../../api/endpoints";
import { colors, font, radius, shadow, semantic, spacing } from "../../constants/theme";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:    { label: "Draft",   ...semantic.status.draft    },
  APPROVED: { label: "Approved",...semantic.status.approved },
  PAID:     { label: "Paid",    ...semantic.status.approved },
};

function money(v: number | string) {
  return `GHS ${Number(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function PayslipCard({ item }: { item: PayslipRecord }) {
  const sc = STATUS_CFG[item.status] ?? { label: item.status, ...semantic.status.draft };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.periodWrap}>
          <Icon name="calendar-month-outline" size={16} color={colors.brand} />
          <Text style={styles.period}>{item.period}</Text>
        </View>
        <Badge label={sc.label} color={sc.color} bg={sc.bg} border={sc.border} />
      </View>
      <Text style={styles.ref}>{item.reference}</Text>

      {/* Pay breakdown */}
      <View style={styles.breakdown}>
        <Row label="Basic Salary"  value={money(item.basicSalary)}  />
        {Number(item.allowances) > 0  && <Row label="Allowances"   value={`+ ${money(item.allowances)}`}  positive />}
        {Number(item.deductions) > 0  && <Row label="Deductions"   value={`− ${money(item.deductions)}`}  negative />}
        {Number(item.taxDeduction) > 0 && <Row label="Tax"         value={`− ${money(item.taxDeduction)}`} negative />}
        {Number(item.ssnit) > 0       && <Row label="SSNIT"        value={`− ${money(item.ssnit)}`}        negative />}
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>NET PAY</Text>
          <Text style={styles.netValue}>{money(item.netPay)}</Text>
        </View>
      </View>

      {/* Footer */}
      {(item.paymentDate || item.paymentMethod) && (
        <View style={styles.footer}>
          {item.paymentDate && (
            <View style={styles.footerItem}>
              <Icon name="bank-transfer" size={13} color={colors.inkLight} />
              <Text style={styles.footerText}>Paid {fmt(item.paymentDate)}</Text>
            </View>
          )}
          {item.paymentMethod && (
            <View style={styles.footerItem}>
              <Icon name="credit-card-outline" size={13} color={colors.inkLight} />
              <Text style={styles.footerText}>{item.paymentMethod.replace(/_/g, " ")}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const valueColor = positive ? "#16a34a" : negative ? colors.error : colors.ink;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

export function MyPayslipsScreen() {
  const toast = useToast();
  const [slips,      setSlips]      = useState<PayslipRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchMyPayslips();
      setSlips(res.data ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load payslips." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {slips.length === 0 ? (
        <EmptyState
          icon="file-account-outline"
          title="No Payslips"
          subtitle="Your payslip records will appear here once payroll has been processed for your account."
        />
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => <PayslipCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list:   { padding: spacing.xl, paddingBottom: spacing.xxxl },

  card:       { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  periodWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  period:     { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  ref:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  breakdown: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  row:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel:   { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular },
  rowValue:   { fontSize: font.size.xs, fontFamily: font.family.semibold },
  netRow:     { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  netLabel:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
  netValue:   { fontSize: font.size.lg - 1, fontFamily: font.family.extrabold, color: colors.brand },

  footer:     { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
