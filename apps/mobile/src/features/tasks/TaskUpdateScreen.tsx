import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Icon } from "../../components/Icon";
import { Badge } from "../../components/Badge";
import { FormField } from "../../components/FormField";
import { SelectField, type SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { fetchTask, updateTaskStatus, type Task } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  URGENT: { label: "Urgent",  ...semantic.priority.critical },
  HIGH:   { label: "High",    ...semantic.priority.high     },
  MEDIUM: { label: "Medium",  ...semantic.priority.medium   },
  LOW:    { label: "Low",     ...semantic.priority.low      },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  COMPLETED:   { label: "Completed",   ...semantic.status.approved   },
  IN_PROGRESS: { label: "In Progress", ...semantic.status.inProgress },
  OPEN:        { label: "Open",        ...semantic.status.pending    },
  ON_HOLD:     { label: "On Hold",     ...semantic.status.rejected   },
  CANCELLED:   { label: "Cancelled",   ...semantic.status.closed     },
};

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Open",        value: "OPEN"        },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "On Hold",     value: "ON_HOLD"     },
  { label: "Completed",   value: "COMPLETED"   },
  { label: "Cancelled",   value: "CANCELLED"   },
];

const MANAGER_ROLES = ["SUPER_ADMIN", "CEO", "MANAGER", "HR_MANAGER", "ADMIN"];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isPastDue(task: Task) {
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date() && task.status !== "COMPLETED" && task.status !== "CANCELLED";
}

function InfoRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon as any} size={15} color={accent ?? colors.inkLight} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, accent ? { color: accent } : {}]}>{value}</Text>
    </View>
  );
}

export function TaskUpdateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { taskId } = route.params as { taskId: string; taskTitle?: string };
  const { user } = useAuth();

  const isManager = user?.roles?.some((r) => MANAGER_ROLES.includes(r)) ?? false;

  const [task, setTask]         = useState<Task | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const [newStatus, setNewStatus] = useState("");
  const [newNotes, setNewNotes]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchTask(taskId);
      setTask((res as any).data ?? res);
    } catch (e: any) {
      setError(e?.message ?? "Could not load task.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleUpdate() {
    if (!newStatus) { setFormErr("Please select a new status."); return; }
    setFormErr("");
    setSaving(true);
    try {
      await updateTaskStatus(taskId, { status: newStatus, notes: newNotes || undefined });
      Alert.alert("Task Updated", "Status updated successfully.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update task.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading task…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !task) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error || "Task not found."}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const pMeta    = PRIORITY_META[task.priority] ?? PRIORITY_META.LOW;
  const sMeta    = STATUS_META[task.status] ?? STATUS_META.OPEN;
  const pastDue  = isPastDue(task);
  const assignees = task.assignments?.map((a) => a.employee.fullName).join(", ")
    ?? task.assignees?.map((a) => a.fullName).join(", ")
    ?? task.assignedTo?.fullName;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.priorityDot, { backgroundColor: pMeta.color }]} />
            <Text style={styles.taskTitle}>{task.title}</Text>
          </View>
          <Badge label={sMeta.label} color={sMeta.color} bg={sMeta.bg} border={sMeta.border} />
        </View>

        {task.description ? (
          <Text style={styles.description}>{task.description}</Text>
        ) : null}

        {/* ── Meta Info ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TASK DETAILS</Text>
          <Badge label={pMeta.label} color={pMeta.color} bg={pMeta.bg} border={pMeta.border} />

          <View style={styles.infoGrid}>
            {task.dueDate && (
              <InfoRow
                icon={pastDue ? "alert-circle" : "calendar"}
                label="Due"
                value={pastDue ? `OVERDUE · ${formatDate(task.dueDate)}` : formatDate(task.dueDate)}
                accent={pastDue ? colors.error : undefined}
              />
            )}
            {task.completedAt && (
              <InfoRow icon="check-circle" label="Completed" value={formatDate(task.completedAt)} accent="#16a34a" />
            )}
            {task.createdAt && (
              <InfoRow icon="clock-outline" label="Created" value={formatDate(task.createdAt)} />
            )}
            {task.assignedBy && (
              <InfoRow icon="account-arrow-right" label="Assigned by" value={task.assignedBy.fullName} />
            )}
            {assignees && (
              <InfoRow icon="account-multiple" label="Assigned to" value={assignees} />
            )}
            {(task.farm || task.branch || task.productionSite) && (
              <InfoRow icon="map-marker" label="Location"
                value={[task.farm?.name, task.productionSite?.name, task.branch?.name].filter(Boolean).join(" · ")}
              />
            )}
            {task.taskType && (
              <InfoRow icon="tag-outline" label="Type" value={task.taskType} />
            )}
          </View>
        </View>

        {/* ── Current Notes ── */}
        {task.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NOTES / PROGRESS</Text>
            <Text style={styles.notesText}>{task.notes}</Text>
          </View>
        ) : null}

        {/* ── Assignees Detail ── */}
        {task.assignments && task.assignments.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TEAM</Text>
            {task.assignments.map((a) => (
              <View key={a.id} style={styles.assigneeRow}>
                <View style={styles.assigneeAvatar}>
                  <Text style={styles.assigneeInitial}>{a.employee.fullName[0]?.toUpperCase() ?? "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assigneeName}>{a.employee.fullName}</Text>
                  {a.employee.code ? <Text style={styles.assigneeCode}>{a.employee.code}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Update Form ── */}
        {task.status !== "COMPLETED" && task.status !== "CANCELLED" && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>UPDATE STATUS</Text>

            {formErr ? (
              <View style={styles.formErrBanner}>
                <Icon name="alert" size={14} color={colors.error} />
                <Text style={styles.formErrText}>{formErr}</Text>
              </View>
            ) : null}

            <SelectField
              label="New Status"
              required
              value={newStatus}
              options={STATUS_OPTIONS.filter((o) =>
                isManager ? true : o.value !== "CANCELLED"
              )}
              onChange={(v) => { setNewStatus(v); setFormErr(""); }}
              placeholder="Select new status…"
            />

            <FormField
              label="Progress Notes"
              value={newNotes}
              onChangeText={setNewNotes}
              multiline
              numberOfLines={3}
              style={{ minHeight: 90, textAlignVertical: "top" } as any}
              placeholder="Describe progress, blockers, or completion notes…"
            />

            <Button
              label={saving ? "Saving…" : "Update Task"}
              loading={saving}
              onPress={handleUpdate}
              size="lg"
            />
          </View>
        )}

        {/* ── Completed / Cancelled state ── */}
        {(task.status === "COMPLETED" || task.status === "CANCELLED") && isManager && (
          <TouchableOpacity
            style={styles.reopenBtn}
            onPress={() => {
              Alert.alert(
                "Reopen Task",
                "Set this task back to Pending?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reopen", onPress: async () => {
                    setSaving(true);
                    try {
                      await updateTaskStatus(taskId, { status: "OPEN", notes: "Reopened by manager." });
                      load();
                    } catch (e: any) {
                      Alert.alert("Error", e?.message ?? "Could not reopen task.");
                    } finally { setSaving(false); }
                  }},
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Icon name="refresh" size={16} color={colors.brand} />
            <Text style={styles.reopenText}>Reopen Task</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
  errorText: { fontSize: font.size.sm, color: colors.error, fontFamily: font.family.medium, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    backgroundColor: colors.brandLight, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.brandMid,
  },
  retryText: { fontSize: font.size.sm, color: colors.brand, fontFamily: font.family.semibold },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  priorityDot: { width: 4, borderRadius: 2, alignSelf: "stretch", minHeight: 20, marginTop: 2 },
  taskTitle: { flex: 1, fontSize: font.size.xl - 1, fontFamily: font.family.extrabold, color: colors.ink },

  description: {
    fontSize: font.size.md - 1,
    fontFamily: font.family.regular,
    color: colors.inkMid,
    lineHeight: 22,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bold,
    color: colors.inkLight,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  infoGrid: { gap: spacing.xs },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 2 },
  infoLabel: { fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.inkLight, width: 90 },
  infoValue: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },

  notesText: {
    fontSize: font.size.sm,
    fontFamily: font.family.regular,
    color: colors.inkMid,
    lineHeight: 20,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  assigneeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  assigneeAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  assigneeInitial: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.brand },
  assigneeName: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  assigneeCode: { fontSize: font.size.xs, fontFamily: font.family.regular, color: colors.inkLight },

  formErrBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: "#fef2f2", borderRadius: radius.lg, padding: spacing.sm,
    borderWidth: 1, borderColor: "#fca5a5",
  },
  formErrText: { fontSize: font.size.sm, color: colors.error, fontFamily: font.family.medium, flex: 1 },

  reopenBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  reopenText: { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.brand },
});
