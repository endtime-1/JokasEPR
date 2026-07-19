import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { useToast } from "../../components/Toast";
import {
  approvePurchaseOrder,
  approvePurchaseRequest,
  fetchOpenPurchaseOrders,
  fetchPurchaseRequests,
  rejectPurchaseOrder,
  rejectPurchaseRequest,
  type PurchaseOrderListItem,
  type PurchaseRequest,
} from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_MAP: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING:          { ...semantic.status.pending,    label: "Pending"    },
  PENDING_APPROVAL: { ...semantic.status.pending,    label: "Pending"    },
  APPROVED:         { ...semantic.status.approved,   label: "Approved"   },
  REJECTED:         { ...semantic.status.rejected,   label: "Rejected"   },
  DRAFT:            { ...semantic.status.draft,      label: "Draft"      },
  SENT:             { ...semantic.status.inProgress, label: "Sent"       },
  PARTIALLY_RECEIVED: { ...semantic.status.inProgress, label: "Partial" },
  RECEIVED:         { ...semantic.status.approved,   label: "Received"   },
};

type RejectTarget = { type: "pr" | "po"; id: string } | null;

export function ProcurementApprovalListScreen() {
  const navigation = useNavigation<any>();
  const toast      = useToast();
  const [tab, setTab] = useState("pr");
  const [prs, setPrs] = useState<PurchaseRequest[]>([]);
  const [pos, setPos] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [prRes, poRes] = await Promise.allSettled([
        fetchPurchaseRequests("PENDING"),
        fetchOpenPurchaseOrders(),
      ]);
      if (prRes.status === "fulfilled") setPrs((prRes.value.data as any) ?? []);
      if (poRes.status === "fulfilled") setPos(((poRes.value.data as any) ?? []).filter((p: any) => p.status === "PENDING_APPROVAL"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(type: "pr" | "po", id: string) {
    setActioning(id);
    try {
      if (type === "pr") await approvePurchaseRequest(id);
      else               await approvePurchaseOrder(id);
      toast.show({ type: "success", message: `${type === "pr" ? "Purchase request" : "Purchase order"} approved.` });
      await load(true);
    } catch {
      toast.show({ type: "error", message: "Approval failed. Try again." });
    } finally {
      setActioning(null);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim() || !rejectTarget) return;
    setActioning(rejectTarget.id);
    setRejectTarget(null);
    try {
      if (rejectTarget.type === "pr") await rejectPurchaseRequest(rejectTarget.id, { reason: rejectReason.trim() });
      else                            await rejectPurchaseOrder(rejectTarget.id, { reason: rejectReason.trim() });
      toast.show({ type: "info", message: "Rejected successfully." });
      await load(true);
    } catch {
      toast.show({ type: "error", message: "Rejection failed." });
    } finally {
      setActioning(null);
      setRejectReason("");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  const data: (PurchaseRequest | PurchaseOrderListItem)[] = tab === "pr" ? prs : pos;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="truck-delivery" iconColor="#2563eb" title="Procurement Approvals" />
            <SegmentedControl
              segments={[
                { key: "pr", label: "Purchase Requests", badge: prs.length },
                { key: "po", label: "Purchase Orders",   badge: pos.length },
              ]}
              active={tab}
              onChange={setTab}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="truck-delivery"
            title={`No pending ${tab === "pr" ? "purchase requests" : "purchase orders"}`}
            subtitle="All items have been reviewed."
            iconColor="#16a34a"
          />
        }
        renderItem={({ item }) => {
          const isPr  = tab === "pr";
          const pr    = item as unknown as PurchaseRequest;
          const po    = item as unknown as PurchaseOrderListItem;
          const s     = STATUS_MAP[item.status] ?? STATUS_MAP.PENDING;
          const ref   = isPr ? pr.reference : po.reference;
          const supplier = isPr ? pr.supplier?.name : po.supplier?.name;
          const amount   = isPr ? pr.totalAmount : po.totalAmount;
          const date     = isPr ? pr.requestDate : po.orderDate;
          const isPending = ["PENDING", "PENDING_APPROVAL"].includes(item.status);

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={[styles.iconWrap, { backgroundColor: isPr ? "#eff6ff" : "#f0fdf4" }]}>
                    <Icon name={isPr ? "file-document-outline" : "package-variant"} size={20} color={isPr ? "#2563eb" : "#16a34a"} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.ref}>{ref}</Text>
                    {supplier ? <Text style={styles.supplier}>{supplier}</Text> : null}
                    <Text style={styles.date}>{new Date(date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
                  </View>
                </View>
                <View style={styles.cardRightCol}>
                  <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
                  {amount != null ? <Text style={styles.amount}>{GHS(Number(amount))}</Text> : null}
                </View>
              </View>
              {tab === "po" && (
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => navigation.navigate("PurchaseOrderDetail", { poId: item.id })}
                >
                  <Icon name="eye-outline" size={14} color={colors.brand} />
                  <Text style={styles.viewBtnText}>View Full Order</Text>
                </TouchableOpacity>
              )}
              {isPending && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => { setRejectTarget({ type: isPr ? "pr" : "po", id: item.id }); setRejectReason(""); }}
                    disabled={actioning === item.id}
                  >
                    <Icon name="close-circle-outline" size={15} color="#dc2626" />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApprove(isPr ? "pr" : "po", item.id)}
                    disabled={actioning === item.id}
                  >
                    {actioning === item.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Icon name="check-circle" size={15} color={colors.white} />
                        <Text style={styles.approveText}>Approve</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal visible={rejectTarget !== null} transparent animationType="slide" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reason for Rejection</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Enter reason…"
              placeholderTextColor={colors.inkLight}
              multiline
              numberOfLines={3}
              value={rejectReason}
              onChangeText={setRejectReason}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={handleReject}>
                <Text style={styles.modalRejectText}>Reject</Text>
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
  list:   { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:    { padding: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },

  card:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardTop:  { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  ref:      { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  supplier: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  date:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRightCol: { alignItems: "flex-end", gap: 4 },
  amount:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  viewBtn:     { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: spacing.sm },
  viewBtnText: { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.brand },

  actions:     { flexDirection: "row", gap: spacing.sm },
  rejectBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  rejectText:  { fontSize: font.size.sm, fontFamily: font.family.bold, color: "#dc2626" },
  approveBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#16a34a" },
  approveText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },

  modalOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard:     { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xxl, gap: spacing.md },
  modalTitle:    { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  textArea:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, minHeight: 80, textAlignVertical: "top", fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  modalActions:  { flexDirection: "row", gap: spacing.md },
  modalCancel:   { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  modalCancelText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  modalReject:   { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#dc2626", alignItems: "center" },
  modalRejectText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
