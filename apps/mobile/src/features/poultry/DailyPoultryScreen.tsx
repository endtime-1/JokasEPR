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

type Form = {
  farmId: string;
  flockBatchId: string;
  recordDate: string;
  openingCount: string;
  closingCount: string;
  mortalityCount: string;
  bodyWeightKg: string;
  notes: string;
};

const EMPTY: Form = {
  farmId: "", flockBatchId: "", recordDate: new Date().toISOString().split("T")[0],
  openingCount: "", closingCount: "", mortalityCount: "0", bodyWeightKg: "", notes: ""
};

type Err = Partial<Record<keyof Form, string>>;

export function DailyPoultryScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Err>({});
  const [farms, setFarms] = useState<SelectOption[]>([]);
  const [batches, setBatches] = useState<SelectOption[]>([]);

  useEffect(() => {
    fetchFarms().then((r) => {
      const all = (r.data as any[]) ?? [];
      const assigned = user?.hasGlobalAccess ? all : all.filter((f) => user?.farmIds?.includes(f.id));
      setFarms(assigned.map((f) => ({ label: f.name, value: f.id })));
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!form.farmId) { setBatches([]); return; }
    fetchFlockBatches(form.farmId).then((r) => {
      setBatches(((r.data as any[]) ?? []).map((b) => ({ label: b.batchCode, value: b.id })));
    }).catch(() => {});
  }, [form.farmId]);

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate() {
    const e: Err = {};
    if (!form.farmId) e.farmId = "Select a farm";
    if (!form.flockBatchId) e.flockBatchId = "Select a flock batch";
    if (!form.recordDate) e.recordDate = "Date is required";
    if (!form.openingCount || isNaN(Number(form.openingCount))) e.openingCount = "Enter opening count";
    if (!form.closingCount || isNaN(Number(form.closingCount))) e.closingCount = "Enter closing count";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_daily",
    endpoint: "/poultry/daily-records",
    onSuccess: () => {
      Alert.alert("Saved", "Daily record saved successfully.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    }
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      farmId: form.farmId,
      flockBatchId: form.flockBatchId,
      recordDate: form.recordDate,
      openingCount: Number(form.openingCount),
      closingCount: Number(form.closingCount),
      mortalityCount: Number(form.mortalityCount),
      bodyWeightKg: form.bodyWeightKg ? Number(form.bodyWeightKg) : undefined,
      notes: form.notes || undefined
    });
  }

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Daily Poultry Record</Text>
      <Text style={styles.sub}>Record daily population and performance</Text>

      <SelectField label="Farm" value={form.farmId} options={farms} onChange={set("farmId")} error={errors.farmId} required placeholder="Select farm…" />
      <SelectField label="Flock Batch" value={form.flockBatchId} options={batches} onChange={set("flockBatchId")} error={errors.flockBatchId} required placeholder={form.farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Record Date" required value={form.recordDate} onChangeText={set("recordDate")} error={errors.recordDate} placeholder="YYYY-MM-DD" keyboardType="numeric" />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Opening Count" required value={form.openingCount} onChangeText={set("openingCount")} error={errors.openingCount} keyboardType="numeric" placeholder="e.g. 5000" />
        </View>
        <View style={styles.half}>
          <FormField label="Closing Count" required value={form.closingCount} onChangeText={set("closingCount")} error={errors.closingCount} keyboardType="numeric" placeholder="e.g. 4998" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Mortality" value={form.mortalityCount} onChangeText={set("mortalityCount")} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.half}>
          <FormField label="Avg Body Weight (kg)" value={form.bodyWeightKg} onChangeText={set("bodyWeightKg")} keyboardType="decimal-pad" placeholder="e.g. 1.8" />
        </View>
      </View>

      <FormField label="Notes" value={form.notes} onChangeText={set("notes")} placeholder="Optional notes…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} />

      <Button label="Save Record" loading={loading} onPress={handleSubmit} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 }
});
