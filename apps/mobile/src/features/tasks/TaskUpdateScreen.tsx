import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { SelectField, SelectOption } from "../../components/SelectField";
import { FormField } from "../../components/FormField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useSubmit } from "../../hooks/useSubmit";
import { colors, font, spacing } from "../../constants/theme";
import { useNetwork } from "../../hooks/useNetwork";

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Pending", value: "PENDING" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Blocked", value: "BLOCKED" }
];

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
        online ? "Updated" : "Saved Offline",
        online ? "Task status updated." : "Task update saved. It will sync when you are back online.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      )
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!status) e.status = "Select a status";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleUpdate() {
    if (!validate()) return;
    await submit({ status, notes: notes || undefined });
  }

  return (
    <ScreenWrapper showSync={false}>
      <Card style={styles.taskInfo}>
        <Text style={styles.taskLabel}>Task</Text>
        <Text style={styles.taskTitle}>{taskTitle}</Text>
      </Card>

      {!online && (
        <Card style={styles.offlineCard}>
          <Text style={styles.offlineText}>📴 Offline — update will sync automatically when you reconnect.</Text>
        </Card>
      )}

      <SelectField
        label="New Status"
        required
        value={status}
        options={STATUS_OPTIONS}
        onChange={(v) => { setStatus(v); setErrors((e) => ({ ...e, status: "" })); }}
        error={errors.status}
        placeholder="Select status…"
      />

      <FormField
        label="Update Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        style={{ minHeight: 100, textAlignVertical: "top" } as any}
        placeholder="Describe progress, blockers, or completion notes…"
      />

      <Button label={online ? "Update Task" : "Save Offline"} loading={loading} onPress={handleUpdate} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  taskInfo: { gap: spacing.xs, backgroundColor: colors.brandLight, borderColor: colors.brand + "40" },
  taskLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand, textTransform: "uppercase" },
  taskTitle: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.ink },
  offlineCard: { backgroundColor: colors.warningBg, borderColor: colors.warning + "40" },
  offlineText: { fontSize: font.size.sm, color: colors.warning }
});
