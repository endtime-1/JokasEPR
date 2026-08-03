import { useEffect, useMemo, useState } from "react";
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
import { fetchFlockBatches, fetchFarms, fetchPoultryOptions } from "../../api/endpoints";
import { apiFetch } from "../../api/client";
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
  penId: string;
};

const EMPTY: Form = {
  farmId: "", flockBatchId: "", recordDate: new Date().toISOString().split("T")[0],
  openingBirdCount: "", mortalityCount: "0", culledCount: "0", feedConsumedKg: "0", totalEggs: "0", notes: "", penId: ""
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
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
    return assigned.map((f: any) => ({ label: f.name, value: f.id }));
  }, [rawFarms, user]);

  const { data: rawBatches } = useLookup(
    `flockBatches:${form.farmId}`,
    async () => { const r = await fetchFlockBatches(form.farmId); return (r.data as any[]) ?? []; },
    !form.farmId
  );
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).filter((b: any) => !b.status || b.status === "ACTIVE").map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches]
  );

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);
  const selectedBatch = useMemo(() => (rawBatches ?? []).find((b: any) => b.id === form.flockBatchId), [rawBatches, form.flockBatchId]);
  const pens: SelectOption[] = useMemo(
    () => (opts?.data.pens ?? []).filter((p) => p.farmId === (selectedBatch as any)?.farmId).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, selectedBatch]
  );

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  useEffect(() => {
    if (!form.flockBatchId || !form.recordDate) return;
    let cancelled = false;
    apiFetch<{ data: { openingBirdCount: number; source: string } }>(
      `/poultry/daily-records/prefill?flockBatchId=${encodeURIComponent(form.flockBatchId)}&date=${encodeURIComponent(form.recordDate)}`
    ).then((res) => {
      if (cancelled) return;
      setForm((f) => ({ ...f, openingBirdCount: String(res.data.openingBirdCount) }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [form.flockBatchId, form.recordDate]);

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
      notes: form.notes || undefined,
      penId: form.penId || undefined
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Record" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="clipboard-list" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Daily Poultry Record</Text>
          <Text style={styles.sub}>Record daily population and performance</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={form.farmId} options={farms} onChange={set("farmId")} error={errors.farmId} required placeholder="Select farm…" />
        <SelectField label="Flock Batch" value={form.flockBatchId} options={batches} onChange={set("flockBatchId")} error={errors.flockBatchId} required placeholder={form.farmId ? "Select batch…" : "Select farm first"} />
        {pens.length > 0 && <SelectField label="Pen (optional)" value={form.penId} options={pens} onChange={set("penId")} placeholder="All pens" />}
        <FormField label="Record Date" required value={form.recordDate} onChangeText={set("recordDate")} error={errors.recordDate} placeholder="YYYY-MM-DD" keyboardType="numeric" />
      </FormCard>

      <FormCard label="RECORD DATA">
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
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={form.notes} onChangeText={set("notes")} placeholder="Optional notes…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} />
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
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
