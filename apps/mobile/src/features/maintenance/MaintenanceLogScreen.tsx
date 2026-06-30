import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchMaintenanceOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";
import type { RecordsStackParams } from "../../navigation/types";

type RouteProps = RouteProp<RecordsStackParams, "MaintenanceLog">;

const MAINTENANCE_TYPES: SelectOption[] = [
  { label: "Preventive",  value: "PREVENTIVE"  },
  { label: "Corrective",  value: "CORRECTIVE"  },
  { label: "Inspection",  value: "INSPECTION"  },
  { label: "Calibration", value: "CALIBRATION" },
  { label: "Repair",      value: "REPAIR"      },
];

export function MaintenanceLogScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProps>();
  const { scheduleId, machineId, equipmentId, assetName, maintenanceType: defaultType } = route.params;

  const today = new Date().toISOString().split("T")[0];

  const [maintenanceType, setMaintenanceType] = useState(defaultType ?? "");
  const [maintenanceDate, setMaintenanceDate] = useState(today);
  const [description,     setDescription]     = useState("");
  const [findings,        setFindings]        = useState("");
  const [nextDueDate,     setNextDueDate]      = useState("");
  const [overrideMachineId, setOverrideMachineId] = useState(machineId ?? "");
  const [overrideEquipId,   setOverrideEquipId]   = useState(equipmentId ?? "");
  const [errors,          setErrors]          = useState<Record<string, string>>({});

  // If no pre-selected asset, let user pick from maintenance options
  const needsAssetPicker = !machineId && !equipmentId;

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

  function validate() {
    const e: Record<string, string> = {};
    if (!maintenanceType) e.maintenanceType = "Select maintenance type";
    if (!maintenanceDate) e.maintenanceDate = "Enter the date work was done";
    if (!description)     e.description     = "Describe the work performed";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "maintenance_record",
    endpoint: "/maintenance/records",
    onSuccess: () =>
      Alert.alert(
        "Work Logged",
        "Maintenance record has been saved successfully.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>📋</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Log Work Done</Text>
          <Text style={styles.pageSub} numberOfLines={1}>{assetName}</Text>
        </View>
      </View>

      {scheduleId && (
        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleCardLabel}>Logging against scheduled task</Text>
          <Text style={styles.scheduleCardValue}>{assetName}</Text>
        </View>
      )}

      {/* Asset picker — only shown when screen opened without a pre-selected asset */}
      {needsAssetPicker && (
        <>
          <SelectField label="Machine (if applicable)" value={overrideMachineId} options={machineOptions}
            onChange={(v) => { setOverrideMachineId(v); setOverrideEquipId(""); }}
            placeholder="Select machine (optional)…" />
          <SelectField label="Equipment (if applicable)" value={overrideEquipId} options={equipmentOptions}
            onChange={(v) => { setOverrideEquipId(v); setOverrideMachineId(""); }}
            placeholder="Select equipment (optional)…" />
        </>
      )}

      <SelectField
        label="Maintenance Type" value={maintenanceType} options={MAINTENANCE_TYPES}
        onChange={(v) => { setMaintenanceType(v); setErrors((e) => ({ ...e, maintenanceType: "" })); }}
        required error={errors.maintenanceType} placeholder="Select type…"
      />

      <FormField
        label="Date Work Was Done" value={maintenanceDate}
        onChangeText={(v) => { setMaintenanceDate(v); setErrors((e) => ({ ...e, maintenanceDate: "" })); }}
        required error={errors.maintenanceDate}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
      />

      <FormField
        label="Description of Work" value={description}
        onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
        required error={errors.description} multiline numberOfLines={3}
        style={{ minHeight: 90, textAlignVertical: "top" } as any}
        placeholder="What maintenance work was performed?"
      />

      <FormField
        label="Findings (optional)" value={findings}
        onChangeText={setFindings}
        multiline numberOfLines={2}
        style={{ minHeight: 70, textAlignVertical: "top" } as any}
        placeholder="Any observations, wear, or issues found during the work…"
      />

      <FormField
        label="Next Due Date (optional)" value={nextDueDate}
        onChangeText={setNextDueDate}
        placeholder="YYYY-MM-DD — leave blank to auto-calculate from frequency"
        keyboardType="numbers-and-punctuation"
      />

      {nextDueDate && scheduleId && (
        <View style={styles.nextDueNote}>
          <Text style={styles.nextDueNoteText}>
            ✅ This will update the schedule's next due date to {nextDueDate}
          </Text>
        </View>
      )}

      <Button label="Save Maintenance Record" loading={loading} size="lg"
        onPress={async () => {
          if (!validate()) return;
          const finalMachineId   = machineId   ?? overrideMachineId  || undefined;
          const finalEquipmentId = equipmentId ?? overrideEquipId || undefined;
          await submit({
            ...(scheduleId     ? { scheduleId }     : {}),
            ...(finalMachineId   ? { machineId: finalMachineId }     : {}),
            ...(finalEquipmentId ? { equipmentId: finalEquipmentId } : {}),
            maintenanceType,
            maintenanceDate,
            description,
            ...(findings     ? { findings }     : {}),
            ...(nextDueDate  ? { nextDueDate }  : {}),
          });
        }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap:   { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  pageIconText:   { fontSize: 26 },
  pageHeaderText: { flex: 1, gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight },

  scheduleCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#eff6ff", borderRadius: radius.lg, borderWidth: 1, borderColor: "#bfdbfe", padding: spacing.md,
  },
  scheduleCardLabel: { fontSize: font.size.xs, color: "#1d4ed8" },
  scheduleCardValue: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: "#1e40af" },

  nextDueNote: { backgroundColor: "#f0fdf4", borderRadius: radius.md, borderWidth: 1, borderColor: "#bbf7d0", padding: spacing.md },
  nextDueNoteText: { fontSize: font.size.sm, color: "#15803d" },
});
