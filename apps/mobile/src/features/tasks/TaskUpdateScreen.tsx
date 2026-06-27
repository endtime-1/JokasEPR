import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { SelectField, SelectOption } from "../../components/SelectField";
import { FormField } from "../../components/FormField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import { useNetwork } from "../../hooks/useNetwork";

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Pending",     value: "PENDING"     },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed",   value: "COMPLETED"   },
  { label: "Blocked",     value: "BLOCKED"     },
];

const STATUS_META: Record<string, { color: string; bg: string }> = {
  PENDING:     { color: "#64748b", bg: "#f8fafc" },
  IN_PROGRESS: { color: "#d97706", bg: "#fffbeb" },
  COMPLETED:   { color: "#16a34a", bg: "#f0fdf4" },
  BLOCKED:     { color: "#dc2626", bg: "#fef2f2" },
};

export function TaskUpdateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { taskId, taskTitle } = route.params as { taskId: string; taskTitle: string };
  const { online } = useNetwork();

  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { submit, loading } = useSubmit({
    module: "task_update",
    endpoint: `/hr/tasks/${taskId}/status`,
    method: "PATCH",
    onSuccess: () =>
      Alert.alert(
        online ? "Task Updated" : "Saved Offline",
        online ? "Task status has been updated successfully." : "Task update saved and will sync when you reconnect.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!status) e.status = "Please select a new status";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleUpdate() {
    if (!validate()) return;
    await submit({ status, notes: notes || undefined });
  }

  const sMeta = status ? STATUS_META[status] : null;

  return (
    <ScreenWrapper showSync={false}>

      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>✅</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Update Task</Text>
          <Text style={styles.pageSub}>Change status or add progress notes</Text>
        </View>
      </View>

      {/* Task context card */}
      <View style={styles.taskCard}>
        <View style={styles.taskCardTop}>
          <Text style={styles.taskKicker}>TASK</Text>
          {sMeta && (
            <View style={[styles.statusChip, { backgroundColor: sMeta.bg }]}>
              <Text style={[styles.statusChipText, { color: sMeta.color }]}>
                {status.replace("_", " ")}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.taskTitle}>{taskTitle}</Text>
      </View>

      {/* Offline banner */}
      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineIcon}>📴</Text>
          <Text style={styles.offlineText}>You're offline — update will sync automatically when you reconnect.</Text>
        </View>
      )}

      <SelectField
        label="New Status"
        required
        value={status}
        options={STATUS_OPTIONS}
        onChange={(v) => { setStatus(v); setErrors((e) => ({ ...e, status: "" })); }}
        error={errors.status}
        placeholder="Select new status…"
      />

      <FormField
        label="Progress Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        style={{ minHeight: 110, textAlignVertical: "top" } as any}
        placeholder="Describe progress, blockers, or completion notes…"
      />

      <Button
        label={online ? "Update Task" : "Save Offline"}
        loading={loading}
        onPress={handleUpdate}
        size="lg"
      />

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pageIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
    alignItems: "center",
    justifyContent: "center",
  },
  pageIconText: { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight },

  taskCard: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  taskCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  taskKicker: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.brand,
    letterSpacing: 1,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusChipText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
  taskTitle: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.ink },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  offlineIcon: { fontSize: 18 },
  offlineText: { flex: 1, fontSize: font.size.sm, color: colors.warning, fontWeight: font.weight.medium },
});
