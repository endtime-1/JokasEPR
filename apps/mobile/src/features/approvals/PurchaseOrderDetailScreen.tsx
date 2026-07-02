import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { approvePurchaseOrder, fetchPurchaseOrderDetail, rejectPurchaseOrder, type PurchaseOrderDetail } from "../../api/endpoints";
import type { ApprovalsScreenProps } from "../../navigation/types";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING_APPROVAL:    { ...semantic.status.pending,    label: "Pending Approval" },
  APPROVED:            { ...semantic.status.approved,   label: "Approved"         },
  REJECTED:            { ...semantic.status.rejected,   label: "Rejected"         },
  SENT:                { ...semantic.status.inProgress, label: "Sent to Supplier" },
  PARTIALLY_RECEIVED:  { ...semantic.status.inProgress, label: "Partially Received" },
  RECEIVED:            { ...semantic.status.approved,   label: "Fully Received"   },
  DRAFT:               { ...semantic.status.draft,      label: "Draft"            },
};

export function PurchaseOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<ApprovalsScreenProps<"PurchaseOrderDetail">["route"]>();
  const toast      = useToast();
  const { poId }   = route.params;

  const [po,          setPo]          = useState<PurchaseOrderDetail | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPurchaseOrderDetail(poId);
      setPo(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load purchase order." });
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    setSubmitting(true);
    try {
      await approvePurchaseOrder(poId);
      toast.show({ type: "success", message: "Purchase order approved." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Approval failed." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setSubmitting(true);
    setRejectModal(false);
    try {
      await rejectPurchaseOrder(poId, { reason: rejectReason.trim() });
      toast.show({ type: "info", message: "Purchase order rejected." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Rejection failed." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!po) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errorText}>Order not found.</Text></View>
      </SafeAreaView>
    );
  }

  const s = STATUS_MAP[po.status] ?? STATUS_MAP.DRAFT;
  const isPending = po.status === "PENDING_APPROVAL";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.poIcon}>
                <Icon name="package-variant" size={22} color="#16a34a" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.ref}>{po.reference}</Text>
                <Text style={styles.supplier}>{po.supplier.name} · {po.supplier.code}</Text>
              </View>
            </View>
            <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{GHS(po.totalAmount)}</Text>
              <Text style={styles.statLbl}>Total Value</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{po._count.items}</Text>
              <Text style={styles.statLbl}>Line Items</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{po._count.grnRecords}</Text>
              <Text style={styles.statLbl}>GRNs</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Icon name="calendar-outline" size={13} color={colors.inkLight} />
            <Text style={styles.metaText}>Order date: {new Date(po.orderDate).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}</Text>
          </View>
          {po.expectedDelivery ? (
            <View style={styles.metaRow}>
              <Icon name="truck-delivery-outline" size={13} color={colors.inkLight} />
              <Text style={styles.metaText}>Expected: {new Date(po.expectedDelivery).toLocaleDateString("en-GH", { day: "numeric", month: "long" })}</Text>
            </View>
          ) : null}
        </View>

        {/* Line items */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Line Items</Text>
          {po.items.map((item, i) => (
            <View key={item.id} style={[styles.itemRow, i === po.items.length - 1 && styles.itemRowLast]}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemMeta}>{item.quantity} {item.uomCode} @ {GHS(item.unitCost)}</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemTotal}>{GHS(item.quantity * item.unitCost)}</Text>
                <Text style={styles.itemReceived}>{item.receivedQty} received</Text>
              </View>
            </View>
          ))}
          <View style={styles.itemTotalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{GHS(po.totalAmount)}</Text>
          </View>
        </View>

        {/* Actions */}
        {isPending && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectModal(true)} disabled={submitting}>
              <Icon name="close-circle-outline" size={18} color="#dc2626" />
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color={colors.white} /> : (
                <>
                  <Icon name="check-circle" size={18} color={colors.white} />
                  <Text style={styles.approveText}>Approve Order</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reason for Rejection</Text>
            <TextInput style={styles.textArea} placeholder="Enter reason…" placeholderTextColor={colors.inkLight} multiline numberOfLines={3} value={rejectReason} onChangeText={setRejectReason} autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRejectModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmRejectBtn} onPress={handleReject}>
                <Text style={styles.confirmRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: font.size.sm, color: colors.error },

  headerCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.md },
  headerTop:   { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  headerLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  poIcon:      { width: 48, height: 48, borderRadius: radius.md, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
  headerText:  { flex: 1, gap: 2 },
  ref:         { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  supplier:    { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  statsRow:    { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md },
  stat:        { flex: 1, alignItems: "center", gap: 2 },
  statVal:     { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  statLbl:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  statDiv:     { width: 1, height: 30, backgroundColor: colors.border },
  metaRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText:    { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, letterSpacing: 0.8, textTransform: "uppercase", padding: spacing.lg, paddingBottom: spacing.sm },
  itemRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  itemRowLast:  {},
  itemLeft:     { flex: 1, gap: 2 },
  itemName:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  itemMeta:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  itemRight:    { alignItems: "flex-end", gap: 2 },
  itemTotal:    { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },
  itemReceived: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  itemTotalRow: { flexDirection: "row", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1.5, borderTopColor: colors.border, backgroundColor: colors.bg },
  totalLabel:   { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.inkMid },
  totalValue:   { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },

  actions:     { flexDirection: "row", gap: spacing.md },
  rejectBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.lg, borderRadius: radius.xl, borderWidth: 1.5, borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  rejectText:  { fontSize: font.size.md, fontFamily: font.family.bold, color: "#dc2626" },
  approveBtn:  { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.lg, borderRadius: radius.xl, backgroundColor: "#16a34a" },
  approveText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },

  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal:            { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xxl, gap: spacing.md },
  modalTitle:       { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  textArea:         { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, minHeight: 80, textAlignVertical: "top", fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  modalActions:     { flexDirection: "row", gap: spacing.md },
  cancelBtn:        { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelText:       { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  confirmRejectBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#dc2626", alignItems: "center" },
  confirmRejectText:{ fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
