import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
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

  async function handleSubmit() {
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
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Create Corrective Action" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="check-circle" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Corrective Action</Text>
          <Text style={styles.sub}>Log a quality issue corrective action</Text>
        </View>
      </View>

      <FormCard label="ACTION DETAILS">
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
      </FormCard>

      <FormCard label="ASSIGNMENT">
        <SelectField label="Assign To (optional)" value={assignedToId} options={userOptions}
          onChange={setAssignedToId} placeholder="Select team member…" />

        <FormField label="Due Date (optional)" value={dueDate}
          onChangeText={setDueDate} placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation" />
      </FormCard>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:   { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

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
