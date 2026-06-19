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

const FEED_TYPES: SelectOption[] = [
  { label: "Starter", value: "STARTER" },
  { label: "Grower", value: "GROWER" },
  { label: "Finisher", value: "FINISHER" },
  { label: "Layer", value: "LAYER" },
  { label: "Breeder", value: "BREEDER" },
  { label: "Broiler", value: "BROILER" }
];

export function FeedConsumptionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [feedType, setFeedType] = useState("");
  const [quantityKg, setQuantityKg] = useState("");
  const [notes, setNotes] = useState("");
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
    if (!farmId) return;
    fetchFlockBatches(farmId).then((r) => {
      setBatches(((r.data as any[]) ?? []).map((b) => ({ label: b.batchCode, value: b.id })));
    }).catch(() => {});
  }, [farmId]);

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select farm";
    if (!batchId) e.batchId = "Select batch";
    if (!date) e.date = "Date required";
    if (!feedType) e.feedType = "Select feed type";
    if (!quantityKg || isNaN(Number(quantityKg)) || Number(quantityKg) <= 0) e.quantityKg = "Enter quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_feed",
    endpoint: "/poultry/feed-consumption-records",
    onSuccess: () => Alert.alert("Saved", "Feed consumption recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Feed Consumption</Text>
      <Text style={styles.sub}>Record feed given to flock</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatches([]); setBatchId(""); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />

      <View style={styles.row}>
        <View style={styles.half}>
          <SelectField label="Feed Type" value={feedType} options={FEED_TYPES} onChange={(v) => { setFeedType(v); setErrors((e) => ({ ...e, feedType: "" })); }} error={errors.feedType} required />
        </View>
        <View style={styles.half}>
          <FormField label="Quantity (kg)" required value={quantityKg} onChangeText={(v) => { setQuantityKg(v); setErrors((e) => ({ ...e, quantityKg: "" })); }} error={errors.quantityKg} keyboardType="decimal-pad" placeholder="e.g. 250" />
        </View>
      </View>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Button label="Save Feed Record" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({ farmId, flockBatchId: batchId, consumptionDate: date, feedType, quantityKg: Number(quantityKg), notes: notes || undefined });
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
