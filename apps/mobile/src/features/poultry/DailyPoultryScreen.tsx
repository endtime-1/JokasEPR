import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

type Form = {
  farmId: string;
  flockBatchId: string;
  recordDate: string;
  openingBirdCount: string;
  mortalityCount: string;
  culledCount: string;
  feedConsumedKg: string;
  totalEggs: string;
  notes: string;
};

const EMPTY: Form = {
  farmId: "", flockBatchId: "", recordDate: new Date().toISOString().split("T")[0],
  openingBirdCount: "", mortalityCount: "0", culledCount: "0", feedConsumedKg: "0", totalEggs: "0", notes: ""
};

type Err = Partial<Record<keyof Form, string>>;

export function DailyPoultryScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Err>({});

  const { data: rawFarms } = useLookup("farms", async () => { const r = await fetchFarms(); return (r.data as any[]) ?? []; });
  const farms: SelectOption[] = useMemo(() => {
    const all = rawFarms ?? [];
    const assigned = user?.hasGlobalAccess ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
    return assigned.map((f: any) => ({ label: f.name, value: f.id }));
  }, [rawFarms, user]);

  const { data: rawBatches } = useLookup(
    `flockBatches:${form.farmId}`,
    async () => { const r = await fetchFlockBatches(form.farmId); return (r.data as any[]) ?? []; },
    !form.farmId
  );
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches]
  );

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate() {
    const e: Err = {};
    if (!form.farmId) e.farmId = "Select a farm";
    if (!form.flockBatchId) e.flockBatchId = "Select a flock batch";
    if (!form.recordDate) e.recordDate = "Date is required";
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
      flockBatchId: form.flockBatchId,
      recordDate: form.recordDate,
      openingBirdCount: form.openingBirdCount ? Number(form.openingBirdCount) : undefined,
      mortalityCount: Number(form.mortalityCount) || 0,
      culledCount: Number(form.culledCount) || 0,
      feedConsumedKg: Number(form.feedConsumedKg) || 0,
      totalEggs: Number(form.totalEggs) || 0,
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
          <FormField label="Opening Count" value={form.openingBirdCount} onChangeText={set("openingBirdCount")} error={errors.openingBirdCount} keyboardType="numeric" placeholder="e.g. 5000" />
        </View>
        <View style={styles.half}>
          <FormField label="Mortality" value={form.mortalityCount} onChangeText={set("mortalityCount")} keyboardType="numeric" placeholder="0" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Culled" value={form.culledCount} onChangeText={set("culledCount")} keyboardType="numeric" placeholder="0" />
        </View>
        <View style={styles.half}>
          <FormField label="Total Eggs" value={form.totalEggs} onChangeText={set("totalEggs")} keyboardType="numeric" placeholder="0" />
        </View>
      </View>

      <FormField label="Feed Consumed (kg)" value={form.feedConsumedKg} onChangeText={set("feedConsumedKg")} keyboardType="decimal-pad" placeholder="0" />

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
