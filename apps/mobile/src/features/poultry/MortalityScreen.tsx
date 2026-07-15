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
import { fetchFlockBatches, fetchFarms } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const CULLING_OPTIONS: SelectOption[] = [
  { label: "Natural death", value: "false" },
  { label: "Culling (deliberate)", value: "true" }
];

export function MortalityScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [birdCount, setBirdCount] = useState("");
  const [isCulling, setIsCulling] = useState("false");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawFarms, loading: farmsLoading } = useLookup("farms", async () => {
    const r = await fetchFarms();
    return (r.data as any[]) ?? [];
  });
  const farms: SelectOption[] = useMemo(() => {
    const all = rawFarms ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
    return assigned.map((f: any) => ({ label: f.name, value: f.id }));
  }, [rawFarms, user]);

  const { data: rawBatches } = useLookup(
    `flockBatches:${farmId}`,
    async () => { const r = await fetchFlockBatches(farmId); return (r.data as any[]) ?? []; },
    !farmId
  );
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select a farm";
    if (!batchId) e.batchId = "Select a flock batch";
    if (!date) e.date = "Date is required";
    if (!birdCount || isNaN(Number(birdCount)) || Number(birdCount) <= 0) e.birdCount = "Enter bird count";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_mortality",
    endpoint: "/poultry/mortality-records",
    onSuccess: () => Alert.alert("Saved", "Mortality recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: batchId,
      recordDate: date,
      birdCount: Number(birdCount),
      isCulling: isCulling === "true",
      reason: reason || undefined
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Record Mortality" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="arrow-down-bold" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Mortality Entry</Text>
          <Text style={styles.sub}>Record bird deaths for a flock batch</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required loading={farmsLoading} />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setErrors((e) => ({ ...e, batchId: "" })); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
        <FormField label="Date" required value={date} onChangeText={(v) => { setDate(v); setErrors((e) => ({ ...e, date: "" })); }} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      </FormCard>

      <FormCard label="MORTALITY DATA">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Bird Count" required value={birdCount} onChangeText={(v) => { setBirdCount(v); setErrors((e) => ({ ...e, birdCount: "" })); }} error={errors.birdCount} keyboardType="numeric" placeholder="e.g. 3" />
          </View>
          <View style={styles.half}>
            <SelectField label="Type" value={isCulling} options={CULLING_OPTIONS} onChange={setIsCulling} required />
          </View>
        </View>

        <FormField label="Reason / Observation" value={reason} onChangeText={setReason} placeholder="Describe cause or symptoms…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} />
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
