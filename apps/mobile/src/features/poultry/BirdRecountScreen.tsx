import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { DateField } from "../../components/DateField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, fetchPoultryOptions, housesForBatch, pensForBatch } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

// A physical head-count. The system computes what it expected and stores the
// signed difference; every live-bird figure then includes it. The Excel sheets
// do this as a transfer with a "Recount" remark.
export function BirdRecountScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [penId, setPenId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [counted, setCounted] = useState("");
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
    !farmId,
  );
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches],
  );

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);
  const houses: SelectOption[] = useMemo(
    () => housesForBatch(opts?.data, batchId).map((h) => ({ label: h.code ? `${h.name} (${h.code})` : h.name, value: h.id })),
    [opts, batchId],
  );
  const pens: SelectOption[] = useMemo(
    () => pensForBatch(opts?.data, batchId, houseId || undefined).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, batchId, houseId],
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select a farm";
    if (!batchId) e.batchId = "Select a flock batch";
    if (!date) e.date = "Date is required";
    if (counted === "" || isNaN(Number(counted)) || Number(counted) < 0) e.counted = "Enter the count";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_count_adjustment",
    endpoint: "/poultry/count-adjustments",
    sendIdempotencyKeyInBody: true,
    onSuccess: (queued, response) => {
      const d = !queued ? (response as { data?: { delta?: number; expectedTotal?: number } } | undefined)?.data : undefined;
      Alert.alert(
        queued ? "Saved Offline" : "Recount recorded",
        queued
          ? "Your recount was saved on this device and will sync automatically once you're back online."
          : d && typeof d.delta === "number"
            ? `System expected ${d.expectedTotal?.toLocaleString()}, you counted ${Number(counted).toLocaleString()} — ${d.delta > 0 ? `+${d.delta}` : d.delta}.`
            : "Recount recorded.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    },
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: batchId,
      recordDate: date,
      countedTotal: Number(counted),
      reason: reason || undefined,
      poultryHouseId: penId ? undefined : (houseId || undefined),
      penId: penId || undefined,
    });
  }

  const scopeLabel = penId ? "this pen" : houseId ? "this house" : "the whole batch";

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Recount" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="counter" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Bird Recount</Text>
          <Text style={styles.sub}>Log a physical head-count for {scopeLabel}</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); setHouseId(""); setPenId(""); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required loading={farmsLoading} />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setHouseId(""); setPenId(""); setErrors((e) => ({ ...e, batchId: "" })); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
        {houses.length > 1 && <SelectField label="House" value={houseId} options={houses} onChange={(v) => { setHouseId(v); setPenId(""); }} placeholder="All houses in batch" />}
        {pens.length > 0 && <SelectField label="Pen (optional)" value={penId} options={pens} onChange={setPenId} placeholder="All pens" />}
        <DateField label="Count date" required value={date} onChangeText={(v) => { setDate(v); setErrors((e) => ({ ...e, date: "" })); }} error={errors.date} />
      </FormCard>

      <FormCard label="COUNT">
        <FormField label="Birds counted" required value={counted} onChangeText={(v) => { setCounted(v); setErrors((e) => ({ ...e, counted: "" })); }} error={errors.counted} keyboardType="numeric" placeholder="e.g. 1002" />
        <FormField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. quarterly recount" />
      </FormCard>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
