import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchMaintenanceOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  LOW:      { label: "Low",      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", emoji: "🟢" },
  MEDIUM:   { label: "Medium",   color: "#d97706", bg: "#fff7ed", border: "#fed7aa", emoji: "🟡" },
  HIGH:     { label: "High",     color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", emoji: "🟠" },
  CRITICAL: { label: "Critical", color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd", emoji: "🔴" },
};

type AssetType = "machine" | "equipment";

export function BreakdownReportScreen() {
  const navigation = useNavigation<any>();

  const [assetType,   setAssetType]   = useState<AssetType>("machine");
  const [assetId,     setAssetId]     = useState("");
  const [severity,    setSeverity]    = useState<Severity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [rootCause,   setRootCause]   = useState("");
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  const { data: opts } = useLookup("maintenance_options", async () => {
    const r = await fetchMaintenanceOptions();
    return r.data;
  });

  const machineOptions: SelectOption[] = useMemo(
    () => (opts?.machines ?? []).map((m) => ({ label: `${m.name} (${m.code})`, value: m.id })),
    [opts]
  );
  const equipmentOptions: SelectOption[] = useMemo(
    () => (opts?.equipment ?? []).map((e) => ({ label: `${e.name} (${e.code})`, value: e.id })),
    [opts]
  );

  const assetOptions = assetType === "machine" ? machineOptions : equipmentOptions;
  const selectedAssetName = assetOptions.find((o) => o.value === assetId)?.label ?? "";

  function onAssetTypeChange(t: AssetType) {
    setAssetType(t);
    setAssetId("");
    setErrors((e) => ({ ...e, assetId: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!assetId)     e.assetId     = `Select a ${assetType}`;
    if (!description) e.description = "Describe the breakdown";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "breakdown",
    endpoint: "/maintenance/breakdowns",
    onSuccess: () =>
      Alert.alert(
        "Breakdown Reported",
        `${selectedAssetName} has been marked as broken down and a breakdown record has been created.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>🔧</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Report Breakdown</Text>
          <Text style={styles.pageSub}>Log a machine or equipment failure</Text>
        </View>
      </View>

      {/* Critical warning */}
      <View style={styles.warningCard}>
        <Text style={styles.warningText}>
          ⚠️ Submitting this form will mark the asset as{" "}
          <Text style={styles.warningBold}>BROKEN DOWN</Text> and alert the maintenance team.
        </Text>
      </View>

      {/* Asset type toggle */}
      <View style={styles.toggleRow}>
        {(["machine", "equipment"] as AssetType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.toggleBtn, assetType === t && styles.toggleBtnActive]}
            onPress={() => onAssetTypeChange(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleBtnText, assetType === t && styles.toggleBtnTextActive]}>
              {t === "machine" ? "🏭 Machine" : "⚙️ Equipment"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SelectField
        label={assetType === "machine" ? "Machine" : "Equipment"}
        value={assetId} options={assetOptions}
        onChange={(v) => { setAssetId(v); setErrors((e) => ({ ...e, assetId: "" })); }}
        error={errors.assetId} required
        placeholder={`Select ${assetType}…`}
      />

      {/* Severity picker */}
      <View style={styles.sevSection}>
        <Text style={styles.fieldLabel}>Severity <Text style={styles.required}>*</Text></Text>
        <View style={styles.sevGrid}>
          {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((s) => {
            const cfg = SEVERITY_CONFIG[s];
            const active = severity === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.sevBtn,
                  active
                    ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                    : { backgroundColor: colors.bgCard, borderColor: colors.border }
                ]}
                onPress={() => setSeverity(s)}
                activeOpacity={0.8}
              >
                <Text style={styles.sevEmoji}>{cfg.emoji}</Text>
                <Text style={[styles.sevLabel, { color: active ? cfg.color : colors.inkLight }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {severity && (
        <View style={[styles.sevNote, { backgroundColor: SEVERITY_CONFIG[severity].bg, borderColor: SEVERITY_CONFIG[severity].border }]}>
          <Text style={[styles.sevNoteText, { color: SEVERITY_CONFIG[severity].color }]}>
            {severity === "CRITICAL"
              ? "Critical: Immediate shutdown and repair required"
              : severity === "HIGH"
              ? "High: Urgent attention needed, may affect production"
              : severity === "MEDIUM"
              ? "Medium: Schedule repair soon to avoid escalation"
              : "Low: Minor issue, can be addressed during next maintenance window"}
          </Text>
        </View>
      )}

      <FormField
        label="Description" value={description}
        onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
        required error={errors.description} multiline numberOfLines={3}
        style={{ minHeight: 90, textAlignVertical: "top" } as any}
        placeholder="Describe what happened, what symptoms you observed…"
      />

      <FormField
        label="Root Cause (optional)" value={rootCause}
        onChangeText={setRootCause}
        multiline numberOfLines={2}
        style={{ minHeight: 70, textAlignVertical: "top" } as any}
        placeholder="If known, describe what caused the breakdown…"
      />

      <Button label="Report Breakdown" loading={loading} size="lg"
        style={{ backgroundColor: "#dc2626" } as any}
        onPress={async () => {
          if (!validate()) return;
          await submit({
            ...(assetType === "machine"    ? { machineId:   assetId } : {}),
            ...(assetType === "equipment"  ? { equipmentId: assetId } : {}),
            severity,
            description,
            ...(rootCause ? { rootCause } : {}),
          });
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap:   { width: 52, height: 52, borderRadius: 16, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fca5a5", alignItems: "center", justifyContent: "center" },
  pageIconText:   { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight },

  warningCard: { backgroundColor: "#fff7ed", borderRadius: radius.lg, borderWidth: 1, borderColor: "#fed7aa", padding: spacing.md },
  warningText: { fontSize: font.size.sm, color: "#92400e", lineHeight: 20 },
  warningBold: { fontWeight: font.weight.bold },

  toggleRow:        { flexDirection: "row", gap: spacing.sm },
  toggleBtn:        { flex: 1, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", backgroundColor: colors.bgCard },
  toggleBtnActive:  { borderColor: colors.brand, backgroundColor: colors.brandLight },
  toggleBtnText:    { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  toggleBtnTextActive: { color: colors.brand },

  fieldLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  required:   { color: colors.error },

  sevSection: { gap: spacing.sm },
  sevGrid:    { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  sevBtn:     { flex: 1, minWidth: "44%", paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, alignItems: "center", gap: 4 },
  sevEmoji:   { fontSize: 18 },
  sevLabel:   { fontSize: font.size.sm, fontWeight: font.weight.bold },

  sevNote: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  sevNoteText: { fontSize: font.size.sm },
});
