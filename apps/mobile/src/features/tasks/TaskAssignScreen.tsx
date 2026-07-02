import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import { fetchEmployees, submitCreateTask, type EmployeeItem } from "../../api/endpoints";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW:    "#6b7280",
  MEDIUM: "#d97706",
  HIGH:   "#ea580c",
  URGENT: "#dc2626",
};

export function TaskAssignScreen() {
  const navigation = useNavigation<any>();

  const [title, setTitle]           = useState("");
  const [description, setDesc]      = useState("");
  const [notes, setNotes]           = useState("");
  const [priority, setPriority]     = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate]       = useState("");
  const [employees, setEmployees]   = useState<EmployeeItem[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [empSearch, setEmpSearch]   = useState("");
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetchEmployees();
      setEmployees((res.data as any) ?? []);
    } catch {
      //
    } finally {
      setLoadingEmp(false);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const filteredEmps = empSearch.trim()
    ? employees.filter((e) =>
        e.fullName.toLowerCase().includes(empSearch.toLowerCase()) ||
        (e.employeeRole?.name ?? "").toLowerCase().includes(empSearch.toLowerCase())
      )
    : employees;

  function toggleEmployee(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!title.trim()) {
      Alert.alert("Required", "Please enter a task title.");
      return;
    }
    if (selected.size === 0) {
      Alert.alert("Required", "Please select at least one assignee.");
      return;
    }

    setSubmitting(true);
    try {
      await submitCreateTask({
        title:       title.trim(),
        description: description.trim() || undefined,
        notes:       notes.trim()       || undefined,
        priority,
        dueDate:     dueDate.trim()     || undefined,
        assigneeIds: Array.from(selected),
      });
      Alert.alert("Task Assigned", "The task has been created and assigned.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Could not create task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderEmployee({ item }: { item: EmployeeItem }) {
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.empRow, isSelected && styles.empRowSelected]}
        onPress={() => toggleEmployee(item.id)}
        activeOpacity={0.75}
      >
        <View style={[styles.empAvatar, isSelected && styles.empAvatarSelected]}>
          <Text style={[styles.empInitial, isSelected && styles.empInitialSelected]}>
            {item.fullName[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
        <View style={styles.empInfo}>
          <Text style={styles.empName}>{item.fullName}</Text>
          <Text style={styles.empRole}>{item.employeeRole?.name ?? item.branch?.name ?? "—"}</Text>
        </View>
        {isSelected && <Icon name="check-circle" size={20} color={colors.brand} />}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <PageHeader icon="clipboard-plus" title="Assign Task" subtitle="Create and assign a task to team members" />

          {/* ── Task Details ─────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Task Details</Text>

            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="What needs to be done?"
              placeholderTextColor={colors.inkLight}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Additional context or instructions..."
              placeholderTextColor={colors.inkLight}
              value={description}
              onChangeText={setDesc}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Due Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2026-07-15"
              placeholderTextColor={colors.inkLight}
              value={dueDate}
              onChangeText={setDueDate}
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Internal notes for this task..."
              placeholderTextColor={colors.inkLight}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          {/* ── Priority ─────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    { borderColor: PRIORITY_COLORS[p] },
                    priority === p && { backgroundColor: PRIORITY_COLORS[p] },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text
                    style={[
                      styles.priorityChipText,
                      { color: priority === p ? "#fff" : PRIORITY_COLORS[p] },
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Assignees ────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Assignees{selected.size > 0 ? ` (${selected.size} selected)` : ""}
            </Text>
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search employees..."
              placeholderTextColor={colors.inkLight}
              value={empSearch}
              onChangeText={setEmpSearch}
            />
            {loadingEmp ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
            ) : (
              <View style={styles.empList}>
                {filteredEmps.map((emp) => renderEmployee({ item: emp }))}
                {filteredEmps.length === 0 && (
                  <Text style={styles.emptyText}>No employees found</Text>
                )}
              </View>
            )}
          </View>

          {/* ── Submit ───────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="send" size={18} color="#fff" />
                <Text style={styles.submitText}>Assign Task</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },

  section: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  sectionLabel: {
    fontSize: font.size.sm,
    fontFamily: font.family.semibold,
    color: colors.inkMid,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    fontSize: font.size.sm,
    fontFamily: font.family.medium,
    color: colors.inkMid,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.size.md,
    fontFamily: font.family.regular,
    color: colors.ink,
  },
  textarea: { minHeight: 72, paddingTop: spacing.sm },

  searchInput: { marginBottom: spacing.xs },

  priorityRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  priorityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  priorityChipText: {
    fontSize: font.size.sm,
    fontFamily: font.family.semibold,
  },

  empList:  { gap: spacing.xs },
  empRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  empRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  empAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  empAvatarSelected: { backgroundColor: colors.brand },
  empInitial: {
    fontSize: font.size.md,
    fontFamily: font.family.bold,
    color: colors.inkMid,
  },
  empInitialSelected: { color: "#fff" },
  empInfo: { flex: 1 },
  empName: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  empRole: { fontSize: font.size.xs, fontFamily: font.family.regular, color: colors.inkMid },

  emptyText: {
    textAlign: "center",
    color: colors.inkLight,
    fontFamily: font.family.regular,
    paddingVertical: spacing.md,
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    fontSize: font.size.md,
    fontFamily: font.family.bold,
    color: "#fff",
  },
});
