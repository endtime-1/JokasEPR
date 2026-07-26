import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { useToast } from "../../components/Toast";
import { fetchFeedFormulaCosting, type FeedFormulaCostingData } from "../../api/endpoints";
import type { RecordsScreenProps } from "../../navigation/types";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatChip({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={[styles.statChip, { borderColor: color + "40", backgroundColor: color + "12" }]}>
      <Text style={[styles.statChipVal, { color }]}>{value}</Text>
      <Text style={styles.statChipLbl}>{label}</Text>
    </View>
  );
}

export function FeedFormulaCostingScreen() {
  const route   = useRoute<RecordsScreenProps<"FeedFormulaCosting">["route"]>();
  const toast   = useToast();
  const { formulaId, formulaName } = route.params;

  const [data,    setData]    = useState<FeedFormulaCostingData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFeedFormulaCosting(formulaId);
      setData(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load costing data." });
    } finally {
      setLoading(false);
    }
  }, [formulaId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errText}>Costing data not available.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header card */}
        <View style={styles.headerCard}>
          <Text style={styles.formulaName}>{formulaName}</Text>
          <Text style={styles.formulaCode}>{data.formulaCode} · {data.feedType.replace(/_/g, " ")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatChip value={`${data.targetBatchKg.toLocaleString()} kg`} label="Batch Size" color="#d97706" />
            <StatChip value={GHS(data.totalCostPerTonne)} label="Cost/Tonne" color="#7c3aed" />
            <StatChip value={GHS(data.totalCostPerBatch)} label="Cost/Batch" color="#16a34a" />
          </ScrollView>
        </View>

        {/* Ingredient cost table */}
        <View style={styles.tableCard}>
          <Text style={styles.tableTitle}>Ingredient Cost Breakdown</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thName]}>Ingredient</Text>
            <Text style={[styles.th, styles.thNum]}>kg/t</Text>
            <Text style={[styles.th, styles.thNum]}>GHS/unit</Text>
            <Text style={[styles.th, styles.thNum]}>Total</Text>
            <Text style={[styles.th, styles.thNum]}>%</Text>
          </View>
          {data.ingredientCosts.map((ing, i) => {
            const isLast = i === data.ingredientCosts.length - 1;
            return (
              <View key={i} style={[styles.row, isLast && styles.rowLast]}>
                <View style={[styles.thName, { gap: 1 }]}>
                  <Text style={styles.ingName} numberOfLines={1}>{ing.product.name}</Text>
                  <Text style={styles.ingSku}>{ing.product.sku}</Text>
                </View>
                <Text style={[styles.td, styles.thNum]}>{ing.kgPerTonne.toFixed(1)}</Text>
                <Text style={[styles.td, styles.thNum]}>{GHS(ing.unitCostGhs)}</Text>
                <Text style={[styles.td, styles.thNum, styles.tdBold]}>{GHS(ing.totalCostGhs)}</Text>
                <Text style={[styles.td, styles.thNum]}>{ing.percentageInFormula.toFixed(1)}%</Text>
              </View>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.thName]}>TOTAL</Text>
            <Text style={[styles.totalLabel, styles.thNum]}></Text>
            <Text style={[styles.totalLabel, styles.thNum]}></Text>
            <Text style={[styles.totalValue, styles.thNum]}>{GHS(data.totalCostPerTonne)}</Text>
            <Text style={[styles.totalLabel, styles.thNum]}>100%</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errText:{ fontSize: font.size.sm, color: colors.error },

  headerCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.md },
  formulaName: { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  formulaCode: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  statsRow:    { gap: spacing.sm, paddingVertical: 2 },
  statChip:    { alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, minWidth: 90, gap: 2 },
  statChipVal: { fontSize: font.size.sm, fontFamily: font.family.extrabold },
  statChipLbl: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },

  tableCard:   { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  tableTitle:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, padding: spacing.lg, paddingBottom: 0 },
  tableHeader: { flexDirection: "row", backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.sm },
  th:          { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  thName:      { flex: 2 },
  thNum:       { flex: 1, textAlign: "right" },

  row:         { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLast:     { borderBottomWidth: 0 },
  ingName:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  ingSku:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  td:          { fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.inkMid, textAlign: "right", flex: 1 },
  tdBold:      { fontFamily: font.family.extrabold, color: colors.ink },

  totalRow:    { flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderTopWidth: 1.5, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  totalLabel:  { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  totalValue:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink, flex: 1, textAlign: "right" },
});
