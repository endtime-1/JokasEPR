import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { approveFeedProductionOrder, fetchFeedProductionOrderDetail, type FeedProductionOrderFull } from "../../api/endpoints";
import type { RecordsScreenProps } from "../../navigation/types";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  DRAFT:        { ...semantic.status.draft,      label: "Draft"        },
  PENDING:      { ...semantic.status.pending,    label: "Pending"      },
  APPROVED:     { ...semantic.status.approved,   label: "Approved"     },
  IN_PROGRESS:  { ...semantic.status.inProgress, label: "In Progress"  },
  COMPLETED:    { ...semantic.status.approved,   label: "Completed"    },
  CANCELLED:    { ...semantic.status.rejected,   label: "Cancelled"    },
};

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <View style={styles.infoRow}>
      {icon ? <Icon name={icon as any} size={15} color={colors.inkLight} /> : null}
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function FeedProductionOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RecordsScreenProps<"FeedProductionOrderDetail">["route"]>();
  const toast      = useToast();
  const { orderId } = route.params;

  const [order,      setOrder]      = useState<FeedProductionOrderFull | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [approving,  setApproving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFeedProductionOrderDetail(orderId);
      setOrder(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load order." });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    setApproving(true);
    try {
      await approveFeedProductionOrder(orderId);
      toast.show({ type: "success", message: "Production order approved." });
      load();
    } catch {
      toast.show({ type: "error", message: "Approval failed." });
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errText}>Order not found.</Text></View>
      </SafeAreaView>
    );
  }

  const s = STATUS_META[order.status] ?? STATUS_META.DRAFT;
  const totalProducedKg = order.batches?.reduce((sum, b) => sum + b.producedQuantityKg, 0) ?? 0;
  const progressPercent = order.plannedQuantityKg > 0 ? Math.min(100, Math.round((totalProducedKg / order.plannedQuantityKg) * 100)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.orderIcon}>
                <Icon name="factory" size={22} color="#d97706" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.orderNum}>{order.orderNumber}</Text>
                {order.formula ? <Text style={styles.formulaName}>{order.formula.name}</Text> : null}
              </View>
            </View>
            <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{order.plannedQuantityKg.toLocaleString()} kg</Text>
              <Text style={styles.statLbl}>Planned</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{totalProducedKg.toLocaleString()} kg</Text>
              <Text style={styles.statLbl}>Produced</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{progressPercent}%</Text>
              <Text style={styles.statLbl}>Progress</Text>
            </View>
          </View>

          {/* Progress bar */}
          {progressPercent > 0 && (
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
            </View>
          )}

          <InfoRow label="Scheduled" value={new Date(order.scheduledDate).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })} icon="calendar-outline" />
          {order.productionSite && <InfoRow label="Site"       value={order.productionSite.name} icon="map-marker-outline" />}
          {order.warehouse       && <InfoRow label="Warehouse"  value={order.warehouse.name}       icon="warehouse"          />}
          {order.createdBy       && <InfoRow label="Created by" value={order.createdBy.fullName}    icon="account-outline"    />}
        </View>

        {/* Raw material requirements */}
        {order.formula?.ingredients?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Raw Material Requirements</Text>
            {order.formula.ingredients.map((ing, i) => (
              <View key={i} style={styles.ingRow}>
                <View style={styles.ingLeft}>
                  <Text style={styles.ingName}>{ing.product.name}</Text>
                  <Text style={styles.ingSku}>{ing.product.sku}</Text>
                </View>
                <View style={styles.ingRight}>
                  <Text style={styles.ingKgTonne}>{ing.kgPerTonne.toFixed(1)} kg/t</Text>
                  <Text style={styles.ingRequired}>{(ing.requiredKg ?? 0).toFixed(1)} kg needed</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Production batches */}
        {order.batches?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Production Batches ({order.batches.length})</Text>
            {order.batches.map((b, i) => (
              <View key={b.id} style={[styles.batchRow, i === 0 && styles.batchRowFirst]}>
                <View style={styles.batchLeft}>
                  <Icon name="checkbox-marked-circle-outline" size={16} color={b.status === "COMPLETED" ? "#16a34a" : colors.inkLight} />
                  <View>
                    <Text style={styles.batchNum}>{b.batchNumber}</Text>
                    <Text style={styles.batchDate}>{new Date(b.createdAt).toLocaleDateString("en-GH")}</Text>
                  </View>
                </View>
                <Text style={styles.batchQty}>{b.producedQuantityKg.toLocaleString()} kg</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Approve action */}
        {order.status === "PENDING" && (
          <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={approving} activeOpacity={0.8}>
            {approving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Icon name="check-circle" size={18} color={colors.white} />
                <Text style={styles.approveBtnText}>Approve Order</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Record batch shortcut */}
        {(order.status === "APPROVED" || order.status === "IN_PROGRESS") && (
          <TouchableOpacity style={styles.recordBtn} onPress={() => navigation.navigate("FeedProductionBatch")} activeOpacity={0.8}>
            <Icon name="plus-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.recordBtnText}>Record Production Batch</Text>
          </TouchableOpacity>
        )}

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
  headerTop:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  orderIcon:   { width: 48, height: 48, borderRadius: radius.md, backgroundColor: "#fffbeb", alignItems: "center", justifyContent: "center" },
  headerText:  { flex: 1, gap: 2 },
  orderNum:    { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  formulaName: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  statsRow:  { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md },
  stat:      { flex: 1, alignItems: "center", gap: 2 },
  statVal:   { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  statLbl:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  statDiv:   { width: 1, height: 30, backgroundColor: colors.border },

  progressBg:   { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#d97706", borderRadius: 3 },

  infoRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  infoLabel: { width: 75, fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  infoValue: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, letterSpacing: 0.8, textTransform: "uppercase", padding: spacing.lg, paddingBottom: spacing.sm },

  ingRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  ingLeft:      { flex: 1, gap: 2 },
  ingName:      { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  ingSku:       { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  ingRight:     { alignItems: "flex-end", gap: 2 },
  ingKgTonne:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
  ingRequired:  { fontSize: font.size.xs, color: "#d97706", fontFamily: font.family.semibold },

  batchRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  batchRowFirst: { borderTopWidth: 0 },
  batchLeft:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  batchNum:      { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  batchDate:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  batchQty:      { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  approveBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#16a34a", borderRadius: radius.xl, paddingVertical: spacing.lg },
  approveBtnText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },

  recordBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg, backgroundColor: colors.brandLight },
  recordBtnText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.brand },
});
