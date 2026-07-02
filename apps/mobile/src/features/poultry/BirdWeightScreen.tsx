import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchPoultryOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

// Approximate target weights (kg) by bird type and age (weeks)
// Used for a simple benchmark indicator only — not authoritative
const TARGET_WEIGHT: Record<string, number> = {
  BROILERS: 2.2,   // 6-week market weight target
  LAYERS:   1.7,   // mature layer weight
  COCKERELS: 2.8,
  BREEDERS: 2.5,
  CHICKS:   0.04,  // day-old
};

function weightStatus(birdType: string, avgKg: number): { label: string; color: string; bg: string } {
  const target = TARGET_WEIGHT[birdType] ?? 2.0;
  const ratio  = avgKg / target;
  if (ratio < 0.8)  return { label: "Below target", color: "#dc2626", bg: "#fef2f2" };
  if (ratio < 0.95) return { label: "Slightly low",  color: "#d97706", bg: "#fff7ed" };
  if (ratio <= 1.1) return { label: "On target ✓",  color: "#15803d", bg: "#f0fdf4" };
  return              { label: "Above target",       color: "#7c3aed", bg: "#faf5ff" };
}

export function BirdWeightScreen() {
  const navigation = useNavigation<any>();
  const today = new Date().toISOString().split("T")[0];

  const [flockBatchId, setFlockBatchId] = useState("");
  const [penId,        setPenId]        = useState("");
  const [recordDate,   setRecordDate]   = useState(today);
  const [sampleSize,   setSampleSize]   = useState("");
  const [avgWeightKg,  setAvgWeightKg]  = useState("");
  const [notes,        setNotes]        = useState("");
  const [errors,       setErrors]       = useState<Record<string, string>>({});

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

  const avgNum = parseFloat(avgWeightKg) || 0;
  const status = selectedBatch && avgNum > 0
    ? weightStatus(selectedBatch.birdType, avgNum)
    : null;

  function validate() {
    const e: Record<string, string> = {};
    if (!flockBatchId) e.flockBatchId = "Select a flock batch";
    if (!recordDate)   e.recordDate   = "Enter the weighing date";
    if (!sampleSize || parseInt(sampleSize, 10) < 1) e.sampleSize = "Enter number of birds weighed (min 1)";
    if (!avgWeightKg || avgNum <= 0) e.avgWeightKg = "Enter average weight in kg";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "bird_weight",
    endpoint: "/poultry/bird-weight-records",
    onSuccess: () =>
      Alert.alert("Weight Recorded", "Bird weight record has been saved.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId,
      ...(penId ? { penId } : {}),
      recordDate,
      sampleSize: parseInt(sampleSize, 10),
      averageWeightKg: avgNum,
      ...(notes ? { notes } : {}),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Weight Record" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="scale" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Bird Weight Record</Text>
          <Text style={styles.sub}>Log average body weight for growth tracking</Text>
        </View>
      </View>

      <FormCard label="FLOCK DETAILS">
        <SelectField label="Flock Batch" value={flockBatchId} options={batchOptions}
          onChange={(v) => { setFlockBatchId(v); setPenId(""); setErrors((e) => ({ ...e, flockBatchId: "" })); }}
          required error={errors.flockBatchId} placeholder="Select flock batch…" />

        <SelectField label="Pen (optional)" value={penId} options={penOptions}
          onChange={setPenId}
          placeholder={flockBatchId ? "Select pen (optional)…" : "Select batch first"} />

        <FormField label="Weighing Date" value={recordDate}
          onChangeText={(v) => { setRecordDate(v); setErrors((e) => ({ ...e, recordDate: "" })); }}
          required error={errors.recordDate} placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation" />
      </FormCard>

      <FormCard label="WEIGHT DATA">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Birds Sampled" value={sampleSize}
              onChangeText={(v) => { setSampleSize(v); setErrors((e) => ({ ...e, sampleSize: "" })); }}
              required error={errors.sampleSize} placeholder="e.g. 30"
              keyboardType="number-pad" />
          </View>
          <View style={styles.half}>
            <FormField label="Avg Weight (kg)" value={avgWeightKg}
              onChangeText={(v) => { setAvgWeightKg(v); setErrors((e) => ({ ...e, avgWeightKg: "" })); }}
              required error={errors.avgWeightKg} placeholder="e.g. 1.85"
              keyboardType="decimal-pad" />
          </View>
        </View>

        {status && (
          <View style={[styles.statusCard, { backgroundColor: status.bg }]}>
            <View style={styles.statusLeft}>
              <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
              <Text style={styles.statusSub}>
                Target ≈ {TARGET_WEIGHT[selectedBatch!.birdType] ?? 2.0} kg for {selectedBatch!.birdType}
              </Text>
            </View>
            <Text style={[styles.statusWeight, { color: status.color }]}>
              {avgNum.toFixed(3)} kg
            </Text>
          </View>
        )}
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes (optional)" value={notes} onChangeText={setNotes}
          multiline numberOfLines={2}
          style={{ minHeight: 60, textAlignVertical: "top" } as any}
          placeholder="Any observations about the weighing session…" />
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

  row:  { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },

  statusCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: "transparent",
  },
  statusLeft:   { gap: 3 },
  statusLabel:  { fontSize: font.size.md, fontWeight: font.weight.bold },
  statusSub:    { fontSize: font.size.xs, color: colors.inkLight },
  statusWeight: { fontSize: 28, fontWeight: font.weight.extrabold },
});
