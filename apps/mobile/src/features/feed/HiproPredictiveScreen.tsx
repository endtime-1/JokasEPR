import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchHiproPredictive, fetchWarehouses, simulateHiproPredictive } from "../../api/endpoints";
import type { HiproPredictiveFormula, HiproPredictiveIngredientView, SimulatePredictiveResult } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Mode = "stock" | "plan";
type StockSubView = "formulas" | "ingredients";

export function HiproPredictiveScreen() {
  const [mode, setMode] = useState<Mode>("stock");
  const [stockSubView, setStockSubView] = useState<StockSubView>("formulas");
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [formulas, setFormulas] = useState<HiproPredictiveFormula[]>([]);
  const [ingredientView, setIngredientView] = useState<HiproPredictiveIngredientView[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plan mode state
  const [plannedTons, setPlannedTons] = useState<Record<string, string>>({});
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulatePredictiveResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [stockRes, whRes] = await Promise.all([
        fetchHiproPredictive(warehouseId),
        fetchWarehouses()
      ]);
      setFormulas(stockRes.data.formulas);
      setIngredientView(stockRes.data.ingredientView);
      setAsOf(stockRes.data.asOf);
      setWarehouses(whRes.data);
    } catch {
      setError("Failed to load predictive data. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [warehouseId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function runSimulation() {
    const plans = formulas
      .map((f) => ({ formulaId: f.formulaId, plannedTons: parseFloat(plannedTons[f.formulaId] ?? "0") }))
      .filter((p) => p.plannedTons > 0);

    if (plans.length === 0) {
      setSimError("Enter planned tons for at least one feed type.");
      return;
    }
    setSimulating(true);
    setSimError(null);
    setSimResult(null);
    try {
      const res = await simulateHiproPredictive({ warehouseId, plans });
      setSimResult(res.data);
    } catch {
      setSimError("Simulation failed. Please try again.");
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading predictive data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Mode toggle */}
      <View style={styles.modeBar}>
        <TouchableOpacity style={[styles.modeBtn, mode === "stock" && styles.modeBtnActive]} onPress={() => setMode("stock")}>
          <Text style={[styles.modeBtnText, mode === "stock" && styles.modeBtnTextActive]}>Stock → Production</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === "plan" && styles.modeBtnActive]} onPress={() => setMode("plan")}>
          <Text style={[styles.modeBtnText, mode === "plan" && styles.modeBtnTextActive]}>Production → Requirements</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={[colors.brand]} />}
      >
        {/* Warehouse selector */}
        <View style={styles.warehouseRow}>
          <Text style={styles.warehouseLabel}>Warehouse:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.whScroll}>
            <TouchableOpacity style={[styles.whChip, !warehouseId && styles.whChipActive]} onPress={() => setWarehouseId(undefined)}>
              <Text style={[styles.whChipText, !warehouseId && styles.whChipTextActive]}>All</Text>
            </TouchableOpacity>
            {warehouses.map((wh) => (
              <TouchableOpacity key={wh.id} style={[styles.whChip, warehouseId === wh.id && styles.whChipActive]} onPress={() => setWarehouseId(wh.id)}>
                <Text style={[styles.whChipText, warehouseId === wh.id && styles.whChipTextActive]}>{wh.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {asOf && (
          <Text style={styles.asOf}>Data as of {new Date(asOf).toLocaleString()}</Text>
        )}

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── STOCK MODE ── */}
        {mode === "stock" && (
          <>
            {/* Sub-view toggle */}
            <View style={styles.subToggleRow}>
              <TouchableOpacity style={[styles.subToggleBtn, stockSubView === "formulas" && styles.subToggleBtnActive]} onPress={() => setStockSubView("formulas")}>
                <Text style={[styles.subToggleText, stockSubView === "formulas" && styles.subToggleTextActive]}>By Feed Type</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.subToggleBtn, stockSubView === "ingredients" && styles.subToggleBtnActive]} onPress={() => setStockSubView("ingredients")}>
                <Text style={[styles.subToggleText, stockSubView === "ingredients" && styles.subToggleTextActive]}>By Ingredient</Text>
              </TouchableOpacity>
            </View>

            {stockSubView === "formulas" ? (
              <>
                <SectionHeader title="FEED TYPE — MAX PRODUCIBLE" />
                <FormulaTable formulas={formulas} />
              </>
            ) : (
              <>
                <SectionHeader title="INGREDIENT STOCK — PREDICTIVE VIEW" />
                <IngredientTable ingredients={ingredientView} />
              </>
            )}
          </>
        )}

        {/* ── PLAN MODE ── */}
        {mode === "plan" && (
          <>
            <SectionHeader title="ENTER PLANNED PRODUCTION (TONS)" />
            <View style={styles.planCard}>
              {formulas.map((f) => (
                <View key={f.formulaId} style={styles.planRow}>
                  <View style={styles.planRowLeft}>
                    <Text style={styles.planFeedName}>{f.formulaName}</Text>
                    <Text style={styles.planFeedType}>{f.feedType.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={styles.planInputWrap}>
                    <TextInput
                      style={styles.planInput}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.inkLight}
                      value={plannedTons[f.formulaId] ?? ""}
                      onChangeText={(v) => setPlannedTons((prev) => ({ ...prev, [f.formulaId]: v }))}
                    />
                    <Text style={styles.planUnit}>tons</Text>
                  </View>
                </View>
              ))}
            </View>

            {simError && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{simError}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.simBtn, simulating && styles.simBtnDisabled]} onPress={runSimulation} disabled={simulating}>
              {simulating ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.simBtnText}>Calculate Requirements</Text>}
            </TouchableOpacity>

            {simResult && <SimulationResult result={simResult} />}
          </>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

function FormulaTable({ formulas }: { formulas: HiproPredictiveFormula[] }) {
  return (
    <View style={styles.tableCard}>
      {/* Header */}
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.tableCell, styles.tableCellWide, styles.tableHeaderText]}>Feed Type</Text>
        <Text style={[styles.tableCell, styles.tableHeaderText]}>Max Tons</Text>
        <Text style={[styles.tableCell, styles.tableHeaderText]}>Max Bags</Text>
        <Text style={[styles.tableCell, styles.tableCellWide, styles.tableHeaderText]}>Limiting Factor</Text>
      </View>

      {formulas.length === 0 && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No formulas found. Set up feed formulas first.</Text>
        </View>
      )}

      {formulas.map((f, idx) => {
        const canProduce = f.maxProducibleTons !== null && f.maxProducibleTons > 0;
        const isLast = idx === formulas.length - 1;
        return (
          <View key={f.formulaId} style={[styles.tableRow, !isLast && styles.tableRowBorder]}>
            <View style={[styles.tableCell, styles.tableCellWide]}>
              <Text style={styles.formulaName}>{f.formulaName}</Text>
              <Text style={styles.formulaType}>{f.feedType.replace(/_/g, " ")}</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={[styles.metricVal, !canProduce && styles.metricValZero]}>
                {f.maxProducibleTons !== null ? f.maxProducibleTons.toFixed(1) : "—"}
              </Text>
              <Text style={styles.metricUnit}>tons</Text>
            </View>
            <View style={styles.tableCell}>
              <Text style={[styles.metricVal, !canProduce && styles.metricValZero]}>
                {f.maxProducibleBags !== null ? f.maxProducibleBags : "—"}
              </Text>
              <Text style={styles.metricUnit}>bags</Text>
            </View>
            <View style={[styles.tableCell, styles.tableCellWide]}>
              {f.limitingIngredient ? (
                <View style={[styles.limitBadge, !canProduce && styles.limitBadgeCritical]}>
                  <Text style={[styles.limitBadgeText, !canProduce && styles.limitBadgeTextCritical]}>
                    {f.limitingIngredient.name}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noIngredients}>No ingredients</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function IngredientTable({ ingredients }: { ingredients: HiproPredictiveIngredientView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <View style={{ gap: spacing.sm }}>
      {ingredients.length === 0 && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No ingredient data found.</Text>
        </View>
      )}
      {ingredients.map((ing) => (
        <View key={ing.ingredientId} style={styles.ingCard}>
          {/* Ingredient header */}
          <TouchableOpacity style={styles.ingHeader} onPress={() => setExpanded(expanded === ing.ingredientId ? null : ing.ingredientId)}>
            <View style={styles.ingHeaderLeft}>
              <Text style={styles.ingName}>{ing.name}</Text>
              <Text style={styles.ingSku}>{ing.sku}</Text>
            </View>
            <View style={styles.ingStockRow}>
              <StockPill label="Bags" value={String(ing.bagsOnHand)} color="#4ade80" />
              <StockPill label="Tons" value={ing.tonsOnHand.toFixed(2)} color="#60a5fa" />
              <StockPill label="Consumed" value={`${(ing.feedConsumedKg / 1000).toFixed(2)}t`} color="#fb923c" />
            </View>
            <Text style={styles.expandIcon}>{expanded === ing.ingredientId ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {/* Expanded: per-feed-type usage */}
          {expanded === ing.ingredientId && (
            <View style={styles.ingDetail}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.tableCellWide, styles.tableHeaderText]}>Feed Type</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>Kg/Ton</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>Max Produce</Text>
              </View>
              {ing.formulaUsages.map((u, idx) => (
                <View key={u.formulaId} style={[styles.tableRow, idx < ing.formulaUsages.length - 1 && styles.tableRowBorder]}>
                  <View style={[styles.tableCell, styles.tableCellWide]}>
                    <Text style={styles.formulaName}>{u.formulaName}</Text>
                    <Text style={styles.formulaType}>{u.feedType.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={styles.tableCell}>
                    <Text style={styles.metricVal}>{u.kgsPerTon}</Text>
                    <Text style={styles.metricUnit}>kg</Text>
                  </View>
                  <View style={styles.tableCell}>
                    <Text style={[styles.metricVal, !u.maxProducibleKg && styles.metricValZero]}>
                      {u.maxProducibleKg != null ? (u.maxProducibleKg / 1000).toFixed(1) : "—"}
                    </Text>
                    <Text style={styles.metricUnit}>tons</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function StockPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.stockPill, { backgroundColor: color + "20" }]}>
      <Text style={[styles.stockPillVal, { color }]}>{value}</Text>
      <Text style={styles.stockPillLabel}>{label}</Text>
    </View>
  );
}

function SimulationResult({ result }: { result: SimulatePredictiveResult }) {
  return (
    <>
      {/* Overall status */}
      <View style={[styles.simStatusCard, result.allCanProduce ? styles.simStatusOk : styles.simStatusWarn]}>
        <Text style={[styles.simStatusIcon]}>{result.allCanProduce ? "✅" : "⚠️"}</Text>
        <Text style={[styles.simStatusText, result.allCanProduce ? styles.simStatusTextOk : styles.simStatusTextWarn]}>
          {result.allCanProduce ? "All feed types can be produced with current stock." : "Ingredient shortfalls detected — see details below."}
        </Text>
      </View>

      {/* Per-formula results */}
      <SectionHeader title="PER FEED TYPE RESULTS" />
      {result.plans.map((plan) => (
        <View key={plan.formulaId} style={[styles.planResultCard, !plan.canProduce && styles.planResultCardWarn]}>
          <View style={styles.planResultHeader}>
            <View>
              <Text style={styles.planResultName}>{plan.formulaName}</Text>
              <Text style={styles.planResultMeta}>{plan.feedType.replace(/_/g, " ")} · {plan.plannedTons} tons planned</Text>
            </View>
            <View style={[styles.statusBadge, plan.canProduce ? styles.statusBadgeOk : styles.statusBadgeWarn]}>
              <Text style={[styles.statusBadgeText, plan.canProduce ? styles.statusBadgeTextOk : styles.statusBadgeTextWarn]}>
                {plan.canProduce ? "OK" : "SHORT"}
              </Text>
            </View>
          </View>
          {plan.ingredients.filter((i) => i.shortageKg > 0).map((ing) => (
            <View key={ing.ingredientId} style={styles.shortageRow}>
              <Text style={styles.shortageIngName}>{ing.productName}</Text>
              <Text style={styles.shortageDetail}>Need {ing.tonsRequired.toFixed(2)}t · Have {ing.tonsAvailable.toFixed(2)}t · Short {(ing.shortageKg / 1000).toFixed(2)}t ({ing.bagsRequired - ing.bagsAvailable} bags)</Text>
            </View>
          ))}
        </View>
      ))}

      {/* Consolidated ingredient summary */}
      <SectionHeader title="CONSOLIDATED INGREDIENT REQUIREMENTS" />
      <View style={styles.tableCard}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableCellWide, styles.tableHeaderText]}>Ingredient</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText]}>Required</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText]}>Available</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText]}>Shortfall</Text>
        </View>
        {result.ingredientSummary.map((ing, idx) => {
          const hasShortfall = ing.shortfall > 0;
          const isLast = idx === result.ingredientSummary.length - 1;
          return (
            <View key={ing.ingredientId} style={[styles.tableRow, !isLast && styles.tableRowBorder]}>
              <View style={[styles.tableCell, styles.tableCellWide]}>
                <Text style={styles.formulaName}>{ing.name}</Text>
                <Text style={styles.formulaType}>{Math.ceil(ing.totalRequired / 50)} bags needed</Text>
              </View>
              <View style={styles.tableCell}>
                <Text style={styles.metricVal}>{(ing.totalRequired / 1000).toFixed(2)}</Text>
                <Text style={styles.metricUnit}>tons</Text>
              </View>
              <View style={styles.tableCell}>
                <Text style={styles.metricVal}>{(ing.totalAvailable / 1000).toFixed(2)}</Text>
                <Text style={styles.metricUnit}>tons</Text>
              </View>
              <View style={styles.tableCell}>
                <Text style={[styles.metricVal, hasShortfall && styles.metricValDanger]}>
                  {hasShortfall ? (ing.shortfall / 1000).toFixed(2) : "✓"}
                </Text>
                {hasShortfall && <Text style={styles.metricUnit}>tons</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { color: colors.inkMid, fontSize: font.size.sm },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.lg },

  modeBar: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  modeBtnActive: { backgroundColor: colors.brand },
  modeBtnText: { fontSize: font.size.xs, fontWeight: font.weight.semibold as any, color: colors.inkMid },
  modeBtnTextActive: { color: colors.white },

  warehouseRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  warehouseLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.semibold as any },
  whScroll: { flex: 1 },
  whChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.xs, backgroundColor: colors.bgCard },
  whChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  whChipText: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.medium as any },
  whChipTextActive: { color: colors.white },

  asOf: { fontSize: font.size.xs, color: colors.inkLight, textAlign: "right" },

  errorCard: { backgroundColor: "#fef2f2", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: "#fecaca" },
  errorText: { color: "#dc2626", fontSize: font.size.sm },

  subToggleRow: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: 4, borderWidth: 1, borderColor: colors.border },
  subToggleBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center" },
  subToggleBtnActive: { backgroundColor: colors.brandLight },
  subToggleText: { fontSize: font.size.xs, fontWeight: font.weight.semibold as any, color: colors.inkLight },
  subToggleTextActive: { color: colors.brand },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  sectionHeaderText: { fontSize: font.size.xs, fontWeight: font.weight.bold as any, color: colors.inkLight, letterSpacing: 1 },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border },

  tableCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  tableRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: "center" },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeader: { backgroundColor: colors.bg },
  tableCell: { flex: 1, alignItems: "flex-start", gap: 2 },
  tableCellWide: { flex: 2 },
  tableHeaderText: { fontSize: 10, fontWeight: font.weight.bold as any, color: colors.inkLight, letterSpacing: 0.5, textTransform: "uppercase" },

  formulaName: { fontSize: font.size.sm, fontWeight: font.weight.semibold as any, color: colors.ink },
  formulaType: { fontSize: 10, color: colors.inkLight },
  metricVal: { fontSize: font.size.md, fontWeight: font.weight.bold as any, color: colors.ink },
  metricValZero: { color: colors.inkLight },
  metricValDanger: { color: "#dc2626" },
  metricUnit: { fontSize: 10, color: colors.inkLight },

  limitBadge: { backgroundColor: "#f0fdf4", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderColor: "#86efac", alignSelf: "flex-start" },
  limitBadgeCritical: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  limitBadgeText: { fontSize: 10, color: "#16a34a", fontWeight: font.weight.semibold as any },
  limitBadgeTextCritical: { color: "#dc2626" },
  noIngredients: { fontSize: 10, color: colors.inkLight, fontStyle: "italic" },
  emptyRow: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },

  ingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  ingHeader: { padding: spacing.md, gap: spacing.sm },
  ingHeaderLeft: { gap: 2 },
  ingName: { fontSize: font.size.md, fontWeight: font.weight.bold as any, color: colors.ink },
  ingSku: { fontSize: font.size.xs, color: colors.inkLight },
  ingStockRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  expandIcon: { fontSize: 10, color: colors.inkMid, alignSelf: "flex-end" },
  ingDetail: { borderTopWidth: 1, borderTopColor: colors.border },

  stockPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, alignItems: "center" },
  stockPillVal: { fontSize: font.size.sm, fontWeight: font.weight.bold as any },
  stockPillLabel: { fontSize: 9, color: colors.inkLight },

  planCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  planRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  planRowLeft: { flex: 1, gap: 2 },
  planFeedName: { fontSize: font.size.sm, fontWeight: font.weight.semibold as any, color: colors.ink },
  planFeedType: { fontSize: 10, color: colors.inkLight },
  planInputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  planInput: { width: 70, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: font.size.sm, color: colors.ink, backgroundColor: colors.bg, textAlign: "right" },
  planUnit: { fontSize: font.size.xs, color: colors.inkLight, width: 28 },

  simBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: "center", ...shadow.brand },
  simBtnDisabled: { opacity: 0.6 },
  simBtnText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold as any },

  simStatusCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1 },
  simStatusOk: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  simStatusWarn: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  simStatusIcon: { fontSize: 20 },
  simStatusText: { flex: 1, fontSize: font.size.sm, fontWeight: font.weight.medium as any },
  simStatusTextOk: { color: "#16a34a" },
  simStatusTextWarn: { color: "#92400e" },

  planResultCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, ...shadow.sm },
  planResultCardWarn: { borderColor: "#fde68a", backgroundColor: "#fffbeb" },
  planResultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planResultName: { fontSize: font.size.sm, fontWeight: font.weight.bold as any, color: colors.ink },
  planResultMeta: { fontSize: 10, color: colors.inkLight },

  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  statusBadgeOk: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  statusBadgeWarn: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  statusBadgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold as any },
  statusBadgeTextOk: { color: "#16a34a" },
  statusBadgeTextWarn: { color: "#dc2626" },

  shortageRow: { backgroundColor: "#fef2f2", borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  shortageIngName: { fontSize: font.size.xs, fontWeight: font.weight.bold as any, color: "#dc2626" },
  shortageDetail: { fontSize: 10, color: "#991b1b" },
});
