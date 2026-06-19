import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { fetchFlockBatches, fetchFarms } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const CAUSE_OPTIONS: SelectOption[] = [
  { label: "Disease", value: "DISEASE" },
  { label: "Injury / Trauma", value: "INJURY" },
  { label: "Heat Stress", value: "HEAT_STRESS" },
  { label: "Feed / Water Issue", value: "FEED_WATER" },
  { label: "Unknown", value: "UNKNOWN" },
  { label: "Other", value: "OTHER" }
];

export function MortalityScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [count, setCount] = useState("");
  const [cause, setCause] = useState("");
  const [description, setDescription] = useState("");
  const [farms, setFarms] = useState<SelectOption[]>([]);
  const [batches, setBatches] = useState<SelectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFarms().then((r) => {
      const all = (r.data as any[]) ?? [];
      const assigned = user?.hasGlobalAccess ? all : all.filter((f) => user?.farmIds?.includes(f.id));
      setFarms(assigned.map((f) => ({ label: f.name, value: f.id })));
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!farmId) { setBatches([]); return; }
    fetchFlockBatches(farmId).then((r) => {
      setBatches(((r.data as any[]) ?? []).map((b) => ({ label: b.batchCode, value: b.id })));
    }).catch(() => {});
  }, [farmId]);

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select a farm";
    if (!batchId) e.batchId = "Select a flock batch";
    if (!date) e.date = "Date is required";
    if (!count || isNaN(Number(count)) || Number(count) <= 0) e.count = "Enter mortality count";
    if (!cause) e.cause = "Select a cause";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_mortality",
    endpoint: "/poultry/mortality-records",
    onSuccess: () => Alert.alert("Saved", "Mortality recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Mortality Entry</Text>
      <Text style={styles.sub}>Record bird deaths for a flock batch</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setErrors((e) => ({ ...e, batchId: "" })); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Date" required value={date} onChangeText={(v) => { setDate(v); setErrors((e) => ({ ...e, date: "" })); }} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Count" required value={count} onChangeText={(v) => { setCount(v); setErrors((e) => ({ ...e, count: "" })); }} error={errors.count} keyboardType="numeric" placeholder="e.g. 3" />
        </View>
        <View style={styles.half}>
          <SelectField label="Cause" value={cause} options={CAUSE_OPTIONS} onChange={(v) => { setCause(v); setErrors((e) => ({ ...e, cause: "" })); }} error={errors.cause} required />
        </View>
      </View>

      <FormField label="Description / Observation" value={description} onChangeText={setDescription} placeholder="Describe symptoms or findings…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} />

      <Button label="Record Mortality" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({ farmId, flockBatchId: batchId, recordDate: date, count: Number(count), cause, description: description || undefined });
      }} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 }
});
