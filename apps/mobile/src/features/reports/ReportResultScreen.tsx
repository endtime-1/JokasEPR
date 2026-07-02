import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { runReport, type ReportColumn, type ReportRunResult } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import type { MoreStackParams } from "../../navigation/types";

type RouteProps = RouteProp<MoreStackParams, "ReportResult">;

function money(v: unknown) {
  const n = Number(v ?? 0);
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v: unknown) {
  if (!v) return "—";
  return new Date(String(v)).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCell(v: unknown, type?: ReportColumn["type"]) {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money")   return money(v);
  if (type === "date")    return fmtDate(v);
  if (type === "number")  return Number(v).toLocaleString("en-GH", { maximumFractionDigits: 2 });
  if (type === "percent") return `${Number(v).toFixed(1)}%`;
  return String(v);
}

function TotalsBar({ totals, columns }: { totals: Record<string, number>; columns: ReportColumn[] }) {
  const moneyOrNum = columns.filter((c) => (c.type === "money" || c.type === "number") && totals[c.key] !== undefined);
  if (moneyOrNum.length === 0) return null;
  return (
    <View style={styles.totalsBar}>
      <Text style={styles.totalsLabel}>TOTALS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.totalsRow}>
        {moneyOrNum.map((c) => (
          <View key={c.key} style={styles.totalChip}>
            <Text style={styles.totalChipLabel}>{c.label}</Text>
            <Text style={styles.totalChipValue}>{fmtCell(totals[c.key], c.type)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function ReportResultScreen() {
  const route = useRoute<RouteProps>();
  const toast = useToast();
  const { reportId } = route.params;

  const [result,     setResult]     = useState<ReportRunResult["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await runReport(reportId);
      setResult(res.data);
    } catch {
      toast.show({ type: "error", message: "Could not run report. Try again." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <EmptyState icon="file-chart-outline" title="No Data" message="No results found for this report" />
      </SafeAreaView>
    );
  }

  const { definition, rows, totals } = result;
  const cols = definition.columns;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Meta header */}
      <View style={styles.metaHeader}>
        <Text style={styles.metaTitle}>{definition.title}</Text>
        <Text style={styles.metaDesc}>{definition.description}</Text>
        <Text style={styles.metaCount}>{rows.length} record{rows.length !== 1 ? "s" : ""}</Text>
      </View>

      {/* Totals */}
      {Object.keys(totals).length > 0 && <TotalsBar totals={totals} columns={cols} />}

      {rows.length === 0 ? (
        <EmptyState icon="table-off" title="No Records" message="No data matches the report criteria" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
            stickyHeaderIndices={[0]}
            ListHeaderComponent={
              <View style={styles.tableHeader}>
                {cols.map((c) => (
                  <Text key={c.key} style={[styles.thCell, c.type === "money" || c.type === "number" ? styles.cellRight : {}]}>
                    {c.label}
                  </Text>
                ))}
              </View>
            }
            renderItem={({ item: row, index }) => (
              <View style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                {cols.map((c) => (
                  <Text
                    key={c.key}
                    style={[styles.tdCell, c.type === "money" || c.type === "number" ? styles.cellRight : {}]}
                    numberOfLines={1}
                  >
                    {fmtCell(row[c.key], c.type)}
                  </Text>
                ))}
              </View>
            )}
            contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const CELL_W = 120;

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  metaHeader: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard, gap: 3 },
  metaTitle:  { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  metaDesc:   { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular },
  metaCount:  { fontSize: font.size.xs, color: colors.brand, fontFamily: font.family.bold },

  totalsBar:   { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgCard, paddingVertical: spacing.sm },
  totalsLabel: { fontSize: 10, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: spacing.lg, marginBottom: 4 },
  totalsRow:   { paddingHorizontal: spacing.lg, gap: spacing.sm },
  totalChip:   { backgroundColor: colors.brandLight, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandMid, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 100, ...shadow.sm },
  totalChipLabel: { fontSize: 10, fontFamily: font.family.bold, color: colors.brand, textTransform: "uppercase" },
  totalChipValue: { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },

  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 2, borderBottomColor: colors.brand + "33" },
  thCell:      { width: CELL_W, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm + 2, fontSize: 11, fontFamily: font.family.bold, color: colors.inkMid, textTransform: "uppercase" },
  tableRow:    { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableRowAlt: { backgroundColor: "#fafafa" },
  tdCell:      { width: CELL_W, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm + 2, fontSize: font.size.xs, fontFamily: font.family.regular, color: colors.ink },
  cellRight:   { textAlign: "right" },
});
