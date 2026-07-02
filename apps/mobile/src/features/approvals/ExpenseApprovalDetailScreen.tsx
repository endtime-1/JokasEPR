import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { approveExpense, fetchExpenseDetail, rejectExpense, type ExpenseDetailRecord } from "../../api/endpoints";
import type { ApprovalsScreenProps } from "../../navigation/types";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ExpenseApprovalDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<ApprovalsScreenProps<"ExpenseApprovalDetail">["route"]>();
  const toast      = useToast();
  const { expenseId } = route.params;

  const [expense,    setExpense]    = useState<ExpenseDetailRecord | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExpenseDetail(expenseId);
      setExpense(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load expense details." });
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    setSubmitting(true);
    try {
      await approveExpense(expenseId);
      toast.show({ type: "success", message: "Expense approved successfully." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Approval failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.show({ type: "warning", message: "Please provide a reason for rejection." });
      return;
    }
    setSubmitting(true);
    setRejectModal(false);
    try {
      await rejectExpense(expenseId, { reason: rejectReason.trim() });
      toast.show({ type: "info", message: "Expense rejected." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Rejection failed. Please try again." });
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

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errorText}>Expense not found.</Text></View>
      </SafeAreaView>
    );
  }

  const isAlreadyActioned = expense.status !== "PENDING_APPROVAL";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Amount hero */}
        <View style={styles.amountCard}>
          <View style={styles.amountIconWrap}>
            <Icon name="receipt" size={28} color="#dc2626" />
          </View>
          <Text style={styles.amountLabel}>Expense Amount</Text>
          <Text style={styles.amountValue}>{GHS(Number(expense.amount))}</Text>
          {isAlreadyActioned && (
            <View style={[styles.statusPill, expense.status === "APPROVED" ? styles.pillGreen : styles.pillRed]}>
              <Text style={[styles.statusPillText, expense.status === "APPROVED" ? styles.pillGreenText : styles.pillRedText]}>
                {expense.status}
              </Text>
            </View>
          )}
        </View>

        {/* Detail rows */}
        <View style={styles.detailCard}>
          <DetailRow icon="text-box-outline"     label="Description"  value={expense.description} />
          <DetailRow icon="tag-outline"           label="Category"     value={expense.category?.name ?? "—"} />
          <DetailRow icon="store-outline"         label="Vendor"       value={expense.vendorName ?? "—"} />
          <DetailRow icon="calendar-outline"      label="Date"         value={new Date(expense.expenseDate).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })} />
          <DetailRow icon="pound-box-outline"     label="Reference"    value={expense.reference} />
          <DetailRow icon="office-building"       label="Branch"       value={expense.branch?.name ?? "—"} />
          {expense.requestedBy && (
            <DetailRow icon="account-outline"    label="Submitted by" value={expense.requestedBy.fullName} last />
          )}
        </View>

        {expense.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{expense.notes}</Text>
          </View>
        ) : null}

        {/* Action buttons */}
        {!isAlreadyActioned && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={() => setRejectModal(true)}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <Icon name="close-circle-outline" size={18} color="#dc2626" />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.approveBtn]}
              onPress={handleApprove}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Icon name="check-circle-outline" size={18} color={colors.white} />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Reject reason modal */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reason for Rejection</Text>
            <Text style={styles.modalSub}>This will be shared with the submitter.</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Enter reason…"
              placeholderTextColor={colors.inkLight}
              multiline
              numberOfLines={4}
              value={rejectReason}
              onChangeText={setRejectReason}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalRejectBtn} onPress={handleReject}>
                <Text style={styles.modalRejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Icon name={icon as any} size={16} color={colors.inkLight} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: font.size.sm, color: colors.error },

  amountCard:     { alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl, gap: spacing.sm, ...shadow.md },
  amountIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" },
  amountLabel:    { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.medium },
  amountValue:    { fontSize: 36, fontFamily: font.family.extrabold, color: colors.ink },
  statusPill:     { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, marginTop: spacing.xs },
  pillGreen:      { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac" },
  pillRed:        { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5" },
  statusPillText: { fontSize: font.size.xs, fontFamily: font.family.bold },
  pillGreenText:  { color: "#16a34a" },
  pillRedText:    { color: "#dc2626" },

  detailCard:    { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  detailRow:     { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel:   { width: 90, fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.medium },
  detailValue:   { flex: 1, fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink, textAlign: "right" },

  notesCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  notesLabel: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },
  notesText:  { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular, lineHeight: 20 },

  actions:        { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  btn:            { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.lg, borderRadius: radius.xl },
  rejectBtn:      { borderWidth: 1.5, borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  rejectBtnText:  { fontSize: font.size.md, fontFamily: font.family.bold, color: "#dc2626" },
  approveBtn:     { backgroundColor: "#16a34a" },
  approveBtnText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },

  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard:      { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.xxl, gap: spacing.md },
  modalTitle:     { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  modalSub:       { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
  textArea:       { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, minHeight: 100, textAlignVertical: "top", fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  modalActions:   { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  modalCancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  modalCancelText:{ fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  modalRejectBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: "#dc2626", alignItems: "center" },
  modalRejectText:{ fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
