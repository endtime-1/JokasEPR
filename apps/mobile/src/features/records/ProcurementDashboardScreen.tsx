import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonMetricGrid } from "../../components/SkeletonLoader";
import { fetchProcurementDashboard, type ProcurementDashboardData, type PurchaseOrderListItem } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING_APPROVAL: { ...semantic.status.pending,    label: "Pending"  },
  APPROVED:         { ...semantic.status.approved,   label: "Approved" },
  SENT:             { ...semantic.status.inProgress, label: "Sent"     },
  PARTIALLY_RECEIVED: { ...semantic.status.inProgress, label: "Partial" },
  RECEIVED:         { ...semantic.status.approved,   label: "Received" },
  DRAFT:            { ...semantic.status.draft,      label: "Draft"    },
};

export function ProcurementDashboardScreen() {
  const navigation = useNavigation<any>();
  const [data,       setData]       = useState<ProcurementDashboardData["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchProcurementDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <PageHeader icon="truck-delivery" iconColor="#2563eb" title="Procurement" />
          <SkeletonMetricGrid />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const d = data;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader icon="truck-delivery" iconColor="#2563eb" title="Procurement" subtitle="Purchase overview" />

        {/* KPI grid */}
        <View style={styles.grid}>
          <MetricCard icon="file-document-outline"   value={String(d?.openPurchaseRequests  ?? 0)}  label="Open PRs"         color="#2563eb" />
          <MetricCard icon="package-variant"          value={String(d?.pendingPurchaseOrders ?? 0)}  label="Pending POs"      color="#d97706" />
          <MetricCard icon="truck-check-outline"      value={String(d?.grnsThisMonth         ?? 0)}  label="GRNs This Month"  color="#16a34a" />
          <MetricCard icon="cash-multiple"            value={GHS(d?.totalSpendThisMonth ?? 0)} label="Spend This Month" color="#7c3aed" />
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("PurchaseRequestCreate")} activeOpacity={0.8}>
            <Icon name="plus-circle-outline" size={20} color={colors.brand} />
            <Text style={styles.quickBtnText}>New Request</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("PurchaseRequestList")} activeOpacity={0.8}>
            <Icon name="format-list-bulleted" size={20} color="#2563eb" />
            <Text style={[styles.quickBtnText, { color: "#2563eb" }]}>All PRs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("PurchaseOrderList")} activeOpacity={0.8}>
            <Icon name="package-variant-closed" size={20} color="#7c3aed" />
            <Text style={[styles.quickBtnText, { color: "#7c3aed" }]}>All POs</Text>
          </TouchableOpacity>
        </View>

        {/* Recent purchase orders */}
        {d?.recentPurchaseOrders?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent Purchase Orders</Text>
            {d.recentPurchaseOrders.slice(0, 5).map((po: PurchaseOrderListItem, i) => {
              const s = STATUS_MAP[po.status] ?? STATUS_MAP.DRAFT;
              return (
                <TouchableOpacity
                  key={po.id}
                  style={[styles.poRow, i === 0 && styles.poRowFirst]}
                  onPress={() => navigation.navigate("GrnCreate", { poId: po.id, poRef: po.reference, supplierName: po.supplier.name })}
                  activeOpacity={0.8}
                >
                  <View style={styles.poLeft}>
                    <Text style={styles.poRef}>{po.reference}</Text>
                    <Text style={styles.poSupplier}>{po.supplier.name}</Text>
                  </View>
                  <View style={styles.poRight}>
                    <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} size="xs" />
                    <Text style={styles.poAmount}>{GHS(po.totalAmount)}</Text>
                  </View>
                </TouchableOpacity>
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

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  actionsRow: { flexDirection: "row", gap: spacing.sm },
  quickBtn:   { flex: 1, flexDirection: "column", alignItems: "center", gap: 5, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, ...shadow.sm },
  quickBtnText: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.brand },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, letterSpacing: 0.8, textTransform: "uppercase", padding: spacing.lg, paddingBottom: spacing.sm },
  poRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  poRowFirst:   { borderTopWidth: 0 },
  poLeft:       { flex: 1, gap: 2 },
  poRef:        { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  poSupplier:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  poRight:      { alignItems: "flex-end", gap: 4 },
  poAmount:     { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
});
