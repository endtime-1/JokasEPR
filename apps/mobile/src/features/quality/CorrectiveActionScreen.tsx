import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchQualityOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; border: string }> = {
  LOW:      { label: "Low",      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  MEDIUM:   { label: "Medium",   color: "#d97706", bg: "#fff7ed", border: "#fed7aa" },
  HIGH:     { label: "High",     color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  CRITICAL: { label: "Critical", color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd" },
};

export function CorrectiveActionScreen() {
  const navigation = useNavigation<any>();

  const [title,             setTitle]             = useState("");
  const [description,       setDescription]       = useState("");
  const [priority,          setPriority]          = useState<Priority>("MEDIUM");
  const [rootCause,         setRootCause]         = useState("");
  const [preventiveMeasure, setPreventiveMeasure] = useState("");
  const [assignedToId,      setAssignedToId]      = useState("");
  const [dueDate,           setDueDate]           = useState("");
  const [errors,            setErrors]            = useState<Record<string, string>>({});

  const { data: opts } = useLookup("quality_options", async () => {
    const r = await fetchQualityOptions();
    return r.data;
  });

  const userOptions: SelectOption[] = useMemo(
    () => (opts?.users ?? []).map((u) => ({ label: u.fullName, value: u.id })),
    [opts]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!title)       e.title       = "Enter a title for this action";
    if (!description) e.description = "Describe what needs to be done";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "corrective_action",
    endpoint: "/quality/corrective-actions",
    onSuccess: () =>
      Alert.alert("Action Created", "Corrective action has been logged.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>✅</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Corrective Action</Text>
          <Text style={styles.pageSub}>Log a quality issue corrective action</Text>
        </View>
      </View>

      <FormField label="Title" value={title}
        onChangeText={(v) => { setTitle(v); setErrors((e) => ({ ...e, title: "" })); }}
        required error={errors.title} placeholder="Short title for this corrective action…" />

      <FormField label="Description" value={description}
        onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
        required error={errors.description} multiline numberOfLines={3}
        style={{ minHeight: 90, textAlignVertical: "top" } as any}
        placeholder="What needs to be done and why…" />

      {/* Priority */}
      <View style={styles.prioritySection}>
        <Text style={styles.fieldLabel}>Priority <Text style={styles.required}>*</Text></Text>
        <View style={styles.priorityRow}>
          {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((p) => {
            const cfg    = PRIORITY_CONFIG[p];
            const active = priority === p;
            return (
              <TouchableOpacity key={p}
                style={[styles.priorityBtn, active
                  ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                  : { backgroundColor: colors.bgCard, borderColor: colors.border }
                ]}
                onPress={() => setPriority(p)} activeOpacity={0.8}
              >
                <Text style={[styles.priorityLabel, { color: active ? cfg.color : colors.inkLight }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FormField label="Root Cause (optional)" value={rootCause}
        onChangeText={setRootCause} multiline numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: "top" } as any}
        placeholder="What caused this issue?…" />

      <FormField label="Preventive Measure (optional)" value={preventiveMeasure}
        onChangeText={setPreventiveMeasure} multiline numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: "top" } as any}
        placeholder="How will this be prevented in future?…" />

      <SelectField label="Assign To (optional)" value={assignedToId} options={userOptions}
        onChange={setAssignedToId} placeholder="Select team member…" />

      <FormField label="Due Date (optional)" value={dueDate}
        onChangeText={setDueDate} placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation" />

      <Button label="Create Corrective Action" loading={loading} size="lg"
        onPress={async () => {
          if (!validate()) return;
          await submit({
            title,
            description,
            priority,
            ...(rootCause         ? { rootCause }         : {}),
            ...(preventiveMeasure ? { preventiveMeasure } : {}),
            ...(assignedToId      ? { assignedToId }      : {}),
            ...(dueDate           ? { dueDate }           : {}),
          });
        }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap:   { width: 52, height: 52, borderRadius: 16, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", alignItems: "center", justifyContent: "center" },
  pageIconText:   { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight },

  fieldLabel:     { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  required:       { color: colors.error },

  prioritySection: { gap: spacing.sm },
  priorityRow:     { flexDirection: "row", gap: spacing.sm },
  priorityBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg,
    borderWidth: 1.5, alignItems: "center",
  },
  priorityLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold },
});
