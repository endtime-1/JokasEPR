import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { useToast } from "../../components/Toast";
import {
  approveStagedTransfer,
  fetchStagedTransfers,
  receiveStagedTransfer,
  rejectStagedTransfer,
  type StagedTransfer,
} from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_MAP: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING_APPROVAL: { ...semantic.status.pending, label: "Pending approval" },
  IN_TRANSIT: { ...semantic.status.inProgress, label: "In transit" },
};

function warehouseLabel(w: StagedTransfer["fromWarehouse"]) {
  if (!w) return "—";
  const base = w.code ? `${w.name} (${w.code})` : w.name;
  return w.branch?.name ? `${base} · ${w.branch.name}` : base;
}

type ReceiveTarget = { transfer: StagedTransfer } | null;

export function TransferApprovalsScreen() {
  const toast = useToast();
  const [tab, setTab] = useState("approve");
  const [toApprove, setToApprove] = useState<StagedTransfer[]>([]);
  const [toReceive, setToReceive] = useState<StagedTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget>(null);
  const [receiveQty, setReceiveQty] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [a, r] = await Promise.allSettled([
        fetchStagedTransfers({ status: "PENDING_APPROVAL", take: 100 }),
        fetchStagedTransfers({ status: "IN_TRANSIT", direction: "incoming", take: 100 }),
      ]);
      if (a.status === "fulfilled") setToApprove(a.value.data ?? []);
      if (r.status === "fulfilled") setToReceive(r.value.data ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id: string) {
    setActioning(id);
    try {
      await approveStagedTransfer(id);
      toast.show({ type: "success", message: "Transfer approved — stock is now in transit." });
      await load(true);
    } catch (err) {
      toast.show({ type: "error", message: err instanceof Error ? err.message : "Approval failed. Try again." });
    } finally {
      setActioning(null);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim() || !rejectId) return;
    const id = rejectId;
    setActioning(id);
    setRejectId(null);
    try {
      await rejectStagedTransfer(id, { rejectionReason: rejectReason.trim() });
      toast.show({ type: "info", message: "Transfer rejected." });
      await load(true);
    } catch (err) {
      toast.show({ type: "error", message: err instanceof Error ? err.message : "Rejection failed." });
    } finally {
      setActioning(null);
      setRejectReason("");
    }
  }

  async function handleReceive() {
    if (!receiveTarget) return;
    const qty = Number(receiveQty);
    if (!Number.isFinite(qty) || qty < 0) { toast.show({ type: "error", message: "Enter a valid quantity." }); return; }
    const id = receiveTarget.transfer.id;
    setActioning(id);
    setReceiveTarget(null);
    try {
      await receiveStagedTransfer(id, { receivedQuantity: qty });
      const expected = Number(receiveTarget.transfer.quantity);
      toast.show({
        type: qty === expected ? "success" : "info",
        message: qty === expected ? "Transfer received in full." : `Received ${qty} of ${expected} — a discrepancy was logged for review.`,
      });
      await load(true);
    } catch (err) {
      toast.show({ type: "error", message: err instanceof Error ? err.message : "Could not record receipt." });
    } finally {
      setActioning(null);
      setReceiveQty("");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  const data = tab === "approve" ? toApprove : toReceive;

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
            <PageHeader icon="transfer" iconColor="#2563eb" title="Transfer Approvals" />
            <SegmentedControl
              segments={[
                { key: "approve", label: "To approve", badge: toApprove.length },
                { key: "receive", label: "To receive", badge: toReceive.length },
              ]}
              active={tab}
              onChange={setTab}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="transfer"
            title={tab === "approve" ? "Nothing awaiting approval" : "Nothing in transit for you"}
            subtitle={tab === "approve" ? "New transfer requests will show up here." : "Approved transfers heading to your warehouses appear here."}
            iconColor="#16a34a"
          />
        }
        renderItem={({ item }) => {
          const s = STATUS_MAP[item.status] ?? STATUS_MAP.PENDING_APPROVAL;
          const busy = actioning === item.id;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardText}>
                  <Text style={styles.ref}>{item.transferNumber}</Text>
                  <Text style={styles.product}>
                    {item.product ? `${item.product.name} (${item.product.sku})` : "—"} · {Number(item.quantity)}
                  </Text>
                </View>
                <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
              </View>

              <View style={styles.routeRow}>
                <Text style={styles.routeText} numberOfLines={2}>{warehouseLabel(item.fromWarehouse)}</Text>
                <Icon name="arrow-right" size={14} color={colors.inkLight} />
                <Text style={[styles.routeText, { textAlign: "right" }]} numberOfLines={2}>{warehouseLabel(item.toWarehouse)}</Text>
              </View>

              {tab === "approve" ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => { setRejectId(item.id); setRejectReason(""); }}
                    disabled={busy}
                  >
                    <Icon name="close-circle-outline" size={15} color="#dc2626" />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)} disabled={busy}>
                    {busy ? <ActivityIndicator size="small" color={colors.white} /> : (
                      <>
                        <Icon name="check-circle" size={15} color={colors.white} />
                        <Text style={styles.approveText}>Approve &amp; dispatch</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.receiveBtn}
                  onPress={() => { setReceiveTarget({ transfer: item }); setReceiveQty(String(Number(item.quantity))); }}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator size="small" color={colors.white} /> : (
                    <>
                      <Icon name="package-down" size={15} color={colors.white} />
                      <Text style={styles.approveText}>Confirm receipt</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal visible={rejectId !== null} transparent animationType="slide" onRequestClose={() => setRejectId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reason for rejection</Text>
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
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRejectId(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={handleReject}>
                <Text style={styles.modalRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={receiveTarget !== null} transparent animationType="slide" onRequestClose={() => setReceiveTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Quantity received</Text>
            {receiveTarget && (
              <Text style={styles.modalSub}>
                {receiveTarget.transfer.transferNumber} — dispatched {Number(receiveTarget.transfer.quantity)}. Enter what actually arrived; a mismatch opens a discrepancy for a manager.
              </Text>
            )}
            <TextInput
              style={styles.qtyInput}
              keyboardType="decimal-pad"
              value={receiveQty}
              onChangeText={setReceiveQty}
              placeholder="0"
              placeholderTextColor={colors.inkLight}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setReceiveTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleReceive}>
                <Text style={styles.modalRejectText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad: { padding: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardText: { flex: 1, gap: 2 },
  ref: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  product: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  routeText: { flex: 1, fontSize: font.size.xs, color: colors.ink, fontFamily: font.family.regular },

  actions: { flexDirection: "row", gap: spacing.sm },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  rejectText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: "#dc2626" },
  approveBtn: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#16a34a" },
  approveText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
  receiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xxl, gap: spacing.md },
  modalTitle: { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  modalSub: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  textArea: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, minHeight: 80, textAlignVertical: "top", fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  qtyInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, fontSize: font.size.lg, fontFamily: font.family.bold, color: colors.ink, backgroundColor: colors.bg },
  modalActions: { flexDirection: "row", gap: spacing.md },
  modalCancel: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  modalCancelText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  modalReject: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#dc2626", alignItems: "center" },
  modalConfirm: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center" },
  modalRejectText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
