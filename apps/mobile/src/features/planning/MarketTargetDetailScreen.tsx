import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchMarketTargetDetail, type MarketTargetFull, type MarketTargetItem } from "../../api/endpoints";
import type { RecordsScreenProps } from "../../navigation/types";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  DRAFT:    { ...semantic.status.draft,      label: "Draft"    },
  ACTIVE:   { ...semantic.status.inProgress, label: "Active"   },
  PENDING:  { ...semantic.status.pending,    label: "Pending"  },
  APPROVED: { ...semantic.status.approved,   label: "Approved" },
  ACHIEVED: { ...semantic.status.approved,   label: "Achieved" },
  EXPIRED:  { ...semantic.status.rejected,   label: "Expired"  },
  MISSED:   { ...semantic.status.rejected,   label: "Missed"   },
};

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.progressPct, { color }]}>{pct}%</Text>
    </View>
  );
}

export function MarketTargetDetailScreen() {
  const route   = useRoute<RecordsScreenProps<"MarketTargetDetail">["route"]>();
  const toast   = useToast();
  const { targetId } = route.params;

  const [target,  setTarget]  = useState<MarketTargetFull | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMarketTargetDetail(targetId);
      setTarget(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load target." });
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!target) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errText}>Target not found.</Text></View>
      </SafeAreaView>
    );
  }

  const s = STATUS_META[target.status] ?? STATUS_META.DRAFT;

  const totalTargetKg  = target.items?.reduce((sum, i) => sum + i.targetQuantityKg, 0) ?? 0;
  const totalAchievedKg = target.items?.reduce((sum, i) => sum + (i.achievedQuantityKg ?? 0), 0) ?? 0;
  const overallPct = totalTargetKg > 0 ? Math.min(100, Math.round((totalAchievedKg / totalTargetKg) * 100)) : 0;
  const overallColor = overallPct >= 100 ? "#16a34a" : overallPct >= 70 ? "#d97706" : "#dc2626";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.targetIcon}>
              <Icon name="bullseye-arrow" size={24} color={colors.brand} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.targetNum}>{target.targetNumber ?? "Market Target"}</Text>
              <Text style={styles.period}>
                {new Date(target.periodStart).toLocaleDateString("en-GH", { month: "short", year: "numeric" })} –{" "}
                {new Date(target.periodEnd).toLocaleDateString("en-GH", { month: "short", year: "numeric" })}
              </Text>
            </View>
            <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
          </View>

          {/* Overall progress */}
          <View style={styles.overallWrap}>
            <View style={styles.overallRow}>
              <Text style={styles.overallLabel}>Overall Progress</Text>
              <Text style={[styles.overallPct, { color: overallColor }]}>{overallPct}%</Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${overallPct}%` as any, backgroundColor: overallColor }]} />
            </View>
            <View style={styles.overallStats}>
              <Text style={styles.overallStat}>{totalAchievedKg.toLocaleString()} kg achieved</Text>
              <Text style={styles.overallStat}>of {totalTargetKg.toLocaleString()} kg target</Text>
            </View>
          </View>

          {target.createdBy && (
            <View style={styles.metaRow}>
              <Icon name="account-outline" size={13} color={colors.inkLight} />
              <Text style={styles.metaText}>Created by {target.createdBy.fullName}</Text>
            </View>
          )}
          {target.notes && (
            <View style={styles.metaRow}>
              <Icon name="text-box-outline" size={13} color={colors.inkLight} />
              <Text style={styles.metaText}>{target.notes}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        {target.items?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Target Items ({target.items.length})</Text>
            {target.items.map((item: MarketTargetItem, i) => {
              const achieved  = item.achievedQuantityKg ?? 0;
              const pct       = item.targetQuantityKg > 0 ? Math.min(100, Math.round((achieved / item.targetQuantityKg) * 100)) : 0;
              const itemColor = pct >= 100 ? "#16a34a" : pct >= 70 ? "#d97706" : "#2563eb";
              return (
                <View key={item.id} style={[styles.itemRow, i === 0 && styles.itemRowFirst]}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemProduct}>{item.product?.name ?? "Product"}</Text>
                    <Text style={styles.itemSku}>{item.product?.sku ?? ""}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={styles.itemTarget}>{item.targetQuantityKg.toLocaleString()} kg target</Text>
                    <ProgressBar value={achieved} total={item.targetQuantityKg} color={itemColor} />
                    <Text style={[styles.itemAchieved, { color: itemColor }]}>{achieved.toLocaleString()} kg achieved</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

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
  targetIcon:  { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center" },
  headerText:  { flex: 1, gap: 2 },
  targetNum:   { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  period:      { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  overallWrap:  { gap: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md },
  overallRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  overallLabel: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  overallPct:   { fontSize: font.size.lg, fontFamily: font.family.extrabold },
  progressBg:   { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  overallStats: { flexDirection: "row", justifyContent: "space-between" },
  overallStat:  { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  metaRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { flex: 1, fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, padding: spacing.lg, paddingBottom: spacing.sm },

  itemRow:      { flexDirection: "row", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  itemRowFirst: { borderTopWidth: 0 },
  itemLeft:     { flex: 1, gap: 2 },
  itemProduct:  { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  itemSku:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  itemRight:    { flex: 1.5, gap: 4 },
  itemTarget:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  itemAchieved: { fontSize: font.size.xs, fontFamily: font.family.bold },

  progressWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressPct:  { fontSize: font.size.xs, fontFamily: font.family.bold, minWidth: 30, textAlign: "right" },
});
