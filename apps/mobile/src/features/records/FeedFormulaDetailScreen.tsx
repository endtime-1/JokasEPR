import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchFeedFormulaDetail, type FeedFormulaDetail, type FeedFormulaIngredientDetail } from "../../api/endpoints";
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

export function FeedFormulaDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RecordsScreenProps<"FeedFormulaDetail">["route"]>();
  const toast      = useToast();
  const { formulaId } = route.params;

  const [formula,  setFormula]  = useState<FeedFormulaDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState<"overview" | "bags">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFeedFormulaDetail(formulaId);
      setFormula(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load formula." });
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

  if (!formula) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errText}>Formula not found.</Text></View>
      </SafeAreaView>
    );
  }

  const sorted = [...(formula.ingredients ?? [])].sort((a, b) => b.kgPerTonne - a.kgPerTonne);
  const maxKg  = sorted[0]?.kgPerTonne ?? 1;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Formula header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.formulaIcon}>
              <Icon name="flask" size={24} color="#16a34a" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.formulaName}>{formula.name}</Text>
              <Text style={styles.formulaCode}>{formula.code} · v{formula.version ?? 1}</Text>
              <Text style={styles.feedType}>{formula.feedType.replace(/_/g, " ")}</Text>
            </View>
            {!formula.isActive && (
              <View style={styles.inactivePill}>
                <Text style={styles.inactivePillText}>Inactive</Text>
              </View>
            )}
          </View>

          {/* KPI chips row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatChip value={`${formula.targetBatchKg.toLocaleString()} kg`} label="Target Batch" color="#d97706" />
            <StatChip value={`${formula.ingredients?.length ?? 0}`} label="Ingredients" color="#2563eb" />
            <StatChip value={GHS(formula.totalCostPerTonne)} label="Cost/Tonne" color="#7c3aed" />
            <StatChip value={GHS(formula.totalCostPerBatch)} label="Cost/Batch" color="#16a34a" />
          </ScrollView>

          {formula.finishedProduct && (
            <View style={styles.finishedRow}>
              <Icon name="package-variant" size={13} color={colors.inkLight} />
              <Text style={styles.finishedText}>Finished: {formula.finishedProduct.name} ({formula.finishedProduct.sku})</Text>
            </View>
          )}
        </View>

        {/* View toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, view === "overview" && styles.toggleBtnActive]} onPress={() => setView("overview")}>
            <Text style={[styles.toggleText, view === "overview" && styles.toggleTextActive]}>Per Tonne</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, view === "bags" && styles.toggleBtnActive]} onPress={() => setView("bags")}>
            <Text style={[styles.toggleText, view === "bags" && styles.toggleTextActive]}>Per Batch (Bags)</Text>
          </TouchableOpacity>
        </View>

        {/* Ingredients table */}
        <View style={styles.ingredientsCard}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thName]}>Ingredient</Text>
            <Text style={[styles.th, styles.thNum]}>{view === "overview" ? "kg/t" : "Bags"}</Text>
            <Text style={[styles.th, styles.thNum]}>GHS/unit</Text>
            <Text style={[styles.th, styles.thNum]}>Total</Text>
          </View>

          {sorted.map((ing: FeedFormulaIngredientDetail, i) => {
            const barW  = maxKg > 0 ? (ing.kgPerTonne / maxKg) * 100 : 0;
            const isLast = i === sorted.length - 1;
            return (
              <View key={ing.id} style={[styles.ingRow, isLast && styles.ingRowLast]}>
                <View style={styles.ingNameCol}>
                  <Text style={styles.ingName} numberOfLines={1}>{ing.product.name}</Text>
                  <Text style={styles.ingSku}>{ing.product.sku}</Text>
                  {/* Proportion bar */}
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${barW}%` as any }]} />
                  </View>
                  <Text style={styles.ingPct}>{ing.percentageInFormula.toFixed(1)}%</Text>
                </View>
                <Text style={[styles.td, styles.thNum]}>
                  {view === "overview"
                    ? ing.kgPerTonne.toFixed(1)
                    : `${ing.bagsPerTonne.toFixed(2)}\n${ing.bagWeightKg > 0 ? `(${ing.bagWeightKg}kg bags)` : ""}`}
                </Text>
                <Text style={[styles.td, styles.thNum]}>{GHS(ing.unitCostGhs)}</Text>
                <Text style={[styles.td, styles.thNum, styles.tdBold]}>{GHS(ing.totalCostGhs)}</Text>
              </View>
            );
          })}

          {/* Totals row */}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.thName]}>TOTAL (per tonne)</Text>
            <Text style={[styles.totalLabel, styles.thNum]}>{sorted.reduce((s, i) => s + i.kgPerTonne, 0).toFixed(0)} kg</Text>
            <Text style={[styles.totalLabel, styles.thNum]}></Text>
            <Text style={[styles.totalValue, styles.thNum]}>{GHS(formula.totalCostPerTonne)}</Text>
          </View>
        </View>

        {/* Create order shortcut */}
        <TouchableOpacity style={styles.orderBtn} onPress={() => navigation.navigate("FeedProductionOrderCreate")} activeOpacity={0.8}>
          <Icon name="plus-circle-outline" size={18} color={colors.brand} />
          <Text style={styles.orderBtnText}>Create Production Order with this Formula</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errText: { fontSize: font.size.sm, color: colors.error },

  headerCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.md },
  headerTop:   { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  formulaIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
  headerText:  { flex: 1, gap: 3 },
  formulaName: { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  formulaCode: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  feedType:    { fontSize: font.size.sm, color: "#16a34a", fontFamily: font.family.semibold },
  inactivePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" },
  inactivePillText: { fontSize: font.size.xs, fontFamily: font.family.bold, color: "#dc2626" },

  statsRow: { gap: spacing.sm, paddingVertical: 2 },
  statChip: { alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, minWidth: 90, gap: 2 },
  statChipVal: { fontSize: font.size.sm, fontFamily: font.family.extrabold },
  statChipLbl: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },

  finishedRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  finishedText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  toggleRow:       { flexDirection: "row", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  toggleBtn:       { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  toggleBtnActive: { backgroundColor: colors.brand },
  toggleText:      { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  toggleTextActive:{ color: colors.white, fontFamily: font.family.bold },

  ingredientsCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },

  tableHeader: { flexDirection: "row", backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  th:          { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  thName:      { flex: 2 },
  thNum:       { flex: 1, textAlign: "right" },

  ingRow:     { flexDirection: "row", alignItems: "flex-start", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  ingRowLast: { borderBottomWidth: 0 },
  ingNameCol: { flex: 2, gap: 3 },
  ingName:    { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  ingSku:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  barBg:      { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  barFill:    { height: 3, backgroundColor: "#16a34a", borderRadius: 2 },
  ingPct:     { fontSize: font.size.xs, color: "#16a34a", fontFamily: font.family.bold },

  td:     { fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.inkMid, textAlign: "right", flex: 1 },
  tdBold: { fontFamily: font.family.extrabold, color: colors.ink },

  totalRow:   { flexDirection: "row", backgroundColor: colors.bg, borderTopWidth: 1.5, borderTopColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  totalLabel: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  totalValue: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  orderBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg, backgroundColor: colors.brandLight },
  orderBtnText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.brand },
});
