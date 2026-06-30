import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchPoultryOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string; desc: string }> = {
  LOW:      { label: "Low",      color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", desc: "Minor, monitor closely" },
  MEDIUM:   { label: "Medium",   color: "#d97706", bg: "#fff7ed", border: "#fed7aa", desc: "Requires attention today" },
  HIGH:     { label: "High",     color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", desc: "Urgent — treat or isolate" },
  CRITICAL: { label: "Critical", color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd", desc: "Emergency — vet required now" },
};

export function HealthObservationScreen() {
  const navigation = useNavigation<any>();
  const today = new Date().toISOString().split("T")[0];

  const [flockBatchId,      setFlockBatchId]      = useState("");
  const [penId,             setPenId]             = useState("");
  const [observationDate,   setObservationDate]   = useState(today);
  const [severity,          setSeverity]          = useState<Severity>("MEDIUM");
  const [observation,       setObservation]       = useState("");
  const [treatment,         setTreatment]         = useState("");
  const [recommendation,    setRecommendation]    = useState("");
  const [vetConsulted,      setVetConsulted]      = useState(false);
  const [vetVisitDate,      setVetVisitDate]      = useState("");
  const [veterinarianName,  setVeterinarianName]  = useState("");
  const [errors,            setErrors]            = useState<Record<string, string>>({});

  const { data: opts } = useLookup("poultry_options", async () => {
    const r = await fetchPoultryOptions();
    return r.data;
  });

  const batchOptions: SelectOption[] = useMemo(
    () => (opts?.batches ?? []).map((b) => ({ label: `${b.name} (${b.code}) — ${b.birdType}`, value: b.id })),
    [opts]
  );

  const selectedBatch = useMemo(
    () => (opts?.batches ?? []).find((b) => b.id === flockBatchId),
    [opts, flockBatchId]
  );

  const penOptions: SelectOption[] = useMemo(
    () => (opts?.pens ?? [])
      .filter((p) => !selectedBatch || p.farmId === selectedBatch.farmId)
      .map((p) => ({ label: `${p.name ?? `Pen ${p.penNumber}`} (${p.code})`, value: p.id })),
    [opts, selectedBatch]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!flockBatchId)    e.flockBatchId    = "Select a flock batch";
    if (!observationDate) e.observationDate = "Enter the observation date";
    if (!observation)     e.observation     = "Describe the health observation";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "health_observation",
    endpoint: "/poultry/health-observations",
    onSuccess: () =>
      Alert.alert("Observation Saved", "Health observation has been recorded.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>🏥</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Health Observation</Text>
          <Text style={styles.pageSub}>Log a flock health or welfare concern</Text>
        </View>
      </View>

      <SelectField label="Flock Batch" value={flockBatchId} options={batchOptions}
        onChange={(v) => { setFlockBatchId(v); setPenId(""); setErrors((e) => ({ ...e, flockBatchId: "" })); }}
        required error={errors.flockBatchId} placeholder="Select flock batch…" />

      <SelectField label="Pen (optional)" value={penId} options={penOptions}
        onChange={setPenId}
        placeholder={flockBatchId ? "Select pen (optional)…" : "Select batch first"} />

      <FormField label="Observation Date" value={observationDate}
        onChangeText={(v) => { setObservationDate(v); setErrors((e) => ({ ...e, observationDate: "" })); }}
        required error={errors.observationDate} placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation" />

      {/* Severity */}
      <View style={styles.sevSection}>
        <Text style={styles.fieldLabel}>Severity <Text style={styles.required}>*</Text></Text>
        <View style={styles.sevGrid}>
          {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((s) => {
            const cfg = SEVERITY_CONFIG[s];
            const active = severity === s;
            return (
              <TouchableOpacity key={s}
                style={[styles.sevBtn, active
                  ? { backgroundColor: cfg.bg, borderColor: cfg.color }
                  : { backgroundColor: colors.bgCard, borderColor: colors.border }
                ]}
                onPress={() => setSeverity(s)} activeOpacity={0.8}
              >
                <Text style={[styles.sevLabel, { color: active ? cfg.color : colors.inkLight }]}>{cfg.label}</Text>
                {active && <Text style={[styles.sevDesc, { color: cfg.color }]}>{cfg.desc}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FormField label="Observation" value={observation}
        onChangeText={(v) => { setObservation(v); setErrors((e) => ({ ...e, observation: "" })); }}
        required error={errors.observation} multiline numberOfLines={3}
        style={{ minHeight: 90, textAlignVertical: "top" } as any}
        placeholder="Describe what you observed: symptoms, behaviour changes, appearance…" />

      <FormField label="Treatment Applied (optional)" value={treatment}
        onChangeText={setTreatment} multiline numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: "top" } as any}
        placeholder="Any immediate treatment or action taken…" />

      <FormField label="Recommendation (optional)" value={recommendation}
        onChangeText={setRecommendation} multiline numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: "top" } as any}
        placeholder="Follow-up actions recommended…" />

      {/* Vet visited toggle */}
      <TouchableOpacity style={[styles.vetToggle, vetConsulted && styles.vetToggleActive]}
        onPress={() => setVetConsulted((v) => !v)} activeOpacity={0.8}
      >
        <View style={[styles.vetCheckbox, vetConsulted && styles.vetCheckboxActive]}>
          {vetConsulted && <Text style={styles.vetCheckmark}>✓</Text>}
        </View>
        <Text style={[styles.vetToggleText, vetConsulted && styles.vetToggleTextActive]}>
          Veterinarian was consulted
        </Text>
      </TouchableOpacity>

      {vetConsulted && (
        <>
          <FormField label="Vet Visit Date" value={vetVisitDate} onChangeText={setVetVisitDate}
            placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <FormField label="Veterinarian Name" value={veterinarianName} onChangeText={setVeterinarianName}
            placeholder="Dr. Name / Clinic" />
        </>
      )}

      <Button label="Save Observation" loading={loading} size="lg"
        onPress={async () => {
          if (!validate()) return;
          await submit({
            flockBatchId,
            ...(penId ? { penId } : {}),
            observationDate,
            severity,
            observation,
            ...(treatment       ? { treatment }       : {}),
            ...(recommendation  ? { recommendation }  : {}),
            ...(vetConsulted && vetVisitDate    ? { vetVisitDate }    : {}),
            ...(vetConsulted && veterinarianName ? { veterinarianName } : {}),
          });
        }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap:   { width: 52, height: 52, borderRadius: 16, backgroundColor: "#fef9c3", borderWidth: 1, borderColor: "#fde047", alignItems: "center", justifyContent: "center" },
  pageIconText:   { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight },

  fieldLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  required:   { color: colors.error },

  sevSection: { gap: spacing.sm },
  sevGrid:    { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  sevBtn:     { flex: 1, minWidth: "44%", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.lg, borderWidth: 1.5, alignItems: "center", gap: 2 },
  sevLabel:   { fontSize: font.size.sm, fontWeight: font.weight.bold },
  sevDesc:    { fontSize: 10, textAlign: "center" },

  vetToggle: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.bgCard,
  },
  vetToggleActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  vetCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  vetCheckboxActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  vetCheckmark: { color: colors.white, fontSize: 13, fontWeight: font.weight.bold },
  vetToggleText: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  vetToggleTextActive: { color: colors.brand },
});
